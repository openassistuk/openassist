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

const MAX_DISCORD_ATTACHMENT_DOWNLOAD_BYTES = 20_000_000;

function sanitizeFileName(value: string | undefined, fallback: string): string {
  const normalized = (value ?? "").trim();
  if (normalized.length === 0) {
    return fallback;
  }
  return normalized.replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^_+|_+$/g, "") || fallback;
}

async function persistTempFile(bytes: Uint8Array): Promise<string> {
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "openassist-discord-"));
  if (process.platform !== "win32") {
    await fs.promises.chmod(dir, 0o700);
  }
  const filePath = path.join(dir, "attachment.bin");
  const handle = await fs.promises.open(filePath, "wx", 0o600);
  try {
    await handle.writeFile(bytes);
  } finally {
    await handle.close();
  }
  return filePath;
}

async function readResponseBytesWithLimit(response: Response, maxBytes: number): Promise<Uint8Array> {
  const advertisedLength = Number.parseInt(response.headers.get("content-length") ?? "", 10);
  if (Number.isFinite(advertisedLength) && advertisedLength > maxBytes) {
    await response.body?.cancel();
    throw new Error(`discord attachment exceeds download limit (${advertisedLength} bytes)`);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    const fallback = new Uint8Array(await response.arrayBuffer());
    if (fallback.byteLength > maxBytes) {
      throw new Error(`discord attachment exceeds download limit (${fallback.byteLength} bytes)`);
    }
    return fallback;
  }

  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    if (!value) {
      continue;
    }
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new Error(`discord attachment exceeds download limit (${total} bytes)`);
    }
    chunks.push(value);
  }

  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return merged;
}

function warnAttachmentFailure(message: string, error: unknown): void {
  const errorText = error instanceof Error ? error.message : String(error);
  console.warn(`[openassist] ${message}: ${errorText}`);
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
    if (typeof item.size === "number" && item.size > MAX_DISCORD_ATTACHMENT_DOWNLOAD_BYTES) {
      warnAttachmentFailure(
        `discord attachment ${item.id ?? "unknown"} skipped before download`,
        new Error(`size ${item.size} exceeds ${MAX_DISCORD_ATTACHMENT_DOWNLOAD_BYTES} bytes`)
      );
      continue;
    }
    const response = await fetch(item.url);
    if (!response.ok) {
      throw new Error(`discord attachment download failed (${response.status})`);
    }
    const bytes = await readResponseBytesWithLimit(response, MAX_DISCORD_ATTACHMENT_DOWNLOAD_BYTES);
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
      localPath: await persistTempFile(bytes),
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
      supportsReadReceipts: false,
      supportsFormattedText: true,
      supportsImageAttachments: true,
      supportsDocumentAttachments: true
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
      let attachments: AttachmentRef[] = [];
      try {
        attachments = await extractAttachments(message);
      } catch (error) {
        warnAttachmentFailure(
          `discord attachment extraction failed for channel ${message.channelId} message ${message.id}; continuing with text-only message`,
          error
        );
      }
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
