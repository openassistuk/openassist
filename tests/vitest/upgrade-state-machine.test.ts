import { describe, expect, it } from "vitest";
import {
  buildUpgradePlan,
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
      skipRestart: false,
      dryRun: true
    });
  });
});
