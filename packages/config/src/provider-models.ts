import type { AnthropicThinkingEffort, ModelCapabilities, OpenAIReasoningEffort, ProviderConfig } from "@openassist/core-types";

export const DEFAULT_OPENAI_MODEL = "gpt-6-sol";
export const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-5";
export const OPENAI_MODEL_ALTERNATIVES = ["gpt-6-astra", "gpt-6-luna", "gpt-5.6-terra"] as const;
export const ANTHROPIC_MODEL_ALTERNATIVES = ["claude-opus-5-5", "claude-fable-5-1", "claude-haiku-4-5-20251001"] as const;
export const OPENAI_REASONING_MODES = ["standard", "pro"] as const;
export const OPENAI_REASONING_EFFORTS = ["none", "low", "medium", "high", "xhigh", "max"] as const;
export const ANTHROPIC_THINKING_MODES = ["adaptive", "enabled", "disabled"] as const;
export const ANTHROPIC_THINKING_EFFORTS = ["low", "medium", "high", "xhigh", "max"] as const;
const legacyReasoning = ["low", "medium", "high"] as const;
const extendedReasoning = [...legacyReasoning, "xhigh"] as const;
const models: ModelCapabilities[] = [
  ...["gpt-6-sol", "gpt-6-luna", "gpt-5.6-terra", "gpt-5.6-sol", "gpt-5.6-luna"].map(id => ({ id, routes: ["openai", "azure-foundry"] as const, responses: true, reasoningEfforts: OPENAI_REASONING_EFFORTS, reasoningModes: OPENAI_REASONING_MODES, temperatureRequiresNoReasoning: true })),
  ...["gpt-5.6-terra", "gpt-5.6-sol", "gpt-5.6-luna"].map(id => ({ id, routes: ["codex"] as const, responses: true, reasoningEfforts: OPENAI_REASONING_EFFORTS })),
  ...["gpt-6-astra", "gpt-6-sol", "gpt-6-luna"].map(id => ({ id, routes: ["codex"] as const, responses: true, reasoningEfforts: ["low", "medium", "high", "xhigh", "max"] as const })),
  { id: "gpt-6-astra", routes: ["openai"], responses: true, reasoningEfforts: ["low", "medium", "high", "xhigh", "max"], reasoningModes: OPENAI_REASONING_MODES, supportsTemperature: false },
  // Azure's GPT-6 feature matrix explicitly includes none for its Astra deployment.
  // Keep this route separate from OpenAI's model-specific restriction.
  { id: "gpt-6-astra", routes: ["azure-foundry"], responses: true, reasoningEfforts: OPENAI_REASONING_EFFORTS, reasoningModes: OPENAI_REASONING_MODES, temperatureRequiresNoReasoning: true },
  ...["gpt-5", "gpt-5-mini", "gpt-5-nano", "o1", "o3", "o3-mini", "o4-mini"].map(id => ({ id, routes: ["openai", "azure-foundry"] as const, responses: true, reasoningEfforts: legacyReasoning })),
  { id: "gpt-5.1", routes: ["openai", "azure-foundry"], responses: true, reasoningEfforts: ["none", ...legacyReasoning] },
  ...["gpt-5.2", "gpt-5.4", "gpt-5.4-mini"].map(id => ({ id, routes: ["openai", "azure-foundry"] as const, responses: true, reasoningEfforts: ["none", ...extendedReasoning] as const })),
  ...["gpt-5-codex", "gpt-5.1-codex"].map(id => ({ id, routes: ["openai", "codex"] as const, responses: true, reasoningEfforts: legacyReasoning })),
  ...["gpt-5.2-codex", "gpt-5.3-codex"].map(id => ({ id, routes: ["openai", "codex"] as const, responses: true, reasoningEfforts: extendedReasoning })),
  ...["gpt-4o", "gpt-4o-mini", "gpt-4.1", "gpt-4.1-mini"].map(id => ({ id, routes: ["openai"] as const, responses: false, reasoningEfforts: [] })),
  ...["gpt-4o", "gpt-4o-mini", "gpt-4.1", "gpt-4.1-mini"].map(id => ({ id, routes: ["azure-foundry"] as const, responses: true, reasoningEfforts: [] })),
  ...["claude-opus-5-5", "claude-fable-5-1", "claude-mythos-5-1"].map(id => ({ id, routes: ["anthropic"] as const, responses: false, reasoningEfforts: [], thinkingModes: ["adaptive"] as const, thinkingEfforts: ANTHROPIC_THINKING_EFFORTS, supportsTemperature: false, defaultThinking: "adaptive" as const, defaultThinkingEffort: id === "claude-opus-5-5" ? "medium" as const : "high" as const, thinkingPrefixBinding: true, defaultMaxOutputTokens: 16_384, maxOutputTokens: 128_000 })),
  ...["claude-sonnet-5", "claude-opus-5"].map(id => ({ id, routes: ["anthropic"] as const, responses: false, reasoningEfforts: [], thinkingModes: ["adaptive", "disabled"] as const, thinkingEfforts: ANTHROPIC_THINKING_EFFORTS, supportsTemperature: false, defaultThinking: "adaptive" as const, defaultThinkingEffort: "high" as const, maxOutputTokens: 128_000 })),
  ...["claude-sonnet-4-6", "claude-opus-4-6"].map(id => ({ id, routes: ["anthropic"] as const, responses: false, reasoningEfforts: [], thinkingModes: ["adaptive", "enabled", "disabled"] as const, thinkingEfforts: ["low", "medium", "high", "max"] as const, defaultThinking: "disabled" as const })),
  ...["claude-3-7-sonnet-latest", "claude-3-7-sonnet-20250219", "claude-sonnet-4-20250514", "claude-opus-4-20250514", "claude-sonnet-4-5", "claude-sonnet-4-5-20250929", "claude-opus-4-5", "claude-opus-4-5-20251101", "claude-haiku-4-5", "claude-haiku-4-5-20251001"].map(id => ({ id, routes: ["anthropic"] as const, responses: false, reasoningEfforts: [], thinkingModes: ["enabled", "disabled"] as const, defaultThinking: "disabled" as const, maxOutputTokens: ["claude-haiku-4-5", "claude-haiku-4-5-20251001"].includes(id) ? 64_000 : undefined }))
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
  return new Map([["gpt-5.4", DEFAULT_OPENAI_MODEL], ["gpt-5.4-mini", "gpt-6-luna"]]).get(model.trim().toLowerCase());
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
  if (provider.type === "openai" || provider.type === "codex") {
    const replacement = retiredModelReplacement(provider.type, provider.defaultModel);
    if (replacement) return `Unavailable model: retired; select ${replacement} using openassist setup wizard`;
    if (provider.reasoningEffort && !reasoningEfforts(provider.defaultModel, provider.type).includes(provider.reasoningEffort)) return `Reasoning effort: ${provider.reasoningEffort} configured; omitted for unverified model`;
    const label = provider.reasoningEffort
      ? `Reasoning effort: ${provider.reasoningEffort}`
      : "Reasoning effort: Default (recommended)";
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
        : "Reasoning effort: Default (recommended)"
    ].filter((entry): entry is string => Boolean(entry));
    return details.join("; ");
  }
  return "Provider defaults";
}

