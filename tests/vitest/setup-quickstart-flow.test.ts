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

  it("runs assistant profile stage in TTY mode", async () => {
    const root = tempDir("openassist-quickstart-flow-assistant-");
    const configPath = path.join(root, "openassist.toml");
    const envPath = path.join(root, "openassistd.env");
    const installDir = root;
    fs.mkdirSync(path.join(installDir, "apps", "openassistd", "dist"), { recursive: true });
    fs.writeFileSync(path.join(installDir, "apps", "openassistd", "dist", "index.js"), "// test", "utf8");

    const state = loadSetupQuickstartState(configPath, envPath, installDir);
    const bindPort = await getFreePort();
    const prompts = new ScriptedPromptAdapter([
      "127.0.0.1",
      String(bindPort),
      "operator",
      path.join(root, "data"),
      path.join(root, "skills"),
      path.join(root, "logs"),
      "OpsBot",
      "Be concise and operationally precise.",
      "Prefer actionable diagnostics first.",
      "true",
      "openai",
      "openai-main",
      "gpt-5.2",
      "",
      "api-key-only",
      "openai-key",
      "false",
      "openai-main",
      "false",
      "Europe/London",
      "warn-degrade",
      "300",
      "10000",
      "true",
      "Europe/London",
      "true",
      "1000",
      "30",
      "catch-up-once",
      "false"
    ]);

    const stdinDescriptor = Object.getOwnPropertyDescriptor(process.stdin, "isTTY");
    const stdoutDescriptor = Object.getOwnPropertyDescriptor(process.stdout, "isTTY");
    Object.defineProperty(process.stdin, "isTTY", { configurable: true, value: true });
    Object.defineProperty(process.stdout, "isTTY", { configurable: true, value: true });
    try {
      const result = await runSetupQuickstart(
        state,
        {
          configPath,
          envFilePath: envPath,
          installDir,
          allowIncomplete: false,
          skipService: true,
          requireTty: true,
          preflightCommandChecks: false
        },
        prompts
      );

      expect(result.saved).toBe(true);
      expect(state.config.runtime.assistant.name).toBe("OpsBot");
      expect(state.config.runtime.assistant.persona).toBe("Be concise and operationally precise.");
      expect(state.config.runtime.assistant.operatorPreferences).toBe(
        "Prefer actionable diagnostics first."
      );
      expect(state.config.runtime.assistant.promptOnFirstContact).toBe(true);
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
    const prompts = new ScriptedPromptAdapter([
      "127.0.0.1",
      String(bindPort),
      "operator",
      path.join(root, "data"),
      path.join(root, "skills"),
      path.join(root, "logs"),
      "openai",
      "openai-main",
      "gpt-5.2",
      "",
      "openai-key",
      "false",
      "openai-main",
      "false",
      "Europe/London",
      "warn-degrade",
      "300",
      "10000",
      "true",
      "Europe/London",
      "true",
      "1000",
      "30",
      "catch-up-once",
      "false"
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
    expect(result.backupPath).toBeDefined();
    expect(result.backupPath && fs.existsSync(result.backupPath)).toBe(true);
  });

  it("runs strict onboarding path and persists config/env", async () => {
    const root = tempDir("openassist-quickstart-flow-");
    const configPath = path.join(root, "openassist.toml");
    const envPath = path.join(root, "openassistd.env");
    const installDir = root;
    fs.mkdirSync(path.join(installDir, "apps", "openassistd", "dist"), { recursive: true });
    fs.writeFileSync(path.join(installDir, "apps", "openassistd", "dist", "index.js"), "// test", "utf8");

    const state = loadSetupQuickstartState(configPath, envPath, installDir);
    const bindPort = await getFreePort();
    const prompts = new ScriptedPromptAdapter([
      "127.0.0.1",
      String(bindPort),
      "operator",
      path.join(root, "data"),
      path.join(root, "skills"),
      path.join(root, "logs"),
      "openai",
      "openai-main",
      "gpt-5.2",
      "",
      "openai-key",
      "false",
      "openai-main",
      "true",
      "upsert",
      "telegram",
      "telegram-main",
      "true",
      "true",
      "telegram-token",
      "123,456",
      "done",
      "Europe/London",
      "warn-degrade",
      "300",
      "10000",
      "true",
      "Europe/London",
      "true",
      "1000",
      "30",
      "catch-up-once",
      "false"
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
    expect(fs.existsSync(configPath)).toBe(true);
    expect(fs.existsSync(envPath)).toBe(true);
    expect(result.summary.some((line) => line.includes("Quickstart summary"))).toBe(true);
    expect(result.summary.some((line) => line.includes("PATH fallback:"))).toBe(true);
    expect(result.summary.some((line) => line.includes("Direct Node fallback:"))).toBe(true);
  });

  it("re-prompts invalid numeric and timezone inputs instead of silently accepting", async () => {
    const root = tempDir("openassist-quickstart-flow-reprompt-");
    const configPath = path.join(root, "openassist.toml");
    const envPath = path.join(root, "openassistd.env");
    const installDir = root;
    fs.mkdirSync(path.join(installDir, "apps", "openassistd", "dist"), { recursive: true });
    fs.writeFileSync(path.join(installDir, "apps", "openassistd", "dist", "index.js"), "// test", "utf8");

    const state = loadSetupQuickstartState(configPath, envPath, installDir);
    const bindPort = await getFreePort();
    const prompts = new ScriptedPromptAdapter([
      "127.0.0.1",
      "not-a-port",
      String(bindPort),
      "operator",
      path.join(root, "data"),
      path.join(root, "skills"),
      path.join(root, "logs"),
      "openai",
      "openai-main",
      "gpt-5.2",
      "",
      "openai-key",
      "false",
      "openai-main",
      "false",
      "Frederick",
      "Europe/London",
      "warn-degrade",
      "abc",
      "300",
      "10000",
      "true",
      "Europe/London",
      "true",
      "oops",
      "1000",
      "30",
      "catch-up-once",
      "false"
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
    expect(state.config.runtime.time.ntpCheckIntervalSec).toBe(300);
    expect(state.config.runtime.scheduler.tickIntervalMs).toBe(1000);
  });

  it("re-prompts invalid Telegram chat IDs during quickstart channel onboarding", async () => {
    const root = tempDir("openassist-quickstart-flow-chat-ids-");
    const configPath = path.join(root, "openassist.toml");
    const envPath = path.join(root, "openassistd.env");
    const installDir = root;
    fs.mkdirSync(path.join(installDir, "apps", "openassistd", "dist"), { recursive: true });
    fs.writeFileSync(path.join(installDir, "apps", "openassistd", "dist", "index.js"), "// test", "utf8");

    const state = loadSetupQuickstartState(configPath, envPath, installDir);
    const bindPort = await getFreePort();
    const prompts = new ScriptedPromptAdapter([
      "127.0.0.1",
      String(bindPort),
      "operator",
      path.join(root, "data"),
      path.join(root, "skills"),
      path.join(root, "logs"),
      "openai",
      "openai-main",
      "gpt-5.2",
      "",
      "openai-key",
      "false",
      "openai-main",
      "true",
      "upsert",
      "telegram",
      "telegram-main",
      "true",
      "true",
      "telegram-token",
      "abc,123",
      "123,-100999888777",
      "done",
      "Europe/London",
      "warn-degrade",
      "300",
      "10000",
      "true",
      "Europe/London",
      "true",
      "1000",
      "30",
      "catch-up-once",
      "false"
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
    expect(state.config.runtime.channels).toHaveLength(1);
    expect(state.config.runtime.channels[0]?.id).toBe("telegram-main");
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
      "127.0.0.1",
      String(bindPort),
      "operator",
      path.join(root, "data"),
      path.join(root, "skills"),
      path.join(root, "logs"),
      "openai",
      "openai-main",
      "gpt-5.2",
      "",
      longApiKey,
      "false",
      "openai-main",
      "false",
      "Europe/London",
      "warn-degrade",
      "300",
      "10000",
      "true",
      "Europe/London",
      "true",
      "1000",
      "30",
      "catch-up-once",
      "false"
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
});
