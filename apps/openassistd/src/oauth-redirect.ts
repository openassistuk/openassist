import type { RuntimeConfig } from "@openassist/core-types";

const CODEX_DEFAULT_OAUTH_REDIRECT_URI = "http://localhost:1455/auth/callback";

export function resolveDefaultOAuthRedirectUri(
  config: RuntimeConfig,
  providerId: string
): string {
  const providerConfig = config.providers.find((item) => item.id === providerId);
  if (providerConfig?.type === "codex") {
    return CODEX_DEFAULT_OAUTH_REDIRECT_URI;
  }
  return `http://${config.bindAddress}:${config.bindPort}/v1/oauth/${providerId}/callback`;
}
