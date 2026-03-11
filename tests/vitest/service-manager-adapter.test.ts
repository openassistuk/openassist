import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  CommandRunner,
  RunCommandOptions,
  RunCommandResult
} from "../../apps/openassist-cli/src/lib/command-runner.js";
import {
  createServiceManager
} from "../../apps/openassist-cli/src/lib/service-manager.js";

function tempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

class FakeRunner implements CommandRunner {
  readonly runCalls: Array<{ command: string; args: string[]; options?: RunCommandOptions }> = [];
  readonly streamCalls: Array<{ command: string; args: string[]; options?: RunCommandOptions }> = [];
  private readonly runCodeFn: (command: string, args: string[]) => number;
  private readonly streamCodeFn: (command: string, args: string[]) => number;

  constructor(options: {
    runCodeFn?: (command: string, args: string[]) => number;
    streamCodeFn?: (command: string, args: string[]) => number;
  } = {}) {
    this.runCodeFn = options.runCodeFn ?? (() => 0);
    this.streamCodeFn = options.streamCodeFn ?? (() => 0);
  }

  async run(command: string, args: string[] = [], options?: RunCommandOptions): Promise<RunCommandResult> {
    this.runCalls.push({ command, args, options });
    const code = this.runCodeFn(command, args);
    return {
      code,
      stdout: "",
      stderr: ""
    };
  }

  async runStreaming(command: string, args: string[] = [], options?: RunCommandOptions): Promise<number> {
    this.streamCalls.push({ command, args, options });
    return this.streamCodeFn(command, args);
  }
}

const originalPlatform = process.platform;
const originalGetuidDescriptor = Object.getOwnPropertyDescriptor(process, "getuid");

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
  vi.restoreAllMocks();
});

describe("service-manager adapters", () => {
  it("executes Linux systemd user lifecycle", async () => {
    setPlatform("linux");
    setGetuid(1000);
    const home = tempDir("openassist-systemd-home-");
    vi.spyOn(os, "homedir").mockReturnValue(home);

    const runner = new FakeRunner();
    const manager = createServiceManager(runner);

    expect(manager.kind).toBe("systemd-user");

    const repoRoot = tempDir("openassist-systemd-repo-");
    const installDir = path.join(repoRoot, "install");
    const configPath = path.join(installDir, "openassist.toml");
    const envFilePath = path.join(home, ".config", "openassist", "openassistd.env");

    await manager.install({
      installDir,
      configPath,
      envFilePath,
      repoRoot
    });

    const unitPath = path.join(home, ".config", "systemd", "user", "openassistd.service");
    const statePath = path.join(home, ".local", "state", "openassist");
    const unitText = fs.readFileSync(unitPath, "utf8");
    expect(fs.existsSync(unitPath)).toBe(true);
    expect(fs.existsSync(statePath)).toBe(true);
    expect(unitText).not.toContain("MemoryDenyWriteExecute=true");
    expect(unitText).toContain("Environment=OPENASSIST_SERVICE_MANAGER_KIND=systemd-user");
    expect(unitText).toContain("Environment=OPENASSIST_SYSTEMD_FILESYSTEM_ACCESS=hardened");
    expect(unitText).toContain("ProtectSystem=strict");
    expect(await manager.isInstalled()).toBe(true);

    await manager.start();
    await manager.status();
    await manager.logs(20, false);
    await manager.enable();
    await manager.restart();
    await manager.stop();
    await manager.disable();
    await manager.uninstall();

    expect(await manager.isInstalled()).toBe(false);
    expect(runner.runCalls.some((call) => call.command === "systemctl")).toBe(true);
    expect(runner.streamCalls.some((call) => call.command === "journalctl")).toBe(true);
  });

  it("executes macOS launchd lifecycle", async () => {
    setPlatform("darwin");
    const home = tempDir("openassist-launchd-home-");
    vi.spyOn(os, "homedir").mockReturnValue(home);

    const runner = new FakeRunner();
    const manager = createServiceManager(runner);

    expect(manager.kind).toBe("launchd");

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

    const plistPath = path.join(home, "Library", "LaunchAgents", "ai.openassist.openassistd.plist");
    const stdoutLogPath = path.join(home, "Library", "Logs", "OpenAssist", "openassistd.out.log");
    const stderrLogPath = path.join(home, "Library", "Logs", "OpenAssist", "openassistd.err.log");

    expect(fs.existsSync(plistPath)).toBe(true);
    expect(await manager.isInstalled()).toBe(true);

    fs.mkdirSync(path.dirname(stdoutLogPath), { recursive: true });
    fs.writeFileSync(stdoutLogPath, "out\n", "utf8");
    fs.writeFileSync(stderrLogPath, "err\n", "utf8");

    await manager.start();
    await manager.status();
    await manager.logs(20, false);
    await manager.enable();
    await manager.restart();
    await manager.stop();
    await manager.disable();
    await manager.uninstall();

    expect(await manager.isInstalled()).toBe(false);
    expect(runner.runCalls.some((call) => call.command === "launchctl")).toBe(true);
    expect(runner.streamCalls.some((call) => call.command === "tail")).toBe(true);
  });

  it("covers Linux systemd-system error branches with dry-run install", async () => {
    setPlatform("linux");
    setGetuid(0);

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

    expect(manager.kind).toBe("systemd-system");

    await manager.install({
      installDir: "/tmp/openassist",
      configPath: "/tmp/openassist/openassist.toml",
      envFilePath: "/tmp/openassist/openassistd.env",
      repoRoot: tempDir("openassist-systemd-system-repo-"),
      dryRun: true
    });

    await expect(manager.status()).rejects.toThrow("systemctl status returned 3");
    await expect(manager.logs(10, false)).rejects.toThrow("journalctl returned 2");
  });

  it("throws on unsupported platform service manager creation", () => {
    setPlatform("win32");
    expect(() => createServiceManager(new FakeRunner())).toThrow(
      "Unsupported platform for service management: win32"
    );
  });
});
