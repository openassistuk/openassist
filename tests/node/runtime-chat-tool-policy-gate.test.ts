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

class PolicyAwareProvider implements ProviderAdapter {
  private readonly writePath: string;
  public requests: ChatRequest[] = [];

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
    this.requests.push(req);
    if (req.tools.length === 0) {
      return {
        output: { role: "assistant", content: "no autonomous tools" },
        usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 }
      };
    }

    if (req.messages.some((message) => message.role === "tool")) {
      return {
        output: { role: "assistant", content: "tools executed" },
        usage: { inputTokens: 2, outputTokens: 2, totalTokens: 4 }
      };
    }

    return {
      output: { role: "assistant", content: "" },
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
      toolCalls: [
        {
          id: "tool-1",
          name: "fs.write",
          argumentsJson: JSON.stringify({
            path: this.writePath,
            content: "enabled"
          })
        }
      ]
    };
  }
}

class RogueToolProvider implements ProviderAdapter {
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

  async chat(_req: ChatRequest, _auth: ProviderAuthHandle | ApiKeyAuth): Promise<ChatResponse> {
    return {
      output: { role: "assistant", content: "" },
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
      toolCalls: [
        {
          id: "rogue-tool-1",
          name: "fs.write",
          argumentsJson: JSON.stringify({
            path: this.writePath,
            content: "should-not-write"
          })
        }
      ]
    };
  }
}

class NotifyProvider implements ProviderAdapter {
  public requests: ChatRequest[] = [];
  private readonly recipientUserId: string;

  constructor(recipientUserId: string) {
    this.recipientUserId = recipientUserId;
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
    this.requests.push(req);
    if (req.messages.some((message) => message.role === "tool")) {
      return {
        output: { role: "assistant", content: "notify attempt complete" },
        usage: { inputTokens: 2, outputTokens: 2, totalTokens: 4 }
      };
    }

    return {
      output: { role: "assistant", content: "" },
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
      toolCalls: [
        {
          id: "notify-tool-1",
          name: "channel.send",
          argumentsJson: JSON.stringify({
            mode: "notify",
            recipientUserId: this.recipientUserId,
            text: "Relevant operator notice",
            reason: "the operator asked for targeted notifications"
          })
        }
      ]
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
  overrides: Partial<{
    defaultPolicyProfile: RuntimeConfig["defaultPolicyProfile"];
    operatorAccessProfile: RuntimeConfig["operatorAccessProfile"];
    channelSettings: RuntimeConfig["channels"][number]["settings"];
  }> = {}
): RuntimeConfig {
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
        settings: overrides.channelSettings ?? {}
      }
    ],
    defaultPolicyProfile: overrides.defaultPolicyProfile ?? "operator",
    operatorAccessProfile: overrides.operatorAccessProfile ?? "operator",
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

function inbound(senderId: string, text: string, idempotencyKey: string): InboundEnvelope {
  return {
    channel: "telegram",
    channelId: "telegram-mock",
    transportMessageId: `msg-${idempotencyKey}`,
    conversationKey: "conv-1",
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

describe("runtime chat policy gating", () => {
  it("disables autonomous tools for operator and enables for full-root", async () => {
    const root = tempDir("openassist-policy-gate-");
    roots.push(root);
    const writePath = path.join(root, "autonomy.txt");
    const logger = createLogger({ service: "test" });
    const db = new OpenAssistDatabase({ dbPath: path.join(root, "openassist.db"), logger });
    const provider = new PolicyAwareProvider(writePath);
    const channel = new MockChannel();
    const runtime = new OpenAssistRuntime(
      buildConfig(root),
      { db, logger },
      { providers: [provider], channels: [channel] }
    );

    runtime.setProviderApiKey("mock-provider", "key");
    await runtime.start();

    await channel.emit(inbound("u1", "do work", "op-1"));
    assert.equal(channel.sent[0]?.text, "no autonomous tools");
    assert.equal(runtime.listToolInvocations("telegram-mock:conv-1", 10).length, 0);
    assert.equal(fs.existsSync(writePath), false);

    await runtime.setPolicyProfile("telegram-mock:conv-1", "full-root");
    await channel.emit(inbound("u1", "do work now", "fr-1"));

    assert.equal(channel.sent[1]?.text, "tools executed");
    assert.equal(fs.readFileSync(writePath, "utf8"), "enabled");
    assert.equal(runtime.listToolInvocations("telegram-mock:conv-1", 10).length, 1);

    await runtime.stop();
    db.close();
  });

  it("does not execute tool calls when provider returns them for non-full-root session", async () => {
    const root = tempDir("openassist-policy-gate-rogue-");
    roots.push(root);
    const writePath = path.join(root, "rogue.txt");
    const logger = createLogger({ service: "test" });
    const db = new OpenAssistDatabase({ dbPath: path.join(root, "openassist.db"), logger });
    const provider = new RogueToolProvider(writePath);
    const channel = new MockChannel();
    const runtime = new OpenAssistRuntime(
      buildConfig(root),
      { db, logger },
      { providers: [provider], channels: [channel] }
    );

    runtime.setProviderApiKey("mock-provider", "key");
    await runtime.start();

    await channel.emit(inbound("u1", "do work", "rogue-1"));

    assert.equal(channel.sent.length, 1);
    assert.equal(
      channel.sent[0]?.text,
      "Autonomous tool execution is disabled for this session profile."
    );
    assert.equal(runtime.listToolInvocations("telegram-mock:conv-1", 10).length, 0);
    assert.equal(fs.existsSync(writePath), false);

    await runtime.stop();
    db.close();
  });

  it("rejects targeted notify mode for non-approved senders even in full-root sessions", async () => {
    const root = tempDir("openassist-policy-gate-notify-blocked-");
    roots.push(root);
    const logger = createLogger({ service: "test" });
    const db = new OpenAssistDatabase({ dbPath: path.join(root, "openassist.db"), logger });
    const provider = new NotifyProvider("approved-user");
    const channel = new MockChannel();
    const runtime = new OpenAssistRuntime(
      buildConfig(root, {
        defaultPolicyProfile: "full-root",
        operatorAccessProfile: "full-root",
        channelSettings: { operatorUserIds: ["approved-user"] }
      }),
      { db, logger },
      { providers: [provider], channels: [channel] }
    );

    runtime.setProviderApiKey("mock-provider", "key");
    await runtime.start();

    await channel.emit(inbound("u1", "notify someone", "notify-blocked"));

    assert.equal(channel.sent.length, 1);
    assert.equal(channel.sent[0]?.directRecipientUserId, undefined);
    assert.equal(channel.sent[0]?.text, "notify attempt complete");
    const invocations = runtime.listToolInvocations("telegram-mock:conv-1", 10);
    assert.equal(invocations.length, 1);
    assert.equal(invocations[0]?.toolName, "channel.send");
    assert.equal(invocations[0]?.status, "failed");
    assert.match(String(invocations[0]?.errorText ?? ""), /approved operator/i);

    await runtime.stop();
    db.close();
  });

  it("allows targeted notify mode only to specifically configured operator recipients", async () => {
    const root = tempDir("openassist-policy-gate-notify-allowed-");
    roots.push(root);
    const logger = createLogger({ service: "test" });
    const db = new OpenAssistDatabase({ dbPath: path.join(root, "openassist.db"), logger });
    const provider = new NotifyProvider("recipient-user");
    const channel = new MockChannel();
    const runtime = new OpenAssistRuntime(
      buildConfig(root, {
        defaultPolicyProfile: "full-root",
        operatorAccessProfile: "full-root",
        channelSettings: { operatorUserIds: ["approved-user", "recipient-user"] }
      }),
      { db, logger },
      { providers: [provider], channels: [channel] }
    );

    runtime.setProviderApiKey("mock-provider", "key");
    await runtime.start();

    await channel.emit(inbound("approved-user", "notify someone", "notify-allowed"));

    assert.equal(channel.sent.length, 2);
    assert.equal(channel.sent[0]?.directRecipientUserId, "recipient-user");
    assert.equal(channel.sent[0]?.conversationKey, "recipient-user");
    assert.equal(channel.sent[0]?.text, "Relevant operator notice");
    assert.equal(channel.sent[1]?.directRecipientUserId, undefined);
    assert.equal(channel.sent[1]?.text, "notify attempt complete");
    const invocations = runtime.listToolInvocations("telegram-mock:conv-1", 10);
    assert.equal(invocations.length, 1);
    assert.equal(invocations[0]?.toolName, "channel.send");
    assert.equal(invocations[0]?.status, "succeeded");

    await runtime.stop();
    db.close();
  });
});
