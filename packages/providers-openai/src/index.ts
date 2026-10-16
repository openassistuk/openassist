import { OPENAI_REASONING_MODES, OPENAI_REASONING_EFFORTS, modelCapabilities, reasoningEfforts, providerTuningErrors, providerModelAvailabilityErrors } from "@openassist/config";
import OpenAI from "openai";
import { prepareWireChat } from "@openassist/providers-shared";
import { z } from "zod";
import type {
  ApiKeyAuth,
  ChatRequest,
  ChatResponse,
  OAuthCompleteContext,
  OAuthStartContext,
  OAuthStartResult,
  ProviderAdapter,
  ProviderAuth,
  ProviderAuthHandle,
  ProviderCapabilities,
  PreparedChatRequest,
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
  temperatureForModel,
  shouldFallbackToResponses,
  shouldPreferResponsesApi
} from "@openassist/providers-openai-shared";

const configSchema = z.object({
  id: z.string().min(1),
  defaultModel: z.string().min(1),
  baseUrl: z.string().url().optional(),
  reasoningMode: z.enum(OPENAI_REASONING_MODES).optional(),
  reasoningEffort: z.enum(OPENAI_REASONING_EFFORTS).optional(),
  oauth: z
    .object({
      authorizeUrl: z.string().url(),
      tokenUrl: z.string().url(),
      clientId: z.string().min(1),
      clientSecretEnv: z
        .string()
        .regex(
          /^[A-Za-z_][A-Za-z0-9_]*$/,
          "OAuth clientSecretEnv must be a valid env var name"
        )
        .optional(),
      scopes: z.array(z.string()).optional(),
      audience: z.string().optional(),
      extraAuthParams: z.record(z.string(), z.string()).optional(),
      extraTokenParams: z.record(z.string(), z.string()).optional()
    })
    .optional()
});

export interface OpenAIProviderConfig extends z.infer<typeof configSchema> {}

export class OpenAIProviderAdapter implements ProviderAdapter {
  private readonly config: OpenAIProviderConfig;

  constructor(config: OpenAIProviderConfig) {
    this.config = configSchema.parse(config);
  }

  id(): string {
    return this.config.id;
  }

  capabilities(): ProviderCapabilities {
    return {
      supportsStreaming: false,
      supportsTools: true,
      supportsOAuth: Boolean(this.config.oauth),
      supportsApiKeys: true,
      supportsImageInputs: true
    };
  }

  async startOAuthLogin(ctx: OAuthStartContext): Promise<OAuthStartResult> {
    if (!this.config.oauth) {
      throw new Error("OpenAI OAuth is not configured for this provider. Use API key mode.");
    }

    const authUrl = new URL(this.config.oauth.authorizeUrl);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("client_id", this.config.oauth.clientId);
    authUrl.searchParams.set("redirect_uri", ctx.redirectUri);
    authUrl.searchParams.set("state", ctx.state);
    authUrl.searchParams.set("scope", ctx.scopes.join(" "));
    if (ctx.codeChallenge) {
      authUrl.searchParams.set("code_challenge", ctx.codeChallenge);
      authUrl.searchParams.set("code_challenge_method", ctx.codeChallengeMethod ?? "S256");
    }

    for (const [key, value] of Object.entries(this.config.oauth.extraAuthParams ?? {})) {
      authUrl.searchParams.set(key, value);
    }

    return {
      authorizationUrl: authUrl.toString(),
      state: ctx.state,
      expiresAt: new Date(Date.now() + 10 * 60_000).toISOString()
    };
  }

  async completeOAuthLogin(ctx: OAuthCompleteContext): Promise<ProviderAuthHandle> {
    if (!this.config.oauth) {
      throw new Error("OpenAI OAuth is not configured for this provider. Use API key mode.");
    }

    const payload = new URLSearchParams();
    payload.set("grant_type", "authorization_code");
    payload.set("client_id", this.config.oauth.clientId);
    payload.set("code", ctx.code);
    payload.set("redirect_uri", ctx.redirectUri);
    if (ctx.codeVerifier) {
      payload.set("code_verifier", ctx.codeVerifier);
    }

    if (this.config.oauth.clientSecretEnv) {
      const clientSecret = process.env[this.config.oauth.clientSecretEnv];
      if (!clientSecret) {
        throw new Error(
          `Missing OAuth client secret env var ${this.config.oauth.clientSecretEnv}`
        );
      }
      payload.set("client_secret", clientSecret);
    }

    if (this.config.oauth.audience) {
      payload.set("audience", this.config.oauth.audience);
    }

    for (const [key, value] of Object.entries(this.config.oauth.extraTokenParams ?? {})) {
      payload.set(key, value);
    }

    const response = await fetch(this.config.oauth.tokenUrl, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        accept: "application/json"
      },
      body: payload.toString()
    });

    const bodyText = await response.text();
    if (!response.ok) {
      throw new Error(`OAuth token exchange failed (HTTP ${response.status}). Check the OAuth configuration and retry account linking.`);
    }

    let decoded: unknown;
    try {
      decoded = JSON.parse(bodyText);
    } catch {
      throw new Error("OAuth token exchange returned invalid JSON. Retry account linking.");
    }
    const parsed = z.object({
      access_token: z.string().trim().min(1),
      refresh_token: z.string().optional(),
      expires_in: z.number().nonnegative().max(315_360_000).optional(),
      scope: z.string().optional(),
      token_type: z.string().optional()
    }).safeParse(decoded);
    if (!parsed.success) {
      throw new Error("OAuth token exchange returned invalid token fields or missing access_token. Retry account linking.");
    }
    const tokenBody = parsed.data;

    return {
      providerId: this.config.id,
      accountId: ctx.accountId,
      accessToken: tokenBody.access_token,
      refreshToken: tokenBody.refresh_token,
      expiresAt:
        typeof tokenBody.expires_in === "number"
          ? new Date(Date.now() + tokenBody.expires_in * 1000).toISOString()
          : undefined,
      scopes: tokenBody.scope ? tokenBody.scope.split(/\s+/).filter(Boolean) : undefined,
      tokenType: tokenBody.token_type
    };
  }

  async validateConfig(config: unknown): Promise<ValidationResult> {
    const parsed = configSchema.safeParse(config);
    if (parsed.success) {
      const provider = { ...parsed.data, type: "openai" as const };
      const errors = [...providerTuningErrors(provider), ...providerModelAvailabilityErrors(provider)];
      return { valid: errors.length === 0, errors };
    }

    return {
      valid: false,
      errors: parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`)
    };
  }

  async chat(req: ChatRequest, auth: ProviderAuth): Promise<ChatResponse> {
    return (await this.prepareChat(req)).send(auth);
  }

  async prepareChat(req: ChatRequest): Promise<PreparedChatRequest> {
    req = { ...req, metadata: { ...req.metadata }, tools: structuredClone(req.tools) };
    const model = req.model || this.config.defaultModel;
    const availabilityErrors = providerModelAvailabilityErrors({ ...this.config, type: "openai", defaultModel: model });
    if (availabilityErrors.length) throw new Error(availabilityErrors.join(" "));
    const useResponsesApi = shouldPreferResponsesApi(model) || hasImageInputs(req.messages);

    const responsesPayload = {
        model,
        temperature: temperatureForModel(model, this.config.reasoningEffort, req.temperature),
        max_output_tokens: req.maxTokens,
        include: reasoningEfforts(model, "openai").length || modelCapabilities(model)?.reasoningReplay ? ["reasoning.encrypted_content"] : undefined,
        reasoning: reasoningPayload(model, this.config.reasoningEffort, "openai", this.config.reasoningMode),
        input: await mapResponsesInput(req.messages, `openai:${this.config.id}:${model}`) as any,
        tools: mapResponsesTools(req.tools) as any,
        metadata: req.metadata
      };
    const completionPayload = {
        model,
        temperature: temperatureForModel(model, this.config.reasoningEffort, req.temperature),
        max_tokens: req.maxTokens,
        messages: mapMessages(req.messages) as any,
        tools: mapTools(req.tools) as any
      };
    const clientFor = (auth: ProviderAuth) => {
      const apiKey = "apiKey" in auth ? auth.apiKey : "accessToken" in auth ? auth.accessToken : undefined;
      if (!apiKey) throw new Error("OpenAI provider requires an API key or access token");
      return new OpenAI({ apiKey, baseURL: this.config.baseUrl });
    };
    return prepareWireChat(useResponsesApi ? responsesPayload : completionPayload, async (payload, auth) => {
      const client = clientFor(auth);
      if (useResponsesApi) return mapResponsesApiResponse(await client.responses.create(payload as any, { signal: req.signal }), `openai:${this.config.id}:${model}`);
      try {
        return mapChatCompletionResponse(await client.chat.completions.create(payload as any, { signal: req.signal }));
      } catch (error) {
        if (!shouldFallbackToResponses(error)) throw error;
        return mapResponsesApiResponse(await client.responses.create(responsesPayload as any, { signal: req.signal }), `openai:${this.config.id}:${model}`);
      }
    }, {
      identity: `openai:${this.config.id}:${this.config.baseUrl ?? "default"}:${model}`,
      outputTokens: req.maxTokens,
      alternatives: useResponsesApi ? [] : [responsesPayload],
      ...(useResponsesApi && (!this.config.baseUrl || new URL(this.config.baseUrl).hostname === "api.openai.com") ? {
        countTokens: async (_payload: object, auth: ProviderAuth) => {
          const { max_output_tokens: _output, temperature: _temperature, metadata: _metadata, include: _include, ...input } = responsesPayload;
          return (await clientFor(auth).responses.inputTokens.count(input as any, { signal: req.signal, timeout: 10_000, maxRetries: 0 })).input_tokens;
        }
      } : {})
    });
  }
}
