import { describe, expect, it, vi } from "vitest";
import { RuntimeToolRouter } from "../../packages/core-runtime/src/tool-router.js";
import type { ToolCall } from "../../packages/core-types/src/common.js";

function createRouter() {
  const writes = new Map<string, string>();
  const execTool = {
    run: vi.fn(async ({ command }: { command: string }) => ({
      stdout: `ran:${command}`,
      stderr: "",
      exitCode: 0,
      durationMs: 5
    }))
  };
  const fsTool = {
    read: vi.fn(async ({ filePath }: { filePath: string }) => writes.get(filePath) ?? ""),
    write: vi.fn(async ({ filePath, content }: { filePath: string; content: string }) => {
      writes.set(filePath, content);
    }),
    delete: vi.fn(async ({ filePath }: { filePath: string }) => {
      writes.delete(filePath);
    })
  };
  const pkgTool = {
    install: vi.fn(async () => ({
      manager: "npm",
      command: "npm",
      args: ["install", "chalk"],
      usedSudo: false,
      stdout: "",
      stderr: "",
      exitCode: 0,
      durationMs: 2
    }))
  };

  const router = new RuntimeToolRouter({
    execTool: execTool as any,
    fsTool: fsTool as any,
    pkgTool: pkgTool as any,
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as any
  });

  return { router, execTool, fsTool, pkgTool, writes };
}

async function runLoop(
  router: RuntimeToolRouter,
  calls: ToolCall[],
  maxRounds: number
): Promise<{ executed: number; hitLimit: boolean }> {
  let executed = 0;
  for (let i = 0; i < calls.length; i += 1) {
    if (executed >= maxRounds) {
      return { executed, hitLimit: true };
    }
    await router.execute(calls[i]!, {
      sessionId: "telegram:c1",
      actorId: "telegram:u1"
    });
    executed += 1;
  }
  return { executed, hitLimit: false };
}

describe("tool loop runtime helpers", () => {
  it("handles multi-step tool execution through the router", async () => {
    const { router, writes } = createRouter();

    const writeResult = await router.execute(
      {
        id: "call-1",
        name: "fs.write",
        argumentsJson: JSON.stringify({
          path: "/tmp/demo.txt",
          content: "hello"
        })
      },
      { sessionId: "telegram:c1", actorId: "telegram:u1" }
    );
    const readResult = await router.execute(
      {
        id: "call-2",
        name: "fs.read",
        argumentsJson: JSON.stringify({
          path: "/tmp/demo.txt"
        })
      },
      { sessionId: "telegram:c1", actorId: "telegram:u1" }
    );

    expect(writeResult.status).toBe("succeeded");
    expect(readResult.status).toBe("succeeded");
    expect(readResult.message.content).toBe("hello");
    expect(writes.get("/tmp/demo.txt")).toBe("hello");
  });

  it("enforces round cap in loop orchestration", async () => {
    const { router } = createRouter();
    const calls: ToolCall[] = Array.from({ length: 12 }).map((_, idx) => ({
      id: `call-${idx}`,
      name: "exec.run",
      argumentsJson: JSON.stringify({ command: `echo ${idx}` })
    }));

    const result = await runLoop(router, calls, 8);
    expect(result.executed).toBe(8);
    expect(result.hitLimit).toBe(true);
  });

  it("returns structured failures for invalid tool arguments", async () => {
    const { router } = createRouter();

    const result = await router.execute(
      {
        id: "bad-json",
        name: "exec.run",
        argumentsJson: "{bad"
      },
      { sessionId: "telegram:c1", actorId: "telegram:u1" }
    );

    expect(result.status).toBe("failed");
    expect(result.errorText).toContain("Invalid tool arguments JSON");
  });
});
