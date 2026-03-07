import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Client, GatewayIntentBits, Partials } from "discord.js";
import { z } from "zod";
import type {
  AttachmentRef,
  ChannelAdapter,
  ChannelCapabilities,
  HealthStatus,
  InboundEnvelope,
  OutboundEnvelope,
  ValidationResult
} from "@openassist/core-types";

const configSchema = z.object({
  id: z.string().min(1),
  botToken: z.string().min(1),
  allowedChannelIds: z.array(z.string()).default([]),
  allowedDmUserIds: z.array(z.string()).default([])
});

export interface DiscordChannelConfig extends z.infer<typeof configSchema> {}

function sanitizeFileName(value: string | undefined, fallback: string): string {
  const normalized = (value ?? "").trim();
  if (normalized.length === 0) {
    return fallback;
  }
  return normalized.replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^_+|_+$/g, "") || fallback;
}

async function persistTempFile(bytes: Uint8Array, fileName: string): Promise<string> {
  const dir = path.join(os.tmpdir(), "openassist-discord");
  await fs.promises.mkdir(dir, { recursive: true });
  const filePath = path.join(dir, `${Date.now()}-${Math.random().toString(36).slice(2)}-${fileName}`);
  await fs.promises.writeFile(filePath, bytes);
  return filePath;
}

async function extractAttachments(message: any): Promise<AttachmentRef[]> {
  const attachments: AttachmentRef[] = [];
  const collection = message?.attachments;
  const values = typeof collection?.values === "function" ? Array.from(collection.values()) : [];
  for (const rawItem of values) {
    const item = rawItem as {
      id?: string;
      url?: string;
      name?: string;
      contentType?: string;
      size?: number;
    };
    if (typeof item.url !== "string") {
      continue;
    }
    const response = await fetch(item.url);
    if (!response.ok) {
      throw new Error(`discord attachment download failed (${response.status})`);
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    const name = sanitizeFileName(
      typeof item.name === "string" ? item.name : undefined,
      `discord-attachment-${item.id ?? Date.now()}`
    );
    attachments.push({
      id: String(item.id ?? name),
      kind:
        typeof item.contentType === "string" && item.contentType.startsWith("image/")
          ? "image"
          : "document",
      name,
      mimeType: typeof item.contentType === "string" ? item.contentType : undefined,
      url: item.url,
      localPath: await persistTempFile(bytes, name),
      sizeBytes: typeof item.size === "number" ? item.size : undefined
    });
  }
  return attachments;
}

export class DiscordChannelAdapter implements ChannelAdapter {
  private readonly config: DiscordChannelConfig;
  private client: Client | null = null;
  private status: HealthStatus = "unhealthy";

  constructor(config: DiscordChannelConfig) {
    this.config = configSchema.parse(config);
  }

  id(): string {
    return this.config.id;
  }

  capabilities(): ChannelCapabilities {
    return {
      supportsEdits: true,
      supportsDeletes: true,
      supportsReadReceipts: false
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

  async start(handler: (msg: InboundEnvelope) => Promise<void>): Promise<void> {
    const client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.MessageContent
      ],
      partials: [Partials.Channel]
    });

    client.on("ready", () => {
      this.status = "healthy";
    });

    client.on("messageCreate", async (message) => {
      if (message.author.bot) {
        return;
      }

      const isDirectMessage = !message.guildId;
      if (isDirectMessage) {
        if (
          this.config.allowedDmUserIds.length === 0 ||
          !this.config.allowedDmUserIds.includes(message.author.id)
        ) {
          return;
        }
      } else if (
        this.config.allowedChannelIds.length > 0 &&
        !this.config.allowedChannelIds.includes(message.channelId)
      ) {
        return;
      }
      const attachments = await extractAttachments(message);
      if (message.content.trim().length === 0 && attachments.length === 0) {
        return;
      }

      await handler({
        channel: "discord",
        channelId: this.config.id,
        transportMessageId: message.id,
        conversationKey: message.channelId,
        senderId: message.author.id,
        text: message.content,
        attachments,
        receivedAt: new Date().toISOString(),
        idempotencyKey: `discord:${message.channelId}:${message.id}`
      });
    });

    await client.login(this.config.botToken);
    this.client = client;
    this.status = "healthy";
  }

  async stop(): Promise<void> {
    await this.client?.destroy();
    this.client = null;
    this.status = "unhealthy";
  }

  async send(msg: OutboundEnvelope): Promise<{ transportMessageId: string }> {
    if (!this.client) {
      throw new Error("Discord adapter is not running");
    }

    const channel = await this.client.channels.fetch(msg.conversationKey);
    if (!channel || typeof (channel as any).isTextBased !== "function" || !(channel as any).isTextBased()) {
      throw new Error(`Discord channel ${msg.conversationKey} is not text-capable`);
    }

    const sent = await (channel as any).send({
      content: msg.text,
      reply: msg.replyToTransportMessageId
        ? {
            messageReference: msg.replyToTransportMessageId,
            failIfNotExists: false
          }
        : undefined
    });
    return { transportMessageId: sent.id };
  }

  async health(): Promise<HealthStatus> {
    return this.status;
  }
}
