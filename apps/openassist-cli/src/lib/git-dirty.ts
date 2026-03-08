import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

export interface GitDirtyAssessment {
  hasRealCodeChanges: boolean;
  hasLegacyOperatorState: boolean;
  changedPaths: string[];
}

function normalizePorcelainPath(raw: string): string {
  const trimmed = raw.trim();
  const arrowIndex = trimmed.indexOf("->");
  if (arrowIndex >= 0) {
    return trimmed.slice(arrowIndex + 2).trim();
  }
  return trimmed;
}

function isLegacyOperatorPath(changedPath: string): boolean {
  return (
    changedPath === "openassist.toml" ||
    changedPath.startsWith("openassist.toml.bak.") ||
    changedPath.startsWith("config.d/") ||
    changedPath.startsWith(".openassist/")
  );
}

export function classifyGitDirtyState(installDir: string): GitDirtyAssessment {
  if (!fs.existsSync(path.join(installDir, ".git"))) {
    return {
      hasRealCodeChanges: false,
      hasLegacyOperatorState: false,
      changedPaths: []
    };
  }

  const result = spawnSync("git", ["-C", installDir, "status", "--porcelain"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"]
  });
  if (result.status !== 0) {
    return {
      hasRealCodeChanges: false,
      hasLegacyOperatorState: false,
      changedPaths: []
    };
  }

  const changedPaths = result.stdout
    .split(/\r?\n/)
    .map((line) => line.slice(3))
    .map(normalizePorcelainPath)
    .filter((line) => line.length > 0);
  const hasLegacyOperatorState = changedPaths.some(isLegacyOperatorPath);
  const hasRealCodeChanges = changedPaths.some((entry) => !isLegacyOperatorPath(entry));
  return {
    hasRealCodeChanges,
    hasLegacyOperatorState,
    changedPaths
  };
}
