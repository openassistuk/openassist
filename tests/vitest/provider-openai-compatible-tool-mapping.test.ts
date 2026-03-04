import http from "node:http";
import { describe, expect, it } from "vitest";
import type { ChatRequest } from "../../packages/core-types/src/provider.js";
import { OpenAICompatibleProviderAdapter } from "../../packages/providers-openai-compatible/src/index.js";

function encodedToolName(name: string): string {
  return `oa__${Buffer.from(name, "utf8").toString("base64url")}`;
}

function baseRequest(): ChatRequest {
  return {
    sessionId: "telegram:c1",
    model: "custom-model",
    messages: [
      { role: "system", content: "system" },
      { role: "user", content: "user" }
    ],
    tools: [
      {
        name: "pkg.install",
        description: "install",
        inputSchema: {
          type: "object",
          properties: {
            packages: {
              type: "array",
              items: { type: "string" }
            }
          }
        }
      }
    ],
    metadata: {}
  };
}

describe("openai-compatible provider tool mapping", () => {
  it("passes tools and maps provider tool-calls", async () => {
    const encodedPkgInstall = encodedToolName("pkg.install");
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
            id: "compat-1",
            choices: [
              {
                finish_reason: "tool_calls",
                message: {
                  content: "",
                  tool_calls: [
                    {
                      id: "call-compat-1",
                      type: "function",
                      function: {
                        name: encodedPkgInstall,
                        arguments: "{\"packages\":[\"curl\"]}"
                      }
                    }
                  ]
                }
              }
            ],
            usage: {
              prompt_tokens: 7,
              completion_tokens: 3,
              total_tokens: 10
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

    const adapter = new OpenAICompatibleProviderAdapter({
      id: "custom-main",
      baseUrl: `http://127.0.0.1:${address.port}/v1`,
      defaultModel: "custom-model"
    });

    const response = await adapter.chat(baseRequest(), {
      providerId: "custom-main",
      apiKey: "key"
    });

    expect(response.toolCalls).toEqual([
      {
        id: "call-compat-1",
        name: "pkg.install",
        argumentsJson: "{\"packages\":[\"curl\"]}"
      }
    ]);
    const tools = (capturedPayload?.tools as Array<any>) ?? [];
    expect(tools[0]?.function?.name).toBe(encodedPkgInstall);
    expect(tools[0]?.function?.name.includes(".")).toBe(false);

    server.close();
  });
});
