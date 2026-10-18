import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ChatRequest, ChatResponse, ProviderAdapter, ProviderConfig, RuntimeConfig } from "@openassist/core-types";
import { createDefaultConfigObject } from "../../apps/openassist-cli/src/lib/config-edit.js";
import { editContextBudgets, loadSetupWizardState, type PromptAdapter } from "../../apps/openassist-cli/src/lib/setup-wizard.js";
import { parseConfig, toRuntimeConfig } from "../../packages/config/src/schema.js";
import { DEFAULT_CONTEXT_CONFIG, resolveContextLimits } from "../../packages/config/src/context-limits.js";
import { conversationSegments, ContextPlanner, estimateContextTokens } from "../../packages/core-runtime/src/context.js";
import { ModelContextManager, parseContextSummary } from "../../packages/core-runtime/src/context-manager.js";
import { prepareWireChat, isContextOverflow } from "../../packages/providers-shared/src/index.js";
import { OpenAssistDatabase, contextSourceDigest } from "../../packages/storage-sqlite/src/index.js";
import { createLogger } from "../../packages/observability/src/index.js";
import { RecoveryWorker } from "../../packages/recovery/src/index.js";

const auth = { apiKey: "fixture" };
const response = (content = "ok"): ChatResponse => ({ output: { role: "assistant", content }, usage: { inputTokens: 10, outputTokens: 2, totalTokens: 12 } });
const summary = JSON.stringify({ goals: "Keep FACT-NINE; corrected target Debian", constraints: "No new approval", decisions: "Debian", openWork: "finish task", completedActions: "call-repeat done", evidence: "source message references retained" });
const roots: string[] = [];
const databases: OpenAssistDatabase[] = [];
// Real WAL/fsync fixtures vary on hosted Windows disks; parser CPU assertions keep their own strict bound.
const DATABASE_TEST_TIMEOUT_MS = 15_000;
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); databases.splice(0).forEach(db => db.close()); roots.splice(0).forEach(root => fs.rmSync(root, { recursive: true, force: true })); });

function fixture(policy: Partial<RuntimeConfig["context"]> = {}, summarize = vi.fn(async () => response(summary))) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "openassist-context-")); roots.push(root);
  const db = new OpenAssistDatabase({ dbPath: path.join(root, "state.db"), logger: createLogger({ service: "context-test" }) }); databases.push(db);
  const config = toRuntimeConfig(createDefaultConfigObject());
  config.providers = [{ id: "test", type: "openai-compatible", defaultModel: "custom" }]; config.defaultProviderId = "test";
  config.context = { ...DEFAULT_CONTEXT_CONFIG, ...policy };
  const provider = { id: () => "test", chat: vi.fn(async () => response()), capabilities: () => ({
    supportsStreaming: false, supportsTools: true, supportsOAuth: false, supportsApiKeys: true, supportsImageInputs: false
  }) } as unknown as ProviderAdapter;
  const enqueue = vi.fn();
  const manager = new ModelContextManager(db, () => config, summarize, enqueue);
  const sessionId = "telegram:fixture";
  const append = (role: "user"|"assistant"|"tool", content: string, toolCallId?: string) => db.recordAssistantMessage(sessionId, "fixture", { role, content, toolCallId, toolName: toolCallId ? "exec.run" : undefined });
  const request = (): ChatRequest => ({ sessionId, model: "custom", messages: [{ role: "system", content: "mandatory identity" }, ...db.context.history(sessionId).messages], tools: [], metadata: {} });
  return { root, db, config, provider, enqueue, manager, summarize, append, request, sessionId };
}

describe("model context contracts", () => {
  it("defaults automatic compaction on and validates an explicit off setting", () => {
    const config = createDefaultConfigObject();
    expect(parseConfig(config).runtime.context.autoCompact).toBe(true);
    config.runtime.context.autoCompact = false;
    expect(toRuntimeConfig(parseConfig(config)).context!.autoCompact).toBe(false);
    expect(() => parseConfig({ ...config, runtime: { ...config.runtime, context: { ...config.runtime.context, autoCompact: "false" } } })).toThrow();
  });

  it("sends a fitting request above the trigger without summarizing when auto-compaction is off", async () => {
    const f = fixture({ autoCompact: false, maxInputTokens: 4000 });
    f.append("user", "x".repeat(10_500)); f.append("assistant", "done"); f.append("user", "CURRENT");
    const original = f.db.context.history(f.sessionId).messages;
    const prepared = await f.manager.admit(f.provider, f.request(), auth);
    expect(prepared.accounting.inputTokens).toBeGreaterThanOrEqual(3400);
    expect(prepared.accounting.inputTokens).toBeLessThanOrEqual(4000);
    await prepared.send(auth);
    expect(f.provider.chat).toHaveBeenCalledOnce(); expect(f.summarize).not.toHaveBeenCalled();
    expect(f.enqueue).not.toHaveBeenCalled(); expect(f.db.context.checkpoint(f.sessionId)).toBeNull();
    expect(f.manager.status(f.sessionId)?.autoCompact).toBe(false);
    expect(f.db.context.history(f.sessionId).messages).toEqual(original);
    f.config.context!.autoCompact = true;
    expect(f.manager.snapshot()[f.sessionId]?.autoCompact).toBe(true);
  }, DATABASE_TEST_TIMEOUT_MS);

  it.each(["tokens", "bytes", "preparation"])("keeps the %s admission guard when auto-compaction is off", async bound => {
    const f = fixture({ autoCompact: false, maxInputTokens: bound === "tokens" ? 4000 : 80_000, maxRequestBytes: 65_536 });
    f.config.providers[0]!.contextWindowTokens = 1_050_000;
    f.append("user", "x".repeat(bound === "tokens" ? 20_000 : bound === "bytes" ? 70_000 : 160_000));
    f.append("assistant", "done"); f.append("user", "CURRENT");
    const original = f.db.context.history(f.sessionId).messages;
    await expect(f.manager.admit(f.provider, f.request(), auth)).rejects.toThrow(/off.*\/compact/);
    expect(f.summarize).not.toHaveBeenCalled(); expect(f.provider.chat).not.toHaveBeenCalled(); expect(f.enqueue).not.toHaveBeenCalled();
    expect(f.db.context.checkpoint(f.sessionId)).toBeNull(); expect(f.db.context.history(f.sessionId).messages).toEqual(original);
  }, DATABASE_TEST_TIMEOUT_MS);

  it("does not repair a provider overflow automatically when disabled", async () => {
    const f = fixture({ autoCompact: false });
    f.append("user", "older ".repeat(1000)); f.append("assistant", "done"); f.append("user", "CURRENT");
    const prepared = await f.manager.admit(f.provider, f.request(), auth);
    const reject = vi.spyOn(f.db.context, "reject");
    await expect(f.manager.repair(f.provider, f.request(), auth, prepared)).rejects.toThrow(/off.*\/compact/);
    expect(reject).not.toHaveBeenCalled(); expect(f.summarize).not.toHaveBeenCalled(); expect(f.enqueue).not.toHaveBeenCalled();
    expect(f.db.context.checkpoint(f.sessionId)).toBeNull();
  }, DATABASE_TEST_TIMEOUT_MS);

  it("skips automatic maintenance after reopening with compaction disabled", async () => {
    const f = fixture({ autoCompact: false, maxInputTokens: 4000 });
    f.append("user", "x".repeat(20_000)); f.append("assistant", "done"); f.append("user", "CURRENT");
    const original = f.db.context.history(f.sessionId).messages;
    f.db.close(); databases.splice(databases.indexOf(f.db), 1);
    f.db = new OpenAssistDatabase({ dbPath: path.join(f.root,"state.db"), logger: createLogger({ service: "context-auto-off" }) }); databases.push(f.db);
    f.manager = new ModelContextManager(f.db, () => f.config, f.summarize, f.enqueue);
    await f.manager.maintain(f.provider, f.sessionId, "custom");
    expect(f.summarize).not.toHaveBeenCalled(); expect(f.enqueue).not.toHaveBeenCalled(); expect(f.db.context.checkpoint(f.sessionId)).toBeNull();
    expect(f.db.context.history(f.sessionId).messages).toEqual(original);
  }, DATABASE_TEST_TIMEOUT_MS);

  it.each([false, true])("explicitly compacts below the trigger with auto-compaction=%s and permanent memory off", async automatic => {
    const f = fixture({ autoCompact: automatic }); f.config.memory = { enabled: false };
    f.append("user", "completed task ".repeat(300)); f.append("assistant", "completed response ".repeat(200)); f.append("user", "/compact");
    const original = f.db.context.history(f.sessionId).messages;
    const before = await f.manager.admit(f.provider, f.request(), auth);
    expect(before.accounting.inputTokens).toBeLessThan(f.manager.status(f.sessionId)!.limits.usableInputTokens * .85);
    expect(f.summarize).not.toHaveBeenCalled();
    expect(await f.manager.compactSession(f.provider, f.sessionId, "custom")).toBe(true);
    expect(f.summarize).toHaveBeenCalledOnce(); expect(f.enqueue).not.toHaveBeenCalled();
    const [, request] = f.summarize.mock.calls[0] as unknown as [ProviderAdapter, ChatRequest];
    expect(request.tools).toEqual([]); expect(request.metadata.source).toBe("runtime.context.summary");
    expect(f.db.context.checkpoint(f.sessionId)).toMatchObject({ revision: 1, coveredThrough: Number(original[1]!.id), sourceDigest: contextSourceDigest(original.slice(0,2)) });
    expect(f.db.context.history(f.sessionId).messages).toEqual(original);
    expect(f.manager.project(f.request()).messages.at(-1)).toEqual(original.at(-1));
    expect(f.manager.status(f.sessionId)).toMatchObject({ state: "stale", autoCompact: automatic, checkpointRevision: 1 });
    expect(f.manager.status(f.sessionId)?.accounting).toBeUndefined();
  }, DATABASE_TEST_TIMEOUT_MS);

  it("limits each explicit command to one source chunk without background continuation", async () => {
    const f = fixture({ autoCompact: false, maxInputTokens: 4000, summarySourceTokens: 1024, summaryMaxTokens: 512 });
    for (let i=0; i<8; i++) { f.append("user", `task ${i} ` + "x".repeat(1300)); f.append("assistant", "done"); }
    f.append("user", "/compact");
    const original = f.db.context.history(f.sessionId).messages;
    expect(await f.manager.compactSession(f.provider, f.sessionId, "custom")).toBe(true);
    expect(f.summarize).toHaveBeenCalledOnce(); expect(f.enqueue).not.toHaveBeenCalled();
    const frontier = f.db.context.checkpoint(f.sessionId)!.coveredThrough;
    expect(frontier).toBeLessThan(Number(original.at(-2)!.id));
    expect(await f.manager.compactSession(f.provider, f.sessionId, "custom")).toBe(true);
    expect(f.summarize).toHaveBeenCalledTimes(2); expect(f.db.context.checkpoint(f.sessionId)!.coveredThrough).toBeGreaterThan(frontier);
    expect(f.db.context.history(f.sessionId).messages).toEqual(original);
  }, DATABASE_TEST_TIMEOUT_MS);

  it("does not call the provider when explicit compaction has no older complete turn", async () => {
    const f = fixture({ autoCompact: false }); f.append("user", "/compact");
    expect(await f.manager.compactSession(f.provider, f.sessionId, "custom")).toBe(false);
    expect(f.summarize).not.toHaveBeenCalled(); expect(f.enqueue).not.toHaveBeenCalled();
  }, DATABASE_TEST_TIMEOUT_MS);

  it.each(["malformed", "nonshrinking", "cancelled", "stale digest"])("preserves checkpoints without auto-queueing after explicit %s failure", async failure => {
    const f = fixture();
    f.append("user", failure === "nonshrinking" ? "tiny" : "x".repeat(6000)); f.append("assistant", "done"); f.append("user", "/compact");
    const original = f.db.context.history(f.sessionId).messages;
    if (failure === "malformed") f.summarize.mockResolvedValueOnce(response("invalid JSON"));
    if (failure === "cancelled") f.summarize.mockImplementationOnce(async () => { f.manager.stop(); return response(summary); });
    if (failure === "stale digest") f.summarize.mockImplementationOnce(async () => {
      const writer = new DatabaseSync(path.join(f.root,"state.db"));
      try { writer.prepare("UPDATE messages SET content=? WHERE id=?").run("changed original row", original[0]!.id!); } finally { writer.close(); }
      return response(summary);
    });
    if (failure === "stale digest") expect(await f.manager.compactSession(f.provider, f.sessionId, "custom")).toBe(false);
    else await expect(f.manager.compactSession(f.provider, f.sessionId, "custom")).rejects.toThrow(/compaction failed/);
    expect(f.db.context.checkpoint(f.sessionId)).toBeNull(); expect(f.db.getSessionMemory(f.sessionId)).toBeNull();
    expect(f.enqueue).not.toHaveBeenCalled();
    if (failure !== "stale digest") expect(f.db.context.history(f.sessionId).messages).toEqual(original);
  }, DATABASE_TEST_TIMEOUT_MS);

  it("rejects automatic adoption when the switch turns off during summarization", async () => {
    const f = fixture({ maxInputTokens: 4000, summaryMaxTokens: 512 });
    f.append("user", "x".repeat(20_000)); f.append("assistant", "done"); f.append("user", "CURRENT");
    const original = f.db.context.history(f.sessionId).messages;
    f.summarize.mockImplementationOnce(async () => { f.config.context!.autoCompact = false; return response(summary); });
    await expect(f.manager.admit(f.provider, f.request(), auth)).rejects.toThrow(/compaction failed/);
    expect(f.db.context.checkpoint(f.sessionId)).toBeNull(); expect(f.enqueue).not.toHaveBeenCalled();
    expect(f.manager.status(f.sessionId)?.autoCompact).toBe(false); expect(f.db.context.history(f.sessionId).messages).toEqual(original);
  }, DATABASE_TEST_TIMEOUT_MS);

  it("uses revision checks for concurrent explicit compaction", async () => {
    const f = fixture({ autoCompact: false });
    f.append("user", "x".repeat(6000)); f.append("assistant", "done"); f.append("user", "/compact");
    const original = f.db.context.history(f.sessionId).messages;
    const result = await Promise.all([f.manager.compactSession(f.provider, f.sessionId, "custom"), f.manager.compactSession(f.provider, f.sessionId, "custom")]);
    expect(result.filter(Boolean)).toHaveLength(1); expect(f.db.context.checkpoint(f.sessionId)?.revision).toBe(1);
    expect(f.db.context.history(f.sessionId).messages).toEqual(original); expect(f.enqueue).not.toHaveBeenCalled();
  }, DATABASE_TEST_TIMEOUT_MS);
  it.each(["foreground", "maintenance", "manual", "restart-foreground", "restart-maintenance", "restart-manual"])("recovers oversized stored tool rows at a smaller payload cap (%s)", async mode => {
    const f = fixture({ maxInputTokens: 4000, maxRequestBytes: 65_536, summaryMaxTokens: 512 });
    f.append("user", "x".repeat(4000));
    f.append("assistant", "", "call-repeat");
    const result = JSON.stringify({ text: "z".repeat(120_000), exitCode: 7 });
    f.append("tool", result, "call-repeat");
    f.append("user", "CURRENT " + "y".repeat(9000));
    const original = f.db.context.history(f.sessionId).messages;
    const bounded = f.db.context.history(f.sessionId, 0, f.config.context!.maxRequestBytes);
    expect(bounded.complete).toBe(false);
    expect(bounded.messages.some(message => message.role === "tool")).toBe(false);
    const request: ChatRequest = { ...f.request(), messages: [{ role: "system", content: "mandatory identity" }, ...bounded.messages, original.at(-1)!], metadata: { contextHistoryIncomplete: "true" } };
    if (mode.startsWith("restart")) {
      f.db.close(); databases.splice(databases.indexOf(f.db),1);
      f.db = new OpenAssistDatabase({ dbPath: path.join(f.root, "state.db"), logger: createLogger({ service: "context-restart" }) }); databases.push(f.db);
      f.manager = new ModelContextManager(f.db, () => f.config, f.summarize, f.enqueue);
    }
    if (mode.endsWith("foreground")) await f.manager.admit(f.provider, request, auth);
    else if (mode.endsWith("manual")) expect(await f.manager.compactSession(f.provider, f.sessionId, "custom")).toBe(true);
    else await f.manager.maintain(f.provider, f.sessionId, "custom");
    expect(f.summarize).toHaveBeenCalledOnce();
    const checkpoint = f.db.context.checkpoint(f.sessionId)!;
    expect(checkpoint.coveredThrough).toBe(Number(original[2]!.id));
    expect(checkpoint.sourceDigest).toBe(contextSourceDigest(original.slice(0,3)));
    const [, summaryRequest] = f.summarize.mock.calls[0] as unknown as [ProviderAdapter, ChatRequest];
    const tool = JSON.parse(summaryRequest.messages[1]!.content).records.find((record: { role: string }) => record.role === "tool");
    expect(JSON.parse(tool.content)).toMatchObject({ exitCode: 7, omittedCharacters: expect.any(Number), fullResult: { messageId: original[2]!.id, toolCallId: "call-repeat" } });
    const prepared = await f.manager.admit(f.provider, request, auth);
    expect(prepared.accounting.bytes).toBeLessThanOrEqual(65_536);
    await prepared.send(auth);
    const sent = (f.provider.chat as ReturnType<typeof vi.fn>).mock.calls[0]![0] as ChatRequest;
    expect(sent.messages[0]!.content).toBe("mandatory identity");
    expect(sent.messages.at(-1)).toEqual(original.at(-1));
    expect(f.provider.chat).toHaveBeenCalledOnce();
    expect(f.enqueue).not.toHaveBeenCalled();
    expect(f.db.context.history(f.sessionId).messages).toEqual(original);
  }, DATABASE_TEST_TIMEOUT_MS);

  it("preserves an oversized current request instead of excerpting it to the payload cap", async () => {
    const f = fixture({ maxInputTokens: 80_000, maxRequestBytes: 65_536 });
    f.config.providers[0]!.contextWindowTokens = 1_050_000;
    f.append("user", "CURRENT " + "x".repeat(120_000));
    const original = f.db.context.history(f.sessionId).messages;
    const request = { ...f.request(), metadata: { contextHistoryIncomplete: "true" } };
    expect(f.manager.project(request).messages.at(-1)).toEqual(original[0]);
    await expect(f.manager.admit(f.provider, request, auth)).rejects.toThrow(/does not fit/);
    expect(f.summarize).not.toHaveBeenCalled(); expect(f.provider.chat).not.toHaveBeenCalled();
    expect(f.db.context.checkpoint(f.sessionId)).toBeNull();
    expect(f.db.context.history(f.sessionId).messages).toEqual(original);
  }, DATABASE_TEST_TIMEOUT_MS);

  it("rejects a stale oversized source digest without adopting or rewriting history", async () => {
    const f = fixture({ maxInputTokens: 4000, maxRequestBytes: 65_536, summaryMaxTokens: 512 });
    f.append("user", "x".repeat(4000)); f.append("assistant", "", "call-repeat");
    f.append("tool", "z".repeat(120_000), "call-repeat"); f.append("user", "CURRENT " + "y".repeat(9000));
    const original = f.db.context.history(f.sessionId).messages;
    const changed = "changed " + "z".repeat(120_000);
    f.summarize.mockImplementationOnce(async () => {
      const writer = new DatabaseSync(path.join(f.root, "state.db"));
      try { writer.prepare("UPDATE messages SET content=? WHERE id=?").run(changed, original[2]!.id!); }
      finally { writer.close(); }
      return response(summary);
    });
    await expect(f.manager.admit(f.provider, f.request(), auth)).rejects.toThrow(/does not fit/);
    expect(f.summarize).toHaveBeenCalledOnce(); expect(f.provider.chat).not.toHaveBeenCalled();
    expect(f.db.context.checkpoint(f.sessionId)).toBeNull();
    expect(f.db.getSessionMemory(f.sessionId)).toBeNull();
    expect(f.db.context.history(f.sessionId).messages).toEqual(original.map((message, index) => index === 2 ? { ...message, content: changed } : message));
  }, DATABASE_TEST_TIMEOUT_MS);

  it("rejects an individually larger raw row before hydration and preserves the source", async () => {
    const f = fixture({ maxRequestBytes: 65_536 });
    f.append("user", "original");
    const writer = new DatabaseSync(path.join(f.root, "state.db"));
    try {
      // SQLite creates the oversized fixture without allocating its full content in the test process.
      writer.prepare("UPDATE messages SET content=CAST(zeroblob(?) AS TEXT) WHERE session_id=?").run(DEFAULT_CONTEXT_CONFIG.maxRequestBytes + 1, f.sessionId);
    } finally { writer.close(); }
    const source = f.db.context.history(f.sessionId);
    expect(source).toMatchObject({ complete: false, messages: [], blockedMessage: { bytes: expect.any(Number) } });
    expect(source.blockedMessage!.bytes).toBeGreaterThan(DEFAULT_CONTEXT_CONFIG.maxRequestBytes);
    const request: ChatRequest = { sessionId: f.sessionId, model: "custom", tools: [], messages: [], metadata: { contextHistoryIncomplete: "true" } };
    await expect(f.manager.admit(f.provider, request, auth)).rejects.toThrow(/raw-source read limit/);
    await expect(f.manager.maintain(f.provider, f.sessionId, "custom")).rejects.toThrow(/raw-source read limit/);
    expect(f.summarize).not.toHaveBeenCalled(); expect(f.provider.chat).not.toHaveBeenCalled();
    expect(f.db.context.checkpoint(f.sessionId)).toBeNull();
    expect(f.db.context.history(f.sessionId)).toEqual(source);
  }, DATABASE_TEST_TIMEOUT_MS);

  it("reports incomplete maintenance without progress instead of silently completing", async () => {
    const f = fixture({ maxInputTokens: 800_000 });
    f.config.providers[0]!.contextWindowTokens = 1_050_000;
    f.append("user", "one long segment");
    const writer = new DatabaseSync(path.join(f.root, "state.db"));
    try {
      writer.exec("BEGIN");
      const insert = writer.prepare("INSERT INTO messages(session_id,conversation_key,role,content,created_at) VALUES(?,?,?,?,?)");
      for (let index = 0; index < 10_000; index++) insert.run(f.sessionId, "fixture", "assistant", "continuation", "2026-10-18T00:00:00.000Z");
      writer.exec("COMMIT");
    } finally { writer.close(); }
    expect(f.db.context.history(f.sessionId).complete).toBe(false);
    await expect(f.manager.maintain(f.provider, f.sessionId, "custom")).rejects.toThrow(/cannot advance across the incomplete source range/);
    expect(f.summarize).not.toHaveBeenCalled(); expect(f.db.context.checkpoint(f.sessionId)).toBeNull();
  }, DATABASE_TEST_TIMEOUT_MS);

  it.each(["row/foreground", "row/maintenance", "row/manual", "byte/foreground", "byte/maintenance", "byte/manual"])(
    "reconciles hydrated orphan frames without losing raw coverage (%s)", async mode => {
      const rowBound = mode.startsWith("row");
      const f = fixture({ maxInputTokens: 800_000, summaryMaxTokens: 512, ...(rowBound ? {} : { maxRequestBytes: 65_536 }) });
      f.config.providers[0]!.contextWindowTokens = 1_050_000;
      f.append("user", "interrupted task");
      f.append("assistant", "", "orphan-call");
      // Seed the real storage schema in one transaction, avoiding 10,000 WAL/fsync commits.
      const writer = new DatabaseSync(path.join(f.root, "state.db"));
      try {
        writer.exec("BEGIN");
        const insert = writer.prepare("INSERT INTO messages(session_id,conversation_key,role,content,created_at) VALUES(?,?,?,?,?)");
        for (let turn = 0; turn < (rowBound ? 4999 : 40); turn++) {
          insert.run(f.sessionId, "fixture", "user", rowBound ? `task ${turn}` : `task ${turn} ${"x".repeat(2000)}`, "2026-10-18T00:00:00.000Z");
          insert.run(f.sessionId, "fixture", "assistant", "done", "2026-10-18T00:00:00.000Z");
        }
        writer.exec("COMMIT");
      } finally { writer.close(); }
      f.append("user", "CURRENT complete request");
      const first = f.db.context.history(f.sessionId);
      const original = [...first.messages, ...f.db.context.history(f.sessionId, Number(first.messages.at(-1)!.id)).messages];
      expect(original).toHaveLength(rowBound ? 10_001 : 83);
      const history = f.db.context.history(f.sessionId, 0, f.config.context!.maxRequestBytes);
      expect(history.complete).toBe(false);
      const current = original.at(-1)!;
      // handleInbound has already reconciled this bounded projection before admission.
      const request: ChatRequest = { ...f.request(), messages: [{ role: "system", content: "mandatory identity" },
        ...history.messages.filter(message => message.toolCallId !== "orphan-call"), current], metadata: { contextHistoryIncomplete: "true" } };
      const finish = vi.spyOn(f.db.context, "finish");
      if (mode.endsWith("foreground")) await f.manager.admit(f.provider, request, auth);
      else if (mode.endsWith("manual")) expect(await f.manager.compactSession(f.provider, f.sessionId, "custom")).toBe(true);
      else await f.manager.maintain(f.provider, f.sessionId, "custom");
      expect(f.summarize).toHaveBeenCalled();
      expect(f.db.context.checkpoint(f.sessionId)?.revision).toBeGreaterThan(0);
      expect(finish.mock.calls[0]![1]).toContain("Unmatched historical tool frames were excluded");
      for (const [job] of finish.mock.calls) {
        expect(job.sourceDigest).toBe(contextSourceDigest(original.filter(message => Number(message.id) > job.afterMessageId && Number(message.id) <= job.throughMessageId)));
      }
      const projected = f.manager.project(request);
      expect(projected.messages.some(message => message.toolCallId === "orphan-call")).toBe(false);
      expect(projected.messages.at(-1)).toEqual(current);
      await (await f.manager.admit(f.provider, request, auth)).send(auth);
      const sent = (f.provider.chat as ReturnType<typeof vi.fn>).mock.calls.at(-1)![0] as ChatRequest;
      expect(sent.messages[0]!.content).toBe("mandatory identity");
      expect(sent.messages.some(message => message.toolCallId === "orphan-call")).toBe(false);
      expect(sent.messages.at(-1)).toEqual(current);
      expect(f.provider.chat).toHaveBeenCalledOnce();
      expect(f.enqueue).not.toHaveBeenCalled();
      const after = f.db.context.history(f.sessionId);
      expect([...after.messages, ...f.db.context.history(f.sessionId, Number(after.messages.at(-1)!.id)).messages]).toEqual(original);
    }, DATABASE_TEST_TIMEOUT_MS
  );

  it.each([
    (value: string) => value,
    (value: string) => `\x60\x60\x60json\n${value}\n\x60\x60\x60`,
    (value: string) => ` \x60\x60\x60JSON\r\n\t${value}\u2003\x60\x60\x60\n`,
    (value: string) => `\x60\x60\x60\n${value}\n\x60\x60\x60`,
    (value: string) => `\x60\x60\x60json${value}`,
    (value: string) => `${value}\x60\x60\x60`
  ])("preserves supported plain and fenced summary forms (%#)", wrap => {
    expect(parseContextSummary(wrap(summary),512)).toBe(summary);
  });

  it("parses whitespace-heavy summaries without backtracking before validation", () => {
    const whitespace = " ".repeat(40_000);
    const valid = JSON.stringify({ ...JSON.parse(summary), goals: `prefix${whitespace}suffix` });
    const started = performance.now();
    expect(parseContextSummary(valid,16_384)).toBe(valid);
    for (const suffix of ["!", "\x60\x60!"]) {
      expect(() => parseContextSummary(`x${" ".repeat(60_000)}${suffix}`,8192)).toThrow(/invalid JSON/);
    }
    // The previous suffix regex took seconds; leave ample headroom for a linear parse on CI.
    expect(performance.now() - started).toBeLessThan(1000);
  });

  it("rejects raw summary input above the UTF-8 byte bound before adopting any content", () => {
    expect(() => parseContextSummary(`${" ".repeat(131_072)}${summary}`,16_384)).toThrow(/budget/);
    const unicode = JSON.stringify({ ...JSON.parse(summary), goals: "界".repeat(44_000) });
    expect(unicode.length).toBeLessThan(131_072);
    expect(() => parseContextSummary(unicode,16_384)).toThrow(/budget/);
  });
  it("resolves exact route limits, independent input/output caps and unknown serving windows", () => {
    const model = "gpt-6.1-sol";
    const native: ProviderConfig = { id: "p", type: "openai", defaultModel: model };
    expect(resolveContextLimits(native)).toMatchObject({ contextWindowTokens: 1_050_000, reservedOutputTokens: 128_000, source: "catalog", checkedAt: "2026-10-16" });
    expect(resolveContextLimits(native, model, { maxInputTokens: 32_000 }).usableInputTokens).toBe(32_000);
    expect(resolveContextLimits({ ...native, contextWindowTokens: 2_000_000 }).contextWindowTokens).toBe(1_050_000);
    expect(resolveContextLimits({ ...native, baseUrl: "http://localhost:1234/v1" }).source).toBe("fallback");
    expect(resolveContextLimits({ ...native, type: "codex" }).contextWindowTokens).toBe(24_000);
    expect(resolveContextLimits({ ...native, type: "openai-compatible", contextWindowTokens: 64_000 }).source).toBe("configured");
    const azure: ProviderConfig = { id: "a", type: "azure-foundry", resourceName: "fixture", endpointFlavor: "openai-resource", authMode: "api-key", defaultModel: model };
    expect(resolveContextLimits(azure).source).toBe("fallback"); // Deployment name cannot establish capacity.
    expect(resolveContextLimits({ ...azure, underlyingModel: model }).maxInputTokens).toBe(922_000);
    expect(resolveContextLimits({ ...azure, underlyingModel: model, baseUrl: "https://fixture.openai.azure.com/openai/v1/" }).source).toBe("catalog");
    expect(resolveContextLimits({ ...azure, underlyingModel: model, baseUrl: "https://example.test/v1" }).source).toBe("fallback");
    expect(resolveContextLimits({ id: "c", type: "anthropic", defaultModel: "claude-sonnet-5-5" }, undefined, {}, 16_384).usableInputTokens).toBe(963_616);
    expect(() => resolveContextLimits({ ...native, contextWindowTokens: 4096 })).toThrow(/no usable input/);
  });

  it("validates policy bounds and impossible explicit reservations", () => {
    const config = createDefaultConfigObject();
    expect(parseConfig(config).runtime.context).toEqual(DEFAULT_CONTEXT_CONFIG);
    config.runtime.context.targetRatio = 0.9;
    expect(() => parseConfig(config)).toThrow();
    config.runtime.context = { ...DEFAULT_CONTEXT_CONFIG, maxRequestBytes: 100 };
    expect(() => parseConfig(config)).toThrow();
    config.runtime.context = { ...DEFAULT_CONTEXT_CONFIG };
    config.runtime.providers[0]!.contextWindowTokens = 4096;
    expect(() => parseConfig(config)).toThrow(/no usable input/);
  });

  it("counts and executes one immutable payload including schemas, arguments and replay", async () => {
    const payload = { model: "fixture", instructions: "identity", input: [{ content: "你好" }], tools: [{ schema: { property: "x".repeat(1000) } }], replay: "opaque" };
    const send = vi.fn(async () => response()); const count = vi.fn(async () => 123);
    const prepared = prepareWireChat(payload, send, { identity: "route:endpoint:model", countTokens: count });
    expect(Object.isFrozen(payload.input)).toBe(true);
    expect(prepared.accounting.components.tools).toBeGreaterThan(300);
    expect(prepared.accounting.bytes).toBe(Buffer.byteLength(JSON.stringify(payload)));
    expect(await prepared.countTokens!(auth)).toBe(123);
    await prepared.send(auth);
    expect(count.mock.calls[0]?.[0]).toBe(send.mock.calls[0]?.[0]);
    expect(prepareWireChat({ ...payload, replay: "changed" }, send, { identity: "route:endpoint:model" }).accounting.fingerprint).not.toBe(prepared.accounting.fingerprint);
    expect(prepareWireChat({ small: true }, send, { identity: "x", alternatives: [payload] }).accounting.bytes).toBe(prepared.accounting.bytes);
    await expect(prepareWireChat({}, send, { identity: "x", countTokens: async () => NaN }).countTokens!(auth)).rejects.toThrow(/invalid/);
    expect(isContextOverflow({ status: 400, message: "prompt is too long" })).toBe(true);
    expect(isContextOverflow({ error: { code: "context_length_exceeded" } })).toBe(true);
    for (const error of [null, { status: 429, message: "token rate limit" }, { status: 413, message: "body too large" }, { status: 400, message: "output limit" }]) expect(isContextOverflow(error)).toBe(false);
    await expect(prepareWireChat({}, async () => { throw { code: "context_length_exceeded" }; }, { identity: "x" }).send(auth)).rejects.toMatchObject({ code: "OPENASSIST_CONTEXT_OVERFLOW" });
    await expect(prepareWireChat({}, async () => { throw new Error("network"); }, { identity: "x" }).send(auth)).rejects.toThrow("network");
  });

  it("retains a ninth fact and 100 whole turns while pairing repeated tool IDs by occurrence", () => {
    const messages = Array.from({ length: 100 }, (_, i) => [{ role: "user" as const, content: i === 8 ? "FACT-NINE" : `task ${i}` }, { role: "assistant" as const, content: "done" }]).flat();
    expect(new ContextPlanner().plan({ systemMessages: [{ role: "system", content: "identity" }], recentMessages: messages }).messages).toHaveLength(201);
    expect(conversationSegments([{ role: "user", content: "a" }, { role: "assistant", content: "", toolCallId: "repeat" }, { role: "assistant", content: "", toolCallId: "repeat" }, { role: "tool", content: "one", toolCallId: "repeat" }, { role: "user", content: "must stay with pending call" }, { role: "tool", content: "two", toolCallId: "repeat" }, { role: "user", content: "next" }]).map(segment => segment.length)).toEqual([6,1]);
  });

  it("adopts contiguous checkpoints atomically, rejects stale writers, preserves rows on reopen", () => {
    const f = fixture(); f.append("user", "a"); f.append("assistant", "b");
    const source = f.db.context.history(f.sessionId);
    expect(f.db.context.history(f.sessionId,0,1).complete).toBe(false);
    const intent = { sessionId: f.sessionId, expectedRevision: 0, afterMessageId: 0, throughMessageId: Number(source.messages.at(-1)!.id), sourceDigest: contextSourceDigest(source.messages), scope: "test:custom" };
    const job = f.db.context.begin(intent);
    expect(f.db.context.begin(intent).id).toBe(job.id);
    expect(f.db.context.finish({ ...job, id: -1 }, summary, 100_000)).toBeNull();
    expect(f.db.context.finish(job, summary, 100_000)?.revision).toBe(1);
    expect(f.db.context.finish(job, "stale", 100_000)).toBeNull();
    expect(() => f.db.context.begin(intent)).toThrow(/changed/);
    expect(f.db.getSessionMemory(f.sessionId)?.summary).toBe(summary);
    expect(f.db.context.history(f.sessionId).messages).toHaveLength(2);
    f.db.close(); databases.splice(databases.indexOf(f.db),1);
    const reopened = new OpenAssistDatabase({ dbPath: path.join(f.root,"state.db"), logger: createLogger({ service: "reopen" }) }); databases.push(reopened);
    expect(reopened.context.checkpoint(f.sessionId)?.coveredThrough).toBe(intent.throughMessageId);
    expect(reopened.context.history(f.sessionId).messages).toHaveLength(2);
    expect(reopened.context.reject(f.sessionId,"fingerprint")).toBe(true);
    expect(reopened.context.reject(f.sessionId,"fingerprint")).toBe(false);
    reopened.context.repaired(f.sessionId,"fingerprint",false);
  }, DATABASE_TEST_TIMEOUT_MS);

  it("compacts under pressure without clipping the current request or mandatory guidance", async () => {
    const f = fixture({ maxInputTokens: 4000, summaryMaxTokens: 512 });
    for (let i=0;i<6;i++) { f.append("user", `FACT-NINE ${"x".repeat(2400)}`); f.append("assistant", "done"); }
    f.append("user", "CURRENT-REQUEST");
    const prepared = await f.manager.admit(f.provider,f.request(),auth);
    expect(prepared.accounting.inputTokens).toBeLessThanOrEqual(4000);
    expect(f.db.context.checkpoint(f.sessionId)?.revision).toBeGreaterThan(0);
    const projection = f.manager.project(f.request());
    expect(projection.messages[0]?.content).toBe("mandatory identity");
    expect(projection.messages.at(-1)?.content).toBe("CURRENT-REQUEST");
    expect(projection.messages.some(message => message.content.includes("FACT-NINE"))).toBe(true);
    expect(f.provider.chat).not.toHaveBeenCalled();
    expect(f.db.context.history(f.sessionId).messages).toHaveLength(13);
  }, DATABASE_TEST_TIMEOUT_MS);

  it.each(["not JSON", JSON.stringify({ goals: "missing fields" }), summary.replace("call-repeat", "lost"), `${" ".repeat(131_072)}${summary}`])(
    "retains the frontier for a rejected summary candidate (%#)", async content => {
      const f = fixture({ maxInputTokens: 4000 }, vi.fn(async () => response(content)));
      f.append("user", "x".repeat(4000)); f.append("assistant", "", "call-repeat"); f.append("tool", "receipt", "call-repeat"); f.append("user", "y".repeat(9000));
      await expect(f.manager.admit(f.provider,f.request(),auth)).rejects.toThrow(/compaction/);
      expect(f.db.context.checkpoint(f.sessionId)).toBeNull(); expect(f.enqueue).toHaveBeenCalledOnce();
    }, DATABASE_TEST_TIMEOUT_MS
  );

  it("retains the frontier when an in-flight summary is cancelled", async () => {
    let started!: () => void;
    const ready = new Promise<void>(resolve => { started = resolve; });
    const f = fixture({ maxInputTokens: 4000 }, vi.fn(() => { started(); return new Promise<ChatResponse>(() => {}); }));
    f.append("user", "x".repeat(4000)); f.append("assistant", "done"); f.append("user", "y".repeat(9000));
    const result = f.manager.admit(f.provider,f.request(),auth).catch((error: unknown) => error);
    await ready;
    f.manager.stop();
    await expect(result).resolves.toMatchObject({ name: "ContextAdmissionError", message: expect.stringContaining("compaction") });
    expect(f.db.context.checkpoint(f.sessionId)).toBeNull(); expect(f.enqueue).not.toHaveBeenCalled(); f.manager.start();
  }, DATABASE_TEST_TIMEOUT_MS);

  it("blocks oversized mandatory input and sidecars, projects tool output with receipts", async () => {
    const f = fixture({ maxInputTokens: 2000 });
    f.append("user", "CURRENT".repeat(2000));
    await expect(f.manager.admit(f.provider,f.request(),auth)).rejects.toThrow(/does not fit/);
    expect(f.summarize).not.toHaveBeenCalled();
    await expect(f.manager.admit(f.provider,{ ...f.request(), metadata: { source: "scheduler" } },auth)).rejects.toThrow(/does not fit/);
    const small: ChatRequest = { ...f.request(), messages: [{ role: "user", content: "inspect" }, { role: "assistant", content: "", toolCallId: "call" }, { role: "tool", content: JSON.stringify({ text: "z".repeat(20_000), exitCode: 7 }), toolCallId: "call", metadata: { isError: "true" } }] };
    await (await f.manager.admit(f.provider,small,auth)).send(auth);
    expect(f.provider.chat).toHaveBeenCalledOnce();
    const projected = (f.provider.chat as ReturnType<typeof vi.fn>).mock.calls[0]![0] as ChatRequest;
    expect(JSON.parse(projected.messages.at(-1)!.content)).toMatchObject({ exitCode: 7, isError: "true", fullResult: { toolCallId: "call" } });
    expect(small.messages.at(-1)!.content.length).toBeGreaterThan(20_000);
    const huge = { ...small, messages: [{ role: "user" as const, content: "x".repeat(DEFAULT_CONTEXT_CONFIG.maxRequestBytes*2) }] };
    await expect(f.manager.admit(f.provider,huge,auth)).rejects.toThrow(/resource bound/);
  }, DATABASE_TEST_TIMEOUT_MS);

  it("reuses exact counts only for matching candidates and falls back on unavailable counting", async () => {
    const f = fixture({ maxInputTokens: 4000 }); f.append("user", "x".repeat(9500));
    const count = vi.fn(async () => 1000);
    f.provider.prepareChat = async request => prepareWireChat({ input: request.messages, tools: request.tools }, async () => response(), { identity: "fixture", countTokens: count });
    const prepared = await f.manager.admit(f.provider,f.request(),auth); expect(prepared.accounting.source).toBe("counted");
    f.manager.observe(f.sessionId,prepared.accounting,response());
    await f.manager.admit(f.provider,f.request(),auth); expect(count).toHaveBeenCalledOnce();
    count.mockRejectedValueOnce(new Error("count unavailable"));
    const changed = { ...f.request(), tools: [{ name: "read", description: "bounded", inputSchema: {} }] };
    expect((await f.manager.admit(f.provider,changed,auth)).accounting.source).toBe("estimated");
    expect(f.manager.status(f.sessionId)?.failure).toMatch(/unavailable/);
    expect(f.manager.status("new-session")?.state).toBe("stale");
    expect(f.manager.snapshot()[f.sessionId]).toBeDefined();
  }, DATABASE_TEST_TIMEOUT_MS);

  it("bounds provider rejection repair and validates summary structure/redaction", async () => {
    const f = fixture(); f.append("user", "old".repeat(1000)); f.append("assistant", "done"); f.append("user", "current");
    const rejected = await f.manager.admit(f.provider,f.request(),auth);
    const repaired = await f.manager.repair(f.provider,f.request(),auth,rejected);
    expect(repaired.accounting.inputTokens).toBeLessThan(rejected.accounting.inputTokens);
    await expect(f.manager.repair(f.provider,f.request(),auth,rejected)).rejects.toThrow(/unchanged/);
    await expect(f.manager.repair(f.provider,{ ...f.request(), metadata: { source: "scheduler" } },auth,rejected)).rejects.toThrow(/unchanged/);
    expect(parseContextSummary(`\x60\x60\x60json\n${summary}\n\x60\x60\x60`,512)).toBe(summary);
    expect(parseContextSummary(summary.replace("FACT-NINE","sk-fixture_not_a_real_credential"),512)).toContain("[REDACTED]");
    expect(() => parseContextSummary(summary,1)).toThrow(/budget/);
    await f.manager.maintain(f.provider,f.sessionId,"custom");
  }, DATABASE_TEST_TIMEOUT_MS);

  it.each([false, true])("edits context settings with auto-compaction=%s, strict re-prompting and optional provider limits", async automatic => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(),"openassist-context-wizard-")); roots.push(root);
    const state = loadSetupWizardState(path.join(root,"config.toml"),path.join(root,"env"));
    const answers = ["bad", "32000", "", "85", "90", "60", "33554432", "1024", "32768", "200000"];
    const prompts = { confirm: vi.fn(async () => automatic), input: vi.fn(async () => answers.shift()!), select: vi.fn(async () => state.config.runtime.providers[0]!.id) } as unknown as PromptAdapter;
    vi.spyOn(console,"error").mockImplementation(() => {});
    await editContextBudgets(state,prompts);
    expect(state.config.runtime.context).toMatchObject({ autoCompact: automatic, maxInputTokens: 32000, targetRatio: .6, summaryMaxTokens: 1024 });
    expect(state.config.runtime.providers[0]!.contextWindowTokens).toBe(200000);
    expect(() => parseConfig(state.config)).not.toThrow();
  });

  it("resumes persisted context intent and drains active recovery before database shutdown", async () => {
    const f = fixture(); f.append("user","older task"); f.append("assistant","done");
    const source = f.db.context.history(f.sessionId).messages;
    const job = f.db.context.begin({ sessionId: f.sessionId, expectedRevision: 0, afterMessageId: 0,
      throughMessageId: Number(source.at(-1)!.id), sourceDigest: contextSourceDigest(source), scope: "test:custom" });
    expect(f.db.context.resumePending().map(item => item.id)).toContain(job.id);
    const jobId = f.db.enqueueJob("context_maintenance", { compactionId: job.id }, { maxAttempts: 3, initialDelayMs: 1, maxDelayMs: 1 });
    f.db.claimDueJobs(1);
    expect(f.db.context.resumePending()).toEqual([]);
    expect(f.db.claimDueJobs(1)[0]?.id).toBe(jobId);
    f.db.context.resumePending();
    let release!: () => void;
    const blocked = new Promise<void>(resolve => { release = resolve; });
    const run = vi.fn(() => blocked);
    const worker = new RecoveryWorker({ db: f.db, logger: createLogger({ service: "context-recovery" }), handlers: { context_maintenance: { run } } });
    worker.start();
    await vi.waitFor(() => expect(run).toHaveBeenCalledOnce());
    let drained = false; const stopping = worker.stop().then(() => { drained = true; });
    await Promise.resolve(); expect(drained).toBe(false);
    release(); await stopping; expect(drained).toBe(true);
  }, DATABASE_TEST_TIMEOUT_MS);

  it.each(["admission", "maintenance"])("compacts large tool results through bounded source projections during %s", async mode => {
    const f = fixture({ maxInputTokens: 4000, summaryMaxTokens: 512 });
    const fullResult = JSON.stringify({ text: "z".repeat(120_000), exitCode: 7 });
    f.append("user", "inspect the completed result");
    f.append("assistant", "", "call-repeat");
    f.append("tool", fullResult, "call-repeat");
    f.append("user", "CURRENT-REQUEST " + "x".repeat(9000));
    const original = f.db.context.history(f.sessionId).messages;
    if (mode === "admission") await f.manager.admit(f.provider, f.request(), auth);
    else await f.manager.maintain(f.provider, f.sessionId, "custom");
    expect(f.summarize).toHaveBeenCalledOnce();
    const [, summaryRequest] = f.summarize.mock.calls[0] as unknown as [ProviderAdapter, ChatRequest];
    const records = JSON.parse(summaryRequest.messages[1]!.content).records;
    const tool = records.find((record: { role: string }) => record.role === "tool");
    expect(JSON.parse(tool.content)).toMatchObject({ exitCode: 7, fullResult: { sessionId: f.sessionId, toolCallId: "call-repeat", messageId: original[2]!.id } });
    expect(tool.content.length).toBeLessThan(2000);
    expect(f.db.context.checkpoint(f.sessionId)).toMatchObject({ coveredThrough: Number(original[2]!.id), sourceDigest: contextSourceDigest(original.slice(0,3)) });
    expect(f.db.context.history(f.sessionId).messages[2]!.content).toBe(fullResult);
    expect(f.provider.chat).not.toHaveBeenCalled();
  }, DATABASE_TEST_TIMEOUT_MS);

  it.each([false, true])("charges image binaries in the preparation guard only when mapped (vision=%s)", async vision => {
    const f = fixture();
    f.provider.capabilities = () => ({ supportsStreaming: false, supportsTools: false, supportsOAuth: false, supportsApiKeys: true, supportsImageInputs: vision });
    const prepare = vi.fn(async (request: ChatRequest) => prepareWireChat({ messages: request.messages.map(({ role, content }) => ({ role, content })) }, async () => response(), { identity: "text-fixture" }));
    f.provider.prepareChat = prepare;
    const request: ChatRequest = { ...f.request(), messages: [{ role: "user", content: "attachment captions", attachments: Array.from({ length: 6 }, (_, i) => ({ id: `image-${i}`, kind: "image", sizeBytes: 10 * 1024 * 1024, localPath: "not-read-by-text-adapter" })) }] };
    if (vision) {
      await expect(f.manager.admit(f.provider, request, auth)).rejects.toThrow(/resource bound/);
      expect(prepare).not.toHaveBeenCalled();
    } else {
      expect((await f.manager.admit(f.provider, request, auth)).accounting.bytes).toBeLessThan(1024);
      expect(prepare).toHaveBeenCalledOnce();
    }
  }, DATABASE_TEST_TIMEOUT_MS);

  it.each(["manager", "deadline", "caller"].flatMap(source => [2,3].map(call => ({ source, call }))))(
    "preserves the checkpoint when $source cancellation arrives during preparation call $call", async ({ source, call }) => {
      const f = fixture({ maxInputTokens: 4000 });
      const cancelled = new AbortController();
      if (source === "deadline") vi.spyOn(AbortSignal, "timeout").mockReturnValue(cancelled.signal);
      f.append("user", "x".repeat(4000)); f.append("assistant", "done"); f.append("user", "y".repeat(9000));
      let preparations = 0;
      f.provider.prepareChat = async request => {
        const prepared = prepareWireChat({ messages: request.messages }, async () => response(), { identity: "cancellation-fixture" });
        if (++preparations === call) {
          await Promise.resolve();
          if (source === "manager") f.manager.stop(); else cancelled.abort();
        }
        return prepared;
      };
      const request = { ...f.request(), ...(source === "caller" ? { signal: cancelled.signal } : {}) };
      await expect(f.manager.admit(f.provider, request, auth)).rejects.toThrow(/compaction/);
      expect(f.db.context.checkpoint(f.sessionId)).toBeNull();
      expect(f.db.getSessionMemory(f.sessionId)).toBeNull();
      expect(f.db.context.history(f.sessionId).messages).toHaveLength(3);
      if (source === "manager") expect(f.enqueue).not.toHaveBeenCalled();
    }, DATABASE_TEST_TIMEOUT_MS
  );

  it.each(["admission", "maintenance"])("fits aggregate summary sources for an admitted seven-tool turn during %s", async mode => {
    const f = fixture({ maxInputTokens: 80_000 });
    f.config.providers[0]!.contextWindowTokens = 200_000;
    f.append("user", "complete seven tools");
    for (let index = 0; index < 7; index++) {
      f.append("assistant", "", "call-repeat");
      f.append("tool", JSON.stringify({ text: "z".repeat(120_000), exitCode: index }), "call-repeat");
    }
    const original = f.db.context.history(f.sessionId).messages;
    expect((await f.manager.admit(f.provider, f.request(), auth)).accounting.inputTokens).toBeLessThan(80_000);
    expect(f.summarize).not.toHaveBeenCalled();
    const current = "CURRENT " + "x".repeat(120_000); f.append("user", current);
    if (mode === "admission") await f.manager.admit(f.provider, f.request(), auth);
    else await f.manager.maintain(f.provider, f.sessionId, "custom");
    expect(f.summarize).toHaveBeenCalledOnce();
    const [, request] = f.summarize.mock.calls[0] as unknown as [ProviderAdapter, ChatRequest];
    const records = JSON.parse(request.messages[1]!.content).records;
    expect(estimateContextTokens(records)).toBeLessThanOrEqual(f.config.context!.summarySourceTokens);
    const tools = records.filter((record: { role: string }) => record.role === "tool");
    expect(tools).toHaveLength(7);
    tools.forEach((record: { content: string }, index: number) => expect(JSON.parse(record.content)).toMatchObject({ exitCode: index, fullResult: { messageId: original[index * 2 + 2]!.id, toolCallId: "call-repeat" } }));
    expect(f.db.context.checkpoint(f.sessionId)).toMatchObject({ sourceDigest: contextSourceDigest(original), coveredThrough: Number(original.at(-1)!.id) });
    expect(f.db.context.history(f.sessionId).messages.slice(0,15)).toEqual(original);
    expect(f.manager.project(f.request()).messages.at(-1)!.content).toBe(current);
  }, DATABASE_TEST_TIMEOUT_MS);

  it.each(["content", "arguments"])("explicitly excerpts oversized historical %s without clipping the current turn", async field => {
    const f = fixture({ maxInputTokens: 80_000 }); f.config.providers[0]!.contextWindowTokens = 200_000;
    if (field === "content") { f.append("user", "z".repeat(120_000)); f.append("assistant", "done"); }
    else {
      f.append("user", "completed write");
      f.db.recordAssistantMessage(f.sessionId, "fixture", { role: "assistant", content: "", toolCallId: "call-repeat", toolName: "exec.run", metadata: { toolArgumentsJson: JSON.stringify({ text: "z".repeat(120_000) }) } });
      f.append("tool", "done", "call-repeat");
    }
    const original = f.db.context.history(f.sessionId).messages;
    await f.manager.admit(f.provider, f.request(), auth);
    const current = "CURRENT " + "x".repeat(210_000); f.append("user", current);
    await f.manager.admit(f.provider, f.request(), auth);
    const [, request] = f.summarize.mock.calls[0] as unknown as [ProviderAdapter, ChatRequest];
    const records = JSON.parse(request.messages[1]!.content).records;
    expect(records.some((record: Record<string,unknown>) => Number(record[`${field}OmittedCharacters`]) > 0)).toBe(true);
    expect(estimateContextTokens(records)).toBeLessThanOrEqual(f.config.context!.summarySourceTokens);
    expect(f.db.context.checkpoint(f.sessionId)?.sourceDigest).toBe(contextSourceDigest(original));
    expect(f.db.context.history(f.sessionId).messages.slice(0,original.length)).toEqual(original);
    expect(f.manager.project(f.request()).messages.at(-1)!.content).toBe(current);
  }, DATABASE_TEST_TIMEOUT_MS);

  it.each(["admission", "maintenance", "catch-up"])("recovers oversized historical images through bounded %s", async mode => {
    const f = fixture({ maxInputTokens: 4000, summaryMaxTokens: 512, ...(mode === "catch-up" ? { summarySourceTokens: 1024 } : {}) });
    f.provider.capabilities = () => ({ supportsStreaming: false, supportsTools: false, supportsOAuth: false, supportsApiKeys: true, supportsImageInputs: true });
    const size = (request: ChatRequest) => request.messages.reduce((total, message) => total + (message.attachments ?? []).reduce((n, image) => n + (image.sizeBytes ?? 0) * 4 / 3, 0), 0);
    const prepare = vi.fn(async (request: ChatRequest) => {
      expect(size(request)).toBeLessThanOrEqual(f.config.context!.maxRequestBytes * 2);
      const prepared = prepareWireChat({ messages: request.messages }, async () => response(), { identity: "vision-fixture" });
      const images = request.messages.flatMap(message => message.attachments ?? []).length;
      return { ...prepared, accounting: { ...prepared.accounting, inputTokens: prepared.accounting.inputTokens + images * 1000, bytes: prepared.accounting.bytes + size(request) } };
    });
    f.provider.prepareChat = prepare;
    const count = mode === "catch-up" ? 10 : 7;
    for (let index = 0; index < count; index++) {
      f.db.recordAssistantMessage(f.sessionId, "fixture", { role: "user", content: "caption " + (mode === "catch-up" ? "x".repeat(1000) : ""), attachments: [{ id: `old-image-${index}`, kind: "image", sizeBytes: 8 * 1024 * 1024, localPath: "fixture-not-read" }] });
      f.append("assistant", "done");
    }
    f.append("user", "CURRENT"); const original = f.db.context.history(f.sessionId).messages;
    const finish = vi.spyOn(f.db.context, "finish");
    if (mode === "admission") await f.manager.admit(f.provider, f.request(), auth);
    else if (mode === "maintenance") await f.manager.maintain(f.provider, f.sessionId, "custom");
    else {
      await expect(f.manager.admit(f.provider, f.request(), auth)).rejects.toThrow(/resource bound/);
      expect(f.db.context.checkpoint(f.sessionId)?.revision).toBe(2);
      expect(prepare).not.toHaveBeenCalled();
      expect(f.enqueue).toHaveBeenCalledOnce();
      for (let attempt = 0; attempt < 3; attempt++) {
        try { await f.manager.maintain(f.provider, f.sessionId, "custom"); break; }
        catch (error) { expect(String(error)).toMatch(/bounded batch limit/); }
      }
    }
    const admitted = await f.manager.admit(f.provider, f.request(), auth);
    expect(admitted.accounting.bytes).toBeLessThanOrEqual(f.config.context!.maxRequestBytes);
    expect(f.summarize).toHaveBeenCalled();
    const checkpoint = f.db.context.checkpoint(f.sessionId)!;
    expect(checkpoint.revision).toBeGreaterThan(0);
    expect(finish).toHaveBeenCalled();
    const job = finish.mock.calls.at(-1)![0];
    expect(checkpoint.sourceDigest).toBe(contextSourceDigest(original.filter(message => Number(message.id) > job.afterMessageId && Number(message.id) <= job.throughMessageId)));
    expect(f.db.context.history(f.sessionId).messages).toEqual(original);
    expect(f.manager.project(f.request()).messages.at(-1)!.content).toBe("CURRENT");
  }, DATABASE_TEST_TIMEOUT_MS);

  it.each([
    { type: "openai", defaultModel: "gpt-4o-2024-05-13", expected: 4096 },
    { type: "azure-foundry", defaultModel: "deployment", underlyingModel: "gpt-4o", expected: 8192 },
    { type: "azure-foundry", defaultModel: "deployment", underlyingModel: "gpt-4o-2024-05-13", expected: 8192 },
    { type: "azure-foundry", defaultModel: "gpt-4o-2024-05-13", expected: 8192 },
    { type: "openai-compatible", defaultModel: "gpt-4o-2024-05-13", expected: 8192 },
    { type: "anthropic", defaultModel: "claude-opus-4-5", thinkingBudgetTokens: 12_000, expected: 13_024 },
    { type: "anthropic", defaultModel: "claude-opus-4-5", thinkingBudgetTokens: 2048, maxOutputTokens: 4096, expected: 4096 }
  ])("bounds summary output for $type/$defaultModel (expected=$expected)", async ({ expected, ...provider }) => {
    const f = fixture({ maxInputTokens: 4000 });
    f.config.providers = [{ id: "test", ...(provider.type === "azure-foundry" ? { authMode: "api-key", resourceName: "fixture", endpointFlavor: "openai-resource" } : {}), ...provider } as ProviderConfig];
    f.append("user", "x".repeat(4000)); f.append("assistant", "done"); f.append("user", "y".repeat(9000));
    await f.manager.admit(f.provider, { ...f.request(), model: provider.defaultModel }, auth);
    expect(f.summarize).toHaveBeenCalledOnce();
    const [, request] = f.summarize.mock.calls[0] as unknown as [ProviderAdapter, ChatRequest];
    expect(request.maxTokens).toBe(expected);
    const saved = f.config.providers[0]!;
    if (saved.type === "anthropic") expect(saved.thinkingBudgetTokens).toBe(provider.thinkingBudgetTokens);
  }, DATABASE_TEST_TIMEOUT_MS);

  it("never maps or trims an oversized current image turn to make a growing checkpoint fit", async () => {
    const f = fixture({ maxInputTokens: 4000 });
    f.provider.capabilities = () => ({ supportsStreaming: false, supportsTools: false, supportsOAuth: false, supportsApiKeys: true, supportsImageInputs: true });
    const prepare = vi.fn(async () => { throw new Error("unsafe mapping"); }); f.provider.prepareChat = prepare;
    f.append("user", "past"); f.append("assistant", "done");
    f.db.recordAssistantMessage(f.sessionId, "fixture", { role: "user", content: "CURRENT", attachments: Array.from({ length: 7 }, (_, index) => ({ id: `current-${index}`, kind: "image", sizeBytes: 8 * 1024 * 1024 })) });
    const original = f.db.context.history(f.sessionId).messages;
    await expect(f.manager.admit(f.provider, f.request(), auth)).rejects.toThrow(/compaction/);
    expect(prepare).not.toHaveBeenCalled(); expect(f.summarize).toHaveBeenCalledOnce();
    expect(f.db.context.checkpoint(f.sessionId)).toBeNull();
    expect(f.db.context.history(f.sessionId).messages).toEqual(original);
  }, DATABASE_TEST_TIMEOUT_MS);

  it("rejects irreducible summary framing with repair guidance and unchanged coverage", async () => {
    const f = fixture({ maxInputTokens: 2000 });
    f.append("user", "x".repeat(4000)); f.append("assistant", "done"); f.append("user", "y".repeat(3000));
    await expect(f.manager.admit(f.provider, f.request(), auth)).rejects.toThrow(/source references exceed.*Increase summarySourceTokens/);
    expect(f.manager.status(f.sessionId)).toMatchObject({ state: "blocked", failure: expect.stringContaining("summarySourceTokens") });
    expect(f.summarize).not.toHaveBeenCalled(); expect(f.enqueue).not.toHaveBeenCalled();
    expect(f.db.context.checkpoint(f.sessionId)).toBeNull();
    expect(f.db.context.history(f.sessionId).messages).toHaveLength(3);
  }, DATABASE_TEST_TIMEOUT_MS);

  it("rejects an impossible thinking/output combination without resetting tuning", async () => {
    const f = fixture({ maxInputTokens: 4000 });
    f.config.providers = [{ id: "test", type: "anthropic", defaultModel: "claude-haiku-4-5", thinkingMode: "enabled", thinkingBudgetTokens: 64_000 }];
    f.append("user", "x".repeat(4000)); f.append("assistant", "done"); f.append("user", "y".repeat(9000));
    await expect(f.manager.admit(f.provider, { ...f.request(), model: "claude-haiku-4-5" }, auth)).rejects.toThrow(/output limit.*thinking budget/);
    expect(f.summarize).not.toHaveBeenCalled(); expect(f.db.context.checkpoint(f.sessionId)).toBeNull();
    expect(f.config.providers[0]!.thinkingBudgetTokens).toBe(64_000);
  }, DATABASE_TEST_TIMEOUT_MS);

  it("validates summary text against the effective catalog output allowance", async () => {
    const oversized = JSON.stringify({ ...JSON.parse(summary), goals: "x".repeat(14_000) });
    const f = fixture({ maxInputTokens: 12_000 }, vi.fn(async () => response(oversized)));
    f.config.providers = [{ id: "test", type: "openai", defaultModel: "gpt-4o-2024-05-13" }];
    const prepare = vi.fn(async (request: ChatRequest) => prepareWireChat({ messages: request.messages }, async () => response(), { identity: "output-fixture" }));
    f.provider.prepareChat = prepare;
    f.append("user", "x".repeat(20_000)); f.append("assistant", "done"); f.append("user", "y".repeat(20_000));
    await expect(f.manager.admit(f.provider, { ...f.request(), model: "gpt-4o-2024-05-13" }, auth)).rejects.toThrow(/compaction/);
    expect(prepare).toHaveBeenCalledOnce(); expect(f.summarize).toHaveBeenCalledOnce();
    expect(f.db.context.checkpoint(f.sessionId)).toBeNull();
  }, DATABASE_TEST_TIMEOUT_MS);
});
