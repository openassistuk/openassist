import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
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

  it("resolves launchd as the service manager on macOS without falling into unsupported-platform handling", async () => {
    const root = tempDir("openassist-quickstart-validation-launchd-");
    const config = createDefaultConfigObject();
    config.runtime.bindPort = await getFreePort();
    const apiKeyVar = toProviderApiKeyEnvVar(config.runtime.defaultProviderId);
    vi.spyOn(process, "platform", "get").mockReturnValue("darwin");

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

    expect(result.serviceManagerKind).toBe("launchd");
    expect(result.errors.some((item) => item.code === "service.unsupported_platform")).toBe(false);
    expect(result.errors.some((item) => item.code === "service.daemon_missing")).toBe(true);
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

  it("warns when the default codex provider still needs account linking instead of an API key", async () => {
    const root = tempDir("openassist-quickstart-validation-codex-warning-");
    const config = createDefaultConfigObject();
    config.runtime.bindPort = await getFreePort();
    config.runtime.defaultProviderId = "codex-main";
    config.runtime.providers = [
      {
        id: "codex-main",
        type: "codex",
        defaultModel: "gpt-5.4"
      }
    ];

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
    expect(
      result.warnings.some((item) => item.code === "provider.default_codex_account_link_pending")
    ).toBe(true);
  });

  it("suppresses the default codex account-link warning when auth is already linked and chat-ready", async () => {
    const root = tempDir("openassist-quickstart-validation-codex-ready-");
    const config = createDefaultConfigObject();
    config.runtime.bindPort = await getFreePort();
    config.runtime.defaultProviderId = "codex-main";
    config.runtime.providers = [
      {
        id: "codex-main",
        type: "codex",
        defaultModel: "gpt-5.4"
      }
    ];

    const result = await validateSetupReadiness({
      config,
      env: {},
      configPath: path.join(root, "openassist.toml"),
      envFilePath: path.join(root, "openassistd.env"),
      installDir: root,
      skipService: true,
      timezoneConfirmed: true,
      providerAuthReadiness: {
        "codex-main": {
          linkedAccountCount: 1,
          chatReady: true
        }
      }
    });

    expect(
      result.warnings.some((item) => item.code === "provider.default_codex_account_link_pending")
    ).toBe(false);
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

  it("warns when OpenAI reasoning effort is configured on an unsupported model family", async () => {
    const root = tempDir("openassist-quickstart-validation-openai-reasoning-warning-");
    const config = createDefaultConfigObject();
    config.runtime.bindPort = await getFreePort();
    config.runtime.providers[0] = {
      id: "openai-main",
      type: "openai",
      defaultModel: "gpt-4o-mini",
      reasoningEffort: "high"
    };
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

    expect(
      result.warnings.some((item) => item.code === "provider.openai_reasoning_model_unsupported")
    ).toBe(true);
  });

  it("warns when Anthropic thinking budget is configured on an unsupported model family", async () => {
    const root = tempDir("openassist-quickstart-validation-anthropic-thinking-warning-");
    const config = createDefaultConfigObject();
    config.runtime.bindPort = await getFreePort();
    config.runtime.defaultProviderId = "anthropic-main";
    config.runtime.providers = [
      {
        id: "anthropic-main",
        type: "anthropic",
        defaultModel: "claude-3-5-haiku-latest",
        thinkingBudgetTokens: 4096
      }
    ];
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

    expect(
      result.warnings.some((item) => item.code === "provider.anthropic_thinking_model_unsupported")
    ).toBe(true);
  });

  it("warns when legacy openai oauth compatibility is still configured", async () => {
    const root = tempDir("openassist-quickstart-validation-openai-legacy-oauth-");
    const config = createDefaultConfigObject();
    config.runtime.bindPort = await getFreePort();
    config.runtime.providers[0].oauth = {
      authorizeUrl: "https://example.test/oauth/authorize",
      tokenUrl: "https://example.test/oauth/token",
      clientId: "client-id",
      clientSecretEnv: "OPENASSIST_PROVIDER_OPENAI_MAIN_OAUTH_CLIENT_SECRET"
    };
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

    expect(result.warnings.some((item) => item.code === "provider.openai_oauth_legacy")).toBe(true);
  });

  it("warns when the codex route is configured with a non-codex model", async () => {
    const root = tempDir("openassist-quickstart-validation-codex-model-warning-");
    const config = createDefaultConfigObject();
    config.runtime.bindPort = await getFreePort();
    config.runtime.defaultProviderId = "codex-main";
    config.runtime.providers = [
      {
        id: "codex-main",
        type: "codex",
        defaultModel: "gpt-4o-mini"
      }
    ];

    const result = await validateSetupReadiness({
      config,
      env: {},
      configPath: path.join(root, "openassist.toml"),
      envFilePath: path.join(root, "openassistd.env"),
      installDir: root,
      skipService: true,
      timezoneConfirmed: true
    });

    expect(result.warnings.some((item) => item.code === "provider.codex_model_unsupported")).toBe(
      true
    );
  });

  it("warns when Codex reasoning effort is configured on an unsupported model family", async () => {
    const root = tempDir("openassist-quickstart-validation-codex-reasoning-warning-");
    const config = createDefaultConfigObject();
    config.runtime.bindPort = await getFreePort();
    config.runtime.defaultProviderId = "codex-main";
    config.runtime.providers = [
      {
        id: "codex-main",
        type: "codex",
        defaultModel: "gpt-4o-mini",
        reasoningEffort: "high"
      }
    ];

    const result = await validateSetupReadiness({
      config,
      env: {},
      configPath: path.join(root, "openassist.toml"),
      envFilePath: path.join(root, "openassistd.env"),
      installDir: root,
      skipService: true,
      timezoneConfirmed: true
    });

    expect(
      result.warnings.some((item) => item.code === "provider.codex_reasoning_model_unsupported")
    ).toBe(true);
    expect(result.warnings.some((item) => item.code === "provider.codex_model_unsupported")).toBe(true);
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

  it("skips the bind-port probe only when a caller explicitly asks for it", async () => {
    const root = tempDir("openassist-quickstart-validation-skip-bind-probe-");
    const config = createDefaultConfigObject();
    const bindPort = await getFreePort();
    config.runtime.bindPort = bindPort;
    const apiKeyVar = toProviderApiKeyEnvVar(config.runtime.defaultProviderId);
    const server = net.createServer();
    server.unref();
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(bindPort, "127.0.0.1", () => resolve());
    });

    try {
      const strictResult = await validateSetupReadiness({
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
      expect(strictResult.errors.some((item) => item.code === "runtime.port_unavailable")).toBe(true);

      const doctorStyleResult = await validateSetupReadiness({
        config,
        env: {
          [apiKeyVar]: "test-key"
        },
        configPath: path.join(root, "openassist.toml"),
        envFilePath: path.join(root, "openassistd.env"),
        installDir: root,
        skipService: true,
        timezoneConfirmed: true,
        skipBindAvailabilityCheck: true
      });
      expect(doctorStyleResult.errors.some((item) => item.code === "runtime.port_unavailable")).toBe(false);
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
