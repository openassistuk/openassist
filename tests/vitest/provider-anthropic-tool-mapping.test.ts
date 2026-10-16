import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ChatRequest } from "../../packages/core-types/src/provider.js";
import { AnthropicProviderAdapter } from "../../packages/providers-anthropic/src/index.js";

function baseRequest(): ChatRequest {
  return {
    sessionId: "telegram:c1",
    model: "claude-sonnet-4-6",
    messages: [
      { role: "system", content: "system text" },
      { role: "user", content: "user text" },
      {
        role: "assistant",
        content: "",
        toolCallId: "tool-use-1",
        toolName: "fs.read",
        metadata: {
          toolArgumentsJson: "{\"path\":\"/tmp/a.txt\"}"
        }
      },
      {
        role: "tool",
        content: "file content",
        toolCallId: "tool-use-1",
        metadata: {
          isError: "false"
        }
      }
    ],
    tools: [
      {
        name: "fs.read",
        description: "read file",
        inputSchema: {
          type: "object",
          properties: {
            path: { type: "string" }
          }
        }
      }
    ],
    metadata: {}
  };
}

const tempDirs = new Set<string>();

function tempFile(name: string, contents: Buffer): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "openassist-anthropic-provider-"));
  tempDirs.add(dir);
  const filePath = path.join(dir, name);
  fs.writeFileSync(filePath, contents);
  return filePath;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  for (const dir of tempDirs) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  tempDirs.clear();
});

describe("anthropic provider tool mapping", () => {
  it.each(["fs.read", "skill.日本語", "x".repeat(200), "oa__reserved"])("round-trips API-safe tool names through restart for %s", async (toolName) => {
    const payloads: Array<Record<string, any>> = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, options) => {
      const payload = JSON.parse(options?.body as string);
      payloads.push(payload);
      const name = payload.tools?.[0]?.name;
      return new Response(JSON.stringify({
        id: "reply", type: "message", role: "assistant", model: "claude-sonnet-5",
        content: payloads.length === 1 ? [{ type: "tool_use", id: "call-1", name, input: {} }] : [{ type: "text", text: "done" }],
        stop_reason: payloads.length === 1 ? "tool_use" : "end_turn", usage: { input_tokens: 1, output_tokens: 1 }
      }), { headers: { "content-type": "application/json" } });
    });
    const config = { id: "test", defaultModel: "claude-sonnet-5" };
    const auth = { providerId: "test", apiKey: "fixture-key" };
    const request = { ...baseRequest(), model: config.defaultModel, messages: [{ role: "user" as const, content: "read" }], tools: [{ name: toolName, description: "fixture", inputSchema: { type: "object" } }] };
    const first = await new AnthropicProviderAdapter(config).chat(request, auth);
    const wireName = payloads[0].tools[0].name;
    expect(wireName).toMatch(/^[a-zA-Z0-9_-]{1,128}$/);
    expect(payloads[0].tools[0].description).toContain(toolName);
    expect(first.toolCalls?.[0].name).toBe(toolName);
    expect(first.output.metadata?.providerReplayJson).toBeDefined();
    expect(first.output.metadata?.providerReplayScope).toBe("anthropic:test:claude-sonnet-5");
    await new AnthropicProviderAdapter(config).chat({ ...request, tools: [], messages: [
      ...request.messages,
      { role: "assistant", content: "", toolCallId: "call-1", toolName, metadata: JSON.parse(JSON.stringify(first.output.metadata)) },
      { role: "tool", content: "result", toolCallId: "call-1" }
    ] }, auth);
    expect(payloads[1]).not.toHaveProperty("tools");
    expect(payloads[1].messages[1].content).toEqual([{ type: "tool_use", id: "call-1", name: wireName, input: {} }]);
    expect(payloads[1].messages[2].content[0]).toMatchObject({ type: "tool_result", tool_use_id: "call-1" });
  });

  it.each(["provider", "model", "encoding", "bytes", "items"])("rejects incompatible or oversized opaque replay (%s) while retaining audited tools", async (invalid) => {
    let payload: Record<string, any> = {};
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, options) => {
      payload = JSON.parse(options?.body as string);
      return new Response(JSON.stringify({ id: "reply", content: [{ type: "text", text: "done" }], usage: { input_tokens: 1, output_tokens: 1 } }), { headers: { "content-type": "application/json" } });
    });
    const metadata: Record<string, string> = { providerReplayKind: "anthropic-content-blocks", providerReplayScope: "anthropic:test:claude-sonnet-5", anthropicToolNameEncoding: "sha256-v1", providerReplayJson: JSON.stringify([{ type: "thinking", thinking: "", signature: "fixture-signature" }, { type: "tool_use", id: "call-1", name: "old_wire_name", input: {} }]), toolArgumentsJson: "{}" };
    if (invalid === "provider") metadata.providerReplayScope = "anthropic:other:claude-sonnet-5";
    if (invalid === "model") metadata.providerReplayScope = "anthropic:test:claude-opus-5";
    if (invalid === "encoding") metadata.anthropicToolNameEncoding = "unsupported";
    if (invalid === "bytes") metadata.providerReplayJson = JSON.stringify([{ type: "text", text: "x".repeat(1_048_577) }]);
    if (invalid === "items") metadata.providerReplayJson = JSON.stringify(Array.from({ length: 257 }, () => ({ type: "text", text: "x" })));
    await new AnthropicProviderAdapter({ id: "test", defaultModel: "claude-sonnet-5" }).chat({ ...baseRequest(), model: "claude-sonnet-5", messages: [
      { role: "user", content: "check" }, { role: "assistant", content: "", toolCallId: "call-1", toolName: "fs.read", metadata }, { role: "tool", content: "result", toolCallId: "call-1" }
    ] }, { providerId: "test", apiKey: "fixture-key" });
    expect(payload.messages).toHaveLength(3);
    expect(payload.messages[1].content).toEqual([{ type: "tool_use", id: "call-1", name: payload.tools[0].name, input: {} }]);
    expect(payload.messages[2].content[0].tool_use_id).toBe("call-1");
  });

  it("distinguishes legacy literal tool names from new encoded names", async () => {
    const payloads: Array<Record<string, any>> = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, options) => {
      payloads.push(JSON.parse(options?.body as string));
      return new Response(JSON.stringify({ id: "reply", content: [{ type: "text", text: "done" }], usage: { input_tokens: 1, output_tokens: 1 } }), { headers: { "content-type": "application/json" } });
    });
    const config = { id: "test", defaultModel: "claude-sonnet-5" };
    const auth = { providerId: "test", apiKey: "fixture-key" };
    await new AnthropicProviderAdapter(config).chat({ ...baseRequest(), model: config.defaultModel }, auth);
    const legacyLiteralName = payloads[0].tools[0].name;
    const tools = [...baseRequest().tools, { name: legacyLiteralName, description: "legacy fixture", inputSchema: { type: "object" } }];
    await new AnthropicProviderAdapter(config).chat({ ...baseRequest(), model: config.defaultModel, tools, messages: [
      { role: "user", content: "check" }, { role: "assistant", content: "", toolCallId: "call-1", toolName: legacyLiteralName, metadata: { providerReplayKind: "anthropic-content-blocks", providerReplayJson: JSON.stringify([{ type: "tool_use", id: "call-1", name: legacyLiteralName, input: {} }]) } },
      { role: "tool", content: "result", toolCallId: "call-1" }
    ] }, auth);
    expect(payloads[1].tools[0].name).not.toBe(payloads[1].tools[1].name);
    expect(payloads[1].messages[1].content[0].name).toBe(payloads[1].tools[1].name);
  });

  it.each([false, true])("preserves complete multi-tool turns and groups results after restart (thinking=%s)", async (thinking) => {
    const payloads: Array<Record<string, any>> = [];
    let blocks: Array<Record<string, unknown>> = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, options) => {
      const payload = JSON.parse(options?.body as string);
      payloads.push(payload);
      blocks = payloads.length === 1 ? [
        ...(thinking ? [{ type: "thinking", thinking: "", signature: "fixture-signature" }] : []),
        { type: "text", text: "Checking both files." },
        ...payload.tools.map((tool: { name: string }, index: number) => ({ type: "tool_use", id: `call-${index}`, name: tool.name, input: {} }))
      ] : blocks;
      return new Response(JSON.stringify({ id: "reply", type: "message", role: "assistant", model: "claude-sonnet-5", content: payloads.length === 1 ? blocks : [{ type: "text", text: "done" }], stop_reason: payloads.length === 1 ? "tool_use" : "end_turn", usage: { input_tokens: 1, output_tokens: 1 } }), { headers: { "content-type": "application/json" } });
    });
    const config = { id: "test", defaultModel: "claude-sonnet-5" };
    const auth = { providerId: "test", apiKey: "fixture-key" };
    const request = { ...baseRequest(), model: config.defaultModel, messages: [{ role: "user" as const, content: "read both files" }], tools: ["fs.read", "fs.write"].map(name => ({ name, description: "fixture", inputSchema: { type: "object" } })) };
    const first = await new AnthropicProviderAdapter(config).chat(request, auth);
    expect(first.output.metadata?.providerReplayJson).toBeDefined();
    await new AnthropicProviderAdapter(config).chat({ ...request, messages: [
      ...request.messages,
      { role: "assistant", content: "", toolCallId: "call-0", toolName: "fs.read", metadata: { ...JSON.parse(JSON.stringify(first.output.metadata)), toolArgumentsJson: "{}" } },
      { role: "tool", content: "first result", toolCallId: "call-0" },
      { role: "assistant", content: "", toolCallId: "call-1", toolName: "fs.write", metadata: { toolArgumentsJson: "{}" } },
      { role: "tool", content: "second failure", toolCallId: "call-1", metadata: { isError: "true" } }
    ] }, auth);
    expect(payloads[1].messages).toHaveLength(3);
    expect(payloads[1].messages[1]).toEqual({ role: "assistant", content: blocks });
    expect(payloads[1].messages[2]).toEqual({ role: "user", content: [
      { type: "tool_result", tool_use_id: "call-0", content: "first result", is_error: false },
      { type: "tool_result", tool_use_id: "call-1", content: "second failure", is_error: true }
    ] });
  });

  it("maps tool_use and tool_result blocks", async () => {
    let capturedPayload: Record<string, unknown> | undefined;
    const server = http.createServer(async (req, res) => {
      if (req.method === "POST" && (req.url === "/v1/messages" || req.url === "/messages")) {
        const chunks: Buffer[] = [];
        for await (const chunk of req) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }
        capturedPayload = JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
        res.writeHead(200, { "content-type": "application/json" });
        res.end(
          JSON.stringify({
            id: "anthropic-1",
            type: "message",
            role: "assistant",
            content: [
              {
                type: "tool_use",
                id: "tool-use-2",
                name: "exec.run",
                input: { command: "echo ok" }
              },
              {
                type: "text",
                text: ""
              }
            ],
            model: "claude-sonnet-4-6",
            stop_reason: "tool_use",
            usage: {
              input_tokens: 20,
              output_tokens: 8
            }
          })
        );
        return;
      }
      res.writeHead(404);
      res.end();
    });

    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("failed to bind test server");
    }

    const adapter = new AnthropicProviderAdapter({
      id: "anthropic-main",
      defaultModel: "claude-sonnet-4-6",
      baseUrl: `http://127.0.0.1:${address.port}`,
      thinkingBudgetTokens: 4096
    });

    const response = await adapter.chat(baseRequest(), {
      providerId: "anthropic-main",
      apiKey: "key"
    });

    expect(response.toolCalls).toEqual([
      {
        id: "tool-use-2",
        name: "exec.run",
        argumentsJson: "{\"command\":\"echo ok\"}"
      }
    ]);
    expect(response.output.metadata).toMatchObject({ providerReplayKind: "anthropic-content-blocks" });

    const tools = (capturedPayload?.tools as Array<any>) ?? [];
    const messages = (capturedPayload?.messages as Array<any>) ?? [];
    expect(capturedPayload?.system).toBe("system text");
    expect(capturedPayload?.thinking).toEqual({
      type: "enabled",
      budget_tokens: 4096
    });
    expect(tools[0]?.name).toMatch(/^[a-zA-Z0-9_-]{1,128}$/);
    expect(
      messages.some(
        (item) =>
          item.role === "assistant" &&
          Array.isArray(item.content) &&
          item.content[0]?.type === "tool_use"
      )
    ).toBe(true);
    expect(
      messages.some(
        (item) =>
          item.role === "user" &&
          Array.isArray(item.content) &&
          item.content[0]?.type === "tool_result"
      )
    ).toBe(true);

    server.close();
  });

  it("maps user image attachments into anthropic image blocks", async () => {
    let capturedPayload: Record<string, unknown> | undefined;
    const server = http.createServer(async (req, res) => {
      if (req.method === "POST" && (req.url === "/v1/messages" || req.url === "/messages")) {
        const chunks: Buffer[] = [];
        for await (const chunk of req) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }
        capturedPayload = JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
        res.writeHead(200, { "content-type": "application/json" });
        res.end(
          JSON.stringify({
            id: "anthropic-image-1",
            type: "message",
            role: "assistant",
            content: [{ type: "text", text: "image handled" }],
            model: "claude-sonnet-4-6",
            stop_reason: "end_turn",
            usage: {
              input_tokens: 20,
              output_tokens: 8
            }
          })
        );
        return;
      }
      res.writeHead(404);
      res.end();
    });

    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("failed to bind test server");
    }

    const imagePath = tempFile(
      "sample.png",
      Buffer.from("89504e470d0a1a0a0000000d4948445200000001000000010802000000907724de0000000a49444154789c6360000002000154a24f5d0000000049454e44ae426082", "hex")
    );

    const adapter = new AnthropicProviderAdapter({
      id: "anthropic-main",
      defaultModel: "claude-sonnet-4-6",
      baseUrl: `http://127.0.0.1:${address.port}`
    });

    await adapter.chat(
      {
        sessionId: "telegram:c1",
        model: "claude-sonnet-4-6",
        messages: [
          { role: "system", content: "system text" },
          {
            role: "user",
            content: "what is in this image?",
            attachments: [
              {
                id: "image-1",
                kind: "image",
                name: "sample.png",
                mimeType: "image/png",
                localPath: imagePath
              }
            ]
          }
        ],
        tools: [],
        metadata: {}
      },
      {
        providerId: "anthropic-main",
        apiKey: "key"
      }
    );

    const messages = (capturedPayload?.messages as Array<any>) ?? [];
    const userMessage = messages.find((item) => item.role === "user");
    expect(Array.isArray(userMessage?.content)).toBe(true);
    expect(userMessage?.content?.some((item: any) => item.type === "text")).toBe(true);
    expect(userMessage?.content?.some((item: any) => item.type === "image")).toBe(true);

    server.close();
  });

  it("stores replay metadata for thinking blocks and replays them without duplicating tool_use placeholders", async () => {
    let capturedPayloads: Array<Record<string, unknown>> = [];
    const server = http.createServer(async (req, res) => {
      if (req.method === "POST" && (req.url === "/v1/messages" || req.url === "/messages")) {
        const chunks: Buffer[] = [];
        for await (const chunk of req) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }
        capturedPayloads.push(JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>);
        res.writeHead(200, { "content-type": "application/json" });
        res.end(
          JSON.stringify({
            id: "anthropic-replay-1",
            type: "message",
            role: "assistant",
            content: [
              {
                type: "thinking",
                thinking: "step-by-step",
                signature: "sig-1"
              },
              {
                type: "tool_use",
                id: "tool-use-2",
                name: "exec.run",
                input: { command: "echo ok" }
              },
              {
                type: "text",
                text: ""
              }
            ],
            model: "claude-sonnet-4-6",
            stop_reason: "tool_use",
            usage: {
              input_tokens: 20,
              output_tokens: 8
            }
          })
        );
        return;
      }
      res.writeHead(404);
      res.end();
    });

    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("failed to bind test server");
    }

    const adapter = new AnthropicProviderAdapter({
      id: "anthropic-main",
      defaultModel: "claude-sonnet-4-6",
      baseUrl: `http://127.0.0.1:${address.port}`,
      thinkingBudgetTokens: 4096
    });

    const firstResponse = await adapter.chat(baseRequest(), {
      providerId: "anthropic-main",
      apiKey: "key"
    });

    expect(firstResponse.output.metadata).toMatchObject({
      providerReplayKind: "anthropic-content-blocks"
    });
    const replayJson = firstResponse.output.metadata?.providerReplayJson;
    expect(typeof replayJson).toBe("string");

    await adapter.chat(
      {
        ...baseRequest(),
        messages: [
          { role: "system", content: "system text" },
          { role: "user", content: "user text" },
          {
            role: "assistant",
            content: "",
            metadata: {
              providerReplayKind: "anthropic-content-blocks",
              providerReplayJson: replayJson!
            }
          },
          {
            role: "assistant",
            content: "",
            toolCallId: "tool-use-2",
            toolName: "exec.run",
            metadata: {
              toolArgumentsJson: "{\"command\":\"echo ok\"}"
            }
          },
          {
            role: "tool",
            content: "ok",
            toolCallId: "tool-use-2",
            metadata: {
              isError: "false"
            }
          }
        ]
      },
      {
        providerId: "anthropic-main",
        apiKey: "key"
      }
    );

    expect(capturedPayloads).toHaveLength(2);
    const secondMessages = (capturedPayloads[1]?.messages as Array<any>) ?? [];
    const assistantReplayMessages = secondMessages.filter((item) => item.role === "assistant");
    expect(assistantReplayMessages).toHaveLength(1);
    expect(assistantReplayMessages[0]?.content).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "thinking" }),
        expect.objectContaining({ type: "tool_use", id: "tool-use-2", name: expect.stringMatching(/^[a-zA-Z0-9_-]{1,128}$/) })
      ])
    );

    server.close();
  });
});
