import type { AnthropicThinkingEffort, ModelCapabilities, ModelLifecycle, OpenAIReasoningEffort, ProviderConfig } from "@openassist/core-types";

export const DEFAULT_OPENAI_MODEL = "gpt-6.1-sol";
export const DEFAULT_OPENAI_REASONING_EFFORT = "xhigh";
export const DEFAULT_ANTHROPIC_MODEL = "claude-opus-5-5";
export const OPENAI_MODEL_ALTERNATIVES = ["gpt-6-astra", "gpt-6-luna", "gpt-6-sol", "gpt-5.6-terra"] as const;
export const ANTHROPIC_MODEL_ALTERNATIVES = ["claude-sonnet-5-5", "claude-fable-5-1", "claude-haiku-4-5-20251001"] as const;
export const OPENAI_REASONING_MODES = ["standard", "pro"] as const;
export const OPENAI_REASONING_EFFORTS = ["none", "minimal", "low", "medium", "high", "xhigh", "max"] as const;
export const ANTHROPIC_THINKING_MODES = ["adaptive", "enabled", "disabled"] as const;
export const ANTHROPIC_THINKING_EFFORTS = ["low", "medium", "high", "xhigh", "max"] as const;
const legacyReasoning = ["low", "medium", "high"] as const;
const extendedReasoning = [...legacyReasoning, "xhigh"] as const;
const currentReasoning = ["none", ...extendedReasoning, "max"] as const;
const models: ModelCapabilities[] = [
  ...["gpt-6-sol", "gpt-6-luna", "gpt-5.6-terra", "gpt-5.6-sol", "gpt-5.6-luna"].map(id => ({ id, routes: ["openai", "azure-foundry"] as const, responses: true, reasoningEfforts: currentReasoning, reasoningModes: OPENAI_REASONING_MODES, temperatureRequiresNoReasoning: true })),
  { id: "gpt-5.6", routes: ["openai"], responses: true, reasoningEfforts: currentReasoning, reasoningModes: OPENAI_REASONING_MODES, temperatureRequiresNoReasoning: true },
  { id: "gpt-6.1-sol", routes: ["openai"], responses: true, reasoningEfforts: ["low", "medium", "high", "xhigh", "max"], reasoningModes: OPENAI_REASONING_MODES, supportsTemperature: false },
  // Microsoft's deployment matrix includes none, unlike OpenAI's API model.
  { id: "gpt-6.1-sol", routes: ["azure-foundry"], responses: true, reasoningEfforts: currentReasoning, reasoningModes: OPENAI_REASONING_MODES, temperatureRequiresNoReasoning: true },
  ...["gpt-5.6-terra", "gpt-5.6-sol", "gpt-5.6-luna"].map(id => ({ id, routes: ["codex"] as const, responses: true, reasoningEfforts: currentReasoning })),
  ...["gpt-6.1-sol", "gpt-6-astra", "gpt-6-sol", "gpt-6-luna"].map(id => ({ id, routes: ["codex"] as const, responses: true, reasoningEfforts: ["low", "medium", "high", "xhigh", "max"] as const })),
  { id: "gpt-6-astra", routes: ["openai"], responses: true, reasoningEfforts: ["low", "medium", "high", "xhigh", "max"], reasoningModes: OPENAI_REASONING_MODES, supportsTemperature: false },
  // Azure's GPT-6 feature matrix explicitly includes none for its Astra deployment.
  // Keep this route separate from OpenAI's model-specific restriction.
  { id: "gpt-6-astra", routes: ["azure-foundry"], responses: true, reasoningEfforts: currentReasoning, reasoningModes: OPENAI_REASONING_MODES, temperatureRequiresNoReasoning: true },
  ...["gpt-5", "gpt-5-mini", "gpt-5-nano"].map(id => ({ id, routes: ["openai", "azure-foundry"] as const, responses: true, reasoningEfforts: ["minimal", ...legacyReasoning] as const, supportsTemperature: false })),
  ...["o1", "o3", "o3-mini", "o4-mini", "o3-pro"].map(id => ({ id, routes: ["openai", "azure-foundry"] as const, responses: true, reasoningEfforts: legacyReasoning, supportsTemperature: false })),
  { id: "gpt-5.1", routes: ["openai", "azure-foundry"], responses: true, reasoningEfforts: ["none", ...legacyReasoning], temperatureRequiresNoReasoning: true },
  ...["gpt-5.2", "gpt-5.4", "gpt-5.4-mini", "gpt-5.4-nano", "gpt-5.5"].map(id => ({ id, routes: ["openai", "azure-foundry"] as const, responses: true, reasoningEfforts: ["none", ...extendedReasoning] as const, temperatureRequiresNoReasoning: true })),
  { id: "gpt-5.5", routes: ["codex"], responses: true, reasoningEfforts: extendedReasoning },
  { id: "gpt-5-pro", routes: ["openai", "azure-foundry"], responses: true, reasoningEfforts: ["high"], supportsTemperature: false },
  { id: "gpt-5.4-pro", routes: ["openai", "azure-foundry"], responses: true, reasoningEfforts: ["medium", "high", "xhigh"], supportsTemperature: false },
  ...["gpt-5.2-pro", "gpt-5.5-pro"].map(id => ({ id, routes: ["openai"] as const, responses: true, reasoningEfforts: ["medium", "high", "xhigh"] as const, supportsTemperature: false })),
  ...["gpt-5-codex", "gpt-5.1-codex"].map(id => ({ id, routes: ["openai", "codex"] as const, responses: true, reasoningEfforts: legacyReasoning, supportsTemperature: false })),
  ...["gpt-5.2-codex", "gpt-5.3-codex"].map(id => ({ id, routes: ["openai", "codex", "azure-foundry"] as const, responses: true, reasoningEfforts: extendedReasoning, supportsTemperature: false })),
  { id: "gpt-5-codex", routes: ["azure-foundry"], responses: true, reasoningEfforts: legacyReasoning, supportsTemperature: false },
  ...["gpt-5.1-codex", "gpt-5.1-codex-mini"].map(id => ({ id, routes: ["azure-foundry"] as const, responses: true, reasoningEfforts: ["none", ...legacyReasoning] as const, supportsTemperature: false })),
  { id: "gpt-5.1-codex-max", routes: ["azure-foundry"], responses: true, reasoningEfforts: ["none", ...extendedReasoning], supportsTemperature: false },
  { id: "gpt-5.1-codex-max", routes: ["openai", "codex"], responses: true, reasoningEfforts: extendedReasoning, supportsTemperature: false },
  { id: "gpt-5.1-codex-mini", routes: ["openai", "codex"], responses: true, reasoningEfforts: legacyReasoning, supportsTemperature: false },
  // Restricted aliases have verified Responses/tool support, but no assumed tuning.
  ...["gpt-5.6-cyber", "gpt-daybreak-red-latest", "gpt-daybreak-blue-latest"].map(id => ({ id, routes: ["openai"] as const, responses: true, reasoningEfforts: [], reasoningReplay: true, supportsTemperature: false })),
  { id: "chat-latest", routes: ["openai"], responses: true, reasoningEfforts: [] },
  ...["gpt-4o", "gpt-4o-mini", "gpt-4.1", "gpt-4.1-mini", "gpt-4.1-nano"].map(id => ({ id, routes: ["openai"] as const, responses: false, reasoningEfforts: [] })),
  ...["gpt-4o", "gpt-4o-mini", "gpt-4.1", "gpt-4.1-mini", "gpt-4.1-nano"].map(id => ({ id, routes: ["azure-foundry"] as const, responses: true, reasoningEfforts: [] })),
  ...["claude-opus-5-5", "claude-sonnet-5-5", "claude-fable-5-1", "claude-mythos-5-1"].map(id => ({ id, routes: ["anthropic"] as const, responses: false, reasoningEfforts: [], thinkingModes: ["adaptive"] as const, thinkingEfforts: ANTHROPIC_THINKING_EFFORTS, supportsTemperature: false, defaultThinking: "adaptive" as const, defaultThinkingEffort: id === "claude-opus-5-5" ? "medium" as const : "high" as const, thinkingPrefixBinding: true, defaultMaxOutputTokens: 16_384, maxOutputTokens: 128_000 })),
  ...["claude-sonnet-5", "claude-opus-5"].map(id => ({ id, routes: ["anthropic"] as const, responses: false, reasoningEfforts: [], thinkingModes: ["adaptive", "disabled"] as const, thinkingEfforts: ANTHROPIC_THINKING_EFFORTS, supportsTemperature: false, defaultThinking: "adaptive" as const, defaultThinkingEffort: "high" as const, maxOutputTokens: 128_000 })),
  ...["claude-fable-5", "claude-mythos-5"].map(id => ({ id, routes: ["anthropic"] as const, responses: false, reasoningEfforts: [], thinkingModes: ["adaptive"] as const, thinkingEfforts: ANTHROPIC_THINKING_EFFORTS, supportsTemperature: false, defaultThinking: "adaptive" as const, defaultThinkingEffort: "high" as const, defaultMaxOutputTokens: 16_384, maxOutputTokens: 128_000 })),
  ...["claude-opus-4-7", "claude-opus-4-8"].map(id => ({ id, routes: ["anthropic"] as const, responses: false, reasoningEfforts: [], thinkingModes: ["adaptive", "disabled"] as const, thinkingEfforts: ANTHROPIC_THINKING_EFFORTS, supportsTemperature: false, defaultThinking: "disabled" as const, defaultThinkingEffort: "high" as const, maxOutputTokens: 128_000 })),
  { id: "claude-mythos-preview", routes: ["anthropic"], responses: false, reasoningEfforts: [], thinkingModes: ["adaptive", "enabled"], thinkingEfforts: ["low", "medium", "high", "max"], supportsTemperature: false, defaultThinking: "adaptive", defaultThinkingEffort: "high", defaultMaxOutputTokens: 16_384, maxOutputTokens: 128_000 },
  ...["claude-sonnet-4-6", "claude-opus-4-6"].map(id => ({ id, routes: ["anthropic"] as const, responses: false, reasoningEfforts: [], thinkingModes: ["adaptive", "enabled", "disabled"] as const, thinkingEfforts: ["low", "medium", "high", "max"] as const, defaultThinking: "disabled" as const, defaultThinkingEffort: "high" as const, maxOutputTokens: 128_000 })),
  ...["claude-3-7-sonnet-latest", "claude-3-7-sonnet-20250219", "claude-sonnet-4-20250514", "claude-opus-4-20250514", "claude-sonnet-4-5", "claude-sonnet-4-5-20250929", "claude-opus-4-5", "claude-opus-4-5-20251101", "claude-haiku-4-5", "claude-haiku-4-5-20251001"].map(id => ({ id, routes: ["anthropic"] as const, responses: false, reasoningEfforts: [], thinkingModes: ["enabled", "disabled"] as const, defaultThinking: "disabled" as const, maxOutputTokens: ["claude-haiku-4-5", "claude-haiku-4-5-20251001"].includes(id) ? 64_000 : undefined }))
];

// Only vendor-listed aliases and snapshots inherit verified API capabilities.
const openaiSnapshots: ReadonlyArray<readonly [string, readonly string[]]> = [
  ["gpt-5", ["gpt-5-2025-08-07"]], ["gpt-5-mini", ["gpt-5-mini-2025-08-07"]], ["gpt-5-nano", ["gpt-5-nano-2025-08-07"]],
  ["gpt-5.1", ["gpt-5.1-2025-11-13"]], ["gpt-5.2", ["gpt-5.2-2025-12-11"]], ["gpt-5.4", ["gpt-5.4-2026-03-05"]],
  ["gpt-5.4-mini", ["gpt-5.4-mini-2026-03-17"]], ["gpt-5.4-nano", ["gpt-5.4-nano-2026-03-17"]], ["gpt-5.5", ["gpt-5.5-2026-04-23"]],
  ["gpt-5-pro", ["gpt-5-pro-2025-10-06"]], ["gpt-5.2-pro", ["gpt-5.2-pro-2025-12-11"]], ["gpt-5.4-pro", ["gpt-5.4-pro-2026-03-05"]], ["gpt-5.5-pro", ["gpt-5.5-pro-2026-04-23"]],
  ["gpt-4.1", ["gpt-4.1-2025-04-14"]], ["gpt-4.1-mini", ["gpt-4.1-mini-2025-04-14"]], ["gpt-4.1-nano", ["gpt-4.1-nano-2025-04-14"]],
  ["gpt-4o", ["gpt-4o-2024-11-20", "gpt-4o-2024-08-06", "gpt-4o-2024-05-13"]], ["gpt-4o-mini", ["gpt-4o-mini-2024-07-18"]],
  ["o1", ["o1-2024-12-17"]], ["o3", ["o3-2025-04-16"]], ["o3-mini", ["o3-mini-2025-01-31"]], ["o4-mini", ["o4-mini-2025-04-16"]], ["o3-pro", ["o3-pro-2025-06-10"]]
];
for (const [model, snapshots] of openaiSnapshots) {
  const capabilities = models.find(entry => entry.id === model && entry.routes.includes("openai"));
  if (capabilities) for (const id of snapshots) models.push({ ...capabilities, id, routes: ["openai"] });
}
// Opus 4.5 supports effort alongside its manual budget; Sonnet/Haiku 4.5 do not.
for (const entry of models) {
  if (["claude-opus-4-5", "claude-opus-4-5-20251101"].includes(entry.id)) {
    entry.thinkingEfforts = legacyReasoning;
    entry.defaultThinkingEffort = "high";
  }
  if (["claude-sonnet-4-5", "claude-sonnet-4-5-20250929", "claude-opus-4-5", "claude-opus-4-5-20251101"].includes(entry.id)) entry.maxOutputTokens = 64_000;
}

const lifecycles: Array<{ routes: readonly ProviderConfig["type"][]; models: readonly string[]; retirementDate?: string; replacementModel: string }> = [
  { routes: ["codex"], models: ["gpt-5.4"], retirementDate: "2026-08-31", replacementModel: DEFAULT_OPENAI_MODEL },
  { routes: ["codex"], models: ["gpt-5.4-mini"], retirementDate: "2026-08-31", replacementModel: "gpt-6-luna" },
  { routes: ["codex"], models: ["gpt-5.3-codex-spark"], retirementDate: "2026-09-14", replacementModel: "gpt-6-luna" },
  { routes: ["codex"], models: ["gpt-5.5"], retirementDate: "2026-10-14", replacementModel: DEFAULT_OPENAI_MODEL },
  { routes: ["codex"], models: ["gpt-5.2", "gpt-5.3-codex"], replacementModel: DEFAULT_OPENAI_MODEL },
  { routes: ["openai"], models: ["gpt-5-codex", "gpt-5.1-codex", "gpt-5.1-codex-max", "gpt-5.2-codex", "gpt-5-chat-latest", "gpt-5.1-chat-latest"], retirementDate: "2026-07-23", replacementModel: "gpt-5.6-sol" },
  { routes: ["openai"], models: ["gpt-5.1-codex-mini"], retirementDate: "2026-07-23", replacementModel: "gpt-5.6-terra" },
  { routes: ["openai"], models: ["gpt-5.2-chat-latest", "gpt-5.3-chat-latest"], retirementDate: "2026-08-10", replacementModel: "gpt-5.6-sol" },
  { routes: ["openai"], models: ["o1", "o3-mini"], retirementDate: "2026-10-23", replacementModel: "gpt-5.6-sol" },
  { routes: ["openai"], models: ["gpt-4o-2024-05-13"], retirementDate: "2026-10-23", replacementModel: "gpt-5.6-sol" },
  { routes: ["openai"], models: ["o4-mini"], retirementDate: "2026-10-23", replacementModel: "gpt-5.6-terra" },
  { routes: ["openai"], models: ["gpt-4.1-nano"], retirementDate: "2026-10-23", replacementModel: "gpt-5.6-luna" },
  { routes: ["anthropic"], models: ["claude-sonnet-4-5", "claude-sonnet-4-5-20250929"], retirementDate: "2026-11-30", replacementModel: "claude-sonnet-5-5" },
  { routes: ["anthropic"], models: ["claude-sonnet-4-20250514"], retirementDate: "2026-06-15", replacementModel: "claude-sonnet-4-6" },
  { routes: ["anthropic"], models: ["claude-opus-4-20250514"], retirementDate: "2026-06-15", replacementModel: "claude-opus-4-8" },
  { routes: ["anthropic"], models: ["claude-opus-4-1", "claude-opus-4-1-20250805"], retirementDate: "2026-08-05", replacementModel: "claude-opus-4-8" },
  { routes: ["anthropic"], models: ["claude-3-7-sonnet-latest", "claude-3-7-sonnet-20250219"], retirementDate: "2026-02-19", replacementModel: "claude-sonnet-4-6" },
  { routes: ["anthropic"], models: ["claude-mythos-preview"], replacementModel: "claude-mythos-5-1" }
];

export function modelLifecycle(model: string, route: ProviderConfig["type"] = "openai", now = new Date()): ModelLifecycle | undefined {
  const id = model.trim().toLowerCase();
  const canonical = route === "openai" ? openaiSnapshots.find(([, snapshots]) => snapshots.includes(id))?.[0] ?? id : id;
  const lifecycle = lifecycles.find(entry => entry.routes.includes(route) && (entry.models.includes(id) || entry.models.includes(canonical)));
  if (!lifecycle) return undefined;
  return { status: lifecycle.retirementDate && now.getTime() >= Date.parse(`${lifecycle.retirementDate}T00:00:00Z`) ? "retired" : "deprecated", retirementDate: lifecycle.retirementDate, replacementModel: lifecycle.replacementModel };
}

export function providerModelAvailabilityErrors(provider: ProviderConfig): string[] {
  const lifecycle = modelLifecycle(provider.defaultModel, provider.type);
  return lifecycle?.status === "retired" ? [`Model '${provider.defaultModel}' on ${provider.type} retired on ${lifecycle.retirementDate}. Select '${lifecycle.replacementModel}' using openassist setup wizard; saved configuration has not been changed.`] : [];
}

// Explicit, bounded entries. Never infer capabilities from a custom model's name.
export const PROVIDER_MODELS: readonly ModelCapabilities[] = models;
export function modelCapabilities(model: string, route: ProviderConfig["type"] = "openai"): ModelCapabilities | undefined {
  return models.find(entry => entry.id === model.trim().toLowerCase() && entry.routes.some(candidate => candidate === route));
}
export function reasoningEfforts(model: string, route: ProviderConfig["type"] = "openai"): readonly OpenAIReasoningEffort[] {
  return modelCapabilities(model, route)?.reasoningEfforts ?? [];
}
export function recommendedReasoningEffort(model: string, route: ProviderConfig["type"] = "openai"): OpenAIReasoningEffort | undefined {
  return model.trim().toLowerCase() === DEFAULT_OPENAI_MODEL && reasoningEfforts(model, route).includes(DEFAULT_OPENAI_REASONING_EFFORT)
    ? DEFAULT_OPENAI_REASONING_EFFORT : undefined;
}
export function retiredModelReplacement(route: ProviderConfig["type"], model: string): string | undefined {
  const lifecycle = modelLifecycle(model, route);
  return lifecycle?.status === "retired" ? lifecycle.replacementModel : undefined;
}

export function providerTuningErrors(provider: ProviderConfig): string[] {
  const model = provider.type === "azure-foundry" ? provider.underlyingModel : provider.defaultModel;
  const capabilities = model ? modelCapabilities(model, provider.type) : undefined;
  if (provider.type !== "anthropic") {
    const errors = "reasoningEffort" in provider && provider.reasoningEffort && capabilities &&
      !capabilities.reasoningEfforts.includes(provider.reasoningEffort)
      ? [`Model '${model}' does not support reasoning effort '${provider.reasoningEffort}'. Choose Default or a supported effort.`] : [];
    if ("reasoningMode" in provider && provider.reasoningMode && !capabilities?.reasoningModes?.includes(provider.reasoningMode)) {
      errors.push(`Model '${model ?? "unknown"}' on ${provider.type} does not have verified support for reasoningMode='${provider.reasoningMode}'. Select a cataloged underlying model or remove reasoningMode.`);
    }
    return errors;
  }
  const errors: string[] = [];
  if (provider.maxOutputTokens !== undefined && capabilities?.maxOutputTokens !== undefined && provider.maxOutputTokens > capabilities.maxOutputTokens) errors.push(`Model '${model}' supports at most ${capabilities.maxOutputTokens} output tokens.`);
  if (provider.maxOutputTokens !== undefined && provider.thinkingBudgetTokens !== undefined && provider.maxOutputTokens <= provider.thinkingBudgetTokens) errors.push("maxOutputTokens must be greater than thinkingBudgetTokens.");
  const mode = provider.thinkingMode ?? (provider.thinkingBudgetTokens !== undefined ? "enabled" : undefined);
  if (provider.thinkingBudgetTokens !== undefined && mode !== "enabled") errors.push("thinkingBudgetTokens requires manual thinkingMode='enabled'; remove the budget for adaptive or disabled thinking.");
  if (mode === "enabled" && provider.thinkingBudgetTokens === undefined) errors.push("Manual thinking requires thinkingBudgetTokens.");
  if (mode && !capabilities?.thinkingModes?.includes(mode)) errors.push(`Model '${model}' does not have verified support for thinkingMode='${mode}'. Choose a supported model or remove explicit thinking settings.`);
  if (provider.thinkingEffort && (!capabilities?.thinkingEfforts?.includes(provider.thinkingEffort))) errors.push(`Model '${model}' does not have verified support for thinkingEffort='${provider.thinkingEffort}'.`);
  if (capabilities?.id === "claude-opus-5" && mode === "disabled" && ["xhigh", "max"].includes(provider.thinkingEffort ?? "")) errors.push("Claude Opus 5 requires adaptive thinking at xhigh or max effort; enable adaptive thinking or reduce effort.");
  return errors;
}

export function anthropicThinking(provider: Extract<ProviderConfig, { type: "anthropic" }>): {
  thinking?: { type: "adaptive" | "disabled" } | { type: "enabled"; budget_tokens: number };
  output_config?: { effort: AnthropicThinkingEffort };
} {
  const errors = providerTuningErrors(provider);
  if (errors.length) throw new Error(errors.join(" "));
  const mode = provider.thinkingMode ?? (provider.thinkingBudgetTokens !== undefined ? "enabled" : undefined);
  return {
    ...(mode ? { thinking: mode === "enabled" ? { type: mode, budget_tokens: provider.thinkingBudgetTokens! } : { type: mode } } : {}),
    ...(provider.thinkingEffort ? { output_config: { effort: provider.thinkingEffort } } : {})
  };
}

export function anthropicTuningLabel(provider: Extract<ProviderConfig, { type: "anthropic" }>): string {
  const capabilities = modelCapabilities(provider.defaultModel, "anthropic");
  const outputLimit = provider.maxOutputTokens ?? capabilities?.defaultMaxOutputTokens;
  const outputLabel = outputLimit ? `; output limit: ${outputLimit} tokens` : "";
  if (provider.thinkingBudgetTokens !== undefined) return `Thinking budget: ${provider.thinkingBudgetTokens} tokens${outputLabel}`;
  const mode = provider.thinkingMode ?? capabilities?.defaultThinking;
  const effort = provider.thinkingEffort ?? capabilities?.defaultThinkingEffort;
  const label = mode === "disabled" && !provider.thinkingMode ? "Thinking budget: Default (disabled)"
    : `Thinking: ${mode ?? "Provider default"}${effort ? `; effort: ${effort}${provider.thinkingEffort ? "" : " (provider default)"}` : ""}`;
  return label + outputLabel;
}

export function providerTuningLabel(provider: ProviderConfig): string {
  const lifecycle = modelLifecycle(provider.defaultModel, provider.type);
  if (lifecycle?.status === "retired") return `Unavailable model: retired; select ${lifecycle.replacementModel} using openassist setup wizard`;
  const tuning = activeProviderTuningLabel(provider);
  return lifecycle ? `${tuning}; model deprecated${lifecycle.retirementDate ? `; retires ${lifecycle.retirementDate}` : ""}; replacement: ${lifecycle.replacementModel}` : tuning;
}

function activeProviderTuningLabel(provider: ProviderConfig): string {
  if (provider.type === "openai" || provider.type === "codex") {
    if (provider.reasoningEffort && !reasoningEfforts(provider.defaultModel, provider.type).includes(provider.reasoningEffort)) return `Reasoning effort: ${provider.reasoningEffort} configured; omitted for unverified model`;
    const label = provider.reasoningEffort
      ? `Reasoning effort: ${provider.reasoningEffort}`
      : "Reasoning effort: Default (provider default)";
    return `${label}${provider.type === "openai" && provider.reasoningMode ? `; mode: ${provider.reasoningMode}` : ""}`;
  }
  if (provider.type === "anthropic") {
    return anthropicTuningLabel(provider);
  }
  if (provider.type === "azure-foundry") {
    const details = [
      `Auth: ${provider.authMode === "entra" ? "Entra ID" : "API key"}`,
      provider.underlyingModel ? `Underlying model: ${provider.underlyingModel}` : undefined,
      provider.reasoningMode ? `Reasoning mode: ${provider.reasoningMode}` : undefined,
      provider.reasoningEffort
        ? `Reasoning effort: ${provider.reasoningEffort}${reasoningEfforts(provider.underlyingModel ?? "", "azure-foundry").includes(provider.reasoningEffort) ? "" : " configured; omitted for unverified model"}`
        : "Reasoning effort: Default (provider default)"
    ].filter((entry): entry is string => Boolean(entry));
    return details.join("; ");
  }
  return "Provider defaults";
}

