import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import type { OpenAssistConfig } from "@openassist/config";
import { parseConfig } from "@openassist/config";
import { SpawnCommandRunner } from "./command-runner.js";
import { toProviderApiKeyEnvVar, toWebBraveApiKeyEnvVar } from "./config-edit.js";
import { isValidBindAddress } from "./prompt-validation.js";
import { createServiceManager } from "./service-manager.js";
import { getOperatorUserIds } from "./setup-access.js";

export interface SetupValidationIssue {
  code: string;
  message: string;
  hint?: string;
}

export interface SetupValidationInput {
  config: OpenAssistConfig;
  env: Record<string, string>;
  configPath: string;
  envFilePath: string;
  installDir: string;
  skipService: boolean;
  timezoneConfirmed: boolean;
  requireEnabledChannel?: boolean;
}

export interface SetupValidationResult {
  errors: SetupValidationIssue[];
  warnings: SetupValidationIssue[];
  serviceManagerKind?: "systemd-user" | "systemd-system" | "launchd";
}

function pushIssue(
  target: SetupValidationIssue[],
  code: string,
  message: string,
  hint?: string
): void {
  target.push({ code, message, hint });
}

function hasEnvValue(env: Record<string, string>, varName: string): boolean {
  const local = env[varName];
  if (typeof local === "string" && local.trim().length > 0) {
    return true;
  }

  const current = process.env[varName];
  return typeof current === "string" && current.trim().length > 0;
}

function forEachEnvReference(
  settings: Record<string, string | number | boolean | string[]>,
  visit: (varName: string, keyPath: string) => void
): void {
  for (const [key, value] of Object.entries(settings)) {
    if (typeof value === "string") {
      if (value.startsWith("env:")) {
        visit(value.slice(4).trim(), key);
      }
      continue;
    }

    if (Array.isArray(value)) {
      value.forEach((entry, index) => {
        if (typeof entry === "string" && entry.startsWith("env:")) {
          visit(entry.slice(4).trim(), `${key}[${index}]`);
        }
      });
    }
  }
}

function validateWritablePath(targetPath: string): string | undefined {
  try {
    fs.mkdirSync(targetPath, { recursive: true });
    const probe = path.join(targetPath, `.openassist-write-probe-${process.pid}-${Date.now()}`);
    fs.writeFileSync(probe, "ok", "utf8");
    fs.rmSync(probe, { force: true });
    return undefined;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return message;
  }
}

async function checkPortAvailability(bindAddress: string, bindPort: number): Promise<string | undefined> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.unref();

    server.once("error", (error: NodeJS.ErrnoException) => {
      resolve(error.message);
    });

    server.listen(bindPort, bindAddress, () => {
      server.close(() => resolve(undefined));
    });
  });
}

function resolveRuntimePath(configPath: string, inputPath: string): string {
  if (path.isAbsolute(inputPath)) {
    return inputPath;
  }

  return path.resolve(path.dirname(configPath), inputPath);
}

function validateProviderRequirements(
  config: OpenAssistConfig,
  env: Record<string, string>,
  errors: SetupValidationIssue[],
  warnings: SetupValidationIssue[]
): void {
  const providerIds = new Set(config.runtime.providers.map((provider) => provider.id));
  if (!providerIds.has(config.runtime.defaultProviderId)) {
    pushIssue(
      errors,
      "provider.default_missing",
      `Default provider '${config.runtime.defaultProviderId}' does not exist.`,
      "Select a default provider that exists in runtime.providers."
    );
    return;
  }

  const defaultApiKeyVar = toProviderApiKeyEnvVar(config.runtime.defaultProviderId);
  if (!hasEnvValue(env, defaultApiKeyVar)) {
    const defaultProvider = config.runtime.providers.find((provider) => provider.id === config.runtime.defaultProviderId);
    if (defaultProvider?.oauth && (defaultProvider.type === "openai" || defaultProvider.type === "anthropic")) {
      pushIssue(
        warnings,
        "provider.default_oauth_pending",
        `Default provider '${config.runtime.defaultProviderId}' has OAuth configured but no API key env var ${defaultApiKeyVar}.`,
        `Complete account link after daemon startup: openassist auth start --provider ${config.runtime.defaultProviderId} --account default --open-browser`
      );
      return;
    }
    pushIssue(
      errors,
      "provider.default_auth_missing",
      `The primary provider '${config.runtime.defaultProviderId}' still needs an API key in ${defaultApiKeyVar}.`,
      "Set the API key in quickstart or setup env, then re-run validation."
    );
  }

  for (const provider of config.runtime.providers) {
    const oauth = provider.oauth;
    if (!oauth?.clientSecretEnv) {
      continue;
    }

    if (!hasEnvValue(env, oauth.clientSecretEnv)) {
      pushIssue(
        warnings,
        "provider.oauth_client_secret_unset",
        `Provider '${provider.id}' OAuth client secret env var ${oauth.clientSecretEnv} is not set.`,
        "Set the variable before running OAuth token exchange."
      );
    }
  }
}

function validateChannelRequirements(
  config: OpenAssistConfig,
  env: Record<string, string>,
  errors: SetupValidationIssue[],
  warnings: SetupValidationIssue[]
): void {
  for (const channel of config.runtime.channels) {
    if (!channel.enabled) {
      continue;
    }

    const settings = channel.settings;
    if (channel.type === "telegram") {
      const token = settings.botToken;
      if (typeof token !== "string" || token.trim().length === 0) {
        pushIssue(
          errors,
          "channel.telegram_token_missing",
          `Channel '${channel.id}' is enabled but telegram botToken is missing.`,
          "Set botToken to env:VAR and provide VAR in the env file."
        );
      }
    }

    if (channel.type === "discord") {
      const token = settings.botToken;
      if (typeof token !== "string" || token.trim().length === 0) {
        pushIssue(
          errors,
          "channel.discord_token_missing",
          `Channel '${channel.id}' is enabled but discord botToken is missing.`,
          "Set botToken to env:VAR and provide VAR in the env file."
        );
      }
    }

    forEachEnvReference(settings, (varName, keyPath) => {
      if (!hasEnvValue(env, varName)) {
        pushIssue(
          errors,
          "channel.env_ref_unresolved",
          `Channel '${channel.id}' references ${varName} at settings.${keyPath}, but it is not set.`,
          "Set the missing variable in the env file or process environment."
        );
      }
    });
  }

}

function validateChannelPresence(config: OpenAssistConfig, errors: SetupValidationIssue[]): void {
  const enabledChannels = config.runtime.channels.filter((channel) => channel.enabled);
  if (enabledChannels.length > 0) {
    return;
  }
  pushIssue(
    errors,
    "channel.enabled_required",
    "Quickstart needs one enabled chat channel so OpenAssist can deliver the first reply.",
    "Configure one Telegram, Discord, or WhatsApp channel before saving."
  );
}

function validateAccessModeRequirements(
  config: OpenAssistConfig,
  errors: SetupValidationIssue[],
  warnings: SetupValidationIssue[]
): void {
  if (config.runtime.operatorAccessProfile !== "full-root") {
    return;
  }

  const enabledChannels = config.runtime.channels.filter((channel) => channel.enabled);
  const enabledWithOperators = enabledChannels.filter((channel) => getOperatorUserIds(channel).length > 0);
  if (enabledWithOperators.length === 0) {
    pushIssue(
      errors,
      "access.operator_ids_required",
      "Full access mode needs at least one enabled channel with approved operator IDs.",
      "Add operator user IDs to the channel you want to use for full access, or switch back to standard mode."
    );
    return;
  }

  for (const channel of enabledChannels) {
    if (getOperatorUserIds(channel).length > 0) {
      continue;
    }
    pushIssue(
      warnings,
      "access.channel_operator_ids_missing",
      `Channel '${channel.id}' has no approved operator IDs, so chat-side /access changes stay unavailable there.`,
      "Add operator user IDs in setup wizard if you want full access controls in that channel."
    );
  }
}

function validateWebToolRequirements(
  config: OpenAssistConfig,
  env: Record<string, string>,
  errors: SetupValidationIssue[],
  warnings: SetupValidationIssue[]
): void {
  const web = config.tools.web;
  if (!web.enabled) {
    return;
  }

  const braveVar = toWebBraveApiKeyEnvVar();
  const braveConfigured = hasEnvValue(env, braveVar);
  if (web.searchMode === "api-only" && !braveConfigured) {
    pushIssue(
      errors,
      "tools.web_brave_api_key_missing",
      `tools.web.searchMode is 'api-only' but ${braveVar} is not set.`,
      `Set ${braveVar} in the env file or switch tools.web.searchMode to hybrid or fallback-only.`
    );
    return;
  }

  if (web.searchMode === "hybrid" && !braveConfigured) {
    pushIssue(
      warnings,
      "tools.web_hybrid_fallback_only",
      `tools.web.searchMode is 'hybrid' but ${braveVar} is not set, so web.search will use fallback mode.`,
      `Set ${braveVar} to enable Brave Search API while keeping fallback behavior available.`
    );
  }
}

function validateTimezoneConfirmation(
  config: OpenAssistConfig,
  timezoneConfirmed: boolean,
  errors: SetupValidationIssue[]
): void {
  if (config.runtime.time.requireTimezoneConfirmation && !timezoneConfirmed) {
    pushIssue(
      errors,
      "time.timezone_unconfirmed",
      "Timezone confirmation is required, but onboarding confirmation has not been completed.",
      "Re-run the Time stage and confirm the selected timezone when asked."
    );
  }
}

function validatePaths(
  config: OpenAssistConfig,
  configPath: string,
  envFilePath: string,
  installDir: string,
  errors: SetupValidationIssue[]
): void {
  const writableTargets = [
    path.dirname(configPath),
    path.dirname(envFilePath),
    installDir,
    resolveRuntimePath(configPath, config.runtime.paths.dataDir),
    resolveRuntimePath(configPath, config.runtime.paths.logsDir),
    resolveRuntimePath(configPath, config.runtime.paths.skillsDir)
  ];

  for (const target of writableTargets) {
    const issue = validateWritablePath(target);
    if (issue) {
      pushIssue(
        errors,
        "paths.not_writable",
        `Path is not writable: ${target}`,
        issue
      );
    }
  }
}

async function validateServiceReadiness(
  installDir: string,
  skipService: boolean,
  errors: SetupValidationIssue[]
): Promise<"systemd-user" | "systemd-system" | "launchd" | undefined> {
  if (skipService) {
    return undefined;
  }

  try {
    const manager = createServiceManager(new SpawnCommandRunner());
    if (manager.kind === "systemd-user") {
      const probe = await new SpawnCommandRunner().run("systemctl", ["--user", "show-environment"]);
      if (probe.code !== 0) {
        pushIssue(
          errors,
          "service.systemd_user_unavailable",
          "systemd --user is not available in the current shell/session.",
          "Use a non-root user with a login session, or run as root to use system-level systemd service."
        );
      }
    }
    const daemonEntrypoint = path.join(installDir, "apps", "openassistd", "dist", "index.js");
    if (!fs.existsSync(daemonEntrypoint)) {
      pushIssue(
        errors,
        "service.daemon_missing",
        `Service install expects daemon build output at ${daemonEntrypoint}.`,
        "Run bootstrap/build in the install directory before using quickstart service install."
      );
    }
    return manager.kind;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    pushIssue(
      errors,
      "service.unsupported_platform",
      "Service lifecycle is unsupported on this platform for the current OpenAssist release.",
      message
    );
    return undefined;
  }
}

export function renderValidationIssues(issues: SetupValidationIssue[]): string[] {
  return issues.map((issue) => {
    if (!issue.hint) {
      return issue.message;
    }
    return `${issue.message} Next step: ${issue.hint}`;
  });
}

export async function validateSetupReadiness(input: SetupValidationInput): Promise<SetupValidationResult> {
  const errors: SetupValidationIssue[] = [];
  const warnings: SetupValidationIssue[] = [];

  try {
    parseConfig(input.config);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    pushIssue(errors, "config.schema_invalid", `Schema validation failed: ${message}`);
    return { errors, warnings };
  }

  validateProviderRequirements(input.config, input.env, errors, warnings);
  validateChannelRequirements(input.config, input.env, errors, warnings);
  if (input.requireEnabledChannel) {
    validateChannelPresence(input.config, errors);
  }
  validateAccessModeRequirements(input.config, errors, warnings);
  validateWebToolRequirements(input.config, input.env, errors, warnings);
  validateTimezoneConfirmation(input.config, input.timezoneConfirmed, errors);
  validatePaths(input.config, input.configPath, input.envFilePath, input.installDir, errors);
  if (!isValidBindAddress(input.config.runtime.bindAddress)) {
    pushIssue(
      errors,
      "runtime.bind_address_invalid",
      `Bind address '${input.config.runtime.bindAddress}' is invalid.`,
      "Use a valid IP or hostname (for example 127.0.0.1, 0.0.0.0, localhost)."
    );
  }

  const portIssue = await checkPortAvailability(input.config.runtime.bindAddress, input.config.runtime.bindPort);
  if (portIssue) {
    pushIssue(
      errors,
      "runtime.port_unavailable",
      `Unable to bind ${input.config.runtime.bindAddress}:${input.config.runtime.bindPort}.`,
      portIssue
    );
  }

  const serviceManagerKind = await validateServiceReadiness(
    input.installDir,
    input.skipService,
    errors
  );

  return {
    errors,
    warnings,
    serviceManagerKind
  };
}
