import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { PromptAdapter } from "../../apps/openassist-cli/src/lib/setup-wizard.js";
import {
  loadSetupQuickstartState,
  runSetupQuickstart
} from "../../apps/openassist-cli/src/lib/setup-quickstart.js";

function tempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

async function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() => reject(new Error("failed to resolve test port")));
        return;
      }
      const port = address.port;
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(port);
      });
    });
  });
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

function minimalTelegramAnswers(bindPort: number, extra: string[] = []): string[] {
  return [
    "false",
    "127.0.0.1",
    String(bindPort),
    "OpenAssist",
    "Pragmatic and concise",
    "Keep answers practical",
    "openai",
    "openai-main",
    "gpt-5.4",
    "",
    "openai-key",
    "telegram",
    "telegram-main",
    "telegram-token",
    "123,456",
    "Europe",
    "Europe/London",
    "true",
    "save",
    ...extra
  ];
}

function minimalDiscordCompatAnswers(extra: string[] = []): string[] {
  return [
    "true",
    "OpenAssist",
    "Pragmatic and concise",
    "Keep answers practical",
    "openai-compatible",
    "compat-main",
    "gpt-5.4",
    "http://127.0.0.1:11434/v1",
    "compat-key",
    "discord",
    "discord-main",
    "discord-token",
    "not-a-snowflake",
    "123456789012345678,987654321098765432",
    "",
    "Europe",
    "Europe/London",
    "true",
    "save",
    ...extra
  ];
}

function minimalWhatsAppAnthropicAnswers(extra: string[] = []): string[] {
  return [
    "true",
    "OpenAssist",
    "Pragmatic and concise",
    "Keep answers practical",
    "anthropic",
    "anthropic-main",
    "claude-sonnet-4-6",
    "",
    "anthropic-key",
    "whatsapp-md",
    "whatsapp-main",
    "false",
    "Europe",
    "Europe/London",
    "save",
    ...extra
  ];
}

describe("setup quickstart flow", () => {
  it("requires TTY by default for interactive quickstart", async () => {
    const root = tempDir("openassist-quickstart-flow-tty-required-");
    const configPath = path.join(root, "openassist.toml");
    const envPath = path.join(root, "openassistd.env");
    const installDir = root;
    const state = loadSetupQuickstartState(configPath, envPath, installDir);

    const stdinDescriptor = Object.getOwnPropertyDescriptor(process.stdin, "isTTY");
    const stdoutDescriptor = Object.getOwnPropertyDescriptor(process.stdout, "isTTY");
    Object.defineProperty(process.stdin, "isTTY", { configurable: true, value: false });
    Object.defineProperty(process.stdout, "isTTY", { configurable: true, value: false });
    try {
      await expect(
        runSetupQuickstart(
          state,
          {
            configPath,
            envFilePath: envPath,
            installDir,
            allowIncomplete: false,
            skipService: true,
            preflightCommandChecks: false
          },
          new ScriptedPromptAdapter([])
        )
      ).rejects.toThrow("Interactive quickstart requires TTY.");
    } finally {
      if (stdinDescriptor) {
        Object.defineProperty(process.stdin, "isTTY", stdinDescriptor);
      } else {
        Reflect.deleteProperty(process.stdin, "isTTY");
      }
      if (stdoutDescriptor) {
        Object.defineProperty(process.stdout, "isTTY", stdoutDescriptor);
      } else {
        Reflect.deleteProperty(process.stdout, "isTTY");
      }
    }
  });

  it("keeps confirmed runtime defaults in the minimal flow", async () => {
    const root = tempDir("openassist-quickstart-flow-defaults-");
    const configPath = path.join(root, "openassist.toml");
    const envPath = path.join(root, "openassistd.env");
    const installDir = root;
    fs.mkdirSync(path.join(installDir, "apps", "openassistd", "dist"), { recursive: true });
    fs.writeFileSync(path.join(installDir, "apps", "openassistd", "dist", "index.js"), "// test", "utf8");

    const state = loadSetupQuickstartState(configPath, envPath, installDir);
    const bindPort = await getFreePort();
    state.config.runtime.bindAddress = "127.0.0.1";
    state.config.runtime.bindPort = bindPort;
    const prompts = new ScriptedPromptAdapter([
      "true",
      "OpenAssist",
      "Pragmatic and concise",
      "Keep answers practical",
      "openai",
      "openai-main",
      "gpt-5.4",
      "",
      "openai-key",
      "telegram",
      "telegram-main",
      "telegram-token",
      "123,456",
      "Europe",
      "Europe/London",
      "true",
      "save"
    ]);

    const result = await runSetupQuickstart(
      state,
      {
        configPath,
        envFilePath: envPath,
        installDir,
        allowIncomplete: false,
        skipService: true,
        requireTty: false,
        preflightCommandChecks: false
      },
      prompts
    );

    expect(result.saved).toBe(true);
    expect(state.config.runtime.bindAddress).toBe("127.0.0.1");
    expect(state.config.runtime.bindPort).toBe(bindPort);
    expect(state.config.runtime.assistant.name).toBe("OpenAssist");
    expect(state.config.runtime.assistant.promptOnFirstContact).toBe(false);
  });

  it("creates a backup when config already exists", async () => {
    const root = tempDir("openassist-quickstart-flow-backup-");
    const configPath = path.join(root, "openassist.toml");
    const envPath = path.join(root, "openassistd.env");
    const installDir = root;
    fs.mkdirSync(path.join(installDir, "apps", "openassistd", "dist"), { recursive: true });
    fs.writeFileSync(path.join(installDir, "apps", "openassistd", "dist", "index.js"), "// test", "utf8");
    const state = loadSetupQuickstartState(configPath, envPath, installDir);
    fs.writeFileSync(configPath, "# existing config to trigger backup\n", "utf8");
    const bindPort = await getFreePort();
    const prompts = new ScriptedPromptAdapter(minimalTelegramAnswers(bindPort));

    const result = await runSetupQuickstart(
      state,
      {
        configPath,
        envFilePath: envPath,
        installDir,
        allowIncomplete: false,
        skipService: true,
        requireTty: false,
        preflightCommandChecks: false
      },
      prompts
    );

    expect(result.saved).toBe(true);
    expect(result.backupPath).toBeDefined();
    expect(result.backupPath && fs.existsSync(result.backupPath)).toBe(true);
    expect(state.config.runtime.assistant.promptOnFirstContact).toBe(false);
  });

  it("runs strict first-reply onboarding and persists config/env", async () => {
    const root = tempDir("openassist-quickstart-flow-");
    const configPath = path.join(root, "openassist.toml");
    const envPath = path.join(root, "openassistd.env");
    const installDir = root;
    fs.mkdirSync(path.join(installDir, "apps", "openassistd", "dist"), { recursive: true });
    fs.writeFileSync(path.join(installDir, "apps", "openassistd", "dist", "index.js"), "// test", "utf8");

    const state = loadSetupQuickstartState(configPath, envPath, installDir);
    const bindPort = await getFreePort();
    const prompts = new ScriptedPromptAdapter(minimalTelegramAnswers(bindPort));

    const result = await runSetupQuickstart(
      state,
      {
        configPath,
        envFilePath: envPath,
        installDir,
        allowIncomplete: false,
        skipService: true,
        requireTty: false,
        preflightCommandChecks: false
      },
      prompts
    );

    expect(result.saved).toBe(true);
    expect(result.validationErrors).toBe(0);
    expect(fs.existsSync(configPath)).toBe(true);
    expect(fs.existsSync(envPath)).toBe(true);
    expect(state.config.runtime.assistant.promptOnFirstContact).toBe(false);
    expect(result.summary.some((line) => line.includes("Quickstart saved"))).toBe(true);
    expect(result.summary.some((line) => line.includes("Assistant identity: OpenAssist"))).toBe(true);
    expect(result.summary.some((line) => line.includes("First reply checklist:"))).toBe(true);
    expect(result.summary.some((line) => line.includes("Primary channel: telegram-main"))).toBe(true);
    expect(result.summary.some((line) => line.includes("PATH fallback:"))).toBe(true);
    expect(result.summary.some((line) => line.includes("Direct Node fallback:"))).toBe(true);
    expect(result.summary.some((line) => line.includes("First reply destination: Telegram via telegram-main"))).toBe(true);
  });

  it("re-prompts invalid numeric, timezone, and Telegram chat ID inputs", async () => {
    const root = tempDir("openassist-quickstart-flow-reprompt-");
    const configPath = path.join(root, "openassist.toml");
    const envPath = path.join(root, "openassistd.env");
    const installDir = root;
    fs.mkdirSync(path.join(installDir, "apps", "openassistd", "dist"), { recursive: true });
    fs.writeFileSync(path.join(installDir, "apps", "openassistd", "dist", "index.js"), "// test", "utf8");

    const state = loadSetupQuickstartState(configPath, envPath, installDir);
    const bindPort = await getFreePort();
    const prompts = new ScriptedPromptAdapter([
      "false",
      "127.0.0.1",
      "not-a-port",
      String(bindPort),
      "OpenAssist",
      "Pragmatic and concise",
      "Keep answers practical",
      "openai",
      "openai-main",
      "gpt-5.4",
      "",
      "openai-key",
      "telegram",
      "telegram-main",
      "telegram-token",
      "abc,123",
      "123,-100999888777",
      "Frederick",
      "Europe",
      "Europe/London",
      "true",
      "save"
    ]);

    const result = await runSetupQuickstart(
      state,
      {
        configPath,
        envFilePath: envPath,
        installDir,
        allowIncomplete: false,
        skipService: true,
        requireTty: false,
        preflightCommandChecks: false
      },
      prompts
    );

    expect(result.saved).toBe(true);
    expect(result.validationErrors).toBe(0);
    expect(state.config.runtime.bindPort).toBe(bindPort);
    expect(state.config.runtime.time.defaultTimezone).toBe("Europe/London");
    expect(state.config.runtime.channels[0]?.settings.allowedChatIds).toEqual([
      "123",
      "-100999888777"
    ]);
  });

  it("preserves full-length provider API keys without truncation", async () => {
    const root = tempDir("openassist-quickstart-flow-long-key-");
    const configPath = path.join(root, "openassist.toml");
    const envPath = path.join(root, "openassistd.env");
    const installDir = root;
    fs.mkdirSync(path.join(installDir, "apps", "openassistd", "dist"), { recursive: true });
    fs.writeFileSync(path.join(installDir, "apps", "openassistd", "dist", "index.js"), "// test", "utf8");

    const state = loadSetupQuickstartState(configPath, envPath, installDir);
    const bindPort = await getFreePort();
    const longApiKey = `sk-${"x".repeat(240)}`;
    const prompts = new ScriptedPromptAdapter([
      "false",
      "127.0.0.1",
      String(bindPort),
      "OpenAssist",
      "Pragmatic and concise",
      "Keep answers practical",
      "openai",
      "openai-main",
      "gpt-5.4",
      "",
      longApiKey,
      "telegram",
      "telegram-main",
      "telegram-token",
      "123,456",
      "Europe",
      "Europe/London",
      "true",
      "save"
    ]);

    const result = await runSetupQuickstart(
      state,
      {
        configPath,
        envFilePath: envPath,
        installDir,
        allowIncomplete: false,
        skipService: true,
        requireTty: false,
        preflightCommandChecks: false
      },
      prompts
    );

    expect(result.saved).toBe(true);
    expect(state.env.OPENASSIST_PROVIDER_OPENAI_MAIN_API_KEY).toBe(longApiKey);
    expect(state.env.OPENASSIST_PROVIDER_OPENAI_MAIN_API_KEY.length).toBe(longApiKey.length);
  });

  it("supports openai-compatible provider quickstart with Discord allow-list validation", async () => {
    const root = tempDir("openassist-quickstart-flow-discord-");
    const configPath = path.join(root, "openassist.toml");
    const envPath = path.join(root, "openassistd.env");
    const installDir = root;
    fs.mkdirSync(path.join(installDir, "apps", "openassistd", "dist"), { recursive: true });
    fs.writeFileSync(path.join(installDir, "apps", "openassistd", "dist", "index.js"), "// test", "utf8");

    const state = loadSetupQuickstartState(configPath, envPath, installDir);
    const prompts = new ScriptedPromptAdapter(minimalDiscordCompatAnswers());

    const result = await runSetupQuickstart(
      state,
      {
        configPath,
        envFilePath: envPath,
        installDir,
        allowIncomplete: false,
        skipService: true,
        requireTty: false,
        preflightCommandChecks: false
      },
      prompts
    );

    const provider = state.config.runtime.providers.find((entry) => entry.id === "compat-main");
    expect(result.saved).toBe(true);
    expect(state.config.runtime.defaultProviderId).toBe("compat-main");
    expect(provider?.type).toBe("openai-compatible");
    expect(provider?.baseUrl).toBe("http://127.0.0.1:11434/v1");
    expect(state.config.runtime.channels[0]?.type).toBe("discord");
    expect(state.config.runtime.channels[0]?.settings.allowedChannelIds).toEqual([
      "123456789012345678",
      "987654321098765432"
    ]);
    expect(state.env.OPENASSIST_CHANNEL_DISCORD_MAIN_BOT_TOKEN).toBe("discord-token");
    expect(result.summary.some((line) => line.includes("Primary channel: discord-main (discord)"))).toBe(true);
  });

  it("supports anthropic quickstart with WhatsApp and auto-confirms timezone when confirmation is disabled", async () => {
    const root = tempDir("openassist-quickstart-flow-whatsapp-");
    const configPath = path.join(root, "openassist.toml");
    const envPath = path.join(root, "openassistd.env");
    const installDir = root;
    fs.mkdirSync(path.join(installDir, "apps", "openassistd", "dist"), { recursive: true });
    fs.writeFileSync(path.join(installDir, "apps", "openassistd", "dist", "index.js"), "// test", "utf8");

    const state = loadSetupQuickstartState(configPath, envPath, installDir);
    state.config.runtime.time.requireTimezoneConfirmation = false;
    state.config.runtime.bindPort = await getFreePort();
    const prompts = new ScriptedPromptAdapter(minimalWhatsAppAnthropicAnswers());

    const result = await runSetupQuickstart(
      state,
      {
        configPath,
        envFilePath: envPath,
        installDir,
        allowIncomplete: false,
        skipService: true,
        requireTty: false,
        preflightCommandChecks: false
      },
      prompts
    );

    const provider = state.config.runtime.providers.find((entry) => entry.id === "anthropic-main");
    expect(result.saved).toBe(true);
    expect(state.config.runtime.defaultProviderId).toBe("anthropic-main");
    expect(provider?.type).toBe("anthropic");
    expect(state.config.runtime.channels[0]?.type).toBe("whatsapp-md");
    expect(state.config.runtime.channels[0]?.settings).toMatchObject({
      mode: "production",
      printQrInTerminal: false,
      syncFullHistory: false,
      maxReconnectAttempts: 10,
      reconnectDelayMs: 5000
    });
    expect(state.config.runtime.time.defaultTimezone).toBe("Europe/London");
    expect(result.summary.some((line) => line.includes("openassist channel qr --id whatsapp-main"))).toBe(true);
  });

  it("supports the quickstart full-access opt-in path for approved operators", async () => {
    const root = tempDir("openassist-quickstart-flow-full-access-");
    const configPath = path.join(root, "openassist.toml");
    const envPath = path.join(root, "openassistd.env");
    const installDir = root;
    fs.mkdirSync(path.join(installDir, "apps", "openassistd", "dist"), { recursive: true });
    fs.writeFileSync(path.join(installDir, "apps", "openassistd", "dist", "index.js"), "// test", "utf8");

    const state = loadSetupQuickstartState(configPath, envPath, installDir);
    state.config.runtime.bindPort = await getFreePort();
    const prompts = new ScriptedPromptAdapter([
      "true",
      "OpenAssist",
      "Pragmatic and concise",
      "Keep answers practical",
      "openai",
      "openai-main",
      "gpt-5.4",
      "",
      "openai-key",
      "telegram",
      "telegram-main",
      "telegram-token",
      "123,456",
      "true",
      "123456789",
      "Europe",
      "Europe/London",
      "true",
      "save"
    ]);

    const result = await runSetupQuickstart(
      state,
      {
        configPath,
        envFilePath: envPath,
        installDir,
        allowIncomplete: false,
        skipService: true,
        requireTty: false,
        preflightCommandChecks: false
      },
      prompts
    );

    expect(result.saved).toBe(true);
    expect(state.config.runtime.operatorAccessProfile).toBe("full-root");
    expect(state.config.tools.fs.workspaceOnly).toBe(false);
    expect(state.config.runtime.channels[0]?.settings.operatorUserIds).toEqual(["123456789"]);
    expect(result.summary.some((line) => line.includes("Access mode: Full access for approved operators"))).toBe(true);
  });

  it("returns to standard mode when full access is selected before operator IDs are ready", async () => {
    const root = tempDir("openassist-quickstart-flow-standard-fallback-");
    const configPath = path.join(root, "openassist.toml");
    const envPath = path.join(root, "openassistd.env");
    const installDir = root;
    fs.mkdirSync(path.join(installDir, "apps", "openassistd", "dist"), { recursive: true });
    fs.writeFileSync(path.join(installDir, "apps", "openassistd", "dist", "index.js"), "// test", "utf8");

    const state = loadSetupQuickstartState(configPath, envPath, installDir);
    state.config.runtime.bindPort = await getFreePort();
    const prompts = new ScriptedPromptAdapter([
      "true",
      "OpenAssist",
      "Pragmatic and concise",
      "Keep answers practical",
      "openai",
      "openai-main",
      "gpt-5.4",
      "",
      "openai-key",
      "telegram",
      "telegram-main",
      "telegram-token",
      "123,456",
      "true",
      "",
      "standard",
      "Europe",
      "Europe/London",
      "true",
      "save"
    ]);

    const result = await runSetupQuickstart(
      state,
      {
        configPath,
        envFilePath: envPath,
        installDir,
        allowIncomplete: false,
        skipService: true,
        requireTty: false,
        preflightCommandChecks: false
      },
      prompts
    );

    expect(result.saved).toBe(true);
    expect(state.config.runtime.operatorAccessProfile).toBe("operator");
    expect(state.config.tools.fs.workspaceOnly).toBe(true);
    expect(state.config.runtime.channels[0]?.settings.operatorUserIds).toBeUndefined();
    expect(state.config.runtime.assistant.promptOnFirstContact).toBe(false);
    expect(result.summary.some((line) => line.includes("Access mode: Standard mode (recommended)"))).toBe(true);
  });
});
