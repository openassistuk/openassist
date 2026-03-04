import type { OpenAssistConfig } from "@openassist/config";
import { confirm as inqConfirm, input as inqInput, password as inqPassword, select as inqSelect } from "@inquirer/prompts";
import { parseConfig } from "@openassist/config";
import {
  loadWizardState,
  saveWizardState,
  toChannelSecretEnvVar,
  toProviderApiKeyEnvVar
} from "./config-edit.js";
import {
  promptBindAddress,
  promptGeneratedIdentifier,
  promptIdentifier,
  promptInteger,
  promptOptionalTimezone,
  promptRequiredText
} from "./prompt-validation.js";

export interface PromptChoice<T extends string = string> {
  name: string;
  value: T;
}

export interface PromptAdapter {
  input(message: string, initial?: string): Promise<string>;
  password(message: string, initial?: string): Promise<string>;
  confirm(message: string, initial?: boolean): Promise<boolean>;
  select<T extends string>(message: string, choices: PromptChoice<T>[], initial?: T): Promise<T>;
}

export interface SetupWizardState {
  configPath: string;
  envFilePath: string;
  config: OpenAssistConfig;
  env: Record<string, string>;
}

export function createInquirerPromptAdapter(): PromptAdapter {
  return {
    async input(message: string, initial = ""): Promise<string> {
      return inqInput({
        message,
        default: initial
      });
    },
    async password(message: string, initial = ""): Promise<string> {
      void initial;
      return inqPassword({
        message,
        // Show masked feedback so operators can confirm paste/typing occurred.
        mask: "*"
      });
    },
    async confirm(message: string, initial = true): Promise<boolean> {
      return inqConfirm({
        message,
        default: initial
      });
    },
    async select<T extends string>(message: string, choices: PromptChoice<T>[], initial?: T): Promise<T> {
      return inqSelect({
        message,
        choices: choices.map((choice) => ({
          name: choice.name,
          value: choice.value
        })),
        pageSize: 12,
        default: initial
      }) as Promise<T>;
    }
  };
}

function providerSupportsOAuth(type: OpenAssistConfig["runtime"]["providers"][number]["type"]): boolean {
  return type === "openai" || type === "anthropic";
}

function parseCsv(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
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

function printChannelGuidance(type: OpenAssistConfig["runtime"]["channels"][number]["type"]): void {
  console.log("");
  if (type === "telegram") {
    console.log("Telegram setup:");
    console.log("- Create bot token with @BotFather.");
    console.log("- Add the bot to your target chat/group and send one message.");
    console.log("- Add numeric chat IDs below (blank = allow all chats).");
    console.log("- Default behavior is inline memory per chat/group (not per-message threads).");
    console.log("- Tip: @userinfobot can help identify chat/user IDs.");
    return;
  }

  if (type === "discord") {
    console.log("Discord setup:");
    console.log("- Create bot in Discord Developer Portal and invite it.");
    console.log("- Add numeric channel IDs below (blank = allow all channels).");
    return;
  }

  console.log("WhatsApp setup:");
  console.log("- WhatsApp MD is experimental and requires QR login at first start.");
}

async function editRuntimeBasics(state: SetupWizardState, prompts: PromptAdapter): Promise<void> {
  const runtime = state.config.runtime;
  runtime.bindAddress = await promptBindAddress(prompts, "Runtime bind address", runtime.bindAddress);
  runtime.bindPort = await promptInteger(prompts, "Runtime bind port", runtime.bindPort, {
    min: 1,
    max: 65535
  });
  runtime.defaultPolicyProfile = await prompts.select(
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
  if (process.stdin.isTTY && process.stdout.isTTY) {
    runtime.assistant.name = await promptRequiredText(
      prompts,
      "Assistant display name",
      runtime.assistant.name
    );
    runtime.assistant.persona = await promptRequiredText(
      prompts,
      "Assistant persona guidance",
      runtime.assistant.persona
    );
    runtime.assistant.operatorPreferences = await prompts.input(
      "Operator preferences memory (optional)",
      runtime.assistant.operatorPreferences ?? ""
    );
    runtime.assistant.promptOnFirstContact = await prompts.confirm(
      "Prompt first chat users with profile customization tips?",
      runtime.assistant.promptOnFirstContact
    );
  }
}

async function addProvider(state: SetupWizardState, prompts: PromptAdapter): Promise<void> {
  const providerId = await promptGeneratedIdentifier(
    prompts,
    "Provider name (friendly label; internal ID is auto-generated, e.g. OpenAI Main)"
  );
  console.log(`Using internal provider ID: ${providerId}`);
  if (state.config.runtime.providers.some((provider) => provider.id === providerId)) {
    throw new Error(`Provider ${providerId} already exists`);
  }

  const providerType = await prompts.select(
    "Provider type",
    [
      { name: "openai", value: "openai" },
      { name: "anthropic", value: "anthropic" },
      { name: "openai-compatible", value: "openai-compatible" }
    ],
    "openai"
  );
  const defaultModel = await promptRequiredText(
    prompts,
    "Default model",
    providerType === "anthropic" ? "claude-sonnet-4-5" : "gpt-5.2"
  );
  const baseUrl = await prompts.input("Base URL (optional)", "");

  state.config.runtime.providers.push({
    id: providerId,
    type: providerType,
    defaultModel,
    ...(baseUrl ? { baseUrl } : {})
  });

  if (providerSupportsOAuth(providerType)) {
    console.log(
      `OAuth account login for ${providerType} is supported. If provider OAuth config is set, link with: openassist auth start --provider ${providerId} --account default --open-browser`
    );
  }

  const saveApiKey = await prompts.confirm("Store API key in env file now?", true);
  if (saveApiKey) {
    const varName = toProviderApiKeyEnvVar(providerId);
    console.log(`Secret env var: ${varName}`);
    console.log("Paste full key then press Enter (masked input accepts long values).");
    const key = await prompts.password("Provider API key (blank keeps unset)");
    if (key.trim().length > 0) {
      state.env[varName] = key.trim();
    }
  }

  if (!state.config.runtime.defaultProviderId) {
    state.config.runtime.defaultProviderId = providerId;
  }
}

async function editProvider(state: SetupWizardState, prompts: PromptAdapter): Promise<void> {
  if (state.config.runtime.providers.length === 0) {
    return;
  }

  const providerId = await prompts.select(
    "Select provider to edit",
    state.config.runtime.providers.map((provider) => ({ name: provider.id, value: provider.id }))
  );

  const provider = state.config.runtime.providers.find((candidate) => candidate.id === providerId);
  if (!provider) {
    return;
  }

  provider.defaultModel = await promptRequiredText(prompts, "Default model", provider.defaultModel);
  const baseUrl = await prompts.input("Base URL (blank to unset)", provider.baseUrl ?? "");
  if (baseUrl) {
    provider.baseUrl = baseUrl;
  } else {
    delete provider.baseUrl;
  }

  const updateApiKey = await prompts.confirm("Update API key in env file?", false);
  if (updateApiKey) {
    const varName = toProviderApiKeyEnvVar(provider.id);
    console.log(`Secret env var: ${varName}`);
    console.log("Paste full key then press Enter (masked input accepts long values).");
    const key = await prompts.password("Provider API key (blank to remove)");
    if (key.trim().length === 0) {
      delete state.env[varName];
    } else {
      state.env[varName] = key.trim();
    }
  }
}

async function removeProvider(state: SetupWizardState, prompts: PromptAdapter): Promise<void> {
  if (state.config.runtime.providers.length <= 1) {
    throw new Error("At least one provider is required");
  }

  const providerId = await prompts.select(
    "Select provider to remove",
    state.config.runtime.providers.map((provider) => ({ name: provider.id, value: provider.id }))
  );
  state.config.runtime.providers = state.config.runtime.providers.filter((provider) => provider.id !== providerId);
  if (state.config.runtime.defaultProviderId === providerId) {
    state.config.runtime.defaultProviderId = state.config.runtime.providers[0]?.id ?? "";
  }
}

async function setDefaultProvider(state: SetupWizardState, prompts: PromptAdapter): Promise<void> {
  if (state.config.runtime.providers.length === 0) {
    return;
  }
  state.config.runtime.defaultProviderId = await prompts.select(
    "Select default provider",
    state.config.runtime.providers.map((provider) => ({ name: provider.id, value: provider.id })),
    state.config.runtime.defaultProviderId
  );
}

async function editProviders(state: SetupWizardState, prompts: PromptAdapter): Promise<void> {
  while (true) {
    const action = await prompts.select(
      `Providers (${state.config.runtime.providers.map((provider) => provider.id).join(", ") || "none"})`,
      [
        { name: "Add provider", value: "add" },
        { name: "Edit provider", value: "edit" },
        { name: "Remove provider", value: "remove" },
        { name: "Set default provider", value: "default" },
        { name: "Back", value: "back" }
      ],
      "back"
    );

    if (action === "back") {
      return;
    }
    if (action === "add") {
      await addProvider(state, prompts);
      continue;
    }
    if (action === "edit") {
      await editProvider(state, prompts);
      continue;
    }
    if (action === "remove") {
      await removeProvider(state, prompts);
      continue;
    }
    await setDefaultProvider(state, prompts);
  }
}

function ensureChannelSettingsObject(value: unknown): Record<string, string | number | boolean | string[]> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, string | number | boolean | string[]>;
}

async function addChannel(state: SetupWizardState, prompts: PromptAdapter): Promise<void> {
  const channelId = await promptGeneratedIdentifier(
    prompts,
    "Channel name (friendly label; internal ID is auto-generated, e.g. Telegram Main)"
  );
  console.log(`System channel ID (auto-generated): ${channelId}`);
  if (state.config.runtime.channels.some((channel) => channel.id === channelId)) {
    throw new Error(`Channel ${channelId} already exists`);
  }

  const type = await prompts.select(
    "Channel type",
    [
      { name: "Telegram (bot token + chat IDs)", value: "telegram" },
      { name: "Discord (bot token + channel IDs)", value: "discord" },
      { name: "WhatsApp MD (experimental)", value: "whatsapp-md" }
    ],
    "telegram"
  );
  printChannelGuidance(type);

  const enabled = await prompts.confirm("Enable this channel?", true);
  const settings: Record<string, string | number | boolean | string[]> = {};

  if (type === "telegram") {
    const tokenEnv = toChannelSecretEnvVar(channelId, "bot_token");
    console.log("Paste full token then press Enter (masked input accepts long values).");
    const botToken = await prompts.password("Telegram bot token from @BotFather");
    if (botToken.trim().length > 0) {
      state.env[tokenEnv] = botToken.trim();
      settings.botToken = `env:${tokenEnv}`;
    }
    settings.allowedChatIds = await promptValidatedCsvIds(
      prompts,
      "Allowed Telegram chat IDs (comma separated numeric IDs; blank = allow all)",
      "",
      /^-?\d+$/,
      "Telegram chat IDs must be numeric (for example 123456789 or -1001234567890)"
    );
    if (process.stdin.isTTY && process.stdout.isTTY) {
      settings.conversationMode = await prompts.select<"chat" | "chat-thread">(
        "Telegram conversation memory mode",
        [
          { name: "Inline per chat/group (recommended)", value: "chat" },
          { name: "Threaded by Telegram topic", value: "chat-thread" }
        ],
        "chat"
      );
      settings.responseMode = await prompts.select<"inline" | "reply-threaded">(
        "Telegram response style",
        [
          { name: "Inline bot replies (recommended)", value: "inline" },
          { name: "Reply to each incoming message", value: "reply-threaded" }
        ],
        "inline"
      );
    } else {
      settings.conversationMode = "chat";
      settings.responseMode = "inline";
    }
  } else if (type === "discord") {
    const tokenEnv = toChannelSecretEnvVar(channelId, "bot_token");
    console.log("Paste full token then press Enter (masked input accepts long values).");
    const botToken = await prompts.password("Discord bot token");
    if (botToken.trim().length > 0) {
      state.env[tokenEnv] = botToken.trim();
      settings.botToken = `env:${tokenEnv}`;
    }
    settings.allowedChannelIds = await promptValidatedCsvIds(
      prompts,
      "Allowed Discord channel IDs (comma separated numeric IDs; blank = allow all)",
      "",
      /^\d{5,30}$/,
      "Discord channel IDs should be numeric snowflakes"
    );
  } else {
    settings.mode = (await prompts.confirm("Use experimental mode?", false)) ? "experimental" : "production";
    settings.printQrInTerminal = await prompts.confirm("Print QR code in terminal?", true);
    settings.syncFullHistory = await prompts.confirm("Sync full history?", false);
    settings.maxReconnectAttempts = await promptInteger(prompts, "Max reconnect attempts", 10, {
      min: 0,
      max: 10_000
    });
    settings.reconnectDelayMs = await promptInteger(prompts, "Reconnect delay (ms)", 5000, {
      min: 100,
      max: 3_600_000
    });
  }

  state.config.runtime.channels.push({
    id: channelId,
    type,
    enabled,
    settings
  });
}

async function editChannel(state: SetupWizardState, prompts: PromptAdapter): Promise<void> {
  if (state.config.runtime.channels.length === 0) {
    return;
  }
  const channelId = await prompts.select(
    "Select channel to edit",
    state.config.runtime.channels.map((channel) => ({ name: channel.id, value: channel.id }))
  );
  const channel = state.config.runtime.channels.find((candidate) => candidate.id === channelId);
  if (!channel) {
    return;
  }

  channel.enabled = await prompts.confirm("Enable this channel?", channel.enabled);
  const settings = ensureChannelSettingsObject(channel.settings);

  if (channel.type === "telegram") {
    printChannelGuidance("telegram");
    const tokenEnv = toChannelSecretEnvVar(channel.id, "bot_token");
    const updateToken = await prompts.confirm("Update Telegram bot token?", false);
    if (updateToken) {
      console.log("Paste full token then press Enter (masked input accepts long values).");
      const token = await prompts.password("Telegram bot token from @BotFather (blank to remove)");
      if (token.trim().length > 0) {
        state.env[tokenEnv] = token.trim();
        settings.botToken = `env:${tokenEnv}`;
      } else {
        delete state.env[tokenEnv];
        delete settings.botToken;
      }
    }
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
        settings.conversationMode === "chat-thread" ? "chat-thread" : "chat"
      );
      settings.responseMode = await prompts.select<"inline" | "reply-threaded">(
        "Telegram response style",
        [
          { name: "Inline bot replies (recommended)", value: "inline" },
          { name: "Reply to each incoming message", value: "reply-threaded" }
        ],
        settings.responseMode === "reply-threaded" ? "reply-threaded" : "inline"
      );
    } else {
      settings.conversationMode = settings.conversationMode === "chat-thread" ? "chat-thread" : "chat";
      settings.responseMode = settings.responseMode === "reply-threaded" ? "reply-threaded" : "inline";
    }
  } else if (channel.type === "discord") {
    printChannelGuidance("discord");
    const tokenEnv = toChannelSecretEnvVar(channel.id, "bot_token");
    const updateToken = await prompts.confirm("Update Discord bot token?", false);
    if (updateToken) {
      console.log("Paste full token then press Enter (masked input accepts long values).");
      const token = await prompts.password("Discord bot token (blank to remove)");
      if (token.trim().length > 0) {
        state.env[tokenEnv] = token.trim();
        settings.botToken = `env:${tokenEnv}`;
      } else {
        delete state.env[tokenEnv];
        delete settings.botToken;
      }
    }
    const allowed = await promptValidatedCsvIds(
      prompts,
      "Allowed Discord channel IDs (comma separated numeric IDs; blank = allow all)",
      Array.isArray(settings.allowedChannelIds) ? settings.allowedChannelIds.join(",") : "",
      /^\d{5,30}$/,
      "Discord channel IDs should be numeric snowflakes"
    );
    settings.allowedChannelIds = allowed;
  } else {
    settings.mode = (await prompts.confirm("Use experimental mode?", settings.mode === "experimental")) ? "experimental" : "production";
    settings.printQrInTerminal = await prompts.confirm(
      "Print QR code in terminal?",
      settings.printQrInTerminal !== false
    );
    settings.syncFullHistory = await prompts.confirm("Sync full history?", settings.syncFullHistory === true);
    settings.maxReconnectAttempts = await promptInteger(
      prompts,
      "Max reconnect attempts",
      Number(settings.maxReconnectAttempts ?? 10),
      { min: 0, max: 10_000 }
    );
    settings.reconnectDelayMs = await promptInteger(
      prompts,
      "Reconnect delay (ms)",
      Number(settings.reconnectDelayMs ?? 5000),
      { min: 100, max: 3_600_000 }
    );
  }

  channel.settings = settings;
}

async function removeChannel(state: SetupWizardState, prompts: PromptAdapter): Promise<void> {
  if (state.config.runtime.channels.length === 0) {
    return;
  }
  const channelId = await prompts.select(
    "Select channel to remove",
    state.config.runtime.channels.map((channel) => ({ name: channel.id, value: channel.id }))
  );
  state.config.runtime.channels = state.config.runtime.channels.filter((channel) => channel.id !== channelId);
}

async function editChannels(state: SetupWizardState, prompts: PromptAdapter): Promise<void> {
  while (true) {
    const action = await prompts.select(
      `Channels (${state.config.runtime.channels.map((channel) => channel.id).join(", ") || "none"})`,
      [
        { name: "Add channel", value: "add" },
        { name: "Edit channel", value: "edit" },
        { name: "Remove channel", value: "remove" },
        { name: "Back", value: "back" }
      ],
      "back"
    );

    if (action === "back") {
      return;
    }
    if (action === "add") {
      await addChannel(state, prompts);
      continue;
    }
    if (action === "edit") {
      await editChannel(state, prompts);
      continue;
    }
    await removeChannel(state, prompts);
  }
}

async function addSchedulerTask(state: SetupWizardState, prompts: PromptAdapter): Promise<void> {
  const taskId = await promptIdentifier(prompts, "Task ID");

  const scheduleKind = await prompts.select(
    "Schedule kind",
    [
      { name: "cron", value: "cron" },
      { name: "interval", value: "interval" }
    ],
    "interval"
  );

  const enabled = await prompts.confirm("Enable this task?", true);
  const timezone = await promptOptionalTimezone(
    prompts,
    "Task timezone override (Country/City, blank for runtime default)",
    ""
  );
  const misfirePolicy = await prompts.select(
    "Misfire policy",
    [
      { name: "catch-up-once", value: "catch-up-once" },
      { name: "skip", value: "skip" },
      { name: "backfill", value: "backfill" }
    ],
    state.config.runtime.scheduler.defaultMisfirePolicy
  );

  const actionType = await prompts.select(
    "Action type",
    [
      { name: "prompt", value: "prompt" },
      { name: "skill", value: "skill" }
    ],
    "prompt"
  );

  let action: OpenAssistConfig["runtime"]["scheduler"]["tasks"][number]["action"];
  if (actionType === "prompt") {
    const providerId = await prompts.input("Provider ID (blank uses runtime default)", "");
    const model = await prompts.input("Model (blank uses provider default)", "");
    const promptTemplate = await promptRequiredText(
      prompts,
      "Prompt template",
      "Provide a concise operations summary."
    );
    action = {
      type: "prompt",
      ...(providerId ? { providerId } : {}),
      ...(model ? { model } : {}),
      promptTemplate
    };
  } else {
    const skillId = await promptIdentifier(prompts, "Skill ID");
    const entrypoint = await promptRequiredText(prompts, "Skill entrypoint", "scripts/summarize.mjs");
    action = {
      type: "skill",
      skillId,
      entrypoint
    };
  }

  const outputEnabled = await prompts.confirm("Send task output to a channel?", false);
  const output = outputEnabled
    ? {
        channelId: await prompts.input("Output channel ID"),
        conversationKey: await prompts.input("Output conversation key"),
        messageTemplate: await prompts.input(
          "Message template (blank uses raw result)",
          "Scheduled task {{taskId}} at {{scheduledFor}}:\n{{result}}"
        )
      }
    : undefined;

  if (scheduleKind === "cron") {
    const cron = await promptRequiredText(prompts, "Cron expression", "0 */15 * * * *");
    state.config.runtime.scheduler.tasks.push({
      id: taskId,
      enabled,
      scheduleKind,
      cron,
      ...(timezone ? { timezone } : {}),
      misfirePolicy,
      action,
      ...(output ? { output } : {})
    });
    return;
  }

  const intervalSec = await promptInteger(prompts, "Interval (seconds)", 3600, {
    min: 1,
    max: 31_536_000
  });
  state.config.runtime.scheduler.tasks.push({
    id: taskId,
    enabled,
    scheduleKind,
    intervalSec,
    ...(timezone ? { timezone } : {}),
    misfirePolicy,
    action,
    ...(output ? { output } : {})
  });
}

async function removeSchedulerTask(state: SetupWizardState, prompts: PromptAdapter): Promise<void> {
  if (state.config.runtime.scheduler.tasks.length === 0) {
    return;
  }
  const taskId = await prompts.select(
    "Select task to remove",
    state.config.runtime.scheduler.tasks.map((task) => ({ name: task.id, value: task.id }))
  );
  state.config.runtime.scheduler.tasks = state.config.runtime.scheduler.tasks.filter((task) => task.id !== taskId);
}

async function editTimeAndScheduler(state: SetupWizardState, prompts: PromptAdapter): Promise<void> {
  const timezone = await promptOptionalTimezone(
    prompts,
    "Default timezone (Country/City, blank to unset)",
    state.config.runtime.time.defaultTimezone ?? ""
  );
  state.config.runtime.time.defaultTimezone = timezone;
  if (!timezone) {
    delete state.config.runtime.time.defaultTimezone;
  }
  state.config.runtime.time.ntpPolicy = await prompts.select(
    "NTP policy",
    [
      { name: "warn-degrade", value: "warn-degrade" },
      { name: "hard-fail", value: "hard-fail" },
      { name: "off", value: "off" }
    ],
    state.config.runtime.time.ntpPolicy
  );
  state.config.runtime.time.requireTimezoneConfirmation = await prompts.confirm(
    "Require timezone confirmation before scheduler starts?",
    state.config.runtime.time.requireTimezoneConfirmation
  );
  state.config.runtime.scheduler.enabled = await prompts.confirm(
    "Enable scheduler?",
    state.config.runtime.scheduler.enabled
  );
  state.config.runtime.scheduler.tickIntervalMs = await promptInteger(
    prompts,
    "Scheduler tick interval (ms)",
    state.config.runtime.scheduler.tickIntervalMs,
    { min: 100, max: 60_000 }
  );
  state.config.runtime.scheduler.heartbeatIntervalSec = await promptInteger(
    prompts,
    "Scheduler heartbeat interval (sec)",
    state.config.runtime.scheduler.heartbeatIntervalSec,
    { min: 1, max: 3_600 }
  );
  state.config.runtime.scheduler.defaultMisfirePolicy = await prompts.select(
    "Default misfire policy",
    [
      { name: "catch-up-once", value: "catch-up-once" },
      { name: "skip", value: "skip" },
      { name: "backfill", value: "backfill" }
    ],
    state.config.runtime.scheduler.defaultMisfirePolicy
  );

  while (true) {
    const action = await prompts.select(
      `Scheduler tasks (${state.config.runtime.scheduler.tasks.length})`,
      [
        { name: "Add task", value: "add" },
        { name: "Remove task", value: "remove" },
        { name: "Back", value: "back" }
      ],
      "back"
    );
    if (action === "back") {
      break;
    }
    if (action === "add") {
      await addSchedulerTask(state, prompts);
      continue;
    }
    await removeSchedulerTask(state, prompts);
  }
}

async function editToolsAndSecurity(state: SetupWizardState, prompts: PromptAdapter): Promise<void> {
  state.config.tools.fs.workspaceOnly = await prompts.confirm(
    "Filesystem tool workspace-only mode?",
    state.config.tools.fs.workspaceOnly
  );
  state.config.tools.exec.defaultTimeoutMs = await promptInteger(
    prompts,
    "Exec tool default timeout (ms)",
    state.config.tools.exec.defaultTimeoutMs,
    { min: 100, max: 3_600_000 }
  );
  state.config.security.auditLogEnabled = await prompts.confirm(
    "Enable audit logging?",
    state.config.security.auditLogEnabled
  );
  state.config.security.secretsBackend = "encrypted-file";
  console.log("Secrets backend is fixed to encrypted-file for secure cross-platform behavior.");
}

export function loadSetupWizardState(configPath: string, envFilePath: string): SetupWizardState {
  const loaded = loadWizardState(configPath, envFilePath);
  return {
    configPath,
    envFilePath,
    config: loaded.config,
    env: loaded.env
  };
}

export function validateSetupWizardState(state: SetupWizardState): void {
  parseConfig(state.config);
}

export async function runSetupWizard(
  state: SetupWizardState,
  prompts: PromptAdapter = createInquirerPromptAdapter(),
  options: { requireTty?: boolean } = {}
): Promise<{ saved: boolean; backupPath?: string }> {
  if (options.requireTty !== false && (!process.stdin.isTTY || !process.stdout.isTTY)) {
    throw new Error("Interactive wizard requires TTY");
  }

  while (true) {
    const action = await prompts.select(
      `Setup wizard (${state.configPath})`,
      [
        { name: "Runtime and paths", value: "runtime" },
        { name: "Providers", value: "providers" },
        { name: "Channels", value: "channels" },
        { name: "Time and scheduler", value: "time" },
        { name: "Tools and security", value: "tools" },
        { name: "Save and exit", value: "save" },
        { name: "Exit without saving", value: "exit" }
      ],
      "save"
    );

    if (action === "runtime") {
      await editRuntimeBasics(state, prompts);
      continue;
    }
    if (action === "providers") {
      await editProviders(state, prompts);
      continue;
    }
    if (action === "channels") {
      await editChannels(state, prompts);
      continue;
    }
    if (action === "time") {
      await editTimeAndScheduler(state, prompts);
      continue;
    }
    if (action === "tools") {
      await editToolsAndSecurity(state, prompts);
      continue;
    }
    if (action === "exit") {
      return { saved: false };
    }

    validateSetupWizardState(state);
    const saveResult = saveWizardState(state.configPath, state.envFilePath, state.config, state.env, {
      createBackup: true
    });
    return {
      saved: true,
      backupPath: saveResult.backupPath
    };
  }
}
