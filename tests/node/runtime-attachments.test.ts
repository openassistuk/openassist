import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import type {
  ApiKeyAuth,
  ChannelAdapter,
  ChannelCapabilities,
  ChatRequest,
  ChatResponse,
  HealthStatus,
  InboundEnvelope,
  OutboundEnvelope,
  ProviderAdapter,
  ProviderAuthHandle,
  ProviderCapabilities,
  RuntimeConfig,
  ValidationResult
} from "@openassist/core-types";
import { OpenAssistRuntime } from "../../packages/core-runtime/src/runtime.js";
import { OpenAssistDatabase } from "../../packages/storage-sqlite/src/index.js";
import { createLogger } from "../../packages/observability/src/index.js";

class AttachmentAwareProvider implements ProviderAdapter {
  public requests: ChatRequest[] = [];

  id(): string {
    return "mock-provider";
  }

  capabilities(): ProviderCapabilities {
    return {
      supportsStreaming: false,
      supportsTools: false,
      supportsOAuth: false,
      supportsApiKeys: true,
      supportsImageInputs: false
    };
  }

  async validateConfig(): Promise<ValidationResult> {
    return { valid: true, errors: [] };
  }

  async chat(req: ChatRequest, _auth: ProviderAuthHandle | ApiKeyAuth): Promise<ChatResponse> {
    this.requests.push(req);
    return {
      output: {
        role: "assistant",
        content: "processed attachment request"
      },
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 }
    };
  }
}

class MockChannel implements ChannelAdapter {
  public sent: OutboundEnvelope[] = [];
  private handler: ((msg: InboundEnvelope) => Promise<void>) | null = null;

  id(): string {
    return "telegram-main";
  }

  capabilities(): ChannelCapabilities {
    return {
      supportsEdits: false,
      supportsDeletes: false,
      supportsReadReceipts: false,
      supportsFormattedText: true,
      supportsImageAttachments: true,
      supportsDocumentAttachments: true,
      supportsOutboundImageAttachments: true,
      supportsOutboundDocumentAttachments: true,
      supportsDirectRecipientDelivery: true
    };
  }

  async validateConfig(): Promise<ValidationResult> {
    return { valid: true, errors: [] };
  }

  async start(handler: (msg: InboundEnvelope) => Promise<void>): Promise<void> {
    this.handler = handler;
  }

  async stop(): Promise<void> {
    this.handler = null;
  }

  async send(msg: OutboundEnvelope): Promise<{ transportMessageId: string }> {
    this.sent.push(msg);
    return { transportMessageId: `sent-${this.sent.length}` };
  }

  async health(): Promise<HealthStatus> {
    return "healthy";
  }

  async emit(msg: InboundEnvelope): Promise<void> {
    if (!this.handler) {
      throw new Error("handler missing");
    }
    await this.handler(msg);
  }
}

function tempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("OpenAssistRuntime attachment handling", () => {
  it("persists inbound attachments, injects document text, and warns when the provider cannot inspect images", async () => {
    const root = tempDir("openassist-runtime-attachments-");
    roots.push(root);

    const imagePath = path.join(root, "sample.png");
    fs.writeFileSync(
      imagePath,
      Buffer.from(
        "89504e470d0a1a0a0000000d4948445200000001000000010802000000907724de0000000a49444154789c6360000002000154a24f5d0000000049454e44ae426082",
        "hex"
      )
    );
    const documentPath = path.join(root, "notes.txt");
    fs.writeFileSync(documentPath, "hello from the attached text file", "utf8");

    const logger = createLogger({ service: "test" });
    const db = new OpenAssistDatabase({ dbPath: path.join(root, "openassist.db"), logger });
    const provider = new AttachmentAwareProvider();
    const channel = new MockChannel();
    const runtimeConfig: RuntimeConfig = {
      bindAddress: "127.0.0.1",
      bindPort: 3344,
      defaultProviderId: "mock-provider",
      providers: [
        {
          id: "mock-provider",
          type: "openai-compatible",
          defaultModel: "x"
        }
      ],
      channels: [
        {
          id: "telegram-main",
          type: "telegram",
          enabled: true,
          settings: {}
        }
      ],
      defaultPolicyProfile: "operator",
      paths: {
        dataDir: root,
        skillsDir: path.join(root, "skills"),
        logsDir: path.join(root, "logs")
      },
      time: {
        ntpPolicy: "off",
        ntpCheckIntervalSec: 300,
        ntpMaxSkewMs: 10_000,
        ntpHttpSources: [],
        requireTimezoneConfirmation: false
      },
      scheduler: {
        enabled: false,
        tickIntervalMs: 1000,
        heartbeatIntervalSec: 30,
        defaultMisfirePolicy: "catch-up-once",
        tasks: []
      }
    };

    const runtime = new OpenAssistRuntime(
      runtimeConfig,
      { db, logger },
      { providers: [provider], channels: [channel] }
    );
    runtime.setProviderApiKey("mock-provider", "key");
    await runtime.start();

    await channel.emit({
      channel: "telegram",
      channelId: "telegram-main",
      transportMessageId: "m1",
      conversationKey: "chat-1",
      senderId: "u1",
      text: "please review these attachments",
      attachments: [
        {
          id: "image-1",
          kind: "image",
          name: "sample.png",
          mimeType: "image/png",
          localPath: imagePath
        },
        {
          id: "doc-1",
          kind: "document",
          name: "notes.txt",
          mimeType: "text/plain",
          localPath: documentPath
        }
      ],
      receivedAt: new Date().toISOString(),
      idempotencyKey: "attachment-turn-1"
    });

    assert.equal(provider.requests.length, 1);
    assert.ok(
      provider.requests[0]?.messages.some(
        (message) =>
          message.role === "system" &&
          message.content.includes("cannot inspect image binaries in this session")
      )
    );
    assert.ok(
      provider.requests[0]?.messages.some(
        (message) =>
          message.role === "user" &&
          message.content.includes("Image attachment: sample.png") &&
          message.content.includes("Document attachment: notes.txt") &&
          message.content.includes("hello from the attached text file")
      )
    );

    assert.equal(channel.sent.length, 1);
    assert.match(
      channel.sent[0]?.text ?? "",
      /could not inspect the image binary for this reply/i
    );

    const rows = db.getRecentMessages("telegram-main:chat-1", 10);
    assert.equal(rows[0]?.attachments?.length, 2);
    assert.ok(rows[0]?.attachments?.every((attachment) => attachment.localPath?.includes(path.join("attachments", "telegram-main"))));

    await runtime.stop();
    db.close();
  });
});
