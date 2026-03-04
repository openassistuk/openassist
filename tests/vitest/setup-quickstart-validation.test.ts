import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createDefaultConfigObject, toProviderApiKeyEnvVar } from "../../apps/openassist-cli/src/lib/config-edit.js";
import { validateSetupReadiness } from "../../apps/openassist-cli/src/lib/setup-validation.js";

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

describe("setup quickstart validation", () => {
  it("flags missing default provider auth and timezone confirmation", async () => {
    const root = tempDir("openassist-quickstart-validation-");
    const config = createDefaultConfigObject();
    config.runtime.bindPort = await getFreePort();
    const result = await validateSetupReadiness({
      config,
      env: {},
      configPath: path.join(root, "openassist.toml"),
      envFilePath: path.join(root, "openassistd.env"),
      installDir: root,
      skipService: true,
      timezoneConfirmed: false
    });

    const codes = new Set(result.errors.map((item) => item.code));
    expect(codes.has("provider.default_auth_missing")).toBe(true);
    expect(codes.has("time.timezone_unconfirmed")).toBe(true);
  });

  it("passes strict checks with provider auth and timezone confirmed", async () => {
    const root = tempDir("openassist-quickstart-validation-ok-");
    const config = createDefaultConfigObject();
    config.runtime.bindPort = await getFreePort();
    const apiKeyVar = toProviderApiKeyEnvVar(config.runtime.defaultProviderId);
    const result = await validateSetupReadiness({
      config,
      env: {
        [apiKeyVar]: "test-key"
      },
      configPath: path.join(root, "openassist.toml"),
      envFilePath: path.join(root, "openassistd.env"),
      installDir: root,
      skipService: true,
      timezoneConfirmed: true
    });

    expect(result.errors).toEqual([]);
  });

  it("flags unresolved channel env references", async () => {
    const root = tempDir("openassist-quickstart-validation-channel-");
    const config = createDefaultConfigObject();
    config.runtime.bindPort = await getFreePort();
    const apiKeyVar = toProviderApiKeyEnvVar(config.runtime.defaultProviderId);
    config.runtime.channels.push({
      id: "telegram-main",
      type: "telegram",
      enabled: true,
      settings: {
        botToken: "env:OPENASSIST_CHANNEL_TELEGRAM_MAIN_BOT_TOKEN"
      }
    });

    const result = await validateSetupReadiness({
      config,
      env: {
        [apiKeyVar]: "test-key"
      },
      configPath: path.join(root, "openassist.toml"),
      envFilePath: path.join(root, "openassistd.env"),
      installDir: root,
      skipService: true,
      timezoneConfirmed: true
    });

    expect(result.errors.some((item) => item.code === "channel.env_ref_unresolved")).toBe(true);
  });

  it("checks service readiness when service is requested", async () => {
    const root = tempDir("openassist-quickstart-validation-service-");
    const config = createDefaultConfigObject();
    config.runtime.bindPort = await getFreePort();
    const apiKeyVar = toProviderApiKeyEnvVar(config.runtime.defaultProviderId);

    const result = await validateSetupReadiness({
      config,
      env: {
        [apiKeyVar]: "test-key"
      },
      configPath: path.join(root, "openassist.toml"),
      envFilePath: path.join(root, "openassistd.env"),
      installDir: root,
      skipService: false,
      timezoneConfirmed: true
    });

    const codes = new Set(result.errors.map((item) => item.code));
    const hasServiceSignal = codes.has("service.daemon_missing") || codes.has("service.unsupported_platform");
    expect(hasServiceSignal).toBe(true);
  });

  it("warns when default provider uses OAuth without API key during onboarding", async () => {
    const root = tempDir("openassist-quickstart-validation-oauth-warning-");
    const config = createDefaultConfigObject();
    config.runtime.bindPort = await getFreePort();
    config.runtime.providers[0].oauth = {
      authorizeUrl: "https://example.test/oauth/authorize",
      tokenUrl: "https://example.test/oauth/token",
      clientId: "client-id",
      clientSecretEnv: "OPENASSIST_OPENAI_OAUTH_CLIENT_SECRET"
    };

    const result = await validateSetupReadiness({
      config,
      env: {},
      configPath: path.join(root, "openassist.toml"),
      envFilePath: path.join(root, "openassistd.env"),
      installDir: root,
      skipService: true,
      timezoneConfirmed: true
    });

    expect(result.errors.some((item) => item.code === "provider.default_auth_missing")).toBe(false);
    expect(result.warnings.some((item) => item.code === "provider.default_oauth_pending")).toBe(true);
  });
});
