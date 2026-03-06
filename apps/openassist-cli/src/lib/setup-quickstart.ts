import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { OpenAssistConfig } from "@openassist/config";
import { SpawnCommandRunner } from "./command-runner.js";
import {
  loadWizardState,
  saveWizardState,
  toChannelSecretEnvVar,
  toProviderApiKeyEnvVar,
  toProviderOAuthClientSecretEnvVar,
  toWebBraveApiKeyEnvVar
} from "./config-edit.js";
import {
  deriveHealthProbeBaseUrls,
  preferredLocalHealthBaseUrl,
  waitForHealthy
} from "./health-check.js";
import { requestJson } from "./runtime-context.js";
import { createServiceManager, type ServiceManagerAdapter } from "./service-manager.js";
import { buildSetupSummary } from "./setup-summary.js";
import { type PromptAdapter, createInquirerPromptAdapter } from "./setup-wizard.js";
import { renderValidationIssues, validateSetupReadiness } from "./setup-validation.js";
import {
  isCountryCityTimezone,
  promptBindAddress,
  promptGeneratedIdentifier,
  promptIdentifier,
  promptInteger,
  promptOptionalInteger,
  promptOptionalTimezone,
  promptRequiredText,
  promptTimezone
} from "./prompt-validation.js";

type PolicyProfile = OpenAssistConfig["runtime"]["defaultPolicyProfile"];
type ProviderType = OpenAssistConfig["runtime"]["providers"][number]["type"];
type NtpPolicy = OpenAssistConfig["runtime"]["time"]["ntpPolicy"];
type MisfirePolicy = OpenAssistConfig["runtime"]["scheduler"]["defaultMisfirePolicy"];
type ProviderAuthMode = "api-key-only" | "oauth-only" | "api-key-and-oauth";

export interface SetupQuickstartOptions {
  configPath: string;
  envFilePath: string;
  installDir: string;
  allowIncomplete: boolean;
  skipService: boolean;
  requireTty?: boolean;
  preflightCommandChecks?: boolean;
}

export interface SetupQuickstartResult {
  saved: boolean;
  backupPath?: string;
  validationWarnings: number;
  validationErrors: number;
  serviceHealthOk: boolean;
  summary: string[];
  postSaveAborted?: boolean;
  postSaveError?: string;
}

export interface SetupQuickstartDependencies {
  createServiceManagerFn?: (runner: SpawnCommandRunner) => ServiceManagerAdapter;
  waitForHealthyFn?: typeof waitForHealthy;
  requestJsonFn?: typeof requestJson;
}

interface SetupQuickstartState {
  configPath: string;
  envFilePath: string;
  installDir: string;
  config: OpenAssistConfig;
  env: Record<string, string>;
  originalEnv: Record<string, string>;
  timezoneCandidate: string;
  timezoneConfirmed: boolean;
  confirmedTimezone?: string;
}

function stage(name: string, description?: string): void {
  console.log("");
  console.log("=".repeat(78));
  console.log(`[${name}]`);
  if (description) {
    console.log(`> ${description}`);
  }
}

function parseCsv(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function defaultProviderForType(type: ProviderType): { id: string; model: string; baseUrl?: string } {
  if (type === "anthropic") {
    return {
      id: "anthropic-main",
      model: "claude-sonnet-4-5"
    };
  }

  if (type === "openai-compatible") {
    return {
      id: "compat-main",
      model: "gpt-5.2",
      baseUrl: "http://127.0.0.1:11434/v1"
    };
  }

  return {
    id: "openai-main",
    model: "gpt-5.2"
  };
}

function providerSupportsOAuth(type: ProviderType): boolean {
  return type === "openai" || type === "anthropic";
}

const ENV_VAR_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

function hasNonEmptyEnvValue(env: Record<string, string>, key: string): boolean {
  const local = env[key];
  if (typeof local === "string" && local.trim().length > 0) {
    return true;
  }
  const inherited = process.env[key];
  return typeof inherited === "string" && inherited.trim().length > 0;
}

function parseCsvOptional(value: string): string[] | undefined {
  const values = parseCsv(value);
  return values.length > 0 ? values : undefined;
}

async function promptProviderOAuthConfig(
  prompts: PromptAdapter,
  provider: OpenAssistConfig["runtime"]["providers"][number],
  env: Record<string, string>
): Promise<OpenAssistConfig["runtime"]["providers"][number]["oauth"]> {
  const existing = provider.oauth;
  const secretEnvVarDefault = existing?.clientSecretEnv ?? toProviderOAuthClientSecretEnvVar(provider.id);

  console.log("");
  console.log("OAuth client setup (from provider developer app):");
  const authorizeUrl = await promptRequiredText(
    prompts,
    "OAuth authorize URL",
    existing?.authorizeUrl ?? ""
  );
  const tokenUrl = await promptRequiredText(prompts, "OAuth token URL", existing?.tokenUrl ?? "");
  const clientId = await promptRequiredText(prompts, "OAuth client ID", existing?.clientId ?? "");
  let clientSecretEnv = "";
  while (true) {
    const raw = await prompts.input(
      "OAuth client secret env var (blank = no client secret)",
      secretEnvVarDefault
    );
    const trimmed = raw.trim();
    if (trimmed.length === 0 || ENV_VAR_NAME_PATTERN.test(trimmed)) {
      clientSecretEnv = trimmed;
      break;
    }
    console.error("OAuth client secret env var must match [A-Za-z_][A-Za-z0-9_]*.");
  }
  const scopesInput = await prompts.input(
    "OAuth scopes (comma-separated, blank = provider default)",
    existing?.scopes?.join(",") ?? ""
  );
  const audienceInput = await prompts.input("OAuth audience (optional)", existing?.audience ?? "");

  const trimmedSecretEnv = clientSecretEnv.trim();
  if (trimmedSecretEnv.length > 0) {
    console.log(`Secret env var: ${trimmedSecretEnv}`);
    const setSecret = await prompts.confirm("Set OAuth client secret now?", false);
    if (setSecret) {
      const secretValue = await prompts.password(
        "OAuth client secret value (blank keeps current value)"
      );
      if (secretValue.trim().length > 0) {
        env[trimmedSecretEnv] = secretValue.trim();
      }
    }
  }

  const scopes = parseCsvOptional(scopesInput);

  return {
    authorizeUrl,
    tokenUrl,
    clientId,
    ...(trimmedSecretEnv.length > 0 ? { clientSecretEnv: trimmedSecretEnv } : {}),
    ...(scopes ? { scopes } : {}),
    ...(audienceInput.trim().length > 0 ? { audience: audienceInput.trim() } : {})
  };
}

function validateCsvIds(
  input: string,
  pattern: RegExp
): { ok: true; values: string[] } | { ok: false; invalid: string[] } {
  const values = parseCsv(input);
  const invalid = values.filter((value) => !pattern.test(value));
  if (invalid.length > 0) {
    return { ok: false, invalid };
  }
  return { ok: true, values };
}

async function promptValidatedCsvIds(
  prompts: PromptAdapter,
  message: string,
  initial: string,
  pattern: RegExp,
  errorHint: string
): Promise<string[]> {
  while (true) {
    const raw = await prompts.input(message, initial);
    const parsed = validateCsvIds(raw, pattern);
    if (parsed.ok) {
      return parsed.values;
    }
    console.error(`${errorHint}. Invalid entries: ${parsed.invalid.join(", ")}`);
  }
}

function upsertProvider(config: OpenAssistConfig, provider: OpenAssistConfig["runtime"]["providers"][number]): void {
  const index = config.runtime.providers.findIndex((item) => item.id === provider.id);
  if (index >= 0) {
    config.runtime.providers[index] = provider;
    return;
  }
  config.runtime.providers.push(provider);
}

function upsertChannel(config: OpenAssistConfig, channel: OpenAssistConfig["runtime"]["channels"][number]): void {
  const index = config.runtime.channels.findIndex((item) => item.id === channel.id);
  if (index >= 0) {
    config.runtime.channels[index] = channel;
    return;
  }
  config.runtime.channels.push(channel);
}

function upsertTask(
  config: OpenAssistConfig,
  task: OpenAssistConfig["runtime"]["scheduler"]["tasks"][number]
): void {
  const index = config.runtime.scheduler.tasks.findIndex((item) => item.id === task.id);
  if (index >= 0) {
    config.runtime.scheduler.tasks[index] = task;
    return;
  }
  config.runtime.scheduler.tasks.push(task);
}

function envDiff(before: Record<string, string>, after: Record<string, string>): string[] {
  const keys = new Set<string>([...Object.keys(before), ...Object.keys(after)]);
  return Array.from(keys)
    .filter((key) => before[key] !== after[key])
    .sort((a, b) => a.localeCompare(b));
}

function resolveRuntimePath(configPath: string, target: string): string {
  if (path.isAbsolute(target)) {
    return target;
  }
  return path.resolve(path.dirname(configPath), target);
}

async function runPreflight(
  state: SetupQuickstartState,
  options: SetupQuickstartOptions,
  dependencies: SetupQuickstartDependencies
): Promise<void> {
  stage("Preflight", "Checking tools, writable paths, and service manager readiness.");
  const nodeMajor = Number.parseInt(process.versions.node.split(".")[0] ?? "0", 10);
  if (!Number.isFinite(nodeMajor) || nodeMajor < 22) {
    throw new Error(`Node.js 22+ is required (found ${process.version}).`);
  }

  if (options.preflightCommandChecks !== false) {
    const runner = new SpawnCommandRunner();
    for (const command of ["git", "pnpm"]) {
      const result = await runner.run(command, ["--version"]);
      if (result.code !== 0) {
        throw new Error(`Required command is not available: ${command}`);
      }
    }
  }

  const writableTargets = [
    path.dirname(state.configPath),
    path.dirname(state.envFilePath),
    state.installDir,
    resolveRuntimePath(state.configPath, state.config.runtime.paths.dataDir),
    resolveRuntimePath(state.configPath, state.config.runtime.paths.logsDir),
    resolveRuntimePath(state.configPath, state.config.runtime.paths.skillsDir)
  ];
  for (const target of writableTargets) {
    fs.mkdirSync(target, { recursive: true });
    const probe = path.join(target, `.openassist-preflight-${process.pid}-${Date.now()}`);
    fs.writeFileSync(probe, "ok", "utf8");
    fs.rmSync(probe, { force: true });
  }

  if (!options.skipService) {
    const managerFactory = dependencies.createServiceManagerFn ?? createServiceManager;
    const manager = managerFactory(new SpawnCommandRunner());
    console.log(`Service manager: ${manager.kind}`);
  } else {
    console.log("Service manager: skipped (--skip-service)");
  }

  console.log(`Timezone candidate: ${state.timezoneCandidate}`);
  if (!isCountryCityTimezone(state.timezoneCandidate)) {
    console.log(
      "Timezone candidate is not Country/City. You will be prompted to pick a Country/City zone (for example America/New_York)."
    );
  }
  console.log("Preflight checks passed.");
}

async function configureRuntimeBase(state: SetupQuickstartState, prompts: PromptAdapter): Promise<void> {
  stage("Runtime", "Configure daemon bind address, policy profile, and local paths.");
  const runtime = state.config.runtime;
  runtime.bindAddress = await promptBindAddress(prompts, "Bind address", runtime.bindAddress);
  runtime.bindPort = await promptInteger(prompts, "Bind port", runtime.bindPort, {
    min: 1,
    max: 65535
  });
  runtime.defaultPolicyProfile = await prompts.select<PolicyProfile>(
    "Default policy profile",
    [
      { name: "restricted", value: "restricted" },
      { name: "operator", value: "operator" },
      { name: "full-root", value: "full-root" }
    ],
    runtime.defaultPolicyProfile
  );
  runtime.paths.dataDir = await promptRequiredText(prompts, "Data directory", runtime.paths.dataDir);
  runtime.paths.skillsDir = await promptRequiredText(prompts, "Skills directory", runtime.paths.skillsDir);
  runtime.paths.logsDir = await promptRequiredText(prompts, "Logs directory", runtime.paths.logsDir);
}

async function configureAssistantProfile(
  state: SetupQuickstartState,
  prompts: PromptAdapter
): Promise<void> {
  stage(
    "Assistant Profile",
    "Set assistant name, persona, and operator preferences for global main-agent memory."
  );
  const assistant = state.config.runtime.assistant;
  assistant.name = await promptRequiredText(prompts, "Assistant display name", assistant.name);
  assistant.persona = await promptRequiredText(prompts, "Assistant persona guidance", assistant.persona);
  assistant.operatorPreferences = await prompts.input(
    "Operator preferences memory (optional)",
    assistant.operatorPreferences ?? ""
  );
  assistant.promptOnFirstContact = await prompts.confirm(
    "Prompt first chat users with profile customization tips?",
    assistant.promptOnFirstContact
  );
}

async function promptProvider(
  prompts: PromptAdapter,
  existing?: OpenAssistConfig["runtime"]["providers"][number]
): Promise<OpenAssistConfig["runtime"]["providers"][number]> {
  const defaultType = existing?.type ?? "openai";
  const type = await prompts.select<ProviderType>(
    "Provider type",
    [
      { name: "openai", value: "openai" },
      { name: "anthropic", value: "anthropic" },
      { name: "openai-compatible", value: "openai-compatible" }
    ],
    defaultType
  );

  const suggested = defaultProviderForType(type);
  const providerId = await promptGeneratedIdentifier(
    prompts,
    "Provider name (display label, e.g. OpenAI Main)",
    existing?.id ?? suggested.id
  );
  console.log(`Internal provider ID: ${providerId}`);
  const defaultModel = await promptRequiredText(
    prompts,
    "Default model",
    existing?.defaultModel ?? suggested.model
  );
  const baseUrlInput = await prompts.input("Base URL (blank for default)", existing?.baseUrl ?? suggested.baseUrl ?? "");

  return {
    id: providerId,
    type,
    defaultModel,
    ...(baseUrlInput.trim().length > 0 ? { baseUrl: baseUrlInput.trim() } : {}),
    ...(existing?.oauth ? { oauth: existing.oauth } : {}),
    ...(existing?.metadata ? { metadata: existing.metadata } : {})
  };
}

async function configureProviderAuthentication(
  state: SetupQuickstartState,
  prompts: PromptAdapter,
  provider: OpenAssistConfig["runtime"]["providers"][number]
): Promise<void> {
  const apiKeyVar = toProviderApiKeyEnvVar(provider.id);
  const hasApiKey = hasNonEmptyEnvValue(state.env, apiKeyVar);
  const supportsOAuth = providerSupportsOAuth(provider.type);
  const canPromptInteractiveAuth = process.stdin.isTTY && process.stdout.isTTY;

  let authMode: ProviderAuthMode = "api-key-only";
  if (supportsOAuth && canPromptInteractiveAuth) {
    const defaultMode: ProviderAuthMode = provider.oauth
      ? hasApiKey
        ? "api-key-and-oauth"
        : "oauth-only"
      : "api-key-only";
    authMode = await prompts.select<ProviderAuthMode>(
      "Authentication mode",
      [
        { name: "API key only", value: "api-key-only" },
        { name: "OAuth account only", value: "oauth-only" },
        { name: "API key + OAuth account", value: "api-key-and-oauth" }
      ],
      defaultMode
    );
  } else if (supportsOAuth && provider.oauth) {
    authMode = hasApiKey ? "api-key-and-oauth" : "oauth-only";
  }

  if (supportsOAuth && authMode !== "api-key-only") {
    provider.oauth = await promptProviderOAuthConfig(prompts, provider, state.env);
    console.log(
      `OAuth can be linked after daemon startup with: openassist auth start --provider ${provider.id} --account default --open-browser`
    );
  } else {
    delete provider.oauth;
  }

  if (authMode === "oauth-only") {
    if (canPromptInteractiveAuth) {
      const clearApiKey = await prompts.confirm("Remove existing API key env var for this provider?", false);
      if (clearApiKey) {
        delete state.env[apiKeyVar];
      }
    }
    return;
  }

  console.log(`Secret env var: ${apiKeyVar}`);
  console.log("Paste full key then press Enter (masked input accepts long values).");
  const apiKey = await prompts.password(
    `Provider API key for ${provider.id} (blank keeps current value)`
  );
  if (apiKey.trim().length > 0) {
    state.env[apiKeyVar] = apiKey.trim();
  }
}

async function configureProviders(state: SetupQuickstartState, prompts: PromptAdapter): Promise<void> {
  stage(
    "Providers",
    "Configure model providers and authentication. Secrets are stored in the env file."
  );
  const existingDefault = state.config.runtime.providers.find(
    (provider) => provider.id === state.config.runtime.defaultProviderId
  );
  const configuredDefault = await promptProvider(prompts, existingDefault);
  await configureProviderAuthentication(state, prompts, configuredDefault);
  upsertProvider(state.config, configuredDefault);
  state.config.runtime.defaultProviderId = configuredDefault.id;

  while (await prompts.confirm("Add or update another provider?", false)) {
    const provider = await promptProvider(prompts);
    await configureProviderAuthentication(state, prompts, provider);
    upsertProvider(state.config, provider);
  }

  state.config.runtime.defaultProviderId = await prompts.select(
    "Choose default provider",
    state.config.runtime.providers.map((provider) => ({
      name: `${provider.id} (${provider.type})`,
      value: provider.id
    })),
    state.config.runtime.defaultProviderId
  );
}

function normalizeChannelSettings(
  settings: unknown
): Record<string, string | number | boolean | string[]> {
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
    return {};
  }
  return settings as Record<string, string | number | boolean | string[]>;
}

function printChannelGuidance(type: OpenAssistConfig["runtime"]["channels"][number]["type"]): void {
  console.log("");
  if (type === "telegram") {
    console.log("Telegram setup:");
    console.log("- Create a bot with @BotFather and copy the bot token.");
    console.log("- Add the bot to the chat/group where you want to use OpenAssist.");
    console.log("- Send one message in that chat, then capture the numeric chat ID.");
    console.log("- Default behavior is inline chat memory per chat/group (not per-message threads).");
    console.log("- Tip: @userinfobot can show user/chat IDs quickly.");
    return;
  }

  if (type === "discord") {
    console.log("Discord setup:");
    console.log("- Create a bot application in the Discord Developer Portal.");
    console.log("- Invite the bot to your server/channel with message permissions.");
    console.log("- Use channel IDs (Developer Mode) for allow-list filtering.");
    return;
  }

  console.log("WhatsApp setup:");
  console.log("- WhatsApp MD is marked experimental in V1.");
  console.log("- First startup will require QR login from a real WhatsApp account.");
}

async function configureSingleChannel(state: SetupQuickstartState, prompts: PromptAdapter): Promise<void> {
  const type = await prompts.select<OpenAssistConfig["runtime"]["channels"][number]["type"]>(
    "Channel type",
    [
      { name: "Telegram (Bot token + chat IDs)", value: "telegram" },
      { name: "Discord (Bot token + channel IDs)", value: "discord" },
      { name: "WhatsApp MD (experimental)", value: "whatsapp-md" }
    ],
    "telegram"
  );
  printChannelGuidance(type);

  const defaultId = `${type.replace(/[^a-z0-9-]/g, "")}-main`;
  const id = await promptGeneratedIdentifier(
    prompts,
    "Channel name (friendly label, e.g. Telegram Main)",
    defaultId
  );
  console.log(`System channel ID (auto-generated): ${id}`);
  const existing = state.config.runtime.channels.find((channel) => channel.id === id);
  const existingSettings = normalizeChannelSettings(existing?.settings);
  const enabled = await prompts.confirm("Enable this channel?", existing?.enabled ?? true);
  const settings: Record<string, string | number | boolean | string[]> = { ...existingSettings };

  if (type === "telegram" || type === "discord") {
    const tokenEnv = toChannelSecretEnvVar(id, "bot_token");
    const tokenLabel = type === "telegram" ? "Telegram bot token" : "Discord bot token";
    const shouldSetToken = await prompts.confirm(`Set or update ${tokenLabel.toLowerCase()} now?`, true);
    if (shouldSetToken) {
      console.log("Paste full token then press Enter (masked input accepts long values).");
      const token = await prompts.password(`${tokenLabel} value (blank removes current token)`);
      if (token.trim().length > 0) {
        state.env[tokenEnv] = token.trim();
        settings.botToken = `env:${tokenEnv}`;
      } else {
        delete state.env[tokenEnv];
        delete settings.botToken;
      }
    }

    if (type === "telegram") {
      console.log("Leave chat IDs blank to allow all chats this bot can access.");
      const allowed = await promptValidatedCsvIds(
        prompts,
        "Allowed Telegram chat IDs (comma separated numeric IDs; blank = allow all)",
        Array.isArray(settings.allowedChatIds) ? settings.allowedChatIds.join(",") : "",
        /^-?\d+$/,
        "Telegram chat IDs must be numeric (for example 123456789 or -1001234567890)"
      );
      settings.allowedChatIds = allowed;
      if (process.stdin.isTTY && process.stdout.isTTY) {
        settings.conversationMode = await prompts.select<"chat" | "chat-thread">(
          "Telegram conversation memory mode",
          [
            { name: "Inline per chat/group (recommended)", value: "chat" },
            { name: "Threaded by Telegram topic", value: "chat-thread" }
          ],
          typeof settings.conversationMode === "string" && settings.conversationMode === "chat-thread"
            ? "chat-thread"
            : "chat"
        );
        settings.responseMode = await prompts.select<"inline" | "reply-threaded">(
          "Telegram response style",
          [
            { name: "Inline bot replies (recommended)", value: "inline" },
            { name: "Reply to each incoming message", value: "reply-threaded" }
          ],
          typeof settings.responseMode === "string" && settings.responseMode === "reply-threaded"
            ? "reply-threaded"
            : "inline"
        );
      } else {
        settings.conversationMode =
          typeof settings.conversationMode === "string" && settings.conversationMode === "chat-thread"
            ? "chat-thread"
            : "chat";
        settings.responseMode =
          typeof settings.responseMode === "string" && settings.responseMode === "reply-threaded"
            ? "reply-threaded"
            : "inline";
      }
      delete settings.allowedChannelIds;
    } else {
      console.log("Leave channel IDs blank to allow all channels the bot can read.");
      const allowed = await promptValidatedCsvIds(
        prompts,
        "Allowed Discord channel IDs (comma separated numeric IDs; blank = allow all)",
        Array.isArray(settings.allowedChannelIds) ? settings.allowedChannelIds.join(",") : "",
        /^\d{5,30}$/,
        "Discord channel IDs should be numeric snowflakes"
      );
      settings.allowedChannelIds = allowed;
      delete settings.allowedChatIds;
    }
  } else {
    settings.mode = (
      await prompts.select(
        "WhatsApp mode",
        [
          { name: "production", value: "production" },
          { name: "experimental", value: "experimental" }
        ],
        (typeof settings.mode === "string" ? settings.mode : "production") as "production" | "experimental"
      )
    ) as string;
    settings.printQrInTerminal = await prompts.confirm(
      "Print QR code in terminal?",
      settings.printQrInTerminal !== false
    );
    settings.syncFullHistory = await prompts.confirm(
      "Sync full history?",
      settings.syncFullHistory === true
    );
    settings.maxReconnectAttempts = await promptInteger(
      prompts,
      "Max reconnect attempts",
      typeof settings.maxReconnectAttempts === "number" ? settings.maxReconnectAttempts : 10,
      { min: 0, max: 10_000 }
    );
    settings.reconnectDelayMs = await promptInteger(
      prompts,
      "Reconnect delay ms",
      typeof settings.reconnectDelayMs === "number" ? settings.reconnectDelayMs : 5000,
      { min: 100, max: 3_600_000 }
    );
  }

  upsertChannel(state.config, {
    id,
    type,
    enabled,
    settings
  });
}

async function configureChannels(state: SetupQuickstartState, prompts: PromptAdapter): Promise<void> {
  stage("Channels", "Configure Telegram/Discord/WhatsApp channels and access scopes.");
  const shouldConfigure = await prompts.confirm(
    "Configure messaging channels now?",
    state.config.runtime.channels.length > 0
  );
  if (!shouldConfigure) {
    return;
  }

  while (true) {
    const action = await prompts.select(
      "Channel setup",
      [
        { name: "Add or update channel", value: "upsert" },
        { name: "Remove channel", value: "remove" },
        { name: "Continue", value: "done" }
      ],
      "done"
    );

    if (action === "done") {
      return;
    }

    if (action === "upsert") {
      await configureSingleChannel(state, prompts);
      continue;
    }

    if (state.config.runtime.channels.length === 0) {
      console.log("No channels to remove.");
      continue;
    }
    const removeId = await prompts.select(
      "Select channel to remove",
      state.config.runtime.channels.map((channel) => ({ name: channel.id, value: channel.id }))
    );
    state.config.runtime.channels = state.config.runtime.channels.filter((channel) => channel.id !== removeId);
  }
}

async function maybeConfigureFirstTask(state: SetupQuickstartState, prompts: PromptAdapter): Promise<void> {
  const shouldCreate = await prompts.confirm(
    state.config.runtime.scheduler.tasks.length === 0
      ? "Create first scheduler task now?"
      : "Add or update a scheduler task now?",
    false
  );
  if (!shouldCreate) {
    return;
  }

  const taskId = await promptIdentifier(prompts, "Task ID", "ops-summary");

  const scheduleKind = await prompts.select<"cron" | "interval">(
    "Schedule kind",
    [
      { name: "cron", value: "cron" },
      { name: "interval", value: "interval" }
    ],
    "interval"
  );
  const misfirePolicy = await prompts.select<MisfirePolicy>(
    "Misfire policy",
    [
      { name: "catch-up-once", value: "catch-up-once" },
      { name: "skip", value: "skip" },
      { name: "backfill", value: "backfill" }
    ],
    state.config.runtime.scheduler.defaultMisfirePolicy
  );
  const timezone = await promptOptionalTimezone(
    prompts,
    "Task timezone override (blank for runtime default)",
    ""
  );
  const maxRuntimeSec = await promptOptionalInteger(prompts, "Max runtime seconds (blank for none)", {
    min: 1,
    max: 86_400
  });

  const actionType = await prompts.select<"prompt" | "skill">(
    "Task action type",
    [
      { name: "prompt", value: "prompt" },
      { name: "skill", value: "skill" }
    ],
    "prompt"
  );

  let action: OpenAssistConfig["runtime"]["scheduler"]["tasks"][number]["action"];
  if (actionType === "prompt") {
    const providerId = await prompts.input("Provider ID (blank = runtime default)", "");
    const model = await prompts.input("Model (blank = provider default)", "");
    const promptTemplate = await promptRequiredText(
      prompts,
      "Prompt template",
      "Provide a concise health and operations summary."
    );
    action = {
      type: "prompt",
      promptTemplate,
      ...(providerId.trim() ? { providerId: providerId.trim() } : {}),
      ...(model.trim() ? { model: model.trim() } : {})
    };
  } else {
    const skillId = await promptIdentifier(prompts, "Skill ID", "ops-audit");
    const entrypoint = await promptRequiredText(prompts, "Skill entrypoint", "scripts/run.mjs");
    action = {
      type: "skill",
      skillId,
      entrypoint
    };
  }

  const sendOutput = await prompts.confirm("Send task output to a channel?", false);
  const output = sendOutput
    ? {
        channelId: await prompts.input("Output channel ID"),
        conversationKey: await prompts.input("Output conversation key"),
        messageTemplate: await prompts.input(
          "Message template (blank uses raw result)",
          "Scheduled task {{taskId}} at {{scheduledFor}}:\n{{result}}"
        )
      }
    : undefined;

  const sharedFields = {
    id: taskId.trim(),
    enabled: true,
    action,
    misfirePolicy,
    ...(timezone ? { timezone } : {}),
    ...(typeof maxRuntimeSec === "number" && maxRuntimeSec > 0 ? { maxRuntimeSec } : {}),
    ...(output ? { output } : {})
  } as const;

  if (scheduleKind === "cron") {
    const cron = await promptRequiredText(prompts, "Cron expression", "0 */15 * * * *");
    upsertTask(state.config, {
      ...sharedFields,
      scheduleKind: "cron",
      cron
    });
    return;
  }

  const intervalSec = await promptInteger(prompts, "Interval seconds", 900, {
    min: 1,
    max: 31_536_000
  });
  upsertTask(state.config, {
    ...sharedFields,
    scheduleKind: "interval",
    intervalSec
  });
}

async function configureTimeAndScheduler(state: SetupQuickstartState, prompts: PromptAdapter): Promise<void> {
  stage("Time + Scheduler", "Set timezone, NTP policy, and scheduler defaults.");
  const runtimeTime = state.config.runtime.time;
  const runtimeScheduler = state.config.runtime.scheduler;

  const timezone = await promptTimezone(
    prompts,
    "Default timezone (Country/City)",
    runtimeTime.defaultTimezone ?? state.timezoneCandidate
  );
  runtimeTime.defaultTimezone = timezone;
  runtimeTime.ntpPolicy = await prompts.select<NtpPolicy>(
    "NTP policy",
    [
      { name: "warn-degrade", value: "warn-degrade" },
      { name: "hard-fail", value: "hard-fail" },
      { name: "off", value: "off" }
    ],
    runtimeTime.ntpPolicy
  );
  runtimeTime.ntpCheckIntervalSec = await promptInteger(
    prompts,
    "NTP check interval seconds",
    runtimeTime.ntpCheckIntervalSec,
    { min: 5, max: 86_400 }
  );
  runtimeTime.ntpMaxSkewMs = await promptInteger(prompts, "Max clock skew ms", runtimeTime.ntpMaxSkewMs, {
    min: 100,
    max: 3_600_000
  });
  runtimeTime.requireTimezoneConfirmation = await prompts.confirm(
    "Require timezone confirmation before scheduler starts?",
    runtimeTime.requireTimezoneConfirmation
  );

  const typed = await prompts.input(`Type '${timezone}' to confirm timezone (Country/City)`, "");
  state.timezoneConfirmed = typed.trim() === timezone;
  state.confirmedTimezone = state.timezoneConfirmed ? timezone : undefined;

  runtimeScheduler.enabled = await prompts.confirm("Enable scheduler?", runtimeScheduler.enabled);
  runtimeScheduler.tickIntervalMs = await promptInteger(
    prompts,
    "Scheduler tick interval ms",
    runtimeScheduler.tickIntervalMs,
    { min: 100, max: 60_000 }
  );
  runtimeScheduler.heartbeatIntervalSec = await promptInteger(
    prompts,
    "Scheduler heartbeat interval sec",
    runtimeScheduler.heartbeatIntervalSec,
    { min: 1, max: 3_600 }
  );
  runtimeScheduler.defaultMisfirePolicy = await prompts.select<MisfirePolicy>(
    "Default misfire policy",
    [
      { name: "catch-up-once", value: "catch-up-once" },
      { name: "skip", value: "skip" },
      { name: "backfill", value: "backfill" }
    ],
    runtimeScheduler.defaultMisfirePolicy
  );

  await maybeConfigureFirstTask(state, prompts);
}

async function configureToolsAndWeb(state: SetupQuickstartState, prompts: PromptAdapter): Promise<void> {
  stage(
    "Tools",
    "Configure autonomous tool defaults and native web search behavior for full-root sessions."
  );
  const web = state.config.tools.web;
  web.enabled = await prompts.confirm(
    "Enable native web tools for full-root sessions?",
    web.enabled
  );
  if (web.enabled) {
    web.searchMode = await prompts.select<typeof web.searchMode>(
      "Native web search mode",
      [
        {
          name: "hybrid (Brave API when configured, otherwise DuckDuckGo fallback)",
          value: "hybrid"
        },
        {
          name: "api-only (Brave API required)",
          value: "api-only"
        },
        {
          name: "fallback-only (DuckDuckGo HTML fallback only)",
          value: "fallback-only"
        }
      ],
      web.searchMode
    );

    const braveVar = toWebBraveApiKeyEnvVar();
    if (web.searchMode !== "fallback-only") {
      console.log(`Brave Search API env var: ${braveVar}`);
      const storeNow = await prompts.confirm(
        "Store Brave Search API key in env file now?",
        hasNonEmptyEnvValue(state.env, braveVar)
      );
      if (storeNow) {
        const key = await prompts.password(
          `Brave Search API key for ${braveVar} (blank keeps current value)`
        );
        if (key.trim().length > 0) {
          state.env[braveVar] = key.trim();
        }
      }
    }
  }
}

async function runValidationGate(
  state: SetupQuickstartState,
  prompts: PromptAdapter,
  options: SetupQuickstartOptions
): Promise<{ errors: number; warnings: number; aborted: boolean }> {
  stage("Validate", "Running schema and readiness checks.");
  while (true) {
    const validation = await validateSetupReadiness({
      config: state.config,
      env: state.env,
      configPath: state.configPath,
      envFilePath: state.envFilePath,
      installDir: state.installDir,
      skipService: options.skipService,
      timezoneConfirmed: state.timezoneConfirmed
    });

    if (validation.warnings.length > 0) {
      console.log("Warnings:");
      for (const line of renderValidationIssues(validation.warnings)) {
        console.log(`- ${line}`);
      }
    }

    if (validation.errors.length === 0) {
      console.log("Validation gate passed.");
      return { errors: 0, warnings: validation.warnings.length, aborted: false };
    }

    console.error("Validation gate failed:");
    for (const line of renderValidationIssues(validation.errors)) {
      console.error(`- ${line}`);
    }

    if (options.allowIncomplete) {
      const proceed = await prompts.confirm(
        "Continue anyway because --allow-incomplete is set?",
        false
      );
      if (proceed) {
        return {
          errors: validation.errors.length,
          warnings: validation.warnings.length,
          aborted: false
        };
      }
    }

    const action = await prompts.select(
      "Choose a section to fix before re-validating",
      [
        { name: "Runtime", value: "runtime" },
        { name: "Providers", value: "providers" },
        { name: "Channels", value: "channels" },
        { name: "Time + Scheduler", value: "time" },
        { name: "Tools", value: "tools" },
        { name: "Re-run validation", value: "retry" },
        { name: "Abort setup", value: "abort" }
      ],
      "providers"
    );

    if (action === "abort") {
      return {
        errors: validation.errors.length,
        warnings: validation.warnings.length,
        aborted: true
      };
    }
    if (action === "runtime") {
      await configureRuntimeBase(state, prompts);
      continue;
    }
    if (action === "providers") {
      await configureProviders(state, prompts);
      continue;
    }
    if (action === "channels") {
      await configureChannels(state, prompts);
      continue;
    }
    if (action === "time") {
      await configureTimeAndScheduler(state, prompts);
      continue;
    }
    if (action === "tools") {
      await configureToolsAndWeb(state, prompts);
      continue;
    }
  }
}

async function runServiceStep(
  state: SetupQuickstartState,
  options: SetupQuickstartOptions,
  prompts: PromptAdapter,
  dependencies: SetupQuickstartDependencies
): Promise<{ healthOk: boolean; aborted: boolean; errorMessage?: string }> {
  if (options.skipService) {
    return { healthOk: false, aborted: false };
  }

  const baseUrl = preferredLocalHealthBaseUrl(
    state.config.runtime.bindAddress,
    state.config.runtime.bindPort
  );
  const localWrapperCommand = `${path.join(os.homedir(), ".local", "bin", "openassist")} service status`;
  const directNodeCommand = `${process.execPath} ${path.join(
    state.installDir,
    "apps",
    "openassist-cli",
    "dist",
    "index.js"
  )} service status`;
  const healthProbeUrls = deriveHealthProbeBaseUrls(baseUrl);
  let lastServiceKind: ServiceManagerAdapter["kind"] | undefined;
  let lastRunner: SpawnCommandRunner | undefined;

  const maybeOfferOAuthAccountLink = async (healthyBaseUrl: string): Promise<void> => {
    const oauthCapableProviders = state.config.runtime.providers.filter(
      (provider) => providerSupportsOAuth(provider.type) && Boolean(provider.oauth)
    );
    if (oauthCapableProviders.length === 0) {
      return;
    }
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
      return;
    }

    console.log("");
    console.log("OAuth account linking is available for configured providers.");

    const linkNow = await prompts.confirm("Start OAuth account linking now?", false);
    if (!linkNow) {
      return;
    }

    const requestJsonFn = dependencies.requestJsonFn ?? requestJson;
    for (const provider of oauthCapableProviders) {
      const startThisProvider = await prompts.confirm(
        `Start OAuth login for provider ${provider.id}?`,
        true
      );
      if (!startThisProvider) {
        continue;
      }

      const response = await requestJsonFn(
        "POST",
        `${healthyBaseUrl}/v1/oauth/${encodeURIComponent(provider.id)}/start`,
        {
          accountId: "default",
          scopes: provider.oauth?.scopes ?? []
        }
      );

      if (response.status >= 400) {
        console.error(`OAuth start failed with status=${response.status}.`);
        continue;
      }

      const payload = response.data as { authorizationUrl?: string };
      console.log("");
      if (payload.authorizationUrl) {
        console.log(`Authorization URL:\n${payload.authorizationUrl}`);
      }
      console.log("After authorizing, run: openassist auth status --provider <provider-id> --base-url <daemon-base-url>");
    }
  };

  const attemptServiceStep = async (): Promise<void> => {
    const runner = new SpawnCommandRunner();
    lastRunner = runner;
    const managerFactory = dependencies.createServiceManagerFn ?? createServiceManager;
    const service = managerFactory(runner);
    lastServiceKind = service.kind;
    console.log(`Service manager: ${service.kind}`);
    console.log("Installing/updating service unit...");
    await service.install({
      installDir: state.installDir,
      configPath: state.configPath,
      envFilePath: state.envFilePath,
      repoRoot: state.installDir
    });
    console.log("Restarting daemon service...");
    await service.restart();
    console.log("Service restart command completed.");

    const waitForHealthyFn = dependencies.waitForHealthyFn ?? waitForHealthy;
    console.log(`Waiting for daemon health (up to 60s) via: ${healthProbeUrls.join(", ")}`);
    let lastProgressLog = 0;
    const health = await waitForHealthyFn(healthProbeUrls, 60_000, 2_000, (_result, attempt) => {
      if (attempt - lastProgressLog >= 5) {
        lastProgressLog = attempt;
        console.log(`Health check retry ${attempt}...`);
      }
    });
    if (!health.ok) {
      throw new Error(
        `Service restart succeeded but daemon health is failing (baseUrl=${health.baseUrl ?? baseUrl} status=${health.status} body=${health.bodyText})`
      );
    }
    const activeBaseUrl = health.baseUrl ?? baseUrl;

    if (state.config.runtime.time.requireTimezoneConfirmation && state.confirmedTimezone) {
      const requestJsonFn = dependencies.requestJsonFn ?? requestJson;
      const result = await requestJsonFn("POST", `${activeBaseUrl}/v1/time/timezone/confirm`, {
        timezone: state.confirmedTimezone
      });
      if (result.status >= 400) {
        throw new Error(`Timezone confirmation failed through daemon API (status=${result.status}).`);
      }
    }

    const requestJsonFn = dependencies.requestJsonFn ?? requestJson;
    const timeStatus = await requestJsonFn("GET", `${activeBaseUrl}/v1/time/status`);
    const schedulerStatus = await requestJsonFn("GET", `${activeBaseUrl}/v1/scheduler/status`);
    console.log(`Time status: ${JSON.stringify(timeStatus.data)}`);
    console.log(`Scheduler status: ${JSON.stringify(schedulerStatus.data)}`);
    await maybeOfferOAuthAccountLink(activeBaseUrl);
  };

  const troubleshootingLines = [
    "Inspect service state: openassist service status",
    "Inspect logs: openassist service logs --lines 200 --follow",
    "Open interactive controls: openassist service console",
    "Reload config via restart: openassist service reload",
    "Check daemon health: openassist service health",
    `If 'openassist' is not on PATH, use: ${localWrapperCommand}`,
    `Direct Node fallback: ${directNodeCommand}`,
    `Raw health endpoint: curl -fsS ${baseUrl}/v1/health`
  ];

  const printServiceDiagnostics = async (): Promise<void> => {
    if (!lastRunner || !lastServiceKind) {
      return;
    }
    if (process.platform === "win32") {
      return;
    }
    const diagnosticsCommands: Array<{ command: string; args: string[] }> =
      lastServiceKind === "systemd-system"
        ? [
            { command: "systemctl", args: ["status", "openassistd.service", "--no-pager"] },
            { command: "journalctl", args: ["-u", "openassistd.service", "-n", "120", "--no-pager"] }
          ]
        : lastServiceKind === "systemd-user"
          ? [
              { command: "systemctl", args: ["--user", "status", "openassistd.service", "--no-pager"] },
              { command: "journalctl", args: ["--user", "-u", "openassistd.service", "-n", "120", "--no-pager"] }
            ]
          : [
              {
                command: "launchctl",
                args: ["print", `gui/${String(process.getuid?.() ?? 0)}/ai.openassist.openassistd`]
              }
            ];

    for (const entry of diagnosticsCommands) {
      const result = await lastRunner.run(entry.command, entry.args);
      const combined = [result.stdout, result.stderr].filter((part) => part.trim().length > 0).join("\n").trim();
      if (!combined) {
        continue;
      }
      console.error(`--- ${entry.command} ${entry.args.join(" ")} ---`);
      console.error(combined.length > 8000 ? `${combined.slice(0, 8000)}\n...truncated...` : combined);
    }
  };

  let attempt = 1;
  while (true) {
    stage(`Service + Health (attempt ${attempt})`);
    try {
      await attemptServiceStep();
      return { healthOk: true, aborted: false };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Service + health step failed: ${message}`);
      await printServiceDiagnostics();
      for (const line of troubleshootingLines) {
        console.error(`- ${line}`);
      }

      const actionChoices: Array<{ name: string; value: "retry" | "skip" | "abort" }> = options.allowIncomplete
        ? [
            { name: "Retry checks", value: "retry" },
            { name: "Continue with saved config (skip checks)", value: "skip" },
            { name: "Abort quickstart", value: "abort" }
          ]
        : [
            { name: "Retry checks", value: "retry" },
            { name: "Abort quickstart", value: "abort" }
          ];
      const action = await prompts.select<"retry" | "skip" | "abort">(
        "Service and health checks failed. Choose next step",
        actionChoices,
        "retry"
      );
      if (action === "retry") {
        attempt += 1;
        continue;
      }
      if (action === "skip") {
        return { healthOk: false, aborted: false, errorMessage: message };
      }
      return { healthOk: false, aborted: true, errorMessage: message };
    }
  }
}

export function loadSetupQuickstartState(
  configPath: string,
  envFilePath: string,
  installDir: string
): SetupQuickstartState {
  const loaded = loadWizardState(configPath, envFilePath);
  const timezoneCandidate = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  return {
    configPath,
    envFilePath,
    installDir,
    config: loaded.config,
    env: loaded.env,
    originalEnv: { ...loaded.env },
    timezoneCandidate,
    timezoneConfirmed: false
  };
}

export async function runSetupQuickstart(
  state: SetupQuickstartState,
  options: SetupQuickstartOptions,
  prompts: PromptAdapter = createInquirerPromptAdapter(),
  dependencies: SetupQuickstartDependencies = {}
): Promise<SetupQuickstartResult> {
  if (options.requireTty !== false && (!process.stdin.isTTY || !process.stdout.isTTY)) {
    throw new Error("Interactive quickstart requires TTY.");
  }

  await runPreflight(state, options, dependencies);
  await configureRuntimeBase(state, prompts);
  if (options.requireTty !== false) {
    await configureAssistantProfile(state, prompts);
  }
  await configureProviders(state, prompts);
  await configureChannels(state, prompts);
  await configureTimeAndScheduler(state, prompts);
  if (options.requireTty !== false) {
    await configureToolsAndWeb(state, prompts);
  }

  const validationGate = await runValidationGate(state, prompts, options);
  if (validationGate.aborted || (validationGate.errors > 0 && !options.allowIncomplete)) {
    return {
      saved: false,
      validationWarnings: validationGate.warnings,
      validationErrors: validationGate.errors,
      serviceHealthOk: false,
      summary: ["Validation failed; setup aborted."],
      postSaveAborted: false
    };
  }

  stage("Apply", "Writing configuration and environment files.");
  const saveResult = saveWizardState(state.configPath, state.envFilePath, state.config, state.env, {
    createBackup: true
  });
  console.log(`Saved configuration to ${state.configPath}`);
  console.log(`Saved environment file to ${state.envFilePath}`);
  if (saveResult.backupPath) {
    console.log(`Backup created at ${saveResult.backupPath}`);
  }

  let serviceHealthOk = false;
  let postSaveAborted = false;
  let postSaveError: string | undefined;
  const localWrapperCommand = `${path.join(os.homedir(), ".local", "bin", "openassist")} service status`;
  const directNodeCommand = `${process.execPath} ${path.join(
    state.installDir,
    "apps",
    "openassist-cli",
    "dist",
    "index.js"
  )} service status`;
  if (!options.skipService) {
    const serviceOutcome = await runServiceStep(state, options, prompts, dependencies);
    serviceHealthOk = serviceOutcome.healthOk;
    postSaveAborted = serviceOutcome.aborted;
    postSaveError = serviceOutcome.errorMessage;
  }

  const summary = buildSetupSummary({
    configPath: state.configPath,
    envFilePath: state.envFilePath,
    backupPath: saveResult.backupPath,
    config: state.config,
    changedEnvKeys: envDiff(state.originalEnv, state.env),
    warningCount: validationGate.warnings,
    skippedService: options.skipService,
    healthOk: serviceHealthOk
  });
  summary.push(`- PATH fallback: ${localWrapperCommand}`);
  summary.push(`- Direct Node fallback: ${directNodeCommand}`);
  if (postSaveError) {
    summary.push(`- Service checks note: ${postSaveError}`);
  }
  if (postSaveAborted) {
    summary.push("- Service checks outcome: aborted by operator after save.");
  }

  return {
    saved: true,
    backupPath: saveResult.backupPath,
    validationWarnings: validationGate.warnings,
    validationErrors: validationGate.errors,
    serviceHealthOk,
    summary,
    postSaveAborted,
    ...(postSaveError ? { postSaveError } : {})
  };
}
