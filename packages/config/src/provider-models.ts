import type { AnthropicThinkingEffort, ModelCapabilities, OpenAIReasoningEffort, ProviderConfig } from "@openassist/core-types";

export const DEFAULT_OPENAI_MODEL = "gpt-5.6-terra";
export const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-5";
export const OPENAI_REASONING_EFFORTS = ["none", "low", "medium", "high", "xhigh", "max"] as const;
export const ANTHROPIC_THINKING_MODES = ["adaptive", "enabled", "disabled"] as const;
export const ANTHROPIC_THINKING_EFFORTS = ["low", "medium", "high", "xhigh", "max"] as const;
const legacyReasoning = ["low", "medium", "high"] as const;
const extendedReasoning = [...legacyReasoning, "xhigh"] as const;
const models: ModelCapabilities[] = [
  ...["gpt-5.6-terra", "gpt-5.6-sol", "gpt-5.6-luna"].map(id => ({ id, routes: ["openai", "codex", "azure-foundry"] as const, responses: true, reasoningEfforts: OPENAI_REASONING_EFFORTS })),
  { id: "gpt-6-astra", routes: ["openai", "codex", "azure-foundry"], responses: true, reasoningEfforts: ["low", "medium", "high", "xhigh", "max"] },
  ...["gpt-5", "gpt-5-mini", "gpt-5-nano", "o1", "o3", "o3-mini", "o4-mini"].map(id => ({ id, routes: ["openai", "azure-foundry"] as const, responses: true, reasoningEfforts: legacyReasoning })),
  { id: "gpt-5.1", routes: ["openai", "azure-foundry"], responses: true, reasoningEfforts: ["none", ...legacyReasoning] },
  ...["gpt-5.2", "gpt-5.4", "gpt-5.4-mini"].map(id => ({ id, routes: ["openai", "azure-foundry"] as const, responses: true, reasoningEfforts: ["none", ...extendedReasoning] as const })),
  ...["gpt-5-codex", "gpt-5.1-codex"].map(id => ({ id, routes: ["openai", "codex"] as const, responses: true, reasoningEfforts: legacyReasoning })),
  ...["gpt-5.2-codex", "gpt-5.3-codex"].map(id => ({ id, routes: ["openai", "codex"] as const, responses: true, reasoningEfforts: extendedReasoning })),
  ...["gpt-4o", "gpt-4o-mini", "gpt-4.1", "gpt-4.1-mini"].map(id => ({ id, routes: ["openai"] as const, responses: false, reasoningEfforts: [] })),
  ...["gpt-4o", "gpt-4o-mini", "gpt-4.1", "gpt-4.1-mini"].map(id => ({ id, routes: ["azure-foundry"] as const, responses: true, reasoningEfforts: [] })),
  ...["claude-sonnet-5", "claude-opus-5"].map(id => ({ id, routes: ["anthropic"] as const, responses: false, reasoningEfforts: [], thinkingModes: ["adaptive", "disabled"] as const, thinkingEfforts: ANTHROPIC_THINKING_EFFORTS, supportsTemperature: false, defaultThinking: "adaptive" as const })),
  ...["claude-sonnet-4-6", "claude-opus-4-6"].map(id => ({ id, routes: ["anthropic"] as const, responses: false, reasoningEfforts: [], thinkingModes: ["adaptive", "enabled", "disabled"] as const, thinkingEfforts: ["low", "medium", "high", "max"] as const, defaultThinking: "disabled" as const })),
  ...["claude-3-7-sonnet-latest", "claude-3-7-sonnet-20250219", "claude-sonnet-4-20250514", "claude-opus-4-20250514", "claude-sonnet-4-5", "claude-sonnet-4-5-20250929", "claude-opus-4-5", "claude-opus-4-5-20251101", "claude-haiku-4-5-20251001"].map(id => ({ id, routes: ["anthropic"] as const, responses: false, reasoningEfforts: [], thinkingModes: ["enabled", "disabled"] as const, defaultThinking: "disabled" as const }))
];

// Explicit, bounded entries. Never infer capabilities from a custom model's name.
export const PROVIDER_MODELS: readonly ModelCapabilities[] = models;
export function modelCapabilities(model: string, route: ProviderConfig["type"] = "openai"): ModelCapabilities | undefined {
  return models.find(entry => entry.id === model.trim().toLowerCase() && entry.routes.some(candidate => candidate === route));
}
export function reasoningEfforts(model: string, route: ProviderConfig["type"] = "openai"): readonly OpenAIReasoningEffort[] {
  return modelCapabilities(model, route)?.reasoningEfforts ?? [];
}
export function retiredModelReplacement(route: ProviderConfig["type"], model: string): string | undefined {
  if (route !== "codex") return undefined;
  return new Map([["gpt-5.4", DEFAULT_OPENAI_MODEL], ["gpt-5.4-mini", "gpt-5.6-luna"]]).get(model.trim().toLowerCase());
}

export function providerTuningErrors(provider: ProviderConfig): string[] {
  const model = provider.type === "azure-foundry" ? provider.underlyingModel : provider.defaultModel;
  const capabilities = model ? modelCapabilities(model, provider.type) : undefined;
  if (provider.type !== "anthropic") {
    return "reasoningEffort" in provider && provider.reasoningEffort && capabilities &&
      !capabilities.reasoningEfforts.includes(provider.reasoningEffort)
      ? [`Model '${model}' does not support reasoning effort '${provider.reasoningEffort}'. Choose Default or a supported effort.`] : [];
  }
  const errors: string[] = [];
  const mode = provider.thinkingMode ?? (provider.thinkingBudgetTokens !== undefined ? "enabled" : undefined);
  if (provider.thinkingBudgetTokens !== undefined && mode !== "enabled") errors.push("thinkingBudgetTokens requires manual thinkingMode='enabled'; remove the budget for adaptive or disabled thinking.");
  if (mode === "enabled" && provider.thinkingBudgetTokens === undefined) errors.push("Manual thinking requires thinkingBudgetTokens.");
  if (mode && !capabilities?.thinkingModes?.includes(mode)) errors.push(`Model '${model}' does not have verified support for thinkingMode='${mode}'. Choose a supported model or remove explicit thinking settings.`);
  if (provider.thinkingEffort && (!capabilities?.thinkingEfforts?.includes(provider.thinkingEffort))) errors.push(`Model '${model}' does not have verified support for thinkingEffort='${provider.thinkingEffort}'.`);
  if (provider.defaultModel === "claude-opus-5" && mode === "disabled" && ["xhigh", "max"].includes(provider.thinkingEffort ?? "")) errors.push("Claude Opus 5 requires adaptive thinking at xhigh or max effort; enable adaptive thinking or reduce effort.");
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
  if (provider.thinkingBudgetTokens !== undefined) return `Thinking budget: ${provider.thinkingBudgetTokens} tokens`;
  const mode = provider.thinkingMode ?? modelCapabilities(provider.defaultModel, "anthropic")?.defaultThinking;
  return mode === "disabled" && !provider.thinkingMode ? "Thinking budget: Default (disabled)"
    : `Thinking: ${mode ?? "Provider default"}${provider.thinkingEffort ? `; effort: ${provider.thinkingEffort}` : ""}`;
}

export function providerTuningLabel(provider: ProviderConfig): string {
  if (provider.type === "openai" || provider.type === "codex") {
    const replacement = retiredModelReplacement(provider.type, provider.defaultModel);
    if (replacement) return `Unavailable model: retired; select ${replacement} using openassist setup wizard`;
    if (provider.reasoningEffort && !reasoningEfforts(provider.defaultModel, provider.type).includes(provider.reasoningEffort)) return `Reasoning effort: ${provider.reasoningEffort} configured; omitted for unverified model`;
    return provider.reasoningEffort
      ? `Reasoning effort: ${provider.reasoningEffort}`
      : "Reasoning effort: Default (recommended)";
  }
  if (provider.type === "anthropic") {
    return anthropicTuningLabel(provider);
  }
  if (provider.type === "azure-foundry") {
    const details = [
      `Auth: ${provider.authMode === "entra" ? "Entra ID" : "API key"}`,
      provider.underlyingModel ? `Underlying model: ${provider.underlyingModel}` : undefined,
      provider.reasoningEffort
        ? `Reasoning effort: ${provider.reasoningEffort}${reasoningEfforts(provider.underlyingModel ?? "", "azure-foundry").includes(provider.reasoningEffort) ? "" : " configured; omitted for unverified model"}`
        : "Reasoning effort: Default (recommended)"
    ].filter((entry): entry is string => Boolean(entry));
    return details.join("; ");
  }
  return "Provider defaults";
}

