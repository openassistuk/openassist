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

class PkgProvider implements ProviderAdapter {
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
            id: "pkg-1",
            name: "pkg.install",
            argumentsJson: JSON.stringify({
              manager: "npm",
              packages: ["definitely-not-a-real-package-openassist-ci"],
              global: true,
              useSudo: true
            })
          }
        ]
      };
    }

    return {
      output: { role: "assistant", content: "attempted package install" },
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
      supportsDocumentAttachments: true
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
        enabled: true,
        preferStructuredInstall: true,
        allowExecFallback: true,
        sudoNonInteractive: true,
        allowedManagers: ["npm"]
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

describe("runtime pkg.install sudo behavior", () => {
  it("uses sudo -n for global installs on unix platforms", { skip: process.platform === "win32" }, async () => {
    const root = tempDir("openassist-runtime-pkg-sudo-");
    roots.push(root);
    const logger = createLogger({ service: "test" });
    const db = new OpenAssistDatabase({ dbPath: path.join(root, "openassist.db"), logger });
    const channel = new MockChannel();
    const runtime = new OpenAssistRuntime(
      baseConfig(root),
      { db, logger },
      { providers: [new PkgProvider()], channels: [channel] }
    );

    runtime.setProviderApiKey("mock-provider", "key");
    await runtime.start();
    await channel.emit({
      channel: "telegram",
      channelId: "telegram-mock",
      transportMessageId: "m1",
      conversationKey: "conv-pkg",
      senderId: "u1",
      text: "install package",
      attachments: [],
      receivedAt: new Date().toISOString(),
      idempotencyKey: "pkg-1"
    });

    const invocations = runtime.listToolInvocations("telegram-mock:conv-pkg", 10);
    assert.equal(invocations.length, 1);
    const result = invocations[0]?.result as { command?: string; args?: string[] } | undefined;
    assert.equal(result?.command, "sudo");
    assert.equal(result?.args?.[0], "-n");
    assert.equal(result?.args?.[1], "npm");
    assert.equal(invocations[0]?.status, "failed");

    await runtime.stop();
    db.close();
  });
});
