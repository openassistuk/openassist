import { describe, expect, it } from "vitest";
import {
  describeSystemdFilesystemAccess,
  isLinuxSystemdFilesystemAccessConfigurable,
  promptSystemdFilesystemAccess
} from "../../apps/openassist-cli/src/lib/service-access.js";

class PromptStub {
  lastConfirmMessage?: string;
  lastSelectMessage?: string;

  constructor(
    private readonly selections: string[],
    private readonly confirmations: boolean[] = []
  ) {}

  async select<T extends string>(message?: string): Promise<T> {
    this.lastSelectMessage = message;
    const next = this.selections.shift();
    if (!next) {
      throw new Error("No select answer queued");
    }
    return next as T;
  }

  async confirm(message?: string): Promise<boolean> {
    this.lastConfirmMessage = message;
    const next = this.confirmations.shift();
    if (next === undefined) {
      throw new Error("No confirm answer queued");
    }
    return next;
  }
}

describe("service access prompts", () => {
  it("detects Linux as the only configurable systemd filesystem platform", () => {
    expect(isLinuxSystemdFilesystemAccessConfigurable("linux")).toBe(true);
    expect(isLinuxSystemdFilesystemAccessConfigurable("darwin")).toBe(false);
    expect(isLinuxSystemdFilesystemAccessConfigurable("win32")).toBe(false);
    expect(describeSystemdFilesystemAccess("hardened")).toBe("Hardened systemd sandbox");
    expect(describeSystemdFilesystemAccess("unrestricted")).toBe(
      "Unrestricted systemd filesystem access"
    );
  });

  it("keeps hardened mode when unrestricted access is declined", async () => {
    const emitted: string[] = [];
    const prompts = new PromptStub(["unrestricted"], [false]);

    const selected = await promptSystemdFilesystemAccess(prompts, "hardened", {
      emitLine: (line) => emitted.push(line)
    });

    expect(selected).toBe("hardened");
    expect(emitted.length).toBeGreaterThan(0);
    expect(
      emitted.some((line) => line.includes("removes OpenAssist-added Linux systemd hardening"))
    ).toBe(true);
    expect(emitted.some((line) => line.includes("Keeping hardened Linux systemd filesystem access."))).toBe(true);
  });

  it("accepts unrestricted mode after the danger confirmation", async () => {
    const prompts = new PromptStub(["unrestricted"], [true]);

    await expect(promptSystemdFilesystemAccess(prompts, "hardened")).resolves.toBe("unrestricted");
    expect(prompts.lastConfirmMessage).toContain("removes OpenAssist-added Linux systemd hardening");
  });
});
