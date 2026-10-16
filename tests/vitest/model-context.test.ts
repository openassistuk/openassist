import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ChatRequest, ChatResponse, ProviderAdapter, ProviderConfig, RuntimeConfig } from "@openassist/core-types";
import { createDefaultConfigObject } from "../../apps/openassist-cli/src/lib/config-edit.js";
import { editContextBudgets, loadSetupWizardState, type PromptAdapter } from "../../apps/openassist-cli/src/lib/setup-wizard.js";
import { parseConfig, toRuntimeConfig } from "../../packages/config/src/schema.js";
import { DEFAULT_CONTEXT_CONFIG, resolveContextLimits } from "../../packages/config/src/context-limits.js";
import { conversationSegments, ContextPlanner } from "../../packages/core-runtime/src/context.js";
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
  const provider = { id: () => "test", chat: vi.fn(async () => response()) } as unknown as ProviderAdapter;
  const enqueue = vi.fn();
  const manager = new ModelContextManager(db, () => config, summarize, enqueue);
  const sessionId = "telegram:fixture";
  const append = (role: "user"|"assistant"|"tool", content: string, toolCallId?: string) => db.recordAssistantMessage(sessionId, "fixture", { role, content, toolCallId, toolName: toolCallId ? "exec.run" : undefined });
  const request = (): ChatRequest => ({ sessionId, model: "custom", messages: [{ role: "system", content: "mandatory identity" }, ...db.context.history(sessionId).messages], tools: [], metadata: {} });
  return { root, db, config, provider, enqueue, manager, summarize, append, request, sessionId };
}

describe("model context contracts", () => {
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

  it("edits context settings with strict re-prompting and optional provider limits", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(),"openassist-context-wizard-")); roots.push(root);
    const state = loadSetupWizardState(path.join(root,"config.toml"),path.join(root,"env"));
    const answers = ["bad", "32000", "", "85", "90", "60", "33554432", "1024", "32768", "200000"];
    const prompts = { input: vi.fn(async () => answers.shift()!), select: vi.fn(async () => state.config.runtime.providers[0]!.id) } as unknown as PromptAdapter;
    vi.spyOn(console,"error").mockImplementation(() => {});
    await editContextBudgets(state,prompts);
    expect(state.config.runtime.context).toMatchObject({ maxInputTokens: 32000, targetRatio: .6, summaryMaxTokens: 1024 });
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
});
