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
});
