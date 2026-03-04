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
          defaultModel: "gpt-5.2"
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
        defaultModel: "gpt-5.2",
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
});
