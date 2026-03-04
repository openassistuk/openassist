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

describe("cli setup quickstart runtime coverage", () => {
  it("runs strict onboarding flow and saves config/env", async () => {
    const root = tempDir("openassist-node-quickstart-");
    const configPath = path.join(root, "openassist.toml");
    const envPath = path.join(root, "openassistd.env");
    const installDir = root;
    const bindPort = await getFreePort();
    const state = loadSetupQuickstartState(configPath, envPath, installDir);

    const prompts = new ScriptedPromptAdapter([
      "127.0.0.1",
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

    assert.equal(result.saved, true);
    assert.equal(result.validationErrors, 0);
    assert.equal(fs.existsSync(configPath), true);
    assert.equal(fs.existsSync(envPath), true);
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
    const fakeService = createFakeService(counters);

    const prompts = new ScriptedPromptAdapter([
      "127.0.0.1",
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
        waitForHealthyFn: async () => ({
          ok: true,
          status: 200,
          bodyText: "{\"status\":\"ok\"}"
        }),
        requestJsonFn: async () => ({
          status: 200,
          data: { status: "ok" }
        })
      }
    );

    assert.equal(result.saved, true);
    assert.equal(result.serviceHealthOk, true);
    assert.equal(counters.installCalls, 1);
    assert.equal(counters.restartCalls, 1);
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

    const fakeService = createFakeService();
    const validationContinuationAnswers = process.platform === "win32" ? ["true"] : [];

    const prompts = new ScriptedPromptAdapter([
      "127.0.0.1",
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

    const fakeService = createFakeService();
    const validationContinuationAnswers = process.platform === "win32" ? ["true"] : [];

    const prompts = new ScriptedPromptAdapter([
      "127.0.0.1",
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
});
