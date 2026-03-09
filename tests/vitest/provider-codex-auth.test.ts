import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CodexProviderAdapter } from "../../packages/providers-codex/src/index.js";

describe("codex provider auth flow", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("builds the official Codex authorization URL", async () => {
    const adapter = new CodexProviderAdapter({
      id: "codex-main",
      defaultModel: "gpt-5.4"
    });

    const started = await adapter.startOAuthLogin({
      accountId: "default",
      redirectUri: "http://127.0.0.1:3344/v1/oauth/codex-main/callback",
      state: "state-123",
      scopes: [],
      codeChallenge: "challenge-123",
      codeChallengeMethod: "S256"
    });

    const authorizationUrl = new URL(started.authorizationUrl);
    expect(`${authorizationUrl.origin}${authorizationUrl.pathname}`).toBe(
      "https://auth.openai.com/oauth/authorize"
    );
    expect(authorizationUrl.searchParams.get("client_id")).toBe("app_EMoamEEZ73f0CkXaXp7hrann");
    expect(authorizationUrl.searchParams.get("response_type")).toBe("code");
    expect(authorizationUrl.searchParams.get("code_challenge")).toBe("challenge-123");
    expect(authorizationUrl.searchParams.get("code_challenge_method")).toBe("S256");
    expect(authorizationUrl.searchParams.get("state")).toBe("state-123");
    expect(authorizationUrl.searchParams.get("originator")).toBe("codex_cli_rs");
    expect(authorizationUrl.searchParams.get("id_token_add_organizations")).toBe("true");
    expect(authorizationUrl.searchParams.get("codex_cli_simplified_flow")).toBe("true");
    expect(authorizationUrl.searchParams.get("scope")).toContain("offline_access");
    expect(authorizationUrl.searchParams.get("scope")).toContain("api.connectors.invoke");
  });

  it("exchanges authorization code for a refreshable OpenAI API key handle", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id_token: "id-token-1",
            access_token: "oauth-access-1",
            refresh_token: "refresh-token-1"
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" }
          }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            access_token: "openai-api-key-1"
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" }
          }
        )
      );
    vi.stubGlobal("fetch", fetchMock);

    const adapter = new CodexProviderAdapter({
      id: "codex-main",
      defaultModel: "gpt-5.4"
    });

    const handle = await adapter.completeOAuthLogin({
      accountId: "default",
      code: "auth-code-1",
      state: "state-123",
      redirectUri: "http://127.0.0.1:3344/v1/oauth/codex-main/callback",
      codeVerifier: "verifier-123"
    });

    expect(handle).toMatchObject({
      providerId: "codex-main",
      accountId: "default",
      accessToken: "openai-api-key-1",
      refreshToken: "refresh-token-1",
      tokenType: "openai-api-key"
    });
    expect(handle.expiresAt).toBeTruthy();

    const firstBody = new URLSearchParams(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe("https://auth.openai.com/oauth/token");
    expect(firstBody.get("grant_type")).toBe("authorization_code");
    expect(firstBody.get("code")).toBe("auth-code-1");
    expect(firstBody.get("code_verifier")).toBe("verifier-123");

    const secondBody = new URLSearchParams(String(fetchMock.mock.calls[1]?.[1]?.body));
    expect(String(fetchMock.mock.calls[1]?.[0])).toBe("https://auth.openai.com/oauth/token");
    expect(secondBody.get("grant_type")).toBe(
      "urn:ietf:params:oauth:grant-type:token-exchange"
    );
    expect(secondBody.get("requested_token")).toBe("openai-api-key");
    expect(secondBody.get("subject_token")).toBe("id-token-1");
  });

  it("refreshes Codex auth by re-exchanging the refreshed id_token", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id_token: "id-token-2",
            access_token: "oauth-access-2",
            refresh_token: "refresh-token-2"
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" }
          }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            access_token: "openai-api-key-2"
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" }
          }
        )
      );
    vi.stubGlobal("fetch", fetchMock);

    const adapter = new CodexProviderAdapter({
      id: "codex-main",
      defaultModel: "gpt-5.4"
    });

    const refreshed = await adapter.refreshOAuthAuth({
      providerId: "codex-main",
      accountId: "default",
      accessToken: "stale-api-key",
      refreshToken: "refresh-token-1",
      expiresAt: new Date(Date.now() - 60_000).toISOString()
    });

    expect(refreshed).toMatchObject({
      providerId: "codex-main",
      accountId: "default",
      accessToken: "openai-api-key-2",
      refreshToken: "refresh-token-2",
      tokenType: "openai-api-key"
    });

    const firstBody = new URLSearchParams(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(firstBody.get("grant_type")).toBe("refresh_token");
    expect(firstBody.get("refresh_token")).toBe("refresh-token-1");

    const secondBody = new URLSearchParams(String(fetchMock.mock.calls[1]?.[1]?.body));
    expect(secondBody.get("subject_token")).toBe("id-token-2");
  });

  it("rejects non-Codex default models on the Codex route", async () => {
    const adapter = new CodexProviderAdapter({
      id: "codex-main",
      defaultModel: "gpt-5.4"
    });

    await expect(
      adapter.validateConfig({
        id: "codex-main",
        defaultModel: "gpt-4o-mini"
      })
    ).resolves.toMatchObject({
      valid: false
    });
  });

  it("sends reasoning effort on supported Codex Responses-model requests", async () => {
    let capturedPayload: Record<string, unknown> | undefined;
    const server = http.createServer(async (req, res) => {
      if (req.method === "POST" && req.url === "/v1/responses") {
        const chunks: Buffer[] = [];
        for await (const chunk of req) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }
        capturedPayload = JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
        res.writeHead(200, { "content-type": "application/json" });
        res.end(
          JSON.stringify({
            id: "resp-1",
            status: "completed",
            output_text: "ok",
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

    const adapter = new CodexProviderAdapter({
      id: "codex-main",
      defaultModel: "gpt-5.4",
      baseUrl: `http://127.0.0.1:${address.port}/v1`,
      reasoningEffort: "high"
    });

    await adapter.chat(
      {
        sessionId: "telegram:c1",
        model: "gpt-5.4",
        messages: [{ role: "user", content: "hello" }],
        tools: [],
        metadata: {}
      },
      {
        providerId: "codex-main",
        accessToken: "openai-api-key"
      }
    );

    expect(capturedPayload?.reasoning).toEqual({ effort: "high" });
    server.close();
  });

  it("omits reasoning effort when Codex reasoning is unset", async () => {
    let capturedPayload: Record<string, unknown> | undefined;
    const server = http.createServer(async (req, res) => {
      if (req.method === "POST" && req.url === "/v1/responses") {
        const chunks: Buffer[] = [];
        for await (const chunk of req) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }
        capturedPayload = JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
        res.writeHead(200, { "content-type": "application/json" });
        res.end(
          JSON.stringify({
            id: "resp-2",
            status: "completed",
            output_text: "ok",
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

    const adapter = new CodexProviderAdapter({
      id: "codex-main",
      defaultModel: "gpt-5.4",
      baseUrl: `http://127.0.0.1:${address.port}/v1`
    });

    await adapter.chat(
      {
        sessionId: "telegram:c1",
        model: "gpt-5.4",
        messages: [{ role: "user", content: "hello" }],
        tools: [],
        metadata: {}
      },
      {
        providerId: "codex-main",
        accessToken: "openai-api-key"
      }
    );

    expect("reasoning" in (capturedPayload ?? {})).toBe(false);
    server.close();
  });

  it("omits reasoning effort on unsupported Codex models", async () => {
    let capturedPayload: Record<string, unknown> | undefined;
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "openassist-codex-reasoning-"));
    const imagePath = path.join(tempRoot, "sample.png");
    fs.writeFileSync(
      imagePath,
      Buffer.from(
        "89504e470d0a1a0a0000000d4948445200000001000000010802000000907724de0000000a49444154789c6360000002000154a24f5d0000000049454e44ae426082",
        "hex"
      )
    );
    const server = http.createServer(async (req, res) => {
      if (req.method === "POST" && req.url === "/v1/responses") {
        const chunks: Buffer[] = [];
        for await (const chunk of req) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }
        capturedPayload = JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
        res.writeHead(200, { "content-type": "application/json" });
        res.end(
          JSON.stringify({
            id: "resp-3",
            status: "completed",
            output_text: "ok",
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

    const adapter = new CodexProviderAdapter({
      id: "codex-main",
      defaultModel: "gpt-4o-mini",
      baseUrl: `http://127.0.0.1:${address.port}/v1`,
      reasoningEffort: "medium"
    });

    await adapter.chat(
      {
        sessionId: "telegram:c1",
        model: "gpt-5.4",
        messages: [{ role: "user", content: "hello" }],
        tools: [],
        metadata: {}
      },
      {
        providerId: "codex-main",
        accessToken: "openai-api-key"
      }
    );

    expect(capturedPayload?.reasoning).toEqual({ effort: "medium" });

    await adapter.chat(
      {
        sessionId: "telegram:c1",
        model: "gpt-4o-mini",
        messages: [
          {
            role: "user",
            content: "hello",
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
        providerId: "codex-main",
        accessToken: "openai-api-key"
      }
    );

    expect("reasoning" in (capturedPayload ?? {})).toBe(false);
    server.close();
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });
});
