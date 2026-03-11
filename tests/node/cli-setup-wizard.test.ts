import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import type { PromptAdapter } from "../../apps/openassist-cli/src/lib/setup-wizard.js";
import {
  loadSetupWizardState,
  runSetupWizard
} from "../../apps/openassist-cli/src/lib/setup-wizard.js";

function tempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

class ScriptedPromptAdapter implements PromptAdapter {
  private readonly queue: string[];

  constructor(answers: string[]) {
    this.queue = [...answers];
  }

  private next(): string {
    if (this.queue.length === 0) {
      throw new Error("No scripted answer available");
    }
    return this.queue.shift() ?? "";
  }

  async input(): Promise<string> {
    return this.next();
  }

  async password(): Promise<string> {
    return this.next();
  }

  async confirm(): Promise<boolean> {
    return this.next() === "true";
  }

  async select<T extends string>(): Promise<T> {
    return this.next() as T;
  }
}

describe("cli setup wizard", () => {
  it("saves default config and env through scripted prompts", async () => {
    const root = tempDir("openassist-cli-setup-");
    const configPath = path.join(root, "openassist.toml");
    const envPath = path.join(root, "openassistd.env");
    const state = loadSetupWizardState(configPath, envPath);
    const prompts = new ScriptedPromptAdapter([
      "save"
    ]);

    const result = await runSetupWizard(state, prompts, {
      requireTty: false
    });
    assert.equal(result.saved, true);
    assert.equal(fs.existsSync(configPath), true);
    assert.equal(fs.existsSync(envPath), true);
  });

  it("edits runtime/providers/channels/time/tools and persists output", async () => {
    const root = tempDir("openassist-cli-setup-expanded-");
    const configPath = path.join(root, "openassist.toml");
    const envPath = path.join(root, "openassistd.env");
    const state = loadSetupWizardState(configPath, envPath);
    const linuxSystemdAnswers = process.platform === "linux" ? ["hardened"] : [];
    const prompts = new ScriptedPromptAdapter([
      // Runtime
      "runtime",
      "127.0.0.1",
      "4455",
      "standard",
      ...linuxSystemdAnswers,
      path.join(root, "data"),
      path.join(root, "skills"),
      path.join(root, "logs"),
      // Providers
      "providers",
      "add",
      "anthropic-main",
      "anthropic",
      "claude-sonnet-4-6",
      "",
      "",
      "true",
      "anthropic-key",
      "default",
      "anthropic-main",
      "back",
      // Channels
      "channels",
      "add",
      "telegram-main",
      "telegram",
      "true",
      "telegram-token",
      "1001,1002",
      "",
      "back",
      // Time + scheduler
      "time",
      "Europe/London",
      "warn-degrade",
      "false",
      "true",
      "500",
      "10",
      "catch-up-once",
      "add",
      "ops-summary",
      "interval",
      "true",
      "",
      "catch-up-once",
      "prompt",
      "",
      "",
      "Provide status summary",
      "false",
      "300",
      "back",
      // Tools + security
      "tools",
      "true",
      "60000",
      "true",
      "false",
      // Save
      "save"
    ]);

    const result = await runSetupWizard(state, prompts, {
      requireTty: false
    });

    assert.equal(result.saved, true);
    assert.equal(state.config.runtime.bindPort, 4455);
    assert.equal(state.config.runtime.defaultProviderId, "anthropic-main");
    assert.equal(state.config.runtime.channels.length, 1);
    assert.equal(state.config.runtime.scheduler.tasks.length, 1);
    assert.equal(fs.existsSync(configPath), true);
    assert.equal(fs.existsSync(envPath), true);
  });

  it("supports remove and exit-without-saving branches", async () => {
    const root = tempDir("openassist-cli-setup-remove-");
    const configPath = path.join(root, "openassist.toml");
    const envPath = path.join(root, "openassistd.env");
    const state = loadSetupWizardState(configPath, envPath);

    // Pre-seed to make remove/edit paths valid.
    state.config.runtime.providers.push({
      id: "anthropic-main",
      type: "anthropic",
      defaultModel: "claude-sonnet-4-6"
    });
    state.config.runtime.channels.push({
      id: "discord-main",
      type: "discord",
      enabled: true,
      settings: {
        botToken: "env:OPENASSIST_CHANNEL_DISCORD_MAIN_BOT_TOKEN",
        allowedChannelIds: ["123456789012345678"]
      }
    });
    state.config.runtime.scheduler.tasks.push({
      id: "old-task",
      enabled: true,
      scheduleKind: "cron",
      cron: "0 */5 * * * *",
      action: {
        type: "skill",
        skillId: "shell-audit",
        entrypoint: "scripts/summarize.mjs"
      }
    });

    const prompts = new ScriptedPromptAdapter([
      // Providers remove
      "providers",
      "remove",
      "openai-main",
      "back",
      // Channels remove
      "channels",
      "remove",
      "discord-main",
      "back",
      // Scheduler remove
      "time",
      "",
      "warn-degrade",
      "true",
      "true",
      "1000",
      "30",
      "catch-up-once",
      "remove",
      "old-task",
      "back",
      // Exit without saving
      "exit"
    ]);

    const result = await runSetupWizard(state, prompts, {
      requireTty: false
    });

    assert.equal(result.saved, false);
    assert.equal(fs.existsSync(configPath), false);
    assert.equal(fs.existsSync(envPath), false);
    assert.equal(state.config.runtime.providers.some((item) => item.id === "openai-main"), false);
    assert.equal(state.config.runtime.channels.length, 0);
    assert.equal(state.config.runtime.scheduler.tasks.length, 0);
  });
});
