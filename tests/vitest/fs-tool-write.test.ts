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

describe("fs write", () => {
  it("writes files with owner-only permissions on unix hosts", async () => {
    const root = tempDir("openassist-fs-write-");
    const target = path.join(root, "nested", "a.txt");

    const tool = new FsTool({
      policyEngine: allowAllPolicy(),
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as any,
      workspaceRoot: root,
      workspaceOnly: true
    });

    await tool.write({
      sessionId: "telegram:c1",
      actorId: "telegram:u1",
      filePath: target,
      content: "hello"
    });

    expect(fs.readFileSync(target, "utf8")).toBe("hello");
    if (process.platform !== "win32") {
      const mode = fs.statSync(target).mode & 0o777;
      expect(mode & 0o077).toBe(0);
    }

    fs.rmSync(root, { recursive: true, force: true });
  });
});
