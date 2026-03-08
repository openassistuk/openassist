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
  OAuthCompleteContext,
  OAuthStartContext,
  OAuthStartResult,
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

class MockOpenAIProvider implements ProviderAdapter {
  public chatCalls = 0;
  public seenAuth: Array<ApiKeyAuth | ProviderAuthHandle> = [];

  id(): string {
    return "openai-main";
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

  async chat(_req: ChatRequest, auth: ProviderAuthHandle | ApiKeyAuth): Promise<ChatResponse> {
    this.chatCalls += 1;
    this.seenAuth.push(auth);
    return {
      output: { role: "assistant", content: "openai ok" },
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 }
    };
  }
}

class MockCodexProvider implements ProviderAdapter {
  public startCalls = 0;
  public completeCalls = 0;
  public refreshCalls = 0;
  public chatCalls = 0;
  public seenAuth: ProviderAuthHandle[] = [];
  private readonly initialExpiryOffsetMs: number;

  constructor(initialExpiryOffsetMs = 60 * 60 * 1000) {
    this.initialExpiryOffsetMs = initialExpiryOffsetMs;
  }

  id(): string {
    return "codex-main";
  }

  capabilities(): ProviderCapabilities {
    return {
      supportsStreaming: false,
      supportsTools: false,
      supportsOAuth: true,
      supportsApiKeys: false,
      supportsImageInputs: false
    };
  }

  async validateConfig(): Promise<ValidationResult> {
    return { valid: true, errors: [] };
  }

  async startOAuthLogin(ctx: OAuthStartContext): Promise<OAuthStartResult> {
    this.startCalls += 1;
    return {
      authorizationUrl: `https://example.test/codex-login?state=${ctx.state}`,
      state: ctx.state,
      expiresAt: new Date(Date.now() + 60_000).toISOString()
    };
  }

  async completeOAuthLogin(ctx: OAuthCompleteContext): Promise<ProviderAuthHandle> {
    this.completeCalls += 1;
    return {
      providerId: "codex-main",
      accountId: ctx.accountId,
      accessToken: "codex-token-initial",
      refreshToken: "codex-refresh-1",
      tokenType: "openai-api-key",
      expiresAt: new Date(Date.now() + this.initialExpiryOffsetMs).toISOString(),
      scopes: ["openid", "offline_access"]
    };
  }

  async refreshOAuthAuth(auth: ProviderAuthHandle): Promise<ProviderAuthHandle> {
    this.refreshCalls += 1;
    return {
      providerId: auth.providerId,
      accountId: auth.accountId,
      accessToken: "codex-token-refreshed",
      refreshToken: "codex-refresh-2",
      tokenType: "openai-api-key",
      expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      scopes: auth.scopes
    };
  }

  async chat(_req: ChatRequest, auth: ProviderAuthHandle | ApiKeyAuth): Promise<ChatResponse> {
    this.chatCalls += 1;
    assert.ok("accountId" in auth, "Codex route should use OAuth auth handles");
    this.seenAuth.push(auth);
    return {
      output: { role: "assistant", content: "codex ok" },
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

function runtimeConfig(root: string): RuntimeConfig {
  return {
    bindAddress: "127.0.0.1",
    bindPort: 3344,
    defaultProviderId: "codex-main",
    providers: [
      {
        id: "openai-main",
        type: "openai",
        defaultModel: "gpt-5.4"
      },
      {
        id: "codex-main",
        type: "codex",
        defaultModel: "gpt-5.4"
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
}

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("runtime codex auth route", () => {
  it("loads a stored codex linked account after restart without colliding with openai api-key auth", async () => {
    const root = tempDir("openassist-runtime-codex-restart-");
    roots.push(root);
    const logger = createLogger({ service: "test" });
    const db = new OpenAssistDatabase({ dbPath: path.join(root, "openassist.db"), logger });

    const openaiProvider1 = new MockOpenAIProvider();
    const codexProvider1 = new MockCodexProvider();
    const channel1 = new MockChannel();
    const runtime1 = new OpenAssistRuntime(
      runtimeConfig(root),
      { db, logger },
      { providers: [openaiProvider1, codexProvider1], channels: [channel1] }
    );
    runtime1.setProviderApiKey("openai-main", "openai-api-key");
    await runtime1.start();

    const started = await runtime1.startOAuthLogin(
      "codex-main",
      "default",
      "http://127.0.0.1:3344/v1/oauth/codex-main/callback"
    );
    await runtime1.completeOAuthLogin("codex-main", started.state, "auth-code-1");
    assert.equal(runtime1.listOAuthAccounts("codex-main").length, 1);

    await runtime1.stop();

    const openaiProvider2 = new MockOpenAIProvider();
    const codexProvider2 = new MockCodexProvider();
    const channel2 = new MockChannel();
    const runtime2 = new OpenAssistRuntime(
      runtimeConfig(root),
      { db, logger },
      { providers: [openaiProvider2, codexProvider2], channels: [channel2] }
    );
    runtime2.setProviderApiKey("openai-main", "openai-api-key");
    await runtime2.start();

    await channel2.emit({
      channel: "telegram",
      channelId: "telegram-main",
      transportMessageId: "m1",
      conversationKey: "codex-restart",
      senderId: "u1",
      text: "hello",
      attachments: [],
      receivedAt: new Date().toISOString(),
      idempotencyKey: "codex-restart-1"
    });

    assert.equal(codexProvider2.chatCalls, 1);
    assert.equal(codexProvider2.seenAuth[0]?.accessToken, "codex-token-initial");
    assert.equal(openaiProvider2.chatCalls, 0);
    assert.equal(runtime2.listOAuthAccounts("codex-main").length, 1);

    await runtime2.stop();
    db.close();
  });

  it("refreshes the codex linked account before chat when the stored token is close to expiry", async () => {
    const root = tempDir("openassist-runtime-codex-refresh-");
    roots.push(root);
    const logger = createLogger({ service: "test" });
    const db = new OpenAssistDatabase({ dbPath: path.join(root, "openassist.db"), logger });

    const runtime1 = new OpenAssistRuntime(
      runtimeConfig(root),
      { db, logger },
      {
        providers: [new MockOpenAIProvider(), new MockCodexProvider(60_000)],
        channels: [new MockChannel()]
      }
    );
    runtime1.setProviderApiKey("openai-main", "openai-api-key");
    await runtime1.start();

    const started = await runtime1.startOAuthLogin(
      "codex-main",
      "default",
      "http://127.0.0.1:3344/v1/oauth/codex-main/callback"
    );
    await runtime1.completeOAuthLogin("codex-main", started.state, "auth-code-1");
    await runtime1.stop();

    const openaiProvider2 = new MockOpenAIProvider();
    const codexProvider2 = new MockCodexProvider();
    const channel2 = new MockChannel();
    const runtime2 = new OpenAssistRuntime(
      runtimeConfig(root),
      { db, logger },
      { providers: [openaiProvider2, codexProvider2], channels: [channel2] }
    );
    runtime2.setProviderApiKey("openai-main", "openai-api-key");
    await runtime2.start();

    await channel2.emit({
      channel: "telegram",
      channelId: "telegram-main",
      transportMessageId: "m1",
      conversationKey: "codex-refresh",
      senderId: "u1",
      text: "refresh please",
      attachments: [],
      receivedAt: new Date().toISOString(),
      idempotencyKey: "codex-refresh-1"
    });

    assert.equal(codexProvider2.refreshCalls, 1);
    assert.equal(codexProvider2.chatCalls, 1);
    assert.equal(codexProvider2.seenAuth[0]?.accessToken, "codex-token-refreshed");
    assert.equal(openaiProvider2.chatCalls, 0);

    await runtime2.stop();
    db.close();
  });
});
