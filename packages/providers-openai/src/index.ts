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

const configSchema = z.object({
  id: z.string().min(1),
  defaultModel: z.string().min(1),
  baseUrl: z.string().url().optional(),
  reasoningEffort: z.enum(["low", "medium", "high"]).optional(),
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
      extraAuthParams: z.record(z.string()).optional(),
      extraTokenParams: z.record(z.string()).optional()
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
      throw new Error(
        `OAuth token exchange failed (${response.status} ${response.statusText}): ${bodyText.slice(0, 500)}`
      );
    }

    const tokenBody = JSON.parse(bodyText) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
      scope?: string;
      token_type?: string;
    };

    if (!tokenBody.access_token) {
      throw new Error("OAuth token exchange did not return access_token");
    }

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
      return { valid: true, errors: [] };
    }

    return {
      valid: false,
      errors: parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`)
    };
  }

  async chat(req: ChatRequest, auth: ProviderAuthHandle | ApiKeyAuth): Promise<ChatResponse> {
    const apiKey = "apiKey" in auth ? auth.apiKey : auth.accessToken;
    if (!apiKey) {
      throw new Error("OpenAI provider requires an API key or access token");
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
        input: await mapResponsesInput(req.messages) as any,
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
        input: await mapResponsesInput(req.messages) as any,
        tools: mapResponsesTools(req.tools) as any,
        metadata: req.metadata
      } as any);

      return mapResponsesApiResponse(response);
    }
  }
}
