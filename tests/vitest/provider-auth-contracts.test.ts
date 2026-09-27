import { afterEach, describe, expect, it, vi } from "vitest";
import { OpenAIProviderAdapter } from "../../packages/providers-openai/src/index.js";
import { AnthropicProviderAdapter } from "../../packages/providers-anthropic/src/index.js";
import { OpenAICompatibleProviderAdapter } from "../../packages/providers-openai-compatible/src/index.js";

const start = { accountId: "test-account", redirectUri: "http://localhost:1455/auth/callback", state: "test-state", scopes: ["read", "write"] };
const complete = { ...start, code: "test-code" };
const oauth = { authorizeUrl: "https://auth.example/authorize", tokenUrl: "https://auth.example/token", clientId: "test-client" };
const request = { sessionId: "test", model: "custom", messages: [], tools: [], metadata: {} };

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

describe.each([
  ["OpenAI", OpenAIProviderAdapter, "gpt-5.6-terra"],
  ["Anthropic", AnthropicProviderAdapter, "claude-sonnet-5"]
] as const)("%s authentication contracts", (_name, Adapter, defaultModel) => {
  const config = { id: "test-provider", defaultModel };

  it("reports capabilities and rejects invalid configuration or missing auth before network access", async () => {
    const adapter = new Adapter(config);
    const fetch = vi.spyOn(globalThis, "fetch");
    expect(adapter.id()).toBe(config.id);
    expect(adapter.capabilities()).toMatchObject({ supportsOAuth: false, supportsApiKeys: true, supportsImageInputs: true });
    expect((await adapter.validateConfig(config)).valid).toBe(true);
    expect((await adapter.validateConfig({ ...config, baseUrl: "invalid" })).errors[0]).toContain("baseUrl");
    await expect(adapter.startOAuthLogin(start)).rejects.toThrow("OAuth is not configured");
    await expect(adapter.completeOAuthLogin(complete)).rejects.toThrow("OAuth is not configured");
    for (const auth of [{ providerId: config.id, kind: "entra" as const }, { providerId: config.id, apiKey: "" }, { providerId: config.id, accountId: "a", accessToken: "" }]) {
      await expect(adapter.chat(request, auth)).rejects.toThrow("requires an API key or access token");
    }
    expect(fetch).not.toHaveBeenCalled();
  });

  it("preserves callback state, scopes, PKCE and configured login parameters", async () => {
    const adapter = new Adapter({ ...config, oauth: { ...oauth, extraAuthParams: { prompt: "consent" } } });
    expect(adapter.capabilities().supportsOAuth).toBe(true);
    const result = await adapter.startOAuthLogin({ ...start, codeChallenge: "test-challenge" });
    const params = new URL(result.authorizationUrl).searchParams;
    expect(Object.fromEntries(params)).toMatchObject({ response_type: "code", client_id: "test-client", redirect_uri: start.redirectUri, state: start.state, scope: "read write", code_challenge: "test-challenge", code_challenge_method: "S256", prompt: "consent" });
    expect(result.state).toBe(start.state);
    expect(Date.parse(result.expiresAt!)).toBeGreaterThan(Date.now());
    const plain = await new Adapter({ ...config, oauth }).startOAuthLogin(start);
    expect(new URL(plain.authorizationUrl).searchParams.has("code_challenge")).toBe(false);
  });

  it("exchanges credentials and retains refresh, expiry and scope metadata", async () => {
    vi.stubEnv("OPENASSIST_TEST_OAUTH_SECRET", "test-secret");
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ access_token: "test-access", refresh_token: "test-refresh", expires_in: 3600, scope: "read  write", token_type: "Bearer" })));
    const adapter = new Adapter({ ...config, oauth: { ...oauth, clientSecretEnv: "OPENASSIST_TEST_OAUTH_SECRET", audience: "test-audience", extraTokenParams: { resource: "test-resource" } } });
    const result = await adapter.completeOAuthLogin({ ...complete, codeVerifier: "test-verifier" });
    expect(result).toMatchObject({ providerId: config.id, accountId: start.accountId, accessToken: "test-access", refreshToken: "test-refresh", scopes: ["read", "write"], tokenType: "Bearer" });
    expect(Date.parse(result.expiresAt!)).toBeGreaterThan(Date.now());
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe(oauth.tokenUrl);
    expect(init?.method).toBe("POST");
    expect(Object.fromEntries(new URLSearchParams(String(init?.body)))).toEqual({ grant_type: "authorization_code", client_id: "test-client", code: complete.code, redirect_uri: start.redirectUri, code_verifier: "test-verifier", client_secret: "test-secret", audience: "test-audience", resource: "test-resource" });
  });

  it("accepts a minimal token response and omits unspecified parameters", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response('{"access_token":"test-access"}'));
    const result = await new Adapter({ ...config, oauth }).completeOAuthLogin(complete);
    expect(result.accessToken).toBe("test-access");
    expect(result.expiresAt).toBeUndefined();
    expect(result.scopes).toBeUndefined();
    const params = new URLSearchParams(String(fetch.mock.calls[0][1]?.body));
    expect(params.has("client_secret")).toBe(false);
    expect(params.has("code_verifier")).toBe(false);
  });

  it("fails before contacting the token endpoint when the client secret is missing", async () => {
    vi.stubEnv("OPENASSIST_TEST_OAUTH_SECRET", "");
    const fetch = vi.spyOn(globalThis, "fetch");
    await expect(new Adapter({ ...config, oauth: { ...oauth, clientSecretEnv: "OPENASSIST_TEST_OAUTH_SECRET" } }).completeOAuthLogin(complete)).rejects.toThrow("Missing OAuth client secret env var");
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([
    [401, 'echoed-test-secret', "HTTP 401"],
    [200, '{echoed-test-secret', "invalid JSON"],
    [200, 'null', "invalid token fields"],
    [200, '{"access_token":123}', "invalid token fields"],
    [200, '{"access_token":" "}', "invalid token fields"],
    [200, '{"access_token":"echoed-test-secret","scope":[]}', "invalid token fields"],
    [200, '{"access_token":"echoed-test-secret","expires_in":1e100}', "invalid token fields"]
  ])("sanitizes token failures (%s, %s)", async (status, body, message) => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(body, { status, statusText: "echoed-test-secret" }));
    const failure = await new Adapter({ ...config, oauth }).completeOAuthLogin(complete).catch(error => error);
    expect(failure).toBeInstanceOf(Error);
    expect(failure.message).toContain(message);
    expect(failure.message).not.toContain("echoed-test-secret");
  });
});

it("keeps custom endpoints text-only and validates endpoint/auth boundaries", async () => {
  const config = { id: "custom", defaultModel: "custom", baseUrl: "https://endpoint.example/v1" };
  const adapter = new OpenAICompatibleProviderAdapter(config);
  expect(adapter.id()).toBe(config.id);
  expect(adapter.capabilities()).toMatchObject({ supportsOAuth: false, supportsImageInputs: false });
  expect(await adapter.validateConfig(config)).toEqual({ valid: true, errors: [] });
  expect((await adapter.validateConfig({ ...config, baseUrl: "invalid" })).errors[0]).toContain("baseUrl");
  await expect(adapter.chat(request, { providerId: "custom", kind: "entra" })).rejects.toThrow("requires an API key or access token");
});

describe("Anthropic workspace and credential selection", () => {
  it("sends the configured workspace and isolates API keys from ambient bearer credentials", async () => {
    vi.stubEnv("ANTHROPIC_AUTH_TOKEN", "ambient-token-must-not-be-used");
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ id: "reply", content: [{ type: "text", text: "ok" }], usage: {} }), { headers: { "content-type": "application/json" } }));
    const adapter = new AnthropicProviderAdapter({ id: "test", defaultModel: "claude-sonnet-5", workspaceId: "wrkspc_test123" });
    await adapter.chat({ ...request, model: "claude-sonnet-5" }, { providerId: "test", apiKey: "explicit-key" });
    const headers = new Headers(fetch.mock.calls[0][1]?.headers);
    expect(headers.get("anthropic-workspace-id")).toBe("wrkspc_test123");
    expect(headers.get("x-api-key")).toBe("explicit-key");
    expect(headers.has("authorization")).toBe(false);
    expect((await adapter.validateConfig({ id: "test", defaultModel: "claude-sonnet-5", workspaceId: "bad\r\nheader" })).valid).toBe(false);
  });

  it("sends supplied OAuth access tokens as bearer tokens without an ambient API key", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "ambient-key-must-not-be-used");
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ id: "reply", content: [{ type: "text", text: "ok" }], usage: {} }), { headers: { "content-type": "application/json" } }));
    await new AnthropicProviderAdapter({ id: "test", defaultModel: "claude-sonnet-5" }).chat(
      { ...request, model: "claude-sonnet-5" }, { providerId: "test", accountId: "test", accessToken: "explicit-access-token" }
    );
    const headers = new Headers(fetch.mock.calls[0][1]?.headers);
    expect(headers.get("authorization")).toBe("Bearer explicit-access-token");
    expect(headers.has("x-api-key")).toBe(false);
    expect(headers.has("anthropic-workspace-id")).toBe(false);
  });
});
