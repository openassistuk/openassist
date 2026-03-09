export type UpdateTrackKind = "branch" | "pull-request" | "raw-ref" | "detached";

export interface UpdateTrackInfo {
  kind: UpdateTrackKind;
  ref?: string;
  label: string;
  shortLabel: string;
  prNumber?: number;
  requiresExplicitUpgradeTarget: boolean;
}

const PULL_REQUEST_REF_PATTERN = /^refs\/pull\/(\d+)\/head$/;

export function buildPullRequestRef(prNumber: number | string): string {
  return `refs/pull/${String(prNumber).trim()}/head`;
}

export function parsePullRequestNumber(value: string): number {
  const trimmed = value.trim();
  if (!/^[1-9][0-9]*$/.test(trimmed)) {
    throw new Error(`Invalid pull request number: ${value}`);
  }
  return Number.parseInt(trimmed, 10);
}

export function classifyUpdateTrack(ref?: string): UpdateTrackInfo {
  const trimmed = ref?.trim();
  if (!trimmed || trimmed === "HEAD") {
    return {
      kind: "detached",
      label: "Detached or not recorded",
      shortLabel: "Detached",
      requiresExplicitUpgradeTarget: false
    };
  }

  const pullRequestMatch = trimmed.match(PULL_REQUEST_REF_PATTERN);
  if (pullRequestMatch) {
    const prNumber = Number.parseInt(pullRequestMatch[1] ?? "0", 10);
    return {
      kind: "pull-request",
      ref: trimmed,
      label: `PR #${prNumber} (${trimmed})`,
      shortLabel: `PR #${prNumber}`,
      prNumber,
      requiresExplicitUpgradeTarget: true
    };
  }

  if (trimmed.startsWith("refs/")) {
    return {
      kind: "raw-ref",
      ref: trimmed,
      label: trimmed,
      shortLabel: trimmed,
      requiresExplicitUpgradeTarget: false
    };
  }

  return {
    kind: "branch",
    ref: trimmed,
    label: trimmed,
    shortLabel: trimmed,
    requiresExplicitUpgradeTarget: false
  };
}
