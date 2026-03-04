import { Client, GatewayIntentBits, TextChannel } from "discord.js";
import { z } from "zod";
import type {
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
  allowedChannelIds: z.array(z.string()).default([])
});

export interface DiscordChannelConfig extends z.infer<typeof configSchema> {}

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
      intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
    });

    client.on("ready", () => {
      this.status = "healthy";
    });

    client.on("messageCreate", async (message) => {
      if (message.author.bot) {
        return;
      }

      if (
        this.config.allowedChannelIds.length > 0 &&
        !this.config.allowedChannelIds.includes(message.channelId)
      ) {
        return;
      }

      await handler({
        channel: "discord",
        transportMessageId: message.id,
        conversationKey: message.channelId,
        senderId: message.author.id,
        text: message.content,
        attachments: [],
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
    if (!channel || !(channel instanceof TextChannel)) {
      throw new Error(`Discord channel ${msg.conversationKey} is not a text channel`);
    }

    const sent = await channel.send(msg.text);
    return { transportMessageId: sent.id };
  }

  async health(): Promise<HealthStatus> {
    return this.status;
  }
}