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

class MockChannel implements ChannelAdapter {
  public sent: OutboundEnvelope[] = [];
  private handler: ((msg: InboundEnvelope) => Promise<void>) | null = null;

  id(): string {
    return "telegram-mock";
  }

  capabilities(): ChannelCapabilities {
    return { supportsEdits: false, supportsDeletes: false, supportsReadReceipts: false };
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
    channels: [{ id: "telegram-mock", type: "telegram", enabled: true, settings: {} }],
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
      baseConfig(root),
      { db, logger },
      { providers: [provider], channels: [channel] }
    );

    runtime.setProviderApiKey("mock-provider", "key");
    await runtime.start();

    await channel.emit({
      channel: "telegram",
      channelId: "telegram-mock",
      transportMessageId: "m1",
      conversationKey: "conv-1",
      senderId: "u1",
      text: "do work",
      attachments: [],
      receivedAt: new Date().toISOString(),
      idempotencyKey: "op-1"
    });
    assert.equal(channel.sent[0]?.text, "no autonomous tools");
    assert.equal(runtime.listToolInvocations("telegram-mock:conv-1", 10).length, 0);
    assert.equal(fs.existsSync(writePath), false);

    await runtime.setPolicyProfile("telegram-mock:conv-1", "full-root");
    await channel.emit({
      channel: "telegram",
      channelId: "telegram-mock",
      transportMessageId: "m2",
      conversationKey: "conv-1",
      senderId: "u1",
      text: "do work now",
      attachments: [],
      receivedAt: new Date().toISOString(),
      idempotencyKey: "fr-1"
    });

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
      baseConfig(root),
      { db, logger },
      { providers: [provider], channels: [channel] }
    );

    runtime.setProviderApiKey("mock-provider", "key");
    await runtime.start();

    await channel.emit({
      channel: "telegram",
      channelId: "telegram-mock",
      transportMessageId: "m-rogue",
      conversationKey: "conv-rogue",
      senderId: "u1",
      text: "do work",
      attachments: [],
      receivedAt: new Date().toISOString(),
      idempotencyKey: "rogue-1"
    });

    assert.equal(channel.sent.length, 1);
    assert.equal(
      channel.sent[0]?.text,
      "Autonomous tool execution is disabled for this session profile."
    );
    assert.equal(runtime.listToolInvocations("telegram-mock:conv-rogue", 10).length, 0);
    assert.equal(fs.existsSync(writePath), false);

    await runtime.stop();
    db.close();
  });
});
