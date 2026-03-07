import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { OpenAssistConfig } from "@openassist/config";
import { SpawnCommandRunner } from "./command-runner.js";
import {
  loadWizardState,
  saveWizardState,
  toChannelSecretEnvVar,
  toProviderApiKeyEnvVar
} from "./config-edit.js";
import {
  deriveHealthProbeBaseUrls,
  preferredLocalHealthBaseUrl,
  waitForHealthy
} from "./health-check.js";
import { requestJson } from "./runtime-context.js";
import { createServiceManager, type ServiceManagerAdapter } from "./service-manager.js";
import {
  applySetupAccessModePreset,
  detectSetupAccessMode,
  getOperatorUserIds,
  operatorIdPromptConfig,
  setOperatorUserIds
} from "./setup-access.js";
import {
  buildLifecycleReport,
  groupValidationIssuesByLifecycleBucket,
  renderGroupedValidationBuckets,
  serviceHealthRecoveryLines,
  type LifecycleRepairBucketId
} from "./lifecycle-readiness.js";
import { buildSetupSummary } from "./setup-summary.js";
import { type PromptAdapter, createInquirerPromptAdapter } from "./setup-wizard.js";
import { validateSetupReadiness } from "./setup-validation.js";
import {
  isCountryCityTimezone,
  promptBindAddress,
  promptGeneratedIdentifier,
  promptInteger,
  promptRequiredText,
  promptTimezone
} from "./prompt-validation.js";

type ProviderType = OpenAssistConfig["runtime"]["providers"][number]["type"];

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
  guidanceShown: Record<string, boolean>;
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

async function maybeShowDetailedGuidance(
  state: SetupQuickstartState,
  prompts: PromptAdapter,
  key: string,
  reminder: string,
  lines: string[]
): Promise<void> {
  if (!state.guidanceShown[key]) {
    state.guidanceShown[key] = true;
    for (const line of lines) {
      console.log(line);
    }
    return;
  }

  console.log(reminder);
  const showAgain = await prompts.confirm("Show detailed help again?", false);
  if (!showAgain) {
    return;
  }
  for (const line of lines) {
    console.log(line);
  }
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
  stage("Runtime", "Confirm the local runtime defaults used for the first reply.");
  const runtime = state.config.runtime;
  console.log(`Current listen address: ${runtime.bindAddress}`);
  console.log(`Current listen port: ${runtime.bindPort}`);
  console.log(`Access mode kept for quickstart: ${detectSetupAccessMode(state.config) === "full-access" ? "Full access for approved operators" : "Standard mode"}`);
  console.log(`Data directory: ${runtime.paths.dataDir}`);
  console.log(`Logs directory: ${runtime.paths.logsDir}`);
  console.log(`Skills directory: ${runtime.paths.skillsDir}`);
  const keepDefaults = await prompts.confirm(
    "Use these runtime defaults for quickstart?",
    true
  );
  if (keepDefaults) {
    return;
  }

  runtime.bindAddress = await promptBindAddress(prompts, "Listen address", runtime.bindAddress);
  runtime.bindPort = await promptInteger(prompts, "Listen port", runtime.bindPort, {
    min: 1,
    max: 65535
  });
  console.log("Advanced access mode, path, scheduler, and native web settings stay in setup wizard.");
}

async function configureAssistantIdentity(state: SetupQuickstartState, prompts: PromptAdapter): Promise<void> {
  stage("Assistant Identity", "Choose what the main OpenAssist agent is called and how it should behave.");
  const assistant = state.config.runtime.assistant;
  assistant.name = await promptRequiredText(
    prompts,
    "Assistant name shown in chat",
    assistant.name
  );
  assistant.persona = await promptRequiredText(
    prompts,
    "Assistant character/persona guidance",
    assistant.persona
  );
  assistant.operatorPreferences = await prompts.input(
    "Ongoing objectives or preferences to keep in mind (optional)",
    assistant.operatorPreferences ?? ""
  );
  assistant.promptOnFirstContact = false;
  console.log("Quickstart will use this global assistant identity immediately.");
  console.log("The later first-chat identity reminder is disabled by default after quickstart. Use setup wizard or /profile force=true; ... if you want to change it later.");
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
  const supportsOAuth = providerSupportsOAuth(provider.type);

  console.log(`Secret env var: ${apiKeyVar}`);
  console.log("API key is the recommended quickstart auth path because it gets to a first reply fastest.");
  console.log("Paste full key then press Enter (masked input accepts long values).");
  const apiKey = await prompts.password(
    `Provider API key for ${provider.id} (blank keeps current value)`
  );
  if (apiKey.trim().length > 0) {
    state.env[apiKeyVar] = apiKey.trim();
  }
  if (supportsOAuth) {
    console.log(
      `If you configure OAuth later in setup wizard, start account linking with: openassist auth start --provider ${provider.id} --account default --open-browser`
    );
  }
}

async function configureProviders(state: SetupQuickstartState, prompts: PromptAdapter): Promise<void> {
  stage(
    "Primary Provider",
    "Choose the model provider that will answer the first chat reply."
  );
  await maybeShowDetailedGuidance(
    state,
    prompts,
    "provider",
    "Provider reminder: pick the provider that should answer the first reply and make sure its auth secret is ready.",
    [
      "Provider quickstart guidance:",
      "- API key is the fastest path to the first reply.",
      "- OAuth-capable providers can still be linked later after the daemon is healthy.",
      "- Add extra providers later with: openassist setup wizard"
    ]
  );
  const existingDefault = state.config.runtime.providers.find(
    (provider) => provider.id === state.config.runtime.defaultProviderId
  );
  const configuredDefault = await promptProvider(prompts, existingDefault);
  await configureProviderAuthentication(state, prompts, configuredDefault);
  upsertProvider(state.config, configuredDefault);
  state.config.runtime.defaultProviderId = configuredDefault.id;
}

function normalizeChannelSettings(
  settings: unknown
): Record<string, string | number | boolean | string[]> {
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
    return {};
  }
  return settings as Record<string, string | number | boolean | string[]>;
}

async function promptOperatorIdsForChannel(
  prompts: PromptAdapter,
  channel: OpenAssistConfig["runtime"]["channels"][number]
): Promise<string[]> {
  const promptConfig = operatorIdPromptConfig(channel.type);
  for (const line of promptConfig.guidance) {
    console.log(`- ${line}`);
  }

  while (true) {
    const values = await promptValidatedCsvIds(
      prompts,
      promptConfig.prompt,
      getOperatorUserIds(channel).join(","),
      promptConfig.pattern,
      promptConfig.errorHint
    );
    if (values.length > 0) {
      return values;
    }
    const nextStep = await prompts.select(
      "Full access needs at least one approved operator ID before quickstart can continue.",
      [
        { name: "Try entering operator IDs again", value: "retry" },
        { name: "Go back to standard mode", value: "standard" }
      ],
      "retry"
    );
    if (nextStep === "standard") {
      return [];
    }
  }
}

async function printChannelGuidance(
  state: SetupQuickstartState,
  prompts: PromptAdapter,
  type: OpenAssistConfig["runtime"]["channels"][number]["type"]
): Promise<void> {
  console.log("");
  if (type === "telegram") {
    await maybeShowDetailedGuidance(
      state,
      prompts,
      "channel.telegram",
      "Telegram reminder: you need the bot token and the chat IDs you want to allow.",
      [
        "Telegram setup:",
        "- Create a bot with @BotFather and copy the bot token.",
        "- Add the bot to the chat or group where you want to use OpenAssist.",
        "- Send one message in that chat, then capture the numeric chat ID.",
        "- Default behavior is inline chat memory per chat or group.",
        "- Telegram replies support readable formatting, images, and text-like document uploads.",
        "- Tip: @userinfobot can show user and chat IDs quickly."
      ]
    );
    return;
  }

  if (type === "discord") {
    await maybeShowDetailedGuidance(
      state,
      prompts,
      "channel.discord",
      "Discord reminder: you need the bot token plus the channel IDs or DM user IDs you want to allow.",
      [
        "Discord setup:",
        "- Create a bot application in the Discord Developer Portal.",
        "- Invite the bot to the server, channel, thread, or DM flow you want to use.",
        "- Use channel IDs from Developer Mode for server and thread allow-list filtering.",
        "- Use DM user IDs if you want to allow direct messages.",
        "- Discord replies preserve readable structure and support image and text-like attachment ingest."
      ]
    );
    return;
  }

  await maybeShowDetailedGuidance(
    state,
    prompts,
    "channel.whatsapp-md",
    "WhatsApp reminder: first startup still needs a QR login from a real WhatsApp account.",
    [
      "WhatsApp setup:",
      "- First startup requires QR login from a real WhatsApp account.",
      "- OpenAssist supports private chats and groups on this channel.",
      "- WhatsApp replies keep readable formatting and can ingest images and text-like documents."
    ]
  );
}

async function configureSingleChannel(state: SetupQuickstartState, prompts: PromptAdapter): Promise<void> {
  const existingPrimary =
    state.config.runtime.channels.find((channel) => channel.enabled) ??
    state.config.runtime.channels[0];
  const type = await prompts.select<OpenAssistConfig["runtime"]["channels"][number]["type"]>(
    "Channel type",
    [
      { name: "Telegram (bot token + chat IDs)", value: "telegram" },
      { name: "Discord (bot token + channel IDs or DM user IDs)", value: "discord" },
      { name: "WhatsApp MD (QR login + chats or groups)", value: "whatsapp-md" }
    ],
    existingPrimary?.type ?? "telegram"
  );
  await printChannelGuidance(state, prompts, type);

  const defaultId =
    existingPrimary?.type === type && existingPrimary.id
      ? existingPrimary.id
      : `${type.replace(/[^a-z0-9-]/g, "")}-main`;
  const id = await promptGeneratedIdentifier(
    prompts,
    "Channel name (friendly label, e.g. Telegram Main)",
    defaultId
  );
  console.log(`System channel ID (auto-generated): ${id}`);
  const existing = state.config.runtime.channels.find((channel) => channel.id === id);
  const existingSettings = normalizeChannelSettings(existing?.settings);
  const settings: Record<string, string | number | boolean | string[]> = { ...existingSettings };

  if (type === "telegram" || type === "discord") {
    const tokenEnv = toChannelSecretEnvVar(id, "bot_token");
    const tokenLabel = type === "telegram" ? "Telegram bot token" : "Discord bot token";
    console.log("Paste full token then press Enter (masked input accepts long values).");
    const token = await prompts.password(`${tokenLabel} value (blank keeps current value)`);
    if (token.trim().length > 0) {
      state.env[tokenEnv] = token.trim();
      settings.botToken = `env:${tokenEnv}`;
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
      settings.conversationMode =
        typeof settings.conversationMode === "string" && settings.conversationMode === "chat-thread"
          ? "chat-thread"
          : "chat";
      settings.responseMode =
        typeof settings.responseMode === "string" && settings.responseMode === "reply-threaded"
          ? "reply-threaded"
          : "inline";
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
      console.log("Leave DM user IDs blank to keep Discord direct messages disabled.");
      settings.allowedDmUserIds = await promptValidatedCsvIds(
        prompts,
        "Allowed Discord DM user IDs (comma separated numeric IDs; blank = disable DMs)",
        Array.isArray(settings.allowedDmUserIds) ? settings.allowedDmUserIds.join(",") : "",
        /^\d{5,30}$/,
        "Discord DM user IDs should be numeric snowflakes"
      );
      delete settings.allowedChatIds;
    }
  } else {
    settings.mode = typeof settings.mode === "string" ? settings.mode : "production";
    settings.printQrInTerminal = await prompts.confirm(
      "Print QR code in terminal?",
      settings.printQrInTerminal !== false
    );
    settings.syncFullHistory =
      typeof settings.syncFullHistory === "boolean" ? settings.syncFullHistory : false;
    settings.maxReconnectAttempts =
      typeof settings.maxReconnectAttempts === "number" ? settings.maxReconnectAttempts : 10;
    settings.reconnectDelayMs =
      typeof settings.reconnectDelayMs === "number" ? settings.reconnectDelayMs : 5000;
  }

  upsertChannel(state.config, {
    id,
    type,
    enabled: true,
    settings
  });
}

async function configureChannels(state: SetupQuickstartState, prompts: PromptAdapter): Promise<void> {
  stage("Primary Channel", "Configure the first chat destination that should receive replies.");
  await configureSingleChannel(state, prompts);
  console.log("Add extra channels or advanced channel behavior later with: openassist setup wizard");
}

async function configureAccessMode(state: SetupQuickstartState, prompts: PromptAdapter): Promise<void> {
  stage("Access Mode", "Choose whether approved operators should get full access automatically.");
  if (!state.guidanceShown.access) {
    state.guidanceShown.access = true;
    console.log("Access mode quickstart guidance:");
    console.log("- Standard mode is the default recommendation.");
    console.log("- Full access only applies to approved operator accounts on the enabled primary channel.");
    console.log("- Add or edit approved operator IDs later with: openassist setup wizard");
  } else {
    console.log("Access mode reminder: standard mode is the recommended default, and full access only applies to approved operator IDs.");
  }
  const primaryChannel = state.config.runtime.channels.find((channel) => channel.enabled);
  const currentMode = detectSetupAccessMode(state.config);
  console.log(
    `Current access mode: ${
      currentMode === "full-access"
        ? "Full access for approved operators"
        : currentMode === "custom"
          ? "Custom advanced access settings"
          : "Standard mode"
    }`
  );
  const enableFullAccess = await prompts.confirm(
    "Enable full access for approved operators?",
    false
  );

  if (!enableFullAccess) {
    applySetupAccessModePreset(state.config, "standard");
    console.log("Keeping standard mode. Approved operator IDs can be added later in setup wizard if you want in-chat /access controls.");
    return;
  }

  if (!primaryChannel) {
    throw new Error("Full access setup requires an enabled primary channel.");
  }

  const operatorIds = await promptOperatorIdsForChannel(prompts, primaryChannel);
  if (operatorIds.length === 0) {
    applySetupAccessModePreset(state.config, "standard");
    console.log("Switching back to standard mode. You can add approved operator IDs later in setup wizard.");
    return;
  }
  setOperatorUserIds(primaryChannel, operatorIds);
  applySetupAccessModePreset(state.config, "full-access");
  console.log(`Approved operator IDs saved for ${primaryChannel.id}. Only those senders will receive automatic full access in this channel.`);
}

async function configureTimeAndScheduler(state: SetupQuickstartState, prompts: PromptAdapter): Promise<void> {
  stage("Timezone", "Confirm the scheduler timezone used by this install.");
  if (!state.guidanceShown.timezone) {
    state.guidanceShown.timezone = true;
    console.log("Timezone quickstart guidance:");
    console.log("- Pick the real Country/City timezone you want OpenAssist scheduling to use.");
    console.log("- Server clocks can stay on UTC, but OpenAssist still needs the local scheduling timezone.");
    console.log("- Advanced scheduler tuning stays in setup wizard.");
  } else {
    console.log("Timezone reminder: quickstart still needs a Country/City timezone because scheduling and delayed work depend on it.");
  }
  const runtimeTime = state.config.runtime.time;

  const timezone = await promptTimezone(
    prompts,
    "Default timezone (Country/City)",
    runtimeTime.defaultTimezone ?? state.timezoneCandidate
  );
  runtimeTime.defaultTimezone = timezone;
  console.log(`Scheduler defaults kept for quickstart: enabled=${state.config.runtime.scheduler.enabled}, NTP policy=${runtimeTime.ntpPolicy}.`);

  if (!runtimeTime.requireTimezoneConfirmation) {
    state.timezoneConfirmed = true;
    state.confirmedTimezone = timezone;
    return;
  }

  state.timezoneConfirmed = await prompts.confirm(
    `Confirm timezone '${timezone}' before scheduler starts?`,
    true
  );
  state.confirmedTimezone = state.timezoneConfirmed ? timezone : undefined;
}

async function runQuickstartReviewStep(
  state: SetupQuickstartState,
  prompts: PromptAdapter,
  options: SetupQuickstartOptions
): Promise<"save" | "abort"> {
  while (true) {
    stage("Review", "Confirm the first-reply plan before OpenAssist writes files.");
    const reviewReport = buildLifecycleReport({
      installDir: state.installDir,
      configPath: state.configPath,
      envFilePath: state.envFilePath,
      installStatePresent: false,
      repoBacked: fs.existsSync(path.join(state.installDir, ".git")),
      configExists: true,
      envExists: true,
      config: state.config,
      trackedRef: "main",
      serviceWasSkipped: options.skipService,
      daemonBuildExists: fs.existsSync(path.join(state.installDir, "apps", "openassistd", "dist", "index.js")),
      hasNode: true
    });

    console.log(`First reply destination: ${reviewReport.context.firstReplyDestination}`);
    console.log(`Access mode: ${reviewReport.context.accessMode}`);
    console.log(
      `Service state after save: ${
        options.skipService
          ? "Quickstart will save config only and leave service setup for later (--skip-service)."
          : "Quickstart will install or restart the service and check daemon health."
      }`
    );
    console.log(`Timezone: ${state.config.runtime.time.defaultTimezone ?? state.timezoneCandidate}`);
    console.log("Advanced settings handoff: use 'openassist setup wizard' after the first reply path is working.");

    const action = await prompts.select<
      "save" | "runtime" | "identity" | "provider" | "channel" | "timezone" | "abort"
    >(
      "Review quickstart plan",
      [
        { name: "Save", value: "save" },
        { name: "Edit runtime", value: "runtime" },
        { name: "Edit assistant identity", value: "identity" },
        { name: "Edit provider", value: "provider" },
        { name: "Edit channel", value: "channel" },
        { name: "Edit timezone", value: "timezone" },
        { name: "Abort", value: "abort" }
      ],
      "save"
    );

    if (action === "save" || action === "abort") {
      return action;
    }
    if (action === "runtime") {
      await configureRuntimeBase(state, prompts);
      continue;
    }
    if (action === "identity") {
      await configureAssistantIdentity(state, prompts);
      continue;
    }
    if (action === "provider") {
      await configureProviders(state, prompts);
      continue;
    }
    if (action === "channel") {
      await configureChannels(state, prompts);
      continue;
    }
    await configureTimeAndScheduler(state, prompts);
  }
}

async function runValidationGate(
  state: SetupQuickstartState,
  prompts: PromptAdapter,
  options: SetupQuickstartOptions
): Promise<{ errors: number; warnings: number; aborted: boolean }> {
  stage("Validate", "Running schema and readiness checks.");
  const suppressedWarningCodes = new Set<string>([
    "tools.web_hybrid_fallback_only",
    "provider.oauth_client_secret_unset"
  ]);
  while (true) {
    const validation = await validateSetupReadiness({
      config: state.config,
      env: state.env,
      configPath: state.configPath,
      envFilePath: state.envFilePath,
      installDir: state.installDir,
      skipService: options.skipService,
      timezoneConfirmed: state.timezoneConfirmed,
      requireEnabledChannel: true
    });
    const visibleWarnings = validation.warnings.filter(
      (issue) => !suppressedWarningCodes.has(issue.code)
    );

    if (visibleWarnings.length > 0) {
      console.log("Needs attention later:");
      for (const line of renderGroupedValidationBuckets(groupValidationIssuesByLifecycleBucket(visibleWarnings))) {
        console.log(line);
      }
    }

    if (validation.errors.length === 0) {
      console.log("Validation gate passed.");
      return { errors: 0, warnings: visibleWarnings.length, aborted: false };
    }

    console.error("Needs action before first reply:");
    const errorBuckets = groupValidationIssuesByLifecycleBucket(validation.errors);
    for (const line of renderGroupedValidationBuckets(errorBuckets)) {
      console.error(line);
    }

    if (options.allowIncomplete) {
      const proceed = await prompts.confirm(
        "Continue anyway because --allow-incomplete is set?",
        false
      );
      if (proceed) {
        return {
          errors: validation.errors.length,
          warnings: visibleWarnings.length,
          aborted: false
        };
      }
    }

    const actionChoices = errorBuckets.map((bucket) => ({
      name: `Fix ${bucket.label.toLowerCase()}`,
      value: bucket.id
    }));
    const action = await prompts.select<LifecycleRepairBucketId | "retry" | "abort">(
      "Choose the area to repair before re-validating",
      [
        ...actionChoices,
        { name: "Re-run validation", value: "retry" },
        { name: "Abort setup", value: "abort" }
      ],
      actionChoices[0]?.value ?? "retry"
    );

    if (action === "abort") {
      return {
        errors: validation.errors.length,
        warnings: validation.warnings.length,
        aborted: true
      };
    }
    if (action === "provider-auth") {
      await configureProviders(state, prompts);
      continue;
    }
    if (action === "channel-auth-routing") {
      await configureChannels(state, prompts);
      continue;
    }
    if (action === "access-operator-ids") {
      await configureAccessMode(state, prompts);
      continue;
    }
    if (action === "timezone-time") {
      await configureTimeAndScheduler(state, prompts);
      continue;
    }
    if (action === "service-health") {
      const hasRuntimeEditableIssue = validation.errors.some(
        (issue) =>
          issue.code.startsWith("runtime.") ||
          issue.code.startsWith("paths.") ||
          issue.code.startsWith("config.")
      );
      if (hasRuntimeEditableIssue) {
        await configureRuntimeBase(state, prompts);
        continue;
      }

      console.error("Service or health problems usually need a shell, service-manager, or daemon fix outside quickstart.");
      for (const line of serviceHealthRecoveryLines(
        preferredLocalHealthBaseUrl(state.config.runtime.bindAddress, state.config.runtime.bindPort)
      )) {
        console.error(`- ${line}`);
      }
      if (!options.skipService) {
        console.error("- If you only want to save config for now, restart quickstart with --skip-service.");
      }
      const next = await prompts.select<"retry" | "abort">(
        "After fixing the service or health issue, what should quickstart do next?",
        [
          { name: "Re-run validation", value: "retry" },
          { name: "Abort setup", value: "abort" }
        ],
        "retry"
      );
      if (next === "abort") {
        return {
          errors: validation.errors.length,
          warnings: validation.warnings.length,
          aborted: true
        };
      }
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
    ...serviceHealthRecoveryLines(baseUrl),
    "Open interactive controls: openassist service console",
    "Reload config via restart: openassist service reload",
    `If 'openassist' is not on PATH, use: ${localWrapperCommand}`,
    `Direct Node fallback: ${directNodeCommand}`,
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
    timezoneConfirmed: false,
    guidanceShown: {}
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
  await configureAssistantIdentity(state, prompts);
  await configureProviders(state, prompts);
  await configureChannels(state, prompts);
  await configureAccessMode(state, prompts);
  await configureTimeAndScheduler(state, prompts);
  const reviewAction = await runQuickstartReviewStep(state, prompts, options);
  if (reviewAction === "abort") {
    return {
      saved: false,
      validationWarnings: 0,
      validationErrors: 0,
      serviceHealthOk: false,
      summary: ["Quickstart exited during review before saving."],
      postSaveAborted: false
    };
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
    installDir: state.installDir,
    configPath: state.configPath,
    envFilePath: state.envFilePath,
    backupPath: saveResult.backupPath,
    config: state.config,
    changedEnvKeys: envDiff(state.originalEnv, state.env),
    warningCount: validationGate.warnings,
    skippedService: options.skipService,
    healthOk: serviceHealthOk,
    postSaveError
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
