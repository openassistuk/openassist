import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildUpgradePlan,
  resolveUpgradeTargetRef,
  shouldPullOnCurrentBranch
} from "../../apps/openassist-cli/src/lib/upgrade.js";

describe("cli upgrade rollback planning", () => {
  it("builds upgrade plan for current branch", () => {
    const plan = buildUpgradePlan({
      optionRef: undefined,
      currentBranch: "main",
      trackedRef: "main",
      skipRestart: false,
      dryRun: false
    });
    assert.equal(plan.targetRef, "main");
    assert.equal(plan.usePullOnCurrentBranch, true);
  });

  it("handles detached head fallback and explicit refs", () => {
    assert.equal(resolveUpgradeTargetRef(undefined, "HEAD"), "main");
    assert.equal(resolveUpgradeTargetRef(undefined, "HEAD", "release/v1.2"), "release/v1.2");
    assert.equal(resolveUpgradeTargetRef("release/v1.2", "HEAD"), "release/v1.2");
    assert.equal(shouldPullOnCurrentBranch("HEAD", "main"), false);
  });
});
