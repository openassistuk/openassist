import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { ChatRequest } from "../../packages/core-types/src/provider.js";
import { AnthropicProviderAdapter } from "../../packages/providers-anthropic/src/index.js";

function baseRequest(): ChatRequest {
  return {
    sessionId: "telegram:c1",
    model: "claude-sonnet-4-5",
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

function tempFile(name: string, contents: Buffer): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "openassist-anthropic-provider-"));
  const filePath = path.join(dir, name);
  fs.writeFileSync(filePath, contents);
  return filePath;
}

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
            model: "claude-sonnet-4-5",
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
      defaultModel: "claude-sonnet-4-5",
      baseUrl: `http://127.0.0.1:${address.port}`
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

    const tools = (capturedPayload?.tools as Array<any>) ?? [];
    const messages = (capturedPayload?.messages as Array<any>) ?? [];
    expect(capturedPayload?.system).toBe("system text");
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
            model: "claude-sonnet-4-5",
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
      defaultModel: "claude-sonnet-4-5",
      baseUrl: `http://127.0.0.1:${address.port}`
    });

    await adapter.chat(
      {
        sessionId: "telegram:c1",
        model: "claude-sonnet-4-5",
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
});
