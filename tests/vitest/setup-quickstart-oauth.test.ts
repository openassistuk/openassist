import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
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

function validCodexQuickstartAnswers(bindPort: number, extra: string[] = []): string[] {
  return [
    "false",
    "127.0.0.1",
    String(bindPort),
    "OpenAssist",
    "Pragmatic and concise",
    "Keep answers practical",
    "codex",
    "codex-main",
    "gpt-5.4",
    "",
    "default",
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
  it("guides Codex account linking as a first-class quickstart provider path", async () => {
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
        id: "codex-main",
        type: "codex",
        defaultModel: "gpt-5.4",
      }
    ];
    state.config.runtime.defaultProviderId = "codex-main";

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
        new ScriptedPromptAdapter(
          validCodexQuickstartAnswers(bindPort, [
            ...validationContinuationAnswers,
            "true",
            "true",
            "true",
            "https://127.0.0.1:3344/v1/oauth/codex-main/callback?state=state-codex&code=auth-code-1"
          ])
        ),
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
            if (url.endsWith("/v1/time/status")) {
              return {
                status: 200,
                data: {
                  time: {
                    timezone: "Europe/London",
                    timezoneConfirmed: true,
                    clockHealth: "healthy"
                  }
                }
              };
            }
            if (url.endsWith("/v1/scheduler/status")) {
              return {
                status: 200,
                data: {
                  scheduler: {
                    running: true,
                    enabled: true,
                    taskCount: 0,
                    timezone: "Europe/London"
                  }
                }
              };
            }
            if (url.endsWith("/start")) {
              return {
                status: 200,
                data: {
                  authorizationUrl: "https://example.test/oauth/start",
                  state: "state-codex"
                }
              };
            }
            if (url.endsWith("/complete")) {
              return {
                status: 200,
                data: {
                  accountId: "default",
                  expiresAt: new Date(Date.now() + 60_000).toISOString()
                }
              };
            }
            if (url.endsWith("/status")) {
              return {
                status: 200,
                data: {
                  accounts: [{ accountId: "default" }]
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
      expect(state.env.OPENASSIST_PROVIDER_CODEX_MAIN_API_KEY).toBeUndefined();
      expect(state.config.runtime.providers[0]).toMatchObject({
        id: "codex-main",
        type: "codex"
      });
      expect(state.config.runtime.providers[0]).not.toHaveProperty("reasoningEffort");
      expect(
        result.summary.some((line) => line.includes("Provider tuning: Reasoning effort: Default (recommended)"))
      ).toBe(true);
      expect(
        requestCalls.some(
          (entry) => entry.method === "POST" && entry.url.includes("/v1/time/timezone/confirm")
        )
      ).toBe(true);
      expect(
        requestCalls.some(
          (entry) => entry.method === "POST" && entry.url.includes("/v1/oauth/codex-main/start")
        )
      ).toBe(true);
      expect(
        requestCalls.some(
          (entry) => entry.method === "POST" && entry.url.includes("/v1/oauth/codex-main/complete")
        )
      ).toBe(true);
      expect(
        requestCalls.some(
          (entry) => entry.method === "GET" && entry.url.includes("/v1/oauth/codex-main/status")
        )
      ).toBe(true);
    } finally {
      restoreTty();
    }
  });

  it("retries default Codex account linking without misreporting a service failure", async () => {
    const root = tempDir("openassist-quickstart-oauth-retry-");
    const configPath = path.join(root, "openassist.toml");
    const envPath = path.join(root, "openassistd.env");
    const installDir = root;
    const bindPort = await getFreePort();
    fs.mkdirSync(path.join(installDir, "apps", "openassistd", "dist"), { recursive: true });
    fs.writeFileSync(path.join(installDir, "apps", "openassistd", "dist", "index.js"), "// test", "utf8");

    const state = loadSetupQuickstartState(configPath, envPath, installDir);
    state.config.runtime.providers = [
      {
        id: "codex-main",
        type: "codex",
        defaultModel: "gpt-5.4",
      }
    ];
    state.config.runtime.defaultProviderId = "codex-main";

    const requestCalls: Array<{ method: string; url: string }> = [];
    const restoreTty = setTty(true);
    const validationContinuationAnswers = process.platform === "win32" ? ["true"] : [];
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

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
        new ScriptedPromptAdapter(
          validCodexQuickstartAnswers(bindPort, [
            ...validationContinuationAnswers,
            "true",
            "true",
            "false",
            "retry",
            "true",
            "true",
            "true",
            "https://127.0.0.1:3344/v1/oauth/codex-main/callback?state=state-codex&code=auth-code-2"
          ])
        ),
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
            if (url.endsWith("/v1/time/status")) {
              return {
                status: 200,
                data: {
                  time: {
                    timezone: "Europe/London",
                    timezoneConfirmed: true,
                    clockHealth: "healthy"
                  }
                }
              };
            }
            if (url.endsWith("/v1/scheduler/status")) {
              return {
                status: 200,
                data: {
                  scheduler: {
                    running: true,
                    enabled: true,
                    taskCount: 0,
                    timezone: "Europe/London"
                  }
                }
              };
            }
            if (url.endsWith("/start")) {
              return {
                status: 200,
                data: {
                  authorizationUrl: "https://example.test/oauth/start",
                  state: "state-codex"
                }
              };
            }
            if (url.endsWith("/complete")) {
              return {
                status: 200,
                data: {
                  accountId: "default",
                  expiresAt: new Date(Date.now() + 60_000).toISOString()
                }
              };
            }
            if (url.endsWith("/status")) {
              return {
                status: 200,
                data: {
                  accounts: [{ accountId: "default" }]
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
      expect(state.config.runtime.providers[0]).not.toHaveProperty("reasoningEffort");
      expect(
        requestCalls.filter(
          (entry) => entry.method === "POST" && entry.url.includes("/v1/oauth/codex-main/start")
        ).length
      ).toBe(2);
      const errorOutput = errorSpy.mock.calls.flat().join("\n");
      expect(errorOutput).toContain("Account linking still needs attention");
      expect(errorOutput).toContain("The daemon is already healthy. This is an account-linking step, not a service failure.");
      expect(errorOutput).toMatch(
        /openassist auth start --provider codex-main --account default --open-browser --base-url http:\/\/127\.0\.0\.1:\d+/
      );
      expect(errorOutput).not.toContain("Service + health step failed");
      expect(errorOutput).not.toContain("systemctl status openassistd.service");
    } finally {
      errorSpy.mockRestore();
      restoreTty();
    }
  });
});
