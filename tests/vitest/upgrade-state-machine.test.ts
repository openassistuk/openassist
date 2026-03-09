import { describe, expect, it } from "vitest";
import {
  buildUpgradePlan,
  renderUpgradePlanSummary,
  resolveUpgradeTargetRef,
  shouldPullOnCurrentBranch
} from "../../apps/openassist-cli/src/lib/upgrade.js";

describe("upgrade state machine planning", () => {
  it("uses explicit ref when provided", () => {
    expect(resolveUpgradeTargetRef("release/v1.2", "main")).toBe("release/v1.2");
  });

  it("falls back to current branch", () => {
    expect(resolveUpgradeTargetRef(undefined, "develop")).toBe("develop");
  });

  it("falls back to tracked ref when detached HEAD", () => {
    expect(resolveUpgradeTargetRef(undefined, "HEAD", "release/v1.2")).toBe("release/v1.2");
  });

  it("falls back to main when detached HEAD and no track is recorded", () => {
    expect(resolveUpgradeTargetRef(undefined, "HEAD")).toBe("main");
  });

  it("computes pull strategy for matching current branch", () => {
    expect(shouldPullOnCurrentBranch("main", "main")).toBe(true);
    expect(shouldPullOnCurrentBranch("HEAD", "main")).toBe(false);
    expect(shouldPullOnCurrentBranch("develop", "main")).toBe(false);
  });

  it("builds deterministic upgrade plan", () => {
    const plan = buildUpgradePlan({
      optionRef: undefined,
      currentBranch: "main",
      trackedRef: "main",
      skipRestart: false,
      dryRun: true
    });
    expect(plan).toEqual({
      targetRef: "main",
      targetLabel: "main",
      explicitTargetRequired: false,
      usePullOnCurrentBranch: true,
      executionMode: "fast-forward-current-branch",
      skipRestart: false,
      dryRun: true
    });
  });

  it("requires an explicit target for detached PR tracks", () => {
    const plan = buildUpgradePlan({
      currentBranch: "HEAD",
      trackedRef: "refs/pull/23/head",
      skipRestart: false,
      dryRun: true
    });

    expect(plan.explicitTargetRequired).toBe(true);
    expect(plan.executionMode).toBe("explicit-target-required");
    expect(plan.targetLabel).toBe("PR #23 (refs/pull/23/head)");
  });

  it("builds an explicit PR plan when requested", () => {
    const plan = buildUpgradePlan({
      optionPr: "23",
      currentBranch: "HEAD",
      trackedRef: "refs/pull/23/head",
      skipRestart: false,
      dryRun: true
    });

    expect(plan.optionPr).toBe(23);
    expect(plan.targetRef).toBe("refs/pull/23/head");
    expect(plan.targetLabel).toBe("PR #23 (refs/pull/23/head)");
    expect(plan.explicitTargetRequired).toBe(false);
  });

  it("renders operator-facing upgrade summary lines", () => {
    const plan = buildUpgradePlan({
      optionRef: "main",
      currentBranch: "main",
      trackedRef: "main",
      skipRestart: true,
      dryRun: true
    });

    expect(
      renderUpgradePlanSummary({
        installDir: "/tmp/openassist",
        currentBranch: "main",
        currentCommit: "1234567890abcdef",
        trackedRef: "main",
        rollbackTarget: "1234567890abcdef",
        upgradeReadiness: "safe-to-continue",
        upgradeBlockers: [],
        plan
      })
    ).toEqual([
      "Update readiness",
      "Ready now",
      "- Status: safe to continue",
      "- OpenAssist location: /tmp/openassist",
      "- Current branch: main",
      "- Current commit: 1234567890ab",
      "- Current update track: main",
      "- Target update track: main",
      "- Update method: fast-forward pull on the current branch",
      "- Restart and health checks after update: skipped by option",
      "- Rollback target if the update fails: 1234567890ab",
      "Needs action",
      "- None.",
      "Next command",
      "- openassist upgrade --install-dir \"/tmp/openassist\" --ref \"main\""
    ]);
  });
});
