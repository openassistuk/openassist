import type { AttachmentRef, HealthStatus, ValidationResult } from "./common.js";

export interface InboundEnvelope {
  channel: "telegram" | "discord" | "whatsapp-md";
  channelId: string;
  transportMessageId: string;
  conversationKey: string;
  senderId: string;
  text?: string;
  attachments: AttachmentRef[];
  receivedAt: string;
  idempotencyKey: string;
}

export interface OutboundEnvelope {
  channel: string;
  conversationKey: string;
  text: string;
  replyToTransportMessageId?: string;
  metadata: Record<string, string>;
}

export interface ChannelCapabilities {
  supportsEdits: boolean;
  supportsDeletes: boolean;
  supportsReadReceipts: boolean;
  supportsFormattedText: boolean;
  supportsImageAttachments: boolean;
  supportsDocumentAttachments: boolean;
}

export interface ChannelAdapter {
  id(): string;
  capabilities(): ChannelCapabilities;
  validateConfig(config: unknown): Promise<ValidationResult>;
  start(handler: (msg: InboundEnvelope) => Promise<void>): Promise<void>;
  stop(): Promise<void>;
  send(msg: OutboundEnvelope): Promise<{ transportMessageId: string }>;
  health(): Promise<HealthStatus>;
}

export interface ChannelConfig {
  id: string;
  type: "telegram" | "discord" | "whatsapp-md";
  enabled: boolean;
  settings: Record<string, string | number | boolean | string[]>;
}
