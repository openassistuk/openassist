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
import { OpenAssistDatabase, contextSourceDigest } from "../../packages/storage-sqlite/src/index.js";
import { createLogger } from "../../packages/observability/src/index.js";
import { DEFAULT_CONTEXT_CONFIG } from "../../packages/config/src/context-limits.js";

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
    if (req.metadata.source === "runtime.context.summary") {
      return {
        output: { role: "assistant", content: JSON.stringify({ goals: "Retain original task", constraints: "No new approval", decisions: "", openWork: "", completedActions: "", evidence: "Retain original references" }) },
        usage: { inputTokens: 10, outputTokens: 10, totalTokens: 20 }
      };
    }
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
  it("routes /compact to one tool-free summary in the current chat with auto-compaction and permanent memory off", async () => {
    const root = tempDir("openassist-manual-context-"); roots.push(root);
    const logger = createLogger({ service: "test" });
    const db = new OpenAssistDatabase({ dbPath: path.join(root,"openassist.db"), logger });
    const provider = new MemoryAwareProvider(); const channel = new MockChannel();
    const config = buildConfig(root, { memory: { enabled: false } });
    config.context = { ...DEFAULT_CONTEXT_CONFIG, autoCompact: false };
    config.defaultPolicyProfile = "restricted";
    for (const sessionId of ["telegram-mock:chat-1", "telegram-mock:chat-2"]) {
      db.recordAssistantMessage(sessionId, sessionId.split(":")[1]!, { role: "user", content: `${sessionId} completed task ` + "x".repeat(6000) });
      db.recordAssistantMessage(sessionId, sessionId.split(":")[1]!, { role: "assistant", content: "completed response" });
    }
    const original = db.context.history("telegram-mock:chat-1").messages;
    const other = db.context.history("telegram-mock:chat-2").messages;
    db.setSetting("memory.extraction.telegram-mock:chat-1", "1");
    const runtime = new OpenAssistRuntime(config, { db, logger }, { providers: [provider], channels: [channel] });
    runtime.setProviderApiKey("mock-provider", "key"); await runtime.start();
    try {
      const command = inbound("chat-1", "u1", "/compact", "manual-1");
      await channel.emit(command);
      assert.match(channel.sent.at(-1)?.text ?? "", /Context compacted through message/);
      assert.match(channel.sent.at(-1)?.text ?? "", /Automatic compaction: off/);
      assert.equal(provider.requests.length, 1); assert.equal(provider.requests[0]!.metadata.source, "runtime.context.summary");
      assert.deepEqual(provider.requests[0]!.tools, []);
      assert.ok(provider.requests[0]!.sessionId.startsWith("telegram-mock:chat-1::context::"));
      assert.equal(JSON.parse(provider.requests[0]!.messages[1]!.content).records.some((record: { content: string }) => record.content.includes("chat-2")), false);
      const checkpoint = db.context.checkpoint("telegram-mock:chat-1")!;
      assert.equal(checkpoint.coveredThrough, Number(original.at(-1)!.id));
      assert.equal(checkpoint.sourceDigest, contextSourceDigest(original));
      assert.deepEqual(db.context.history("telegram-mock:chat-1").messages.slice(0, original.length), original);
      assert.deepEqual(db.context.history("telegram-mock:chat-2").messages, other);
      assert.equal(db.context.checkpoint("telegram-mock:chat-2"), null);
      assert.equal(db.getSetting("memory.extraction.telegram-mock:chat-1"), "1");
      const sent = channel.sent.length;
      await channel.emit(command);
      assert.equal(provider.requests.length, 1); assert.equal(channel.sent.length, sent);
      await channel.emit(inbound("chat-1", "u1", "/memory", "manual-memory"));
      assert.match(channel.sent.at(-1)?.text ?? "", /automatic compaction: off/);
      const statusStart = channel.sent.length;
      await channel.emit(inbound("chat-1", "u1", "/status", "manual-status"));
      assert.match(channel.sent.slice(statusStart).map(message => message.text).join("\n"), /automatic compaction: off/);
      const helpStart = channel.sent.length;
      await channel.emit(inbound("chat-1", "u1", "/help", "manual-help"));
      assert.match(channel.sent.slice(helpStart).map(message => message.text).join("\n"), /\/compact/);
      const capabilitiesStart = channel.sent.length;
      await channel.emit(inbound("chat-1", "u1", "/capabilities", "manual-capabilities"));
      assert.match(channel.sent.slice(capabilitiesStart).map(message => message.text).join("\n"), /automatic compaction off; \/compact/);
      assert.equal(provider.requests.length, 1);
      assert.equal(db.countQueuedJobs(), 0);
    } finally { await runtime.stop(); db.close(); }
  });

  for (const command of ["/compact", "/compact now", "/compact\nnow"]) {
    it(`handles ${command} without provider work for an empty chat or invalid arguments`, async () => {
      const root = tempDir("openassist-manual-context-empty-"); roots.push(root);
      const logger = createLogger({ service: "test" }); const db = new OpenAssistDatabase({ dbPath: path.join(root,"openassist.db"), logger });
      const provider = new MemoryAwareProvider(); const channel = new MockChannel();
      const runtime = new OpenAssistRuntime(buildConfig(root, { memory: { enabled: false } }), { db, logger }, { providers: [provider], channels: [channel] });
      await runtime.start();
      try {
        await channel.emit(inbound("chat-empty", "u1", command, "manual-empty"));
        assert.equal(provider.requests.length, 0);
        assert.match(channel.sent.at(-1)?.text ?? "", command === "/compact" ? /No additional context checkpoint/ : /Usage: \/compact/);
        assert.equal(db.context.checkpoint("telegram-mock:chat-empty"), null);
      } finally { await runtime.stop(); db.close(); }
    });
  }

  it("refuses manual compaction while this chat has an unfinished provider turn", async () => {
    const root = tempDir("openassist-manual-context-busy-"); roots.push(root);
    const logger = createLogger({ service: "test" }); const db = new OpenAssistDatabase({ dbPath: path.join(root,"openassist.db"), logger });
    const provider = new MemoryAwareProvider(); const channel = new MockChannel();
    let release!: () => void; let started!: () => void;
    const blocked = new Promise<void>(resolve => { release = resolve; });
    const began = new Promise<void>(resolve => { started = resolve; });
    const chat = provider.chat.bind(provider);
    provider.chat = async (request, auth) => { started(); await blocked; return chat(request, auth); };
    const runtime = new OpenAssistRuntime(buildConfig(root, { memory: { enabled: false } }), { db, logger }, { providers: [provider], channels: [channel] });
    runtime.setProviderApiKey("mock-provider", "key"); await runtime.start();
    const running = channel.emit(inbound("busy", "u1", "unfinished task " + "x".repeat(6000), "manual-busy-turn"));
    try {
      await began;
      await channel.emit(inbound("busy", "u1", "/compact", "manual-busy-command"));
      assert.match(channel.sent.at(-1)?.text ?? "", /turn or compaction in progress/);
      assert.equal(db.context.checkpoint("telegram-mock:busy"), null);
      await channel.emit(inbound("other", "u1", "/compact", "manual-other-chat"));
      assert.match(channel.sent.at(-1)?.text ?? "", /No additional context checkpoint/);
      release(); await running;
      assert.equal(provider.requests.length, 1); assert.notEqual(provider.requests[0]!.metadata.source, "runtime.context.summary");
    } finally { release(); await running; await runtime.stop(); db.close(); }
  });

  it("reports explicit summary failure without claiming progress or enqueueing automatic work", async () => {
    const root = tempDir("openassist-manual-context-failure-"); roots.push(root);
    const logger = createLogger({ service: "test" }); const db = new OpenAssistDatabase({ dbPath: path.join(root,"openassist.db"), logger });
    const provider = new MemoryAwareProvider(); const channel = new MockChannel();
    provider.chat = async request => { provider.requests.push(request); return { output: { role: "assistant", content: "invalid JSON" }, usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 } }; };
    const runtime = new OpenAssistRuntime(buildConfig(root, { memory: { enabled: false } }), { db, logger }, { providers: [provider], channels: [channel] });
    db.recordAssistantMessage("telegram-mock:failure", "failure", { role: "user", content: "old task " + "x".repeat(6000) });
    db.recordAssistantMessage("telegram-mock:failure", "failure", { role: "assistant", content: "done" });
    const original = db.context.history("telegram-mock:failure").messages;
    runtime.setProviderApiKey("mock-provider", "key"); await runtime.start();
    try {
      await channel.emit(inbound("failure", "u1", "/compact", "manual-failure"));
      assert.match(channel.sent.at(-1)?.text ?? "", /could not complete/);
      assert.doesNotMatch(channel.sent.at(-1)?.text ?? "", /Context compacted through/);
      assert.equal(provider.requests.length, 1); assert.equal(db.countQueuedJobs(), 0);
      assert.equal(db.context.checkpoint("telegram-mock:failure"), null);
      assert.deepEqual(db.context.history("telegram-mock:failure").messages.slice(0, original.length), original);
    } finally { await runtime.stop(); db.close(); }
  });

  it("skips resumed pending context intent and queued maintenance when automatic compaction is off", async () => {
    const root = tempDir("openassist-context-off-restart-"); roots.push(root);
    const logger = createLogger({ service: "test" }); const db = new OpenAssistDatabase({ dbPath: path.join(root,"openassist.db"), logger });
    const provider = new MemoryAwareProvider(); const channel = new MockChannel();
    const config = buildConfig(root, { memory: { enabled: false } }); config.context = { ...DEFAULT_CONTEXT_CONFIG, autoCompact: false };
    const sessionId = "telegram-mock:pending";
    db.recordAssistantMessage(sessionId, "pending", { role: "user", content: "old task " + "x".repeat(6000) });
    db.recordAssistantMessage(sessionId, "pending", { role: "assistant", content: "done" });
    const source = db.context.history(sessionId).messages;
    db.context.begin({ sessionId, expectedRevision: 0, afterMessageId: 0, throughMessageId: Number(source.at(-1)!.id), sourceDigest: contextSourceDigest(source), scope: "mock-provider:x" });
    db.enqueueJob("context_maintenance", { sessionId, providerId: "removed-provider", model: "old-model" }, { maxAttempts: 3, initialDelayMs: 1, maxDelayMs: 100 });
    const runtime = new OpenAssistRuntime(config, { db, logger }, { providers: [provider], channels: [channel] });
    await runtime.start();
    try {
      for (let attempt=0; attempt<100 && db.countQueuedJobs(); attempt++) await new Promise(resolve => setTimeout(resolve, 20));
      assert.equal(db.countQueuedJobs(), 0); assert.equal(provider.requests.length, 0);
      assert.equal(db.context.checkpoint(sessionId), null); assert.deepEqual(db.context.history(sessionId).messages, source);
    } finally { await runtime.stop(); db.close(); }
  });
  for (const state of ["context checkpoint", "legacy summary", "saved extraction cursor"]) {
    it(`keeps initial extraction independent of ${state}`, async () => {
      const root = tempDir("openassist-memory-cursor-"); roots.push(root);
      const logger = createLogger({ service: "memory-cursor-test" });
      const db = new OpenAssistDatabase({ dbPath: path.join(root, "state.db"), logger });
      const provider = new MemoryAwareProvider();
      const runtime = new OpenAssistRuntime(buildConfig(root), { db, logger }, { providers: [provider], channels: [] });
      const sessionId = "telegram-mock:cursor-test";
      const key = `memory.extraction.${sessionId}`;
      try {
        runtime.setProviderApiKey(provider.id(), "fixture");
        for (let index = 0; index < 18; index++) db.recordAssistantMessage(sessionId, "u1", {
          role: index % 2 ? "assistant" : "user", content: index === 0 ? "Prefer Debian apt commands" : `turn ${index}`
        });
        const source = db.context.history(sessionId).messages.slice(0,8);
        const frontier = Number(source.at(-1)!.id);
        if (state === "legacy summary") db.upsertSessionMemory({ sessionId, summary: "Legacy summary", lastCompactedMessageId: frontier });
        else {
          const job = db.context.begin({ sessionId, expectedRevision: 0, afterMessageId: 0, throughMessageId: frontier,
            sourceDigest: contextSourceDigest(source), scope: "fixture" });
          assert.ok(db.context.finish(job, "Context summary", 33_554_432));
        }
        if (state === "saved extraction cursor") db.setSetting(key, frontier);
        const refresh = () => (runtime as unknown as { refreshSessionMemoryAfterTurn(provider: ProviderAdapter, model: string, sessionId: string, actorId: string): Promise<void> })
          .refreshSessionMemoryAfterTurn(provider, "x", sessionId, "u1");
        await refresh();
        assert.equal(provider.sidecarCalls, state === "saved extraction cursor" ? 0 : 1);
        assert.equal(db.getSetting<number>(key), frontier);
        if (state !== "saved extraction cursor") {
          const request = provider.requests.find(item => item.metadata.source === "runtime.memory.sidecar")!;
          assert.ok(request.messages.some(message => message.content.includes("Prefer Debian apt commands")));
          assert.equal(db.listPermanentMemories("telegram-mock:u1").length, 2);
        }
        await refresh();
        assert.equal(provider.sidecarCalls, state === "saved extraction cursor" ? 0 : 1);
        assert.equal(db.getSessionMemory(sessionId)?.lastCompactedMessageId, frontier);
        assert.equal(db.context.history(sessionId).messages.length, 18);
      } finally { await runtime.stop(); db.close(); }
    });
  }

  it("extracts durable actor memory asynchronously without compacting history that fits", async () => {
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

    for (let attempt = 0; attempt < 100 && provider.sidecarCalls === 0; attempt++) await new Promise(resolve => setTimeout(resolve, 20));
    const status = await runtime.getMemoryStatus("telegram-mock:chat-1", "u1");
    assert.equal(status.enabled, true);
    assert.equal(status.sessionSummary, null);
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

  it("retains complete history without needless summaries when permanent memory is disabled", async () => {
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
    assert.equal(status.sessionSummary, null);
    assert.equal(provider.sidecarCalls, 0);
    assert.equal(db.context.history("telegram-mock:chat-1").messages.length, 16);
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
