import OpenAI from "openai";
import { z } from "zod";
import type {
  ApiKeyAuth,
  ChatRequest,
  ChatResponse,
  OAuthCompleteContext,
  OAuthStartContext,
  OAuthStartResult,
  ProviderAdapter,
  ProviderAuthHandle,
  ProviderCapabilities,
  ValidationResult
} from "@openassist/core-types";
import {
  hasImageInputs,
  mapChatCompletionResponse,
  mapMessages,
  mapResponsesApiResponse,
  mapResponsesInput,
  mapResponsesTools,
  mapTools,
  shouldFallbackToResponses,
  shouldPreferResponsesApi
} from "@openassist/providers-openai-shared";

const CODEX_OAUTH_ISSUER = "https://auth.openai.com";
const CODEX_OAUTH_AUTHORIZE_URL = `${CODEX_OAUTH_ISSUER}/oauth/authorize`;
const CODEX_OAUTH_TOKEN_URL = `${CODEX_OAUTH_ISSUER}/oauth/token`;
const CODEX_CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";
const CODEX_ORIGINATOR = "codex_cli_rs";
const CODEX_SCOPES = [
  "openid",
  "profile",
  "email",
  "offline_access",
  "api.connectors.read",
  "api.connectors.invoke"
] as const;
const CODEX_REFRESH_INTERVAL_MS = 8 * 24 * 60 * 60 * 1000;

const configSchema = z.object({
  id: z.string().min(1),
  defaultModel: z.string().min(1),
  baseUrl: z.string().url().optional()
});

export interface CodexProviderConfig extends z.infer<typeof configSchema> {}

interface CodexTokenExchangeResponse {
  id_token?: string;
  access_token?: string;
  refresh_token?: string;
}

function supportsCodexRouteModel(model: string): boolean {
  const normalized = model.trim().toLowerCase();
  return normalized === "gpt-5.4" || normalized.includes("codex");
}

async function postForm<T>(
  url: string,
  payload: URLSearchParams
): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      accept: "application/json"
    },
    body: payload.toString()
  });

  const bodyText = await response.text();
  if (!response.ok) {
    throw new Error(
      `Codex auth request failed (${response.status} ${response.statusText}): ${bodyText.slice(0, 500)}`
    );
  }

  return JSON.parse(bodyText) as T;
}

async function exchangeCodeForTokens(
  code: string,
  redirectUri: string,
  codeVerifier: string
): Promise<CodexTokenExchangeResponse> {
  const payload = new URLSearchParams();
  payload.set("grant_type", "authorization_code");
  payload.set("code", code);
  payload.set("redirect_uri", redirectUri);
  payload.set("client_id", CODEX_CLIENT_ID);
  payload.set("code_verifier", codeVerifier);
  return postForm<CodexTokenExchangeResponse>(CODEX_OAUTH_TOKEN_URL, payload);
}

async function refreshTokens(refreshToken: string): Promise<CodexTokenExchangeResponse> {
  const payload = new URLSearchParams();
  payload.set("grant_type", "refresh_token");
  payload.set("refresh_token", refreshToken);
  payload.set("client_id", CODEX_CLIENT_ID);
  return postForm<CodexTokenExchangeResponse>(CODEX_OAUTH_TOKEN_URL, payload);
}

async function exchangeIdTokenForApiKey(idToken: string): Promise<string> {
  const payload = new URLSearchParams();
  payload.set("grant_type", "urn:ietf:params:oauth:grant-type:token-exchange");
  payload.set("client_id", CODEX_CLIENT_ID);
  payload.set("requested_token", "openai-api-key");
  payload.set("subject_token", idToken);
  payload.set("subject_token_type", "urn:ietf:params:oauth:token-type:id_token");
  const response = await postForm<{ access_token?: string }>(CODEX_OAUTH_TOKEN_URL, payload);
  if (!response.access_token) {
    throw new Error("Codex account login did not return an OpenAI API key");
  }
  return response.access_token;
}

function syntheticExpiresAt(): string {
  return new Date(Date.now() + CODEX_REFRESH_INTERVAL_MS).toISOString();
}

export class CodexProviderAdapter implements ProviderAdapter {
  private readonly config: CodexProviderConfig;

  constructor(config: CodexProviderConfig) {
    this.config = configSchema.parse(config);
  }

  id(): string {
    return this.config.id;
  }

  capabilities(): ProviderCapabilities {
    return {
      supportsStreaming: false,
      supportsTools: true,
      supportsOAuth: true,
      supportsApiKeys: false,
      supportsImageInputs: true
    };
  }

  async startOAuthLogin(ctx: OAuthStartContext): Promise<OAuthStartResult> {
    const authUrl = new URL(CODEX_OAUTH_AUTHORIZE_URL);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("client_id", CODEX_CLIENT_ID);
    authUrl.searchParams.set("redirect_uri", ctx.redirectUri);
    authUrl.searchParams.set("scope", CODEX_SCOPES.join(" "));
    authUrl.searchParams.set("code_challenge", ctx.codeChallenge ?? "");
    authUrl.searchParams.set("code_challenge_method", ctx.codeChallengeMethod ?? "S256");
    authUrl.searchParams.set("id_token_add_organizations", "true");
    authUrl.searchParams.set("codex_cli_simplified_flow", "true");
    authUrl.searchParams.set("originator", CODEX_ORIGINATOR);
    authUrl.searchParams.set("state", ctx.state);

    return {
      authorizationUrl: authUrl.toString(),
      state: ctx.state,
      expiresAt: new Date(Date.now() + 10 * 60_000).toISOString()
    };
  }

  async completeOAuthLogin(ctx: OAuthCompleteContext): Promise<ProviderAuthHandle> {
    const tokens = await exchangeCodeForTokens(
      ctx.code,
      ctx.redirectUri,
      ctx.codeVerifier ?? ""
    );
    if (!tokens.id_token || !tokens.refresh_token) {
      throw new Error("Codex login did not return the required id_token and refresh_token");
    }
    const apiKey = await exchangeIdTokenForApiKey(tokens.id_token);
    return {
      providerId: this.config.id,
      accountId: ctx.accountId,
      accessToken: apiKey,
      refreshToken: tokens.refresh_token,
      tokenType: "openai-api-key",
      scopes: [...CODEX_SCOPES],
      expiresAt: syntheticExpiresAt()
    };
  }

  async refreshOAuthAuth(auth: ProviderAuthHandle): Promise<ProviderAuthHandle> {
    if (!auth.refreshToken) {
      throw new Error("Codex login cannot refresh because no refresh token is stored");
    }
    const tokens = await refreshTokens(auth.refreshToken);
    if (!tokens.id_token) {
      throw new Error("Codex token refresh did not return an id_token");
    }
    const apiKey = await exchangeIdTokenForApiKey(tokens.id_token);
    return {
      providerId: this.config.id,
      accountId: auth.accountId,
      accessToken: apiKey,
      refreshToken: tokens.refresh_token ?? auth.refreshToken,
      tokenType: "openai-api-key",
      scopes: [...CODEX_SCOPES],
      expiresAt: syntheticExpiresAt()
    };
  }

  async validateConfig(config: unknown): Promise<ValidationResult> {
    const parsed = configSchema.safeParse(config);
    if (!parsed.success) {
      return {
        valid: false,
        errors: parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      };
    }

    if (!supportsCodexRouteModel(parsed.data.defaultModel)) {
      return {
        valid: false,
        errors: [
          `defaultModel '${parsed.data.defaultModel}' is not on the Codex route allow-list. Use gpt-5.4 or a Codex-family model.`
        ]
      };
    }

    return { valid: true, errors: [] };
  }

  async chat(req: ChatRequest, auth: ProviderAuthHandle | ApiKeyAuth): Promise<ChatResponse> {
    const apiKey = "apiKey" in auth ? auth.apiKey : auth.accessToken;
    if (!apiKey) {
      throw new Error("Codex provider requires a linked Codex account");
    }

    const client = new OpenAI({
      apiKey,
      baseURL: this.config.baseUrl
    });

    const model = req.model || this.config.defaultModel;
    const useResponsesApi = shouldPreferResponsesApi(model) || hasImageInputs(req.messages);

    if (useResponsesApi) {
      const response = await client.responses.create({
        model,
        temperature: req.temperature,
        max_output_tokens: req.maxTokens,
        input: (await mapResponsesInput(req.messages)) as any,
        tools: mapResponsesTools(req.tools) as any,
        metadata: req.metadata
      } as any);

      return mapResponsesApiResponse(response);
    }

    try {
      const completion = await client.chat.completions.create({
        model,
        temperature: req.temperature,
        max_tokens: req.maxTokens,
        messages: mapMessages(req.messages) as any,
        tools: mapTools(req.tools) as any
      } as any);

      return mapChatCompletionResponse(completion);
    } catch (error) {
      if (!shouldFallbackToResponses(error)) {
        throw error;
      }

      const response = await client.responses.create({
        model,
        temperature: req.temperature,
        max_output_tokens: req.maxTokens,
        input: (await mapResponsesInput(req.messages)) as any,
        tools: mapResponsesTools(req.tools) as any,
        metadata: req.metadata
      } as any);

      return mapResponsesApiResponse(response);
    }
  }
}
