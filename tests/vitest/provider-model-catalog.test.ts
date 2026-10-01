import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { parseConfig } from "../../packages/config/src/schema.js";
import { DEFAULT_ANTHROPIC_MODEL, PROVIDER_MODELS, anthropicThinking, modelCapabilities, modelLifecycle, providerTuningErrors, reasoningEfforts, recommendedReasoningEffort, retiredModelReplacement } from "../../packages/config/src/provider-models.js";
import { reasoningPayload, shouldPreferResponsesApi } from "../../packages/providers-openai-shared/src/index.js";
import { AnthropicProviderAdapter } from "../../packages/providers-anthropic/src/index.js";
import { CodexProviderAdapter } from "../../packages/providers-codex/src/index.js";
import { createDefaultConfigObject } from "../../apps/openassist-cli/src/lib/config-edit.js";
import { providerTuningLabel } from "../../apps/openassist-cli/src/lib/provider-display.js";
import { promptAnthropicThinking, promptReasoningEffort, type PromptAdapter } from "../../apps/openassist-cli/src/lib/setup-wizard.js";
import { validateSetupReadiness } from "../../apps/openassist-cli/src/lib/setup-validation.js";
import type { AnthropicProviderRuntimeConfig, ChatRequest } from "../../packages/core-types/src/provider.js";

const anthropic: AnthropicProviderRuntimeConfig = { id: "a", type: "anthropic", defaultModel: "claude-sonnet-5" };
const request: ChatRequest = { sessionId: "telegram:test", model: "claude-sonnet-5", messages: [{ role: "user", content: "Hello" }], tools: [], metadata: {}, temperature: 0.4 };

afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

describe("shared model capabilities", () => {
  it("covers current conversational families and exact pins without guessing routes or optional controls", () => {
    const currentOpenAI = ["gpt-6-astra", "gpt-6.1-sol", "gpt-6-sol", "gpt-6-luna", "gpt-5.6", "gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.6-luna", "gpt-5.5", "gpt-5.5-pro", "gpt-5.4", "gpt-5.4-pro", "gpt-5.4-mini", "gpt-5.4-nano", "gpt-5.3-codex", "gpt-5.2", "gpt-5.2-pro", "gpt-5.1", "gpt-5", "gpt-5-mini", "gpt-5-nano", "gpt-5-pro", "o3", "o3-pro", "gpt-4.1", "gpt-4.1-mini", "gpt-4o", "gpt-4o-mini", "chat-latest"];
    const currentClaude = ["claude-fable-5-1", "claude-mythos-5-1", "claude-fable-5", "claude-mythos-5", "claude-opus-5-5", "claude-opus-5", "claude-opus-4-8", "claude-opus-4-7", "claude-opus-4-6", "claude-opus-4-5-20251101", "claude-sonnet-5-5", "claude-sonnet-5", "claude-sonnet-4-6", "claude-haiku-4-5-20251001"];
    for (const id of currentOpenAI) expect(modelCapabilities(id, "openai"), id).toBeDefined();
    for (const id of currentClaude) expect(modelCapabilities(id, "anthropic"), id).toBeDefined();
    expect(reasoningEfforts("gpt-5.6")).toEqual(reasoningEfforts("gpt-5.6-sol"));
    expect(modelCapabilities("gpt-5.5-2026-04-23")?.reasoningEfforts).toEqual(reasoningEfforts("gpt-5.5"));
    expect(modelCapabilities("gpt-5.5-2026-04-23", "codex")).toBeUndefined();
    expect(modelCapabilities("gpt-5.5-pro", "azure-foundry")).toBeUndefined();
    expect(reasoningEfforts("gpt-5.3-codex", "azure-foundry")).toContain("xhigh");
    expect(reasoningEfforts("gpt-5.1-codex-mini", "azure-foundry")).toContain("none");
    expect(modelCapabilities("gpt-5.5-2099-01-01")).toBeUndefined();
    expect(modelCapabilities("gpt-6.1-luna")).toBeUndefined();
    for (const id of ["gpt-5.6-cyber", "gpt-daybreak-red-latest", "gpt-daybreak-blue-latest"]) {
      expect(modelCapabilities(id)?.responses).toBe(true);
      expect(reasoningEfforts(id)).toEqual([]);
      expect(modelCapabilities(id, "codex")).toBeUndefined();
    }
    const routes = PROVIDER_MODELS.flatMap(entry => entry.routes.map(route => `${route}:${entry.id}`));
    expect(new Set(routes).size).toBe(routes.length);
  });

  it("tracks retirement boundaries and aliases separately for each route", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-01T12:00:00Z"));
    const before = new Date("2026-10-13T23:59:59Z");
    const after = new Date("2026-10-14T00:00:00Z");
    expect(modelLifecycle("gpt-5.5", "codex", before)?.status).toBe("deprecated");
    expect(modelLifecycle("gpt-5.5", "codex", after)?.status).toBe("retired");
    expect(modelLifecycle("gpt-5.5", "openai", after)).toBeUndefined();
    expect(modelLifecycle("gpt-5-codex", "openai", before)?.status).toBe("retired");
    expect(modelLifecycle("gpt-5-codex", "azure-foundry", before)).toBeUndefined();
    expect(modelLifecycle("o1-2024-12-17", "openai", before)?.status).toBe("deprecated");
    expect(modelLifecycle("o1", "openai", new Date("2026-10-23T00:00:00Z"))?.status).toBe("retired");
    expect(modelLifecycle("gpt-4o-2024-05-13", "openai", before)?.status).toBe("deprecated");
    expect(modelLifecycle("gpt-4o", "openai", after)).toBeUndefined();
    expect(modelLifecycle("gpt-4o-2024-11-20", "openai", after)).toBeUndefined();
    expect(modelLifecycle("claude-sonnet-4-5", "anthropic", before)).toEqual(modelLifecycle("claude-sonnet-4-5-20250929", "anthropic", before));
    expect(modelLifecycle("claude-sonnet-4-5", "anthropic", new Date("2026-11-30T00:00:00Z"))?.status).toBe("retired");
    expect(modelLifecycle("claude-mythos-preview", "anthropic", after)).toMatchObject({ status: "deprecated", retirementDate: undefined });
    expect(retiredModelReplacement("codex", "gpt-5.3-codex-spark")).toBe("gpt-6-luna");
    expect(retiredModelReplacement("anthropic", "claude-3-7-sonnet-latest")).toBe("claude-sonnet-4-6");
    expect(providerTuningLabel({ ...anthropic, defaultModel: "claude-sonnet-4-5" })).toContain("retires 2026-11-30");
    expect(providerTuningLabel({ ...anthropic, defaultModel: "claude-sonnet-4-20250514" })).toContain("Unavailable model: retired");
    expect(modelLifecycle("__proto__", "openai", after)).toBeUndefined();
  });

  it("preserves manual Claude budgets and model-specific effort limits across all compatible generations", () => {
    expect(anthropicThinking({ ...anthropic, defaultModel: "claude-opus-4-5", thinkingBudgetTokens: 4096, thinkingEffort: "medium" })).toEqual({ thinking: { type: "enabled", budget_tokens: 4096 }, output_config: { effort: "medium" } });
    for (const model of ["claude-opus-4-5", "claude-opus-4-5-20251101"]) {
      expect(providerTuningErrors({ ...anthropic, defaultModel: model, thinkingEffort: "max" })).not.toEqual([]);
      expect(providerTuningErrors({ ...anthropic, defaultModel: model, maxOutputTokens: 64001 })).not.toEqual([]);
    }
    for (const model of ["claude-opus-4-7", "claude-opus-4-8"]) {
      expect(anthropicThinking({ ...anthropic, defaultModel: model, thinkingMode: "disabled", thinkingEffort: "xhigh" })).toEqual({ thinking: { type: "disabled" }, output_config: { effort: "xhigh" } });
      expect(providerTuningErrors({ ...anthropic, defaultModel: model, thinkingBudgetTokens: 4096 })).not.toEqual([]);
    }
    expect(anthropicThinking({ ...anthropic, defaultModel: "claude-mythos-preview", thinkingBudgetTokens: 4096, thinkingEffort: "max" })).toMatchObject({ thinking: { type: "enabled", budget_tokens: 4096 } });
    expect(providerTuningErrors({ ...anthropic, defaultModel: "claude-mythos-preview", thinkingMode: "disabled" })).not.toEqual([]);
    expect(providerTuningErrors({ ...anthropic, defaultModel: "claude-opus-4-6", maxOutputTokens: 128001 })).not.toEqual([]);
  });

  it.each([
    ["openai", "gpt-5-codex", "gpt-5.6-sol"], ["anthropic", "claude-3-7-sonnet-latest", "claude-sonnet-4-6"], ["anthropic", "claude-sonnet-4-5", "claude-sonnet-5-5"]
  ] as const)("reports %s lifecycle readiness for %s without rewriting saved settings", async (type, defaultModel, replacement) => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-01T12:00:00Z"));
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "openassist-model-readiness-"));
    try {
      const config = createDefaultConfigObject();
      config.runtime.providers = [{ id: "openai-main", type, defaultModel }];
      const before = JSON.stringify(config);
      expect(parseConfig(config).runtime.providers[0].defaultModel).toBe(defaultModel);
      const result = await validateSetupReadiness({ config, env: {}, configPath: path.join(root, "config.toml"), envFilePath: path.join(root, "env"), installDir: root, skipService: true, skipBindAvailabilityCheck: true, timezoneConfirmed: true });
      const lifecycle = modelLifecycle(defaultModel, type)!;
      const issues = lifecycle.status === "retired" ? result.errors : result.warnings;
      expect(issues.find(issue => issue.code === (lifecycle.status === "retired" ? "provider.model_retired" : "provider.model_deprecated"))?.hint).toContain(replacement);
      expect(JSON.stringify(config)).toBe(before);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });

  it("recommends current models while retaining saved IDs", () => {
    const config = createDefaultConfigObject();
    expect(config.runtime.providers[0]).toMatchObject({ defaultModel: "gpt-6.1-sol", reasoningEffort: "xhigh" });
    expect(DEFAULT_ANTHROPIC_MODEL).toBe("claude-opus-5-5");
    config.runtime.providers = [{ id: "openai-main", type: "openai", defaultModel: "gpt-6-sol" }];
    expect(parseConfig(config).runtime.providers[0]).toEqual(config.runtime.providers[0]);
    config.runtime.providers = [{ id: "openai-main", type: "codex", defaultModel: "gpt-5.4" }];
    expect(parseConfig(config).runtime.providers[0].defaultModel).toBe("gpt-5.4");
    expect(retiredModelReplacement("codex", "gpt-5.4")).toBe("gpt-6.1-sol");
    expect(retiredModelReplacement("openai", "gpt-5.4")).toBeUndefined();
    expect(retiredModelReplacement("codex", "constructor")).toBeUndefined();
    expect(retiredModelReplacement("codex", "__proto__")).toBeUndefined();
  });

  it("filters reasoning by exact route and model", () => {
    expect(reasoningEfforts("gpt-5.6-terra", "codex")).toEqual(["none", "low", "medium", "high", "xhigh", "max"]);
    expect(reasoningEfforts("gpt-6-astra")).not.toContain("none");
    expect(reasoningEfforts("gpt-5.1")).not.toContain("xhigh");
    expect(reasoningPayload("gpt-5.6-terra", "none")).toEqual({ effort: "none" });
    expect(reasoningPayload("gpt-5.6-terra", "max", "codex")).toEqual({ effort: "max" });
    expect(reasoningPayload("gpt-6-astra", "none")).toBeUndefined();
    expect(reasoningPayload("gpt-5.6-terra", undefined)).toBeUndefined();
    for (const model of ["my-gpt-5.6-terra", "custom-codex", "claude-sonnet-5-custom"]) {
      expect(modelCapabilities(model)).toBeUndefined();
      expect(reasoningPayload(model, "high")).toBeUndefined();
      expect(shouldPreferResponsesApi(model)).toBe(false);
    }
    expect(reasoningEfforts("gpt-5.4", "codex")).toEqual([]);
  });

  it("shows effective controls for custom models and Azure deployments", () => {
    expect(providerTuningLabel({ id: "a", type: "openai", defaultModel: "custom-gpt-5", reasoningEffort: "max" })).toContain("omitted");
    expect(providerTuningLabel({ id: "a", type: "codex", defaultModel: "gpt-5.4" })).toContain("retired");
    expect(providerTuningLabel({ id: "a", type: "azure-foundry", defaultModel: "gpt-5.6-terra", authMode: "entra", endpointFlavor: "openai-resource", resourceName: "test", reasoningEffort: "max" })).toContain("omitted");
    expect(providerTuningLabel({ ...anthropic, thinkingMode: "adaptive", thinkingEffort: "max" })).toBe("Thinking: adaptive; effort: max");
  });

  it("blocks retired Codex readiness without modifying state or contacting the provider", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "openassist-retired-model-"));
    try {
      const config = createDefaultConfigObject();
      config.runtime.providers = [{ id: "openai-main", type: "codex", defaultModel: "gpt-5.4" }];
      const before = JSON.stringify(config);
      const result = await validateSetupReadiness({ config, env: {}, configPath: path.join(root, "config.toml"), envFilePath: path.join(root, "env"), installDir: root, skipService: true, skipBindAvailabilityCheck: true, timezoneConfirmed: true });
      expect(result.errors.find(item => item.code === "provider.codex_model_retired")?.hint).toContain("gpt-6.1-sol");
      expect(JSON.stringify(config)).toBe(before);
      const fetch = vi.spyOn(globalThis, "fetch");
      const adapter = new CodexProviderAdapter({ id: "c", defaultModel: "gpt-5.4" });
      expect((await adapter.validateConfig({ id: "c", defaultModel: "gpt-5.4" })).valid).toBe(false);
      await expect(adapter.chat({ ...request, model: "gpt-5.4" }, { apiKey: "test" })).rejects.toThrow("retired");
      expect(fetch).not.toHaveBeenCalled();
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });

  it("retains manual budgets and rejects incompatible thinking combinations", () => {
    expect(anthropicThinking({ ...anthropic, defaultModel: "claude-sonnet-4-6", thinkingBudgetTokens: 4096 })).toEqual({ thinking: { type: "enabled", budget_tokens: 4096 } });
    expect(anthropicThinking(anthropic)).toEqual({});
    expect(anthropicThinking({ ...anthropic, thinkingMode: "adaptive", thinkingEffort: "max" })).toEqual({ thinking: { type: "adaptive" }, output_config: { effort: "max" } });
    expect(anthropicThinking({ ...anthropic, thinkingMode: "disabled", thinkingEffort: "low" })).toEqual({ thinking: { type: "disabled" }, output_config: { effort: "low" } });
    for (const tuning of [
      { thinkingBudgetTokens: 4096 },
      { thinkingMode: "adaptive" as const, thinkingBudgetTokens: 4096 },
      { thinkingMode: "enabled" as const },
      { defaultModel: "custom-claude", thinkingMode: "adaptive" as const },
      { defaultModel: "claude-haiku-4-5-20251001", thinkingEffort: "max" as const },
      { defaultModel: "claude-opus-5", thinkingMode: "disabled" as const, thinkingEffort: "max" as const }
    ]) {
      const provider = { ...anthropic, ...tuning };
      expect(providerTuningErrors(provider).length).toBeGreaterThan(0);
      const config = createDefaultConfigObject();
      config.runtime.providers = [provider];
      expect(() => parseConfig(config)).toThrow();
    }
    expect(providerTuningErrors({ ...anthropic, defaultModel: "custom-claude" })).toEqual([]);
  });

  it("loads the saved Opus 4.5 alias and retains its manual thinking request", () => {
    const provider = { ...anthropic, defaultModel: "claude-opus-4-5", thinkingBudgetTokens: 4096 };
    const config = createDefaultConfigObject();
    config.runtime.providers = [provider];
    expect(parseConfig(config).runtime.providers[0]).toEqual(provider);
    expect(modelCapabilities(provider.defaultModel, "anthropic")?.thinkingModes).toEqual(
      modelCapabilities("claude-opus-4-5-20251101", "anthropic")?.thinkingModes
    );
    expect(anthropicThinking(provider)).toEqual({ thinking: { type: "enabled", budget_tokens: 4096 } });
  });

  it("offers only verified reasoning choices and omits default", async () => {
    const select = vi.fn().mockResolvedValueOnce("none").mockResolvedValueOnce("default");
    const prompts = { select } as unknown as PromptAdapter;
    expect(await promptReasoningEffort(prompts, "OpenAI", undefined, "gpt-5.6-terra")).toBe("none");
    expect(select.mock.calls[0][1].map((choice: { value: string }) => choice.value)).toContain("max");
    expect(await promptReasoningEffort(prompts, "Codex", "none", "gpt-6-astra")).toBeUndefined();
    expect(select.mock.calls[1][1].map((choice: { value: string }) => choice.value)).not.toContain("none");
    expect(await promptReasoningEffort(prompts, "Azure Foundry", "high", "custom-deployment")).toBeUndefined();
    expect(select).toHaveBeenCalledTimes(2);
  });

  it.each(["OpenAI", "Codex", "Azure Foundry"])("labels the GPT-6.1 Sol recommendation and preserves saved/default effort for %s", async label => {
    const route = label === "OpenAI" ? "openai" : label === "Codex" ? "codex" : "azure-foundry";
    const select = vi.fn().mockImplementation(async (_message, _choices, initial) => initial);
    const prompts = { select } as unknown as PromptAdapter;
    expect(recommendedReasoningEffort("gpt-6.1-sol", route)).toBe("xhigh");
    expect(recommendedReasoningEffort("gpt-6.1-sol", "openai-compatible")).toBeUndefined();
    expect(recommendedReasoningEffort("my-gpt-6.1-sol", route)).toBeUndefined();
    expect(recommendedReasoningEffort("gpt-6-sol", route)).toBeUndefined();
    expect(await promptReasoningEffort(prompts, label, "xhigh", "gpt-6.1-sol")).toBe("xhigh");
    expect(select.mock.calls[0][1].find((choice: { value: string }) => choice.value === "xhigh").name).toContain("recommended for OpenAssist");
    expect(await promptReasoningEffort(prompts, label, "low", "gpt-6.1-sol")).toBe("low");
    expect(await promptReasoningEffort(prompts, label, undefined, "gpt-6.1-sol")).toBeUndefined();
  });

  it("edits adaptive controls, legacy budgets, and disabled thinking", async () => {
    const select = vi.fn().mockResolvedValueOnce("adaptive").mockResolvedValueOnce("max").mockResolvedValueOnce("disabled").mockResolvedValueOnce("default").mockResolvedValueOnce("default").mockResolvedValueOnce("enabled");
    const input = vi.fn().mockResolvedValueOnce("invalid").mockResolvedValueOnce("4096").mockResolvedValueOnce("");
    const prompts = { select, input } as unknown as PromptAdapter;
    expect(await promptAnthropicThinking(prompts, "claude-sonnet-5")).toEqual({ thinkingMode: "adaptive", thinkingEffort: "max" });
    expect(await promptAnthropicThinking(prompts, "claude-sonnet-5")).toEqual({ thinkingMode: "disabled" });
    expect(await promptAnthropicThinking(prompts, "claude-sonnet-5")).toEqual({});
    expect(await promptAnthropicThinking(prompts, "claude-haiku-4-5-20251001")).toEqual({ thinkingBudgetTokens: 4096 });
    expect(await promptAnthropicThinking(prompts, "claude-sonnet-4-6", { ...anthropic, defaultModel: "claude-sonnet-4-6", thinkingBudgetTokens: 4096 })).toEqual({ thinkingMode: "disabled" });
    expect(await promptAnthropicThinking(prompts, "custom-claude")).toEqual({});
  });
});

describe("modern Anthropic requests", () => {
  it.each(["adaptive", "disabled"] as const)("maps %s thinking without unsupported sampling parameters", async thinkingMode => {
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ id: "reply", type: "message", role: "assistant", content: [{ type: "text", text: "hello" }], model: "claude-sonnet-5", stop_reason: "end_turn", usage: { input_tokens: 1, output_tokens: 1 } }), { headers: { "content-type": "application/json" } }));
    const adapter = new AnthropicProviderAdapter({ id: "a", defaultModel: "claude-sonnet-5", thinkingMode, thinkingEffort: "low" });
    expect((await adapter.chat(request, { apiKey: "test-key" })).output.content).toBe("hello");
    const sent = JSON.parse(fetch.mock.calls[0][1]?.body as string);
    expect(sent.thinking).toEqual({ type: thinkingMode });
    expect(sent.output_config).toEqual({ effort: "low" });
    expect(sent).not.toHaveProperty("temperature");
    expect(sent.max_tokens).toBe(4096);
  });

  it("rejects a manual budget that consumes the entire output limit before transport", async () => {
    const fetch = vi.spyOn(globalThis, "fetch");
    const adapter = new AnthropicProviderAdapter({ id: "a", defaultModel: "claude-sonnet-4-6", thinkingBudgetTokens: 4096 });
    await expect(adapter.chat({ ...request, model: "claude-sonnet-4-6", maxTokens: 4096 }, { apiKey: "test" })).rejects.toThrow("maxTokens");
    expect(fetch).not.toHaveBeenCalled();
  });
});
