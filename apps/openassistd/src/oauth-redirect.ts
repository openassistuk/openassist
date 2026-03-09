import type { RuntimeConfig } from "@openassist/core-types";
import { defaultCodexOAuthRedirectUri } from "@openassist/providers-codex";

export function resolveDefaultOAuthRedirectUri(
  config: RuntimeConfig,
  providerId: string
): string {
  const providerConfig = config.providers.find((item) => item.id === providerId);
  if (providerConfig?.type === "codex") {
    return defaultCodexOAuthRedirectUri();
  }
  return `http://${config.bindAddress}:${config.bindPort}/v1/oauth/${providerId}/callback`;
}
