import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { ChatRequest } from "../../packages/core-types/src/provider.js";
import { AnthropicProviderAdapter } from "../../packages/providers-anthropic/src/index.js";

function baseRequest(): ChatRequest {
  return {
    sessionId: "telegram:c1",
    model: "claude-sonnet-4-20250514",
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
  for (const dir of tempDirs) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  tempDirs.clear();
});

describe("anthropic provider tool mapping", () => {
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
            model: "claude-sonnet-4-20250514",
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
      defaultModel: "claude-sonnet-4-20250514",
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
    expect(response.output.metadata).toBeUndefined();

    const tools = (capturedPayload?.tools as Array<any>) ?? [];
    const messages = (capturedPayload?.messages as Array<any>) ?? [];
    expect(capturedPayload?.system).toBe("system text");
    expect(capturedPayload?.thinking).toEqual({
      type: "enabled",
      budget_tokens: 4096
    });
    expect(tools[0]?.name).toBe("fs.read");
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
            model: "claude-sonnet-4-20250514",
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
      defaultModel: "claude-sonnet-4-20250514",
      baseUrl: `http://127.0.0.1:${address.port}`
    });

    await adapter.chat(
      {
        sessionId: "telegram:c1",
        model: "claude-sonnet-4-20250514",
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
            model: "claude-sonnet-4-20250514",
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
      defaultModel: "claude-sonnet-4-20250514",
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
        expect.objectContaining({ type: "tool_use", id: "tool-use-2", name: "exec.run" })
      ])
    );

    server.close();
  });
});
