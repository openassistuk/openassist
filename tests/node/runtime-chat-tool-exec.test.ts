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

class ToolProvider implements ProviderAdapter {
  public calls: ChatRequest[] = [];
  private readonly writePath: string;

  constructor(writePath: string) {
    this.writePath = writePath;
  }

  id(): string {
    return "mock-provider";
  }

  capabilities(): ProviderCapabilities {
    return {
      supportsStreaming: false,
      supportsTools: true,
      supportsOAuth: false,
      supportsApiKeys: true,
      supportsImageInputs: false
    };
  }

  async validateConfig(): Promise<ValidationResult> {
    return { valid: true, errors: [] };
  }

  async chat(req: ChatRequest, _auth: ProviderAuthHandle | ApiKeyAuth): Promise<ChatResponse> {
    this.calls.push(req);
    if (this.calls.length === 1) {
      return {
        output: { role: "assistant", content: "" },
        usage: { inputTokens: 2, outputTokens: 1, totalTokens: 3 },
        toolCalls: [
          {
            id: "call-1",
            name: "fs.write",
            argumentsJson: JSON.stringify({
              path: this.writePath,
              content: "from-tool"
            })
          }
        ]
      };
    }

    if (this.calls.length === 2) {
      return {
        output: { role: "assistant", content: "" },
        usage: { inputTokens: 2, outputTokens: 1, totalTokens: 3 },
        toolCalls: [
          {
            id: "call-2",
            name: "channel.send",
            argumentsJson: JSON.stringify({
              mode: "reply",
              attachmentPaths: [this.writePath],
              reason: "return the requested artifact to the current chat"
            })
          }
        ]
      };
    }

    return {
      output: { role: "assistant", content: "Tool execution complete." },
      usage: { inputTokens: 4, outputTokens: 2, totalTokens: 6 }
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

function baseConfig(root: string): RuntimeConfig {
  return {
    bindAddress: "127.0.0.1",
    bindPort: 3344,
    defaultProviderId: "mock-provider",
    providers: [{ id: "mock-provider", type: "openai-compatible", defaultModel: "x" }],
    channels: [
      {
        id: "telegram-mock",
        type: "telegram",
        enabled: true,
        settings: {
          operatorUserIds: ["u1"]
        }
      }
    ],
    defaultPolicyProfile: "full-root",
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
    },
    tools: {
      fs: { workspaceOnly: false, allowedReadPaths: [], allowedWritePaths: [] },
      exec: {
        defaultTimeoutMs: 60_000,
        guardrails: { mode: "minimal", extraBlockedPatterns: [] }
      },
      pkg: {
        enabled: false,
        preferStructuredInstall: true,
        allowExecFallback: true,
        sudoNonInteractive: true,
        allowedManagers: []
      }
    }
  };
}

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("runtime chat tool exec", () => {
  it("runs channel.send to return a generated artifact through the current chat", async () => {
    const root = tempDir("openassist-runtime-tool-exec-");
    roots.push(root);
    const writePath = path.join(root, "tool-output.txt");

    const logger = createLogger({ service: "test" });
    const db = new OpenAssistDatabase({ dbPath: path.join(root, "openassist.db"), logger });
    const provider = new ToolProvider(writePath);
    const channel = new MockChannel();
    const runtime = new OpenAssistRuntime(
      baseConfig(root),
      { db, logger },
      { providers: [provider], channels: [channel] }
    );

    runtime.setProviderApiKey("mock-provider", "test-key");
    await runtime.start();
    await channel.emit({
      channel: "telegram",
      channelId: "telegram-mock",
      transportMessageId: "m1",
      conversationKey: "conv-1",
      senderId: "u1",
      text: "write a file",
      attachments: [],
      receivedAt: new Date().toISOString(),
      idempotencyKey: "in-1"
    });

    assert.equal(provider.calls.length, 3);
    assert.ok(provider.calls[0]?.tools.some((tool) => tool.name === "channel.send"));
    assert.equal(fs.readFileSync(writePath, "utf8"), "from-tool");
    assert.equal(channel.sent.length, 2);
    assert.equal(channel.sent[0]?.attachments?.length, 1);
    assert.equal(channel.sent[0]?.attachments?.[0]?.name, "tool-output.txt");
    assert.ok(channel.sent[0]?.attachments?.[0]?.localPath);
    assert.notEqual(channel.sent[0]?.attachments?.[0]?.localPath, writePath);
    assert.equal(channel.sent[0]?.text, "OpenAssist reply: requested file output attached.");
    assert.equal(channel.sent[1]?.text, "Tool execution complete.");
    assert.equal(fs.existsSync(channel.sent[0]!.attachments![0]!.localPath), false);

    const invocations = runtime.listToolInvocations("telegram-mock:conv-1", 10);
    assert.equal(invocations.length, 2);
    assert.equal(invocations[0]?.toolName, "channel.send");
    assert.equal(invocations[0]?.status, "succeeded");
    assert.equal(invocations[1]?.toolName, "fs.write");
    assert.equal(invocations[1]?.status, "succeeded");

    await runtime.stop();
    db.close();
  });
});
