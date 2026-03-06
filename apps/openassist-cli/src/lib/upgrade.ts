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
  return [
    "Upgrade plan",
    "- Install model: repo-backed checkout",
    `- Install directory: ${input.installDir}`,
    `- Current branch: ${input.currentBranch}`,
    `- Current commit: ${abbreviateCommit(input.currentCommit)}`,
    `- Tracked ref: ${trackedRef}`,
    `- Target ref: ${input.plan.targetRef}`,
    `- Update method: ${
      input.plan.executionMode === "fast-forward-current-branch"
        ? "fast-forward pull on the current branch"
        : "checkout the requested ref (detached fallback allowed)"
    }`,
    `- Restart and health checks: ${input.plan.skipRestart ? "skipped by option" : "enabled"}`,
    `- Rollback target: ${input.rollbackTarget ? abbreviateCommit(input.rollbackTarget) : "(not available)"}`
  ];
}
