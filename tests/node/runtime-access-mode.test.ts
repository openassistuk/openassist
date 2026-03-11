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

class QuietProvider implements ProviderAdapter {
  public chatCalls = 0;

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

  async chat(_req: ChatRequest, _auth: ProviderAuthHandle | ApiKeyAuth): Promise<ChatResponse> {
    this.chatCalls += 1;
    return {
      output: { role: "assistant", content: "provider fallback" },
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

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

function buildConfig(
  root: string,
  options: {
    operatorAccessProfile: RuntimeConfig["operatorAccessProfile"];
    workspaceOnly: boolean;
  }
): RuntimeConfig {
  return {
    bindAddress: "127.0.0.1",
    bindPort: 3344,
    defaultProviderId: "mock-provider",
    providers: [{ id: "mock-provider", type: "openai-compatible", defaultModel: "x" }],
    channels: [
      {
        id: "telegram-main",
        type: "telegram",
        enabled: true,
        settings: {
          operatorUserIds: ["123456789"]
        }
      }
    ],
    defaultPolicyProfile: "operator",
    operatorAccessProfile: options.operatorAccessProfile,
    service: {
      systemdFilesystemAccess: "hardened"
    },
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
      fs: {
        workspaceOnly: options.workspaceOnly,
        allowedReadPaths: [],
        allowedWritePaths: []
      },
      exec: {
        defaultTimeoutMs: 60_000,
        guardrails: {
          mode: "minimal",
          extraBlockedPatterns: []
        }
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
    channelId: "telegram-main",
    transportMessageId: `msg-${idempotencyKey}`,
    conversationKey: "ops-room",
    senderId,
    text,
    attachments: [],
    receivedAt: new Date().toISOString(),
    idempotencyKey
  };
}

describe("runtime access mode", () => {
  it("keeps access actor-aware in shared chats and exposes it through /status", async () => {
    const root = tempDir("openassist-runtime-access-status-");
    roots.push(root);

    const logger = createLogger({ service: "test" });
    const db = new OpenAssistDatabase({ dbPath: path.join(root, "openassist.db"), logger });
    const provider = new QuietProvider();
    const channel = new MockChannel();
    const runtime = new OpenAssistRuntime(
      buildConfig(root, {
        operatorAccessProfile: "full-root",
        workspaceOnly: false
      }),
      {
        db,
        logger,
        installContext: {
          repoBackedInstall: true,
        installDir: root,
        configPath: path.join(root, "openassist.toml"),
        envFilePath: path.join(root, "openassistd.env"),
        trackedRef: "main",
        lastKnownGoodCommit: "abc123",
        serviceManager: "systemd-system",
        systemdFilesystemAccessEffective: "hardened"
      }
      },
      { providers: [provider], channels: [channel] }
    );

    runtime.setProviderApiKey("mock-provider", "test-key");
    await runtime.start();

    const approvedTools = await runtime.getToolsStatus("telegram-main:ops-room", "123456789");
    const standardTools = await runtime.getToolsStatus("telegram-main:ops-room", "222222222");
    assert.equal(approvedTools.profile, "full-root");
    assert.equal(approvedTools.profileSource, "channel-operator-default");
    assert.ok(approvedTools.enabledTools.includes("web.search"));
    assert.equal(standardTools.profile, "operator");
    assert.equal(standardTools.profileSource, "default");
    assert.deepEqual(standardTools.enabledTools, []);

    await channel.emit(inbound("123456789", "/status", "status-approved"));
    const approvedStatusText = channel.sent.map((item) => item.text ?? "").join("\n");
    const approvedStatusMessages = channel.sent.length;
    await channel.emit(inbound("222222222", "/status", "status-standard"));
    const standardStatusText = channel.sent
      .slice(approvedStatusMessages)
      .map((item) => item.text ?? "")
      .join("\n");

    assert.equal(provider.chatCalls, 0);
    assert.match(approvedStatusText, /sender id: 123456789/i);
    assert.match(approvedStatusText, /session id: telegram-main:ops-room/i);
    assert.match(approvedStatusText, /current access: Full access/i);
    assert.match(approvedStatusText, /access source: approved operator default for this channel/i);
    assert.match(approvedStatusText, /config path: .*openassist\.toml/i);
    assert.match(approvedStatusText, /trackedRef=main/i);
    assert.match(approvedStatusText, /protected surfaces:/i);
    assert.match(approvedStatusText, /service boundary: service manager=systemd-system/i);
    assert.match(approvedStatusText, /service boundary notes: .*package installs, sudo, and broader host writes may still be blocked/i);

    assert.match(standardStatusText, /sender id: 222222222/i);
    assert.match(standardStatusText, /current access: Standard access/i);
    assert.match(standardStatusText, /access source: runtime default/i);
    assert.match(standardStatusText, /config\/env\/install detail: hidden in chat for this sender/i);
    assert.doesNotMatch(standardStatusText, /config path:/i);
    assert.doesNotMatch(standardStatusText, /trackedRef=main/i);
    assert.doesNotMatch(standardStatusText, /protected paths:/i);

    await runtime.stop();
    db.close();
  });

  it("lets approved operators switch their own chat access and blocks unlisted senders", async () => {
    const root = tempDir("openassist-runtime-access-command-");
    roots.push(root);

    const logger = createLogger({ service: "test" });
    const db = new OpenAssistDatabase({ dbPath: path.join(root, "openassist.db"), logger });
    const provider = new QuietProvider();
    const channel = new MockChannel();
    const runtime = new OpenAssistRuntime(
      buildConfig(root, {
        operatorAccessProfile: "operator",
        workspaceOnly: true
      }),
      { db, logger },
      { providers: [provider], channels: [channel] }
    );

    runtime.setProviderApiKey("mock-provider", "test-key");
    await runtime.start();

    await channel.emit(inbound("222222222", "/access full", "access-denied"));
    assert.match(channel.sent[0]?.text ?? "", /not on the approved operator list/i);

    await channel.emit(inbound("123456789", "/access", "access-status"));
    assert.match(channel.sent[1]?.text ?? "", /current access: Standard access/i);
    assert.match(channel.sent[1]?.text ?? "", /access source: runtime default/i);
    assert.match(channel.sent[1]?.text ?? "", /service boundary:/i);

    await channel.emit(inbound("123456789", "/access full", "access-full"));
    assert.match(channel.sent[2]?.text ?? "", /Access updated for this sender in this chat: Full access/i);
    const elevated = await runtime.getToolsStatus("telegram-main:ops-room", "123456789");
    assert.equal(elevated.profile, "full-root");
    assert.equal(elevated.profileSource, "actor-override");
    assert.ok(elevated.enabledTools.includes("exec.run"));

    await channel.emit(inbound("123456789", "/access standard", "access-standard"));
    assert.match(channel.sent[3]?.text ?? "", /Access updated for this sender in this chat: Standard access/i);
    const lowered = await runtime.getToolsStatus("telegram-main:ops-room", "123456789");
    assert.equal(lowered.profile, "operator");
    assert.equal(lowered.profileSource, "actor-override");
    assert.deepEqual(lowered.enabledTools, []);

    assert.equal(provider.chatCalls, 0);
    await runtime.stop();
    db.close();
  });
});
