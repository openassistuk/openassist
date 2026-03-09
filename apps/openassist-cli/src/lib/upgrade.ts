import type { LifecycleReportItem, UpgradeReadiness } from "./lifecycle-readiness.js";
import { buildPullRequestRef, classifyUpdateTrack, parsePullRequestNumber } from "./update-track.js";

export interface UpgradePlanInput {
  optionRef?: string;
  optionPr?: string;
  currentBranch: string;
  trackedRef?: string;
  skipRestart: boolean;
  dryRun: boolean;
}

export interface UpgradePlan {
  targetRef?: string;
  targetLabel: string;
  explicitTargetRequired: boolean;
  explicitTargetSuggestion?: string;
  optionRef?: string;
  optionPr?: number;
  usePullOnCurrentBranch: boolean;
  executionMode:
    | "fast-forward-current-branch"
    | "checkout-target-ref"
    | "explicit-target-required";
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
  recommendedNextCommand?: string;
  growth?: {
    installedSkillCount: number;
    managedHelperCount: number;
    skillsDirectory: string;
    helperToolsDirectory: string;
    updateSafetyNote: string;
  };
  plan: UpgradePlan;
}

export function resolveUpgradeTargetRef(
  optionRef: string | undefined,
  currentBranch: string,
  trackedRef?: string
): string {
  if (optionRef && optionRef.trim().length > 0) {
    return optionRef.trim();
  }
  if (currentBranch && currentBranch !== "HEAD") {
    return currentBranch;
  }
  if (trackedRef && trackedRef.trim().length > 0 && trackedRef.trim() !== "HEAD") {
    return trackedRef.trim();
  }
  return "main";
}

export function shouldPullOnCurrentBranch(currentBranch: string, targetRef: string): boolean {
  return currentBranch !== "HEAD" && currentBranch === targetRef;
}

function parseOptionPr(optionPr: string | undefined): number | undefined {
  if (!optionPr || optionPr.trim().length === 0) {
    return undefined;
  }
  return parsePullRequestNumber(optionPr);
}

export function buildUpgradePlan(input: UpgradePlanInput): UpgradePlan {
  const optionPr = parseOptionPr(input.optionPr);
  if (optionPr !== undefined) {
    const targetRef = buildPullRequestRef(optionPr);
    return {
      targetRef,
      targetLabel: classifyUpdateTrack(targetRef).label,
      explicitTargetRequired: false,
      optionPr,
      usePullOnCurrentBranch: false,
      executionMode: "checkout-target-ref",
      skipRestart: input.skipRestart,
      dryRun: input.dryRun
    };
  }

  const tracked = classifyUpdateTrack(input.trackedRef);
  if (!input.optionRef && input.currentBranch === "HEAD" && tracked.kind === "pull-request") {
    return {
      targetRef: tracked.ref,
      targetLabel: tracked.label,
      explicitTargetRequired: true,
      explicitTargetSuggestion: `openassist upgrade --pr ${tracked.prNumber}`,
      usePullOnCurrentBranch: false,
      executionMode: "explicit-target-required",
      skipRestart: input.skipRestart,
      dryRun: input.dryRun
    };
  }

  const targetRef = resolveUpgradeTargetRef(input.optionRef, input.currentBranch, input.trackedRef);
  const usePullOnCurrentBranch = shouldPullOnCurrentBranch(input.currentBranch, targetRef);
  return {
    targetRef,
    targetLabel: classifyUpdateTrack(targetRef).label,
    explicitTargetRequired: false,
    ...(input.optionRef?.trim() ? { optionRef: input.optionRef.trim() } : {}),
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
  const trackedRef = classifyUpdateTrack(input.trackedRef);
  const blockers = input.upgradeBlockers ?? [];
  const lines = [
    "Update readiness",
    "Ready now",
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
    `- Current update track: ${trackedRef.label}`,
    `- Target update track: ${input.plan.targetLabel}`,
    `- Update method: ${
      input.plan.executionMode === "fast-forward-current-branch"
        ? "fast-forward pull on the current branch"
        : input.plan.executionMode === "explicit-target-required"
          ? "explicit --pr or --ref required before update"
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

  lines.push("Needs action");
  if (blockers.length === 0) {
    lines.push("- None.");
  } else {
    for (const blocker of blockers) {
      const detail = blocker.nextStep ? `${blocker.detail}. Next step: ${blocker.nextStep}` : blocker.detail;
      lines.push(`- ${blocker.label}: ${detail}`);
    }
  }
  lines.push("Next command");
  const liveCommandParts = [`openassist upgrade --install-dir "${input.installDir}"`];
  if (input.plan.optionPr !== undefined) {
    liveCommandParts.push(`--pr ${input.plan.optionPr}`);
  } else if (input.plan.optionRef) {
    liveCommandParts.push(`--ref "${input.plan.optionRef}"`);
  } else if (
    input.currentBranch === "HEAD" &&
    input.plan.targetRef &&
    input.plan.executionMode === "checkout-target-ref"
  ) {
    liveCommandParts.push(`--ref "${input.plan.targetRef}"`);
  }
  lines.push(
    input.upgradeReadiness === "safe-to-continue"
      ? `- ${liveCommandParts.join(" ")}`
      : input.recommendedNextCommand
        ? `- ${input.recommendedNextCommand}`
        : blockers[0]?.nextStep
          ? `- ${blockers[0].nextStep}`
          : "- openassist doctor"
  );

  return lines;
}
