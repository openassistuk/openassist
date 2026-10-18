import type { ProviderConfig, ResolvedContextLimits, RuntimeContextConfig } from "@openassist/core-types";
import { modelCapabilities } from "./provider-models.js";

export const DEFAULT_CONTEXT_CONFIG = {
  autoCompact: true,
  compactAtRatio: 0.85, targetRatio: 0.60, maxRequestBytes: 33_554_432,
  summaryMaxTokens: 8192, summarySourceTokens: 32_768
} satisfies RuntimeContextConfig;

export function contextOutputAllowance(provider: ProviderConfig): number | undefined {
  return provider.type === "anthropic" ? provider.maxOutputTokens ?? Math.max(
    modelCapabilities(provider.defaultModel, "anthropic")?.defaultMaxOutputTokens ?? 4096,
    (provider.thinkingBudgetTokens ?? 0) + 1024) : undefined;
}

export function resolveContextLimits(provider: ProviderConfig, model = provider.defaultModel,
  policy: Partial<RuntimeContextConfig> = {}, outputTokens?: number): ResolvedContextLimits {
  const modelHint = provider.type === "azure-foundry" ? (model === provider.defaultModel ? provider.underlyingModel : undefined) : model;
  const capabilities = modelHint ? modelCapabilities(modelHint, provider.type) : undefined;
  const host = provider.baseUrl ? new URL(provider.baseUrl).hostname : "";
  const canonicalEndpoint = !provider.baseUrl || (provider.type === "azure-foundry" &&
    (host.endsWith(".openai.azure.com") || host.endsWith(".services.ai.azure.com"))) ||
    (provider.type === "openai" && new URL(provider.baseUrl).hostname === "api.openai.com") ||
    (provider.type === "anthropic" && new URL(provider.baseUrl).hostname === "api.anthropic.com");
  const known = canonicalEndpoint && provider.type !== "codex" && provider.type !== "openai-compatible" ? capabilities : undefined;
  const nativeWindow = known?.contextWindowTokens;
  const contextWindowTokens = provider.contextWindowTokens
    ? Math.min(provider.contextWindowTokens, nativeWindow ?? provider.contextWindowTokens)
    : nativeWindow ?? 24_000;
  const reservedOutputTokens = Math.max(outputTokens ?? known?.maxOutputTokens ?? 8192, policy.reservedOutputTokens ?? 0);
  const safetyMarginTokens = Math.max(1024, Math.ceil(contextWindowTokens * 0.02));
  const azureMaximumInput = provider.type === "azure-foundry" && nativeWindow === 1_050_000 ? 922_000 : undefined;
  const maxInputTokens = Math.min(contextWindowTokens, azureMaximumInput ?? known?.maxInputTokens ?? contextWindowTokens, policy.maxInputTokens ?? contextWindowTokens);
  const usableInputTokens = Math.min(maxInputTokens, contextWindowTokens - reservedOutputTokens - safetyMarginTokens);
  if (usableInputTokens < 1) throw new Error("Context/output reservations leave no usable input. Reduce the output reservation or configure a verified larger context window.");
  return { route: provider.type, model, contextWindowTokens, maxInputTokens, operatorInputCapTokens: policy.maxInputTokens, reservedOutputTokens, safetyMarginTokens,
    usableInputTokens, source: provider.contextWindowTokens ? "configured" : nativeWindow ? "catalog" : "fallback",
    ...(nativeWindow ? { checkedAt: known?.limitsCheckedAt } : {}) };
}
