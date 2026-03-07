import fs from "node:fs";
import path from "node:path";
import TOML from "@iarna/toml";
import type { OpenAssistConfig } from "@openassist/config";

export interface MigrationResult {
  config: OpenAssistConfig;
  warnings: string[];
  sourceFiles: string[];
}

function readMaybeJson(filePath: string): Record<string, unknown> | null {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as Record<string, unknown>;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function mapProviderType(name: string): "openai" | "anthropic" | "openai-compatible" {
  const lowered = name.toLowerCase();
  if (lowered.includes("anthropic") || lowered.includes("claude")) {
    return "anthropic";
  }
  if (lowered.includes("openai")) {
    return "openai";
  }
  return "openai-compatible";
}

function mapChannelType(name: string): "telegram" | "discord" | "whatsapp-md" | null {
  const lowered = name.toLowerCase();
  if (lowered.includes("telegram")) {
    return "telegram";
  }
  if (lowered.includes("discord")) {
    return "discord";
  }
  if (lowered.includes("whatsapp")) {
    return "whatsapp-md";
  }
  return null;
}

function toChannelSecretEnvVar(channelId: string, name: string): string {
  const channelPart = channelId.toUpperCase().replace(/[^A-Z0-9]/g, "_");
  const namePart = name.toUpperCase().replace(/[^A-Z0-9]/g, "_");
  return `OPENASSIST_CHANNEL_${channelPart}_${namePart}`;
}

function isSecretLikeSettingKey(key: string): boolean {
  return /(token|secret|api[_-]?key|password|passphrase|credential|authorization|auth)/i.test(
    key
  );
}

export function migrateOpenClawConfig(openClawRoot: string): MigrationResult {
  const warnings: string[] = [];
  const sourceFiles: string[] = [];

  const jsonConfigPath = path.join(openClawRoot, "openclaw.json");
  const jsonConfig = readMaybeJson(jsonConfigPath);
  if (!jsonConfig) {
    throw new Error(`Could not find OpenClaw config at ${jsonConfigPath}`);
  }
  sourceFiles.push(jsonConfigPath);

  const providersObject = asRecord(jsonConfig.providers ?? jsonConfig.models);
  const providerEntries = Object.entries(providersObject);

  const providers = providerEntries.length
    ? providerEntries.map(([id, value]) => {
        const record = asRecord(value);
        const baseUrl = typeof record.baseUrl === "string" ? record.baseUrl : undefined;
        return {
          id,
          type: mapProviderType(String(record.type ?? id)),
          defaultModel: typeof record.model === "string" ? record.model : "gpt-5.2",
          ...(baseUrl ? { baseUrl } : {})
        };
      })
    : [
        {
          id: "openai-main",
          type: "openai" as const,
          defaultModel: "gpt-5.2"
        }
      ];

  if (providerEntries.length === 0) {
    warnings.push("No providers found in OpenClaw config. Added default OpenAI provider stub.");
  }

  const channelsObject = asRecord(jsonConfig.channels);
  const channels = Object.entries(channelsObject)
    .map(([id, value]) => {
      const mappedType = mapChannelType(id);
      if (!mappedType) {
        warnings.push(`Channel ${id} is unsupported in OpenAssist V1 and was skipped.`);
        return null;
      }

      const record = asRecord(value);
      const settings: Record<string, string | number | boolean> = {};
      for (const [key, rawValue] of Object.entries(record)) {
        if (typeof rawValue === "string") {
          const trimmed = rawValue.trim();
          if (
            isSecretLikeSettingKey(key) &&
            trimmed.length > 0 &&
            !trimmed.startsWith("env:")
          ) {
            const envVar = toChannelSecretEnvVar(id, key);
            settings[key] = `env:${envVar}`;
            warnings.push(
              `Channel ${id} setting '${key}' was migrated to env reference env:${envVar}. ` +
                `Set ${envVar} in your env file before enabling this channel.`
            );
            continue;
          }
          settings[key] = rawValue;
          continue;
        }

        if (typeof rawValue === "number" || typeof rawValue === "boolean") {
          settings[key] = rawValue;
        }
      }

      return {
        id,
        type: mappedType,
        enabled: record.enabled !== false,
        settings
      };
    })
    .filter((channel): channel is NonNullable<typeof channel> => channel !== null);

  const config: OpenAssistConfig = {
    runtime: {
      bindAddress:
        typeof jsonConfig.gatewayBind === "string" ? String(jsonConfig.gatewayBind) : "127.0.0.1",
      bindPort:
        typeof jsonConfig.gatewayPort === "number" ? Number(jsonConfig.gatewayPort) : 3344,
      defaultProviderId: providers[0].id,
      providers,
      channels,
      defaultPolicyProfile: "operator",
      operatorAccessProfile: "operator",
      assistant: {
        name: "OpenAssist",
        persona: "Pragmatic, concise, and execution-focused local AI assistant.",
        operatorPreferences: "",
        promptOnFirstContact: true
      },
      attachments: {
        maxFilesPerMessage: 4,
        maxImageBytes: 10_000_000,
        maxDocumentBytes: 1_000_000,
        maxExtractedChars: 12_000
      },
      time: {
        ntpPolicy: "warn-degrade",
        ntpCheckIntervalSec: 300,
        ntpMaxSkewMs: 10_000,
        ntpHttpSources: [
          "https://www.google.com",
          "https://www.cloudflare.com",
          "https://www.microsoft.com"
        ],
        requireTimezoneConfirmation: true
      },
      scheduler: {
        enabled: true,
        tickIntervalMs: 1000,
        heartbeatIntervalSec: 30,
        defaultMisfirePolicy: "catch-up-once",
        tasks: []
      },
      paths: {
        dataDir: ".openassist/data",
        skillsDir: ".openassist/skills",
        logsDir: ".openassist/logs"
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

  return {
    config,
    warnings,
    sourceFiles
  };
}

export function writeMigratedConfig(outputPath: string, config: OpenAssistConfig): void {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, TOML.stringify(config as unknown as TOML.JsonMap), "utf8");
}
