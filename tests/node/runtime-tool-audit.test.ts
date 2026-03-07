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

class BlockingAuditProvider implements ProviderAdapter {
  private call = 0;

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
    this.call += 1;
    if (this.call === 1) {
      return {
        output: { role: "assistant", content: "" },
        usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
        toolCalls: [
          {
            id: "blocked-1",
            name: "exec.run",
            argumentsJson: JSON.stringify({
              command: "rm -rf /"
            })
          }
        ]
      };
    }

    return {
      output: { role: "assistant", content: "blocked path handled" },
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

describe("runtime tool audit", () => {
  it("persists blocked tool lifecycle with request/result fields", async () => {
    const root = tempDir("openassist-tool-audit-");
    roots.push(root);
    const logger = createLogger({ service: "test" });
    const db = new OpenAssistDatabase({ dbPath: path.join(root, "openassist.db"), logger });
    const channel = new MockChannel();
    const runtime = new OpenAssistRuntime(
      baseConfig(root),
      { db, logger },
      { providers: [new BlockingAuditProvider()], channels: [channel] }
    );

    runtime.setProviderApiKey("mock-provider", "key");
    await runtime.start();
    await channel.emit({
      channel: "telegram",
      channelId: "telegram-mock",
      transportMessageId: "m1",
      conversationKey: "conv-audit",
      senderId: "u1",
      text: "dangerous command",
      attachments: [],
      receivedAt: new Date().toISOString(),
      idempotencyKey: "audit-1"
    });

    const rows = runtime.listToolInvocations("telegram-mock:conv-audit", 10);
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.status, "blocked");
    assert.equal(rows[0]?.toolName, "exec.run");
    assert.equal(rows[0]?.request.command, "rm -rf /");
    assert.ok(typeof rows[0]?.durationMs === "number");
    assert.ok(rows[0]?.finishedAt);

    await runtime.stop();
    db.close();
  });
});
