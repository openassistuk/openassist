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

function setTty(value: boolean): () => void {
  const stdinDescriptor = Object.getOwnPropertyDescriptor(process.stdin, "isTTY");
  const stdoutDescriptor = Object.getOwnPropertyDescriptor(process.stdout, "isTTY");
  Object.defineProperty(process.stdin, "isTTY", {
    configurable: true,
    value
  });
  Object.defineProperty(process.stdout, "isTTY", {
    configurable: true,
    value
  });
  return () => {
    if (stdinDescriptor) {
      Object.defineProperty(process.stdin, "isTTY", stdinDescriptor);
    } else {
      delete (process.stdin as Record<string, unknown>).isTTY;
    }
    if (stdoutDescriptor) {
      Object.defineProperty(process.stdout, "isTTY", stdoutDescriptor);
    } else {
      delete (process.stdout as Record<string, unknown>).isTTY;
    }
  };
}

function createFakeService(): ServiceManagerAdapter {
  return {
    kind: process.platform === "darwin" ? "launchd" : "systemd-user",
    async install(): Promise<void> {},
    async uninstall(): Promise<void> {},
    async start(): Promise<void> {},
    async stop(): Promise<void> {},
    async restart(): Promise<void> {},
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
    "gpt-5.2",
    "",
    "openai-api-key",
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

describe("setup quickstart oauth path", () => {
  it("keeps API-key-first onboarding while allowing post-health oauth account linking", async () => {
    const root = tempDir("openassist-quickstart-oauth-");
    const configPath = path.join(root, "openassist.toml");
    const envPath = path.join(root, "openassistd.env");
    const installDir = root;
    const bindPort = await getFreePort();
    fs.mkdirSync(path.join(installDir, "apps", "openassistd", "dist"), { recursive: true });
    fs.writeFileSync(path.join(installDir, "apps", "openassistd", "dist", "index.js"), "// test", "utf8");

    const state = loadSetupQuickstartState(configPath, envPath, installDir);
    state.config.runtime.providers = [
      {
        id: "openai-main",
        type: "openai",
        defaultModel: "gpt-5.2",
        oauth: {
          authorizeUrl: "https://example.test/oauth/authorize",
          tokenUrl: "https://example.test/oauth/token",
          clientId: "client-123",
          clientSecretEnv: "OPENASSIST_PROVIDER_OPENAI_MAIN_OAUTH_CLIENT_SECRET",
          scopes: ["openid", "profile"]
        }
      }
    ];
    state.config.runtime.defaultProviderId = "openai-main";

    const requestCalls: Array<{ method: string; url: string }> = [];
    const restoreTty = setTty(true);
    const validationContinuationAnswers = process.platform === "win32" ? ["true"] : [];

    try {
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
        new ScriptedPromptAdapter(validQuickstartAnswers(bindPort, [...validationContinuationAnswers, "true", "true"])),
        {
          createServiceManagerFn: () => createFakeService(),
          waitForHealthyFn: async (baseUrl) => ({
            ok: true,
            status: 200,
            bodyText: "{\"status\":\"ok\"}",
            baseUrl: Array.isArray(baseUrl) ? baseUrl[0] : baseUrl
          }),
          requestJsonFn: async (method, url) => {
            requestCalls.push({ method, url });
            if (url.endsWith("/start")) {
              return {
                status: 200,
                data: {
                  authorizationUrl: "https://example.test/oauth/start"
                }
              };
            }
            return {
              status: 200,
              data: { status: "ok" }
            };
          }
        }
      );

      expect(result.saved).toBe(true);
      expect(state.env.OPENASSIST_PROVIDER_OPENAI_MAIN_API_KEY).toBe("openai-api-key");
      expect(state.config.runtime.providers[0]?.oauth?.clientId).toBe("client-123");
      expect(
        requestCalls.some(
          (entry) => entry.method === "POST" && entry.url.includes("/v1/time/timezone/confirm")
        )
      ).toBe(true);
      expect(
        requestCalls.some(
          (entry) => entry.method === "POST" && entry.url.includes("/v1/oauth/openai-main/start")
        )
      ).toBe(true);
    } finally {
      restoreTty();
    }
  });
});
