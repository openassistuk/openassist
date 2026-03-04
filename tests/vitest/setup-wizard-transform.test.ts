import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  loadSetupWizardState,
  validateSetupWizardState
} from "../../apps/openassist-cli/src/lib/setup-wizard.js";
import { saveWizardState } from "../../apps/openassist-cli/src/lib/config-edit.js";

function tempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

describe("setup wizard state transforms", () => {
  it("produces a valid config after provider/channel/scheduler edits", () => {
    const root = tempDir("openassist-setup-wizard-");
    const configPath = path.join(root, "openassist.toml");
    const envPath = path.join(root, "openassistd.env");

    const state = loadSetupWizardState(configPath, envPath);
    state.config.runtime.providers.push({
      id: "anthropic-main",
      type: "anthropic",
      defaultModel: "claude-sonnet-4-5"
    });
    state.config.runtime.channels.push({
      id: "telegram-main",
      type: "telegram",
      enabled: true,
      settings: {
        botToken: "env:OPENASSIST_CHANNEL_TELEGRAM_MAIN_BOT_TOKEN",
        allowedChatIds: ["123"]
      }
    });
    state.env.OPENASSIST_CHANNEL_TELEGRAM_MAIN_BOT_TOKEN = "token";
    state.config.runtime.scheduler.tasks.push({
      id: "ops-summary",
      enabled: true,
      scheduleKind: "interval",
      intervalSec: 600,
      action: {
        type: "prompt",
        providerId: "anthropic-main",
        promptTemplate: "Summarize current status."
      },
      misfirePolicy: "catch-up-once"
    });

    validateSetupWizardState(state);
    const result = saveWizardState(configPath, envPath, state.config, state.env, {
      createBackup: false
    });
    expect(result.backupPath).toBeUndefined();
    expect(fs.existsSync(configPath)).toBe(true);
    expect(fs.existsSync(envPath)).toBe(true);
  });
});
