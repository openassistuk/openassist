import { describe, expect, it } from "vitest";
import { createDefaultConfigObject } from "../../apps/openassist-cli/src/lib/config-edit.js";
import {
  buildLifecycleReport,
  groupValidationIssuesByLifecycleBucket,
  renderLifecycleReport,
  type LifecycleReportInput
} from "../../apps/openassist-cli/src/lib/lifecycle-readiness.js";

function createInput(overrides: Partial<LifecycleReportInput> = {}): LifecycleReportInput {
  const config = createDefaultConfigObject();
  config.runtime.channels.push({
    id: "telegram-main",
    type: "telegram",
    enabled: true,
    settings: {
      botToken: "env:OPENASSIST_CHANNEL_TELEGRAM_MAIN_BOT_TOKEN",
      allowedChatIds: ["123456"]
    }
  });

  return {
    installDir: "/srv/openassist",
    configPath: "/srv/openassist/openassist.toml",
    envFilePath: "/home/operator/.config/openassist/openassistd.env",
    installStatePresent: true,
    repoBacked: true,
    configExists: true,
    envExists: true,
    trackedRef: "main",
    currentCommit: "1234567890abcdef",
    detectedTimezone: "Europe/London",
    config,
    serviceManagerKind: "systemd-user",
    serviceInstalled: true,
    serviceHealthOk: true,
    serviceHealthDetail: "Europe/London / confirmed=true / clock=ok",
    validationErrors: [],
    validationWarnings: [],
    hasGit: true,
    hasPnpm: true,
    hasNode: true,
    daemonBuildExists: true,
    dirtyWorkingTree: false,
    ...overrides
  };
}

describe("lifecycle readiness", () => {
  it("groups validation issues into guided repair buckets", () => {
    const buckets = groupValidationIssuesByLifecycleBucket([
      {
        code: "provider.api_key_missing",
        message: "Provider key is missing",
        hint: "Set the provider env var"
      },
      {
        code: "channel.telegram_token_missing",
        message: "Telegram token is missing",
        hint: "Set the Telegram bot token"
      },
      {
        code: "time.timezone_unconfirmed",
        message: "Timezone is not confirmed",
        hint: "Confirm timezone"
      },
      {
        code: "access.operator_ids_missing",
        message: "Approved operator IDs are missing",
        hint: "Add operator IDs"
      },
      {
        code: "service.health_failed",
        message: "Daemon health is failing",
        hint: "Run openassist service health"
      }
    ]);

    expect(buckets.map((bucket) => bucket.id)).toEqual([
      "provider-auth",
      "channel-auth-routing",
      "timezone-time",
      "service-health",
      "access-operator-ids"
    ]);
  });

  it("recommends rerunning bootstrap before quickstart when upgrade readiness requires it", () => {
    const report = buildLifecycleReport(
      createInput({
        repoBacked: false,
        configExists: false,
        envExists: false,
        installStatePresent: false,
        daemonBuildExists: false
      })
    );

    expect(report.summary.upgradeReadiness).toBe("rerun-bootstrap");
    expect(report.recommendedNextCommand.kind).toBe("rerun-bootstrap");
    expect(report.recommendedNextCommand.command).toContain("scripts/install/bootstrap.sh");
  });

  it("classifies dirty working trees as fix-before-updating", () => {
    const report = buildLifecycleReport(
      createInput({
        dirtyWorkingTree: true
      })
    );

    expect(report.summary.upgradeReadiness).toBe("fix-before-updating");
    expect(report.sections.needsActionBeforeUpgrade.some((item) => item.id === "upgrade.local-changes")).toBe(true);
  });

  it("returns a stable grouped report shape for text and json consumers", () => {
    const report = buildLifecycleReport(createInput());
    const lines = renderLifecycleReport(report);

    expect(report.version).toBe(1);
    expect(report.summary.firstReplyReadiness).toBe("ready");
    expect(report.summary.upgradeReadiness).toBe("safe-to-continue");
    expect(report.sections.readyNow.length).toBeGreaterThan(0);
    expect(report.sections.needsActionBeforeFirstReply).toEqual([]);
    expect(report.recommendedNextCommand.command).toContain("openassist upgrade --dry-run");
    expect(lines[0]).toBe("OpenAssist lifecycle doctor");
    expect(lines).toContain("Ready now");
    expect(lines).toContain("Needs action before first reply");
    expect(lines).toContain("Needs action before full access");
    expect(lines).toContain("Needs action before upgrade");
    expect(lines).toContain("Recommended next command");
    expect(lines.some((line) => line.includes("Install location"))).toBe(true);
    expect(lines.some((line) => line.includes("openassist upgrade --dry-run"))).toBe(true);
  });
});
