import http from "node:http";
import { describe, expect, it } from "vitest";
import type { ChatRequest } from "../../packages/core-types/src/provider.js";
import { OpenAIProviderAdapter } from "../../packages/providers-openai/src/index.js";

function encodedToolName(name: string): string {
  return `oa__${Buffer.from(name, "utf8").toString("base64url")}`;
}

function baseRequest(): ChatRequest {
  return {
    sessionId: "telegram:c1",
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: "system" },
      { role: "user", content: "user" },
      {
        role: "assistant",
        content: "",
        toolCallId: "call-1",
        toolName: "fs.read",
        metadata: {
          toolArgumentsJson: "{\"path\":\"/tmp/a.txt\"}"
        }
      },
      {
        role: "tool",
        content: "file content",
        toolCallId: "call-1"
      }
    ],
    tools: [
      {
        name: "fs.read",
        description: "read",
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

describe("openai provider tool mapping", () => {
  it("maps chat-completions tool calls for chat-capable models", async () => {
    const encodedFsRead = encodedToolName("fs.read");
    const encodedExecRun = encodedToolName("exec.run");
    let capturedPayload: Record<string, unknown> | undefined;
    const server = http.createServer(async (req, res) => {
      if (req.method === "POST" && req.url === "/v1/chat/completions") {
        const chunks: Buffer[] = [];
        for await (const chunk of req) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }
        capturedPayload = JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
        res.writeHead(200, { "content-type": "application/json" });
        res.end(
          JSON.stringify({
            id: "resp-1",
            choices: [
              {
                finish_reason: "tool_calls",
                message: {
                  content: "",
                  tool_calls: [
                    {
                      id: "call-2",
                      type: "function",
                      function: {
                        name: encodedExecRun,
                        arguments: "{\"command\":\"echo ok\"}"
                      }
                    }
                  ]
                }
              }
            ],
            usage: {
              prompt_tokens: 10,
              completion_tokens: 5,
              total_tokens: 15
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

    const adapter = new OpenAIProviderAdapter({
      id: "openai-main",
      defaultModel: "gpt-4o-mini",
      baseUrl: `http://127.0.0.1:${address.port}/v1`
    });

    const response = await adapter.chat(baseRequest(), {
      providerId: "openai-main",
      apiKey: "test-key"
    });

    expect(response.toolCalls).toEqual([
      {
        id: "call-2",
        name: "exec.run",
        argumentsJson: "{\"command\":\"echo ok\"}"
      }
    ]);
    const tools = (capturedPayload?.tools as Array<any>) ?? [];
    const messages = (capturedPayload?.messages as Array<any>) ?? [];
    expect(tools[0]?.function?.name).toBe(encodedFsRead);
    expect(tools[0]?.function?.name.includes(".")).toBe(false);
    expect(messages.some((item) => item.role === "tool" && item.tool_call_id === "call-1")).toBe(
      true
    );
    expect(
      messages.some(
        (item) =>
          item.role === "assistant" && Array.isArray(item.tool_calls) && item.tool_calls.length === 1
      )
    ).toBe(true);

    server.close();
  });

  it("routes GPT-5 class models through responses API and maps function_call output", async () => {
    const encodedFsRead = encodedToolName("fs.read");
    const encodedExecRun = encodedToolName("exec.run");
    let capturedResponsesPayload: Record<string, unknown> | undefined;
    const server = http.createServer(async (req, res) => {
      if (req.method === "POST" && req.url === "/v1/responses") {
        const chunks: Buffer[] = [];
        for await (const chunk of req) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }
        capturedResponsesPayload = JSON.parse(
          Buffer.concat(chunks).toString("utf8")
        ) as Record<string, unknown>;

        res.writeHead(200, { "content-type": "application/json" });
        res.end(
          JSON.stringify({
            id: "resp-responses-1",
            status: "completed",
            output_text: "",
            output: [
              {
                id: "fc-item-1",
                type: "function_call",
                call_id: "call-2",
                name: encodedExecRun,
                arguments: "{\"command\":\"echo ok\"}"
              }
            ],
            usage: {
              input_tokens: 10,
              input_tokens_details: {
                cached_tokens: 0
              },
              output_tokens: 5,
              output_tokens_details: {
                reasoning_tokens: 0
              },
              total_tokens: 15
            }
          })
        );
        return;
      }

      res.writeHead(404, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          error: {
            message:
              "This is not a chat model and thus not supported in the v1/chat/completions endpoint."
          }
        })
      );
    });

    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("failed to bind test server");
    }

    const adapter = new OpenAIProviderAdapter({
      id: "openai-main",
      defaultModel: "gpt-5.2",
      baseUrl: `http://127.0.0.1:${address.port}/v1`
    });

    const response = await adapter.chat(
      {
        ...baseRequest(),
        model: "gpt-5.2"
      },
      {
        providerId: "openai-main",
        apiKey: "test-key"
      }
    );

    expect(response.toolCalls).toEqual([
      {
        id: "call-2",
        name: "exec.run",
        argumentsJson: "{\"command\":\"echo ok\"}"
      }
    ]);

    const tools = (capturedResponsesPayload?.tools as Array<any>) ?? [];
    const input = (capturedResponsesPayload?.input as Array<any>) ?? [];
    expect(tools[0]?.name).toBe(encodedFsRead);
    expect(tools[0]?.name.includes(".")).toBe(false);
    expect(input.some((item) => item.type === "function_call_output" && item.call_id === "call-1")).toBe(
      true
    );
    expect(input.some((item) => item.type === "function_call" && item.call_id === "call-1")).toBe(
      true
    );

    server.close();
  });
});
