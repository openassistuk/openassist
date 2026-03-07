import { describe, expect, it } from "vitest";
import { TelegramChannelAdapter } from "../../packages/channels-telegram/src/index.js";
import { DiscordChannelAdapter } from "../../packages/channels-discord/src/index.js";
import { WhatsAppMdChannelAdapter } from "../../packages/channels-whatsapp-md/src/index.js";

describe("channel adapter send behavior", () => {
  it("sends Telegram replies with HTML parse mode and thread/reply targeting", async () => {
    const adapter = new TelegramChannelAdapter({
      id: "telegram-main",
      botToken: "token",
      allowedChatIds: [],
      conversationMode: "chat-thread",
      responseMode: "reply-threaded"
    });

    let captured: { chatId: string; text: string; options: Record<string, unknown> } | undefined;
    (adapter as any).bot = {
      api: {
        sendMessage: async (chatId: string, text: string, options: Record<string, unknown>) => {
          captured = { chatId, text, options };
          return { message_id: 42 };
        }
      }
    };

    const result = await adapter.send({
      channel: "telegram",
      conversationKey: "12345:7",
      text: "<b>formatted</b>",
      replyToTransportMessageId: "9",
      metadata: {
        renderFormat: "telegram-html"
      }
    });

    expect(result.transportMessageId).toBe("42");
    expect(captured).toEqual({
      chatId: "12345",
      text: "<b>formatted</b>",
      options: {
        message_thread_id: 7,
        parse_mode: "HTML",
        reply_parameters: {
          message_id: 9
        }
      }
    });
  });

  it("sends Discord replies through any text-capable channel and preserves reply references", async () => {
    const adapter = new DiscordChannelAdapter({
      id: "discord-main",
      botToken: "token",
      allowedChannelIds: [],
      allowedDmUserIds: []
    });

    let capturedPayload: Record<string, unknown> | undefined;
    (adapter as any).client = {
      channels: {
        fetch: async () => ({
          isTextBased: () => true,
          send: async (payload: Record<string, unknown>) => {
            capturedPayload = payload;
            return { id: "discord-sent-1" };
          }
        })
      }
    };

    const result = await adapter.send({
      channel: "discord",
      conversationKey: "channel-123",
      text: "**hello**",
      replyToTransportMessageId: "msg-9",
      metadata: {}
    });

    expect(result.transportMessageId).toBe("discord-sent-1");
    expect(capturedPayload).toEqual({
      content: "**hello**",
      reply: {
        messageReference: "msg-9",
        failIfNotExists: false
      }
    });
  });

  it("sends WhatsApp replies with quoted context when replying to an inbound message", async () => {
    const adapter = new WhatsAppMdChannelAdapter({
      id: "whatsapp-main",
      mode: "production",
      sessionDir: ".openassist/data/whatsapp-md",
      printQrInTerminal: false,
      syncFullHistory: false,
      maxReconnectAttempts: 1,
      reconnectDelayMs: 1000,
      browserName: "OpenAssist",
      browserVersion: "0.1.0",
      browserPlatform: "Linux"
    });

    let capturedOptions: Record<string, unknown> | undefined;
    (adapter as any).socket = {
      sendMessage: async (_jid: string, _payload: Record<string, unknown>, options: Record<string, unknown>) => {
        capturedOptions = options;
        return { key: { id: "wa-sent-1" } };
      }
    };

    const result = await adapter.send({
      channel: "whatsapp-md",
      conversationKey: "447700900000@s.whatsapp.net",
      text: "hello",
      replyToTransportMessageId: "wa-msg-9",
      metadata: {}
    });

    expect(result.transportMessageId).toBe("wa-sent-1");
    expect((capturedOptions?.quoted as any)?.key?.id).toBe("wa-msg-9");
  });
});
