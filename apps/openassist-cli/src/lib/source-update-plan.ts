import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { defaultConfigPath, defaultEnvFilePath, defaultInstallDir, loadConfig, resolveConfigOverlaysDir } from "@openassist/config";
import { buildLifecycleReport } from "./lifecycle-readiness.js";
import { buildUpgradePlan, renderUpgradePlanSummary } from "./upgrade.js";
import { loadInstallState, detectInstallStateFromRepo, detectCurrentBranchFromRepo } from "./install-state.js";
import { classifyGitDirtyState } from "./git-dirty.js";
import { detectLegacyDefaultLayout } from "./operator-layout.js";
import type { UpdateOptions } from "./lifecycle-engine.js";

export function sourceUpdatePlan(options: UpdateOptions): {ok:boolean; lines:string[]; targetRef?:string} {
  const state = loadInstallState();
  const installDir = path.resolve(options.installDir ?? state?.installDir ?? defaultInstallDir());
  const configPath = state?.configPath ?? defaultConfigPath();
  const envFilePath = state?.envFilePath ?? defaultEnvFilePath();
  const metadata = detectInstallStateFromRepo(installDir);
  const currentBranch = detectCurrentBranchFromRepo(installDir) ?? "HEAD";
  const trackedRef = state?.trackedRef ?? metadata.trackedRef;
  const repoBacked = fs.existsSync(path.join(installDir,".git"));
  const dirty = repoBacked ? classifyGitDirtyState(installDir).hasRealCodeChanges : false;
  const legacy = detectLegacyDefaultLayout(installDir);
  const available = (command:string) => spawnSync(command,["--version"],{encoding:"utf8",timeout:5000,shell:process.platform === "win32"}).status === 0;
  const plan = buildUpgradePlan({optionRef:options.ref,optionPr:options.pr,currentBranch,trackedRef,skipRestart:Boolean(options.skipRestart),dryRun:Boolean(options.dryRun)});
  const config = fs.existsSync(configPath) ? loadConfig({baseFile:configPath,overlaysDir:resolveConfigOverlaysDir(configPath)}).config : undefined;
  const report = buildLifecycleReport({installDir,configPath,envFilePath,installStatePresent:Boolean(state),repoBacked,configExists:Boolean(config),envExists:fs.existsSync(envFilePath),trackedRef,currentBranch,config,explicitUpgradeTargetProvided:Boolean(options.ref || options.pr),hasGit:available("git"),hasPnpm:available("pnpm"),hasNode:available("node"),daemonBuildExists:fs.existsSync(path.join(installDir,"apps/openassistd/dist/index.js")),dirtyWorkingTree:dirty,legacyDefaultLayoutStatus:legacy.status === "none" ? undefined : legacy.status === "ready" ? "ready" : "blocked",legacyDefaultLayoutReason:legacy.reason});
  if (dirty && !report.sections.needsActionBeforeUpgrade.some(i=>i.label === "Local code changes")) {
    report.sections.needsActionBeforeUpgrade.push({id:"upgrade.dirty",stage:"upgrade",label:"Local code changes",detail:"The checkout contains local code changes.",nextStep:"Commit or stash the local changes, then rerun: openassist upgrade --dry-run"});
    report.summary.upgradeReadiness = "fix-before-updating";
  }
  const ok = report.summary.upgradeReadiness === "safe-to-continue" && !plan.explicitTargetRequired;
  const lines = renderUpgradePlanSummary({installDir,currentBranch,currentCommit:metadata.lastKnownGoodCommit??"unknown",trackedRef,rollbackTarget:state?.lastKnownGoodCommit,upgradeReadiness:report.summary.upgradeReadiness,upgradeBlockers:report.sections.needsActionBeforeUpgrade,recommendedNextCommand:report.recommendedNextCommand.command,plan});
  lines.push(ok ? "Dry-run complete. Upgrade is safe to continue with the install directory and update track shown above." : `Dry-run complete. Upgrade is not ready yet: ${report.summary.upgradeReadiness === "rerun-bootstrap" ? "rerun bootstrap instead" : "fix before updating"}.`);
  return {ok,lines,targetRef:plan.targetRef};
}
