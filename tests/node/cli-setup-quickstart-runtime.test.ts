import assert from "node:assert/strict";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
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

const noopAsync = async (..._args: unknown[]): Promise<void> => {
  // no-op for test stubs
};

function createFakeService(counters?: { installCalls: number; restartCalls: number }): ServiceManagerAdapter {
  return {
    kind: process.platform === "darwin" ? "launchd" : "systemd-user",
    async install(): Promise<void> {
      if (counters) {
        counters.installCalls += 1;
      }
    },
    uninstall: noopAsync as ServiceManagerAdapter["uninstall"],
    start: noopAsync as ServiceManagerAdapter["start"],
    stop: noopAsync as ServiceManagerAdapter["stop"],
    async restart(): Promise<void> {
      if (counters) {
        counters.restartCalls += 1;
      }
    },
    status: noopAsync as ServiceManagerAdapter["status"],
    logs: noopAsync as ServiceManagerAdapter["logs"],
    enable: noopAsync as ServiceManagerAdapter["enable"],
    disable: noopAsync as ServiceManagerAdapter["disable"],
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

describe("cli setup quickstart runtime coverage", () => {
  it("returns unsaved when validation fails and the operator aborts", async () => {
    const root = tempDir("openassist-node-quickstart-abort-");
    const configPath = path.join(root, "openassist.toml");
    const envPath = path.join(root, "openassistd.env");
    const installDir = root;
    const bindPort = await getFreePort();
    const state = loadSetupQuickstartState(configPath, envPath, installDir);

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

    assert.equal(result.saved, false);
    assert.ok(result.validationErrors > 0);
    assert.equal(fs.existsSync(configPath), false);
  });

  it("supports explicit allow-incomplete continuation after validation errors", async () => {
    const root = tempDir("openassist-node-quickstart-allow-incomplete-");
    const configPath = path.join(root, "openassist.toml");
    const envPath = path.join(root, "openassistd.env");
    const installDir = root;
    const bindPort = await getFreePort();
    const state = loadSetupQuickstartState(configPath, envPath, installDir);

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

    assert.equal(result.saved, true);
    assert.ok(result.validationErrors > 0);
    assert.equal(fs.existsSync(configPath), true);
  });

  it("runs minimal first-reply onboarding and saves config/env", async () => {
    const root = tempDir("openassist-node-quickstart-");
    const configPath = path.join(root, "openassist.toml");
    const envPath = path.join(root, "openassistd.env");
    const installDir = root;
    const bindPort = await getFreePort();
    const state = loadSetupQuickstartState(configPath, envPath, installDir);

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
      new ScriptedPromptAdapter(validQuickstartAnswers(bindPort))
    );

    assert.equal(result.saved, true);
    assert.equal(result.validationErrors, 0);
    assert.equal(fs.existsSync(configPath), true);
    assert.equal(fs.existsSync(envPath), true);
    assert.match(fs.readFileSync(configPath, "utf8"), /defaultProviderId = "openai-main"/);
    assert.match(fs.readFileSync(configPath, "utf8"), /promptOnFirstContact = false/);
    assert.match(fs.readFileSync(configPath, "utf8"), /\[\[runtime\.channels\]\]/);
    assert.ok(result.summary.some((line) => line.includes("Assistant identity: OpenAssist")));
    assert.ok(result.summary.some((line) => line.includes("Quickstart saved")));
    assert.ok(result.summary.some((line) => line.includes("First reply checklist:")));
  });

  it("runs service step through dependency stubs", async () => {
    const root = tempDir("openassist-node-quickstart-service-");
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
      new ScriptedPromptAdapter(validQuickstartAnswers(bindPort, validationContinuationAnswers)),
      {
        createServiceManagerFn: () => createFakeService(counters),
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

    assert.equal(result.saved, true);
    assert.equal(result.serviceHealthOk, true);
    assert.equal(counters.installCalls, 1);
    assert.equal(counters.restartCalls, 1);
    assert.equal(
      requestCalls.some((call) => call.method === "POST" && call.url.includes("/v1/time/timezone/confirm")),
      true
    );
    assert.ok(requestCalls.filter((call) => call.method === "GET").length >= 2);
  });

  it("supports skip recovery for failed service checks when allow-incomplete is enabled", async () => {
    const root = tempDir("openassist-node-quickstart-service-skip-");
    const configPath = path.join(root, "openassist.toml");
    const envPath = path.join(root, "openassistd.env");
    const installDir = root;
    const bindPort = await getFreePort();
    fs.mkdirSync(path.join(installDir, "apps", "openassistd", "dist"), { recursive: true });
    fs.writeFileSync(path.join(installDir, "apps", "openassistd", "dist", "index.js"), "// test", "utf8");
    const state = loadSetupQuickstartState(configPath, envPath, installDir);

    const validationContinuationAnswers = process.platform === "win32" ? ["true"] : [];

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
      new ScriptedPromptAdapter(validQuickstartAnswers(bindPort, [...validationContinuationAnswers, "skip"])),
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

    assert.equal(result.saved, true);
    assert.equal(result.serviceHealthOk, false);
    assert.equal(result.postSaveAborted, false);
    assert.match(result.postSaveError ?? "", /daemon health is failing/i);
  });

  it("supports abort recovery for failed service checks", async () => {
    const root = tempDir("openassist-node-quickstart-service-abort-");
    const configPath = path.join(root, "openassist.toml");
    const envPath = path.join(root, "openassistd.env");
    const installDir = root;
    const bindPort = await getFreePort();
    fs.mkdirSync(path.join(installDir, "apps", "openassistd", "dist"), { recursive: true });
    fs.writeFileSync(path.join(installDir, "apps", "openassistd", "dist", "index.js"), "// test", "utf8");
    const state = loadSetupQuickstartState(configPath, envPath, installDir);

    const validationContinuationAnswers = process.platform === "win32" ? ["true"] : [];

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
      new ScriptedPromptAdapter(validQuickstartAnswers(bindPort, [...validationContinuationAnswers, "abort"])),
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

    assert.equal(result.saved, true);
    assert.equal(result.serviceHealthOk, false);
    assert.equal(result.postSaveAborted, true);
    assert.match(result.postSaveError ?? "", /daemon health is failing/i);
  });

  it("covers service stub helper methods", async () => {
    const counters = { installCalls: 0, restartCalls: 0 };
    const service = createFakeService(counters);
    await service.install({
      installDir: ".",
      configPath: ".",
      envFilePath: ".",
      repoRoot: "."
    });
    await service.uninstall();
    await service.start();
    await service.stop();
    await service.restart();
    await service.status();
    await service.logs(10, false);
    await service.enable();
    await service.disable();
    assert.equal(await service.isInstalled(), true);
    assert.equal(counters.installCalls, 1);
    assert.equal(counters.restartCalls, 1);
  });

  it("uses loopback health probe urls when the bind address is wildcard", async () => {
    const root = tempDir("openassist-node-quickstart-loopback-");
    const configPath = path.join(root, "openassist.toml");
    const envPath = path.join(root, "openassistd.env");
    const installDir = root;
    const bindPort = await getFreePort();
    const state = loadSetupQuickstartState(configPath, envPath, installDir);
    fs.mkdirSync(path.join(installDir, "apps", "openassistd", "dist"), { recursive: true });
    fs.writeFileSync(path.join(installDir, "apps", "openassistd", "dist", "index.js"), "// test", "utf8");

    let healthArg: string | string[] | undefined;
    const requestUrls: string[] = [];
    const validationContinuationAnswers = process.platform === "win32" ? ["true"] : [];

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
      new ScriptedPromptAdapter([
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
      ]),
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

    assert.equal(result.saved, true);
    assert.equal(Array.isArray(healthArg), true);
    assert.equal((healthArg as string[]).some((entry) => entry.includes("127.0.0.1")), true);
    assert.equal(requestUrls.some((url) => url.startsWith(`http://127.0.0.1:${bindPort}`)), true);
  });

  it("re-enters runtime to fix a busy port before saving", async () => {
    const root = tempDir("openassist-node-quickstart-runtime-fix-");
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
        new ScriptedPromptAdapter([
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
        ])
      );

      assert.equal(result.saved, true);
      assert.equal(result.validationErrors, 0);
      assert.equal(state.config.runtime.bindPort, freePort);
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
    const root = tempDir("openassist-node-quickstart-repair-flow-");
    const configPath = path.join(root, "openassist.toml");
    const envPath = path.join(root, "openassistd.env");
    const installDir = root;
    const state = loadSetupQuickstartState(configPath, envPath, installDir);
    state.config.runtime.bindPort = await getFreePort();

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
      new ScriptedPromptAdapter([
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
      ])
    );

    assert.equal(result.saved, true);
    assert.equal(result.validationErrors, 0);
    assert.equal(state.env.OPENASSIST_PROVIDER_OPENAI_MAIN_API_KEY, "openai-key");
    assert.equal(state.env.OPENASSIST_CHANNEL_TELEGRAM_MAIN_BOT_TOKEN, "telegram-token");
    assert.equal(state.config.runtime.time.defaultTimezone, "Europe/London");
    assert.equal(result.summary.some((line) => line.includes("Service state: Service checks skipped")), true);
  });
});
