import fs from "node:fs";
import path from "node:path";
import TOML from "@iarna/toml";
import { parseConfig, type OpenAssistConfig } from "./schema.js";

export interface ConfigLoadResult {
  config: OpenAssistConfig;
  loadedFiles: string[];
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function mergeDeep(base: Record<string, unknown>, patch: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = { ...base };

  for (const [key, patchValue] of Object.entries(patch)) {
    const baseValue = result[key];
    if (isObject(baseValue) && isObject(patchValue)) {
      result[key] = mergeDeep(baseValue, patchValue);
      continue;
    }
    result[key] = patchValue;
  }

  return result;
}

function parseTomlFile(filePath: string): Record<string, unknown> {
  const content = fs.readFileSync(filePath, "utf8");
  const parsed = TOML.parse(content);
  if (!isObject(parsed)) {
    throw new Error(`Config file ${filePath} does not contain a TOML object`);
  }
  return parsed;
}

function resolveRawSecretsBackend(config: Record<string, unknown>): string | undefined {
  const security = config.security;
  if (!isObject(security)) {
    return undefined;
  }
  const secretsBackend = security.secretsBackend;
  if (typeof secretsBackend !== "string") {
    return undefined;
  }
  return secretsBackend.trim();
}

function assertSupportedSecretsBackend(config: Record<string, unknown>, loadedFiles: string[]): void {
  const secretsBackend = resolveRawSecretsBackend(config);
  if (!secretsBackend || secretsBackend === "encrypted-file") {
    return;
  }

  const filesText =
    loadedFiles.length > 0 ? loadedFiles.join(", ") : "configuration input";
  throw new Error(
    `Unsupported security.secretsBackend value '${secretsBackend}' in ${filesText}. ` +
      "Only 'encrypted-file' is supported."
  );
}

export interface ConfigPathOptions {
  baseFile?: string;
  overlaysDir?: string;
}

export function defaultConfigPaths(cwd = process.cwd()): ConfigPathOptions {
  return {
    baseFile: path.join(cwd, "openassist.toml"),
    overlaysDir: path.join(cwd, "config.d")
  };
}

export function loadConfig(options: ConfigPathOptions = defaultConfigPaths()): ConfigLoadResult {
  const loadedFiles: string[] = [];
  let merged: Record<string, unknown> = {};

  if (options.baseFile && fs.existsSync(options.baseFile)) {
    merged = mergeDeep(merged, parseTomlFile(options.baseFile));
    loadedFiles.push(options.baseFile);
  }

  if (options.overlaysDir && fs.existsSync(options.overlaysDir)) {
    const overlayFiles = fs
      .readdirSync(options.overlaysDir)
      .filter((file) => file.endsWith(".toml"))
      .sort()
      .map((file) => path.join(options.overlaysDir!, file));

    for (const filePath of overlayFiles) {
      merged = mergeDeep(merged, parseTomlFile(filePath));
      loadedFiles.push(filePath);
    }
  }

  assertSupportedSecretsBackend(merged, loadedFiles);
  const config = parseConfig(merged);
  return { config, loadedFiles };
}

export function writeDefaultConfig(filePath: string): void {
  const defaultObject = {
    runtime: {
      bindAddress: "127.0.0.1",
      bindPort: 3344,
      defaultProviderId: "openai-main",
      defaultPolicyProfile: "operator",
      operatorAccessProfile: "operator",
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
        defaultTimeoutMs: 60000,
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
        requestTimeoutMs: 15000,
        maxRedirects: 5,
        maxFetchBytes: 1000000,
        maxSearchResults: 8,
        maxPagesPerRun: 4
      }
    },
    security: {
      auditLogEnabled: true,
      secretsBackend: "encrypted-file"
    }
  };

  fs.writeFileSync(filePath, TOML.stringify(defaultObject), "utf8");
}
