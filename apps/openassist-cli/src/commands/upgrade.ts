import fs from "node:fs";
import path from "node:path";
import { loadConfig, resolveConfigOverlaysDir } from "@openassist/config";
import { createLogger } from "@openassist/observability";
import type { Command } from "commander";
import {
  SpawnCommandRunner,
  runOrThrow,
  runStreamingOrThrow
} from "../lib/command-runner.js";
import { checkHealth, waitForHealthy } from "../lib/health-check.js";
import { buildLifecycleReport } from "../lib/lifecycle-readiness.js";
import { detectLegacyDefaultLayout } from "../lib/operator-layout.js";
import { classifyGitDirtyState } from "../lib/git-dirty.js";
import { inspectLocalGrowthState } from "../lib/growth-status.js";
import { createServiceManager } from "../lib/service-manager.js";
import {
  defaultConfigPath,
  defaultEnvFilePath,
  defaultInstallDir,
  detectDefaultDaemonBaseUrl
} from "../lib/runtime-context.js";
import { detectInstallStateFromRepo, loadInstallState, saveInstallState } from "../lib/install-state.js";
import { buildPullRequestRef, classifyUpdateTrack, parsePullRequestNumber } from "../lib/update-track.js";
import { buildUpgradePlan, renderUpgradePlanSummary } from "../lib/upgrade.js";

const logger = createLogger({ service: "openassist-cli" });

interface UpgradeContext {
  installDir: string;
  configPath: string;
  envFilePath: string;
  targetRef: string;
  trackedRef?: string;
  repoUrl?: string;
  oldCommit?: string;
  currentBranch?: string;
}

async function detectCurrentBranch(runner: SpawnCommandRunner, cwd: string): Promise<string> {
  const result = await runOrThrow(runner, "git", ["rev-parse", "--abbrev-ref", "HEAD"], { cwd });
  return result.stdout.trim();
}

async function detectCurrentCommit(runner: SpawnCommandRunner, cwd: string): Promise<string> {
  const result = await runOrThrow(runner, "git", ["rev-parse", "HEAD"], { cwd });
  return result.stdout.trim();
}

async function ensureGitClean(runner: SpawnCommandRunner, cwd: string): Promise<void> {
  const dirty = await isGitDirty(runner, cwd);
  if (dirty) {
    throw new Error(
      "OpenAssist found local code changes in the install directory. Commit or stash them before updating. If this checkout is no longer trustworthy, run bootstrap again in a fresh install directory."
    );
  }
}

async function isGitDirty(runner: SpawnCommandRunner, cwd: string): Promise<boolean> {
  const result = await runOrThrow(runner, "git", ["status", "--porcelain"], { cwd });
  return result.stdout.trim().length > 0;
}

async function binaryAvailable(runner: SpawnCommandRunner, command: string): Promise<boolean> {
  try {
    const result = await runner.run(command, ["--version"]);
    return result.code === 0;
  } catch {
    return false;
  }
}

async function checkoutUpgradeTarget(
  runner: SpawnCommandRunner,
  cwd: string,
  plan: ReturnType<typeof buildUpgradePlan>
): Promise<void> {
  if (plan.optionPr !== undefined) {
    await runOrThrow(runner, "git", ["fetch", "origin", buildPullRequestRef(plan.optionPr)], { cwd });
    await runOrThrow(runner, "git", ["checkout", "--detach", "FETCH_HEAD"], { cwd });
    return;
  }

  const targetRef = plan.targetRef;
  if (!targetRef) {
    throw new Error("Upgrade target is missing. Pass --pr or --ref explicitly.");
  }

  const targetTrack = classifyUpdateTrack(targetRef);
  if (targetTrack.kind === "branch") {
    await runOrThrow(
      runner,
      "git",
      ["fetch", "origin", `refs/heads/${targetRef}:refs/remotes/origin/${targetRef}`],
      { cwd }
    );
    await runOrThrow(runner, "git", ["checkout", "-B", targetRef, `refs/remotes/origin/${targetRef}`], { cwd });
    return;
  }

  await runOrThrow(runner, "git", ["fetch", "origin", targetRef], { cwd });
  const checkout = await runner.run("git", ["checkout", targetRef], { cwd });
  if (checkout.code !== 0) {
    await runOrThrow(runner, "git", ["checkout", "--detach", "FETCH_HEAD"], { cwd });
  }
}

function printLines(lines: string[]): void {
  for (const line of lines) {
    console.log(line);
  }
}

function printUpgradeNextSteps(baseUrl: string, skipRestart: boolean): void {
  console.log("Next checks:");
  if (skipRestart) {
    console.log("- Restart was skipped. Run: openassist service restart");
  }
  console.log("- Verify daemon health: openassist service health");
  console.log("- Verify channels: openassist channel status");
  console.log(`- API base URL: ${baseUrl.replace(/\/+$/, "")}`);
}

async function performRollback(
  runner: SpawnCommandRunner,
  serviceInstalled: boolean,
  context: UpgradeContext,
  skipRestart: boolean,
  baseUrl: string
) : Promise<{ restoredCommit?: string; serviceHealthRechecked: boolean }> {
  if (!context.oldCommit) {
    return { restoredCommit: undefined, serviceHealthRechecked: false };
  }

  console.error(`Update failed. Rolling back to ${context.oldCommit}...`);
  await runOrThrow(runner, "git", ["checkout", "--detach", context.oldCommit], {
    cwd: context.installDir
  });
  await runStreamingOrThrow(runner, "pnpm", ["install", "--frozen-lockfile"], {
    cwd: context.installDir
  });
  await runStreamingOrThrow(runner, "pnpm", ["-r", "build"], {
    cwd: context.installDir
  });

  if (serviceInstalled && !skipRestart) {
    const service = createServiceManager(runner);
    await service.restart();
    const health = await waitForHealthy(baseUrl, 60_000, 2_000);
    if (!health.ok) {
      throw new Error(
        `Rollback restart succeeded but health is still failing (status=${health.status} body=${health.bodyText})`
      );
    }
    return {
      restoredCommit: context.oldCommit,
      serviceHealthRechecked: true
    };
  }
  return {
    restoredCommit: context.oldCommit,
    serviceHealthRechecked: false
  };
}

export function registerUpgradeCommand(program: Command): void {
  program
    .command("upgrade")
    .description("Upgrade OpenAssist in-place with rollback on failure")
    .option("--ref <git-ref>", "Git ref to upgrade to")
    .option("--pr <number>", "GitHub pull request number to upgrade to")
    .option("--install-dir <path>", "OpenAssist install directory")
    .option("--skip-restart", "Skip service restart and health check")
    .option("--dry-run", "Validate prerequisites and print planned actions")
    .action(async (options) => {
      const runner = new SpawnCommandRunner();
      const installState = loadInstallState();
      if (options.ref && options.pr) {
        console.error("Upgrade failed: use either --ref or --pr, not both.");
        process.exitCode = 1;
        return;
      }
      if (options.pr) {
        try {
          parsePullRequestNumber(String(options.pr));
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          console.error(`Upgrade failed: ${message}`);
          process.exitCode = 1;
          return;
        }
      }

      const installDir = path.resolve(
        String(options.installDir ?? installState?.installDir ?? defaultInstallDir())
      );
      const legacyLayout = detectLegacyDefaultLayout(installDir);
      const configPath =
        installState?.configPath ??
        (!fs.existsSync(defaultConfigPath()) && legacyLayout.status !== "none"
          ? legacyLayout.legacy.configPath
          : defaultConfigPath());
      const envFilePath =
        installState?.envFilePath ?? defaultEnvFilePath();

      const context: UpgradeContext = {
        installDir,
        configPath,
        envFilePath,
        targetRef: String(options.ref ?? ""),
        trackedRef: installState?.trackedRef,
        repoUrl: installState?.repoUrl
      };

      const skipRestart = Boolean(options.skipRestart);
      const dryRun = Boolean(options.dryRun);

      try {
        const hasGit = await binaryAvailable(runner, "git");
        const hasPnpm = await binaryAvailable(runner, "pnpm");
        const hasNode = await binaryAvailable(runner, "node");
        const repoBacked = fs.existsSync(path.join(installDir, ".git"));
        const configExists = fs.existsSync(configPath);
        const envExists = fs.existsSync(envFilePath);
        let parsedConfig;
        let validationErrors: Array<{ code: string; message: string; hint?: string }> = [];
        let growthState:
          | ReturnType<typeof inspectLocalGrowthState>
          | undefined;
        if (configExists) {
          try {
            parsedConfig = loadConfig({
              baseFile: configPath,
              overlaysDir: resolveConfigOverlaysDir(configPath)
            }).config;
            growthState = inspectLocalGrowthState(configPath, parsedConfig, logger);
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            validationErrors = [
              {
                code: "config.read_failed",
                message: `OpenAssist could not load the config file: ${message}`,
                hint: "Fix the config file before upgrading."
              }
            ];
          }
        }
        const repoMetadata = detectInstallStateFromRepo(installDir);
        context.trackedRef = repoMetadata.trackedRef ?? context.trackedRef;
        context.repoUrl = repoMetadata.repoUrl ?? context.repoUrl;
        context.currentBranch = repoBacked && hasGit ? await detectCurrentBranch(runner, installDir) : "HEAD";
        context.oldCommit = repoBacked && hasGit ? await detectCurrentCommit(runner, installDir) : "(unknown)";
        const plan = buildUpgradePlan({
          optionRef: context.targetRef || undefined,
          optionPr: options.pr ? String(options.pr) : undefined,
          currentBranch: context.currentBranch,
          trackedRef: context.trackedRef,
          skipRestart,
          dryRun
        });
        context.targetRef = plan.targetRef ?? context.targetRef;
        const baseUrl = detectDefaultDaemonBaseUrl(configPath);
        const dirtyState = repoBacked && hasGit ? classifyGitDirtyState(installDir) : undefined;
        const dirtyWorkingTree = dirtyState?.hasRealCodeChanges === true;
        const report = buildLifecycleReport({
          installDir,
          configPath,
          envFilePath,
          installStatePresent: Boolean(installState),
          repoBacked,
          configExists,
          envExists,
          repoUrl: context.repoUrl,
          trackedRef: context.trackedRef,
          currentBranch: context.currentBranch,
          currentCommit: context.oldCommit,
          config: parsedConfig,
          validationErrors,
          hasGit,
          hasPnpm,
          hasNode,
          daemonBuildExists: fs.existsSync(path.join(installDir, "apps", "openassistd", "dist", "index.js")),
          dirtyWorkingTree,
          explicitUpgradeTargetProvided: Boolean(options.ref || options.pr),
          growth: growthState
            ? {
                skillsDirectory: growthState.skillsDirectory,
                helperToolsDirectory: growthState.helperToolsDirectory,
                installedSkillCount: growthState.installedSkills.length,
                managedHelperCount: growthState.managedHelpers.length,
                installedSkillIds: growthState.installedSkills.map((item) => item.id),
                managedHelperIds: growthState.managedHelpers.map((item) => item.id),
                updateSafetyNote: growthState.updateSafetyNote
              }
            : undefined,
          legacyDefaultLayoutStatus:
            legacyLayout.status !== "none"
              ? legacyLayout.status
              : dirtyState?.hasLegacyOperatorState && !dirtyWorkingTree
                ? "ready"
                : undefined,
          legacyDefaultLayoutReason: legacyLayout.reason
        });

        printLines(
          renderUpgradePlanSummary({
            installDir,
            currentBranch: context.currentBranch,
            currentCommit: context.oldCommit,
            trackedRef: context.trackedRef,
            rollbackTarget: context.oldCommit,
            upgradeReadiness: report.summary.upgradeReadiness,
            upgradeBlockers: report.sections.needsActionBeforeUpgrade,
            recommendedNextCommand: report.recommendedNextCommand.command,
            growth: growthState
              ? {
                  installedSkillCount: growthState.installedSkills.length,
                  managedHelperCount: growthState.managedHelpers.length,
                  skillsDirectory: growthState.skillsDirectory,
                  helperToolsDirectory: growthState.helperToolsDirectory,
                  updateSafetyNote: growthState.updateSafetyNote
                }
              : undefined,
            plan
          })
        );

        if (report.summary.upgradeReadiness !== "safe-to-continue") {
          if (dryRun) {
            console.log(
              `Dry-run complete. Upgrade is not ready yet: ${
                report.summary.upgradeReadiness === "rerun-bootstrap"
                  ? "rerun bootstrap instead"
                  : "fix the reported blockers before updating"
              }.`
            );
            console.log(`- Recommended next command: ${report.recommendedNextCommand.command}`);
            process.exitCode = 1;
            return;
          }

          throw new Error(
            report.sections.needsActionBeforeUpgrade[0]?.detail ??
              "Upgrade is not ready yet. Run openassist doctor for the grouped lifecycle report."
          );
        }

        await ensureGitClean(runner, installDir);

        if (dryRun) {
          console.log("Dry-run complete. Upgrade is safe to continue with the install directory and update track shown above.");
          if (context.currentBranch === "HEAD") {
            console.log(
              "- This install is currently on a detached commit, so the dry-run resolved the target ref explicitly to keep the update predictable."
            );
          }
          console.log(
            "- When you are ready, rerun: openassist upgrade"
          );
          printUpgradeNextSteps(baseUrl, skipRestart);
          return;
        }

        if (plan.explicitTargetRequired) {
          throw new Error(
            report.sections.needsActionBeforeUpgrade[0]?.detail ??
              "This install needs an explicit --pr or --ref target before updating."
          );
        }

        if (plan.usePullOnCurrentBranch && plan.targetRef) {
          await runOrThrow(
            runner,
            "git",
            ["fetch", "origin", `refs/heads/${plan.targetRef}:refs/remotes/origin/${plan.targetRef}`],
            {
              cwd: installDir
            }
          );
          await runOrThrow(runner, "git", ["pull", "--ff-only", "origin", context.targetRef], {
            cwd: installDir
          });
        } else {
          await checkoutUpgradeTarget(runner, installDir, plan);
        }

        await runStreamingOrThrow(runner, "pnpm", ["install", "--frozen-lockfile"], {
          cwd: installDir
        });
        await runStreamingOrThrow(runner, "pnpm", ["-r", "build"], {
          cwd: installDir
        });

        const currentCommit = await detectCurrentCommit(runner, installDir);
        const service = createServiceManager(runner);
        const serviceInstalled = await service.isInstalled();

        if (serviceInstalled && !skipRestart) {
          await service.restart();
          const health = await waitForHealthy(baseUrl, 60_000, 2_000);
          if (!health.ok) {
            throw new Error(
              `Health check failed after restart (status=${health.status} body=${health.bodyText})`
            );
          }
        } else if (!skipRestart) {
          const health = await checkHealth(baseUrl);
          if (!health.ok) {
            console.warn(`Warning: service is not installed yet, and the direct daemon health check returned status ${health.status}.`);
          }
        }

        saveInstallState({
          installDir,
          ...(context.repoUrl ? { repoUrl: context.repoUrl } : {}),
          trackedRef:
            plan.optionPr !== undefined
              ? buildPullRequestRef(plan.optionPr)
              : context.targetRef,
          serviceManager: service.kind,
          configPath,
          envFilePath,
          lastKnownGoodCommit: currentCommit
        });

        console.log(`Update complete: ${context.oldCommit} -> ${currentCommit}`);
        printUpgradeNextSteps(baseUrl, skipRestart);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`Update failed: ${message}`);

        if (!dryRun) {
          try {
            const service = createServiceManager(runner);
            const installed = await service.isInstalled();
            const baseUrl = detectDefaultDaemonBaseUrl(context.configPath);
            const rollback = await performRollback(runner, installed, context, skipRestart, baseUrl);
            console.error(`Rollback restored: ${rollback.restoredCommit ?? "(unknown commit)"}`);
            console.error(`Service health rechecked: ${rollback.serviceHealthRechecked ? "yes" : "no"}`);
            const rollbackMetadata = detectInstallStateFromRepo(context.installDir);
            saveInstallState({
              installDir: context.installDir,
              ...(rollbackMetadata.repoUrl ?? context.repoUrl
                ? { repoUrl: rollbackMetadata.repoUrl ?? context.repoUrl ?? "" }
                : {}),
              ...(rollbackMetadata.trackedRef ?? context.trackedRef
                ? { trackedRef: rollbackMetadata.trackedRef ?? context.trackedRef ?? "" }
                : {}),
              serviceManager: service.kind,
              configPath: context.configPath,
              envFilePath: context.envFilePath,
              lastKnownGoodCommit: context.oldCommit ?? ""
            });
            console.error("Next command after rollback: openassist doctor");
            printUpgradeNextSteps(baseUrl, skipRestart);
          } catch (rollbackError) {
            const rollbackMessage =
              rollbackError instanceof Error ? rollbackError.message : String(rollbackError);
            console.error(`Rollback failed: ${rollbackMessage}`);
          }
        }

        process.exitCode = 1;
      }
    });
}
