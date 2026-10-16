import type {
  NormalizedMessage,
  ToolCall,
  ToolSchema,
  TokenUsage,
  ValidationResult
} from "./common.js";

export interface ProviderAuthHandle {
  providerId: string;
  accountId: string;
  expiresAt?: string;
  accessToken?: string;
  refreshToken?: string;
  scopes?: string[];
  tokenType?: string;
  authMethod?: "callback" | "device-code";
}

export interface ApiKeyAuth {
  providerId: string;
  apiKey: string;
}

export interface EntraAuth {
  providerId: string;
  kind: "entra";
}

export type ProviderAuth = ProviderAuthHandle | ApiKeyAuth | EntraAuth;

export interface OAuthStartContext {
  accountId: string;
  redirectUri: string;
  state: string;
  scopes: string[];
  codeChallenge?: string;
  codeChallengeMethod?: "S256";
}

export interface OAuthStartResult {
  authorizationUrl: string;
  state: string;
  expiresAt?: string;
}

export interface OAuthCompleteContext {
  accountId: string;
  code: string;
  state: string;
  redirectUri: string;
  codeVerifier?: string;
}

export interface OAuthDeviceCodeStartContext {
  accountId: string;
  scopes: string[];
}

export interface OAuthDeviceCodeStartResult {
  verificationUri: string;
  userCode: string;
  deviceCodeId: string;
  intervalSeconds: number;
  expiresAt?: string;
}

export interface OAuthDeviceCodeCompleteContext {
  accountId: string;
  deviceCodeId: string;
  userCode: string;
  intervalSeconds: number;
  expiresAt?: string;
}

export interface ProviderCapabilities {
  supportsStreaming: boolean;
  supportsTools: boolean;
  supportsOAuth: boolean;
  supportsApiKeys: boolean;
  supportsImageInputs: boolean;
  supportedModels?: string[];
}

export type OpenAIReasoningEffort = "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";
export type OpenAIReasoningMode = "standard" | "pro";

export interface ChatRequest {
  sessionId: string;
  model: string;
  messages: NormalizedMessage[];
  tools: ToolSchema[];
  maxTokens?: number;
  temperature?: number;
  metadata: Record<string, string>;
  signal?: AbortSignal;
}

export interface ChatResponse {
  output: NormalizedMessage;
  usage: TokenUsage;
  rawProviderResponseId?: string;
  finishReason?: string;
  toolCalls?: ToolCall[];
}

export interface ContextAccounting {
  fingerprint: string;
  inputTokens: number;
  bytes: number;
  source: "estimated" | "counted";
  components: Record<string, number>;
}

/** An adapter owns the immutable wire payload; authentication is supplied only on use. */
export interface PreparedChatRequest {
  readonly accounting: ContextAccounting;
  readonly outputTokens?: number;
  countTokens?(auth: ProviderAuth): Promise<number>;
  send(auth: ProviderAuth): Promise<ChatResponse>;
}

export interface ResolvedContextLimits {
  route: ProviderConfig["type"];
  model: string;
  contextWindowTokens: number;
  maxInputTokens: number;
  operatorInputCapTokens?: number;
  reservedOutputTokens: number;
  safetyMarginTokens: number;
  usableInputTokens: number;
  source: "catalog" | "configured" | "fallback";
  checkedAt?: string;
}

export interface ProviderAdapter {
  id(): string;
  capabilities(): ProviderCapabilities;
  startOAuthLogin?(ctx: OAuthStartContext): Promise<OAuthStartResult>;
  completeOAuthLogin?(ctx: OAuthCompleteContext): Promise<ProviderAuthHandle>;
  startOAuthDeviceCodeLogin?(ctx: OAuthDeviceCodeStartContext): Promise<OAuthDeviceCodeStartResult>;
  completeOAuthDeviceCodeLogin?(ctx: OAuthDeviceCodeCompleteContext): Promise<ProviderAuthHandle>;
  refreshOAuthAuth?(auth: ProviderAuthHandle): Promise<ProviderAuthHandle>;
  validateConfig(config: unknown): Promise<ValidationResult>;
  prepareChat?(req: ChatRequest): Promise<PreparedChatRequest>;
  chat(req: ChatRequest, auth: ProviderAuth): Promise<ChatResponse>;
}

interface CommonProviderConfig {
  id: string;
  defaultModel: string;
  baseUrl?: string;
  contextWindowTokens?: number;
  metadata?: Record<string, unknown>;
}

interface OAuthCapableProviderConfig extends CommonProviderConfig {
  oauth?: {
    authorizeUrl: string;
    tokenUrl: string;
    clientId: string;
    clientSecretEnv?: string;
    scopes?: string[];
    audience?: string;
    extraAuthParams?: Record<string, string>;
    extraTokenParams?: Record<string, string>;
  };
}

export interface OpenAIProviderRuntimeConfig extends OAuthCapableProviderConfig {
  type: "openai";
  reasoningEffort?: OpenAIReasoningEffort;
  reasoningMode?: OpenAIReasoningMode;
}

export interface CodexProviderRuntimeConfig extends CommonProviderConfig {
  type: "codex";
  reasoningEffort?: OpenAIReasoningEffort;
}

export interface AnthropicProviderRuntimeConfig extends OAuthCapableProviderConfig {
  type: "anthropic";
  workspaceId?: string;
  thinkingBudgetTokens?: number;
  thinkingMode?: AnthropicThinkingMode;
  thinkingEffort?: AnthropicThinkingEffort;
  maxOutputTokens?: number;
}

export interface OpenAICompatibleProviderRuntimeConfig extends CommonProviderConfig {
  type: "openai-compatible";
}

export type AzureFoundryAuthMode = "api-key" | "entra";
export type AzureFoundryEndpointFlavor = "openai-resource" | "foundry-resource";

export interface AzureFoundryProviderRuntimeConfig extends CommonProviderConfig {
  type: "azure-foundry";
  authMode: AzureFoundryAuthMode;
  resourceName: string;
  endpointFlavor: AzureFoundryEndpointFlavor;
  underlyingModel?: string;
  reasoningEffort?: OpenAIReasoningEffort;
  reasoningMode?: OpenAIReasoningMode;
}

export type ProviderConfig =
  | OpenAIProviderRuntimeConfig
  | CodexProviderRuntimeConfig
  | AnthropicProviderRuntimeConfig
  | OpenAICompatibleProviderRuntimeConfig
  | AzureFoundryProviderRuntimeConfig;

export type AnthropicThinkingMode = "adaptive" | "enabled" | "disabled";
export type AnthropicThinkingEffort = "low" | "medium" | "high" | "xhigh" | "max";
export interface ModelCapabilities {
  id: string;
  routes: readonly ProviderConfig["type"][];
  responses: boolean;
  reasoningEfforts: readonly OpenAIReasoningEffort[];
  reasoningModes?: readonly OpenAIReasoningMode[];
  reasoningReplay?: boolean;
  temperatureRequiresNoReasoning?: boolean;
  thinkingModes?: readonly AnthropicThinkingMode[];
  thinkingEfforts?: readonly AnthropicThinkingEffort[];
  supportsTemperature?: boolean;
  defaultThinking?: "adaptive" | "disabled";
  defaultThinkingEffort?: AnthropicThinkingEffort;
  thinkingPrefixBinding?: boolean;
  defaultMaxOutputTokens?: number;
  maxOutputTokens?: number;
  contextWindowTokens?: number;
  maxInputTokens?: number;
  limitsCheckedAt?: string;
}

export interface ModelLifecycle {
  status: "deprecated" | "retired";
  retirementDate?: string;
  replacementModel: string;
}
