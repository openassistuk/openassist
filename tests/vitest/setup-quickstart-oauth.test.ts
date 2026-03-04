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

describe("setup quickstart oauth path", () => {
  it("supports oauth configuration and interactive oauth start after health", async () => {
    const root = tempDir("openassist-quickstart-oauth-");
    const configPath = path.join(root, "openassist.toml");
    const envPath = path.join(root, "openassistd.env");
    const installDir = root;
    const bindPort = await getFreePort();
    fs.mkdirSync(path.join(installDir, "apps", "openassistd", "dist"), { recursive: true });
    fs.writeFileSync(path.join(installDir, "apps", "openassistd", "dist", "index.js"), "// test", "utf8");

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

    const requestCalls: Array<{ method: string; url: string }> = [];
    const windowsValidationContinuation = process.platform === "win32" ? ["true"] : [];
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
      "api-key-and-oauth",
      "https://example.test/oauth/authorize",
      "https://example.test/oauth/token",
      "client-123",
      "OPENASSIST_PROVIDER_OPENAI_MAIN_OAUTH_CLIENT_SECRET",
      "openid,profile",
      "",
      "true",
      "oauth-client-secret-value",
      "openai-api-key",
      "false",
      "openai-main",
      "false",
      "Europe/London",
      "warn-degrade",
      "300",
      "10000",
      "true",
      "Europe/London",
      "false",
      "1000",
      "30",
      "catch-up-once",
      "false",
      ...windowsValidationContinuation,
      "true",
      "true"
    ]);

    const state = loadSetupQuickstartState(configPath, envPath, installDir);
    const restoreTty = setTty(true);
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
        prompts,
        {
          createServiceManagerFn: () => fakeService,
          waitForHealthyFn: async (baseUrl) => ({
            ok: true,
            status: 200,
            bodyText: "{\"status\":\"ok\"}",
            baseUrl: Array.isArray(baseUrl) ? baseUrl[0] : baseUrl
          }),
          requestJsonFn: async (method, url) => {
            requestCalls.push({ method, url });
            if (url.includes("/v1/oauth/") && url.endsWith("/start")) {
              return {
                status: 200,
                data: {
                  authorizationUrl: "https://example.test/oauth/start",
                  state: "state-1",
                  accountId: "default"
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
      expect(state.config.runtime.providers[0]?.oauth?.clientId).toBe("client-123");
      expect(state.config.runtime.providers[0]?.oauth?.scopes).toEqual(["openid", "profile"]);
      expect(state.env.OPENASSIST_PROVIDER_OPENAI_MAIN_API_KEY).toBe("openai-api-key");
      expect(state.env.OPENASSIST_PROVIDER_OPENAI_MAIN_OAUTH_CLIENT_SECRET).toBe(
        "oauth-client-secret-value"
      );
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

