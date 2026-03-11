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
  const webTool = {
    search: vi.fn(async ({ query }: { query: string }) => ({
      available: true,
      backend: "duckduckgo-html",
      searchMode: "hybrid",
      query,
      results: [
        {
          title: "Result",
          url: "https://example.test",
          snippet: "Snippet",
          domain: "example.test"
        }
      ]
    })),
    fetchUrl: vi.fn(async ({ url }: { url: string }) => ({
      available: true,
      requestedUrl: url,
      finalUrl: url,
      redirects: [],
      content: "hello web",
      excerpt: "hello web",
      fetchedAt: "2026-03-06T00:00:00.000Z",
      citations: [{ id: "[1]", title: url, url }]
    })),
    run: vi.fn(async ({ objective }: { objective: string }) => ({
      available: true,
      objective,
      backend: "duckduckgo-html",
      sources: [],
      citations: [],
      synthesis: `objective=${objective}`
    }))
  };

  const channelSendTool = vi.fn(async () => ({
    ok: true,
    mode: "reply" as const,
    channelId: "telegram-main",
    conversationKey: "c1",
    deliveredAttachmentCount: 0,
    notes: []
  }));

  const router = new RuntimeToolRouter({
    execTool: execTool as any,
    fsTool: fsTool as any,
    pkgTool: pkgTool as any,
    webTool: webTool as any,
    channelSendTool,
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as any
  });

  return { router, execTool, fsTool, pkgTool, webTool, channelSendTool, writes };
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
      actorId: "telegram:u1",
      conversationKey: "c1",
      activeChannelType: "telegram"
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
      {
        sessionId: "telegram:c1",
        actorId: "telegram:u1",
        conversationKey: "c1",
        activeChannelType: "telegram"
      }
    );
    const readResult = await router.execute(
      {
        id: "call-2",
        name: "fs.read",
        argumentsJson: JSON.stringify({
          path: "/tmp/demo.txt"
        })
      },
      {
        sessionId: "telegram:c1",
        actorId: "telegram:u1",
        conversationKey: "c1",
        activeChannelType: "telegram"
      }
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
      {
        sessionId: "telegram:c1",
        actorId: "telegram:u1",
        conversationKey: "c1",
        activeChannelType: "telegram"
      }
    );

    expect(result.status).toBe("failed");
    expect(result.errorText).toContain("Invalid tool arguments JSON");
  });

  it("routes native web tool calls through the web tool adapter", async () => {
    const { router, webTool } = createRouter();

    const result = await router.execute(
      {
        id: "web-1",
        name: "web.search",
        argumentsJson: JSON.stringify({
          query: "openassist runtime"
        })
      },
      {
        sessionId: "telegram:c1",
        actorId: "telegram:u1",
        conversationKey: "c1",
        activeChannelType: "telegram"
      }
    );

    expect(result.status).toBe("succeeded");
    expect(webTool.search).toHaveBeenCalledTimes(1);
    expect(result.message.content).toContain("duckduckgo-html");
  });

  it("routes channel.send through the runtime-owned delivery callback", async () => {
    const { router, channelSendTool } = createRouter();

    const result = await router.execute(
      {
        id: "channel-1",
        name: "channel.send",
        argumentsJson: JSON.stringify({
          mode: "reply",
          text: "artifact ready",
          attachmentPaths: ["/tmp/report.txt"],
          reason: "return the requested artifact"
        })
      },
      {
        sessionId: "telegram:c1",
        actorId: "telegram:u1",
        conversationKey: "c1",
        activeChannelType: "telegram",
        replyToTransportMessageId: "msg-9"
      }
    );

    expect(result.status).toBe("succeeded");
    expect(channelSendTool).toHaveBeenCalledTimes(1);
    expect(channelSendTool).toHaveBeenCalledWith(
      {
        mode: "reply",
        text: "artifact ready",
        attachmentPaths: ["/tmp/report.txt"],
        reason: "return the requested artifact",
        channelId: undefined,
        recipientUserId: undefined
      },
      {
        sessionId: "telegram:c1",
        actorId: "telegram:u1",
        conversationKey: "c1",
        activeChannelType: "telegram",
        replyToTransportMessageId: "msg-9"
      }
    );
    expect(result.message.content).toContain("\"ok\": true");
  });
});
