export interface UpgradePlanInput {
  optionRef?: string;
  currentBranch: string;
  skipRestart: boolean;
  dryRun: boolean;
}

export interface UpgradePlan {
  targetRef: string;
  usePullOnCurrentBranch: boolean;
  skipRestart: boolean;
  dryRun: boolean;
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
  return {
    targetRef,
    usePullOnCurrentBranch: shouldPullOnCurrentBranch(input.currentBranch, targetRef),
    skipRestart: input.skipRestart,
    dryRun: input.dryRun
  };
}
