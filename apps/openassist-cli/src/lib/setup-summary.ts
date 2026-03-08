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
  const advancedSettingsHandoff = "Use openassist setup wizard after the first reply path is working.";

  const lines: string[] = [];
  lines.push("Quickstart saved");
  lines.push("Ready now");
  lines.push(`- First reply destination: ${report.context.firstReplyDestination}`);
  lines.push(`- Access mode: ${report.context.accessMode}`);
  lines.push(`- Service state: ${report.context.serviceState}`);
  lines.push(`- Assistant identity: ${input.config.runtime.assistant.name}`);
  lines.push(`- Timezone: ${input.config.runtime.time.defaultTimezone ?? "(auto-detect)"}`);
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
  lines.push(`- First reply checklist: ${firstReplyGuidance}`);
  lines.push(`- Advanced settings handoff: ${advancedSettingsHandoff}`);
  lines.push("Needs action");
  if (input.warningCount > 0) {
    lines.push(`- Validation warnings: ${input.warningCount}`);
  }
  if (report.context.accessMode === "Full access for approved operators") {
    lines.push("- In chat, run /status to confirm the exact sender ID and session ID for approved-operator checks.");
  }
  if (input.skippedService) {
    lines.push(
      `- Service install and health checks were skipped. Next step: openassist service install --install-dir "${input.installDir}" --config "${input.configPath}" --env-file "${input.envFilePath}"`
    );
  } else if (!input.healthOk && input.postSaveError) {
    lines.push(`- Service or health checks still need attention. Next step: openassist service health`);
  } else {
    lines.push("- None.");
  }
  lines.push("Next command");
  if (input.skippedService) {
    lines.push(
      `- openassist service install --install-dir "${input.installDir}" --config "${input.configPath}" --env-file "${input.envFilePath}"`
    );
  } else {
    lines.push("- openassist doctor");
  }

  return lines;
}
