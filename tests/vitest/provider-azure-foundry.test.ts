import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ChatRequest } from "../../packages/core-types/src/provider.js";

function encodedToolName(name: string): string {
  return `oa__${Buffer.from(name, "utf8").toString("base64url")}`;
}

function baseRequest(): ChatRequest {
  return {
    sessionId: "telegram:c1",
    model: "gpt-5-deployment",
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

const tempDirs = new Set<string>();

function tempFile(name: string, contents: Buffer): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "openassist-azure-foundry-provider-"));
  tempDirs.add(dir);
  const filePath = path.join(dir, name);
  fs.writeFileSync(filePath, contents);
  return filePath;
}

afterEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  for (const dir of tempDirs) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  tempDirs.clear();
});

async function loadAzureFoundryModule() {
  return import("../../packages/providers-azure-foundry/src/index.js");
}

describe("azure foundry provider", () => {
  it("derives Azure resource-style base URLs", async () => {
    const { deriveBaseUrl } = await loadAzureFoundryModule();
    expect(
      deriveBaseUrl({
        id: "azure-foundry-main",
        defaultModel: "gpt-5-deployment",
        authMode: "api-key",
        resourceName: "demo-resource",
        endpointFlavor: "openai-resource"
      })
    ).toBe("https://demo-resource.openai.azure.com/openai/v1");

    expect(
      deriveBaseUrl({
        id: "azure-foundry-main",
        defaultModel: "gpt-5-deployment",
        authMode: "entra",
        resourceName: "demo-resource",
        endpointFlavor: "foundry-resource"
      })
    ).toBe("https://demo-resource.services.ai.azure.com/openai/v1");

    expect(
      deriveBaseUrl({
        id: "azure-foundry-main",
        defaultModel: "gpt-5-deployment",
        authMode: "api-key",
        resourceName: "demo-resource",
        endpointFlavor: "openai-resource",
        baseUrl: "https://custom.example/openai/v1/"
      })
    ).toBe("https://custom.example/openai/v1");
  });

  it("uses Responses API with deployment name, mapped tools, and API-key auth", async () => {
    const { AzureFoundryProviderAdapter } = await loadAzureFoundryModule();
    const encodedFsRead = encodedToolName("fs.read");
    const encodedExecRun = encodedToolName("exec.run");
    let capturedPayload: Record<string, unknown> | undefined;
    let authorizationHeader: string | undefined;

    const server = http.createServer(async (req, res) => {
      if (req.method === "POST" && req.url === "/openai/v1/responses") {
        authorizationHeader = req.headers.authorization;
        const chunks: Buffer[] = [];
        for await (const chunk of req) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }
        capturedPayload = JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
        res.writeHead(200, { "content-type": "application/json" });
        res.end(
          JSON.stringify({
            id: "resp-azure-1",
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
              output_tokens: 5,
              total_tokens: 15
            }
          })
        );
        return;
      }

      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: { message: "not found" } }));
    });

    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("failed to bind test server");
    }

    const adapter = new AzureFoundryProviderAdapter({
      id: "azure-foundry-main",
      defaultModel: "gpt-5-deployment",
      authMode: "api-key",
      resourceName: "demo-resource",
      endpointFlavor: "openai-resource",
      underlyingModel: "gpt-5.4",
      reasoningEffort: "high",
      baseUrl: `http://127.0.0.1:${address.port}/openai/v1`
    });

    const response = await adapter.chat(baseRequest(), {
      providerId: "azure-foundry-main",
      apiKey: "test-key"
    });

    expect(response.toolCalls).toEqual([
      {
        id: "call-2",
        name: "exec.run",
        argumentsJson: "{\"command\":\"echo ok\"}"
      }
    ]);
    expect(authorizationHeader).toBe("Bearer test-key");
    expect(capturedPayload?.model).toBe("gpt-5-deployment");
    expect(capturedPayload?.reasoning).toEqual({ effort: "high" });
    const tools = (capturedPayload?.tools as Array<any>) ?? [];
    const input = (capturedPayload?.input as Array<any>) ?? [];
    expect(tools[0]?.name).toBe(encodedFsRead);
    expect(input.some((item) => item.type === "function_call_output" && item.call_id === "call-1")).toBe(
      true
    );

    server.close();
  });

  it("maps inbound image attachments into Responses multimodal input", async () => {
    const { AzureFoundryProviderAdapter } = await loadAzureFoundryModule();
    let capturedPayload: Record<string, unknown> | undefined;
    const server = http.createServer(async (req, res) => {
      if (req.method === "POST" && req.url === "/openai/v1/responses") {
        const chunks: Buffer[] = [];
        for await (const chunk of req) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }
        capturedPayload = JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
        res.writeHead(200, { "content-type": "application/json" });
        res.end(
          JSON.stringify({
            id: "resp-image-1",
            status: "completed",
            output_text: "image handled",
            output: [],
            usage: {
              input_tokens: 10,
              output_tokens: 5,
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

    const imagePath = tempFile(
      "sample.png",
      Buffer.from(
        "89504e470d0a1a0a0000000d4948445200000001000000010802000000907724de0000000a49444154789c6360000002000154a24f5d0000000049454e44ae426082",
        "hex"
      )
    );

    const adapter = new AzureFoundryProviderAdapter({
      id: "azure-foundry-main",
      defaultModel: "gpt-5-deployment",
      authMode: "api-key",
      resourceName: "demo-resource",
      endpointFlavor: "openai-resource",
      baseUrl: `http://127.0.0.1:${address.port}/openai/v1`
    });

    await adapter.chat(
      {
        sessionId: "telegram:c1",
        model: "gpt-5-deployment",
        messages: [
          { role: "system", content: "system" },
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
        providerId: "azure-foundry-main",
        apiKey: "test-key"
      }
    );

    const input = (capturedPayload?.input as Array<any>) ?? [];
    const userMessage = input.find((item) => item.type === "message" && item.role === "user");
    expect(Array.isArray(userMessage?.content)).toBe(true);
    expect(userMessage?.content?.some((item: any) => item.type === "input_text")).toBe(true);
    expect(userMessage?.content?.some((item: any) => item.type === "input_image")).toBe(true);

    server.close();
  });

  it("uses DefaultAzureCredential token provider for Entra auth", async () => {
    const { AZURE_FOUNDRY_SCOPE, AzureFoundryProviderAdapter } = await loadAzureFoundryModule();
    let authorizationHeader: string | undefined;
    const createCredential = vi.fn(() => ({ kind: "credential" } as any));
    const createTokenProvider = vi.fn(() => async () => "entra-token");

    const server = http.createServer(async (req, res) => {
      if (req.method === "POST" && req.url === "/openai/v1/responses") {
        authorizationHeader = req.headers.authorization;
        for await (const _chunk of req) {
          // consume request body
        }
        res.writeHead(200, { "content-type": "application/json" });
        res.end(
          JSON.stringify({
            id: "resp-entra-1",
            status: "completed",
            output_text: "ok",
            output: [],
            usage: {
              input_tokens: 8,
              output_tokens: 3,
              total_tokens: 11
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

    const adapter = new AzureFoundryProviderAdapter({
      id: "azure-foundry-main",
      defaultModel: "gpt-5-deployment",
      authMode: "entra",
      resourceName: "demo-resource",
      endpointFlavor: "foundry-resource",
      baseUrl: `http://127.0.0.1:${address.port}/openai/v1`
    }, {
      createCredential,
      createTokenProvider
    });

    await adapter.chat(baseRequest(), {
      providerId: "azure-foundry-main",
      kind: "entra"
    });

    expect(createCredential).toHaveBeenCalledTimes(1);
    expect(createTokenProvider).toHaveBeenCalledTimes(1);
    expect(createTokenProvider).toHaveBeenCalledWith(
      { kind: "credential" },
      AZURE_FOUNDRY_SCOPE
    );
    expect(authorizationHeader).toBe("Bearer entra-token");

    server.close();
  });

  it("sanitizes authentication failures", async () => {
    const { AzureFoundryProviderAdapter } = await loadAzureFoundryModule();
    const server = http.createServer(async (req, res) => {
      if (req.method === "POST" && req.url === "/openai/v1/responses") {
        for await (const _chunk of req) {
          // consume request body
        }
        res.writeHead(401, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: { message: "super-secret unauthorized detail" } }));
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

    const adapter = new AzureFoundryProviderAdapter({
      id: "azure-foundry-main",
      defaultModel: "gpt-5-deployment",
      authMode: "api-key",
      resourceName: "demo-resource",
      endpointFlavor: "openai-resource",
      baseUrl: `http://127.0.0.1:${address.port}/openai/v1`
    });

    await expect(
      adapter.chat(baseRequest(), {
        providerId: "azure-foundry-main",
        apiKey: "bad-key"
      })
    ).rejects.toThrow(/Azure Foundry authentication failed/);
    await expect(
      adapter.chat(baseRequest(), {
        providerId: "azure-foundry-main",
        apiKey: "bad-key"
      })
    ).rejects.not.toThrow(/super-secret unauthorized detail/);

    server.close();
  });

  it("sanitizes deployment and Responses API mismatch failures", async () => {
    const { AzureFoundryProviderAdapter } = await loadAzureFoundryModule();
    const server = http.createServer(async (req, res) => {
      if (req.method === "POST" && req.url === "/openai/v1/responses") {
        for await (const _chunk of req) {
          // consume request body
        }
        res.writeHead(400, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: { message: "model is not supported for responses" } }));
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

    const adapter = new AzureFoundryProviderAdapter({
      id: "azure-foundry-main",
      defaultModel: "gpt-5-deployment",
      authMode: "api-key",
      resourceName: "demo-resource",
      endpointFlavor: "openai-resource",
      baseUrl: `http://127.0.0.1:${address.port}/openai/v1`
    });

    await expect(
      adapter.chat(baseRequest(), {
        providerId: "azure-foundry-main",
        apiKey: "test-key"
      })
    ).rejects.toThrow(/Responses API-compatible model/);

    server.close();
  });
});
