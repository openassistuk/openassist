import { afterEach, describe, expect, it, vi } from "vitest";
import { parseConfig } from "../../packages/config/src/schema.js";
import { anthropicThinking, modelCapabilities, providerTuningErrors, providerTuningLabel, reasoningEfforts } from "../../packages/config/src/provider-models.js";
import { mapResponsesApiResponse, mapResponsesInput, reasoningPayload, temperatureForModel } from "../../packages/providers-openai-shared/src/index.js";
import { OpenAIProviderAdapter } from "../../packages/providers-openai/src/index.js";
import { AnthropicProviderAdapter } from "../../packages/providers-anthropic/src/index.js";
import { CodexProviderAdapter } from "../../packages/providers-codex/src/index.js";
import { AzureFoundryProviderAdapter } from "../../packages/providers-azure-foundry/src/index.js";
import { createDefaultConfigObject } from "../../apps/openassist-cli/src/lib/config-edit.js";
import { preserveReasoningMode } from "../../apps/openassist-cli/src/lib/setup-quickstart.js";
import { promptAnthropicWorkspaceId, promptAnthropicOutputLimit, promptAnthropicThinking, promptReasoningMode, type PromptAdapter } from "../../apps/openassist-cli/src/lib/setup-wizard.js";
import type { ChatRequest } from "../../packages/core-types/src/provider.js";

const request: ChatRequest = { sessionId: "telegram:test", model: "gpt-6-sol", messages: [{ role: "system", content: "runtime guidance" }, { role: "user", content: "hello" }], tools: [{ name: "fs.read", description: "read", inputSchema: { type: "object", properties: {} } }], metadata: {}, temperature: 0.5 };
const auth = { providerId: "test", apiKey: "dummy-test-key" };
const json = (body: object) => new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });
const anthropicStream = (content: object[]) => new Response([
  { type: "message_start", message: { id: "reply", type: "message", role: "assistant", model: "claude-opus-5-5", content: [], stop_reason: null, usage: { input_tokens: 1, output_tokens: 0 } } },
  ...content.flatMap((block, index) => [{ type: "content_block_start", index, content_block: block }, { type: "content_block_stop", index }]),
  { type: "message_delta", delta: { stop_reason: "end_turn", stop_sequence: null }, usage: { output_tokens: 1 } },
  { type: "message_stop" }
].map(event => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join(""), { headers: { "content-type": "text/event-stream" } });
const openaiReply = { id: "r", output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text: "hello" }] }], usage: { input_tokens: 1, output_tokens: 1 } };
afterEach(() => vi.restoreAllMocks());

describe("current GPT-6 routes", () => {
  it.each(["openai", "codex", "azure-foundry"])("persists opaque reasoning across a tool turn for %s with default effort", async route => {
    const output = [
      { type: "reasoning", id: "rs_1", summary: [], encrypted_content: "opaque-ciphertext" },
      { type: "message", id: "msg_1", role: "assistant", phase: "commentary", content: [{ type: "output_text", text: "Reading a file", annotations: [] }] },
      { type: "function_call", id: "fc_1", call_id: "tool-1", name: "read", arguments: "{}" }
    ];
    const response = { ...openaiReply, output };
    const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(async () => route === "codex"
      ? new Response(`event: response.completed\ndata: ${JSON.stringify({ type: "response.completed", response })}\n\n`)
      : json(response));
    const makeAdapter = () => route === "codex" ? new CodexProviderAdapter({ id: "test", defaultModel: "gpt-6-sol" })
      : route === "openai" ? new OpenAIProviderAdapter({ id: "test", defaultModel: "gpt-6-sol" })
      : new AzureFoundryProviderAdapter({ id: "test", defaultModel: "deployment", underlyingModel: "gpt-6-sol", resourceName: "test", endpointFlavor: "foundry-resource", authMode: "api-key" });
    const req = { ...request, model: route === "azure-foundry" ? "deployment" : "gpt-6-sol" };
    const first = await makeAdapter().chat(req, auth);
    expect(first.output.content).not.toContain("opaque-ciphertext");
    const persisted = JSON.parse(JSON.stringify(first.output));
    // Runtime persists replay metadata on the first tool-call audit message.
    await makeAdapter().chat({ ...req, messages: [
      { ...persisted, toolCallId: "tool-1", toolName: "read", metadata: { ...persisted.metadata, toolArgumentsJson: "{}" } },
      { role: "assistant", content: "", toolCallId: "tool-1", toolName: "read" },
      { role: "tool", content: "file text", toolCallId: "tool-1" }
    ] }, auth);
    const body = JSON.parse(fetch.mock.calls[1][1]?.body as string);
    expect(body.include).toEqual(["reasoning.encrypted_content"]);
    expect(body.input).toEqual([...output, { type: "function_call_output", call_id: "tool-1", output: "file text" }]);
    expect(body.reasoning).toBeUndefined();
  });

  it("bounds and scopes reasoning replay while retaining normal tool history on fallback", async () => {
    const item = { type: "reasoning", summary: [], encrypted_content: "opaque" };
    const output = mapResponsesApiResponse({ output: [item] }, "openai:a:gpt-6-sol").output;
    expect(await mapResponsesInput([output], "openai:b:gpt-6-sol")).toEqual([{ type: "message", role: "assistant", content: "" }]);
    for (const raw of ["invalid", "[]", JSON.stringify([{ type: "unknown" }]), JSON.stringify(Array(257).fill(item)), JSON.stringify([{ ...item, encrypted_content: "x".repeat(1_048_576) }])]) {
      const message = { ...output, toolCallId: "tool-1", toolName: "read", metadata: { ...output.metadata, providerReplayJson: raw } };
      expect(await mapResponsesInput([message], "openai:a:gpt-6-sol")).toEqual([{ type: "function_call", call_id: "tool-1", name: "read", arguments: "{}" }]);
    }
    expect(mapResponsesApiResponse({ output: [{ ...item, encrypted_content: "x".repeat(1_048_576) }] }, "scope").output.metadata).toBeUndefined();
    expect(await mapResponsesInput([{ role: "user", content: "hello", metadata: output.metadata }], "openai:a:gpt-6-sol")).toEqual([{ type: "message", role: "user", content: "hello" }]);
  });
  it("preserves saved pro mode and requires an explicit reset or compatible model", async () => {
    const confirm = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    const input = vi.fn().mockResolvedValue("gpt-6-luna");
    const prompts = { confirm, input } as unknown as PromptAdapter;
    expect(await preserveReasoningMode(prompts, "openai", "gpt-6-sol", "pro")).toEqual({ model: "gpt-6-sol", reasoningMode: "pro" });
    expect(await preserveReasoningMode(prompts, "openai", "custom-model", "pro")).toEqual({ model: "gpt-6-luna", reasoningMode: "pro" });
    expect(await preserveReasoningMode(prompts, "azure-foundry", "", "pro")).toEqual({ model: "" });
    expect(confirm.mock.calls.every(call => call[1] === false)).toBe(true);
  });
  it.each(["gpt-6.1-sol", "gpt-6-sol", "gpt-6-luna", "gpt-6-astra"])("maps %s through Responses with model-specific sampling and independent pro mode", async model => {
    const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(async () => json(openaiReply));
    const efforts = reasoningEfforts(model);
    for (const effort of efforts) {
      const adapter = new OpenAIProviderAdapter({ id: "test", defaultModel: model, reasoningEffort: effort, reasoningMode: "pro" });
      await adapter.chat({ ...request, model }, auth);
      const [url, options] = fetch.mock.calls.at(-1)!;
      const body = JSON.parse(options?.body as string);
      expect(String(url)).toContain("/responses");
      expect(body.reasoning).toEqual({ effort, mode: "pro" });
      expect(body.temperature).toBe(effort === "none" ? 0.5 : undefined);
      expect(body.tools[0].type).toBe("function");
    }
    expect(efforts.includes("none")).toBe(!["gpt-6-astra", "gpt-6.1-sol"].includes(model));
    expect(reasoningEfforts(model, "codex")).toEqual(["low", "medium", "high", "xhigh", "max"]);
    expect(modelCapabilities(model, "codex")?.reasoningModes).toBeUndefined();
  });

  it("omits default controls, accepts mode without effort, and rejects unsupported modes", () => {
    expect(reasoningPayload("gpt-6-sol", undefined)).toBeUndefined();
    expect(reasoningPayload("gpt-6-sol", undefined, "openai", "standard")).toEqual({ mode: "standard" });
    expect(temperatureForModel("gpt-6-sol", undefined, 0.4)).toBeUndefined();
    expect(temperatureForModel("custom-model", undefined, 0.4)).toBe(0.4);
    expect(() => reasoningPayload("custom-model", "high", "openai", "pro")).toThrow("verified model");
    expect(() => reasoningPayload("gpt-6-sol", "high", "codex", "pro")).toThrow("reasoning mode");
    for (const provider of [
      { id: "test", type: "openai", defaultModel: "gpt-4o", reasoningMode: "pro" },
      { id: "test", type: "codex", defaultModel: "gpt-6-sol", reasoningMode: "pro" },
      { id: "test", type: "openai", defaultModel: "gpt-6-astra", reasoningEffort: "none" }
    ]) {
      const config = createDefaultConfigObject();
      expect(() => parseConfig({ ...config, runtime: { ...config.runtime, providers: [provider] } })).toThrow();
    }
    expect(providerTuningLabel({ id: "test", type: "openai", defaultModel: "gpt-6-sol", reasoningMode: "pro" })).toContain("mode: pro");
    expect(reasoningPayload("gpt-6-astra", "none", "azure-foundry")).toEqual({ effort: "none" });
    expect(reasoningPayload("gpt-6-astra", "none", "openai")).toBeUndefined();
    expect(temperatureForModel("gpt-6-astra", "none", 0.4, "azure-foundry")).toBe(0.4);
  });

  it("keeps GPT-6.1 Sol default omission and Azure none separate from OpenAI/Codex restrictions", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(json(openaiReply));
    const adapter = new OpenAIProviderAdapter({ id: "test", defaultModel: "gpt-6.1-sol" });
    await adapter.chat({ ...request, model: "gpt-6.1-sol" }, auth);
    const body = JSON.parse(fetch.mock.calls[0][1]?.body as string);
    expect(String(fetch.mock.calls[0][0])).toContain("/responses");
    expect(body).not.toHaveProperty("reasoning");
    expect(body).not.toHaveProperty("temperature");
    for (const type of ["openai", "codex"] as const) {
      const provider = { id: "test", type, defaultModel: "gpt-6.1-sol", reasoningEffort: "none" as const };
      expect(providerTuningErrors(provider)).not.toEqual([]);
      expect(reasoningPayload(provider.defaultModel, "none", type)).toBeUndefined();
    }
    expect(reasoningPayload("gpt-6.1-sol", "none", "azure-foundry")).toEqual({ effort: "none" });
    expect(temperatureForModel("gpt-6.1-sol", "none", 0.4, "azure-foundry")).toBe(0.4);
    expect(temperatureForModel("gpt-6.1-sol", "none", 0.4, "openai")).toBeUndefined();
  });

  it.each(["gpt-6.1-sol", "gpt-6-sol", "gpt-6-luna", "gpt-6-astra"])("preserves Codex streaming and tool contracts for %s", async model => {
    const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response(`event: response.completed\ndata: ${JSON.stringify({ type: "response.completed", response: openaiReply })}\n\n`));
    const adapter = new CodexProviderAdapter({ id: "test", defaultModel: model, reasoningEffort: "max" });
    expect((await adapter.chat({ ...request, model }, auth)).output.content).toBe("hello");
    const options = fetch.mock.calls[0][1]!;
    const body = JSON.parse(options.body as string);
    expect(body).toMatchObject({ model, reasoning: { effort: "max" }, stream: true, store: false, parallel_tool_calls: true, tool_choice: "auto" });
    expect(new Headers(options.headers).get("session_id")).toBe(request.sessionId);
    expect(body.instructions).toContain("runtime guidance");
    expect(body).not.toHaveProperty("temperature");
  });

  it("offers pro with cost guidance only on verified API routes", async () => {
    const select = vi.fn().mockResolvedValueOnce("pro").mockResolvedValueOnce("default");
    const prompts = { select } as unknown as PromptAdapter;
    expect(await promptReasoningMode(prompts, "openai", "gpt-6-sol")).toBe("pro");
    expect(select.mock.calls[0][1].find((choice: { value: string }) => choice.value === "pro").name).toContain("cost");
    expect(await promptReasoningMode(prompts, "azure-foundry", "gpt-6-luna", "standard")).toBeUndefined();
    expect(select.mock.calls[1][2]).toBe("standard");
    expect(await promptReasoningMode(prompts, "azure-foundry", "deployment-name")).toBeUndefined();
    expect(select).toHaveBeenCalledTimes(2);
  });
});

describe("current Claude thinking", () => {
  it("validates workspace IDs and supports explicit clearing in setup", async () => {
    const input = vi.fn().mockResolvedValueOnce("invalid workspace").mockResolvedValueOnce(" wrkspc_test123 ").mockResolvedValueOnce("");
    const prompts = { input } as unknown as PromptAdapter;
    expect(await promptAnthropicWorkspaceId(prompts)).toBe("wrkspc_test123");
    expect(await promptAnthropicWorkspaceId(prompts, "wrkspc_test123")).toBeUndefined();
    const config = createDefaultConfigObject();
    const withProvider = (workspaceId: string) => ({ ...config, runtime: { ...config.runtime, providers: [{ id: "test", type: "anthropic", defaultModel: "claude-sonnet-5", workspaceId }] } });
    expect(parseConfig(withProvider("wrkspc_test123")).runtime.providers[0]).toMatchObject({ workspaceId: "wrkspc_test123" });
    expect(() => parseConfig(withProvider("bad\r\nheader"))).toThrow();
  });
  it.each(["claude-opus-5-5", "claude-sonnet-5-5", "claude-fable-5-1", "claude-mythos-5-1"])("validates all efforts and supported adaptive thinking for %s", async model => {
    const provider = { id: "test", type: "anthropic" as const, defaultModel: model };
    for (const thinkingEffort of ["low", "medium", "high", "xhigh", "max"] as const) {
      expect(anthropicThinking({ ...provider, thinkingEffort })).toEqual({ output_config: { effort: thinkingEffort } });
    }
    for (const settings of [{ thinkingMode: "disabled" as const }, { thinkingBudgetTokens: 2048 }, { thinkingMode: "enabled" as const, thinkingBudgetTokens: 2048 }]) {
      expect(providerTuningErrors({ ...provider, ...settings })).not.toEqual([]);
    }
    expect(providerTuningLabel(provider)).toContain(model === "claude-opus-5-5" ? "medium (provider default)" : "high (provider default)");
    const select = vi.fn().mockResolvedValueOnce("adaptive").mockResolvedValueOnce("max");
    expect(await promptAnthropicThinking({ select } as unknown as PromptAdapter, model)).toEqual({ thinkingMode: "adaptive", thinkingEffort: "max" });
    expect(select.mock.calls[0][1].map((choice: { value: string }) => choice.value)).toEqual(["default", "adaptive"]);
  });

  it.each(["claude-opus-5-5", "claude-sonnet-5-5", "claude-fable-5-1", "claude-mythos-5-1"])("replays empty signed thinking and tool results after adapter restart and context changes for %s", async model => {
    const blocks = [{ type: "thinking", thinking: "", signature: "opaque-signature" }, { type: "tool_use", id: "tool-1", name: "fs.read", input: {} }];
    const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(async () => anthropicStream(blocks));
    const config = { id: "test", defaultModel: model, thinkingEffort: "max" as const };
    const first = await new AnthropicProviderAdapter(config).chat({ ...request, model }, auth);
    expect(first.output.content).toBe("");
    const persisted = JSON.parse(JSON.stringify(first.output));
    await new AnthropicProviderAdapter(config).chat({ ...request, model, messages: [
      { role: "system", content: "updated bounded guidance after compaction" },
      { role: "user", content: "summary of earlier turns" }, persisted,
      { role: "assistant", content: "", toolCallId: "tool-1", toolName: "fs.read", metadata: { toolArgumentsJson: "{}" } },
      { role: "tool", content: "file content", toolCallId: "tool-1" }
    ] }, auth);
    const options = fetch.mock.calls[1][1]!;
    const body = JSON.parse(options.body as string);
    expect(new Headers(options.headers).get("anthropic-beta")).toContain("thinking-binding-controls-2026-08-01");
    expect(body.thinking).toEqual({ type: "adaptive", block_binding: { prefix_mismatch_behavior: "drop_block" } });
    expect(body.messages.filter((m: { role: string }) => m.role === "assistant")).toEqual([{ role: "assistant", content: blocks }]);
    expect(body.messages.at(-1).content[0]).toMatchObject({ type: "tool_result", tool_use_id: "tool-1", content: "file content" });
    expect(body).not.toHaveProperty("temperature");
    expect(body).not.toHaveProperty("tool_choice");
    expect(body.max_tokens).toBe(16384);
    expect(body.stream).toBe(true);
    expect(body.output_config).toEqual({ effort: "max" });
  });

  it("rejects incompatible thinking before transport and maps explicit output limits", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(async () => anthropicStream([{ type: "text", text: "hello" }]));
    const model = "claude-opus-5-5";
    await expect(new AnthropicProviderAdapter({ id: "test", defaultModel: model, thinkingMode: "disabled" }).chat({ ...request, model }, auth)).rejects.toThrow("verified support");
    expect(fetch).not.toHaveBeenCalled();
    await new AnthropicProviderAdapter({ id: "test", defaultModel: model, maxOutputTokens: 32000 }).chat({ ...request, model }, auth);
    expect(JSON.parse(fetch.mock.calls[0][1]?.body as string).max_tokens).toBe(32000);
    const input = vi.fn().mockResolvedValueOnce("0").mockResolvedValueOnce("128001").mockResolvedValueOnce("1.5").mockResolvedValueOnce("32000").mockResolvedValueOnce("");
    const prompts = { input } as unknown as PromptAdapter;
    expect(await promptAnthropicOutputLimit(prompts, model, 16000)).toBe(32000);
    expect(await promptAnthropicOutputLimit(prompts, model)).toBeUndefined();
    expect(await promptAnthropicOutputLimit(prompts, "claude-sonnet-4-6")).toBeUndefined();
    expect(providerTuningErrors({ id: "a", type: "anthropic", defaultModel: "claude-sonnet-4-6", thinkingBudgetTokens: 4096, maxOutputTokens: 4096 })).toContain("maxOutputTokens must be greater than thinkingBudgetTokens.");
    expect(providerTuningErrors({ id: "a", type: "anthropic", defaultModel: "claude-haiku-4-5", maxOutputTokens: 128000 })).toContain("Model 'claude-haiku-4-5' supports at most 64000 output tokens.");
  });
});
