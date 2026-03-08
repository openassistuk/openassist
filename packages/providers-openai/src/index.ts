import fs from "node:fs";
import OpenAI from "openai";
import { z } from "zod";
import type {
  ApiKeyAuth,
  ChatRequest,
  ChatResponse,
  OpenAIReasoningEffort,
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

const TOOL_NAME_SAFE_PATTERN = /^[a-zA-Z0-9_-]+$/;
const TOOL_NAME_ENCODING_PREFIX = "oa__";

function encodeToolName(name: string): string {
  if (TOOL_NAME_SAFE_PATTERN.test(name)) {
    return name;
  }
  const encoded = Buffer.from(name, "utf8").toString("base64url");
  return `${TOOL_NAME_ENCODING_PREFIX}${encoded}`;
}

function decodeToolName(name: string): string {
  if (!name.startsWith(TOOL_NAME_ENCODING_PREFIX)) {
    return name;
  }
  const encoded = name.slice(TOOL_NAME_ENCODING_PREFIX.length);
  try {
    const decoded = Buffer.from(encoded, "base64url").toString("utf8");
    return decoded.length > 0 ? decoded : name;
  } catch {
    return name;
  }
}

function mapRole(role: string): "system" | "user" | "assistant" {
  if (role === "system" || role === "assistant" || role === "user") {
    return role;
  }
  return "user";
}

function mapMessages(messages: ChatRequest["messages"]): Array<Record<string, unknown>> {
  return messages.map((message) => {
    if (message.role === "tool") {
      return {
        role: "tool",
        content: message.content,
        tool_call_id: message.toolCallId
      };
    }

    if (message.role === "assistant" && message.toolCallId && message.toolName) {
      return {
        role: "assistant",
        content: message.content,
        tool_calls: [
          {
            id: message.toolCallId,
            type: "function",
            function: {
              name: encodeToolName(message.toolName),
              arguments: message.metadata?.toolArgumentsJson ?? "{}"
            }
          }
        ]
      };
    }

    return {
      role: mapRole(message.role),
      content: message.content
    };
  });
}

function imageAttachmentsForMessage(message: ChatRequest["messages"][number]) {
  return (message.attachments ?? []).filter(
    (attachment) => attachment.kind === "image" && typeof attachment.localPath === "string"
  );
}

async function toDataUrl(filePath: string, mimeType: string | undefined): Promise<string> {
  const bytes = await fs.promises.readFile(filePath);
  const resolvedMime = mimeType?.trim() || "image/jpeg";
  return `data:${resolvedMime};base64,${bytes.toString("base64")}`;
}

function mapTools(tools: ChatRequest["tools"]): Array<Record<string, unknown>> | undefined {
  if (tools.length === 0) {
    return undefined;
  }
  return tools.map((tool) => ({
    type: "function",
    function: {
      name: encodeToolName(tool.name),
      description: tool.description,
      parameters: tool.inputSchema
    }
  }));
}

async function mapResponsesInput(messages: ChatRequest["messages"]): Promise<Array<Record<string, unknown>>> {
  return Promise.all(messages.map(async (message) => {
    if (message.role === "assistant" && message.toolCallId && message.toolName) {
      return {
        type: "function_call",
        call_id: message.toolCallId,
        name: encodeToolName(message.toolName),
        arguments: message.metadata?.toolArgumentsJson ?? "{}"
      };
    }

    if (message.role === "tool") {
      return {
        type: "function_call_output",
        call_id: message.toolCallId ?? "tool-call-unknown",
        output: message.content
      };
    }

    if (message.role === "assistant" || message.role === "system" || message.role === "user") {
      const imageAttachments = message.role === "user" ? imageAttachmentsForMessage(message) : [];
      if (imageAttachments.length > 0) {
        const content: Array<Record<string, unknown>> = [];
        if (message.content.trim().length > 0) {
          content.push({
            type: "input_text",
            text: message.content
          });
        }
        for (const attachment of imageAttachments) {
          content.push({
            type: "input_image",
            image_url: await toDataUrl(attachment.localPath!, attachment.mimeType)
          });
        }
        return {
          type: "message",
          role: message.role,
          content
        };
      }

      return {
        type: "message",
        role: message.role,
        content: message.content
      };
    }

    return {
      type: "message",
      role: "user",
      content: message.content
    };
  }));
}

function hasImageInputs(messages: ChatRequest["messages"]): boolean {
  return messages.some((message) => imageAttachmentsForMessage(message).length > 0);
}

function mapResponsesTools(tools: ChatRequest["tools"]): Array<Record<string, unknown>> | undefined {
  if (tools.length === 0) {
    return undefined;
  }
  return tools.map((tool) => ({
    type: "function",
    name: encodeToolName(tool.name),
    description: tool.description,
    parameters: tool.inputSchema,
    strict: false
  }));
}

function shouldPreferResponsesApi(model: string): boolean {
  const normalized = model.trim().toLowerCase();
  return (
    normalized.startsWith("gpt-5") ||
    normalized.includes("codex") ||
    normalized.startsWith("o1") ||
    normalized.startsWith("o2") ||
    normalized.startsWith("o3") ||
    normalized.startsWith("o4")
  );
}

function supportsOpenAIReasoningEffort(model: string): boolean {
  const normalized = model.trim().toLowerCase();
  return (
    normalized.startsWith("gpt-5") ||
    normalized.includes("codex") ||
    normalized.startsWith("o1") ||
    normalized.startsWith("o2") ||
    normalized.startsWith("o3") ||
    normalized.startsWith("o4")
  );
}

function reasoningPayload(
  model: string,
  effort: OpenAIReasoningEffort | undefined
): { effort: OpenAIReasoningEffort } | undefined {
  if (!effort || !supportsOpenAIReasoningEffort(model)) {
    return undefined;
  }
  return { effort };
}

function extractErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function shouldFallbackToResponses(error: unknown): boolean {
  const message = extractErrorMessage(error).toLowerCase();
  return (
    message.includes("not a chat model") ||
    message.includes("not supported in the v1/chat/completions endpoint") ||
    message.includes("use v1/completions")
  );
}

function extractResponsesText(response: any): string {
  if (typeof response?.output_text === "string" && response.output_text.length > 0) {
    return response.output_text;
  }

  const output = Array.isArray(response?.output) ? response.output : [];
  const texts: string[] = [];
  for (const item of output) {
    if (item?.type !== "message" || !Array.isArray(item?.content)) {
      continue;
    }
    for (const block of item.content) {
      if (block?.type === "output_text" && typeof block?.text === "string") {
        texts.push(block.text);
      }
    }
  }
  return texts.join("\n");
}

function mapChatCompletionResponse(completion: any): ChatResponse {
  const choice = completion.choices[0];
  const output = choice?.message?.content ?? "";
  const usage = completion.usage;
  const rawToolCalls = ((choice?.message as any)?.tool_calls as Array<any> | undefined) ?? [];
  const toolCalls = rawToolCalls
    .filter((toolCall) => toolCall?.type === "function" && toolCall?.function?.name)
    .map((toolCall) => ({
      id: String(toolCall.id),
      name: decodeToolName(String(toolCall.function.name)),
      argumentsJson: String(toolCall.function.arguments ?? "{}")
    }));

  return {
    output: {
      role: "assistant",
      content: typeof output === "string" ? output : ""
    },
    usage: {
      inputTokens: usage?.prompt_tokens ?? 0,
      outputTokens: usage?.completion_tokens ?? 0,
      totalTokens: usage?.total_tokens ?? 0
    },
    rawProviderResponseId: completion.id,
    finishReason: choice?.finish_reason ?? undefined,
    toolCalls
  };
}

function mapResponsesApiResponse(response: any): ChatResponse {
  const output = extractResponsesText(response);
  const usage = response?.usage;
  const rawToolCalls = (response?.output as Array<any> | undefined) ?? [];
  const toolCalls = rawToolCalls
    .filter((item) => item?.type === "function_call" && typeof item?.name === "string")
    .map((item, index) => ({
      id: String(item.call_id ?? item.id ?? `call-${index + 1}`),
      name: decodeToolName(String(item.name)),
      argumentsJson: String(item.arguments ?? "{}")
    }));

  return {
    output: {
      role: "assistant",
      content: output
    },
    usage: {
      inputTokens: usage?.input_tokens ?? 0,
      outputTokens: usage?.output_tokens ?? 0,
      totalTokens: usage?.total_tokens ?? 0
    },
    rawProviderResponseId: response?.id,
    finishReason: typeof response?.status === "string" ? response.status : undefined,
    toolCalls
  };
}

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
