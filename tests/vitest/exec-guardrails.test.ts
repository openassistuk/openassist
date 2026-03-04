import { describe, expect, it, vi } from "vitest";
import { ExecTool } from "../../packages/tools-exec/src/index.js";
import type { PolicyEngine } from "../../packages/core-types/src/policy.js";

function allowAllPolicy(): PolicyEngine {
  return {
    currentProfile: async () => "full-root",
    setProfile: async () => undefined,
    authorize: async () => ({ allowed: true })
  };
}

describe("exec guardrails", () => {
  it("blocks catastrophic patterns in minimal mode", async () => {
    const tool = new ExecTool({
      policyEngine: allowAllPolicy(),
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as any,
      guardrails: {
        mode: "minimal",
        extraBlockedPatterns: []
      }
    });

    const result = await tool.run({
      sessionId: "telegram:c1",
      actorId: "telegram:u1",
      command: "rm -rf /"
    });

    expect(result.exitCode).toBe(126);
    expect(result.stderr).toContain("Command blocked by guardrail pattern");
  });

  it("allows safe commands", async () => {
    const tool = new ExecTool({
      policyEngine: allowAllPolicy(),
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as any,
      guardrails: {
        mode: "minimal",
        extraBlockedPatterns: []
      }
    });

    const result = await tool.run({
      sessionId: "telegram:c1",
      actorId: "telegram:u1",
      command: "node -e \"console.log('ok')\""
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("ok");
  });

  it("supports strict mode extra blocks", async () => {
    const tool = new ExecTool({
      policyEngine: allowAllPolicy(),
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as any,
      guardrails: {
        mode: "strict",
        extraBlockedPatterns: []
      }
    });

    const result = await tool.run({
      sessionId: "telegram:c1",
      actorId: "telegram:u1",
      command: "reboot"
    });

    expect(result.exitCode).toBe(126);
  });
});
