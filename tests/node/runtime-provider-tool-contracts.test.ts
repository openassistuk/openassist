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

class ContractProvider implements ProviderAdapter {
  private readonly providerId: string;
  private readonly writePath: string;
  public requests: ChatRequest[] = [];

  constructor(providerId: string, writePath: string) {
    this.providerId = providerId;
    this.writePath = writePath;
  }

  id(): string {
    return this.providerId;
  }

  capabilities(): ProviderCapabilities {
    return {
      supportsStreaming: false,
      supportsTools: true,
      supportsOAuth: false,
      supportsApiKeys: true
    };
  }

  async validateConfig(): Promise<ValidationResult> {
    return { valid: true, errors: [] };
  }

  async chat(req: ChatRequest, _auth: ProviderAuthHandle | ApiKeyAuth): Promise<ChatResponse> {
    this.requests.push(req);
    if (req.messages.some((message) => message.role === "tool")) {
      return {
        output: { role: "assistant", content: `${this.providerId}:done` },
        usage: { inputTokens: 2, outputTokens: 2, totalTokens: 4 }
      };
    }

    return {
      output: { role: "assistant", content: "" },
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
      toolCalls: [
        {
          id: `${this.providerId}-tool-1`,
          name: "fs.write",
          argumentsJson: JSON.stringify({
            path: this.writePath,
            content: this.providerId
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

function baseConfig(root: string, providerId: string, providerType: RuntimeConfig["providers"][number]["type"]): RuntimeConfig {
  return {
    bindAddress: "127.0.0.1",
    bindPort: 3344,
    defaultProviderId: providerId,
    providers: [{ id: providerId, type: providerType, defaultModel: "x" }],
    channels: [{ id: "telegram-mock", type: "telegram", enabled: true, settings: {} }],
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

describe("runtime provider tool contracts", () => {
  const contracts: Array<{ id: string; type: RuntimeConfig["providers"][number]["type"] }> = [
    { id: "openai-main", type: "openai" },
    { id: "anthropic-main", type: "anthropic" },
    { id: "compat-main", type: "openai-compatible" }
  ];

  for (const contract of contracts) {
    it(`supports tool loop contract for ${contract.id}`, async () => {
      const root = tempDir(`openassist-provider-contract-${contract.id}-`);
      roots.push(root);
      const writePath = path.join(root, `${contract.id}.txt`);
      const logger = createLogger({ service: "test" });
      const db = new OpenAssistDatabase({ dbPath: path.join(root, "openassist.db"), logger });
      const provider = new ContractProvider(contract.id, writePath);
      const channel = new MockChannel();
      const runtime = new OpenAssistRuntime(
        baseConfig(root, contract.id, contract.type),
        { db, logger },
        { providers: [provider], channels: [channel] }
      );

      runtime.setProviderApiKey(contract.id, "key");
      await runtime.start();
      await channel.emit({
        channel: "telegram",
        channelId: "telegram-mock",
        transportMessageId: "m1",
        conversationKey: "conv-provider",
        senderId: "u1",
        text: "contract run",
        attachments: [],
        receivedAt: new Date().toISOString(),
        idempotencyKey: `${contract.id}-1`
      });

      assert.equal(provider.requests.length, 2);
      assert.equal(channel.sent[0]?.text, `${contract.id}:done`);
      assert.equal(runtime.listToolInvocations("telegram-mock:conv-provider", 10).length, 1);
      assert.equal(fs.readFileSync(writePath, "utf8"), contract.id);

      await runtime.stop();
      db.close();
    });
  }
});
