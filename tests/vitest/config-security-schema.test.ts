import { describe, expect, it } from "vitest";
import { parseConfig } from "../../packages/config/src/schema.js";

function baseConfigInput(): Record<string, unknown> {
  return {
    runtime: {
      bindAddress: "127.0.0.1",
      bindPort: 3344,
      defaultProviderId: "openai-main",
      providers: [
        {
          id: "openai-main",
          type: "openai",
          defaultModel: "gpt-5.4"
        }
      ],
      channels: [],
      defaultPolicyProfile: "operator",
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
      fs: {
        workspaceOnly: true,
        allowedReadPaths: [],
        allowedWritePaths: []
      },
      exec: {
        defaultTimeoutMs: 60_000,
        guardrails: {
          mode: "minimal",
          extraBlockedPatterns: []
        }
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

describe("config schema security validation", () => {
  it("rejects plaintext channel bot tokens", () => {
    const input = baseConfigInput();
    (input.runtime as any).channels = [
      {
        id: "telegram-main",
        type: "telegram",
        enabled: true,
        settings: {
          botToken: "plaintext-token"
        }
      }
    ];

    expect(() => parseConfig(input)).toThrow(/secret-like setting 'botToken'/);
  });

  it("accepts env channel bot tokens", () => {
    const input = baseConfigInput();
    (input.runtime as any).channels = [
      {
        id: "telegram-main",
        type: "telegram",
        enabled: true,
        settings: {
          botToken: "env:OPENASSIST_CHANNEL_TELEGRAM_MAIN_BOT_TOKEN"
        }
      }
    ];

    expect(() => parseConfig(input)).not.toThrow();
  });

  it("rejects invalid OAuth client secret env var names", () => {
    const input = baseConfigInput();
    (input.runtime as any).providers = [
      {
        id: "openai-main",
        type: "openai",
        defaultModel: "gpt-5.4",
        oauth: {
          authorizeUrl: "https://example.test/oauth/authorize",
          tokenUrl: "https://example.test/oauth/token",
          clientId: "client-id",
          clientSecretEnv: "invalid-env-name"
        }
      }
    ];

    expect(() => parseConfig(input)).toThrow(/clientSecretEnv/);
  });

  it("accepts explicit native web tool configuration", () => {
    const input = baseConfigInput();
    (input.tools as any).web = {
      enabled: true,
      searchMode: "api-only",
      requestTimeoutMs: 20_000,
      maxRedirects: 4,
      maxFetchBytes: 750_000,
      maxSearchResults: 5,
      maxPagesPerRun: 3
    };

    expect(() => parseConfig(input)).not.toThrow();
  });

  it("defaults operatorAccessProfile to operator when omitted", () => {
    const input = baseConfigInput();

    const parsed = parseConfig(input);

    expect(parsed.runtime.operatorAccessProfile).toBe("operator");
  });

  it("accepts provider-native reasoning controls for built-in providers", () => {
    const input = baseConfigInput();
    (input.runtime as any).providers = [
      {
        id: "openai-main",
        type: "openai",
        defaultModel: "gpt-5.4",
        reasoningEffort: "medium"
      },
      {
        id: "anthropic-main",
        type: "anthropic",
        defaultModel: "claude-sonnet-4-6",
        thinkingBudgetTokens: 4096
      }
    ];

    const parsed = parseConfig(input);

    expect(parsed.runtime.providers[0]).toMatchObject({
      id: "openai-main",
      reasoningEffort: "medium"
    });
    expect(parsed.runtime.providers[1]).toMatchObject({
      id: "anthropic-main",
      thinkingBudgetTokens: 4096
    });
  });

  it("drops unsupported reasoning fields from openai-compatible providers", () => {
    const input = baseConfigInput();
    (input.runtime as any).providers = [
      {
        id: "compat-main",
        type: "openai-compatible",
        defaultModel: "gpt-4o-mini",
        reasoningEffort: "high",
        thinkingBudgetTokens: 4096
      }
    ];

    const parsed = parseConfig(input);
    expect(parsed.runtime.providers[0]).toMatchObject({
      id: "compat-main",
      type: "openai-compatible",
      defaultModel: "gpt-4o-mini"
    });
    expect("reasoningEffort" in parsed.runtime.providers[0]).toBe(false);
    expect("thinkingBudgetTokens" in parsed.runtime.providers[0]).toBe(false);
  });

  it("rejects invalid Anthropic thinking budgets", () => {
    const input = baseConfigInput();
    (input.runtime as any).providers = [
      {
        id: "anthropic-main",
        type: "anthropic",
        defaultModel: "claude-sonnet-4-6",
        thinkingBudgetTokens: 512
      }
    ];

    expect(() => parseConfig(input)).toThrow(/thinkingBudgetTokens/);
  });

  it("rejects invalid Telegram operator user IDs", () => {
    const input = baseConfigInput();
    (input.runtime as any).channels = [
      {
        id: "telegram-main",
        type: "telegram",
        enabled: true,
        settings: {
          botToken: "env:OPENASSIST_CHANNEL_TELEGRAM_MAIN_BOT_TOKEN",
          operatorUserIds: ["-123"]
        }
      }
    ];

    expect(() => parseConfig(input)).toThrow(/Telegram operator IDs must be positive numeric user IDs/);
  });

  it("accepts channel-specific approved operator IDs", () => {
    const input = baseConfigInput();
    (input.runtime as any).channels = [
      {
        id: "telegram-main",
        type: "telegram",
        enabled: true,
        settings: {
          botToken: "env:OPENASSIST_CHANNEL_TELEGRAM_MAIN_BOT_TOKEN",
          operatorUserIds: ["123456789"]
        }
      },
      {
        id: "discord-main",
        type: "discord",
        enabled: true,
        settings: {
          botToken: "env:OPENASSIST_CHANNEL_DISCORD_MAIN_BOT_TOKEN",
          operatorUserIds: ["123456789012345678"]
        }
      },
      {
        id: "whatsapp-main",
        type: "whatsapp-md",
        enabled: true,
        settings: {
          operatorUserIds: ["447700900123@s.whatsapp.net"]
        }
      }
    ];

    expect(() => parseConfig(input)).not.toThrow();
  });

  it("accepts Discord DM allow-lists and attachment limits", () => {
    const input = baseConfigInput();
    (input.runtime as any).attachments = {
      maxFilesPerMessage: 3,
      maxImageBytes: 9_000_000,
      maxDocumentBytes: 500_000,
      maxExtractedChars: 8000
    };
    (input.runtime as any).channels = [
      {
        id: "discord-main",
        type: "discord",
        enabled: true,
        settings: {
          botToken: "env:OPENASSIST_CHANNEL_DISCORD_MAIN_BOT_TOKEN",
          allowedDmUserIds: ["123456789012345678"]
        }
      }
    ];

    expect(() => parseConfig(input)).not.toThrow();
  });

  it("rejects Discord DM allow-lists on non-Discord channels", () => {
    const input = baseConfigInput();
    (input.runtime as any).channels = [
      {
        id: "telegram-main",
        type: "telegram",
        enabled: true,
        settings: {
          botToken: "env:OPENASSIST_CHANNEL_TELEGRAM_MAIN_BOT_TOKEN",
          allowedDmUserIds: ["123456789012345678"]
        }
      }
    ];

    expect(() => parseConfig(input)).toThrow(/allowedDmUserIds/);
  });

  it("rejects channel IDs that use reserved session delimiters", () => {
    const input = baseConfigInput();
    (input.runtime as any).channels = [
      {
        id: "telegram:main",
        type: "telegram",
        enabled: true,
        settings: {
          botToken: "env:OPENASSIST_CHANNEL_TELEGRAM_MAIN_BOT_TOKEN"
        }
      }
    ];

    expect(() => parseConfig(input)).toThrow(/Channel IDs must use letters, numbers, dot, dash, or underscore/);
  });
});
