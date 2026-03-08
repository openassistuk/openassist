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

describe("setup-wizard branch coverage", () => {
  it("throws for duplicate provider id", async () => {
    const root = tempDir("openassist-setup-duplicate-provider-");
    const state = loadSetupWizardState(
      path.join(root, "openassist.toml"),
      path.join(root, "openassistd.env")
    );

    await expect(
      runSetupWizard(
        state,
        new ScriptedPromptAdapter(["providers", "add", "openai-main"]),
        { requireTty: false }
      )
    ).rejects.toThrow("already exists");
  });

  it("throws when removing last provider", async () => {
    const root = tempDir("openassist-setup-remove-provider-");
    const state = loadSetupWizardState(
      path.join(root, "openassist.toml"),
      path.join(root, "openassistd.env")
    );

    await expect(
      runSetupWizard(
        state,
        new ScriptedPromptAdapter(["providers", "remove"]),
        { requireTty: false }
      )
    ).rejects.toThrow("At least one provider is required");
  });

  it("supports provider/channel/time/tool edits across branches", async () => {
    const root = tempDir("openassist-setup-branch-edit-");
    const configPath = path.join(root, "openassist.toml");
    const envPath = path.join(root, "openassistd.env");
    const state = loadSetupWizardState(configPath, envPath);

    state.config.runtime.providers.push({
      id: "anthropic-main",
      type: "anthropic",
      defaultModel: "claude-sonnet-4-6",
      baseUrl: "https://api.anthropic.com"
    });
    state.config.runtime.channels.push({
      id: "wa-main",
      type: "whatsapp-md",
      enabled: true,
      settings: {
        mode: "production",
        printQrInTerminal: true,
        syncFullHistory: false,
        maxReconnectAttempts: 10,
        reconnectDelayMs: 5_000
      }
    });

    const prompts = new ScriptedPromptAdapter([
      // Providers: edit anthropic, clear baseUrl, remove API key from env.
      "providers",
      "edit",
      "anthropic-main",
      "claude-sonnet-4-6",
      "",
      "",
      "true",
      "",
      "back",
      // Channels: edit WhatsApp branch.
      "channels",
      "edit",
      "wa-main",
      "false",
      "true",
      "false",
      "true",
      "12",
      "4500",
      "",
      "back",
      // Time and scheduler with both task kinds/action kinds.
      "time",
      "",
      "off",
      "false",
      "true",
      "500",
      "abc",
      "30",
      "backfill",
      "add",
      "cron-task",
      "cron",
      "true",
      "America/New_York",
      "skip",
      "skill",
      "shell-audit",
      "scripts/summarize.mjs",
      "true",
      "wa-main",
      "ops-room",
      "Task {{taskId}} => {{result}}",
      "0 */10 * * * *",
      "add",
      "interval-task",
      "interval",
      "false",
      "",
      "backfill",
      "prompt",
      "openai-main",
      "gpt-5.4",
      "Provide status",
      "false",
      "120",
      "back",
      // Tools/security
      "tools",
      "false",
      "not-a-number",
      "65000",
      "true",
      "false",
      "save"
    ]);

    const result = await runSetupWizard(state, prompts, {
      requireTty: false
    });

    expect(result.saved).toBe(true);
    expect(state.config.runtime.channels[0]?.enabled).toBe(false);
    expect(state.config.runtime.scheduler.defaultMisfirePolicy).toBe("backfill");
    expect(state.config.runtime.scheduler.tasks).toHaveLength(2);
    expect(state.config.tools.fs.workspaceOnly).toBe(false);
    expect(state.config.security.secretsBackend).toBe("encrypted-file");
    expect(fs.existsSync(configPath)).toBe(true);
    expect(fs.existsSync(envPath)).toBe(true);
  });

  it("enforces TTY by default when requested", async () => {
    const root = tempDir("openassist-setup-tty-");
    const state = loadSetupWizardState(
      path.join(root, "openassist.toml"),
      path.join(root, "openassistd.env")
    );

    const originalStdinIsTTY = process.stdin.isTTY;
    const originalStdoutIsTTY = process.stdout.isTTY;
    Object.defineProperty(process.stdin, "isTTY", { configurable: true, value: false });
    Object.defineProperty(process.stdout, "isTTY", { configurable: true, value: false });

    await expect(
      runSetupWizard(state, new ScriptedPromptAdapter(["save"]), {
        requireTty: true
      })
    ).rejects.toThrow("requires TTY");

    Object.defineProperty(process.stdin, "isTTY", { configurable: true, value: originalStdinIsTTY });
    Object.defineProperty(process.stdout, "isTTY", { configurable: true, value: originalStdoutIsTTY });
  });
});
