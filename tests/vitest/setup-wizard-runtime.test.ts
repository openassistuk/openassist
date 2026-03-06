import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
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

describe("setup wizard runtime flow", () => {
  it("applies full multi-section edits and saves state", async () => {
    const root = tempDir("openassist-vitest-setup-wizard-");
    const configPath = path.join(root, "openassist.toml");
    const envPath = path.join(root, "openassistd.env");
    const state = loadSetupWizardState(configPath, envPath);

    const prompts = new ScriptedPromptAdapter([
      "runtime",
      "127.0.0.1",
      "3344",
      "operator",
      path.join(root, "data"),
      path.join(root, "skills"),
      path.join(root, "logs"),
      "providers",
      "add",
      "openai-compat-main",
      "openai-compatible",
      "gpt-5.2",
      "http://127.0.0.1:9999/v1",
      "true",
      "provider-key",
      "back",
      "channels",
      "add",
      "discord-main",
      "discord",
      "true",
      "discord-token",
      "123456789012345678,987654321098765432",
      "edit",
      "discord-main",
      "false",
      "true",
      "discord-token-2",
      "111111111111111111",
      "back",
      "time",
      "Europe/London",
      "warn-degrade",
      "false",
      "true",
      "1000",
      "15",
      "catch-up-once",
      "add",
      "skill-task",
      "cron",
      "true",
      "",
      "catch-up-once",
      "skill",
      "shell-audit",
      "scripts/summarize.mjs",
      "true",
      "discord-main",
      "ops-room",
      "Task {{taskId}} => {{result}}",
      "0 */5 * * * *",
      "back",
      "tools",
      "true",
      "65000",
      "true",
      "false",
      "save"
    ]);

    const result = await runSetupWizard(state, prompts, {
      requireTty: false
    });

    expect(result.saved).toBe(true);
    expect(state.config.runtime.providers.some((provider) => provider.id === "openai-compat-main")).toBe(true);
    expect(state.config.runtime.channels[0]?.enabled).toBe(false);
    expect(state.config.runtime.scheduler.tasks).toHaveLength(1);
    expect(state.config.tools.web.enabled).toBe(false);
    expect(fs.existsSync(configPath)).toBe(true);
    expect(fs.existsSync(envPath)).toBe(true);
  });

  it("returns unsaved state when exiting", async () => {
    const root = tempDir("openassist-vitest-setup-exit-");
    const configPath = path.join(root, "openassist.toml");
    const envPath = path.join(root, "openassistd.env");
    const state = loadSetupWizardState(configPath, envPath);

    const result = await runSetupWizard(
      state,
      new ScriptedPromptAdapter(["exit"]),
      { requireTty: false }
    );

    expect(result.saved).toBe(false);
    expect(fs.existsSync(configPath)).toBe(false);
    expect(fs.existsSync(envPath)).toBe(false);
  });

  it("re-prompts invalid runtime inputs instead of silently coercing", async () => {
    const root = tempDir("openassist-vitest-setup-runtime-reprompt-");
    const configPath = path.join(root, "openassist.toml");
    const envPath = path.join(root, "openassistd.env");
    const state = loadSetupWizardState(configPath, envPath);

    const prompts = new ScriptedPromptAdapter([
      "runtime",
      "bad host ???",
      "127.0.0.1",
      "not-port",
      "3344",
      "operator",
      path.join(root, "data"),
      path.join(root, "skills"),
      path.join(root, "logs"),
      "save"
    ]);

    const result = await runSetupWizard(state, prompts, {
      requireTty: false
    });

    expect(result.saved).toBe(true);
    expect(state.config.runtime.bindAddress).toBe("127.0.0.1");
    expect(state.config.runtime.bindPort).toBe(3344);
  });

  it("re-prompts invalid telegram chat IDs and persists numeric allow-list", async () => {
    const root = tempDir("openassist-vitest-setup-telegram-chatids-");
    const configPath = path.join(root, "openassist.toml");
    const envPath = path.join(root, "openassistd.env");
    const state = loadSetupWizardState(configPath, envPath);

    const prompts = new ScriptedPromptAdapter([
      "channels",
      "add",
      "telegram-main",
      "telegram",
      "true",
      "telegram-token",
      "abc,123",
      "123,-1001234567890",
      "back",
      "save"
    ]);

    const result = await runSetupWizard(state, prompts, {
      requireTty: false
    });

    expect(result.saved).toBe(true);
    expect(state.config.runtime.channels).toHaveLength(1);
    expect(state.config.runtime.channels[0]?.id).toBe("telegram-main");
    expect(state.config.runtime.channels[0]?.settings.allowedChatIds).toEqual([
      "123",
      "-1001234567890"
    ]);
  });

  it("preserves full-length API keys in wizard provider edits", async () => {
    const root = tempDir("openassist-vitest-setup-long-api-key-");
    const configPath = path.join(root, "openassist.toml");
    const envPath = path.join(root, "openassistd.env");
    const state = loadSetupWizardState(configPath, envPath);
    const longApiKey = `sk-${"y".repeat(260)}`;

    const prompts = new ScriptedPromptAdapter([
      "providers",
      "edit",
      "openai-main",
      "gpt-5.2",
      "",
      "true",
      longApiKey,
      "back",
      "save"
    ]);

    const result = await runSetupWizard(state, prompts, {
      requireTty: false
    });

    expect(result.saved).toBe(true);
    expect(state.env.OPENASSIST_PROVIDER_OPENAI_MAIN_API_KEY).toBe(longApiKey);
    expect(state.env.OPENASSIST_PROVIDER_OPENAI_MAIN_API_KEY.length).toBe(longApiKey.length);
  });
});
