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

function linuxOnlyAnswers(answers: string[]): string[] {
  return process.platform === "linux" ? answers : [];
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

  it("re-prompts invalid runtime inputs instead of silently coercing them", async () => {
    const root = tempDir("openassist-cli-setup-runtime-reprompt-");
    const configPath = path.join(root, "openassist.toml");
    const envPath = path.join(root, "openassistd.env");
    const state = loadSetupWizardState(configPath, envPath);

    const result = await runSetupWizard(
      state,
      new ScriptedPromptAdapter([
        "runtime",
        "bad host ???",
        "127.0.0.1",
        "not-port",
        "3344",
        "standard",
        ...linuxOnlyAnswers(["hardened"]),
        path.join(root, "data"),
        path.join(root, "skills"),
        path.join(root, "logs"),
        "save"
      ]),
      { requireTty: false }
    );

    assert.equal(result.saved, true);
    assert.equal(state.config.runtime.bindAddress, "127.0.0.1");
    assert.equal(state.config.runtime.bindPort, 3344);
  });

  it("re-prompts invalid telegram chat ids and preserves the numeric allow-list", async () => {
    const root = tempDir("openassist-cli-setup-telegram-chatids-");
    const configPath = path.join(root, "openassist.toml");
    const envPath = path.join(root, "openassistd.env");
    const state = loadSetupWizardState(configPath, envPath);

    const result = await runSetupWizard(
      state,
      new ScriptedPromptAdapter([
        "channels",
        "add",
        "telegram-main",
        "telegram",
        "true",
        "telegram-token",
        "abc,123",
        "123,-1001234567890",
        "",
        "back",
        "save"
      ]),
      { requireTty: false }
    );

    assert.equal(result.saved, true);
    assert.equal(state.config.runtime.channels[0]?.id, "telegram-main");
    assert.deepEqual(state.config.runtime.channels[0]?.settings.allowedChatIds, [
      "123",
      "-1001234567890"
    ]);
  });

  it("prompts to enable full access when approved operator ids are added in standard mode", async () => {
    const root = tempDir("openassist-cli-setup-full-access-add-");
    const configPath = path.join(root, "openassist.toml");
    const envPath = path.join(root, "openassistd.env");
    const state = loadSetupWizardState(configPath, envPath);

    const result = await runSetupWizard(
      state,
      new ScriptedPromptAdapter([
        "channels",
        "add",
        "telegram-main",
        "telegram",
        "true",
        "telegram-token",
        "123456789",
        "123456789",
        "true",
        ...linuxOnlyAnswers(["hardened"]),
        "back",
        "save"
      ]),
      { requireTty: false }
    );

    assert.equal(result.saved, true);
    assert.equal(state.config.runtime.operatorAccessProfile, "full-root");
    assert.equal(state.config.tools.fs.workspaceOnly, false);
    assert.deepEqual(state.config.runtime.channels[0]?.settings.operatorUserIds, ["123456789"]);
  });

  it("keeps standard mode when the full-access prompt is declined during channel edits", async () => {
    const root = tempDir("openassist-cli-setup-full-access-decline-");
    const configPath = path.join(root, "openassist.toml");
    const envPath = path.join(root, "openassistd.env");
    const state = loadSetupWizardState(configPath, envPath);
    state.config.runtime.channels = [
      {
        id: "telegram-main",
        type: "telegram",
        enabled: true,
        settings: {
          botToken: "env:OPENASSIST_CHANNEL_TELEGRAM_MAIN_BOT_TOKEN",
          allowedChatIds: ["123456789"]
        }
      }
    ];

    const result = await runSetupWizard(
      state,
      new ScriptedPromptAdapter([
        "channels",
        "edit",
        "telegram-main",
        "true",
        "false",
        "123456789",
        "123456789",
        "false",
        "back",
        "save"
      ]),
      { requireTty: false }
    );

    assert.equal(result.saved, true);
    assert.equal(state.config.runtime.operatorAccessProfile, "operator");
    assert.equal(state.config.tools.fs.workspaceOnly, true);
    assert.deepEqual(state.config.runtime.channels[0]?.settings.operatorUserIds, ["123456789"]);
  });

  it("persists provider-native reasoning controls and supports the codex route without an API key", async () => {
    const root = tempDir("openassist-cli-setup-provider-reasoning-");
    const configPath = path.join(root, "openassist.toml");
    const envPath = path.join(root, "openassistd.env");
    const state = loadSetupWizardState(configPath, envPath);

    const result = await runSetupWizard(
      state,
      new ScriptedPromptAdapter([
        "providers",
        "edit",
        "openai-main",
        "gpt-5.4",
        "",
        "high",
        "false",
        "add",
        "codex-main",
        "codex",
        "gpt-5.4",
        "medium",
        "add",
        "anthropic-main",
        "anthropic",
        "claude-sonnet-4-6",
        "",
        "4096",
        "false",
        "back",
        "save"
      ]),
      { requireTty: false }
    );

    assert.equal(result.saved, true);
    assert.deepEqual(
      state.config.runtime.providers.find((provider) => provider.id === "openai-main"),
      {
        id: "openai-main",
        type: "openai",
        defaultModel: "gpt-5.4",
        reasoningEffort: "high"
      }
    );
    assert.deepEqual(
      state.config.runtime.providers.find((provider) => provider.id === "codex-main"),
      {
        id: "codex-main",
        type: "codex",
        defaultModel: "gpt-5.4",
        reasoningEffort: "medium"
      }
    );
    assert.deepEqual(
      state.config.runtime.providers.find((provider) => provider.id === "anthropic-main"),
      {
        id: "anthropic-main",
        type: "anthropic",
        defaultModel: "claude-sonnet-4-6",
        thinkingBudgetTokens: 4096
      }
    );
    assert.equal(Object.keys(state.env).some((key) => key.includes("CODEX_MAIN_API_KEY")), false);
  });

  it("adds Azure Foundry with API-key auth and can later switch it to Entra auth", async () => {
    const root = tempDir("openassist-cli-setup-azure-foundry-");
    const configPath = path.join(root, "openassist.toml");
    const envPath = path.join(root, "openassistd.env");
    const state = loadSetupWizardState(configPath, envPath);

    const result = await runSetupWizard(
      state,
      new ScriptedPromptAdapter([
        "providers",
        "add",
        "azure-foundry-main",
        "azure-foundry",
        "demo-resource",
        "openai-resource",
        "api-key",
        "gpt-5-deployment",
        "gpt-5.4",
        "",
        "high",
        "true",
        "azure-key",
        "edit",
        "azure-foundry-main",
        "demo-resource",
        "foundry-resource",
        "entra",
        "gpt-5-deployment-v2",
        "",
        "https://custom.example/openai/v1",
        "default",
        "true",
        "tenant-id",
        "client-id",
        "client-secret",
        "back",
        "save"
      ]),
      { requireTty: false }
    );

    assert.equal(result.saved, true);
    assert.deepEqual(
      state.config.runtime.providers.find((provider) => provider.id === "azure-foundry-main"),
      {
        id: "azure-foundry-main",
        type: "azure-foundry",
        defaultModel: "gpt-5-deployment-v2",
        authMode: "entra",
        resourceName: "demo-resource",
        endpointFlavor: "foundry-resource",
        baseUrl: "https://custom.example/openai/v1"
      }
    );
    assert.equal(state.env.OPENASSIST_PROVIDER_AZURE_FOUNDRY_MAIN_API_KEY, "azure-key");
    assert.equal(state.env.AZURE_TENANT_ID, "tenant-id");
    assert.equal(state.env.AZURE_CLIENT_ID, "client-id");
    assert.equal(state.env.AZURE_CLIENT_SECRET, "client-secret");
  });
});
