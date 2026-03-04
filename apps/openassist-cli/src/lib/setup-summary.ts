import type { OpenAssistConfig } from "@openassist/config";
import { toProviderApiKeyEnvVar } from "./config-edit.js";

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
  for (const channel of input.config.runtime.channels) {
    collectChannelEnvRefs(channel.settings, envRefs);
  }

  const lines: string[] = [];
  lines.push("Quickstart summary");
  lines.push(`- Config: ${input.configPath}`);
  lines.push(`- Env file: ${input.envFilePath}`);
  if (input.backupPath) {
    lines.push(`- Backup: ${input.backupPath}`);
  }
  lines.push(`- Default provider: ${input.config.runtime.defaultProviderId}`);
  lines.push(`- Assistant name: ${input.config.runtime.assistant.name}`);
  lines.push(`- Providers: ${input.config.runtime.providers.map((item) => item.id).join(", ") || "(none)"}`);
  lines.push(`- Channels: ${input.config.runtime.channels.map((item) => item.id).join(", ") || "(none)"}`);
  lines.push(`- Scheduler tasks: ${input.config.runtime.scheduler.tasks.length}`);
  lines.push(`- Timezone: ${input.config.runtime.time.defaultTimezone ?? "(auto-detect)"}`);
  lines.push(`- Secret refs in config: ${Array.from(envRefs).sort().join(", ") || "(none)"}`);
  lines.push(`- Env keys changed in this run: ${input.changedEnvKeys.join(", ") || "(none)"}`);
  lines.push(`- Validation warnings: ${input.warningCount}`);
  lines.push(
    `- Service and health step: ${
      input.skippedService ? "skipped by option" : input.healthOk ? "completed" : "failed"
    }`
  );
  lines.push(
    "- Ops commands: openassist service console | openassist service status | openassist service reload | openassist service health"
  );
  lines.push("- OAuth commands: openassist auth start --provider <id> --account default --open-browser | openassist auth status");
  lines.push("- Setup commands: openassist setup quickstart | openassist setup wizard | openassist setup env");

  return lines;
}
