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

class MemoryAwareProvider implements ProviderAdapter {
  public requests: ChatRequest[] = [];
  public sidecarCalls = 0;

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
    if (req.metadata.source === "runtime.memory.sidecar") {
      this.sidecarCalls += 1;
      return {
        output: {
          role: "assistant",
          content: JSON.stringify({
            sessionSummary:
              "The operator prefers Debian apt commands and is working on a home lab refresh.",
            memories: [
              {
                category: "preference",
                summary: "Use Debian apt commands when giving package instructions.",
                keywords: ["debian", "apt", "packages"],
                salience: 4
              },
              {
                category: "goal",
                summary: "Home lab refresh is an ongoing project.",
                keywords: ["homelab", "refresh"],
                salience: 3
              }
            ]
          })
        },
        usage: { inputTokens: 10, outputTokens: 10, totalTokens: 20 }
      };
    }

    const recalled = req.messages.some(
      (message) =>
        message.role === "system" &&
        (message.content.includes("OpenAssist durable actor memory") ||
          message.content.includes("OpenAssist rolling session summary"))
    );
    return {
      output: {
        role: "assistant",
        content: recalled ? "recalled durable memory" : "standard reply"
      },
      usage: { inputTokens: 2, outputTokens: 2, totalTokens: 4 }
    };
  }
}

class MockChannel implements ChannelAdapter {
  public sent: OutboundEnvelope[] = [];
  private handler: ((msg: InboundEnvelope) => Promise<void>) | null = null;

  id(): string {
    return "telegram-mock";
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

function buildConfig(
  root: string,
  overrides: Partial<Pick<RuntimeConfig, "memory">> = {}
): RuntimeConfig {
  return {
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
        id: "telegram-mock",
        type: "telegram",
        enabled: true,
        settings: {}
      }
    ],
    defaultPolicyProfile: "operator",
    operatorAccessProfile: "operator",
    memory: overrides.memory,
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
}

function inbound(
  conversationKey: string,
  senderId: string,
  text: string,
  idempotencyKey: string
): InboundEnvelope {
  return {
    channel: "telegram",
    channelId: "telegram-mock",
    transportMessageId: `msg-${idempotencyKey}`,
    conversationKey,
    senderId,
    text,
    attachments: [],
    receivedAt: new Date().toISOString(),
    idempotencyKey
  };
}

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("runtime memory behavior", () => {
  it("compacts session history, stores durable actor memory, and recalls it across chats", async () => {
    const root = tempDir("openassist-runtime-memory-");
    roots.push(root);

    const logger = createLogger({ service: "test" });
    const db = new OpenAssistDatabase({ dbPath: path.join(root, "openassist.db"), logger });
    const provider = new MemoryAwareProvider();
    const channel = new MockChannel();
    const runtime = new OpenAssistRuntime(
      buildConfig(root),
      { db, logger },
      { providers: [provider], channels: [channel] }
    );
    runtime.setProviderApiKey("mock-provider", "key");
    await runtime.start();

    for (let turn = 1; turn <= 8; turn += 1) {
      await channel.emit(inbound("chat-1", "u1", `message ${turn}`, `memory-${turn}`));
    }

    const status = await runtime.getMemoryStatus("telegram-mock:chat-1", "u1");
    assert.equal(status.enabled, true);
    assert.ok(status.sessionSummary);
    assert.match(status.sessionSummary?.summary ?? "", /Debian apt commands/i);
    assert.equal(status.permanentMemories.length, 2);
    assert.ok(provider.sidecarCalls >= 1);

    const providerRequestCountBeforeMemoryCommand = provider.requests.length;
    await channel.emit(inbound("chat-1", "u1", "/memory", "memory-command"));
    assert.equal(provider.requests.length, providerRequestCountBeforeMemoryCommand);
    assert.match(channel.sent.at(-1)?.text ?? "", /OpenAssist memory status/i);
    assert.match(channel.sent.at(-1)?.text ?? "", /visible permanent memories: 2/i);

    await channel.emit(inbound("chat-2", "u1", "How should I install ripgrep on Debian?", "memory-recall"));
    const sameActorRequest = provider.requests.find((request) => request.sessionId === "telegram-mock:chat-2");
    assert.ok(sameActorRequest);
    assert.equal(
      sameActorRequest?.messages.some((message) => /OpenAssist durable actor memory/i.test(message.content)),
      true
    );
    assert.equal(channel.sent.at(-1)?.text, "recalled durable memory");

    await channel.emit(inbound("chat-3", "u2", "How should I install ripgrep on Debian?", "memory-isolation"));
    const differentActorRequest = provider.requests.find((request) => request.sessionId === "telegram-mock:chat-3");
    assert.ok(differentActorRequest);
    assert.equal(
      differentActorRequest?.messages.some((message) => /OpenAssist durable actor memory/i.test(message.content)),
      false
    );
    assert.equal(channel.sent.at(-1)?.text, "standard reply");

    await runtime.stop();
    db.close();
  });

  it("keeps rolling session summaries when permanent memory is disabled", async () => {
    const root = tempDir("openassist-runtime-memory-disabled-");
    roots.push(root);

    const logger = createLogger({ service: "test" });
    const db = new OpenAssistDatabase({ dbPath: path.join(root, "openassist.db"), logger });
    const provider = new MemoryAwareProvider();
    const channel = new MockChannel();
    const runtime = new OpenAssistRuntime(
      buildConfig(root, {
        memory: {
          enabled: false
        }
      }),
      { db, logger },
      { providers: [provider], channels: [channel] }
    );
    runtime.setProviderApiKey("mock-provider", "key");
    await runtime.start();

    for (let turn = 1; turn <= 8; turn += 1) {
      await channel.emit(inbound("chat-1", "u1", `message ${turn}`, `memory-off-${turn}`));
    }

    const status = await runtime.getMemoryStatus("telegram-mock:chat-1", "u1");
    assert.equal(status.enabled, false);
    assert.ok(status.sessionSummary);
    assert.equal(status.permanentMemories.length, 0);

    await channel.emit(inbound("chat-2", "u1", "Do you remember my package preference?", "memory-off-recall"));
    const request = provider.requests.find((item) => item.sessionId === "telegram-mock:chat-2");
    assert.ok(request);
    assert.equal(
      request?.messages.some((message) => /OpenAssist durable actor memory/i.test(message.content)),
      false
    );
    assert.equal(
      request?.messages.some((message) => /OpenAssist rolling session summary/i.test(message.content)),
      false
    );

    await runtime.stop();
    db.close();
  });
});
