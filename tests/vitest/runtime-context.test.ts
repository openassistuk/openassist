import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { defaultDataDir } from "../../packages/config/src/operator-paths.js";
import {
  defaultEnvFilePath,
  defaultInstallDir,
  defaultInstallStatePath,
  detectDefaultDaemonBaseUrl,
  detectRepoRoot,
  requestJson,
  resolveDbPath,
  resolveFromWorkspace,
  workspaceCwd
} from "../../apps/openassist-cli/src/lib/runtime-context.js";

function tempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

describe("runtime-context", () => {
  it("resolves workspace-relative paths and db defaults", () => {
    const configPath = resolveFromWorkspace("openassist.toml");
    const dbPath = resolveDbPath();

    expect(path.isAbsolute(configPath)).toBe(true);
    expect(dbPath).toBe(path.join(defaultDataDir(), "openassist.db"));
  });

  it("returns fallback daemon base url when config cannot be loaded", () => {
    const root = tempDir("openassist-runtime-context-");
    const missing = path.join(root, "missing.toml");

    const baseUrl = detectDefaultDaemonBaseUrl(missing);
    expect(baseUrl).toBe("http://127.0.0.1:3344");
  });

  it("posts and parses json responses", async () => {
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
    if (!address || typeof address === "string") {
      throw new Error("failed to resolve test server address");
    }
    const baseUrl = `http://127.0.0.1:${address.port}`;

    const ok = await requestJson("GET", `${baseUrl}/ok`);
    expect(ok.status).toBe(200);
    expect(ok.data).toEqual({ status: "ok" });

    const empty = await requestJson("GET", `${baseUrl}/empty`);
    expect(empty.status).toBe(204);
    expect(empty.data).toEqual({});

    server.close();
  });

  it("detects repository root and platform defaults", () => {
    const repoRoot = detectRepoRoot();
    expect(fs.existsSync(path.join(repoRoot, "pnpm-workspace.yaml"))).toBe(true);
    expect(defaultInstallDir().includes("openassist")).toBe(true);
    expect(defaultEnvFilePath().includes(path.join(".config", "openassist"))).toBe(true);
    expect(defaultInstallStatePath().includes(path.join(".config", "openassist"))).toBe(true);
  });

  it("falls back to workspace cwd when repo markers are unavailable", () => {
    const existsSpy = vi.spyOn(fs, "existsSync").mockReturnValue(false);
    const root = detectRepoRoot();
    expect(root).toBe(workspaceCwd);
    existsSpy.mockRestore();
  });
});
