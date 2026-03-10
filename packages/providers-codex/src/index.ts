import { z } from "zod";
import type {
  ApiKeyAuth,
  ChatRequest,
  ChatResponse,
  OAuthCompleteContext,
  OAuthDeviceCodeCompleteContext,
  OAuthDeviceCodeStartContext,
  OAuthDeviceCodeStartResult,
  OAuthStartContext,
  OAuthStartResult,
  ProviderAdapter,
  ProviderAuthHandle,
  ProviderCapabilities,
  ValidationResult
} from "@openassist/core-types";
import {
  mapResponsesApiResponse,
  mapResponsesInput,
  mapResponsesTools,
  reasoningPayload
} from "@openassist/providers-openai-shared";
import { CODEX_BASELINE_INSTRUCTIONS } from "./baseline-instructions.js";

const CODEX_OAUTH_ISSUER = "https://auth.openai.com";
const CODEX_OAUTH_AUTHORIZE_URL = `${CODEX_OAUTH_ISSUER}/oauth/authorize`;
const CODEX_OAUTH_TOKEN_URL = `${CODEX_OAUTH_ISSUER}/oauth/token`;
const CODEX_DEVICE_AUTH_BASE = `${CODEX_OAUTH_ISSUER}/api/accounts/deviceauth`;
const CODEX_DEVICE_CODE_URL = `${CODEX_DEVICE_AUTH_BASE}/usercode`;
const CODEX_DEVICE_CODE_POLL_URL = `${CODEX_DEVICE_AUTH_BASE}/token`;
const CODEX_DEVICE_CODE_VERIFICATION_URL = `${CODEX_OAUTH_ISSUER}/codex/device`;
const CODEX_DEVICE_CODE_REDIRECT_URI = `${CODEX_OAUTH_ISSUER}/deviceauth/callback`;
const CODEX_CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";
const CODEX_ORIGINATOR = "codex_cli_rs";
const CODEX_DEFAULT_REDIRECT_URI = "http://localhost:1455/auth/callback";
const CODEX_DEFAULT_BASE_URL = "https://chatgpt.com/backend-api/codex";
const CODEX_SCOPES = [
  "openid",
  "profile",
  "email",
  "offline_access",
  "api.connectors.read",
  "api.connectors.invoke"
] as const;

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
  [key: string]: unknown;
  id_token?: string;
  access_token?: string;
  refresh_token?: string;
  expires_in?: number | string;
  token_type?: string;
  error?: string;
  error_description?: string;
  request_id?: string;
  requestId?: string;
  message?: string;
}

interface CodexDeviceCodeStartResponse {
  [key: string]: unknown;
  device_auth_id?: string;
  user_code?: string;
  usercode?: string;
  interval?: number | string;
  request_id?: string;
  requestId?: string;
  error?: string;
  error_description?: string;
  message?: string;
}

interface CodexDeviceCodePollResponse {
  [key: string]: unknown;
  authorization_code?: string;
  code_challenge?: string;
  code_verifier?: string;
  request_id?: string;
  requestId?: string;
  error?: string;
  error_description?: string;
  message?: string;
}

interface ChatGptTokenClaims {
  chatgptAccountId?: string;
  chatgptUserId?: string;
  chatgptPlanType?: string;
}

class CodexOAuthError extends Error {
  readonly statusCode: number;
  readonly status: number;
  readonly operatorMessage: string;

  constructor(operatorMessage: string, statusCode: number) {
    super(operatorMessage);
    this.name = "CodexOAuthError";
    this.operatorMessage = operatorMessage;
    this.statusCode = statusCode;
    this.status = statusCode;
  }
}

class CodexUpstreamChatError extends Error {
  readonly statusCode: number;
  readonly status: number;
  readonly operatorMessage: string;

  constructor(operatorMessage: string, statusCode: number) {
    super(operatorMessage);
    this.name = "CodexUpstreamChatError";
    this.operatorMessage = operatorMessage;
    this.statusCode = statusCode;
    this.status = statusCode;
  }
}

function appendRequestId(message: string, requestId?: string): string {
  if (!requestId) {
    return message;
  }
  return `${message} Request ID: ${requestId}`;
}

function parseJsonBody<T extends Record<string, unknown>>(text: string): T | undefined {
  if (text.trim().length === 0) {
    return undefined;
  }
  try {
    const parsed = JSON.parse(text) as unknown;
    return typeof parsed === "object" && parsed !== null ? (parsed as T) : undefined;
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
  body: Record<string, unknown> | undefined,
  fallbackMessage = "Codex account login token exchange failed upstream."
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
        "Codex account login redirect did not match the expected callback.",
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
    appendRequestId(fallbackMessage, requestId),
    response.status >= 500 ? 502 : 400
  );
}

function classifyUpstreamCodexChatFailure(
  response: Response,
  body: Record<string, unknown> | undefined
): CodexUpstreamChatError {
  const requestId = extractRequestId(response.headers, body);
  const bodyMessage = extractUpstreamChatFailureMessage(body);

  if (bodyMessage) {
    return new CodexUpstreamChatError(
      appendRequestId(
        `Codex upstream request failed (HTTP ${response.status}): ${bodyMessage}.`,
        requestId
      ),
      response.status
    );
  }

  return new CodexUpstreamChatError(
    appendRequestId(
      `Codex upstream request failed with HTTP ${response.status} before returning a response body.`,
      requestId
    ),
    response.status
  );
}

function extractUpstreamChatFailureMessage(
  body: Record<string, unknown> | undefined
): string | undefined {
  if (!body) {
    return undefined;
  }

  const directFields = ["detail", "message", "error"] as const;
  for (const field of directFields) {
    const value = body[field];
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
    if (Array.isArray(value)) {
      const text = value
        .filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
        .map((entry) => entry.trim())
        .join("; ");
      if (text.length > 0) {
        return text;
      }
    }
    if (value && typeof value === "object") {
      const nested = value as Record<string, unknown>;
      const nestedMessage =
        (typeof nested.message === "string" && nested.message.trim()) ||
        (typeof nested.detail === "string" && nested.detail.trim()) ||
        (typeof nested.error === "string" && nested.error.trim());
      if (nestedMessage) {
        return nestedMessage;
      }
    }
  }

  return undefined;
}

function normalizeTokenValue(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : undefined;
}

function parseExpiresInSeconds(value: number | string | undefined): number | undefined {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number.parseInt(value.trim(), 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return undefined;
}

function resolveExpiresAt(
  expiresInSeconds: number | string | undefined,
  refreshToken: string | undefined,
  fallbackExpiresAt?: string
): string | undefined {
  const parsedSeconds = parseExpiresInSeconds(expiresInSeconds);
  if (typeof parsedSeconds === "number") {
    return new Date(Date.now() + parsedSeconds * 1000).toISOString();
  }
  if (refreshToken) {
    return fallbackExpiresAt;
  }
  return fallbackExpiresAt;
}

function supportsCodexRouteModel(model: string): boolean {
  const normalized = model.trim().toLowerCase();
  return normalized === "gpt-5.4" || normalized.includes("codex");
}

async function postForm<T extends Record<string, unknown>>(
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
  const parsedBody = parseJsonBody<T>(bodyText);
  if (!response.ok) {
    throw classifyUpstreamOAuthFailure(response, parsedBody);
  }

  if (parsedBody) {
    return parsedBody;
  }

  throw new CodexOAuthError(
    "Codex account login token exchange returned an invalid JSON response.",
    502
  );
}

async function postJson<T extends Record<string, unknown>, TBody extends Record<string, unknown>>(
  url: string,
  payload: TBody,
  failureMessage: string
): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json"
    },
    body: JSON.stringify(payload)
  });

  const bodyText = await response.text();
  const parsedBody = parseJsonBody<T>(bodyText);
  if (!response.ok) {
    throw classifyUpstreamOAuthFailure(response, parsedBody, failureMessage);
  }
  if (parsedBody) {
    return parsedBody;
  }
  throw new CodexOAuthError(`${failureMessage} Upstream returned invalid JSON.`, 502);
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

function parseJwtClaims(jwt: string): ChatGptTokenClaims {
  const parts = jwt.split(".");
  if (parts.length < 2 || !parts[1]) {
    return {};
  }
  try {
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as Record<
      string,
      unknown
    >;
    const auth = (payload["https://api.openai.com/auth"] as Record<string, unknown> | undefined) ?? {};
    const directUserId =
      typeof auth.chatgpt_user_id === "string"
        ? auth.chatgpt_user_id
        : typeof auth.user_id === "string"
          ? auth.user_id
          : undefined;
    const directAccountId =
      typeof auth.chatgpt_account_id === "string" ? auth.chatgpt_account_id : undefined;
    const directPlan =
      typeof auth.chatgpt_plan_type === "string" ? auth.chatgpt_plan_type : undefined;
    return {
      chatgptAccountId: directAccountId,
      chatgptUserId: directUserId,
      chatgptPlanType: directPlan
    };
  } catch {
    return {};
  }
}

function encodeClaimsMetadata(claims: ChatGptTokenClaims): string[] | undefined {
  const metadata: string[] = [];
  if (claims.chatgptAccountId) {
    metadata.push(`chatgpt-account:${claims.chatgptAccountId}`);
  }
  if (claims.chatgptUserId) {
    metadata.push(`chatgpt-user:${claims.chatgptUserId}`);
  }
  if (claims.chatgptPlanType) {
    metadata.push(`chatgpt-plan:${claims.chatgptPlanType}`);
  }
  return metadata.length > 0 ? metadata : undefined;
}

function decodeClaimsMetadata(scopes: string[] | undefined): ChatGptTokenClaims {
  const claims: ChatGptTokenClaims = {};
  for (const scope of scopes ?? []) {
    if (scope.startsWith("chatgpt-account:")) {
      claims.chatgptAccountId = scope.slice("chatgpt-account:".length);
    } else if (scope.startsWith("chatgpt-user:")) {
      claims.chatgptUserId = scope.slice("chatgpt-user:".length);
    } else if (scope.startsWith("chatgpt-plan:")) {
      claims.chatgptPlanType = scope.slice("chatgpt-plan:".length);
    }
  }
  return claims;
}

function buildCodexAuthHandle(
  providerId: string,
  accountId: string,
  tokens: CodexTokenExchangeResponse,
  authMethod: ProviderAuthHandle["authMethod"],
  previous?: ProviderAuthHandle
): ProviderAuthHandle {
  const accessToken = normalizeTokenValue(tokens.access_token);
  if (!accessToken) {
    throw new CodexOAuthError(
      "Codex account login did not return the access token required for Codex chat.",
      502
    );
  }

  const refreshToken = normalizeTokenValue(tokens.refresh_token) ?? previous?.refreshToken;
  const claims = {
    ...decodeClaimsMetadata(previous?.scopes),
    ...parseJwtClaims(accessToken),
    ...(() => {
      const idToken = normalizeTokenValue(tokens.id_token);
      return idToken ? parseJwtClaims(idToken) : {};
    })()
  };
  const metadataScopes = encodeClaimsMetadata(claims);

  return {
    providerId,
    accountId,
    accessToken,
    ...(refreshToken ? { refreshToken } : {}),
    tokenType: "chatgpt-access-token",
    authMethod,
    expiresAt: resolveExpiresAt(tokens.expires_in, refreshToken, previous?.expiresAt),
    scopes: metadataScopes
  };
}

async function requestDeviceCode(
  accountId: string
): Promise<OAuthDeviceCodeStartResult & { accountId: string }> {
  const response = await postJson<CodexDeviceCodeStartResponse, { client_id: string }>(
    CODEX_DEVICE_CODE_URL,
    { client_id: CODEX_CLIENT_ID },
    "Codex device-code login start failed upstream."
  );
  const deviceCodeId = normalizeTokenValue(response.device_auth_id);
  const userCode = normalizeTokenValue(response.user_code ?? response.usercode);
  const intervalSeconds = parseExpiresInSeconds(response.interval) ?? 5;
  if (!deviceCodeId || !userCode) {
    throw new CodexOAuthError(
      "Codex device-code login start returned an incomplete upstream response.",
      502
    );
  }

  return {
    accountId,
    verificationUri: CODEX_DEVICE_CODE_VERIFICATION_URL,
    userCode,
    deviceCodeId,
    intervalSeconds,
    expiresAt: new Date(Date.now() + 15 * 60_000).toISOString()
  };
}

async function pollDeviceCode(
  deviceCodeId: string,
  userCode: string,
  intervalSeconds: number,
  expiresAt?: string
): Promise<CodexDeviceCodePollResponse> {
  const expiresAtMs = expiresAt ? new Date(expiresAt).getTime() : Date.now() + 15 * 60_000;

  while (true) {
    const response = await fetch(CODEX_DEVICE_CODE_POLL_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json"
      },
      body: JSON.stringify({
        device_auth_id: deviceCodeId,
        user_code: userCode
      })
    });

    const bodyText = await response.text();
    const parsedBody = parseJsonBody<CodexDeviceCodePollResponse>(bodyText);
    if (response.ok && parsedBody) {
      return parsedBody;
    }

    if (response.status === 401 || response.status === 403 || response.status === 404) {
      if (Date.now() >= expiresAtMs) {
        throw new CodexOAuthError(
          appendRequestId(
            "Codex device-code login timed out before approval completed.",
            extractRequestId(response.headers, parsedBody)
          ),
          400
        );
      }
      await new Promise((resolve) =>
        setTimeout(resolve, Math.max(1, intervalSeconds) * 1000)
      );
      continue;
    }

    throw classifyUpstreamOAuthFailure(
      response,
      parsedBody,
      "Codex device-code login failed upstream."
    );
  }
}

function defaultCodexBaseUrl(baseUrl?: string): string {
  if (!baseUrl) {
    return CODEX_DEFAULT_BASE_URL;
  }
  return baseUrl.replace(/\/+$/, "");
}

function buildCodexInstructions(
  messages: ChatRequest["messages"]
): { instructions: string; nonSystemMessages: ChatRequest["messages"] } {
  const systemMessages = messages
    .filter((message) => message.role === "system")
    .map((message) => message.content.trim())
    .filter((content) => content.length > 0);
  const sections = [CODEX_BASELINE_INSTRUCTIONS];
  if (systemMessages.length > 0) {
    sections.push(systemMessages.join("\n\n"));
  }

  return {
    instructions: sections.join("\n\n"),
    nonSystemMessages: messages.filter((message) => message.role !== "system")
  };
}

async function buildCodexResponsesPayload(
  req: ChatRequest,
  model: string,
  instructions: string,
  nonSystemMessages: ChatRequest["messages"],
  reasoning: ReturnType<typeof reasoningPayload>
): Promise<Record<string, unknown>> {
  return {
    model,
    instructions,
    input: await mapResponsesInput(nonSystemMessages),
    tools: mapResponsesTools(req.tools) ?? [],
    tool_choice: "auto",
    parallel_tool_calls: true,
    reasoning,
    store: false,
    stream: true,
    include: reasoning ? ["reasoning.encrypted_content"] : [],
    prompt_cache_key: req.sessionId
  };
}

function parseCodexEventStreamBody(bodyText: string): Record<string, unknown> | undefined {
  const chunks = bodyText
    .split(/\r?\n\r?\n/)
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.length > 0);
  if (chunks.length === 0) {
    return undefined;
  }

  let completedResponse: Record<string, unknown> | undefined;
  let fallbackResponse: Record<string, unknown> | undefined;
  let outputText = "";

  for (const chunk of chunks) {
    const dataLines = chunk
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice("data:".length).trimStart());
    if (dataLines.length === 0) {
      continue;
    }

    const rawData = dataLines.join("\n").trim();
    if (rawData.length === 0 || rawData === "[DONE]") {
      continue;
    }

    const parsed = parseJsonBody<Record<string, unknown>>(rawData);
    if (!parsed) {
      continue;
    }

    const response = parsed.response;
    if (response && typeof response === "object" && !Array.isArray(response)) {
      fallbackResponse = response as Record<string, unknown>;
      if (parsed.type === "response.completed") {
        completedResponse = response as Record<string, unknown>;
      }
    }

    if (parsed.type === "response.output_text.delta" && typeof parsed.delta === "string") {
      outputText += parsed.delta;
      continue;
    }

    if (parsed.type === "response.output_text.done" && typeof parsed.text === "string") {
      outputText = parsed.text;
    }
  }

  const selectedResponse = completedResponse ?? fallbackResponse;
  if (selectedResponse) {
    return {
      ...selectedResponse,
      output_text:
        outputText.length > 0
          ? outputText
          : typeof selectedResponse.output_text === "string"
            ? selectedResponse.output_text
            : ""
    };
  }

  if (outputText.length > 0) {
    return {
      status: "completed",
      output_text: outputText
    };
  }

  return undefined;
}

async function postCodexResponses(
  baseUrl: string,
  accessToken: string,
  headers: Record<string, string>,
  payload: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const response = await fetch(`${baseUrl}/responses`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
      accept: "text/event-stream",
      ...headers
    },
    body: JSON.stringify(payload)
  });

  const bodyText = await response.text();
  const parsedBody = parseJsonBody<Record<string, unknown>>(bodyText);
  if (!response.ok) {
    throw classifyUpstreamCodexChatFailure(response, parsedBody);
  }
  if (parsedBody) {
    return parsedBody;
  }
  const streamedBody = parseCodexEventStreamBody(bodyText);
  if (streamedBody) {
    return streamedBody;
  }
  throw new CodexUpstreamChatError(
    "Codex upstream request returned an unreadable event stream.",
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
    return buildCodexAuthHandle(this.config.id, ctx.accountId, tokens, "callback");
  }

  async startOAuthDeviceCodeLogin(
    ctx: OAuthDeviceCodeStartContext
  ): Promise<OAuthDeviceCodeStartResult> {
    const start = await requestDeviceCode(ctx.accountId);
    return {
      verificationUri: start.verificationUri,
      userCode: start.userCode,
      deviceCodeId: start.deviceCodeId,
      intervalSeconds: start.intervalSeconds,
      expiresAt: start.expiresAt
    };
  }

  async completeOAuthDeviceCodeLogin(
    ctx: OAuthDeviceCodeCompleteContext
  ): Promise<ProviderAuthHandle> {
    const codeResponse = await pollDeviceCode(
      ctx.deviceCodeId,
      ctx.userCode,
      ctx.intervalSeconds,
      ctx.expiresAt
    );
    const authorizationCode = normalizeTokenValue(codeResponse.authorization_code);
    const codeVerifier = normalizeTokenValue(codeResponse.code_verifier);
    if (!authorizationCode || !codeVerifier) {
      throw new CodexOAuthError(
        "Codex device-code login completed upstream, but the returned approval code was incomplete.",
        502
      );
    }

    const tokens = await exchangeCodeForTokens(
      authorizationCode,
      CODEX_DEVICE_CODE_REDIRECT_URI,
      codeVerifier
    );
    return buildCodexAuthHandle(this.config.id, ctx.accountId, tokens, "device-code");
  }

  async refreshOAuthAuth(auth: ProviderAuthHandle): Promise<ProviderAuthHandle> {
    if (!auth.refreshToken) {
      throw new Error("Codex login cannot refresh because no refresh token is stored");
    }
    const tokens = await refreshTokens(auth.refreshToken);
    return buildCodexAuthHandle(
      this.config.id,
      auth.accountId,
      tokens,
      auth.authMethod ?? "callback",
      auth
    );
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
    const accessToken = "apiKey" in auth ? auth.apiKey : auth.accessToken;
    if (!accessToken) {
      throw new Error("Codex provider requires a linked Codex account");
    }

    const claims = "apiKey" in auth ? {} : decodeClaimsMetadata(auth.scopes);
    const defaultHeaders: Record<string, string> = {
      session_id: req.sessionId
    };
    if (claims.chatgptAccountId) {
      defaultHeaders["ChatGPT-Account-ID"] = claims.chatgptAccountId;
    }

    const model = req.model || this.config.defaultModel;
    const { instructions, nonSystemMessages } = buildCodexInstructions(req.messages);
    const reasoning = reasoningPayload(model, this.config.reasoningEffort);
    const response = await postCodexResponses(
      defaultCodexBaseUrl(this.config.baseUrl),
      accessToken,
      defaultHeaders,
      await buildCodexResponsesPayload(req, model, instructions, nonSystemMessages, reasoning)
    );

    return mapResponsesApiResponse(response);
  }
}
