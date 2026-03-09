import { describe, expect, it } from "vitest";
import type { OpenAssistConfig } from "../../packages/config/src/index.js";
import {
  describePrimaryProvider,
  formatProviderMenuLabel,
  providerRouteLabel,
  providerTuningLabel
} from "../../apps/openassist-cli/src/lib/provider-display.js";

function baseConfig(): OpenAssistConfig {
  return {
    runtime: {
      bindAddress: "127.0.0.1",
      bindPort: 3344,
      defaultProviderId: "openai-main",
      providers: [
        {
          id: "openai-main",
          type: "openai",
          defaultModel: "gpt-5.4",
          reasoningEffort: "high"
        }
      ],
      channels: [],
      defaultPolicyProfile: "operator",
      operatorAccessProfile: "operator",
      attachments: {
        maxFilesPerMessage: 4,
        maxImageBytes: 10_000_000,
        maxDocumentBytes: 1_000_000,
        maxExtractedChars: 12_000
      },
      assistant: {
        name: "OpenAssist",
        persona: "Pragmatic and concise",
        operatorPreferences: "",
        promptOnFirstContact: false
      },
      paths: {
        dataDir: ".openassist/data",
        skillsDir: ".openassist/skills",
        logsDir: ".openassist/logs"
      },
      time: {
        ntpPolicy: "off",
        ntpCheckIntervalSec: 300,
        ntpMaxSkewMs: 10_000,
        ntpHttpSources: [],
        requireTimezoneConfirmation: false
      },
      scheduler: {
        enabled: false,
        tickIntervalMs: 1000,
        heartbeatIntervalSec: 30,
        defaultMisfirePolicy: "catch-up-once",
        tasks: []
      }
    },
    tools: {
      fs: { workspaceOnly: true, allowedReadPaths: [], allowedWritePaths: [] },
      exec: {
        defaultTimeoutMs: 60_000,
        guardrails: { mode: "minimal", extraBlockedPatterns: [] }
      },
      pkg: {
        enabled: true,
        preferStructuredInstall: true,
        allowExecFallback: true,
        sudoNonInteractive: true,
        allowedManagers: []
      },
      web: {
        enabled: true,
        searchMode: "hybrid",
        requestTimeoutMs: 15_000,
        maxRedirects: 5,
        maxFetchBytes: 1_000_000,
        maxSearchResults: 8,
        maxPagesPerRun: 4
      }
    },
    security: {
      auditLogEnabled: true,
      secretsBackend: "encrypted-file"
    }
  };
}

describe("provider display helpers", () => {
  it("formats route and tuning labels for supported provider routes", () => {
    expect(providerRouteLabel("openai")).toBe("OpenAI (API Key)");
    expect(providerRouteLabel("codex")).toBe("Codex (OpenAI account login)");
    expect(providerRouteLabel("anthropic")).toBe("Anthropic (API Key)");
    expect(providerTuningLabel({
      id: "codex-main",
      type: "codex",
      defaultModel: "gpt-5.4",
      reasoningEffort: "medium"
    })).toBe("Reasoning effort: medium");
    expect(providerTuningLabel({
      id: "anthropic-main",
      type: "anthropic",
      defaultModel: "claude-sonnet-4-6",
      thinkingBudgetTokens: 4096
    })).toBe("Thinking budget: 4096 tokens");
  });

  it("describes the primary provider and provider menu labels", () => {
    const config = baseConfig();
    config.runtime.providers.push({
      id: "codex-main",
      type: "codex",
      defaultModel: "gpt-5.4"
    });

    expect(describePrimaryProvider(config)).toMatchObject({
      id: "openai-main",
      routeLabel: "OpenAI (API Key)",
      model: "gpt-5.4",
      tuningLabel: "Reasoning effort: high"
    });
    expect(formatProviderMenuLabel(config.runtime.providers[1]!)).toBe(
      "codex-main (Codex (OpenAI account login), gpt-5.4, Reasoning effort: Default (recommended))"
    );
  });
});
