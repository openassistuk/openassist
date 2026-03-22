import assert from "node:assert/strict";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { afterEach, describe, it } from "node:test";
import { resolveOperatorPaths } from "../../packages/config/src/operator-paths.js";
import { createDefaultConfigObject, saveConfigObject } from "../../apps/openassist-cli/src/lib/config-edit.js";
import { saveInstallState } from "../../apps/openassist-cli/src/lib/install-state.js";
import { runSetupHub } from "../../apps/openassist-cli/src/lib/setup-hub.js";
import type { PromptAdapter } from "../../apps/openassist-cli/src/lib/setup-wizard.js";

async function runCommand(
  command: string,
  args: string[],
  cwd: string
): Promise<{ code: number; stdout: string; stderr: string }> {
  return await new Promise((resolve, reject) => {
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
    child.on("error", reject);
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

function tempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

async function getFreePort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() => reject(new Error("failed to resolve test port")));
        return;
      }
      const port = address.port;
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(port);
      });
    });
  });
}

async function runCli(args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  const tsxCli = path.join(repoRoot(), "apps", "openassist-cli", "src", "index.ts");
  const tsxEntrypoint = path.join(repoRoot(), "node_modules", "tsx", "dist", "cli.mjs");
  return await runCommand(process.execPath, [tsxEntrypoint, "--", tsxCli, ...args], repoRoot());
}

class ScriptedPromptAdapter implements PromptAdapter {
  private readonly queue: string[];

  constructor(answers: string[]) {
    this.queue = [...answers];
  }

  private next(): string {
    if (this.queue.length === 0) {
      throw new Error("No scripted answer available");
    }
    return this.queue.shift() ?? "";
  }

  async input(): Promise<string> {
    return this.next();
  }

  async password(): Promise<string> {
    return this.next();
  }

  async confirm(): Promise<boolean> {
    return this.next() === "true";
  }

  async select<T extends string>(): Promise<T> {
    return this.next() as T;
  }
}

function minimalTelegramAnswers(bindPort: number): string[] {
  return [
    "false",
    "127.0.0.1",
    String(bindPort),
    "OpenAssist",
    "Pragmatic and concise",
    "Keep answers practical",
    "openai",
    "openai-main",
    "gpt-5.4",
    "",
    "default",
    "openai-key",
    "telegram",
    "telegram-main",
    "telegram-token",
    "123,456",
    "Europe",
    "Europe/London",
    "true",
    "save"
  ];
}

function writeLegacyDefaultLayout(installDir: string): void {
  const config = createDefaultConfigObject();
  config.runtime.paths.dataDir = ".openassist/data";
  config.runtime.paths.logsDir = ".openassist/logs";
  config.runtime.paths.skillsDir = ".openassist/skills";
  saveConfigObject(path.join(installDir, "openassist.toml"), config);
  fs.mkdirSync(path.join(installDir, "config.d"), { recursive: true });
  fs.writeFileSync(path.join(installDir, "config.d", "extra.toml"), "[runtime]\n", "utf8");
  const dbPath = path.join(installDir, ".openassist", "data", "openassist.db");
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  fs.writeFileSync(dbPath, "", "utf8");
  if (process.platform !== "win32") {
    fs.chmodSync(dbPath, 0o600);
  }
}

const stdinDescriptor = Object.getOwnPropertyDescriptor(process.stdin, "isTTY");
const stdoutDescriptor = Object.getOwnPropertyDescriptor(process.stdout, "isTTY");
const originalConsoleLog = console.log;
const originalConsoleError = console.error;

afterEach(() => {
  process.exitCode = undefined;
  if (stdinDescriptor) {
    Object.defineProperty(process.stdin, "isTTY", stdinDescriptor);
  } else {
    Reflect.deleteProperty(process.stdin, "isTTY");
  }
  if (stdoutDescriptor) {
    Object.defineProperty(process.stdout, "isTTY", stdoutDescriptor);
  } else {
    Reflect.deleteProperty(process.stdout, "isTTY");
  }
  console.log = originalConsoleLog;
  console.error = originalConsoleError;
});

describe("setup hub coverage", () => {
  it("prints scriptable guidance when bare setup is used without a TTY", async () => {
    const result = await runCli(["setup"]);

    assert.equal(result.code, 1, result.stderr || result.stdout);
    assert.match(result.stderr, /Interactive lifecycle hub requires TTY/);
    assert.match(result.stderr, /openassist setup quickstart/);
    assert.match(result.stderr, /openassist setup wizard/);
  });

  it("keeps explicit install, config, and env paths in non-TTY setup guidance", async () => {
    const installDir = path.join(tempDir("openassist-setup-install-"), "operator install");
    const configPath = path.join(tempDir("openassist-setup-config-"), "config", "openassist.toml");
    const envFilePath = path.join(tempDir("openassist-setup-env-"), "config", "openassistd.env");
    const result = await runCli([
      "setup",
      "--install-dir",
      installDir,
      "--config",
      configPath,
      "--env-file",
      envFilePath
    ]);

    assert.equal(result.code, 1, result.stderr || result.stdout);
    assert.match(result.stderr, new RegExp(`--install-dir "${installDir.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`));
    assert.match(result.stderr, new RegExp(`--config "${configPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`));
    assert.match(result.stderr, new RegExp(`--env-file "${envFilePath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`));
  });

  it("routes first-time setup through the interactive hub", async () => {
    const root = tempDir("openassist-setup-hub-first-time-");
    const configPath = path.join(root, "openassist.toml");
    const envFilePath = path.join(root, "openassistd.env");
    const bindPort = await getFreePort();
    const logs: string[] = [];

    Object.defineProperty(process.stdin, "isTTY", { configurable: true, value: true });
    Object.defineProperty(process.stdout, "isTTY", { configurable: true, value: true });
    console.log = (...args: unknown[]) => {
      logs.push(args.join(" "));
    };

    await runSetupHub(
      {
        installDir: root,
        configPath,
        envFilePath,
        skipService: true
      },
      new ScriptedPromptAdapter(["1", ...minimalTelegramAnswers(bindPort)])
    );

    assert.equal(fs.existsSync(configPath), true);
    assert.equal(fs.existsSync(envFilePath), true);
    assert.match(logs.join("\n"), /Quickstart saved/);
  });

  it("accepts the human menu label as a setup hub action", async () => {
    const root = tempDir("openassist-setup-hub-label-");
    const configPath = path.join(root, "openassist.toml");
    const envFilePath = path.join(root, "openassistd.env");
    const bindPort = await getFreePort();
    const logs: string[] = [];

    Object.defineProperty(process.stdin, "isTTY", { configurable: true, value: true });
    Object.defineProperty(process.stdout, "isTTY", { configurable: true, value: true });
    console.log = (...args: unknown[]) => {
      logs.push(args.join(" "));
    };

    await runSetupHub(
      {
        installDir: root,
        configPath,
        envFilePath,
        skipService: true
      },
      new ScriptedPromptAdapter(["First-time setup", ...minimalTelegramAnswers(bindPort)])
    );

    assert.equal(fs.existsSync(configPath), true);
    assert.equal(fs.existsSync(envFilePath), true);
    assert.match(logs.join("\n"), /Quickstart saved/);
  });

  it("auto-migrates the recognized repo-local layout before quickstart continues", async () => {
    const homeDir = tempDir("openassist-setup-hub-migrate-home-");
    const installDir = tempDir("openassist-setup-hub-migrate-install-");
    const operatorPaths = resolveOperatorPaths({ homeDir, installDir });
    const bindPort = await getFreePort();
    const previousHome = process.env.HOME;
    const previousUserProfile = process.env.USERPROFILE;
    const logs: string[] = [];

    writeLegacyDefaultLayout(installDir);
    saveInstallState(
      {
        installDir,
        configPath: path.join(installDir, "openassist.toml"),
        envFilePath: operatorPaths.envFilePath,
        trackedRef: "main"
      },
      operatorPaths.installStatePath
    );

    process.env.HOME = homeDir;
    process.env.USERPROFILE = homeDir;
    Object.defineProperty(process.stdin, "isTTY", { configurable: true, value: true });
    Object.defineProperty(process.stdout, "isTTY", { configurable: true, value: true });
    console.log = (...args: unknown[]) => {
      logs.push(args.join(" "));
    };

    try {
      await runSetupHub(
        {
          installDir,
          configPath: operatorPaths.configPath,
          envFilePath: operatorPaths.envFilePath,
          skipService: true
        },
        new ScriptedPromptAdapter(["first-time", ...minimalTelegramAnswers(bindPort)])
      );
    } finally {
      if (previousHome === undefined) {
        delete process.env.HOME;
      } else {
        process.env.HOME = previousHome;
      }
      if (previousUserProfile === undefined) {
        delete process.env.USERPROFILE;
      } else {
        process.env.USERPROFILE = previousUserProfile;
      }
    }

    assert.equal(fs.existsSync(operatorPaths.configPath), true);
    assert.equal(fs.existsSync(path.join(operatorPaths.overlaysDir, "extra.toml")), true);
    assert.equal(fs.existsSync(path.join(operatorPaths.dataDir, "openassist.db")), true);
    assert.equal(fs.existsSync(path.join(installDir, ".openassist")), false);
    assert.match(logs.join("\n"), /Migrated repo-local operator state/);
    assert.match(logs.join("\n"), /Quickstart saved/);
  });
});
