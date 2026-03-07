import fs from "node:fs";
import path from "node:path";
import type { OpenAssistConfig } from "@openassist/config";
import { buildLifecycleReport } from "./lifecycle-readiness.js";

export interface SetupSummaryInput {
  installDir: string;
  configPath: string;
  envFilePath: string;
  backupPath?: string;
  config: OpenAssistConfig;
  changedEnvKeys: string[];
  warningCount: number;
  skippedService: boolean;
  healthOk: boolean;
  postSaveError?: string;
}

export function buildSetupSummary(input: SetupSummaryInput): string[] {
  const primaryChannel = input.config.runtime.channels.find((channel) => channel.enabled);
  const report = buildLifecycleReport({
    installDir: input.installDir,
    configPath: input.configPath,
    envFilePath: input.envFilePath,
    installStatePresent: true,
    repoBacked: fs.existsSync(path.join(input.installDir, ".git")),
    configExists: true,
    envExists: true,
    config: input.config,
    trackedRef: "main",
    serviceWasSkipped: input.skippedService,
    serviceHealthOk: input.healthOk,
    serviceHealthDetail: input.postSaveError,
    daemonBuildExists: fs.existsSync(path.join(input.installDir, "apps", "openassistd", "dist", "index.js")),
    hasNode: true
  });
  const firstReplyGuidance =
    primaryChannel?.type === "telegram"
      ? "Send a message in a Telegram chat where the bot was added, then run /status if you need diagnostics."
      : primaryChannel?.type === "discord"
        ? "Send a message in an allowed Discord channel, then run /status if you need diagnostics."
        : primaryChannel?.type === "whatsapp-md"
          ? `Run openassist channel qr --id ${primaryChannel.id} if QR login is still pending, then send a WhatsApp message.`
          : "Finish channel setup, then send a first test message and run /status if you need diagnostics.";

  const lines: string[] = [];
  lines.push("Quickstart saved");
  lines.push(`- First reply destination: ${report.context.firstReplyDestination}`);
  lines.push(`- Access mode: ${report.context.accessMode}`);
  lines.push(`- Service state: ${report.context.serviceState}`);
  lines.push(`- Assistant identity: ${input.config.runtime.assistant.name}`);
  lines.push(`- Timezone: ${input.config.runtime.time.defaultTimezone ?? "(auto-detect)"}`);
  lines.push("Ready now:");
  lines.push(`- Config saved: ${input.configPath}`);
  lines.push(`- Env file saved: ${input.envFilePath}`);
  if (input.backupPath) {
    lines.push(`- Backup: ${input.backupPath}`);
  }
  lines.push(`- Primary provider: ${input.config.runtime.defaultProviderId}`);
  lines.push(`- Primary channel: ${primaryChannel ? `${primaryChannel.id} (${primaryChannel.type})` : "(not configured)"}`);
  if (input.changedEnvKeys.length > 0) {
    lines.push(`- Updated env keys: ${input.changedEnvKeys.join(", ")}`);
  }
  if (input.warningCount > 0) {
    lines.push(`- Validation warnings: ${input.warningCount}`);
  }
  lines.push("First reply checklist:");
  lines.push(`- ${firstReplyGuidance}`);
  lines.push("- In chat, run /status to see the exact sender ID and session ID for access troubleshooting.");
  if (report.context.accessMode === "Full access for approved operators") {
    lines.push("- Approved operators will receive full access automatically in this channel. Use /access standard if you want to drop back to standard access for this chat.");
  } else {
    lines.push("- Standard mode is active. Add approved operator IDs later if you want to use /access full in chat.");
  }
  if (!input.skippedService) {
    lines.push("- Verify daemon health: openassist service health");
  }
  lines.push("- Check channel status if there is no reply: openassist channel status");
  lines.push("Advanced settings handoff:");
  lines.push("- Use the advanced editor for more settings: openassist setup wizard");
  lines.push("- Use /profile to inspect or intentionally update the global assistant identity later.");

  return lines;
}
