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

async function basePromptAnswers(bindPort: number): Promise<string[]> {
  return [
    "127.0.0.1",
    String(bindPort),
    "operator",
    ".openassist/data",
    ".openassist/skills",
    ".openassist/logs",
    "openai",
    "openai-main",
    "gpt-5.2",
    ""
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
      ...(await basePromptAnswers(bindPort)),
      "",
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
      "false",
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
      ...(await basePromptAnswers(bindPort)),
      "",
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
      "false",
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

  it("covers whatsapp channel path plus cron skill task with output and remove branch", async () => {
    const root = tempDir("openassist-quickstart-branches-");
    const configPath = path.join(root, "openassist.toml");
    const envPath = path.join(root, "openassistd.env");
    const installDir = root;
    const bindPort = await getFreePort();
    const state = loadSetupQuickstartState(configPath, envPath, installDir);

    const prompts = new ScriptedPromptAdapter([
      ...(await basePromptAnswers(bindPort)),
      "openai-key",
      "true",
      "anthropic",
      "anthropic-main",
      "claude-sonnet-4-5",
      "",
      "",
      "false",
      "openai-main",
      "true",
      "upsert",
      "whatsapp-md",
      "whatsapp-main",
      "true",
      "experimental",
      "true",
      "false",
      "5",
      "4000",
      "upsert",
      "telegram",
      "telegram-main",
      "true",
      "true",
      "telegram-token",
      "111,222",
      "remove",
      "telegram-main",
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
      "backfill",
      "true",
      "skill-task",
      "cron",
      "skip",
      "",
      "120",
      "skill",
      "ops-audit",
      "scripts/run.mjs",
      "true",
      "whatsapp-main",
      "ops-room",
      "Task {{result}}",
      "0 */5 * * * *"
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
    expect(result.validationWarnings).toBeGreaterThanOrEqual(1);
    expect(state.config.runtime.channels.some((channel) => channel.id === "whatsapp-main")).toBe(true);
    expect(state.config.runtime.channels.some((channel) => channel.id === "telegram-main")).toBe(false);
    expect(state.config.runtime.scheduler.tasks.some((task) => task.id === "skill-task")).toBe(true);
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

    let installCalls = 0;
    let restartCalls = 0;
    const requestCalls: Array<{ method: string; url: string }> = [];

    const fakeService: ServiceManagerAdapter = {
      kind: process.platform === "darwin" ? "launchd" : "systemd-user",
      async install(): Promise<void> {
        installCalls += 1;
      },
      async uninstall(): Promise<void> {
        // no-op
      },
      async start(): Promise<void> {
        // no-op
      },
      async stop(): Promise<void> {
        // no-op
      },
      async restart(): Promise<void> {
        restartCalls += 1;
      },
      async status(): Promise<void> {
        // no-op
      },
      async logs(): Promise<void> {
        // no-op
      },
      async enable(): Promise<void> {
        // no-op
      },
      async disable(): Promise<void> {
        // no-op
      },
      async isInstalled(): Promise<boolean> {
        return true;
      }
    };

    const prompts = new ScriptedPromptAdapter([
      ...(await basePromptAnswers(bindPort)),
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
      "false",
      "true"
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
        createServiceManagerFn: () => fakeService,
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
    expect(installCalls).toBe(1);
    expect(restartCalls).toBe(1);
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

    const fakeService: ServiceManagerAdapter = {
      kind: process.platform === "darwin" ? "launchd" : "systemd-user",
      async install(): Promise<void> {
        // no-op
      },
      async uninstall(): Promise<void> {
        // no-op
      },
      async start(): Promise<void> {
        // no-op
      },
      async stop(): Promise<void> {
        // no-op
      },
      async restart(): Promise<void> {
        // no-op
      },
      async status(): Promise<void> {
        // no-op
      },
      async logs(): Promise<void> {
        // no-op
      },
      async enable(): Promise<void> {
        // no-op
      },
      async disable(): Promise<void> {
        // no-op
      },
      async isInstalled(): Promise<boolean> {
        return true;
      }
    };

    const validationContinuationAnswers = process.platform === "win32" ? ["true"] : [];

    const prompts = new ScriptedPromptAdapter([
      ...(await basePromptAnswers(bindPort)),
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
      "false",
      ...validationContinuationAnswers,
      "skip"
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
        createServiceManagerFn: () => fakeService,
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
    expect(result.summary.some((line) => line.includes("Service and health step: failed"))).toBe(true);
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

    const fakeService: ServiceManagerAdapter = {
      kind: process.platform === "darwin" ? "launchd" : "systemd-user",
      async install(): Promise<void> {
        // no-op
      },
      async uninstall(): Promise<void> {
        // no-op
      },
      async start(): Promise<void> {
        // no-op
      },
      async stop(): Promise<void> {
        // no-op
      },
      async restart(): Promise<void> {
        // no-op
      },
      async status(): Promise<void> {
        // no-op
      },
      async logs(): Promise<void> {
        // no-op
      },
      async enable(): Promise<void> {
        // no-op
      },
      async disable(): Promise<void> {
        // no-op
      },
      async isInstalled(): Promise<boolean> {
        return true;
      }
    };

    const validationContinuationAnswers = process.platform === "win32" ? ["true"] : [];

    const prompts = new ScriptedPromptAdapter([
      ...(await basePromptAnswers(bindPort)),
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
      "false",
      ...validationContinuationAnswers,
      "abort"
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
        createServiceManagerFn: () => fakeService,
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

    const fakeService: ServiceManagerAdapter = {
      kind: process.platform === "darwin" ? "launchd" : "systemd-user",
      async install(): Promise<void> {
        // no-op
      },
      async uninstall(): Promise<void> {
        // no-op
      },
      async start(): Promise<void> {
        // no-op
      },
      async stop(): Promise<void> {
        // no-op
      },
      async restart(): Promise<void> {
        // no-op
      },
      async status(): Promise<void> {
        // no-op
      },
      async logs(): Promise<void> {
        // no-op
      },
      async enable(): Promise<void> {
        // no-op
      },
      async disable(): Promise<void> {
        // no-op
      },
      async isInstalled(): Promise<boolean> {
        return true;
      }
    };

    const prompts = new ScriptedPromptAdapter([
      ...(await basePromptAnswers(bindPort)),
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
      "false",
      "abort"
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
        createServiceManagerFn: () => fakeService,
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

  it("uses loopback health probe urls when bind address is wildcard", async () => {
    const root = tempDir("openassist-quickstart-service-loopback-");
    const configPath = path.join(root, "openassist.toml");
    const envPath = path.join(root, "openassistd.env");
    const installDir = root;
    const bindPort = await getFreePort();
    fs.mkdirSync(path.join(installDir, "apps", "openassistd", "dist"), { recursive: true });
    fs.writeFileSync(path.join(installDir, "apps", "openassistd", "dist", "index.js"), "// test", "utf8");
    const state = loadSetupQuickstartState(configPath, envPath, installDir);

    const fakeService: ServiceManagerAdapter = {
      kind: process.platform === "darwin" ? "launchd" : "systemd-user",
      async install(): Promise<void> {
        // no-op
      },
      async uninstall(): Promise<void> {
        // no-op
      },
      async start(): Promise<void> {
        // no-op
      },
      async stop(): Promise<void> {
        // no-op
      },
      async restart(): Promise<void> {
        // no-op
      },
      async status(): Promise<void> {
        // no-op
      },
      async logs(): Promise<void> {
        // no-op
      },
      async enable(): Promise<void> {
        // no-op
      },
      async disable(): Promise<void> {
        // no-op
      },
      async isInstalled(): Promise<boolean> {
        return true;
      }
    };

    let healthArg: string | string[] | undefined;
    const requestUrls: string[] = [];
    const prompts = new ScriptedPromptAdapter([
      "0.0.0.0",
      String(bindPort),
      "operator",
      ".openassist/data",
      ".openassist/skills",
      ".openassist/logs",
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
      "false",
      "true"
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
        createServiceManagerFn: () => fakeService,
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
});
