import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { describe, it } from "node:test";

function tempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

async function runCommand(
  command: string,
  args: string[],
  cwd: string
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
      shell: false
    });
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    child.stdout.on("data", (chunk) => {
      stdoutChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    child.stderr.on("data", (chunk) => {
      stderrChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    child.on("error", (error) => reject(error));
    child.on("close", (code) => {
      resolve({
        code: code ?? 1,
        stdout: Buffer.concat(stdoutChunks).toString("utf8"),
        stderr: Buffer.concat(stderrChunks).toString("utf8")
      });
    });
  });
}

function repoRoot(): string {
  return path.resolve(".");
}

async function runCli(args: string[], cwd = repoRoot()): Promise<{ code: number; stdout: string; stderr: string }> {
  const tsxCli = path.join(repoRoot(), "apps", "openassist-cli", "src", "index.ts");
  const tsxEntrypoint = path.join(repoRoot(), "node_modules", "tsx", "dist", "cli.mjs");
  return runCommand(process.execPath, [tsxEntrypoint, tsxCli, ...args], cwd);
}

describe("cli command branch coverage", () => {
  it("covers setup show failure and setup env non-tty guard", async () => {
    const root = tempDir("openassist-cli-setup-branches-");
    const missingConfig = path.join(root, "missing.toml");

    const wizardHelp = await runCli(["setup", "wizard", "--help"]);
    assert.equal(wizardHelp.code, 0, wizardHelp.stderr || wizardHelp.stdout);
    assert.match(wizardHelp.stdout, /--skip-post-checks/);
    assert.match(wizardHelp.stdout, /--install-dir/);
    assert.match(wizardHelp.stdout, /--base-url/);

    const show = await runCli(["setup", "show", "--config", missingConfig]);
    assert.equal(show.code, 1, show.stderr || show.stdout);
    assert.match(show.stderr, /Setup show failed/);

    const envEditor = await runCli(["setup", "env"]);
    assert.equal(envEditor.code, 1, envEditor.stderr || envEditor.stdout);
    assert.match(envEditor.stderr, /Interactive env editor requires TTY/);
  });

  it("covers service health success/failure and dry-run install branch", async () => {
    const serviceHelp = await runCli(["service", "--help"]);
    assert.equal(serviceHelp.code, 0, serviceHelp.stderr || serviceHelp.stdout);
    assert.match(serviceHelp.stdout, /\breload\b/);
    assert.match(serviceHelp.stdout, /\bconsole\b/);
    const serviceConsole = await runCli(["service", "console"]);
    assert.equal(serviceConsole.code, 1, serviceConsole.stderr || serviceConsole.stdout);
    assert.match(serviceConsole.stderr, /Interactive service console requires TTY/);

    const server = http.createServer((req, res) => {
      if (req.url === "/v1/health") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ status: "ok" }));
        return;
      }
      res.writeHead(404);
      res.end();
    });

    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => resolve());
    });
    const address = server.address();
    assert.notEqual(address, null);
    assert.equal(typeof address, "object");
    const baseUrl = `http://127.0.0.1:${(address as { port: number }).port}`;

    const healthy = await runCli(["service", "health", "--base-url", baseUrl]);
    assert.equal(healthy.code, 0, healthy.stderr || healthy.stdout);
    assert.match(healthy.stdout, /openassist health: ok/);

    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });

    const unhealthy = await runCli(["service", "health", "--base-url", "http://127.0.0.1:1"]);
    assert.equal(unhealthy.code, 1, unhealthy.stderr || unhealthy.stdout);
    assert.match(unhealthy.stderr, /(openassist health failed|Health check failed)/);

    const root = tempDir("openassist-cli-service-dryrun-");
    const installDir = path.join(root, "openassist");
    const configPath = path.join(installDir, "openassist.toml");
    fs.mkdirSync(installDir, { recursive: true });

    const dryRunInstall = await runCli([
      "service",
      "install",
      "--dry-run",
      "--install-dir",
      installDir,
      "--config",
      configPath
    ]);

    if (process.platform === "linux" || process.platform === "darwin") {
      assert.equal(dryRunInstall.code, 0, dryRunInstall.stderr || dryRunInstall.stdout);
      assert.match(dryRunInstall.stdout, /Service install dry-run complete/);
    } else {
      assert.equal(dryRunInstall.code, 1, dryRunInstall.stderr || dryRunInstall.stdout);
      assert.match(dryRunInstall.stderr, /Service install failed/);
    }
  });

  it("covers auth status output with redacted readiness signals", async () => {
    const root = tempDir("openassist-cli-auth-status-");
    const configPath = path.join(root, "openassist.toml");
    const envPath = path.join(root, "openassistd.env");

    const init = await runCli(["init", "--config", configPath], root);
    assert.equal(init.code, 0, init.stderr || init.stdout);

    fs.writeFileSync(
      envPath,
      "OPENASSIST_PROVIDER_OPENAI_MAIN_API_KEY=sk-test-long-key-value\n",
      "utf8"
    );

    const server = http.createServer((req, res) => {
      if (req.url === "/v1/oauth/status") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(
          JSON.stringify({
            accounts: [],
            providers: [
              {
                providerId: "openai-main",
                providerType: "openai",
                linkedAccountCount: 0,
                currentAuth: {
                  kind: "api-key",
                  chatReady: true,
                  detail: "API key auth is loaded for this provider."
                }
              }
            ]
          })
        );
        return;
      }
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "not found" }));
    });

    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => resolve());
    });
    const address = server.address();
    assert.notEqual(address, null);
    assert.equal(typeof address, "object");
    const baseUrl = `http://127.0.0.1:${(address as { port: number }).port}`;

    const result = await runCli(
      [
        "auth",
        "status",
        "--base-url",
        baseUrl,
        "--config",
        configPath,
        "--env-file",
        envPath
      ],
      root
    );

    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });

    assert.equal(result.code, 0, result.stderr || result.stdout);
    assert.match(result.stdout, /Provider auth status/);
    assert.match(result.stdout, /Provider: openai-main/);
    assert.match(result.stdout, /Route: OpenAI \(API Key\)/);
    assert.match(result.stdout, /Active auth: API key/);
    assert.match(result.stdout, /Chat-ready auth: Yes/);
    assert.equal(result.stdout.includes("sk-test-long-key-value"), false);
  });

  it("covers Azure Foundry Entra auth status output", async () => {
    const root = tempDir("openassist-cli-auth-status-azure-");
    const configPath = path.join(root, "openassist.toml");
    const envPath = path.join(root, "openassistd.env");

    const init = await runCli(["init", "--config", configPath], root);
    assert.equal(init.code, 0, init.stderr || init.stdout);
    fs.writeFileSync(envPath, "", "utf8");

    fs.writeFileSync(
      configPath,
      [
        "[runtime]",
        'bindAddress = "127.0.0.1"',
        "bindPort = 3344",
        'defaultProviderId = "azure-foundry-main"',
        'defaultPolicyProfile = "operator"',
        'operatorAccessProfile = "operator"',
        "",
        "[runtime.paths]",
        'dataDir = ".openassist/data"',
        'skillsDir = ".openassist/skills"',
        'logsDir = ".openassist/logs"',
        "",
        "[runtime.attachments]",
        "maxFilesPerMessage = 4",
        "maxImageBytes = 10000000",
        "maxDocumentBytes = 1000000",
        "maxExtractedChars = 12000",
        "",
        "[runtime.assistant]",
        'name = "OpenAssist"',
        'persona = "Pragmatic and concise"',
        'operatorPreferences = ""',
        "promptOnFirstContact = false",
        "",
        "[runtime.memory]",
        "enabled = true",
        "",
        "[runtime.time]",
        'ntpPolicy = "off"',
        "ntpCheckIntervalSec = 300",
        "ntpMaxSkewMs = 10000",
        "ntpHttpSources = []",
        "requireTimezoneConfirmation = false",
        "",
        "[runtime.scheduler]",
        "enabled = false",
        "tickIntervalMs = 1000",
        "heartbeatIntervalSec = 30",
        'defaultMisfirePolicy = "catch-up-once"',
        "tasks = []",
        "",
        "[[runtime.providers]]",
        'id = "azure-foundry-main"',
        'type = "azure-foundry"',
        'defaultModel = "gpt-5-deployment"',
        'authMode = "entra"',
        'resourceName = "demo-resource"',
        'endpointFlavor = "openai-resource"',
        'underlyingModel = "gpt-5.4"',
        "",
        "[tools.fs]",
        "workspaceOnly = true",
        "allowedReadPaths = []",
        "allowedWritePaths = []",
        "",
        "[tools.exec]",
        "defaultTimeoutMs = 60000",
        "",
        "[tools.exec.guardrails]",
        'mode = "minimal"',
        "extraBlockedPatterns = []",
        "",
        "[tools.pkg]",
        "enabled = true",
        "preferStructuredInstall = true",
        "allowExecFallback = true",
        "sudoNonInteractive = true",
        "allowedManagers = []",
        "",
        "[tools.web]",
        "enabled = true",
        'searchMode = "hybrid"',
        "requestTimeoutMs = 15000",
        "maxRedirects = 5",
        "maxFetchBytes = 1000000",
        "maxSearchResults = 8",
        "maxPagesPerRun = 4",
        "",
        "[security]",
        "auditLogEnabled = true",
        'secretsBackend = "encrypted-file"',
        ""
      ].join("\n"),
      "utf8"
    );

    const server = http.createServer((req, res) => {
      if (req.url === "/v1/oauth/status") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(
          JSON.stringify({
            accounts: [],
            providers: [
              {
                providerId: "azure-foundry-main",
                providerType: "azure-foundry",
                linkedAccountCount: 0,
                currentAuth: {
                  kind: "entra",
                  chatReady: true,
                  detail: "Entra host credential auth is configured for this provider."
                }
              }
            ]
          })
        );
        return;
      }
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "not found" }));
    });

    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => resolve());
    });
    const address = server.address();
    assert.notEqual(address, null);
    assert.equal(typeof address, "object");
    const baseUrl = `http://127.0.0.1:${(address as { port: number }).port}`;

    const result = await runCli(
      [
        "auth",
        "status",
        "--base-url",
        baseUrl,
        "--config",
        configPath,
        "--env-file",
        envPath
      ],
      root
    );

    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });

    assert.equal(result.code, 0, result.stderr || result.stdout);
    assert.match(result.stdout, /Provider: azure-foundry-main/);
    assert.match(result.stdout, /Route: Azure Foundry/);
    assert.match(result.stdout, /Active auth: Entra ID/);
    assert.match(result.stdout, /Chat-ready auth: Yes/);
  });

  it("covers upgrade dry-run dirty-worktree and invalid-install-dir failures", async () => {
    const gitRepo = tempDir("openassist-cli-upgrade-dirty-");

    let result = await runCommand("git", ["init"], gitRepo);
    assert.equal(result.code, 0, result.stderr || result.stdout);
    result = await runCommand("git", ["config", "user.email", "openassist-tests@example.com"], gitRepo);
    assert.equal(result.code, 0, result.stderr || result.stdout);
    result = await runCommand("git", ["config", "user.name", "OpenAssist Tests"], gitRepo);
    assert.equal(result.code, 0, result.stderr || result.stdout);

    fs.writeFileSync(path.join(gitRepo, "README.md"), "seed\n", "utf8");
    result = await runCommand("git", ["add", "README.md"], gitRepo);
    assert.equal(result.code, 0, result.stderr || result.stdout);
    result = await runCommand("git", ["commit", "-m", "init"], gitRepo);
    assert.equal(result.code, 0, result.stderr || result.stdout);

    fs.writeFileSync(path.join(gitRepo, "README.md"), "dirty\n", "utf8");
    fs.mkdirSync(path.join(gitRepo, "apps", "openassistd", "dist"), { recursive: true });
    fs.writeFileSync(path.join(gitRepo, "apps", "openassistd", "dist", "index.js"), "// built for dry-run\n", "utf8");

    const dirty = await runCli(["upgrade", "--dry-run", "--install-dir", gitRepo]);
    assert.equal(dirty.code, 1, dirty.stderr || dirty.stdout);
    assert.match(dirty.stdout, /Update readiness/);
    assert.match(dirty.stdout, /Local code changes/i);
    assert.match(dirty.stdout, /Commit or stash the local changes, then rerun: openassist upgrade --dry-run/i);

    const missing = await runCli([
      "upgrade",
      "--dry-run",
      "--install-dir",
      path.join(gitRepo, "does-not-exist")
    ]);
    assert.equal(missing.code, 1, missing.stderr || missing.stdout);
    assert.match(missing.stdout, /Update readiness/);
    assert.match(missing.stdout, /Repo-backed install/i);
    assert.match(missing.stdout, /rerun bootstrap instead/i);
    assert.match(missing.stdout, /scripts\/install\/bootstrap\.sh --install-dir/i);
  });
});
