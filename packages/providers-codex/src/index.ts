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
  reasoningPayload,
  shouldFallbackToResponses,
  shouldPreferResponsesApi
} from "@openassist/providers-openai-shared";

const CODEX_OAUTH_ISSUER = "https://auth.openai.com";
const CODEX_OAUTH_AUTHORIZE_URL = `${CODEX_OAUTH_ISSUER}/oauth/authorize`;
const CODEX_OAUTH_TOKEN_URL = `${CODEX_OAUTH_ISSUER}/oauth/token`;
const CODEX_CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";
const CODEX_ORIGINATOR = "codex_cli_rs";
const CODEX_DEFAULT_REDIRECT_URI = "http://localhost:1455/auth/callback";
const CODEX_SCOPES = [
  "openid",
  "profile",
  "email",
  "offline_access"
] as const;
const CODEX_REFRESH_INTERVAL_MS = 8 * 24 * 60 * 60 * 1000;

const configSchema = z.object({
  id: z.string().min(1),
  defaultModel: z.string().min(1),
  baseUrl: z.string().url().optional(),
  reasoningEffort: z.enum(["low", "medium", "high", "xhigh"]).optional()
});

export interface CodexProviderConfig extends z.infer<typeof configSchema> {}

export function defaultCodexOAuthRedirectUri(): string {
  return CODEX_DEFAULT_REDIRECT_URI;
}

interface CodexTokenExchangeResponse {
  id_token?: string;
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  error?: string;
  error_description?: string;
  request_id?: string;
  requestId?: string;
  message?: string;
}

class CodexOAuthError extends Error {
  readonly statusCode: 400 | 502;
  readonly operatorMessage: string;

  constructor(operatorMessage: string, statusCode: 400 | 502) {
    super(operatorMessage);
    this.name = "CodexOAuthError";
    this.operatorMessage = operatorMessage;
    this.statusCode = statusCode;
  }
}

function appendRequestId(message: string, requestId?: string): string {
  if (!requestId) {
    return message;
  }
  return `${message} Request ID: ${requestId}`;
}

function parseJsonBody(text: string): Record<string, unknown> | undefined {
  if (text.trim().length === 0) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(text) as unknown;
    return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : undefined;
  } catch {
    return undefined;
  }
}

function extractRequestId(
  headers: Headers,
  body: Record<string, unknown> | undefined
): string | undefined {
  const headerRequestId = headers.get("x-request-id") ?? headers.get("request-id");
  if (headerRequestId && headerRequestId.trim().length > 0) {
    return headerRequestId.trim();
  }
  const bodyRequestId = body?.request_id ?? body?.requestId;
  if (typeof bodyRequestId === "string" && bodyRequestId.trim().length > 0) {
    return bodyRequestId.trim();
  }
  return undefined;
}

function classifyUpstreamOAuthFailure(
  response: Response,
  body: Record<string, unknown> | undefined
): CodexOAuthError {
  const requestId = extractRequestId(response.headers, body);
  const errorCode =
    typeof body?.error === "string" && body.error.trim().length > 0
      ? body.error.trim().toLowerCase()
      : "";
  const errorDescription =
    typeof body?.error_description === "string" && body.error_description.trim().length > 0
      ? body.error_description.trim()
      : typeof body?.message === "string" && body.message.trim().length > 0
        ? body.message.trim()
        : "";
  const normalized = `${errorCode} ${errorDescription}`.toLowerCase();

  if (
    normalized.includes("redirect_uri") ||
    normalized.includes("redirect uri") ||
    normalized.includes("redirect mismatch")
  ) {
    return new CodexOAuthError(
      appendRequestId(
        "Codex account login redirect did not match the expected localhost callback.",
        requestId
      ),
      400
    );
  }

  if (
    errorCode === "invalid_grant" ||
    normalized.includes("expired") ||
    normalized.includes("authorization code") ||
    normalized.includes("code verifier") ||
    normalized.includes("code_verifier") ||
    normalized.includes("pkce")
  ) {
    return new CodexOAuthError(
      appendRequestId(
        "Codex account login code is invalid or expired. Start login again.",
        requestId
      ),
      400
    );
  }

  return new CodexOAuthError(
    appendRequestId("Codex account login token exchange failed upstream.", requestId),
    response.status >= 500 ? 502 : 400
  );
}

function normalizeTokenValue(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : undefined;
}

function resolveExpiresAt(
  expiresInSeconds: number | undefined,
  refreshToken: string | undefined
): string | undefined {
  if (typeof expiresInSeconds === "number" && Number.isFinite(expiresInSeconds) && expiresInSeconds > 0) {
    return new Date(Date.now() + expiresInSeconds * 1000).toISOString();
  }
  if (refreshToken) {
    return syntheticExpiresAt();
  }
  return undefined;
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
  const parsedBody = parseJsonBody(bodyText);
  if (!response.ok) {
    throw classifyUpstreamOAuthFailure(response, parsedBody);
  }

  if (parsedBody) {
    return parsedBody as T;
  }

  throw new CodexOAuthError(
    "Codex account login token exchange returned an invalid JSON response.",
    502
  );
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
    throw new CodexOAuthError(
      "Codex account login upstream response was missing the exchanged API key.",
      502
    );
  }
  return response.access_token;
}

function syntheticExpiresAt(): string {
  return new Date(Date.now() + CODEX_REFRESH_INTERVAL_MS).toISOString();
}

async function resolveCodexAccessToken(
  tokens: CodexTokenExchangeResponse
): Promise<Pick<ProviderAuthHandle, "accessToken" | "refreshToken" | "tokenType" | "expiresAt">> {
  const idToken = normalizeTokenValue(tokens.id_token);
  const accessToken = normalizeTokenValue(tokens.access_token);
  const refreshToken = normalizeTokenValue(tokens.refresh_token);

  if (idToken) {
    try {
      const apiKey = await exchangeIdTokenForApiKey(idToken);
      return {
        accessToken: apiKey,
        refreshToken,
        tokenType: "openai-api-key",
        expiresAt: resolveExpiresAt(tokens.expires_in, refreshToken)
      };
    } catch (error) {
      if (!accessToken) {
        throw error;
      }
    }
  }

  if (accessToken) {
    return {
      accessToken,
      refreshToken,
      tokenType: normalizeTokenValue(tokens.token_type) ?? "oauth-access-token",
      expiresAt: resolveExpiresAt(tokens.expires_in, refreshToken)
    };
  }

  throw new CodexOAuthError(
    "Codex account login did not return a usable access token.",
    502
  );
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
    const resolved = await resolveCodexAccessToken(tokens);
    return {
      providerId: this.config.id,
      accountId: ctx.accountId,
      accessToken: resolved.accessToken,
      refreshToken: resolved.refreshToken,
      tokenType: resolved.tokenType,
      scopes: [...CODEX_SCOPES],
      expiresAt: resolved.expiresAt
    };
  }

  async refreshOAuthAuth(auth: ProviderAuthHandle): Promise<ProviderAuthHandle> {
    if (!auth.refreshToken) {
      throw new Error("Codex login cannot refresh because no refresh token is stored");
    }
    const tokens = await refreshTokens(auth.refreshToken);
    const resolved = await resolveCodexAccessToken(tokens);
    const effectiveRefreshToken = resolved.refreshToken ?? auth.refreshToken;
    const effectiveExpiresAt =
      resolved.expiresAt ??
      (effectiveRefreshToken ? syntheticExpiresAt() : auth.expiresAt);
    return {
      providerId: this.config.id,
      accountId: auth.accountId,
      accessToken: resolved.accessToken,
      refreshToken: effectiveRefreshToken,
      tokenType: resolved.tokenType,
      scopes: [...CODEX_SCOPES],
      expiresAt: effectiveExpiresAt
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
        reasoning: reasoningPayload(model, this.config.reasoningEffort),
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
        reasoning: reasoningPayload(model, this.config.reasoningEffort),
        input: (await mapResponsesInput(req.messages)) as any,
        tools: mapResponsesTools(req.tools) as any,
        metadata: req.metadata
      } as any);

      return mapResponsesApiResponse(response);
    }
  }
}
