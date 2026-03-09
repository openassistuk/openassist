import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { ServiceManagerAdapter } from "../../apps/openassist-cli/src/lib/service-manager.js";
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

function createFakeService(counters?: { installCalls: number; restartCalls: number }): ServiceManagerAdapter {
  return {
    kind: process.platform === "darwin" ? "launchd" : "systemd-user",
    async install(): Promise<void> {
      if (counters) {
        counters.installCalls += 1;
      }
    },
    async uninstall(): Promise<void> {},
    async start(): Promise<void> {},
    async stop(): Promise<void> {},
    async restart(): Promise<void> {
      if (counters) {
        counters.restartCalls += 1;
      }
    },
    async status(): Promise<void> {},
    async logs(): Promise<void> {},
    async enable(): Promise<void> {},
    async disable(): Promise<void> {},
    async isInstalled(): Promise<boolean> {
      return true;
    }
  };
}

function validQuickstartAnswers(bindPort: number, extra: string[] = []): string[] {
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
    "default",
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

function invalidQuickstartAnswers(bindPort: number, extra: string[] = []): string[] {
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
    "default",
    "",
    "telegram",
    "telegram-main",
    "",
    "",
    "Europe",
    "Europe/London",
    "true",
    "save",
    ...extra
  ];
}

describe("setup quickstart branch behavior", () => {
  it("returns unsaved when validation fails and operator aborts", async () => {
    const root = tempDir("openassist-quickstart-abort-");
    const configPath = path.join(root, "openassist.toml");
    const envPath = path.join(root, "openassistd.env");
    const installDir = root;
    const bindPort = await getFreePort();
    const state = loadSetupQuickstartState(configPath, envPath, installDir);

    const prompts = new ScriptedPromptAdapter([
      ...invalidQuickstartAnswers(bindPort),
      "abort"
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

    expect(result.saved).toBe(false);
    expect(result.validationErrors).toBeGreaterThan(0);
    expect(fs.existsSync(configPath)).toBe(false);
  });

  it("supports explicit allow-incomplete continuation", async () => {
    const root = tempDir("openassist-quickstart-allow-incomplete-");
    const configPath = path.join(root, "openassist.toml");
    const envPath = path.join(root, "openassistd.env");
    const installDir = root;
    const bindPort = await getFreePort();
    const state = loadSetupQuickstartState(configPath, envPath, installDir);

    const prompts = new ScriptedPromptAdapter([
      ...invalidQuickstartAnswers(bindPort),
      "true"
    ]);

    const result = await runSetupQuickstart(
      state,
      {
        configPath,
        envFilePath: envPath,
        installDir,
        allowIncomplete: true,
        skipService: true,
        requireTty: false,
        preflightCommandChecks: false
      },
      prompts
    );

    expect(result.saved).toBe(true);
    expect(result.validationErrors).toBeGreaterThan(0);
    expect(fs.existsSync(configPath)).toBe(true);
  });

  it("executes service and health step using dependency stubs", async () => {
    const root = tempDir("openassist-quickstart-service-");
    const configPath = path.join(root, "openassist.toml");
    const envPath = path.join(root, "openassistd.env");
    const installDir = root;
    const bindPort = await getFreePort();
    fs.mkdirSync(path.join(installDir, "apps", "openassistd", "dist"), { recursive: true });
    fs.writeFileSync(path.join(installDir, "apps", "openassistd", "dist", "index.js"), "// test", "utf8");
    const state = loadSetupQuickstartState(configPath, envPath, installDir);

    const counters = { installCalls: 0, restartCalls: 0 };
    const requestCalls: Array<{ method: string; url: string }> = [];
    const validationContinuationAnswers = process.platform === "win32" ? ["true"] : [];

    const prompts = new ScriptedPromptAdapter([
      ...validQuickstartAnswers(bindPort, validationContinuationAnswers)
    ]);

    const result = await runSetupQuickstart(
      state,
      {
        configPath,
        envFilePath: envPath,
        installDir,
        allowIncomplete: true,
        skipService: false,
        requireTty: false,
        preflightCommandChecks: false
      },
      prompts,
      {
        createServiceManagerFn: () =>
          createFakeService(counters),
        waitForHealthyFn: async () => ({
          ok: true,
          status: 200,
          bodyText: "{\"status\":\"ok\"}"
        }),
        requestJsonFn: async (method, url) => {
          requestCalls.push({ method, url });
          return {
            status: 200,
            data: { status: "ok" }
          };
        }
      }
    );

    expect(result.saved).toBe(true);
    expect(result.serviceHealthOk).toBe(true);
    expect(counters.installCalls).toBe(1);
    expect(counters.restartCalls).toBe(1);
    expect(requestCalls.some((call) => call.method === "POST" && call.url.includes("/v1/time/timezone/confirm"))).toBe(true);
    expect(requestCalls.filter((call) => call.method === "GET").length).toBeGreaterThanOrEqual(2);
  });

  it("allows skip-after-failure in allow-incomplete mode for service checks", async () => {
    const root = tempDir("openassist-quickstart-service-skip-");
    const configPath = path.join(root, "openassist.toml");
    const envPath = path.join(root, "openassistd.env");
    const installDir = root;
    const bindPort = await getFreePort();
    fs.mkdirSync(path.join(installDir, "apps", "openassistd", "dist"), { recursive: true });
    fs.writeFileSync(path.join(installDir, "apps", "openassistd", "dist", "index.js"), "// test", "utf8");
    const state = loadSetupQuickstartState(configPath, envPath, installDir);

    const validationContinuationAnswers = process.platform === "win32" ? ["true"] : [];
    const prompts = new ScriptedPromptAdapter([
      ...validQuickstartAnswers(bindPort, [...validationContinuationAnswers, "skip"])
    ]);

    const result = await runSetupQuickstart(
      state,
      {
        configPath,
        envFilePath: envPath,
        installDir,
        allowIncomplete: true,
        skipService: false,
        requireTty: false,
        preflightCommandChecks: false
      },
      prompts,
      {
        createServiceManagerFn: () => createFakeService(),
        waitForHealthyFn: async () => ({
          ok: false,
          status: 503,
          bodyText: "service unavailable"
        }),
        requestJsonFn: async () => ({
          status: 200,
          data: { status: "ok" }
        })
      }
    );

    expect(result.saved).toBe(true);
    expect(result.serviceHealthOk).toBe(false);
    expect(result.postSaveAborted).toBe(false);
    expect(result.postSaveError).toMatch(/daemon health is failing/i);
    expect(result.summary.some((line) => line.includes("Service state: Service needs attention"))).toBe(true);
  });

  it("allows abort-after-failure in allow-incomplete mode for service checks", async () => {
    const root = tempDir("openassist-quickstart-service-abort-allow-");
    const configPath = path.join(root, "openassist.toml");
    const envPath = path.join(root, "openassistd.env");
    const installDir = root;
    const bindPort = await getFreePort();
    fs.mkdirSync(path.join(installDir, "apps", "openassistd", "dist"), { recursive: true });
    fs.writeFileSync(path.join(installDir, "apps", "openassistd", "dist", "index.js"), "// test", "utf8");
    const state = loadSetupQuickstartState(configPath, envPath, installDir);

    const validationContinuationAnswers = process.platform === "win32" ? ["true"] : [];
    const prompts = new ScriptedPromptAdapter([
      ...validQuickstartAnswers(bindPort, [...validationContinuationAnswers, "abort"])
    ]);

    const result = await runSetupQuickstart(
      state,
      {
        configPath,
        envFilePath: envPath,
        installDir,
        allowIncomplete: true,
        skipService: false,
        requireTty: false,
        preflightCommandChecks: false
      },
      prompts,
      {
        createServiceManagerFn: () => createFakeService(),
        waitForHealthyFn: async () => ({
          ok: false,
          status: 503,
          bodyText: "service unavailable"
        }),
        requestJsonFn: async () => ({
          status: 200,
          data: { status: "ok" }
        })
      }
    );

    expect(result.saved).toBe(true);
    expect(result.serviceHealthOk).toBe(false);
    expect(result.postSaveAborted).toBe(true);
    expect(result.postSaveError).toMatch(/daemon health is failing/i);
    expect(result.summary.some((line) => line.includes("aborted by operator"))).toBe(true);
  });

  it("supports abort-after-failure in strict mode service checks", async () => {
    if (process.platform === "win32") {
      return;
    }

    const root = tempDir("openassist-quickstart-service-abort-");
    const configPath = path.join(root, "openassist.toml");
    const envPath = path.join(root, "openassistd.env");
    const installDir = root;
    const bindPort = await getFreePort();
    fs.mkdirSync(path.join(installDir, "apps", "openassistd", "dist"), { recursive: true });
    fs.writeFileSync(path.join(installDir, "apps", "openassistd", "dist", "index.js"), "// test", "utf8");
    const state = loadSetupQuickstartState(configPath, envPath, installDir);

    const prompts = new ScriptedPromptAdapter([
      ...validQuickstartAnswers(bindPort, ["abort"])
    ]);

    const result = await runSetupQuickstart(
      state,
      {
        configPath,
        envFilePath: envPath,
        installDir,
        allowIncomplete: false,
        skipService: false,
        requireTty: false,
        preflightCommandChecks: false
      },
      prompts,
      {
        createServiceManagerFn: () => createFakeService(),
        waitForHealthyFn: async () => ({
          ok: false,
          status: 503,
          bodyText: "service unavailable"
        }),
        requestJsonFn: async () => ({
          status: 200,
          data: { status: "ok" }
        })
      }
    );

    expect(result.saved).toBe(true);
    expect(result.serviceHealthOk).toBe(false);
    expect(result.postSaveAborted).toBe(true);
  });

  it("uses loopback health probe urls when bind address is wildcard", async () => {
    const root = tempDir("openassist-quickstart-service-loopback-");
    const configPath = path.join(root, "openassist.toml");
    const envPath = path.join(root, "openassistd.env");
    const installDir = root;
    const bindPort = await getFreePort();
    fs.mkdirSync(path.join(installDir, "apps", "openassistd", "dist"), { recursive: true });
    fs.writeFileSync(path.join(installDir, "apps", "openassistd", "dist", "index.js"), "// test", "utf8");
    const state = loadSetupQuickstartState(configPath, envPath, installDir);

    let healthArg: string | string[] | undefined;
    const requestUrls: string[] = [];
    const validationContinuationAnswers = process.platform === "win32" ? ["true"] : [];
    const prompts = new ScriptedPromptAdapter([
      "false",
      "0.0.0.0",
      String(bindPort),
      "OpenAssist",
      "Pragmatic and concise",
      "Keep answers practical",
      "openai",
      "openai-main",
      "gpt-5.4",
      "",
      "default",
      "openai-key",
      "telegram",
      "telegram-main",
      "telegram-token",
      "123,456",
      "Europe",
      "Europe/London",
      "true",
      "save",
      ...validationContinuationAnswers
    ]);

    const result = await runSetupQuickstart(
      state,
      {
        configPath,
        envFilePath: envPath,
        installDir,
        allowIncomplete: true,
        skipService: false,
        requireTty: false,
        preflightCommandChecks: false
      },
      prompts,
      {
        createServiceManagerFn: () => createFakeService(),
        waitForHealthyFn: async (baseUrl) => {
          healthArg = baseUrl;
          return {
            ok: true,
            status: 200,
            bodyText: "{\"status\":\"ok\"}"
          };
        },
        requestJsonFn: async (_method, url) => {
          requestUrls.push(url);
          return {
            status: 200,
            data: { status: "ok" }
          };
        }
      }
    );

    expect(result.saved).toBe(true);
    expect(Array.isArray(healthArg)).toBe(true);
    expect((healthArg as string[]).some((entry) => entry.includes("127.0.0.1"))).toBe(true);
    expect(requestUrls.some((url) => url.startsWith(`http://127.0.0.1:${bindPort}`))).toBe(true);
  });

  it("re-enters runtime to fix a busy port before saving", async () => {
    const root = tempDir("openassist-quickstart-runtime-fix-");
    const configPath = path.join(root, "openassist.toml");
    const envPath = path.join(root, "openassistd.env");
    const installDir = root;
    const busyPort = await getFreePort();
    const freePort = await getFreePort();
    const holder = net.createServer();
    holder.unref();
    await new Promise<void>((resolve, reject) => {
      holder.once("error", reject);
      holder.listen(busyPort, "127.0.0.1", () => resolve());
    });

    try {
      const state = loadSetupQuickstartState(configPath, envPath, installDir);
      const prompts = new ScriptedPromptAdapter([
        "false",
        "127.0.0.1",
        String(busyPort),
        "OpenAssist",
        "Pragmatic and concise",
        "Keep answers practical",
        "openai",
        "openai-main",
        "gpt-5.4",
        "",
        "default",
        "openai-key",
        "telegram",
        "telegram-main",
        "telegram-token",
      "123",
      "Europe",
      "Europe/London",
      "true",
      "save",
      "service-health",
      "false",
      "127.0.0.1",
      String(freePort)
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
      expect(state.config.runtime.bindPort).toBe(freePort);
    } finally {
      await new Promise<void>((resolve, reject) => {
        holder.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    }
  });

  it("re-enters provider, channel, and time stages until validation passes", async () => {
    const root = tempDir("openassist-quickstart-repair-flow-");
    const configPath = path.join(root, "openassist.toml");
    const envPath = path.join(root, "openassistd.env");
    const installDir = root;
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
      "default",
      "",
      "telegram",
      "telegram-main",
      "",
      "",
      "Europe",
      "Europe/London",
      "false",
      "save",
      "provider-auth",
      "false",
      "openai",
      "openai-main",
      "gpt-5.4",
      "",
      "default",
      "openai-key",
      "channel-auth-routing",
      "telegram",
      "false",
      "telegram-main",
      "telegram-token",
      "123",
      "timezone-time",
      "Europe",
      "Europe/London",
      "true"
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
    expect(state.env.OPENASSIST_PROVIDER_OPENAI_MAIN_API_KEY).toBe("openai-key");
    expect(state.env.OPENASSIST_CHANNEL_TELEGRAM_MAIN_BOT_TOKEN).toBe("telegram-token");
    expect(state.config.runtime.time.defaultTimezone).toBe("Europe/London");
    expect(result.summary.some((line) => line.includes("Service state: Service checks skipped"))).toBe(true);
  });
});
