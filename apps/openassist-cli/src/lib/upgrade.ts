import type { LifecycleReportItem, UpgradeReadiness } from "./lifecycle-readiness.js";

export interface UpgradePlanInput {
  optionRef?: string;
  currentBranch: string;
  skipRestart: boolean;
  dryRun: boolean;
}

export interface UpgradePlan {
  targetRef: string;
  usePullOnCurrentBranch: boolean;
  executionMode: "fast-forward-current-branch" | "checkout-target-ref";
  skipRestart: boolean;
  dryRun: boolean;
}

export interface RenderUpgradePlanInput {
  installDir: string;
  currentBranch: string;
  currentCommit: string;
  trackedRef?: string;
  rollbackTarget?: string;
  upgradeReadiness: UpgradeReadiness;
  upgradeBlockers: LifecycleReportItem[];
  growth?: {
    installedSkillCount: number;
    managedHelperCount: number;
    skillsDirectory: string;
    helperToolsDirectory: string;
    updateSafetyNote: string;
  };
  plan: UpgradePlan;
}

export function resolveUpgradeTargetRef(optionRef: string | undefined, currentBranch: string): string {
  if (optionRef && optionRef.trim().length > 0) {
    return optionRef.trim();
  }
  if (currentBranch && currentBranch !== "HEAD") {
    return currentBranch;
  }
  return "main";
}

export function shouldPullOnCurrentBranch(currentBranch: string, targetRef: string): boolean {
  return currentBranch !== "HEAD" && currentBranch === targetRef;
}

export function buildUpgradePlan(input: UpgradePlanInput): UpgradePlan {
  const targetRef = resolveUpgradeTargetRef(input.optionRef, input.currentBranch);
  const usePullOnCurrentBranch = shouldPullOnCurrentBranch(input.currentBranch, targetRef);
  return {
    targetRef,
    usePullOnCurrentBranch,
    executionMode: usePullOnCurrentBranch
      ? "fast-forward-current-branch"
      : "checkout-target-ref",
    skipRestart: input.skipRestart,
    dryRun: input.dryRun
  };
}

function abbreviateCommit(commit: string): string {
  return commit.length > 12 ? commit.slice(0, 12) : commit;
}

export function renderUpgradePlanSummary(input: RenderUpgradePlanInput): string[] {
  const trackedRef = input.trackedRef?.trim() || "(not recorded)";
  const blockers = input.upgradeBlockers ?? [];
  const lines = [
    "Update readiness",
    `- Status: ${
      input.upgradeReadiness === "safe-to-continue"
        ? "safe to continue"
        : input.upgradeReadiness === "rerun-bootstrap"
          ? "rerun bootstrap instead"
          : "fix before updating"
    }`,
    `- OpenAssist location: ${input.installDir}`,
    `- Current branch: ${input.currentBranch}`,
    `- Current commit: ${abbreviateCommit(input.currentCommit)}`,
    `- Current update track: ${trackedRef}`,
    `- Target update track: ${input.plan.targetRef}`,
    `- Update method: ${
      input.plan.executionMode === "fast-forward-current-branch"
        ? "fast-forward pull on the current branch"
        : "check out the requested ref (detached fallback allowed)"
    }`,
    `- Restart and health checks after update: ${input.plan.skipRestart ? "skipped by option" : "enabled"}`,
    `- Rollback target if the update fails: ${input.rollbackTarget ? abbreviateCommit(input.rollbackTarget) : "(not available)"}`
  ];
  if (input.growth) {
    lines.push(
      `- Managed growth assets: skills=${input.growth.installedSkillCount}, helpers=${input.growth.managedHelperCount}`,
      `- Managed growth directories: skills=${input.growth.skillsDirectory}; helpers=${input.growth.helperToolsDirectory}`,
      `- Managed growth update safety: ${input.growth.updateSafetyNote}`
    );
  }

  lines.push("Needs action before upgrade");
  if (blockers.length === 0) {
    lines.push("- None.");
  } else {
    for (const blocker of blockers) {
      const detail = blocker.nextStep ? `${blocker.detail}. Next step: ${blocker.nextStep}` : blocker.detail;
      lines.push(`- ${blocker.label}: ${detail}`);
    }
  }

  return lines;
}
