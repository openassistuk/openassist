import type { OpenAssistConfig } from "@openassist/config";
import { toProviderApiKeyEnvVar, toWebBraveApiKeyEnvVar } from "./config-edit.js";
import { detectSetupAccessMode, getOperatorUserIds } from "./setup-access.js";

function collectChannelEnvRefs(
  settings: Record<string, string | number | boolean | string[]>,
  refs: Set<string>
): void {
  for (const value of Object.values(settings)) {
    if (typeof value === "string" && value.startsWith("env:")) {
      refs.add(value.slice(4).trim());
      continue;
    }

    if (Array.isArray(value)) {
      for (const entry of value) {
        if (typeof entry === "string" && entry.startsWith("env:")) {
          refs.add(entry.slice(4).trim());
        }
      }
    }
  }
}

export interface SetupSummaryInput {
  configPath: string;
  envFilePath: string;
  backupPath?: string;
  config: OpenAssistConfig;
  changedEnvKeys: string[];
  warningCount: number;
  skippedService: boolean;
  healthOk: boolean;
}

export function buildSetupSummary(input: SetupSummaryInput): string[] {
  const envRefs = new Set<string>();
  for (const provider of input.config.runtime.providers) {
    envRefs.add(toProviderApiKeyEnvVar(provider.id));
  }
  if (input.config.tools.web.searchMode !== "fallback-only") {
    envRefs.add(toWebBraveApiKeyEnvVar());
  }
  for (const channel of input.config.runtime.channels) {
    collectChannelEnvRefs(channel.settings, envRefs);
  }

  const primaryChannel = input.config.runtime.channels.find((channel) => channel.enabled);
  const accessMode = detectSetupAccessMode(input.config);
  const primaryOperatorIds = getOperatorUserIds(primaryChannel);
  const firstReplyGuidance =
    primaryChannel?.type === "telegram"
      ? "Send a message in a Telegram chat where the bot was added, then run /status if you need diagnostics."
      : primaryChannel?.type === "discord"
        ? "Send a message in an allowed Discord channel, then run /status if you need diagnostics."
        : primaryChannel?.type === "whatsapp-md"
          ? `Run openassist channel qr --id ${primaryChannel.id} if QR login is still pending, then send a WhatsApp message.`
          : "Finish channel setup, then send a first test message and run /status if you need diagnostics.";

  const lines: string[] = [];
  lines.push("Quickstart complete");
  lines.push(`- Config saved: ${input.configPath}`);
  lines.push(`- Env file saved: ${input.envFilePath}`);
  if (input.backupPath) {
    lines.push(`- Backup: ${input.backupPath}`);
  }
  lines.push(`- Primary provider: ${input.config.runtime.defaultProviderId}`);
  lines.push(`- Primary channel: ${primaryChannel ? `${primaryChannel.id} (${primaryChannel.type})` : "(not configured)"}`);
  lines.push(
    `- Access mode: ${
      accessMode === "full-access"
        ? "Full access for approved operators"
        : accessMode === "custom"
          ? "Custom advanced access settings"
          : "Standard mode"
    }`
  );
  if (primaryChannel) {
    lines.push(`- Approved operator IDs on primary channel: ${primaryOperatorIds.join(", ") || "(none)"}`);
  }
  lines.push(`- Timezone: ${input.config.runtime.time.defaultTimezone ?? "(auto-detect)"}`);
  lines.push(
    `- Service status: ${
      input.skippedService ? "not checked yet (--skip-service)" : input.healthOk ? "healthy" : "needs attention"
    }`
  );
  lines.push(`- Env keys updated: ${input.changedEnvKeys.join(", ") || "(none)"}`);
  lines.push(`- Secret refs in config: ${Array.from(envRefs).sort().join(", ") || "(none)"}`);
  if (input.warningCount > 0) {
    lines.push(`- Validation warnings: ${input.warningCount}`);
  }
  lines.push("First reply checklist:");
  lines.push(`- ${firstReplyGuidance}`);
  lines.push("- In chat, run /status to see the exact sender ID and session ID for access troubleshooting.");
  if (accessMode === "full-access") {
    lines.push("- Approved operators will receive full access automatically in this channel. Use /access standard if you want to drop back to standard access for this chat.");
  } else {
    lines.push("- Standard mode is active. Add approved operator IDs later if you want to use /access full in chat.");
  }
  lines.push("- Verify daemon health: openassist service health");
  lines.push("- Check channel status if there is no reply: openassist channel status");
  lines.push("- Use the advanced editor for more settings: openassist setup wizard");

  return lines;
}
