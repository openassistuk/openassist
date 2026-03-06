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

  it("falls back to main when detached HEAD", () => {
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
      skipRestart: false,
      dryRun: true
    });
    expect(plan).toEqual({
      targetRef: "main",
      usePullOnCurrentBranch: true,
      executionMode: "fast-forward-current-branch",
      skipRestart: false,
      dryRun: true
    });
  });

  it("renders operator-facing upgrade summary lines", () => {
    const plan = buildUpgradePlan({
      optionRef: "main",
      currentBranch: "main",
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
        plan
      })
    ).toEqual([
      "Update plan",
      "- Install style: repo-backed checkout",
      "- OpenAssist location: /tmp/openassist",
      "- Current branch: main",
      "- Current commit: 1234567890ab",
      "- Current update track: main",
      "- Target update track: main",
      "- Update method: fast-forward pull on the current branch",
      "- Restart and health checks after update: skipped by option",
      "- Rollback target if the update fails: 1234567890ab"
    ]);
  });
});
