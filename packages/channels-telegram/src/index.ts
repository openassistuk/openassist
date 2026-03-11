import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Bot, InputFile } from "grammy";
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
  allowedChatIds: z.array(z.string()).default([]),
  conversationMode: z.enum(["chat", "chat-thread"]).default("chat"),
  responseMode: z.enum(["inline", "reply-threaded"]).default("inline")
});

export interface TelegramChannelConfig extends z.infer<typeof configSchema> {}

const MAX_TELEGRAM_ATTACHMENT_DOWNLOAD_BYTES = 20_000_000;
const TELEGRAM_CAPTION_LIMIT = 1024;

function sanitizeFileName(value: string | undefined, fallback: string): string {
  const normalized = (value ?? "").trim();
  if (normalized.length === 0) {
    return fallback;
  }
  return normalized.replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^_+|_+$/g, "") || fallback;
}

async function persistTempFile(bytes: Uint8Array): Promise<string> {
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "openassist-telegram-"));
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
    throw new Error(`telegram attachment exceeds download limit (${advertisedLength} bytes)`);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    const fallback = new Uint8Array(await response.arrayBuffer());
    if (fallback.byteLength > maxBytes) {
      throw new Error(`telegram attachment exceeds download limit (${fallback.byteLength} bytes)`);
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
      throw new Error(`telegram attachment exceeds download limit (${total} bytes)`);
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

async function downloadTelegramFile(
  botToken: string,
  filePath: string,
  expectedSizeBytes?: number
): Promise<string> {
  if (
    typeof expectedSizeBytes === "number" &&
    expectedSizeBytes > MAX_TELEGRAM_ATTACHMENT_DOWNLOAD_BYTES
  ) {
    throw new Error(
      `telegram attachment exceeds download limit (${expectedSizeBytes} bytes)`
    );
  }
  const response = await fetch(`https://api.telegram.org/file/bot${botToken}/${filePath}`);
  if (!response.ok) {
    throw new Error(`telegram file download failed (${response.status})`);
  }
  const bytes = await readResponseBytesWithLimit(response, MAX_TELEGRAM_ATTACHMENT_DOWNLOAD_BYTES);
  return persistTempFile(bytes);
}

async function extractAttachments(
  bot: Bot,
  botToken: string,
  message: any
): Promise<AttachmentRef[]> {
  const attachments: AttachmentRef[] = [];
  const captionText = typeof message?.caption === "string" ? message.caption : undefined;

  const photos = Array.isArray(message?.photo) ? message.photo : [];
  const photo = photos.length > 0 ? photos[photos.length - 1] : undefined;
  if (photo?.file_id) {
    const file = await bot.api.getFile(photo.file_id);
    if (file.file_path) {
      attachments.push({
        id: String(photo.file_unique_id ?? photo.file_id),
        kind: "image",
        name: sanitizeFileName(undefined, `telegram-photo-${photo.file_id}.jpg`),
        mimeType: "image/jpeg",
        localPath: await downloadTelegramFile(
          botToken,
          String(file.file_path),
          typeof photo.file_size === "number" ? photo.file_size : undefined
        ),
        sizeBytes: typeof photo.file_size === "number" ? photo.file_size : undefined,
        captionText
      });
    }
  }

  const document = message?.document;
  if (document?.file_id) {
    const file = await bot.api.getFile(document.file_id);
    if (file.file_path) {
      const name = sanitizeFileName(
        typeof document.file_name === "string" ? document.file_name : undefined,
        `telegram-file-${document.file_id}`
      );
      attachments.push({
        id: String(document.file_unique_id ?? document.file_id),
        kind: typeof document.mime_type === "string" && document.mime_type.startsWith("image/")
          ? "image"
          : "document",
        name,
        mimeType: typeof document.mime_type === "string" ? document.mime_type : undefined,
        localPath: await downloadTelegramFile(
          botToken,
          String(file.file_path),
          typeof document.file_size === "number" ? document.file_size : undefined
        ),
        sizeBytes: typeof document.file_size === "number" ? document.file_size : undefined,
        captionText
      });
    }
  }

  return attachments;
}

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

function appendDeliveryNotes(text: string | undefined, notes: string[]): string {
  const filtered = notes.filter((note) => note.trim().length > 0);
  if (filtered.length === 0) {
    return text?.trim() ?? "";
  }

  const noteBlock = `OpenAssist notes:\n${filtered.map((note) => `- ${note}`).join("\n")}`;
  const trimmed = text?.trim() ?? "";
  return trimmed.length > 0 ? `${trimmed}\n\n${noteBlock}` : noteBlock;
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
      supportsReadReceipts: false,
      supportsFormattedText: true,
      supportsImageAttachments: true,
      supportsDocumentAttachments: true,
      supportsOutboundImageAttachments: true,
      supportsOutboundDocumentAttachments: true,
      supportsDirectRecipientDelivery: true
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

    bot.on("message", async (ctx) => {
      const chatId = String(ctx.chat.id);
      if (this.config.allowedChatIds.length > 0 && !this.config.allowedChatIds.includes(chatId)) {
        return;
      }
      let attachments: AttachmentRef[] = [];
      try {
        attachments = await extractAttachments(bot, this.config.botToken, ctx.msg);
      } catch (error) {
        warnAttachmentFailure(
          `telegram attachment extraction failed for chat ${chatId} message ${ctx.msg.message_id}; continuing with text-only message`,
          error
        );
      }
      const text =
        typeof ctx.msg.text === "string"
          ? ctx.msg.text
          : typeof ctx.msg.caption === "string"
            ? ctx.msg.caption
            : undefined;
      if ((!text || text.trim().length === 0) && attachments.length === 0) {
        return;
      }
      const threadId = ctx.msg.message_thread_id;
      const conversationKey =
        this.config.conversationMode === "chat-thread" && typeof threadId === "number"
          ? `${chatId}:${String(threadId)}`
          : chatId;

      await handler({
        channel: "telegram",
        channelId: this.config.id,
        transportMessageId: String(ctx.msg.message_id),
        conversationKey,
        senderId: String(ctx.from?.id ?? "unknown"),
        text,
        attachments,
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

    const target = parseConversationKey(msg.directRecipientUserId ?? msg.conversationKey);
    const parseMode = msg.metadata.renderFormat === "telegram-html" ? ("HTML" as const) : undefined;
    const replyParameters =
      !msg.directRecipientUserId &&
      this.config.responseMode === "reply-threaded" &&
      msg.replyToTransportMessageId
        ? { message_id: Number(msg.replyToTransportMessageId) }
        : undefined;
    const threadId = !msg.directRecipientUserId ? target.threadId : undefined;
    const missingAttachmentNotes: string[] = [];
    const attachments = (msg.attachments ?? []).filter((attachment) => {
      if (fs.existsSync(attachment.localPath)) {
        return true;
      }
      missingAttachmentNotes.push(
        `${attachment.name} could not be attached because the staged file is missing.`
      );
      return false;
    });
    const text = appendDeliveryNotes(msg.text, missingAttachmentNotes);

    if (attachments.length === 0) {
      const response = await this.bot.api.sendMessage(
        target.chatId,
        text || "OpenAssist could not deliver the requested files.",
        {
          message_thread_id: threadId,
          parse_mode: parseMode,
          reply_parameters: replyParameters
        }
      );

      return {
        transportMessageId: String(response.message_id)
      };
    }

    const captionText = text.length > 0 && text.length <= TELEGRAM_CAPTION_LIMIT ? text : undefined;
    const trailingText = text.length > 0 && !captionText ? text : undefined;
    let firstMessageId = "";
    for (const [index, attachment] of attachments.entries()) {
      const sendOptions = {
        message_thread_id: threadId,
        parse_mode: index === 0 && captionText ? parseMode : undefined,
        reply_parameters: index === 0 ? replyParameters : undefined
      };
      const response =
        attachment.kind === "image"
          ? await this.bot.api.sendPhoto(
              target.chatId,
              new InputFile(attachment.localPath, attachment.name),
              {
                ...sendOptions,
                caption: index === 0 ? captionText : undefined
              }
            )
          : await this.bot.api.sendDocument(
              target.chatId,
              new InputFile(attachment.localPath, attachment.name),
              {
                ...sendOptions,
                caption: index === 0 ? captionText : undefined
              }
            );
      firstMessageId ||= String(response.message_id);
    }

    if (trailingText) {
      const response = await this.bot.api.sendMessage(target.chatId, trailingText, {
        message_thread_id: threadId,
        parse_mode: parseMode
      });
      firstMessageId ||= String(response.message_id);
    }

    return {
      transportMessageId: firstMessageId || `telegram:${Date.now()}`
    };
  }

  async health(): Promise<HealthStatus> {
    return this.status;
  }
}
