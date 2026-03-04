import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { FsTool } from "../../packages/tools-fs/src/index.js";
import type { PolicyEngine } from "../../packages/core-types/src/policy.js";

function tempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function allowAllPolicy(): PolicyEngine {
  return {
    currentProfile: async () => "full-root",
    setProfile: async () => undefined,
    authorize: async () => ({ allowed: true })
  };
}

describe("fs delete", () => {
  it("deletes files inside workspace", async () => {
    const root = tempDir("openassist-fs-delete-");
    const target = path.join(root, "a.txt");
    fs.writeFileSync(target, "x", "utf8");

    const tool = new FsTool({
      policyEngine: allowAllPolicy(),
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as any,
      workspaceRoot: root,
      workspaceOnly: true
    });

    await tool.delete({
      sessionId: "telegram:c1",
      actorId: "telegram:u1",
      filePath: target
    });

    expect(fs.existsSync(target)).toBe(false);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("blocks deleting outside workspace when workspaceOnly=true", async () => {
    const workspace = tempDir("openassist-fs-workspace-");
    const outsideRoot = tempDir("openassist-fs-outside-");
    const outsideTarget = path.join(outsideRoot, "a.txt");
    fs.writeFileSync(outsideTarget, "x", "utf8");

    const tool = new FsTool({
      policyEngine: allowAllPolicy(),
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as any,
      workspaceRoot: workspace,
      workspaceOnly: true
    });

    await expect(
      tool.delete({
        sessionId: "telegram:c1",
        actorId: "telegram:u1",
        filePath: outsideTarget
      })
    ).rejects.toThrow("outside workspace root");

    expect(fs.existsSync(outsideTarget)).toBe(true);
    fs.rmSync(workspace, { recursive: true, force: true });
    fs.rmSync(outsideRoot, { recursive: true, force: true });
  });

  it("supports recursive directory deletes", async () => {
    const root = tempDir("openassist-fs-delete-recursive-");
    const nested = path.join(root, "nested", "inner");
    fs.mkdirSync(nested, { recursive: true });
    fs.writeFileSync(path.join(nested, "x.txt"), "x", "utf8");

    const tool = new FsTool({
      policyEngine: allowAllPolicy(),
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as any,
      workspaceRoot: root,
      workspaceOnly: true
    });

    await tool.delete({
      sessionId: "telegram:c1",
      actorId: "telegram:u1",
      filePath: path.join(root, "nested"),
      recursive: true
    });

    expect(fs.existsSync(path.join(root, "nested"))).toBe(false);
    fs.rmSync(root, { recursive: true, force: true });
  });
});
