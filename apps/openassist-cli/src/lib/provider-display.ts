import { providerTuningLabel } from "@openassist/config";
import type { OpenAssistConfig } from "@openassist/config";

export type ProviderConfig = OpenAssistConfig["runtime"]["providers"][number];

export interface ProviderDisplayState {
  id: string;
  routeLabel: string;
  model: string;
  tuningLabel: string;
}

export function providerRouteLabel(type: ProviderConfig["type"]): string {
  if (type === "openai") {
    return "OpenAI (API Key)";
  }
  if (type === "codex") {
    return "Codex (OpenAI account login)";
  }
  if (type === "anthropic") {
    return "Anthropic (API Key)";
  }
  if (type === "azure-foundry") {
    return "Azure Foundry";
  }
  return "OpenAI-compatible";
}

export { providerTuningLabel };

export function describeProvider(provider: ProviderConfig): ProviderDisplayState {
  return {
    id: provider.id,
    routeLabel: providerRouteLabel(provider.type),
    model: provider.defaultModel,
    tuningLabel: providerTuningLabel(provider)
  };
}

export function describePrimaryProvider(
  config?: OpenAssistConfig
): ProviderDisplayState | undefined {
  if (!config) {
    return undefined;
  }

  const provider = config.runtime.providers.find(
    (candidate) => candidate.id === config.runtime.defaultProviderId
  );
  if (!provider) {
    return undefined;
  }

  return describeProvider(provider);
}

export function formatProviderMenuLabel(provider: ProviderConfig): string {
  const details = describeProvider(provider);
  return `${details.id} (${details.routeLabel}, ${details.model}, ${details.tuningLabel})`;
}
