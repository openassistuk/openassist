import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";
import {
  registerServiceCommands,
  type ServiceCommandDeps,
  type ServiceManagerLike
} from "../../apps/openassist-cli/src/commands/service.js";
import type { ServiceManagerKind } from "../../apps/openassist-cli/src/lib/install-state.js";

const cliRequire = createRequire(new URL("../../apps/openassist-cli/package.json", import.meta.url));
const { Command } = cliRequire("commander") as typeof import("commander");

function tempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function renderConsoleArgs(args: unknown[]): string {
  return args
    .map((value) => {
      if (typeof value === "string") {
        return value;
      }
      if (value instanceof Error) {
        return value.message;
      }
      return String(value);
    })
    .join(" ");
}

class StubServiceManager implements ServiceManagerLike {
  readonly calls: Array<{ method: string; args: unknown[] }> = [];

  constructor(
    readonly kind: ServiceManagerKind,
    private readonly failures: Partial<Record<string, string>> = {}
  ) {}

  private maybeFail(method: string): void {
    const message = this.failures[method];
    if (message) {
      throw new Error(message);
    }
  }

  async install(options: {
    installDir: string;
    configPath: string;
    envFilePath: string;
    repoRoot: string;
    dryRun?: boolean;
    systemdFilesystemAccess?: string;
  }): Promise<void> {
    this.calls.push({ method: "install", args: [options] });
    this.maybeFail("install");
  }

  async uninstall(): Promise<void> {
    this.calls.push({ method: "uninstall", args: [] });
    this.maybeFail("uninstall");
  }

  async start(): Promise<void> {
    this.calls.push({ method: "start", args: [] });
    this.maybeFail("start");
  }

  async stop(): Promise<void> {
    this.calls.push({ method: "stop", args: [] });
    this.maybeFail("stop");
  }

  async restart(): Promise<void> {
    this.calls.push({ method: "restart", args: [] });
    this.maybeFail("restart");
  }

  async status(): Promise<void> {
    this.calls.push({ method: "status", args: [] });
    this.maybeFail("status");
  }

  async logs(lines: number, follow: boolean): Promise<void> {
    this.calls.push({ method: "logs", args: [lines, follow] });
    this.maybeFail("logs");
  }

  async enable(): Promise<void> {
    this.calls.push({ method: "enable", args: [] });
    this.maybeFail("enable");
  }

  async disable(): Promise<void> {
    this.calls.push({ method: "disable", args: [] });
    this.maybeFail("disable");
  }

  async isInstalled(): Promise<boolean> {
    this.calls.push({ method: "isInstalled", args: [] });
    this.maybeFail("isInstalled");
    return true;
  }
}

function createDeps(
  overrides: Partial<ServiceCommandDeps> = {}
): ServiceCommandDeps {
  return {
    createRunner: () => ({}),
    createServiceManager: () => new StubServiceManager("systemd-user"),
    checkHealth: async () => ({ ok: true, status: 200, bodyText: "ok" }),
    loadConfig: () => ({ config: { service: { systemdFilesystemAccess: "hardened" } } }),
    resolveConfigOverlaysDir: () => path.join("config", "d"),
    defaultInstallDir: () => path.join("C:", "openassist"),
    defaultConfigPath: () => path.join("C:", "openassist", "openassist.toml"),
    defaultEnvFilePath: () => path.join("C:", "openassist", "openassistd.env"),
    detectDefaultDaemonBaseUrl: () => "http://127.0.0.1:3344/",
    loadInstallState: () => undefined,
    saveInstallState: () => undefined,
    detectInstallStateFromRepo: () => ({}),
    detectLegacyDefaultLayout: (installDir) => ({
      status: "none",
      legacy: {
        configPath: path.join(installDir, "openassist.toml")
      }
    }),
    writeEnvTemplateIfMissing: () => undefined,
    existsSync: () => false,
    promptInput: async () => "200",
    promptSelect: async () => "exit",
    ...overrides
  };
}

const originalStdinTtyDescriptor = Object.getOwnPropertyDescriptor(process.stdin, "isTTY");
const originalStdoutTtyDescriptor = Object.getOwnPropertyDescriptor(process.stdout, "isTTY");

function restoreTtyDescriptors(): void {
  if (originalStdinTtyDescriptor) {
    Object.defineProperty(process.stdin, "isTTY", originalStdinTtyDescriptor);
  } else {
    Reflect.deleteProperty(process.stdin, "isTTY");
  }
  if (originalStdoutTtyDescriptor) {
    Object.defineProperty(process.stdout, "isTTY", originalStdoutTtyDescriptor);
  } else {
    Reflect.deleteProperty(process.stdout, "isTTY");
  }
}

async function runRegisteredCommand(
  args: string[],
  deps: ServiceCommandDeps,
  options: {
    tty?: boolean;
  } = {}
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const program = new Command();
  program.name("openassist");
  registerServiceCommands(program, deps);

  const stdout: string[] = [];
  const stderr: string[] = [];
  const originalLog = console.log;
  const originalError = console.error;
  const originalExitCode = process.exitCode;
  console.log = (...consoleArgs: unknown[]) => {
    stdout.push(renderConsoleArgs(consoleArgs));
  };
  console.error = (...consoleArgs: unknown[]) => {
    stderr.push(renderConsoleArgs(consoleArgs));
  };
  process.exitCode = 0;

  if (options.tty !== undefined) {
    Object.defineProperty(process.stdin, "isTTY", {
      configurable: true,
      value: options.tty
    });
    Object.defineProperty(process.stdout, "isTTY", {
      configurable: true,
      value: options.tty
    });
  }

  try {
    await program.parseAsync(["node", "openassist", ...args]);
    return {
      stdout: stdout.join("\n"),
      stderr: stderr.join("\n"),
      exitCode: process.exitCode ?? 0
    };
  } finally {
    console.log = originalLog;
    console.error = originalError;
    process.exitCode = originalExitCode;
    restoreTtyDescriptors();
  }
}

afterEach(() => {
  restoreTtyDescriptors();
  process.exitCode = 0;
});

describe("service command registration coverage", () => {
  it("covers success paths across install, lifecycle, health, and console actions", async () => {
    const root = tempDir("openassist-service-command-success-");
    const installDir = path.join(root, "install");
    const configPath = path.join(root, "operator", "openassist.toml");
    const envFilePath = path.join(root, "operator", "openassistd.env");
    const service = new StubServiceManager("systemd-user");
    const savedStates: Array<Record<string, unknown>> = [];
    const writtenEnvTemplates: string[] = [];
    const healthCalls: string[] = [];
    const promptSelections = [
      "status",
      "health",
      "start",
      "stop",
      "restart",
      "reload",
      "logs",
      "enable",
      "disable",
      "exit"
    ];
    const promptInputs = ["not-a-number"];
    const deps = createDeps({
      createServiceManager: () => service,
      defaultInstallDir: () => installDir,
      defaultConfigPath: () => configPath,
      defaultEnvFilePath: () => envFilePath,
      loadInstallState: () => ({
        configPath
      }),
      saveInstallState: (nextState) => {
        savedStates.push(nextState);
      },
      detectInstallStateFromRepo: () => ({
        repoUrl: "https://example.com/openassist.git",
        trackedRef: "main",
        lastKnownGoodCommit: "abc123"
      }),
      existsSync: (targetPath) => targetPath === configPath,
      writeEnvTemplateIfMissing: (targetPath) => {
        writtenEnvTemplates.push(targetPath);
      },
      checkHealth: async (baseUrl) => {
        healthCalls.push(baseUrl);
        return { ok: true, status: 200, bodyText: "ok" };
      },
      promptSelect: async () => promptSelections.shift() ?? "exit",
      promptInput: async () => promptInputs.shift() ?? "200"
    });

    const install = await runRegisteredCommand(
      ["service", "install", "--install-dir", installDir, "--env-file", envFilePath],
      deps
    );
    assert.equal(install.exitCode, 0, install.stderr || install.stdout);
    assert.match(install.stdout, /Installed systemd-user service for OpenAssist\./);
    assert.deepEqual(writtenEnvTemplates, [envFilePath]);
    assert.equal(savedStates.length, 1);
    assert.deepEqual(savedStates[0], {
      installDir,
      configPath,
      envFilePath,
      repoUrl: "https://example.com/openassist.git",
      trackedRef: "main",
      serviceManager: "systemd-user",
      lastKnownGoodCommit: "abc123"
    });
    assert.deepEqual(service.calls[0], {
      method: "install",
      args: [
        {
          installDir,
          configPath,
          envFilePath,
          repoRoot: installDir,
          dryRun: false,
          systemdFilesystemAccess: "hardened"
        }
      ]
    });

    const uninstall = await runRegisteredCommand(["service", "uninstall"], deps);
    assert.equal(uninstall.exitCode, 0, uninstall.stderr || uninstall.stdout);
    assert.match(uninstall.stdout, /Service uninstalled\./);

    const start = await runRegisteredCommand(["service", "start"], deps);
    assert.equal(start.exitCode, 0, start.stderr || start.stdout);
    assert.match(start.stdout, /Service started\./);

    const stop = await runRegisteredCommand(["service", "stop"], deps);
    assert.equal(stop.exitCode, 0, stop.stderr || stop.stdout);
    assert.match(stop.stdout, /Service stopped\./);

    const restart = await runRegisteredCommand(["service", "restart"], deps);
    assert.equal(restart.exitCode, 0, restart.stderr || restart.stdout);
    assert.match(restart.stdout, /Service restarted\./);

    const reload = await runRegisteredCommand(["service", "reload"], deps);
    assert.equal(reload.exitCode, 0, reload.stderr || reload.stdout);
    assert.match(reload.stdout, /Service config reload complete \(restart finished\)\./);

    const status = await runRegisteredCommand(["service", "status"], deps);
    assert.equal(status.exitCode, 0, status.stderr || status.stdout);

    const logs = await runRegisteredCommand(["service", "logs", "--lines", "invalid", "--follow"], deps);
    assert.equal(logs.exitCode, 0, logs.stderr || logs.stdout);

    const enable = await runRegisteredCommand(["service", "enable"], deps);
    assert.equal(enable.exitCode, 0, enable.stderr || enable.stdout);
    assert.match(enable.stdout, /Service enabled\./);

    const disable = await runRegisteredCommand(["service", "disable"], deps);
    assert.equal(disable.exitCode, 0, disable.stderr || disable.stdout);
    assert.match(disable.stdout, /Service disabled\./);

    const health = await runRegisteredCommand(["service", "health", "--base-url", "http://127.0.0.1:4455///"], deps);
    assert.equal(health.exitCode, 0, health.stderr || health.stdout);
    assert.match(health.stdout, /openassist health: ok \(http:\/\/127\.0\.0\.1:4455\)/);

    const consoleSession = await runRegisteredCommand(
      ["service", "console", "--base-url", "http://127.0.0.1:5566//"],
      deps,
      { tty: true }
    );
    assert.equal(consoleSession.exitCode, 0, consoleSession.stderr || consoleSession.stdout);
    assert.match(consoleSession.stdout, /Service manager: systemd-user/);
    assert.match(consoleSession.stdout, /Health endpoint: http:\/\/127\.0\.0\.1:5566\/v1\/health/);
    assert.match(consoleSession.stdout, /Service reloaded\./);
    assert.equal(
      service.calls.some((call) => call.method === "logs" && call.args[0] === 100 && call.args[1] === true),
      true
    );
    assert.equal(
      service.calls.some((call) => call.method === "logs" && call.args[0] === 200 && call.args[1] === false),
      true
    );
    assert.equal(
      healthCalls.includes("http://127.0.0.1:4455") && healthCalls.includes("http://127.0.0.1:5566"),
      true
    );
  });

  it("covers failure branches for service actions and console error handling", async () => {
    const root = tempDir("openassist-service-command-failure-");
    const installDir = path.join(root, "install");
    const configPath = path.join(root, "legacy", "openassist.toml");
    const envFilePath = path.join(root, "legacy", "openassistd.env");
    const failingService = new StubServiceManager("systemd-user", {
      install: "install broke",
      uninstall: "uninstall broke",
      start: "start broke",
      stop: "stop broke",
      restart: "restart broke",
      status: "status broke",
      logs: "logs broke",
      enable: "enable broke",
      disable: "disable broke"
    });
    const promptSelections = ["status", "exit"];
    const deps = createDeps({
      createServiceManager: () => failingService,
      defaultInstallDir: () => installDir,
      defaultConfigPath: () => path.join(root, "default-openassist.toml"),
      defaultEnvFilePath: () => envFilePath,
      detectLegacyDefaultLayout: () => ({
        status: "ready",
        legacy: {
          configPath
        }
      }),
      checkHealth: async () => ({
        ok: false,
        status: 503,
        bodyText: "service unavailable"
      }),
      promptSelect: async () => promptSelections.shift() ?? "exit"
    });

    const install = await runRegisteredCommand(
      ["service", "install", "--install-dir", installDir, "--env-file", envFilePath],
      deps
    );
    assert.equal(install.exitCode, 1, install.stderr || install.stdout);
    assert.match(install.stderr, /Service install failed: install broke/);
    assert.deepEqual(failingService.calls[0], {
      method: "install",
      args: [
        {
          installDir,
          configPath,
          envFilePath,
          repoRoot: installDir,
          dryRun: false,
          systemdFilesystemAccess: undefined
        }
      ]
    });

    const uninstall = await runRegisteredCommand(["service", "uninstall"], deps);
    assert.equal(uninstall.exitCode, 1, uninstall.stderr || uninstall.stdout);
    assert.match(uninstall.stderr, /Service uninstall failed: uninstall broke/);

    const start = await runRegisteredCommand(["service", "start"], deps);
    assert.equal(start.exitCode, 1, start.stderr || start.stdout);
    assert.match(start.stderr, /Service start failed: start broke/);

    const stop = await runRegisteredCommand(["service", "stop"], deps);
    assert.equal(stop.exitCode, 1, stop.stderr || stop.stdout);
    assert.match(stop.stderr, /Service stop failed: stop broke/);

    const restart = await runRegisteredCommand(["service", "restart"], deps);
    assert.equal(restart.exitCode, 1, restart.stderr || restart.stdout);
    assert.match(restart.stderr, /Service restart failed: restart broke/);

    const reload = await runRegisteredCommand(["service", "reload"], deps);
    assert.equal(reload.exitCode, 1, reload.stderr || reload.stdout);
    assert.match(reload.stderr, /Service reload failed: restart broke/);

    const status = await runRegisteredCommand(["service", "status"], deps);
    assert.equal(status.exitCode, 1, status.stderr || status.stdout);
    assert.match(status.stderr, /Service status failed: status broke/);

    const logs = await runRegisteredCommand(["service", "logs"], deps);
    assert.equal(logs.exitCode, 1, logs.stderr || logs.stdout);
    assert.match(logs.stderr, /Service logs failed: logs broke/);

    const enable = await runRegisteredCommand(["service", "enable"], deps);
    assert.equal(enable.exitCode, 1, enable.stderr || enable.stdout);
    assert.match(enable.stderr, /Service enable failed: enable broke/);

    const disable = await runRegisteredCommand(["service", "disable"], deps);
    assert.equal(disable.exitCode, 1, disable.stderr || disable.stdout);
    assert.match(disable.stderr, /Service disable failed: disable broke/);

    const health = await runRegisteredCommand(["service", "health"], deps);
    assert.equal(health.exitCode, 1, health.stderr || health.stdout);
    assert.match(health.stderr, /Health check failed: openassist health failed/);

    const consoleNoTty = await runRegisteredCommand(["service", "console"], deps, { tty: false });
    assert.equal(consoleNoTty.exitCode, 1, consoleNoTty.stderr || consoleNoTty.stdout);
    assert.match(consoleNoTty.stderr, /Interactive service console requires TTY/);

    const consoleSession = await runRegisteredCommand(["service", "console"], deps, { tty: true });
    assert.equal(consoleSession.exitCode, 0, consoleSession.stderr || consoleSession.stdout);
    assert.match(consoleSession.stdout, /Service manager: systemd-user/);
    assert.match(consoleSession.stderr, /Service console action failed: status broke/);
  });
});
