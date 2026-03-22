import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createDefaultConfigObject } from "../../apps/openassist-cli/src/lib/config-edit.js";
import { extractProviderAuthReadinessMap } from "../../apps/openassist-cli/src/lib/provider-auth-readiness.js";
import {
  describeSystemdFilesystemAccess,
  isLinuxSystemdFilesystemAccessConfigurable,
  promptSystemdFilesystemAccess
} from "../../apps/openassist-cli/src/lib/service-access.js";
import {
  applySetupAccessModePreset,
  detectSetupAccessMode,
  getOperatorUserIds,
  operatorIdPromptConfig,
  setOperatorUserIds
} from "../../apps/openassist-cli/src/lib/setup-access.js";

class PromptStub {
  public lastConfirmMessage?: string;
  public lastSelectMessage?: string;

  constructor(
    private readonly selections: string[],
    private readonly confirmations: boolean[] = []
  ) {}

  async select<T extends string>(message?: string): Promise<T> {
    this.lastSelectMessage = message;
    const next = this.selections.shift();
    if (!next) {
      throw new Error("No select answer queued");
    }
    return next as T;
  }

  async confirm(message?: string): Promise<boolean> {
    this.lastConfirmMessage = message;
    const next = this.confirmations.shift();
    if (next === undefined) {
      throw new Error("No confirm answer queued");
    }
    return next;
  }
}

describe("service access coverage", () => {
  it("describes Linux systemd access choices and keeps hardened mode when unrestricted is declined", async () => {
    const prompts = new PromptStub(["unrestricted"], [false]);
    const emitted: string[] = [];

    assert.equal(isLinuxSystemdFilesystemAccessConfigurable("linux"), true);
    assert.equal(isLinuxSystemdFilesystemAccessConfigurable("darwin"), false);
    assert.equal(isLinuxSystemdFilesystemAccessConfigurable("win32"), false);
    assert.equal(describeSystemdFilesystemAccess("hardened"), "Hardened systemd sandbox");
    assert.equal(
      describeSystemdFilesystemAccess("unrestricted"),
      "Unrestricted systemd filesystem access"
    );

    const selected = await promptSystemdFilesystemAccess(prompts, "hardened", {
      emitLine: (line) => emitted.push(line)
    });

    assert.equal(selected, "hardened");
    assert.ok(emitted.some((line) => line.includes("Linux service protection enabled")));
    assert.ok(emitted.some((line) => line.includes("Keeping hardened Linux systemd filesystem access.")));
    assert.match(prompts.lastConfirmMessage ?? "", /removes OpenAssist-added Linux systemd hardening/);
  });

  it("accepts unrestricted mode after the explicit confirmation and keeps it without reconfirming", async () => {
    const firstPrompts = new PromptStub(["unrestricted"], [true]);
    const secondPrompts = new PromptStub(["unrestricted"], []);

    assert.equal(await promptSystemdFilesystemAccess(firstPrompts, "hardened"), "unrestricted");
    assert.equal(await promptSystemdFilesystemAccess(secondPrompts, "unrestricted"), "unrestricted");
    assert.equal(secondPrompts.lastConfirmMessage, undefined);
  });
});

describe("setup access coverage", () => {
  it("detects and applies the standard and full-access presets", () => {
    const config = createDefaultConfigObject();

    assert.equal(detectSetupAccessMode(config), "standard");

    applySetupAccessModePreset(config, "full-access");
    assert.equal(config.runtime.defaultPolicyProfile, "operator");
    assert.equal(config.runtime.operatorAccessProfile, "full-root");
    assert.equal(config.tools.fs.workspaceOnly, false);
    assert.equal(detectSetupAccessMode(config), "full-access");

    config.runtime.defaultPolicyProfile = "restricted";
    assert.equal(detectSetupAccessMode(config), "custom");

    applySetupAccessModePreset(config, "standard");
    assert.equal(config.runtime.operatorAccessProfile, "operator");
    assert.equal(config.tools.fs.workspaceOnly, true);
    assert.equal(detectSetupAccessMode(config), "standard");
  });

  it("filters and stores operator user ids with channel-specific prompt guidance", () => {
    const config = createDefaultConfigObject();
    const telegram = {
      id: "telegram-main",
      type: "telegram",
      enabled: true,
      settings: {
        botToken: "env:TELEGRAM_TOKEN",
        operatorUserIds: ["123", " ", 456, "789"] as unknown[]
      }
    } as (typeof config.runtime.channels)[number];

    assert.deepEqual(getOperatorUserIds(undefined), []);
    assert.deepEqual(getOperatorUserIds(telegram), ["123", "789"]);

    setOperatorUserIds(telegram, ["111", "222"]);
    assert.deepEqual(getOperatorUserIds(telegram), ["111", "222"]);

    const telegramPrompt = operatorIdPromptConfig("telegram");
    assert.match(telegramPrompt.prompt, /Telegram operator user IDs/);
    assert.equal(telegramPrompt.pattern.test("123456"), true);
    assert.equal(telegramPrompt.pattern.test("-100"), false);

    const discordPrompt = operatorIdPromptConfig("discord");
    assert.match(discordPrompt.errorHint, /numeric snowflakes/);
    assert.equal(discordPrompt.pattern.test("123456789012345678"), true);

    const whatsappPrompt = operatorIdPromptConfig("whatsapp");
    assert.match(whatsappPrompt.prompt, /WhatsApp operator sender IDs/);
    assert.equal(whatsappPrompt.pattern.test("user@s.whatsapp.net"), true);
  });
});

describe("provider auth readiness coverage", () => {
  it("maps empty, single-provider, and multi-provider auth payloads to safe readiness states", () => {
    assert.deepEqual(extractProviderAuthReadinessMap(undefined), {});
    assert.deepEqual(extractProviderAuthReadinessMap(null), {});
    assert.deepEqual(extractProviderAuthReadinessMap("nope"), {});
    assert.deepEqual(extractProviderAuthReadinessMap(["wrong"]), {});

    assert.deepEqual(
      extractProviderAuthReadinessMap({
        providerId: "codex-main",
        linkedAccountCount: 2,
        currentAuth: {
          chatReady: true
        }
      }),
      {
        "codex-main": {
          linkedAccountCount: 2,
          chatReady: true
        }
      }
    );

    assert.deepEqual(
      extractProviderAuthReadinessMap({
        providers: [
          {
            providerId: "codex-main",
            linkedAccountCount: 1,
            currentAuth: {
              chatReady: true
            }
          },
          {
            providerId: "anthropic-main"
          },
          {
            providerId: "   ",
            linkedAccountCount: 9
          },
          {
            linkedAccountCount: 4
          }
        ]
      }),
      {
        "anthropic-main": {
          linkedAccountCount: 0,
          chatReady: false
        },
        "codex-main": {
          linkedAccountCount: 1,
          chatReady: true
        }
      }
    );

    assert.deepEqual(
      extractProviderAuthReadinessMap({
        providerId: "openai-main",
        currentAuth: {}
      }),
      {
        "openai-main": {
          linkedAccountCount: 0,
          chatReady: false
        }
      }
    );
  });
});
