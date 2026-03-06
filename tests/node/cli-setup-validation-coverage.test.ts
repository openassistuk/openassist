import assert from "node:assert/strict";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { createDefaultConfigObject, toProviderApiKeyEnvVar } from "../../apps/openassist-cli/src/lib/config-edit.js";
import { buildSetupSummary } from "../../apps/openassist-cli/src/lib/setup-summary.js";
import { renderValidationIssues, validateSetupReadiness } from "../../apps/openassist-cli/src/lib/setup-validation.js";

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
        server.close(() => reject(new Error("failed to allocate free port")));
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

describe("cli setup validation and summary coverage", () => {
  it("handles schema-invalid config early return", async () => {
    const root = tempDir("openassist-node-validation-schema-");
    const result = await validateSetupReadiness({
      config: {} as never,
      env: {},
      configPath: path.join(root, "openassist.toml"),
      envFilePath: path.join(root, "openassistd.env"),
      installDir: root,
      skipService: true,
      timezoneConfirmed: false
    });

    assert.equal(result.errors.length, 1);
    assert.equal(result.errors[0]?.code, "config.schema_invalid");
    assert.equal(result.warnings.length, 0);
  });

  it("covers provider/channel/time/port validation branches", async () => {
    const root = tempDir("openassist-node-validation-branches-");
    const config = createDefaultConfigObject();
    config.runtime.defaultProviderId = "missing-provider";
    const busyPort = await getFreePort();
    config.runtime.bindAddress = "127.0.0.1";
    config.runtime.bindPort = busyPort;
    config.runtime.channels.push({
      id: "telegram-main",
      type: "telegram",
      enabled: true,
      settings: {
        allowedChatIds: ["env:OPENASSIST_TELEGRAM_ALLOWLIST"]
      }
    });
    config.runtime.channels.push({
      id: "discord-main",
      type: "discord",
      enabled: true,
      settings: {
        statusToken: "env:OPENASSIST_DISCORD_STATUS_TOKEN",
        allowedChannelIds: ["env:OPENASSIST_DISCORD_ALLOWLIST"]
      }
    });
    config.runtime.channels.push({
      id: "whatsapp-main",
      type: "whatsapp-md",
      enabled: true,
      settings: {
        mode: "experimental",
        printQrInTerminal: true
      }
    });

    const holder = net.createServer();
    await new Promise<void>((resolve, reject) => {
      holder.once("error", reject);
      holder.listen(busyPort, "127.0.0.1", () => resolve());
    });

    try {
      const result = await validateSetupReadiness({
        config,
        env: {},
        configPath: path.join(root, "openassist.toml"),
        envFilePath: path.join(root, "openassistd.env"),
        installDir: root,
        skipService: true,
        timezoneConfirmed: false
      });

      const errorCodes = new Set(result.errors.map((item) => item.code));
      const warningCodes = new Set(result.warnings.map((item) => item.code));

      assert.equal(errorCodes.has("provider.default_missing"), true);
      assert.equal(errorCodes.has("channel.telegram_token_missing"), true);
      assert.equal(errorCodes.has("channel.discord_token_missing"), true);
      assert.equal(errorCodes.has("channel.env_ref_unresolved"), true);
      assert.equal(errorCodes.has("time.timezone_unconfirmed"), true);
      assert.equal(errorCodes.has("runtime.port_unavailable"), true);
      assert.equal(warningCodes.has("channel.whatsapp_experimental"), true);
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

  it("covers provider auth and service readiness branch", async () => {
    const root = tempDir("openassist-node-validation-service-");
    const config = createDefaultConfigObject();
    config.runtime.bindPort = await getFreePort();
    const envVar = toProviderApiKeyEnvVar(config.runtime.defaultProviderId);

    const result = await validateSetupReadiness({
      config,
      env: {
        [envVar]: "test-key"
      },
      configPath: path.join(root, "openassist.toml"),
      envFilePath: path.join(root, "openassistd.env"),
      installDir: root,
      skipService: false,
      timezoneConfirmed: true
    });

    const codes = new Set(result.errors.map((issue) => issue.code));
    const hasServiceSignal = codes.has("service.daemon_missing") || codes.has("service.unsupported_platform");
    assert.equal(hasServiceSignal, true);
  });

  it("renders validation issues and setup summary variants", () => {
    const withHint = renderValidationIssues([
      {
        code: "x.with_hint",
        message: "with hint",
        hint: "take action"
      }
    ]);
    assert.equal(withHint[0], "with hint Next step: take action");

    const withoutHint = renderValidationIssues([
      {
        code: "x.no_hint",
        message: "without hint"
      }
    ]);
    assert.equal(withoutHint[0], "without hint");

    const config = createDefaultConfigObject();
    config.runtime.channels.push({
      id: "telegram-main",
      type: "telegram",
      enabled: true,
      settings: {
        botToken: "env:OPENASSIST_CHANNEL_TELEGRAM_MAIN_BOT_TOKEN",
        allowedChatIds: ["env:OPENASSIST_CHANNEL_TELEGRAM_MAIN_ALLOWED_CHATS"]
      }
    });

    const failedServiceSummary = buildSetupSummary({
      configPath: "/tmp/openassist.toml",
      envFilePath: "/tmp/openassistd.env",
      backupPath: "/tmp/openassist.toml.bak",
      config,
      changedEnvKeys: ["OPENASSIST_PROVIDER_OPENAI_MAIN_API_KEY"],
      warningCount: 2,
      skippedService: false,
      healthOk: false
    });
    assert.equal(failedServiceSummary.some((line) => line.includes("Backup: /tmp/openassist.toml.bak")), true);
    assert.equal(failedServiceSummary.some((line) => line.includes("Service status: needs attention")), true);
    assert.equal(
      failedServiceSummary.some(
        (line) =>
          line.includes("Secret refs in config:") &&
          line.includes("OPENASSIST_PROVIDER_OPENAI_MAIN_API_KEY") &&
          line.includes("OPENASSIST_CHANNEL_TELEGRAM_MAIN_BOT_TOKEN")
      ),
      true
    );

    const skippedServiceSummary = buildSetupSummary({
      configPath: "/tmp/openassist.toml",
      envFilePath: "/tmp/openassistd.env",
      config,
      changedEnvKeys: [],
      warningCount: 0,
      skippedService: true,
      healthOk: false
    });
    assert.equal(skippedServiceSummary.some((line) => line.includes("Service status: not checked yet (--skip-service)")), true);
  });
});
