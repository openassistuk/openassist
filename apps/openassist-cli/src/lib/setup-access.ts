import type { OpenAssistConfig } from "@openassist/config";

export type SetupAccessMode = "standard" | "full-access" | "custom";

export interface OperatorIdPromptConfig {
  prompt: string;
  guidance: string[];
  pattern: RegExp;
  errorHint: string;
}

export function detectSetupAccessMode(config: OpenAssistConfig): SetupAccessMode {
  const standard =
    config.runtime.defaultPolicyProfile === "operator" &&
    config.runtime.operatorAccessProfile === "operator" &&
    config.tools.fs.workspaceOnly === true;
  if (standard) {
    return "standard";
  }

  const fullAccess =
    config.runtime.defaultPolicyProfile === "operator" &&
    config.runtime.operatorAccessProfile === "full-root" &&
    config.tools.fs.workspaceOnly === false;
  if (fullAccess) {
    return "full-access";
  }

  return "custom";
}

export function applySetupAccessModePreset(
  config: OpenAssistConfig,
  mode: Extract<SetupAccessMode, "standard" | "full-access">
): void {
  config.runtime.defaultPolicyProfile = "operator";
  config.runtime.operatorAccessProfile = mode === "full-access" ? "full-root" : "operator";
  config.tools.fs.workspaceOnly = mode !== "full-access";
}

export function getOperatorUserIds(
  channel: OpenAssistConfig["runtime"]["channels"][number] | undefined
): string[] {
  if (!channel) {
    return [];
  }
  const configured = channel.settings.operatorUserIds;
  return Array.isArray(configured)
    ? configured.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    : [];
}

export function setOperatorUserIds(
  channel: OpenAssistConfig["runtime"]["channels"][number],
  operatorUserIds: string[]
): void {
  channel.settings = {
    ...channel.settings,
    operatorUserIds
  };
}

export function operatorIdPromptConfig(
  channelType: OpenAssistConfig["runtime"]["channels"][number]["type"]
): OperatorIdPromptConfig {
  if (channelType === "telegram") {
    return {
      prompt: "Approved Telegram operator user IDs (comma separated positive numeric IDs)",
      guidance: [
        "Only these Telegram users can use /access full or receive automatic full access.",
        "Use @userinfobot or /status after standard setup to find the exact user ID."
      ],
      pattern: /^[1-9]\d*$/,
      errorHint: "Telegram operator IDs must be positive numeric user IDs"
    };
  }

  if (channelType === "discord") {
    return {
      prompt: "Approved Discord operator user IDs (comma separated numeric snowflakes)",
      guidance: [
        "Only these Discord users can use /access full or receive automatic full access.",
        "Use Discord Developer Mode or /status to copy the exact user ID."
      ],
      pattern: /^\d{5,30}$/,
      errorHint: "Discord operator IDs must be numeric snowflakes"
    };
  }

  return {
    prompt: "Approved WhatsApp operator sender IDs (comma separated exact sender IDs/JIDs)",
    guidance: [
      "Only these WhatsApp senders can use /access full or receive automatic full access.",
      "Use /status after standard setup to copy the exact sender ID/JID with no editing."
    ],
    pattern: /^\S+$/,
    errorHint: "WhatsApp operator IDs must match the exact non-empty sender ID/JID shown by /status"
  };
}
