import fs from "node:fs";
import Anthropic from "@anthropic-ai/sdk";
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

const configSchema = z.object({
  id: z.string().min(1),
  defaultModel: z.string().min(1),
  baseUrl: z.string().url().optional(),
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

export interface AnthropicProviderConfig extends z.infer<typeof configSchema> {}

function parseToolArgs(argumentsJson: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(argumentsJson);
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // Fall back to empty object.
  }
  return {};
}

function imageAttachmentsForMessage(message: ChatRequest["messages"][number]) {
  return (message.attachments ?? []).filter(
    (attachment) => attachment.kind === "image" && typeof attachment.localPath === "string"
  );
}

async function toAnthropicImageBlock(
  filePath: string,
  mimeType: string | undefined
): Promise<Record<string, unknown>> {
  const bytes = await fs.promises.readFile(filePath);
  return {
    type: "image",
    source: {
      type: "base64",
      media_type: mimeType?.trim() || "image/jpeg",
      data: bytes.toString("base64")
    }
  };
}

async function mapMessages(messages: ChatRequest["messages"]): Promise<{
  system?: string;
  messages: Array<Record<string, unknown>>;
}> {
  const systemParts: string[] = [];
  const mapped: Array<Record<string, unknown>> = [];

  for (const message of messages) {
    if (message.role === "system") {
      systemParts.push(message.content);
      continue;
    }

    if (message.role === "tool") {
      mapped.push({
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: message.toolCallId,
            content: message.content,
            is_error: message.metadata?.isError === "true"
          }
        ]
      });
      continue;
    }

    if (message.role === "assistant" && message.toolCallId && message.toolName) {
      mapped.push({
        role: "assistant",
        content: [
          {
            type: "tool_use",
            id: message.toolCallId,
            name: message.toolName,
            input: parseToolArgs(message.metadata?.toolArgumentsJson ?? "{}")
          }
        ]
      });
      continue;
    }

    const imageAttachments = message.role !== "assistant" ? imageAttachmentsForMessage(message) : [];
    if (imageAttachments.length > 0) {
      const content: Array<Record<string, unknown>> = [];
      if (message.content.trim().length > 0) {
        content.push({
          type: "text",
          text: message.content
        });
      }
      for (const attachment of imageAttachments) {
        content.push(await toAnthropicImageBlock(attachment.localPath!, attachment.mimeType));
      }

      mapped.push({
        role: message.role === "assistant" ? "assistant" : "user",
        content
      });
      continue;
    }

    mapped.push({
      role: message.role === "assistant" ? "assistant" : "user",
      content: message.content
    });
  }

  const system = systemParts.join("\n").trim();
  return {
    system: system.length > 0 ? system : undefined,
    messages: mapped
  };
}

function mapTools(tools: ChatRequest["tools"]): Array<Record<string, unknown>> | undefined {
  if (tools.length === 0) {
    return undefined;
  }
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    input_schema: tool.inputSchema
  }));
}

export class AnthropicProviderAdapter implements ProviderAdapter {
  private readonly config: AnthropicProviderConfig;

  constructor(config: AnthropicProviderConfig) {
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
      throw new Error("Anthropic OAuth is not configured for this provider. Use API key mode.");
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
      throw new Error("Anthropic OAuth is not configured for this provider. Use API key mode.");
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
      throw new Error("Anthropic provider requires an API key or access token");
    }

    const client = new Anthropic({
      apiKey,
      baseURL: this.config.baseUrl
    });

    const mapped = await mapMessages(req.messages);
    const response = await client.messages.create({
      model: req.model || this.config.defaultModel,
      max_tokens: req.maxTokens ?? 1024,
      temperature: req.temperature,
      messages: mapped.messages as any,
      system: mapped.system,
      tools: mapTools(req.tools) as any
    } as any);

    const textBlocks = response.content.filter((block: any) => block.type === "text");
    const content = textBlocks.map((block: any) => block.text).join("\n");
    const toolCalls = response.content
      .filter((block: any) => block.type === "tool_use")
      .map((block: any) => ({
        id: String(block.id),
        name: String(block.name),
        argumentsJson: JSON.stringify(block.input ?? {})
      }));

    return {
      output: {
        role: "assistant",
        content
      },
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        totalTokens: response.usage.input_tokens + response.usage.output_tokens
      },
      rawProviderResponseId: response.id,
      finishReason: response.stop_reason ?? undefined,
      toolCalls
    };
  }
}
