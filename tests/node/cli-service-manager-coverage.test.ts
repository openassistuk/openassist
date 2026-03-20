import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";
import type {
  CommandRunner,
  RunCommandOptions,
  RunCommandResult
} from "../../apps/openassist-cli/src/lib/command-runner.js";
import {
  createServiceManager,
  detectServiceManagerKind
} from "../../apps/openassist-cli/src/lib/service-manager.js";

function tempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

type RunCodeFn = (command: string, args: string[]) => number;
type StreamCodeFn = (command: string, args: string[]) => number;

class FakeRunner implements CommandRunner {
  readonly runCalls: Array<{ command: string; args: string[]; options?: RunCommandOptions }> = [];
  readonly streamCalls: Array<{ command: string; args: string[]; options?: RunCommandOptions }> = [];
  private readonly runCodeFn: RunCodeFn;
  private readonly streamCodeFn: StreamCodeFn;

  constructor(options: {
    runCodeFn?: RunCodeFn;
    streamCodeFn?: StreamCodeFn;
  } = {}) {
    this.runCodeFn = options.runCodeFn ?? (() => 0);
    this.streamCodeFn = options.streamCodeFn ?? (() => 0);
  }

  async run(command: string, args: string[] = [], options?: RunCommandOptions): Promise<RunCommandResult> {
    this.runCalls.push({ command, args, options });
    const code = this.runCodeFn(command, args);
    return {
      code,
      stdout: code === 0 ? "ok\n" : "",
      stderr: code === 0 ? "" : "error\n"
    };
  }

  async runStreaming(command: string, args: string[] = [], options?: RunCommandOptions): Promise<number> {
    this.streamCalls.push({ command, args, options });
    return this.streamCodeFn(command, args);
  }
}

const originalPlatform = process.platform;
const originalGetuidDescriptor = Object.getOwnPropertyDescriptor(process, "getuid");
const originalHomedirDescriptor = Object.getOwnPropertyDescriptor(os, "homedir");

function setPlatform(platform: NodeJS.Platform): void {
  Object.defineProperty(process, "platform", {
    configurable: true,
    value: platform
  });
}

function setGetuid(uid: number | undefined): void {
  Object.defineProperty(process, "getuid", {
    configurable: true,
    value: uid === undefined ? undefined : () => uid
  });
}

function setHomedir(homeDir: string): void {
  Object.defineProperty(os, "homedir", {
    configurable: true,
    value: () => homeDir
  });
}

afterEach(() => {
  setPlatform(originalPlatform);

  if (originalGetuidDescriptor) {
    Object.defineProperty(process, "getuid", originalGetuidDescriptor);
  } else {
    Object.defineProperty(process, "getuid", {
      configurable: true,
      value: undefined
    });
  }

  if (originalHomedirDescriptor) {
    Object.defineProperty(os, "homedir", originalHomedirDescriptor);
  }
});

describe("cli service-manager coverage", () => {
  it("covers Linux systemd user lifecycle including install/uninstall", async () => {
    setPlatform("linux");
    setGetuid(1000);
    const home = tempDir("openassist-systemd-user-home-");
    setHomedir(home);

    const runner = new FakeRunner();
    const manager = createServiceManager(runner);
    assert.equal(manager.kind, "systemd-user");
    assert.equal(detectServiceManagerKind(), "systemd-user");

    const repoRoot = tempDir("openassist-systemd-user-repo-");
    const installDir = path.join(repoRoot, "install");
    const configPath = path.join(installDir, "openassist.toml");
    const envFilePath = path.join(home, ".config", "openassist", "openassistd.env");

    await manager.install({
      installDir,
      configPath,
      envFilePath,
      repoRoot
    });
    assert.equal(await manager.isInstalled(), true);

    const unitPath = path.join(home, ".config", "systemd", "user", "openassistd.service");
    assert.equal(fs.existsSync(unitPath), true);
    const unitText = fs.readFileSync(unitPath, "utf8");
    assert.equal(unitText.includes("WorkingDirectory="), true);
    assert.equal(unitText.includes(path.dirname(envFilePath)), true);

    await manager.start();
    await manager.status();
    await manager.logs(20, false);
    await manager.enable();
    await manager.restart();
    await manager.stop();
    await manager.disable();
    await manager.uninstall();

    assert.equal(await manager.isInstalled(), false);
    assert.equal(runner.runCalls.some((call) => call.command === "systemctl"), true);
    assert.equal(runner.streamCalls.some((call) => call.command === "journalctl"), true);
  });

  it("covers Linux systemd system dry-run and error branches", async () => {
    setPlatform("linux");
    setGetuid(0);
    const home = tempDir("openassist-systemd-system-home-");
    setHomedir(home);

    const runner = new FakeRunner({
      runCodeFn: (command, args) => {
        if (command === "systemctl" && args[0] === "status") {
          return 3;
        }
        return 0;
      },
      streamCodeFn: (command) => {
        if (command === "journalctl") {
          return 2;
        }
        return 0;
      }
    });

    const manager = createServiceManager(runner);
    assert.equal(manager.kind, "systemd-system");
    assert.equal(detectServiceManagerKind(), "systemd-system");

    await manager.install({
      installDir: "/tmp/openassist",
      configPath: "/tmp/openassist/openassist.toml",
      envFilePath: "/tmp/openassist/openassistd.env",
      repoRoot: tempDir("openassist-systemd-system-repo-"),
      dryRun: true
    });

    await assert.rejects(async () => manager.status(), /systemctl status returned 3/);
    await assert.rejects(async () => manager.logs(10, false), /journalctl returned 2/);
  });

  it("covers macOS launchd lifecycle and restart stop-failure branch", async () => {
    setPlatform("darwin");
    setGetuid(501);
    const home = tempDir("openassist-launchd-home-");
    setHomedir(home);

    let bootstrapped = false;
    let disabled = false;
    let failNextBootout = false;
    const runner = new FakeRunner({
      runCodeFn: (command, args) => {
        if (command !== "launchctl") {
          return 0;
        }
        if (args[0] === "print") {
          return bootstrapped ? 0 : 1;
        }
        if (args[0] === "bootstrap") {
          bootstrapped = true;
          return 0;
        }
        if (args[0] === "enable") {
          if (!bootstrapped) {
            return 1;
          }
          disabled = false;
          return 0;
        }
        if (args[0] === "disable") {
          if (!bootstrapped) {
            return 1;
          }
          disabled = true;
          return 0;
        }
        if (args[0] === "kickstart") {
          return bootstrapped && !disabled ? 0 : 1;
        }
        if (args[0] === "bootout") {
          if (failNextBootout) {
            failNextBootout = false;
            bootstrapped = false;
            return 1;
          }
          if (!bootstrapped) {
            return 1;
          }
          bootstrapped = false;
          return 0;
        }
        return 0;
      }
    });

    const manager = createServiceManager(runner);
    assert.equal(manager.kind, "launchd");
    assert.equal(detectServiceManagerKind(), "launchd");

    const repoRoot = tempDir("openassist-launchd-repo-");
    const installDir = path.join(repoRoot, "install");
    const configPath = path.join(installDir, "openassist.toml");
    const envFilePath = path.join(home, ".config", "openassist", "openassistd.env");

    await manager.install({
      installDir,
      configPath,
      envFilePath,
      repoRoot
    });

    const stdoutLogPath = path.join(home, "Library", "Logs", "OpenAssist", "openassistd.out.log");
    const stderrLogPath = path.join(home, "Library", "Logs", "OpenAssist", "openassistd.err.log");
    fs.mkdirSync(path.dirname(stdoutLogPath), { recursive: true });
    fs.writeFileSync(stdoutLogPath, "stdout\n", "utf8");
    fs.writeFileSync(stderrLogPath, "stderr\n", "utf8");

    await manager.status();
    await manager.logs(20, true);
    await manager.enable();
    failNextBootout = true;
    await manager.restart();
    await manager.disable();
    await manager.enable();
    await manager.start();
    await manager.uninstall();

    assert.equal(await manager.isInstalled(), false);
    assert.equal(runner.runCalls.some((call) => call.command === "launchctl"), true);
    assert.equal(runner.streamCalls.some((call) => call.command === "tail"), true);
    const launchctlCalls = runner.runCalls
      .filter((call) => call.command === "launchctl")
      .map((call) => call.args.join(" "));
    assert.equal(
      launchctlCalls.includes(`bootstrap gui/501 ${path.join(home, "Library", "LaunchAgents", "ai.openassist.openassistd.plist")}`),
      true
    );
    assert.equal(launchctlCalls.includes("enable gui/501/ai.openassist.openassistd"), true);
    assert.equal(launchctlCalls.includes("kickstart -k gui/501/ai.openassist.openassistd"), true);
    assert.equal(
      launchctlCalls.filter((call) => call === "bootout gui/501/ai.openassist.openassistd").length >= 2,
      true
    );
  });

  it("covers unsupported platform manager creation failure", () => {
    setPlatform("win32");
    setGetuid(undefined);
    assert.equal(detectServiceManagerKind(), "systemd-user");
    assert.throws(() => createServiceManager(new FakeRunner()), /Unsupported platform for service management: win32/);
  });
});
