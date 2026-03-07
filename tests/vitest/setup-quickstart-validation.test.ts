import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  createDefaultConfigObject,
  toProviderApiKeyEnvVar,
  toWebBraveApiKeyEnvVar
} from "../../apps/openassist-cli/src/lib/config-edit.js";
import {
  renderValidationIssues,
  validateSetupReadiness
} from "../../apps/openassist-cli/src/lib/setup-validation.js";

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

  it("requires one enabled channel when quickstart is validating first-reply readiness", async () => {
    const root = tempDir("openassist-quickstart-validation-channel-required-");
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
      timezoneConfirmed: true,
      requireEnabledChannel: true
    });

    expect(result.errors.some((item) => item.code === "channel.enabled_required")).toBe(true);
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

  it("requires Brave API configuration in api-only web mode", async () => {
    const root = tempDir("openassist-quickstart-validation-web-api-only-");
    const config = createDefaultConfigObject();
    config.runtime.bindPort = await getFreePort();
    config.tools.web.searchMode = "api-only";
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

    expect(result.errors.some((item) => item.code === "tools.web_brave_api_key_missing")).toBe(true);
  });

  it("warns when hybrid web mode will run in fallback only", async () => {
    const root = tempDir("openassist-quickstart-validation-web-hybrid-");
    const config = createDefaultConfigObject();
    config.runtime.bindPort = await getFreePort();
    const apiKeyVar = toProviderApiKeyEnvVar(config.runtime.defaultProviderId);

    const result = await validateSetupReadiness({
      config,
      env: {
        [apiKeyVar]: "test-key",
        [toWebBraveApiKeyEnvVar()]: ""
      },
      configPath: path.join(root, "openassist.toml"),
      envFilePath: path.join(root, "openassistd.env"),
      installDir: root,
      skipService: true,
      timezoneConfirmed: true
    });

    expect(result.warnings.some((item) => item.code === "tools.web_hybrid_fallback_only")).toBe(true);
  });

  it("reports schema-invalid secret wiring before deeper readiness checks", async () => {
    const root = tempDir("openassist-quickstart-validation-schema-invalid-");
    const config = createDefaultConfigObject();
    config.runtime.bindPort = await getFreePort();
    config.runtime.providers[0].oauth = {
      authorizeUrl: "https://example.test/oauth/authorize",
      tokenUrl: "https://example.test/oauth/token",
      clientId: "client-id",
      clientSecretEnv: "bad-var!"
    };
    config.runtime.channels.push({
      id: "telegram-main",
      type: "telegram",
      enabled: true,
      settings: {
        botToken: "plaintext-token"
      }
    });

    const blockedPath = path.join(root, "blocked-data");
    fs.writeFileSync(blockedPath, "nope", "utf8");
    config.runtime.paths.dataDir = path.basename(blockedPath);

    const result = await validateSetupReadiness({
      config,
      env: {},
      configPath: path.join(root, "openassist.toml"),
      envFilePath: path.join(root, "openassistd.env"),
      installDir: root,
      skipService: true,
      timezoneConfirmed: true
    });

    const codes = new Set(result.errors.map((item) => item.code));
    expect(codes.has("config.schema_invalid")).toBe(true);
  });

  it("flags invalid bind addresses and blocked runtime paths after schema validation", async () => {
    const root = tempDir("openassist-quickstart-validation-bind-paths-");
    const config = createDefaultConfigObject();
    config.runtime.bindAddress = "bad host ???";
    config.runtime.bindPort = await getFreePort();
    config.runtime.providers[0].oauth = {
      authorizeUrl: "https://example.test/oauth/authorize",
      tokenUrl: "https://example.test/oauth/token",
      clientId: "client-id",
      clientSecretEnv: "OPENASSIST_PROVIDER_OPENAI_MAIN_OAUTH_CLIENT_SECRET"
    };
    config.runtime.channels.push({
      id: "telegram-main",
      type: "telegram",
      enabled: true,
      settings: {
        botToken: "env:OPENASSIST_CHANNEL_TELEGRAM_MAIN_BOT_TOKEN"
      }
    });
    const blockedPath = path.join(root, "blocked-data");
    fs.writeFileSync(blockedPath, "nope", "utf8");
    config.runtime.paths.dataDir = path.basename(blockedPath);
    const apiKeyVar = toProviderApiKeyEnvVar(config.runtime.defaultProviderId);

    const result = await validateSetupReadiness({
      config,
      env: {
        [apiKeyVar]: "test-key",
        OPENASSIST_CHANNEL_TELEGRAM_MAIN_BOT_TOKEN: "telegram-token"
      },
      configPath: path.join(root, "openassist.toml"),
      envFilePath: path.join(root, "openassistd.env"),
      installDir: root,
      skipService: true,
      timezoneConfirmed: true
    });

    const errorCodes = new Set(result.errors.map((item) => item.code));
    const warningCodes = new Set(result.warnings.map((item) => item.code));
    expect(errorCodes.has("runtime.bind_address_invalid")).toBe(true);
    expect(errorCodes.has("paths.not_writable")).toBe(true);
    expect(warningCodes.has("provider.oauth_client_secret_unset")).toBe(true);
  });

  it("flags experimental whatsapp and busy ports after schema validation", async () => {
    const root = tempDir("openassist-quickstart-validation-port-busy-");
    const config = createDefaultConfigObject();
    const bindPort = await getFreePort();
    config.runtime.bindPort = bindPort;
    config.runtime.channels.push({
      id: "discord-main",
      type: "discord",
      enabled: true,
      settings: {
        botToken: "env:OPENASSIST_CHANNEL_DISCORD_MAIN_BOT_TOKEN"
      }
    });
    config.runtime.channels.push({
      id: "whatsapp-main",
      type: "whatsapp-md",
      enabled: true,
      settings: {
        mode: "experimental"
      }
    });

    const apiKeyVar = toProviderApiKeyEnvVar(config.runtime.defaultProviderId);
    const server = net.createServer();
    server.unref();
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(bindPort, "127.0.0.1", () => resolve());
    });

    try {
      const result = await validateSetupReadiness({
        config,
        env: {
          [apiKeyVar]: "test-key",
          OPENASSIST_CHANNEL_DISCORD_MAIN_BOT_TOKEN: "discord-token"
        },
        configPath: path.join(root, "openassist.toml"),
        envFilePath: path.join(root, "openassistd.env"),
        installDir: root,
        skipService: true,
        timezoneConfirmed: true
      });

      const errorCodes = new Set(result.errors.map((item) => item.code));
      const warningCodes = new Set(result.warnings.map((item) => item.code));
      expect(errorCodes.has("runtime.port_unavailable")).toBe(true);
      expect(warningCodes.has("channel.whatsapp_experimental")).toBe(false);
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    }
  });

  it("renders operator-facing validation text with next-step hints", () => {
    expect(
      renderValidationIssues([
        {
          code: "provider.default_auth_missing",
          message: "Provider key is missing.",
          hint: "Set the env var and try again."
        },
        {
          code: "channel.enabled_required",
          message: "A channel is required."
        }
      ])
    ).toEqual([
      "Provider key is missing. Next step: Set the env var and try again.",
      "A channel is required."
    ]);
  });

  it("warns when a valid OAuth client secret env reference is unset", async () => {
    const root = tempDir("openassist-quickstart-validation-oauth-client-secret-warning-");
    const config = createDefaultConfigObject();
    config.runtime.bindPort = await getFreePort();
    config.runtime.providers[0].oauth = {
      authorizeUrl: "https://example.test/oauth/authorize",
      tokenUrl: "https://example.test/oauth/token",
      clientId: "client-id",
      clientSecretEnv: "OPENASSIST_PROVIDER_OPENAI_MAIN_OAUTH_CLIENT_SECRET"
    };
    config.runtime.channels.push({
      id: "telegram-main",
      type: "telegram",
      enabled: true,
      settings: {
        botToken: "env:OPENASSIST_CHANNEL_TELEGRAM_MAIN_BOT_TOKEN"
      }
    });
    const apiKeyVar = toProviderApiKeyEnvVar(config.runtime.defaultProviderId);

    const result = await validateSetupReadiness({
      config,
      env: {
        [apiKeyVar]: "test-key",
        OPENASSIST_CHANNEL_TELEGRAM_MAIN_BOT_TOKEN: "telegram-token"
      },
      configPath: path.join(root, "openassist.toml"),
      envFilePath: path.join(root, "openassistd.env"),
      installDir: root,
      skipService: true,
      timezoneConfirmed: true
    });

    expect(result.errors).toEqual([]);
    expect(result.warnings.some((item) => item.code === "provider.oauth_client_secret_unset")).toBe(true);
  });
});
