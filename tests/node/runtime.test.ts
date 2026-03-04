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

class MockProvider implements ProviderAdapter {
  public chatCalls = 0;
  public lastOAuthCodeVerifier: string | undefined;

  id(): string {
    return "mock-provider";
  }

  capabilities(): ProviderCapabilities {
    return {
      supportsStreaming: false,
      supportsTools: false,
      supportsOAuth: false,
      supportsApiKeys: true
    };
  }

  async validateConfig(): Promise<ValidationResult> {
    return { valid: true, errors: [] };
  }

  async startOAuthLogin(ctx: OAuthStartContext): Promise<OAuthStartResult> {
    return {
      authorizationUrl: `https://example.test/oauth?state=${ctx.state}`,
      state: ctx.state,
      expiresAt: new Date(Date.now() + 60_000).toISOString()
    };
  }

  async completeOAuthLogin(ctx: OAuthCompleteContext): Promise<ProviderAuthHandle> {
    this.lastOAuthCodeVerifier = ctx.codeVerifier;
    return {
      providerId: "mock-provider",
      accountId: ctx.accountId,
      accessToken: "oauth-token",
      refreshToken: "oauth-refresh",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      scopes: ["profile"]
    };
  }

  async chat(): Promise<any> {
    this.chatCalls += 1;
    return {
      output: { role: "assistant", content: "hello from mock <think>secret</think>" },
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 }
    };
  }
}

class MockToolLoopProvider implements ProviderAdapter {
  private readonly targetPath: string;
  private calls = 0;

  constructor(targetPath: string) {
    this.targetPath = targetPath;
  }

  id(): string {
    return "mock-provider";
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

  async chat(_req: ChatRequest, _auth: ProviderAuthHandle | ApiKeyAuth): Promise<ChatResponse> {
    this.calls += 1;
    if (this.calls === 1) {
      return {
        output: { role: "assistant", content: "" },
        usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
        toolCalls: [
          {
            id: "tool-1",
            name: "fs.write",
            argumentsJson: JSON.stringify({
              path: this.targetPath,
              content: "hello-from-tool"
            })
          }
        ]
      };
    }
    return {
      output: {
        role: "assistant",
        content: "tool run complete <think>hidden</think>"
      },
      usage: { inputTokens: 2, outputTokens: 2, totalTokens: 4 }
    };
  }
}

class MockStrictToolContextProvider implements ProviderAdapter {
  public lastMessages: ChatRequest["messages"] = [];

  id(): string {
    return "mock-provider";
  }

  capabilities(): ProviderCapabilities {
    return {
      supportsStreaming: false,
      supportsTools: false,
      supportsOAuth: false,
      supportsApiKeys: true
    };
  }

  async validateConfig(): Promise<ValidationResult> {
    return { valid: true, errors: [] };
  }

  async chat(req: ChatRequest): Promise<ChatResponse> {
    this.lastMessages = req.messages;
    const pending = new Set<string>();
    for (const message of req.messages) {
      if (message.role === "assistant" && message.toolCallId && message.toolName) {
        pending.add(message.toolCallId);
      } else if (message.role === "tool" && message.toolCallId) {
        pending.delete(message.toolCallId);
      }
    }
    if (pending.size > 0) {
      throw new Error(`orphan tool calls present: ${Array.from(pending).join(",")}`);
    }

    return {
      output: { role: "assistant", content: "context ok" },
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 }
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

class FailingStartChannel extends MockChannel {
  async start(_handler: (msg: InboundEnvelope) => Promise<void>): Promise<void> {
    throw new Error("invalid channel token");
  }
}

class BlockingStartChannel extends MockChannel {
  private readonly blocker: Promise<void>;
  private releaseBlocker: (() => void) | null = null;

  constructor() {
    super();
    this.blocker = new Promise<void>((resolve) => {
      this.releaseBlocker = resolve;
    });
  }

  async start(handler: (msg: InboundEnvelope) => Promise<void>): Promise<void> {
    await super.start(handler);
    await this.blocker;
  }

  async stop(): Promise<void> {
    this.releaseBlocker?.();
    this.releaseBlocker = null;
    await super.stop();
  }
}

function tempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

async function waitForCondition(
  condition: () => boolean,
  timeoutMs = 1500,
  intervalMs = 25
): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (condition()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error("timed out waiting for condition");
}

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("OpenAssistRuntime", () => {
  it("does not block runtime start when a channel start hangs", async () => {
    const root = tempDir("openassist-runtime-channel-start-block-");
    roots.push(root);

    const logger = createLogger({ service: "test" });
    const db = new OpenAssistDatabase({ dbPath: path.join(root, "openassist.db"), logger });
    const blockingChannel = new BlockingStartChannel();

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
          id: "telegram-mock",
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
      { providers: [new MockProvider()], channels: [blockingChannel] }
    );
    runtime.setProviderApiKey("mock-provider", "test-key");

    const startBegin = Date.now();
    await runtime.start();
    const elapsedMs = Date.now() - startBegin;
    assert.ok(
      elapsedMs < 500,
      `runtime.start() should not block on channel start, but took ${elapsedMs}ms`
    );

    const status = runtime.getStatus();
    assert.equal(status.modules["telegram-mock"], "running");

    await runtime.stop();
    db.close();
  });

  it("keeps runtime online when one channel fails to start", async () => {
    const root = tempDir("openassist-runtime-channel-start-fail-");
    roots.push(root);

    const logger = createLogger({ service: "test" });
    const db = new OpenAssistDatabase({ dbPath: path.join(root, "openassist.db"), logger });
    const failingChannel = new FailingStartChannel();

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
          id: "telegram-mock",
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
      { providers: [new MockProvider()], channels: [failingChannel] }
    );
    runtime.setProviderApiKey("mock-provider", "test-key");

    await runtime.start();
    await waitForCondition(() => runtime.getStatus().modules["telegram-mock"] === "degraded");

    await runtime.stop();
    db.close();
  });

  it("processes inbound message and sanitizes output", async () => {
    const root = tempDir("openassist-runtime-");
    roots.push(root);

    const logger = createLogger({ service: "test" });
    const db = new OpenAssistDatabase({ dbPath: path.join(root, "openassist.db"), logger });

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
          id: "telegram-mock",
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
      { providers: [new MockProvider()], channels: [channel] }
    );

    runtime.setProviderApiKey("mock-provider", "test-key");
    await runtime.start();

    await channel.emit({
      channel: "telegram",
      transportMessageId: "m1",
      conversationKey: "c1",
      senderId: "u1",
      text: "hello",
      attachments: [],
      receivedAt: new Date().toISOString(),
      idempotencyKey: "x1"
    });

    assert.equal(channel.sent.length, 1);
    assert.equal(channel.sent[0]?.text, "hello from mock");

    await runtime.stop();
    db.close();
  });

  it("runs tool-call loop and still sanitizes final output", async () => {
    const root = tempDir("openassist-runtime-tool-loop-");
    roots.push(root);
    const targetPath = path.join(root, "tool-loop.txt");

    const logger = createLogger({ service: "test" });
    const db = new OpenAssistDatabase({ dbPath: path.join(root, "openassist.db"), logger });
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
          id: "telegram-mock",
          type: "telegram",
          enabled: true,
          settings: {}
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
        fs: {
          workspaceOnly: false,
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

    const runtime = new OpenAssistRuntime(
      runtimeConfig,
      { db, logger },
      { providers: [new MockToolLoopProvider(targetPath)], channels: [channel] }
    );
    runtime.setProviderApiKey("mock-provider", "test-key");
    await runtime.start();

    await channel.emit({
      channel: "telegram",
      transportMessageId: "m1",
      conversationKey: "c1",
      senderId: "u1",
      text: "hello",
      attachments: [],
      receivedAt: new Date().toISOString(),
      idempotencyKey: "x-tool"
    });

    assert.equal(channel.sent.length, 1);
    assert.equal(channel.sent[0]?.text, "tool run complete");
    assert.equal(fs.readFileSync(targetPath, "utf8"), "hello-from-tool");
    assert.equal(runtime.listToolInvocations("telegram:c1", 10)[0]?.status, "succeeded");

    await runtime.stop();
    db.close();
  });

  it("reconciles orphaned tool-call history before provider requests", async () => {
    const root = tempDir("openassist-runtime-tool-reconcile-");
    roots.push(root);

    const logger = createLogger({ service: "test" });
    const db = new OpenAssistDatabase({ dbPath: path.join(root, "openassist.db"), logger });
    const channel = new MockChannel();
    const provider = new MockStrictToolContextProvider();

    db.recordAssistantMessage(
      "telegram:c1",
      "c1",
      {
        role: "assistant",
        content: "",
        toolCallId: "old-call-1",
        toolName: "exec.run",
        metadata: {
          toolArgumentsJson: JSON.stringify({ command: "echo old" })
        }
      },
      {
        providerId: "mock-provider"
      }
    );
    db.recordAssistantMessage(
      "telegram:c1",
      "c1",
      {
        role: "tool",
        content: "x".repeat(120_000),
        toolCallId: "old-call-1",
        toolName: "exec.run"
      },
      {
        providerId: "mock-provider",
        toolStatus: "succeeded"
      }
    );

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
          id: "telegram-mock",
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

    const runtime = new OpenAssistRuntime(runtimeConfig, { db, logger }, { providers: [provider], channels: [channel] });
    runtime.setProviderApiKey("mock-provider", "test-key");
    await runtime.start();

    await channel.emit({
      channel: "telegram",
      transportMessageId: "m-reconcile",
      conversationKey: "c1",
      senderId: "u1",
      text: "continue",
      attachments: [],
      receivedAt: new Date().toISOString(),
      idempotencyKey: "x-reconcile"
    });

    assert.equal(channel.sent.length, 1);
    assert.equal(channel.sent[0]?.text, "context ok");
    assert.equal(
      provider.lastMessages.some(
        (message) =>
          message.role === "assistant" &&
          message.toolCallId === "old-call-1" &&
          message.toolName === "exec.run"
      ),
      false
    );

    await runtime.stop();
    db.close();
  });

  it("completes oauth flow and stores provider auth", async () => {
    const root = tempDir("openassist-runtime-oauth-");
    roots.push(root);

    const logger = createLogger({ service: "test" });
    const db = new OpenAssistDatabase({ dbPath: path.join(root, "openassist.db"), logger });

    const channel = new MockChannel();
    const runtimeConfig: RuntimeConfig = {
      bindAddress: "127.0.0.1",
      bindPort: 3344,
      defaultProviderId: "mock-provider",
      providers: [
        {
          id: "mock-provider",
          type: "openai",
          defaultModel: "x",
          oauth: {
            authorizeUrl: "https://example.test/oauth/authorize",
            tokenUrl: "https://example.test/oauth/token",
            clientId: "client-id"
          }
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

    const provider = new MockProvider();
    const runtime = new OpenAssistRuntime(
      runtimeConfig,
      { db, logger },
      { providers: [provider], channels: [channel] }
    );
    await runtime.start();

    const started = await runtime.startOAuthLogin(
      "mock-provider",
      "acct-1",
      "http://127.0.0.1:3344/v1/oauth/mock-provider/callback"
    );
    assert.ok(started.state.length > 0);
    assert.ok(started.authorizationUrl.includes("state="));
    const storedFlow = db.getOauthFlow(started.state);
    assert.ok(storedFlow?.codeVerifier.startsWith("enc:"));

    const completed = await runtime.completeOAuthLogin(
      "mock-provider",
      started.state,
      "auth-code"
    );
    assert.equal(completed.accountId, "acct-1");
    assert.ok(provider.lastOAuthCodeVerifier);

    const accounts = runtime.listOAuthAccounts("mock-provider");
    assert.equal(accounts.length, 1);
    assert.equal(accounts[0]?.accountId, "acct-1");

    const removed = runtime.removeOAuthAccount("mock-provider", "acct-1");
    assert.equal(removed, true);

    await runtime.stop();
    db.close();
  });

  it("consumes legacy plaintext oauth verifier rows for backward compatibility", async () => {
    const root = tempDir("openassist-runtime-oauth-legacy-");
    roots.push(root);

    const logger = createLogger({ service: "test" });
    const db = new OpenAssistDatabase({ dbPath: path.join(root, "openassist.db"), logger });
    const channel = new MockChannel();
    const provider = new MockProvider();
    const runtimeConfig: RuntimeConfig = {
      bindAddress: "127.0.0.1",
      bindPort: 3344,
      defaultProviderId: "mock-provider",
      providers: [
        {
          id: "mock-provider",
          type: "openai",
          defaultModel: "x",
          oauth: {
            authorizeUrl: "https://example.test/oauth/authorize",
            tokenUrl: "https://example.test/oauth/token",
            clientId: "client-id"
          }
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
    await runtime.start();

    db.createOauthFlow({
      state: "legacy-state",
      providerId: "mock-provider",
      accountId: "acct-legacy",
      redirectUri: "http://127.0.0.1:3344/v1/oauth/mock-provider/callback",
      codeVerifier: "legacy-verifier",
      expiresAt: new Date(Date.now() + 60_000).toISOString()
    });

    const completed = await runtime.completeOAuthLogin(
      "mock-provider",
      "legacy-state",
      "auth-code"
    );
    assert.equal(completed.accountId, "acct-legacy");
    assert.equal(provider.lastOAuthCodeVerifier, "legacy-verifier");

    await runtime.stop();
    db.close();
  });

  it("fails fast on unsupported secrets backend values", () => {
    const root = tempDir("openassist-runtime-secrets-backend-");
    roots.push(root);

    const logger = createLogger({ service: "test" });
    const db = new OpenAssistDatabase({ dbPath: path.join(root, "openassist.db"), logger });
    const channel = new MockChannel();
    const runtimeConfig = {
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
      security: {
        auditLogEnabled: true,
        secretsBackend: "os-keyring"
      }
    } as unknown as RuntimeConfig;

    assert.throws(
      () =>
        new OpenAssistRuntime(
          runtimeConfig,
          { db, logger },
          { providers: [new MockProvider()], channels: [channel] }
        ),
      /Only 'encrypted-file' is supported/
    );

    db.close();
  });

  it("sends diagnostic channel output when provider auth is missing", async () => {
    const root = tempDir("openassist-runtime-diagnostic-auth-");
    roots.push(root);

    const logger = createLogger({ service: "test" });
    const db = new OpenAssistDatabase({ dbPath: path.join(root, "openassist.db"), logger });

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
          id: "telegram-mock",
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
      { providers: [new MockProvider()], channels: [channel] }
    );
    await runtime.start();

    await channel.emit({
      channel: "telegram",
      transportMessageId: "m1",
      conversationKey: "c-diagnostic",
      senderId: "u1",
      text: "hello",
      attachments: [],
      receivedAt: new Date().toISOString(),
      idempotencyKey: "diag-auth-1"
    });

    assert.equal(channel.sent.length, 1);
    assert.match(channel.sent[0]?.text ?? "", /could not complete that request/i);
    assert.match(channel.sent[0]?.text ?? "", /provider authentication is missing or invalid/i);

    await runtime.stop();
    db.close();
  });

  it("serves /status from runtime without provider chat call", async () => {
    const root = tempDir("openassist-runtime-status-command-");
    roots.push(root);

    const logger = createLogger({ service: "test" });
    const db = new OpenAssistDatabase({ dbPath: path.join(root, "openassist.db"), logger });

    const provider = new MockProvider();
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
          id: "telegram-mock",
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
    await runtime.start();

    await channel.emit({
      channel: "telegram",
      transportMessageId: "m1",
      conversationKey: "c-status",
      senderId: "u1",
      text: "/status",
      attachments: [],
      receivedAt: new Date().toISOString(),
      idempotencyKey: "status-1"
    });

    assert.equal(provider.chatCalls, 0);
    assert.equal(channel.sent.length, 1);
    assert.match(channel.sent[0]?.text ?? "", /openassist local status/i);
    assert.match(channel.sent[0]?.text ?? "", /default provider: mock-provider/i);

    await runtime.stop();
    db.close();
  });

  it("persists global profile memory and applies it across sessions", async () => {
    const root = tempDir("openassist-runtime-profile-memory-");
    roots.push(root);

    const logger = createLogger({ service: "test" });
    const db = new OpenAssistDatabase({ dbPath: path.join(root, "openassist.db"), logger });

    const provider = new MockProvider();
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
          id: "telegram-mock",
          type: "telegram",
          enabled: true,
          settings: {}
        }
      ],
      defaultPolicyProfile: "operator",
      assistant: {
        name: "OpenAssist",
        persona: "Pragmatic and brief",
        operatorPreferences: "Prefer concise summaries",
        promptOnFirstContact: true
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
      }
    };

    const runtime = new OpenAssistRuntime(
      runtimeConfig,
      { db, logger },
      { providers: [provider], channels: [channel] }
    );
    runtime.setProviderApiKey("mock-provider", "test-key");
    await runtime.start();

    await channel.emit({
      channel: "telegram",
      transportMessageId: "m-start",
      conversationKey: "c-profile",
      senderId: "u1",
      text: "/start",
      attachments: [],
      receivedAt: new Date().toISOString(),
      idempotencyKey: "profile-start"
    });

    assert.equal(provider.chatCalls, 0);
    assert.equal(channel.sent.length, 1);
    assert.match(channel.sent[0]?.text ?? "", /profile setup for this chat/i);
    assert.match(channel.sent[0]?.text ?? "", /force=true/i);

    const profileLock = db.getSetting<{
      locked: boolean;
      lockMode: string;
      lockedAt: string;
      lastForcedUpdateAt?: string;
    }>("assistant.globalProfileLock");
    assert.ok(profileLock);
    assert.equal(profileLock?.locked, true);

    await channel.emit({
      channel: "telegram",
      transportMessageId: "m-profile",
      conversationKey: "c-profile",
      senderId: "u1",
      text: "/profile name=Nova; persona=Direct and technical; prefs=Use Debian apt commands",
      attachments: [],
      receivedAt: new Date().toISOString(),
      idempotencyKey: "profile-update"
    });

    assert.equal(provider.chatCalls, 0);
    assert.equal(channel.sent.length, 2);
    assert.match(channel.sent[1]?.text ?? "", /blocked by first-boot lock-in guard/i);
    assert.match(channel.sent[1]?.text ?? "", /force=true/i);

    const blockedProfile = db.getSetting<{
      name: string;
      persona: string;
      operatorPreferences: string;
    }>("assistant.globalProfile");
    assert.ok(blockedProfile);
    assert.equal(blockedProfile?.name, "OpenAssist");
    assert.equal(blockedProfile?.persona, "Pragmatic and brief");
    assert.equal(blockedProfile?.operatorPreferences, "Prefer concise summaries");

    await channel.emit({
      channel: "telegram",
      transportMessageId: "m-profile-force",
      conversationKey: "c-profile",
      senderId: "u1",
      text: "/profile force=true; name=Nova; persona=Direct and technical; prefs=Use Debian apt commands",
      attachments: [],
      receivedAt: new Date().toISOString(),
      idempotencyKey: "profile-update-force"
    });

    assert.equal(provider.chatCalls, 0);
    assert.equal(channel.sent.length, 3);
    assert.match(channel.sent[2]?.text ?? "", /Profile updated/i);
    assert.match(channel.sent[2]?.text ?? "", /name: Nova/i);

    const globalProfile = db.getSetting<{
      name: string;
      persona: string;
      operatorPreferences: string;
    }>("assistant.globalProfile");
    assert.ok(globalProfile);
    assert.equal(globalProfile?.name, "Nova");
    assert.equal(globalProfile?.persona, "Direct and technical");
    assert.equal(globalProfile?.operatorPreferences, "Use Debian apt commands");

    const profileLockAfterForce = db.getSetting<{
      locked: boolean;
      lockMode: string;
      lockedAt: string;
      lastForcedUpdateAt?: string;
    }>("assistant.globalProfileLock");
    assert.equal(profileLockAfterForce?.locked, true);
    assert.ok(profileLockAfterForce?.lastForcedUpdateAt);

    await channel.emit({
      channel: "telegram",
      transportMessageId: "m-normal",
      conversationKey: "c-profile",
      senderId: "u1",
      text: "hello",
      attachments: [],
      receivedAt: new Date().toISOString(),
      idempotencyKey: "profile-chat"
    });

    assert.equal(provider.chatCalls, 1);
    assert.equal(channel.sent.length, 4);
    assert.equal(channel.sent[3]?.text, "hello from mock");

    await channel.emit({
      channel: "telegram",
      transportMessageId: "m-profile-global",
      conversationKey: "c-profile-other",
      senderId: "u2",
      text: "/profile",
      attachments: [],
      receivedAt: new Date().toISOString(),
      idempotencyKey: "profile-global-read"
    });

    assert.equal(provider.chatCalls, 1);
    assert.equal(channel.sent.length, 5);
    assert.match(channel.sent[4]?.text ?? "", /global profile memory/i);
    assert.match(channel.sent[4]?.text ?? "", /name: Nova/i);
    assert.match(channel.sent[4]?.text ?? "", /persona: Direct and technical/i);

    await runtime.stop();
    db.close();
  });
});
