import { ANTHROPIC_THINKING_MODES, ANTHROPIC_THINKING_EFFORTS, anthropicThinking, modelCapabilities, providerTuningErrors, providerModelAvailabilityErrors } from "@openassist/config";
import fs from "node:fs";
import { createHash } from "node:crypto";
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
  ProviderAuth,
  ProviderAuthHandle,
  ProviderCapabilities,
  ValidationResult
} from "@openassist/core-types";

const configSchema = z.object({
  id: z.string().min(1),
  defaultModel: z.string().min(1),
  baseUrl: z.string().url().optional(),
  thinkingBudgetTokens: z.number().int().min(1024).max(32_000).optional(),
  thinkingMode: z.enum(ANTHROPIC_THINKING_MODES).optional(),
  thinkingEffort: z.enum(ANTHROPIC_THINKING_EFFORTS).optional(),
  maxOutputTokens: z.number().int().min(1).max(128_000).optional(),
  workspaceId: z.string().trim().regex(/^wrkspc_[A-Za-z0-9]+$/, "workspaceId must be a Claude workspace ID (wrkspc_...)").optional(),
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

export interface AnthropicProviderConfig extends z.infer<typeof configSchema> {}

const ANTHROPIC_REPLAY_KIND = "anthropic-content-blocks";
const PROVIDER_REPLAY_KIND_KEY = "providerReplayKind";
const PROVIDER_REPLAY_JSON_KEY = "providerReplayJson";
const PROVIDER_REPLAY_SCOPE_KEY = "providerReplayScope";
const TOOL_NAME_ENCODING_KEY = "anthropicToolNameEncoding";
const TOOL_NAME_ENCODING = "sha256-v1";
const MAX_REPLAY_BYTES = 1_048_576;
const MAX_REPLAY_ITEMS = 256;
const SAFE_TOOL_NAME = /^[a-zA-Z0-9_-]{1,128}$/;

function wireToolName(name: string): string {
  if (SAFE_TOOL_NAME.test(name) && !name.startsWith("oa__")) return name;
  return `oa__${createHash("sha256").update(name).digest("hex")}`;
}

function toolNamesForRequest(req: ChatRequest) {
  const runtimeToWire = new Map<string, string>();
  const wireToRuntime = new Map<string, string>();
  for (const name of [...req.tools.map(tool => tool.name), ...req.messages.map(message => message.toolName)]) {
    if (!name) continue;
    const wireName = wireToolName(name);
    runtimeToWire.set(name, wireName);
    wireToRuntime.set(wireName, name);
  }
  return {
    decode: (name: string) => wireToRuntime.get(name) ?? name,
    replay: (name: string) => runtimeToWire.get(name) ?? wireToolName(name)
  };
}

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

function parseAnthropicReplayBlocks(
  message: ChatRequest["messages"][number], scope: string
): Array<Record<string, unknown>> | undefined {
  if (message.role !== "assistant") {
    return undefined;
  }
  if (message.metadata?.[PROVIDER_REPLAY_KIND_KEY] !== ANTHROPIC_REPLAY_KIND) {
    return undefined;
  }
  if (message.metadata[PROVIDER_REPLAY_SCOPE_KEY] !== undefined && message.metadata[PROVIDER_REPLAY_SCOPE_KEY] !== scope) return undefined;
  if (message.metadata[TOOL_NAME_ENCODING_KEY] !== undefined && message.metadata[TOOL_NAME_ENCODING_KEY] !== TOOL_NAME_ENCODING) return undefined;

  const raw = message.metadata?.[PROVIDER_REPLAY_JSON_KEY];
  if (typeof raw !== "string" || raw.trim().length === 0 || Buffer.byteLength(raw, "utf8") > MAX_REPLAY_BYTES) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed) || parsed.length === 0 || parsed.length > MAX_REPLAY_ITEMS) {
      return undefined;
    }
    return parsed.filter(
      (entry): entry is Record<string, unknown> =>
        typeof entry === "object" && entry !== null && !Array.isArray(entry)
    );
  } catch {
    return undefined;
  }
}

function replayMetadataForResponseContent(content: Array<any>, scope: string): Record<string, string> | undefined {
  if (content.length > MAX_REPLAY_ITEMS || !content.some((block) => block?.type === "thinking" || block?.type === "redacted_thinking" || block?.type === "tool_use")) {
    return undefined;
  }
  const raw = JSON.stringify(content);
  if (Buffer.byteLength(raw, "utf8") > MAX_REPLAY_BYTES) return undefined;

  return {
    [PROVIDER_REPLAY_KIND_KEY]: ANTHROPIC_REPLAY_KIND,
    [PROVIDER_REPLAY_JSON_KEY]: raw,
    [PROVIDER_REPLAY_SCOPE_KEY]: scope,
    [TOOL_NAME_ENCODING_KEY]: TOOL_NAME_ENCODING
  };
}

function hasCompleteToolReplay(
  blocks: Array<Record<string, unknown>>, messages: ChatRequest["messages"], index: number, replayedIds: Set<string>
): boolean {
  const pending = new Set<string>();
  for (const block of blocks) {
    if (block.type !== "tool_use") continue;
    if (typeof block.id !== "string" || replayedIds.has(block.id) || pending.has(block.id)) return false;
    pending.add(block.id);
  }
  if (pending.size === 0) return true;

  // Runtime audit rows interleave calls and results. All results must survive
  // reconciliation in this turn before the complete native turn can be replayed.
  for (let next = index + 1; next < messages.length; next += 1) {
    const message = messages[next];
    if (message.role === "system") continue;
    if (message.role === "assistant" && message.toolCallId && message.toolName && pending.has(message.toolCallId)) continue;
    if (message.role === "tool" && message.toolCallId && pending.delete(message.toolCallId)) {
      if (pending.size === 0) return true;
      continue;
    }
    return false;
  }
  return false;
}

async function mapMessages(messages: ChatRequest["messages"], names: ReturnType<typeof toolNamesForRequest>, scope: string, stripThinking = false): Promise<{
  system?: string;
  messages: Array<Record<string, unknown>>;
}> {
  const systemParts: string[] = [];
  const mapped: Array<Record<string, unknown>> = [];
  const replayedToolCalls = new Set<string>();

  for (const [index, message] of messages.entries()) {
    if (message.role === "system") {
      systemParts.push(message.content);
      continue;
    }

    const parsedReplay = parseAnthropicReplayBlocks(message, scope);
    const replayBlocks = (parsedReplay && hasCompleteToolReplay(parsedReplay, messages, index, replayedToolCalls) ? parsedReplay : undefined)
      ?.filter(block => !stripThinking || (block.type !== "thinking" && block.type !== "redacted_thinking"))
      .map(block => message.metadata?.[TOOL_NAME_ENCODING_KEY] !== TOOL_NAME_ENCODING && block.type === "tool_use" && typeof block.name === "string" ? { ...block, name: names.replay(block.name) } : block);
    if (replayBlocks) {
      for (const block of replayBlocks) {
        if (block.type === "tool_use" && typeof block.id === "string") {
          replayedToolCalls.add(block.id);
        }
      }
      if (replayBlocks.length > 0) mapped.push({ role: "assistant", content: replayBlocks });
      continue;
    }

    if (message.role === "tool") {
      const result = { type: "tool_result", tool_use_id: message.toolCallId, content: message.content, is_error: message.metadata?.isError === "true" };
      const previous = mapped.at(-1);
      if (previous?.role === "user" && Array.isArray(previous.content) && previous.content.every(block => block.type === "tool_result")) {
        previous.content.push(result);
      } else {
        mapped.push({ role: "user", content: [result] });
      }
      continue;
    }

    if (message.role === "assistant" && message.toolCallId && message.toolName) {
      if (replayedToolCalls.has(message.toolCallId)) {
        continue;
      }
      mapped.push({
        role: "assistant",
        content: [
          {
            type: "tool_use",
            id: message.toolCallId,
            name: wireToolName(message.toolName),
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
  return tools.map((tool) => {
    const name = wireToolName(tool.name);
    return { name, description: name === tool.name ? tool.description : `${tool.description}\nRuntime tool: ${tool.name}`, input_schema: tool.inputSchema };
  });
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
      const provider = { ...parsed.data, type: "anthropic" as const };
      const errors = [...providerTuningErrors(provider), ...providerModelAvailabilityErrors(provider)];
      return { valid: errors.length === 0, errors };
    }

    return {
      valid: false,
      errors: parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`)
    };
  }

  async chat(req: ChatRequest, auth: ProviderAuth): Promise<ChatResponse> {
    const apiKey = "apiKey" in auth ? auth.apiKey : "accessToken" in auth ? auth.accessToken : undefined;
    if (!apiKey) {
      throw new Error("Anthropic provider requires an API key or access token");
    }

    const client = new Anthropic({
      apiKey: "apiKey" in auth ? apiKey : null,
      authToken: "apiKey" in auth ? null : apiKey,
      baseURL: this.config.baseUrl ?? "https://api.anthropic.com",
      logLevel: "off",
      openTelemetry: false,
      defaultHeaders: {
        "x-api-key": "apiKey" in auth ? apiKey : null,
        authorization: "apiKey" in auth ? null : `Bearer ${apiKey}`,
        "anthropic-workspace-id": this.config.workspaceId ?? null,
        "anthropic-beta": null,
        "anthropic-version": "2023-06-01"
      }
    });

    const model = req.model || this.config.defaultModel;
    const availabilityErrors = providerModelAvailabilityErrors({ ...this.config, type: "anthropic", defaultModel: model });
    if (availabilityErrors.length) throw new Error(availabilityErrors.join(" "));
    const tuning = anthropicThinking({ ...this.config, type: "anthropic", defaultModel: model });
    // Runtime guidance, access-controlled tools and bounded history can change between
    // requests. Let the API retain valid signed blocks and drop only stale ones.
    const prefixBoundModel = modelCapabilities(model, "anthropic")?.thinkingPrefixBinding;
    const prefixBinding = prefixBoundModel && tuning.thinking?.type !== "disabled";
    const thinkingOn = tuning.thinking?.type !== "disabled" && (tuning.thinking || modelCapabilities(model, "anthropic")?.defaultThinking === "adaptive");
    const maxTokens = req.maxTokens ?? this.config.maxOutputTokens ?? Math.max(modelCapabilities(model, "anthropic")?.defaultMaxOutputTokens ?? 4096, (this.config.thinkingBudgetTokens ?? 0) + 1024);
    const maximum = modelCapabilities(model, "anthropic")?.maxOutputTokens ?? 128_000;
    if (!Number.isInteger(maxTokens) || maxTokens < 1 || maxTokens > maximum) {
      throw new Error(`Anthropic maxTokens must be an integer from 1 to ${maximum} for '${model}'.`);
    }
    if (tuning.thinking?.type === "enabled" && maxTokens <= tuning.thinking.budget_tokens) {
      throw new Error("Anthropic maxTokens must be greater than thinkingBudgetTokens.");
    }
    const names = toolNamesForRequest(req);
    const replayScope = `anthropic:${this.config.id}:${model}`;
    const mapped = await mapMessages(req.messages, names, replayScope, Boolean(prefixBoundModel && tuning.thinking?.type === "disabled"));
    const payload = {
      model,
      max_tokens: maxTokens,
      temperature: thinkingOn || modelCapabilities(model, "anthropic")?.supportsTemperature === false ? undefined : req.temperature,
      ...tuning,
      ...(prefixBinding ? { thinking: { type: "adaptive", block_binding: { prefix_mismatch_behavior: "drop_block" } } } : {}),
      messages: mapped.messages as any,
      system: mapped.system,
      tools: mapTools(req.tools) as any
    };
    const options = prefixBinding ? { headers: { "anthropic-beta": "thinking-binding-controls-2026-08-01" } } : undefined;
    // Fold the SDK stream into the existing completed-message contract. Large
    // reasoning budgets can exceed the SDK's non-streaming timeout estimate.
    const response = prefixBoundModel || maxTokens > 16_384
      ? await client.messages.stream(payload as any, options).finalMessage()
      : await client.messages.create(payload as any, options);

    const textBlocks = response.content.filter((block: any) => block.type === "text");
    const content = textBlocks.map((block: any) => block.text).join("\n");
    const toolCalls = response.content
      .filter((block: any) => block.type === "tool_use")
      .map((block: any) => ({
        id: String(block.id),
        name: names.decode(String(block.name)),
        argumentsJson: JSON.stringify(block.input ?? {})
      }));

    return {
      output: {
        role: "assistant",
        content,
        metadata: replayMetadataForResponseContent(response.content, replayScope)
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
