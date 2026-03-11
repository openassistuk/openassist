import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { TelegramChannelAdapter } from "../../packages/channels-telegram/src/index.js";
import { DiscordChannelAdapter } from "../../packages/channels-discord/src/index.js";
import { WhatsAppMdChannelAdapter } from "../../packages/channels-whatsapp-md/src/index.js";

function tempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function writeTempFile(root: string, name: string, content = "test"): string {
  const filePath = path.join(root, name);
  fs.writeFileSync(filePath, content, "utf8");
  return filePath;
}

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

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

  it("sends Telegram attachments to a direct recipient without thread or reply targeting", async () => {
    const root = tempDir("openassist-telegram-send-");
    roots.push(root);

    const adapter = new TelegramChannelAdapter({
      id: "telegram-main",
      botToken: "token",
      allowedChatIds: [],
      conversationMode: "chat-thread",
      responseMode: "reply-threaded"
    });

    const calls: Array<{ kind: string; chatId: string; fileName?: string; options: Record<string, unknown> }> = [];
    (adapter as any).bot = {
      api: {
        sendPhoto: async (chatId: string, file: { filename?: string }, options: Record<string, unknown>) => {
          calls.push({ kind: "photo", chatId, fileName: file.filename, options });
          return { message_id: 100 };
        },
        sendDocument: async (chatId: string, file: { filename?: string }, options: Record<string, unknown>) => {
          calls.push({ kind: "document", chatId, fileName: file.filename, options });
          return { message_id: 101 };
        },
        sendMessage: async (_chatId: string, _text: string, _options: Record<string, unknown>) => {
          throw new Error("unexpected trailing text send");
        }
      }
    };

    const result = await adapter.send({
      channel: "telegram",
      conversationKey: "12345:7",
      directRecipientUserId: "555777999",
      text: "<b>artifact ready</b>",
      replyToTransportMessageId: "9",
      attachments: [
        {
          id: "img-1",
          kind: "image",
          name: "chart.png",
          localPath: writeTempFile(root, "chart.png"),
          mimeType: "image/png"
        },
        {
          id: "doc-1",
          kind: "document",
          name: "report.txt",
          localPath: writeTempFile(root, "report.txt"),
          mimeType: "text/plain"
        }
      ],
      metadata: {
        renderFormat: "telegram-html"
      }
    });

    expect(result.transportMessageId).toBe("100");
    expect(calls).toEqual([
      {
        kind: "photo",
        chatId: "555777999",
        fileName: "chart.png",
        options: {
          message_thread_id: undefined,
          parse_mode: "HTML",
          reply_parameters: undefined,
          caption: "<b>artifact ready</b>"
        }
      },
      {
        kind: "document",
        chatId: "555777999",
        fileName: "report.txt",
        options: {
          message_thread_id: undefined,
          parse_mode: undefined,
          reply_parameters: undefined,
          caption: undefined
        }
      }
    ]);
  });

  it("sends Discord attachments through an allowed DM route", async () => {
    const root = tempDir("openassist-discord-send-");
    roots.push(root);

    const adapter = new DiscordChannelAdapter({
      id: "discord-main",
      botToken: "token",
      allowedChannelIds: [],
      allowedDmUserIds: ["operator-1"]
    });

    let fetchedUserId: string | undefined;
    let capturedPayload: Record<string, unknown> | undefined;
    (adapter as any).client = {
      users: {
        fetch: async (userId: string) => {
          fetchedUserId = userId;
          return {
            createDM: async () => ({
              isTextBased: () => true,
              send: async (payload: Record<string, unknown>) => {
                capturedPayload = payload;
                return { id: "discord-dm-1" };
              }
            })
          };
        }
      },
      channels: {
        fetch: async () => {
          throw new Error("channel fetch should not be used for direct recipient delivery");
        }
      }
    };

    const result = await adapter.send({
      channel: "discord",
      conversationKey: "channel-123",
      directRecipientUserId: "operator-1",
      text: "**hello**",
      attachments: [
        {
          id: "doc-1",
          kind: "document",
          name: "report.txt",
          localPath: writeTempFile(root, "report.txt"),
          mimeType: "text/plain"
        }
      ],
      metadata: {}
    });

    expect(result.transportMessageId).toBe("discord-dm-1");
    expect(fetchedUserId).toBe("operator-1");
    expect(capturedPayload).toEqual({
      content: "**hello**",
      files: [
        {
          attachment: path.join(root, "report.txt"),
          name: "report.txt"
        }
      ],
      reply: undefined
    });
  });

  it("rejects Discord direct-recipient delivery when the DM allow-list does not include the recipient", async () => {
    const adapter = new DiscordChannelAdapter({
      id: "discord-main",
      botToken: "token",
      allowedChannelIds: [],
      allowedDmUserIds: []
    });

    (adapter as any).client = {
      users: {
        fetch: async () => ({
          createDM: async () => ({
            isTextBased: () => true,
            send: async () => ({ id: "never" })
          })
        })
      }
    };

    await expect(
      adapter.send({
        channel: "discord",
        conversationKey: "channel-123",
        directRecipientUserId: "operator-1",
        text: "hello",
        metadata: {}
      })
    ).rejects.toThrow(/allowedDmUserIds/i);
  });

  it("sends WhatsApp replies with a quoted attachment message in the current chat", async () => {
    const root = tempDir("openassist-whatsapp-send-");
    roots.push(root);

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

    const calls: Array<{ jid: string; payload: Record<string, unknown>; options: Record<string, unknown> }> = [];
    (adapter as any).socket = {
      sendMessage: async (jid: string, payload: Record<string, unknown>, options: Record<string, unknown>) => {
        calls.push({ jid, payload, options });
        return { key: { id: "wa-sent-1" } };
      }
    };

    const result = await adapter.send({
      channel: "whatsapp-md",
      conversationKey: "447700900000@s.whatsapp.net",
      text: "hello",
      replyToTransportMessageId: "wa-msg-9",
      attachments: [
        {
          id: "doc-1",
          kind: "document",
          name: "report.txt",
          localPath: writeTempFile(root, "report.txt"),
          mimeType: "text/plain"
        }
      ],
      metadata: {}
    });

    expect(result.transportMessageId).toBe("wa-sent-1");
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual({
      jid: "447700900000@s.whatsapp.net",
      payload: {
        document: { url: path.join(root, "report.txt") },
        mimetype: "text/plain",
        fileName: "report.txt",
        caption: "hello"
      },
      options: {
        quoted: {
          key: {
            remoteJid: "447700900000@s.whatsapp.net",
            fromMe: false,
            id: "wa-msg-9"
          },
          message: {
            conversation: ""
          }
        }
      }
    });
  });
});
