import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";
import {
  loadEnvFile,
  mergeEnv,
  parseEnvFileContent,
  saveEnvFile,
  upsertEnvFile,
  writeEnvTemplateIfMissing
} from "../../apps/openassist-cli/src/lib/env-file.js";
import {
  checkHealth,
  waitForHealthy
} from "../../apps/openassist-cli/src/lib/health-check.js";
import {
  loadInstallState,
  saveInstallState
} from "../../apps/openassist-cli/src/lib/install-state.js";
import {
  defaultEnvFilePath,
  defaultInstallDir,
  defaultInstallStatePath,
  detectDefaultDaemonBaseUrl,
  detectRepoRoot,
  requestJson,
  resolveDbPath,
  resolveFromWorkspace
} from "../../apps/openassist-cli/src/lib/runtime-context.js";

function tempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function tempFile(prefix: string, fileName: string): string {
  const dir = tempDir(prefix);
  return path.join(dir, fileName);
}

describe("cli lib coverage helpers", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("covers runtime-context path and default helpers", () => {
    const configPath = resolveFromWorkspace("openassist.toml");
    const absolute = resolveFromWorkspace(path.resolve("openassist.toml"));
    const dbPath = resolveDbPath();

    assert.equal(path.isAbsolute(configPath), true);
    assert.equal(path.isAbsolute(absolute), true);
    assert.equal(dbPath.endsWith(path.join(".openassist", "data", "openassist.db")), true);
    assert.equal(defaultInstallDir().includes("openassist"), true);
    assert.equal(defaultEnvFilePath().includes(path.join(".config", "openassist")), true);
    assert.equal(defaultInstallStatePath().includes(path.join(".config", "openassist")), true);
    assert.equal(detectDefaultDaemonBaseUrl("__missing_openassist_config__.toml"), "http://127.0.0.1:3344");

    const repoRoot = detectRepoRoot();
    assert.equal(fs.existsSync(path.join(repoRoot, "pnpm-workspace.yaml")), true);
  });

  it("covers runtime-context requestJson", async () => {
    const server = http.createServer((req, res) => {
      if (req.url === "/ok") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ status: "ok" }));
        return;
      }
      res.writeHead(204);
      res.end();
    });

    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => resolve());
    });

    const address = server.address();
    assert.notEqual(address, null);
    assert.equal(typeof address, "object");
    const baseUrl = `http://127.0.0.1:${(address as { port: number }).port}`;

    const ok = await requestJson("GET", `${baseUrl}/ok`);
    assert.equal(ok.status, 200);
    assert.deepEqual(ok.data, { status: "ok" });

    const empty = await requestJson("GET", `${baseUrl}/empty`);
    assert.equal(empty.status, 204);
    assert.deepEqual(empty.data, {});

    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  });

  it("covers env file parse/save/merge/update/template flows", () => {
    const envPath = tempFile("openassist-env-coverage-", "openassistd.env");
    const templatePath = tempFile("openassist-env-template-", "template.env");

    const parsed = parseEnvFileContent(
      ["# comment", "FOO=bar", "QUOTED=\"hello world\"", "EMPTY=", "NO_EQ", ""].join("\n")
    );
    assert.deepEqual(parsed, {
      FOO: "bar",
      QUOTED: "hello world",
      EMPTY: ""
    });

    const merged = mergeEnv(
      { A: "1", B: "2" },
      { A: undefined, B: "3", C: "with spaces" }
    );
    assert.deepEqual(merged, {
      B: "3",
      C: "with spaces"
    });

    saveEnvFile(envPath, { BRAVO: "two words", ALPHA: "one" });
    const loaded = loadEnvFile(envPath);
    assert.deepEqual(loaded, { ALPHA: "one", BRAVO: "two words" });

    const updated = upsertEnvFile(
      envPath,
      { BRAVO: undefined, CHARLIE: "3", DELTA: "quoted # value" }
    );
    assert.deepEqual(updated, { ALPHA: "one", CHARLIE: "3", DELTA: "quoted # value" });

    writeEnvTemplateIfMissing(templatePath);
    const template = fs.readFileSync(templatePath, "utf8");
    assert.equal(template.includes("OPENASSIST_PROVIDER_OPENAI_MAIN_API_KEY"), true);
    writeEnvTemplateIfMissing(templatePath);
    assert.equal(fs.existsSync(templatePath), true);
  });

  it("covers install-state save/load/malformed handling", () => {
    const root = tempDir("openassist-install-state-coverage-");
    const installDir = path.join(root, "openassist");
    const statePath = path.join(root, "install-state.json");

    const saved = saveInstallState(
      {
        installDir,
        trackedRef: "main",
        repoUrl: "https://github.com/openassistuk/openassist.git"
      },
      statePath
    );
    const loaded = loadInstallState(statePath);
    assert.deepEqual(loaded, saved);

    fs.writeFileSync(statePath, "{not-json", "utf8");
    assert.equal(loadInstallState(statePath), undefined);
  });

  it("covers health-check success and retry/failure paths", async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls += 1;
      if (calls === 1) {
        return new Response("{\"status\":\"starting\"}", { status: 503 });
      }
      return new Response("{\"status\":\"ok\"}", { status: 200 });
    }) as typeof fetch;

    const first = await checkHealth("http://127.0.0.1:3344/");
    assert.equal(first.ok, false);
    assert.equal(first.status, 503);

    const retry = await waitForHealthy("http://127.0.0.1:3344", 1_000, 10);
    assert.equal(retry.ok, true);
    assert.equal(retry.status, 200);

    globalThis.fetch = (async () => {
      throw new Error("connection refused");
    }) as typeof fetch;

    const failed = await waitForHealthy("http://127.0.0.1:3344", 350, 10);
    assert.equal(failed.ok, false);
    assert.equal(failed.bodyText.includes("connection refused"), true);
  });
});
