import fs from "node:fs";
import path from "node:path";
import {
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeWASocket,
  useMultiFileAuthState
} from "@whiskeysockets/baileys";
import pino from "pino";
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
  mode: z.enum(["production", "experimental"]).default("production"),
  sessionDir: z.string().min(1).default(".openassist/data/whatsapp-md"),
  printQrInTerminal: z.boolean().default(true),
  syncFullHistory: z.boolean().default(false),
  maxReconnectAttempts: z.number().int().min(0).max(100).default(10),
  reconnectDelayMs: z.number().int().min(100).max(300_000).default(5000),
  browserName: z.string().default("OpenAssist"),
  browserVersion: z.string().default("0.1.0"),
  browserPlatform: z.string().default("Linux")
});

export type WhatsAppMdChannelConfig = z.infer<typeof configSchema>;

function extractText(message: any): string | undefined {
  if (!message) {
    return undefined;
  }

  if (typeof message.conversation === "string") {
    return message.conversation;
  }
  if (typeof message.extendedTextMessage?.text === "string") {
    return message.extendedTextMessage.text;
  }
  if (typeof message.imageMessage?.caption === "string") {
    return message.imageMessage.caption;
  }
  if (typeof message.videoMessage?.caption === "string") {
    return message.videoMessage.caption;
  }
  if (message.ephemeralMessage?.message) {
    return extractText(message.ephemeralMessage.message);
  }
  if (message.viewOnceMessage?.message) {
    return extractText(message.viewOnceMessage.message);
  }
  return undefined;
}

function normalizeJid(value: string): string {
  if (value.includes("@")) {
    return value;
  }
  return `${value}@s.whatsapp.net`;
}

export class WhatsAppMdChannelAdapter implements ChannelAdapter {
  private readonly config: WhatsAppMdChannelConfig;
  private readonly logger = pino({ name: "openassist-whatsapp-md", level: "info" });
  private status: HealthStatus = "degraded";
  private handler: ((msg: InboundEnvelope) => Promise<void>) | null = null;
  private socket: any | null = null;
  private saveCreds: (() => Promise<void>) | null = null;
  private reconnectAttempts = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private stopRequested = false;
  private lastQr?: string;

  constructor(config: WhatsAppMdChannelConfig) {
    this.config = configSchema.parse(config);
  }

  id(): string {
    return this.config.id;
  }

  capabilities(): ChannelCapabilities {
    return {
      supportsEdits: false,
      supportsDeletes: false,
      supportsReadReceipts: true
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
    this.handler = handler;
    this.stopRequested = false;
    fs.mkdirSync(path.resolve(this.config.sessionDir), { recursive: true });
    await this.connect();
  }

  async stop(): Promise<void> {
    this.stopRequested = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.socket) {
      try {
        this.socket.ws.close();
      } catch {
        // Ignore shutdown socket errors.
      }
    }
    this.socket = null;
    this.status = "unhealthy";
  }

  async send(msg: OutboundEnvelope): Promise<{ transportMessageId: string }> {
    if (!this.socket) {
      throw new Error("WhatsApp MD adapter is not connected");
    }

    const jid = normalizeJid(msg.conversationKey);
    const sent = await this.socket.sendMessage(jid, { text: msg.text });
    const sentId = sent?.key?.id ?? `wa-md:${Date.now()}:${jid}`;

    return {
      transportMessageId: String(sentId)
    };
  }

  async health(): Promise<HealthStatus> {
    return this.status;
  }

  getLastQr(): string | undefined {
    return this.lastQr;
  }

  private async connect(): Promise<void> {
    const { state, saveCreds } = await useMultiFileAuthState(path.resolve(this.config.sessionDir));
    this.saveCreds = saveCreds;
    const { version } = await fetchLatestBaileysVersion();

    const socket = makeWASocket({
      auth: state,
      version,
      printQRInTerminal: this.config.printQrInTerminal,
      syncFullHistory: this.config.syncFullHistory,
      browser: [
        this.config.browserName,
        this.config.browserPlatform,
        this.config.browserVersion
      ],
      markOnlineOnConnect: true,
      logger: this.logger
    });

    socket.ev.on("creds.update", async () => {
      if (this.saveCreds) {
        await this.saveCreds();
      }
    });

    socket.ev.on("connection.update", async (update: any) => {
      const connection = update.connection as string | undefined;
      if (typeof update.qr === "string") {
        this.lastQr = update.qr;
        this.status = "degraded";
      }

      if (connection === "open") {
        this.reconnectAttempts = 0;
        this.status = "healthy";
        this.logger.info({ channelId: this.config.id }, "whatsapp md connected");
      }

      if (connection === "close") {
        this.status = "degraded";

        const statusCode = update.lastDisconnect?.error?.output?.statusCode as
          | number
          | undefined;
        const loggedOut = statusCode === DisconnectReason.loggedOut;
        if (loggedOut || this.stopRequested) {
          this.status = "unhealthy";
          this.logger.warn(
            { channelId: this.config.id, loggedOut, statusCode },
            "whatsapp md disconnected without reconnect"
          );
          return;
        }

        this.scheduleReconnect();
      }
    });

    socket.ev.on("messages.upsert", async (event: any) => {
      if (!this.handler) {
        return;
      }
      if (event.type !== "notify") {
        return;
      }

      const messages: any[] = Array.isArray(event.messages) ? event.messages : [];
      for (const message of messages) {
        if (message.key?.fromMe) {
          continue;
        }
        const remoteJid = message.key?.remoteJid;
        const messageId = message.key?.id;
        if (typeof remoteJid !== "string" || typeof messageId !== "string") {
          continue;
        }

        const text = extractText(message.message);
        if (!text) {
          continue;
        }

        const senderId = (message.key?.participant as string | undefined) ?? remoteJid;
        await this.handler({
          channel: "whatsapp-md",
          channelId: this.config.id,
          transportMessageId: messageId,
          conversationKey: remoteJid,
          senderId,
          text,
          attachments: [],
          receivedAt: new Date().toISOString(),
          idempotencyKey: `wa-md:${remoteJid}:${messageId}`
        });
      }
    });

    this.socket = socket;
  }

  private scheduleReconnect(): void {
    if (this.stopRequested) {
      return;
    }

    if (this.reconnectAttempts >= this.config.maxReconnectAttempts) {
      this.status = "unhealthy";
      this.logger.error(
        { channelId: this.config.id, attempts: this.reconnectAttempts },
        "whatsapp md reconnect attempts exhausted"
      );
      return;
    }

    this.reconnectAttempts += 1;
    const baseDelay = this.config.reconnectDelayMs;
    const jitter = Math.floor(Math.random() * 1000);
    const delay = baseDelay + jitter;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }
    this.reconnectTimer = setTimeout(() => {
      this.connect().catch((error) => {
        this.logger.error({ error }, "whatsapp md reconnect attempt failed");
        this.scheduleReconnect();
      });
    }, delay);
  }
}
