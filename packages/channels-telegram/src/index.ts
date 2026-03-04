import { Bot } from "grammy";
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
  allowedChatIds: z.array(z.string()).default([]),
  conversationMode: z.enum(["chat", "chat-thread"]).default("chat"),
  responseMode: z.enum(["inline", "reply-threaded"]).default("inline")
});

export interface TelegramChannelConfig extends z.infer<typeof configSchema> {}

function parseConversationKey(conversationKey: string): { chatId: string; threadId?: number } {
  const [chatId, threadPart] = conversationKey.split(":", 2);
  if (!threadPart) {
    return { chatId };
  }

  const parsedThreadId = Number.parseInt(threadPart, 10);
  if (!Number.isFinite(parsedThreadId)) {
    return { chatId };
  }

  return {
    chatId,
    threadId: parsedThreadId
  };
}

export class TelegramChannelAdapter implements ChannelAdapter {
  private readonly config: TelegramChannelConfig;
  private bot: Bot | null = null;
  private status: HealthStatus = "unhealthy";

  constructor(config: TelegramChannelConfig) {
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
    if (this.bot) {
      return;
    }
    const bot = new Bot(this.config.botToken);
    this.bot = bot;
    this.status = "degraded";

    bot.on("message:text", async (ctx) => {
      const chatId = String(ctx.chat.id);
      if (this.config.allowedChatIds.length > 0 && !this.config.allowedChatIds.includes(chatId)) {
        return;
      }
      const threadId = ctx.msg.message_thread_id;
      const conversationKey =
        this.config.conversationMode === "chat-thread" && typeof threadId === "number"
          ? `${chatId}:${String(threadId)}`
          : chatId;

      await handler({
        channel: "telegram",
        transportMessageId: String(ctx.msg.message_id),
        conversationKey,
        senderId: String(ctx.from?.id ?? "unknown"),
        text: ctx.msg.text,
        attachments: [],
        receivedAt: new Date().toISOString(),
        idempotencyKey: `telegram:${conversationKey}:${ctx.msg.message_id}`
      });
    });

    void bot.start({
      onStart: () => {
        this.status = "healthy";
      }
    }).catch(() => {
      this.status = "unhealthy";
      if (this.bot === bot) {
        this.bot = null;
      }
    });
  }

  async stop(): Promise<void> {
    this.bot?.stop();
    this.bot = null;
    this.status = "unhealthy";
  }

  async send(msg: OutboundEnvelope): Promise<{ transportMessageId: string }> {
    if (!this.bot) {
      throw new Error("Telegram adapter is not running");
    }
    const target = parseConversationKey(msg.conversationKey);

    const response = await this.bot.api.sendMessage(target.chatId, msg.text, {
      message_thread_id: target.threadId,
      reply_parameters:
        this.config.responseMode === "reply-threaded" && msg.replyToTransportMessageId
          ? { message_id: Number(msg.replyToTransportMessageId) }
          : undefined
    });

    return {
      transportMessageId: String(response.message_id)
    };
  }

  async health(): Promise<HealthStatus> {
    return this.status;
  }
}
