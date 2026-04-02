export interface ProviderAuthReadiness {
  linkedAccountCount: number;
  chatReady: boolean;
}

export type ProviderAuthReadinessMap = Record<string, ProviderAuthReadiness>;

export interface ProviderAuthStatusResponse {
  providerId?: string;
  providerType?: "openai" | "codex" | "anthropic" | "openai-compatible" | "azure-foundry";
  linkedAccountCount?: number;
  accounts?: Array<{ accountId: string; expiresAt?: string }>;
  currentAuth?: {
    kind?: string;
    tokenType?: string;
    authMethod?: "callback" | "device-code";
    expiresAt?: string;
    chatReady?: boolean;
    detail?: string;
  };
  providers?: Array<{
    providerId: string;
    providerType?: "openai" | "codex" | "anthropic" | "openai-compatible" | "azure-foundry";
    linkedAccountCount?: number;
    currentAuth?: {
      kind?: string;
      tokenType?: string;
      authMethod?: "callback" | "device-code";
      expiresAt?: string;
      chatReady?: boolean;
      detail?: string;
    };
  }>;
}

function toProviderAuthReadiness(status: {
  linkedAccountCount?: number;
  currentAuth?: { chatReady?: boolean };
}): ProviderAuthReadiness {
  return {
    linkedAccountCount: typeof status.linkedAccountCount === "number" ? status.linkedAccountCount : 0,
    chatReady: status.currentAuth?.chatReady === true
  };
}

export function extractProviderAuthReadinessMap(payload: unknown): ProviderAuthReadinessMap {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return {};
  }

  const response = payload as ProviderAuthStatusResponse;
  if (Array.isArray(response.providers)) {
    return Object.fromEntries(
      response.providers
        .filter(
          (status): status is NonNullable<ProviderAuthStatusResponse["providers"]>[number] =>
            typeof status?.providerId === "string" && status.providerId.trim().length > 0
        )
        .map((status) => [status.providerId, toProviderAuthReadiness(status)])
    );
  }

  if (typeof response.providerId === "string" && response.providerId.trim().length > 0) {
    return {
      [response.providerId]: toProviderAuthReadiness(response)
    };
  }

  return {};
}
