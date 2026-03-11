export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export interface JsonObject {
  [key: string]: JsonValue;
}

export type HealthStatus = "healthy" | "degraded" | "unhealthy";

export type AttachmentKind = "document" | "image";

export interface AttachmentRef {
  id: string;
  kind: AttachmentKind;
  name?: string;
  mimeType?: string;
  url?: string;
  localPath?: string;
  sizeBytes?: number;
  captionText?: string;
  extractedText?: string;
}

export interface OutboundAttachmentRef {
  id: string;
  kind: AttachmentKind;
  name: string;
  localPath: string;
  mimeType?: string;
  sizeBytes?: number;
  captionText?: string;
}

export type MessageRole = "system" | "user" | "assistant" | "tool";

export interface NormalizedMessage {
  id?: string;
  role: MessageRole;
  content: string;
  attachments?: AttachmentRef[];
  createdAt?: string;
  metadata?: Record<string, string>;
  internalTrace?: string;
  toolCallId?: string;
  toolName?: string;
}

export interface ToolSchema {
  name: string;
  description: string;
  inputSchema: JsonObject;
}

export interface ToolCall {
  id: string;
  name: string;
  argumentsJson: string;
}

export interface ToolResultMessage {
  toolCallId: string;
  name: string;
  content: string;
  isError: boolean;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface RetryPolicy {
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
}
