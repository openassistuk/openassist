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
}

export interface ApiKeyAuth {
  providerId: string;
  apiKey: string;
}

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

export interface ProviderCapabilities {
  supportsStreaming: boolean;
  supportsTools: boolean;
  supportsOAuth: boolean;
  supportsApiKeys: boolean;
  supportsImageInputs: boolean;
  supportedModels?: string[];
}

export type OpenAIReasoningEffort = "low" | "medium" | "high";

export interface ChatRequest {
  sessionId: string;
  model: string;
  messages: NormalizedMessage[];
  tools: ToolSchema[];
  maxTokens?: number;
  temperature?: number;
  metadata: Record<string, string>;
}

export interface ChatResponse {
  output: NormalizedMessage;
  usage: TokenUsage;
  rawProviderResponseId?: string;
  finishReason?: string;
  toolCalls?: ToolCall[];
}

export interface ProviderAdapter {
  id(): string;
  capabilities(): ProviderCapabilities;
  startOAuthLogin?(ctx: OAuthStartContext): Promise<OAuthStartResult>;
  completeOAuthLogin?(ctx: OAuthCompleteContext): Promise<ProviderAuthHandle>;
  validateConfig(config: unknown): Promise<ValidationResult>;
  chat(req: ChatRequest, auth: ProviderAuthHandle | ApiKeyAuth): Promise<ChatResponse>;
}

interface BaseProviderConfig {
  id: string;
  defaultModel: string;
  baseUrl?: string;
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
  metadata?: Record<string, unknown>;
}

export interface OpenAIProviderRuntimeConfig extends BaseProviderConfig {
  type: "openai";
  reasoningEffort?: OpenAIReasoningEffort;
}

export interface AnthropicProviderRuntimeConfig extends BaseProviderConfig {
  type: "anthropic";
  thinkingBudgetTokens?: number;
}

export interface OpenAICompatibleProviderRuntimeConfig extends BaseProviderConfig {
  type: "openai-compatible";
}

export type ProviderConfig =
  | OpenAIProviderRuntimeConfig
  | AnthropicProviderRuntimeConfig
  | OpenAICompatibleProviderRuntimeConfig;
