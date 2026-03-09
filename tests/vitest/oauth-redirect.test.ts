import { describe, expect, it } from "vitest";
import type { RuntimeConfig } from "../../packages/core-types/src/index.js";
import { resolveDefaultOAuthRedirectUri } from "../../apps/openassistd/src/oauth-redirect.js";

function runtimeConfig(): RuntimeConfig {
  return {
    bindAddress: "127.0.0.1",
    bindPort: 3344,
    defaultProviderId: "openai-main",
    providers: [
      {
        id: "openai-main",
        type: "openai",
        defaultModel: "gpt-5.4"
      },
      {
        id: "codex-main",
        type: "codex",
        defaultModel: "gpt-5.4"
      }
    ],
    channels: [],
    defaultPolicyProfile: "operator",
    operatorAccessProfile: "operator",
    assistant: {
      name: "OpenAssist",
      persona: "Pragmatic",
      operatorPreferences: "",
      promptOnFirstContact: false
    },
    paths: {
      dataDir: ".openassist/data",
      logsDir: ".openassist/logs",
      skillsDir: ".openassist/skills"
    },
    scheduler: {
      enabled: false,
      tickIntervalMs: 1000,
      heartbeatIntervalSec: 30,
      defaultMisfirePolicy: "catch-up-once",
      tasks: []
    },
    time: {
      ntpPolicy: "off",
      ntpCheckIntervalSec: 300,
      ntpMaxSkewMs: 10000,
      ntpHttpSources: [],
      requireTimezoneConfirmation: false
    }
  };
}

describe("oauth redirect defaults", () => {
  it("uses the standard localhost callback for codex providers", () => {
    expect(resolveDefaultOAuthRedirectUri(runtimeConfig(), "codex-main")).toBe(
      "http://localhost:1455/auth/callback"
    );
  });

  it("keeps daemon callback redirects for non-codex providers", () => {
    expect(resolveDefaultOAuthRedirectUri(runtimeConfig(), "openai-main")).toBe(
      "http://127.0.0.1:3344/v1/oauth/openai-main/callback"
    );
  });
});
