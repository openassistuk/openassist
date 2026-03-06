import fs from "node:fs";
import path from "node:path";
import TOML from "@iarna/toml";
import type { OpenAssistConfig } from "@openassist/config";
import { parseConfig } from "@openassist/config";
import { loadEnvFile, saveEnvFile } from "./env-file.js";

function ensureObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function defaultConfigObjectRaw(): Record<string, unknown> {
  return {
    runtime: {
      bindAddress: "127.0.0.1",
      bindPort: 3344,
      defaultProviderId: "openai-main",
      defaultPolicyProfile: "operator",
      assistant: {
        name: "OpenAssist",
        persona: "Pragmatic, concise, and execution-focused local AI assistant.",
        operatorPreferences: "",
        promptOnFirstContact: true
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
      providers: [
        {
          id: "openai-main",
          type: "openai",
          defaultModel: "gpt-5.2"
        }
      ],
      channels: [],
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
        defaultTimeoutMs: 60_000
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

export function createDefaultConfigObject(): OpenAssistConfig {
  return parseConfig(defaultConfigObjectRaw());
}

export function loadBaseConfigObject(configPath: string): OpenAssistConfig {
  if (!fs.existsSync(configPath)) {
    return createDefaultConfigObject();
  }

  const raw = TOML.parse(fs.readFileSync(configPath, "utf8"));
  return parseConfig(ensureObject(raw));
}

export function backupConfigFile(configPath: string): string | undefined {
  if (!fs.existsSync(configPath)) {
    return undefined;
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = `${configPath}.bak.${stamp}`;
  fs.copyFileSync(configPath, backupPath);
  return backupPath;
}

export function saveConfigObject(configPath: string, config: OpenAssistConfig): void {
  parseConfig(config);
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, TOML.stringify(config as any), "utf8");
}

export interface WizardLoadResult {
  config: OpenAssistConfig;
  env: Record<string, string>;
}

export function loadWizardState(configPath: string, envFilePath: string): WizardLoadResult {
  return {
    config: loadBaseConfigObject(configPath),
    env: loadEnvFile(envFilePath)
  };
}

export interface SaveWizardStateOptions {
  createBackup?: boolean;
}

export function saveWizardState(
  configPath: string,
  envFilePath: string,
  config: OpenAssistConfig,
  env: Record<string, string>,
  options: SaveWizardStateOptions = {}
): { backupPath?: string } {
  parseConfig(config);
  const backupPath = options.createBackup === false ? undefined : backupConfigFile(configPath);
  saveConfigObject(configPath, config);
  saveEnvFile(envFilePath, env, { ensureMode600: true });
  return { backupPath };
}

export function toProviderApiKeyEnvVar(providerId: string): string {
  return `OPENASSIST_PROVIDER_${providerId.toUpperCase().replace(/[^A-Z0-9]/g, "_")}_API_KEY`;
}

export function toWebBraveApiKeyEnvVar(): string {
  return "OPENASSIST_TOOLS_WEB_BRAVE_API_KEY";
}

export function toProviderOAuthClientSecretEnvVar(providerId: string): string {
  return `OPENASSIST_PROVIDER_${providerId.toUpperCase().replace(/[^A-Z0-9]/g, "_")}_OAUTH_CLIENT_SECRET`;
}

export function toChannelSecretEnvVar(channelId: string, name: string): string {
  const channelPart = channelId.toUpperCase().replace(/[^A-Z0-9]/g, "_");
  const namePart = name.toUpperCase().replace(/[^A-Z0-9]/g, "_");
  return `OPENASSIST_CHANNEL_${channelPart}_${namePart}`;
}
