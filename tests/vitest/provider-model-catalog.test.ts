import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { parseConfig } from "../../packages/config/src/schema.js";
import { DEFAULT_ANTHROPIC_MODEL, anthropicThinking, modelCapabilities, providerTuningErrors, reasoningEfforts, recommendedReasoningEffort, retiredModelReplacement } from "../../packages/config/src/provider-models.js";
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

afterEach(() => vi.restoreAllMocks());

describe("shared model capabilities", () => {
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
