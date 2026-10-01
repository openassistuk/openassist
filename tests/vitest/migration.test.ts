import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { migrateOpenClawConfig } from "../../packages/migration-openclaw/src/index.js";

function tempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

describe("OpenClaw migration", () => {
  const roots: string[] = [];

  afterEach(() => {
    for (const root of roots.splice(0)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("uses current absent-model defaults without rewriting saved IDs or assuming a generic backend model", () => {
    const root = tempDir("openassist-migration-");
    roots.push(root);
    fs.writeFileSync(path.join(root, "openclaw.json"), JSON.stringify({ providers: {
      openai: { type: "openai" }, anthropic: { type: "anthropic" },
      saved: { type: "openai", model: "gpt-6-sol" },
      generic: { type: "openai-compatible", baseUrl: "http://127.0.0.1:1234/v1" }
    } }));
    const result = migrateOpenClawConfig(root);
    expect(result.config.runtime.providers.map(provider => provider.defaultModel)).toEqual([
      "gpt-6.1-sol", "claude-opus-5-5", "gpt-6-sol", "your-model-name"
    ]);
    expect(result.warnings.some(warning => warning.includes("model ID served by its compatible backend"))).toBe(true);
    expect(result.config.runtime.providers[0]).not.toHaveProperty("reasoningEffort");
  });

  it("converts provider and channel config", () => {
    const root = tempDir("openassist-migration-");
    roots.push(root);

    fs.writeFileSync(
      path.join(root, "openclaw.json"),
      JSON.stringify(
        {
          providers: {
            "anthropic-main": {
              type: "anthropic",
              model: "claude-3-5-haiku"
            }
          },
          channels: {
            telegram: {
              enabled: true,
              botToken: "token"
            }
          }
        },
        null,
        2
      )
    );

    const migrated = migrateOpenClawConfig(root);
    expect(migrated.config.runtime.providers[0]?.type).toBe("anthropic");
    expect(migrated.config.runtime.channels[0]?.type).toBe("telegram");
    expect(migrated.config.runtime.channels[0]?.settings.botToken).toBe(
      "env:OPENASSIST_CHANNEL_TELEGRAM_BOTTOKEN"
    );
    expect(
      migrated.warnings.some((warning) =>
        warning.includes("was migrated to env reference")
      )
    ).toBe(true);
  });
});
