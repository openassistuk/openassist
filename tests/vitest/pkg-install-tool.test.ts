import { EventEmitter } from "node:events";
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { PolicyEngine } from "../../packages/core-types/src/policy.js";

const availableCommands = vi.hoisted(() => new Set<string>());
const execBehavior = vi.hoisted(() => ({
  shouldFail: false,
  code: 1,
  stdout: "",
  stderr: "failed"
}));
const execCalls = vi.hoisted(() => [] as Array<{ command: string; args: string[] }>);

vi.mock("node:child_process", () => {
  return {
    spawn: (command: string) => {
      const emitter = new EventEmitter() as EventEmitter & {
        stdout?: unknown;
        stderr?: unknown;
      };
      process.nextTick(() => {
        if (availableCommands.has(command)) {
          emitter.emit("close", 0);
          return;
        }
        emitter.emit("error", new Error(`ENOENT: ${command}`));
      });
      return emitter;
    },
    execFile: (
      command: string,
      args: string[],
      _options: unknown,
      callback: (error: Error | null, stdout: string, stderr: string) => void
    ) => {
      execCalls.push({ command, args });
      if (execBehavior.shouldFail) {
        const error = Object.assign(new Error(execBehavior.stderr), {
          code: execBehavior.code,
          stdout: execBehavior.stdout,
          stderr: execBehavior.stderr
        });
        callback(error, execBehavior.stdout, execBehavior.stderr);
        return;
      }
      callback(null, execBehavior.stdout, execBehavior.stderr);
    }
  };
});

import { PackageInstallTool } from "../../packages/tools-package/src/index.js";

function allowAllPolicy(): PolicyEngine {
  return {
    currentProfile: async () => "full-root",
    setProfile: async () => undefined,
    authorize: async () => ({ allowed: true })
  };
}

describe("pkg install tool", () => {
  beforeEach(() => {
    availableCommands.clear();
    execBehavior.shouldFail = false;
    execBehavior.code = 1;
    execBehavior.stdout = "";
    execBehavior.stderr = "failed";
    execCalls.length = 0;
  });

  it("detects manager and builds install command", async () => {
    availableCommands.add("npm");
    execBehavior.stdout = "ok";
    execBehavior.stderr = "";

    const tool = new PackageInstallTool({
      policyEngine: allowAllPolicy(),
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as any
    });

    const result = await tool.install({
      sessionId: "telegram:c1",
      actorId: "telegram:u1",
      packages: ["chalk"],
      manager: "npm"
    });

    expect(result.manager).toBe("npm");
    expect(result.command).toBe("npm");
    expect(result.args).toEqual(["install", "chalk"]);
    expect(result.usedSudo).toBe(false);
  });

  it("uses sudo -n for elevated managers when requested", async () => {
    availableCommands.add("apt");
    execBehavior.shouldFail = true;
    execBehavior.stderr = "sudo: a password is required";

    const tool = new PackageInstallTool({
      policyEngine: allowAllPolicy(),
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as any,
      sudoNonInteractive: true
    });

    const result = await tool.install({
      sessionId: "telegram:c1",
      actorId: "telegram:u1",
      packages: ["curl"],
      manager: "apt"
    });

    expect(result.command).toBe(process.platform === "win32" ? "apt" : "sudo");
    if (process.platform !== "win32") {
      expect(result.args[0]).toBe("-n");
      expect(result.args[1]).toBe("apt");
    }
    expect(result.exitCode).not.toBe(0);
  });

  it("returns actionable fallback errors when no manager is available", async () => {
    const toolWithFallback = new PackageInstallTool({
      policyEngine: allowAllPolicy(),
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as any,
      allowExecFallback: true
    });
    const toolWithoutFallback = new PackageInstallTool({
      policyEngine: allowAllPolicy(),
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as any,
      allowExecFallback: false
    });

    await expect(
      toolWithFallback.install({
        sessionId: "telegram:c1",
        actorId: "telegram:u1",
        packages: ["foo"]
      })
    ).rejects.toThrow("Use exec.run fallback");

    await expect(
      toolWithoutFallback.install({
        sessionId: "telegram:c1",
        actorId: "telegram:u1",
        packages: ["foo"]
      })
    ).rejects.toThrow("No supported package manager found for pkg.install");
  });
});
