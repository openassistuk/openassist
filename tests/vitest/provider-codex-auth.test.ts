import { afterEach, describe, expect, it, vi } from "vitest";
import { CodexProviderAdapter } from "../../packages/providers-codex/src/index.js";

function jsonResponse(
  status: number,
  body: Record<string, unknown>,
  headers: Record<string, string> = {}
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      ...headers
    }
  });
}

describe("codex provider auth", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("includes the current upstream Codex scopes in the browser login URL", async () => {
    const adapter = new CodexProviderAdapter({
      id: "codex-main",
      defaultModel: "gpt-5.4"
    });

    const start = await adapter.startOAuthLogin({
      accountId: "default",
      redirectUri: "http://localhost:1455/auth/callback",
      state: "state-1",
      scopes: [],
      codeChallenge: "challenge-1",
      codeChallengeMethod: "S256"
    });

    const url = new URL(start.authorizationUrl);
    expect(url.origin + url.pathname).toBe("https://auth.openai.com/oauth/authorize");
    expect(url.searchParams.get("redirect_uri")).toBe("http://localhost:1455/auth/callback");
    expect(url.searchParams.get("scope")).toBe(
      "openid profile email offline_access api.connectors.read api.connectors.invoke"
    );
  });

  it("completes callback login into chatgpt token auth without requiring API-key exchange", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      jsonResponse(200, {
        access_token: "access-token-1",
        refresh_token: "refresh-token-1",
        expires_in: 3600
      })
    );

    const adapter = new CodexProviderAdapter({
      id: "codex-main",
      defaultModel: "gpt-5.4"
    });

    const handle = await adapter.completeOAuthLogin({
      accountId: "default",
      code: "auth-code-1",
      state: "state-1",
      redirectUri: "http://localhost:1455/auth/callback",
      codeVerifier: "verifier-1"
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(handle).toMatchObject({
      providerId: "codex-main",
      accountId: "default",
      accessToken: "access-token-1",
      refreshToken: "refresh-token-1",
      tokenType: "chatgpt-access-token",
      authMethod: "callback"
    });
    expect(handle.expiresAt).toBeTruthy();
  });

  it("refreshes Codex auth without requiring a fresh API-key exchange", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      jsonResponse(200, {
        access_token: "access-token-2",
        expires_in: 7200
      })
    );

    const adapter = new CodexProviderAdapter({
      id: "codex-main",
      defaultModel: "gpt-5.4"
    });

    const refreshed = await adapter.refreshOAuthAuth({
      providerId: "codex-main",
      accountId: "default",
      accessToken: "access-token-1",
      refreshToken: "refresh-token-1",
      tokenType: "chatgpt-access-token",
      authMethod: "callback",
      expiresAt: "2026-03-10T00:00:00.000Z"
    });

    expect(refreshed).toMatchObject({
      accessToken: "access-token-2",
      refreshToken: "refresh-token-1",
      tokenType: "chatgpt-access-token",
      authMethod: "callback"
    });
    expect(refreshed.expiresAt).toBeTruthy();
  });

  it("fails completion when the upstream token response has no usable access token", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      jsonResponse(200, {
        refresh_token: "refresh-token-1",
        expires_in: 3600
      })
    );

    const adapter = new CodexProviderAdapter({
      id: "codex-main",
      defaultModel: "gpt-5.4"
    });

    await expect(
      adapter.completeOAuthLogin({
        accountId: "default",
        code: "auth-code-1",
        state: "state-1",
        redirectUri: "http://localhost:1455/auth/callback",
        codeVerifier: "verifier-1"
      })
    ).rejects.toThrow(/did not return the access token required for Codex chat/);
  });

  it("surfaces upstream request ids for token exchange failures", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      jsonResponse(
        400,
        {
          error: "invalid_grant",
          error_description: "authorization code expired",
          request_id: "req-codex-1"
        },
        { "x-request-id": "req-codex-1" }
      )
    );

    const adapter = new CodexProviderAdapter({
      id: "codex-main",
      defaultModel: "gpt-5.4"
    });

    await expect(
      adapter.completeOAuthLogin({
        accountId: "default",
        code: "auth-code-1",
        state: "state-1",
        redirectUri: "http://localhost:1455/auth/callback",
        codeVerifier: "verifier-1"
      })
    ).rejects.toThrow(/Request ID: req-codex-1/);
  });

  it("supports device-code login for headless Codex setup", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        jsonResponse(200, {
          device_auth_id: "device-auth-1",
          user_code: "ABCD-EFGH",
          interval: 1
        })
      )
      .mockResolvedValueOnce(
        jsonResponse(401, {
          error: "authorization_pending"
        })
      )
      .mockResolvedValueOnce(
        jsonResponse(200, {
          authorization_code: "device-auth-code-1",
          code_verifier: "device-verifier-1"
        })
      )
      .mockResolvedValueOnce(
        jsonResponse(200, {
          access_token: "device-access-token-1",
          refresh_token: "device-refresh-token-1",
          expires_in: 3600
        })
      );

    const adapter = new CodexProviderAdapter({
      id: "codex-main",
      defaultModel: "gpt-5.4"
    });

    const start = await adapter.startOAuthDeviceCodeLogin({
      accountId: "default",
      scopes: []
    });
    expect(start).toMatchObject({
      verificationUri: "https://auth.openai.com/codex/device",
      userCode: "ABCD-EFGH",
      deviceCodeId: "device-auth-1",
      intervalSeconds: 1
    });

    const handle = await adapter.completeOAuthDeviceCodeLogin({
      accountId: "default",
      deviceCodeId: start.deviceCodeId,
      userCode: start.userCode,
      intervalSeconds: start.intervalSeconds,
      expiresAt: start.expiresAt
    });

    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(handle).toMatchObject({
      providerId: "codex-main",
      accountId: "default",
      accessToken: "device-access-token-1",
      refreshToken: "device-refresh-token-1",
      tokenType: "chatgpt-access-token",
      authMethod: "device-code"
    });
  });

  it("classifies device-code polling timeouts cleanly", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      jsonResponse(
        401,
        {
          error: "authorization_pending",
          request_id: "req-device-timeout-1"
        },
        { "x-request-id": "req-device-timeout-1" }
      )
    );

    const adapter = new CodexProviderAdapter({
      id: "codex-main",
      defaultModel: "gpt-5.4"
    });

    await expect(
      adapter.completeOAuthDeviceCodeLogin({
        accountId: "default",
        deviceCodeId: "device-auth-1",
        userCode: "ABCD-EFGH",
        intervalSeconds: 1,
        expiresAt: new Date(Date.now() - 1000).toISOString()
      })
    ).rejects.toThrow(/timed out before approval completed/);
  });

  it("sends Codex responses requests with session and account headers", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      jsonResponse(200, {
        id: "resp-codex-1",
        status: "completed",
        output_text: "codex ok",
        output: [],
        usage: {
          input_tokens: 10,
          output_tokens: 5,
          total_tokens: 15
        }
      })
    );

    const adapter = new CodexProviderAdapter({
      id: "codex-main",
      defaultModel: "gpt-5.4"
    });

    const response = await adapter.chat(
      {
        sessionId: "telegram-main:27328245",
        model: "gpt-5.4",
        messages: [{ role: "user", content: "hello codex" }],
        tools: [],
        metadata: { source: "test-suite" }
      },
      {
        providerId: "codex-main",
        accountId: "default",
        accessToken: "chatgpt-access-token-1",
        tokenType: "chatgpt-access-token",
        scopes: ["chatgpt-account:acct-123"]
      }
    );

    expect(response.output.content).toBe("codex ok");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://chatgpt.com/backend-api/codex/responses");
    expect((init as RequestInit).method).toBe("POST");
    expect((init as RequestInit).headers).toMatchObject({
      authorization: "Bearer chatgpt-access-token-1",
      "ChatGPT-Account-ID": "acct-123",
      session_id: "telegram-main:27328245"
    });
  });

  it("surfaces blank-body Codex upstream request failures with status and request ids", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("", {
        status: 401,
        headers: {
          "x-request-id": "req-codex-chat-1"
        }
      })
    );

    const adapter = new CodexProviderAdapter({
      id: "codex-main",
      defaultModel: "gpt-5.4"
    });

    await expect(
      adapter.chat(
        {
          sessionId: "telegram-main:27328245",
          model: "gpt-5.4",
          messages: [{ role: "user", content: "hello codex" }],
          tools: [],
          metadata: {}
        },
        {
          providerId: "codex-main",
          accountId: "default",
          accessToken: "chatgpt-access-token-1",
          tokenType: "chatgpt-access-token"
        }
      )
    ).rejects.toMatchObject({
      message:
        "Codex upstream request failed with HTTP 401 before returning a response body. Request ID: req-codex-chat-1",
      status: 401,
      statusCode: 401
    });
  });
});
