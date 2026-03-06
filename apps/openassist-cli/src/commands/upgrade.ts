import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import type { Command } from "commander";
import {
  SpawnCommandRunner,
  runOrThrow,
  runStreamingOrThrow
} from "../lib/command-runner.js";
import { checkHealth, waitForHealthy } from "../lib/health-check.js";
import { createServiceManager } from "../lib/service-manager.js";
import { defaultInstallDir, detectDefaultDaemonBaseUrl } from "../lib/runtime-context.js";
import { detectInstallStateFromRepo, loadInstallState, saveInstallState } from "../lib/install-state.js";
import { buildUpgradePlan, renderUpgradePlanSummary } from "../lib/upgrade.js";

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
  const result = await runOrThrow(runner, "git", ["status", "--porcelain"], { cwd });
  if (result.stdout.trim().length > 0) {
    throw new Error(
      "OpenAssist found local code changes in the install directory. Commit or stash them before updating. If this checkout is no longer trustworthy, run bootstrap again in a fresh install directory."
    );
  }
}

async function verifyBinary(runner: SpawnCommandRunner, command: string): Promise<void> {
  const result = await runner.run(command, ["--version"]);
  if (result.code !== 0) {
    throw new Error(`Required command is unavailable: ${command}`);
  }
}

function ensureRepoBackedInstall(installDir: string): void {
  if (!fs.existsSync(path.join(installDir, ".git"))) {
    throw new Error(
      `This update command only works for a repo-backed install at ${installDir}. Re-run install.sh or scripts/install/bootstrap.sh for this directory if the checkout is missing.`
    );
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
): Promise<void> {
  if (!context.oldCommit) {
    return;
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
  }
}

export function registerUpgradeCommand(program: Command): void {
  program
    .command("upgrade")
    .description("Upgrade OpenAssist in-place with rollback on failure")
    .option("--ref <git-ref>", "Git ref to upgrade to")
    .option("--install-dir <path>", "OpenAssist install directory")
    .option("--skip-restart", "Skip service restart and health check")
    .option("--dry-run", "Validate prerequisites and print planned actions")
    .action(async (options) => {
      const runner = new SpawnCommandRunner();
      const installState = loadInstallState();

      const installDir = path.resolve(
        String(options.installDir ?? installState?.installDir ?? defaultInstallDir())
      );
      const configPath = installState?.configPath ?? path.join(installDir, "openassist.toml");
      const envFilePath =
        installState?.envFilePath ??
        path.join(os.homedir(), ".config", "openassist", "openassistd.env");

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
        await verifyBinary(runner, "git");
        await verifyBinary(runner, "pnpm");
        await verifyBinary(runner, "node");
        ensureRepoBackedInstall(installDir);

        const repoMetadata = detectInstallStateFromRepo(installDir);
        context.trackedRef = repoMetadata.trackedRef ?? context.trackedRef;
        context.repoUrl = repoMetadata.repoUrl ?? context.repoUrl;

        context.currentBranch = await detectCurrentBranch(runner, installDir);
        context.oldCommit = await detectCurrentCommit(runner, installDir);
        const plan = buildUpgradePlan({
          optionRef: context.targetRef || undefined,
          currentBranch: context.currentBranch,
          skipRestart,
          dryRun
        });
        context.targetRef = plan.targetRef;
        const baseUrl = detectDefaultDaemonBaseUrl(configPath);

        printLines(
          renderUpgradePlanSummary({
            installDir,
            currentBranch: context.currentBranch,
            currentCommit: context.oldCommit,
            trackedRef: context.trackedRef,
            rollbackTarget: context.oldCommit,
            plan
          })
        );

        await ensureGitClean(runner, installDir);
        await runOrThrow(runner, "git", ["fetch", "origin", context.targetRef], {
          cwd: installDir
        });

        if (dryRun) {
          console.log("Dry-run complete. The update can be applied safely with the same install directory and target ref shown above.");
          if (context.currentBranch === "HEAD") {
            console.log(
              "- This install is currently on a detached commit, so the dry-run resolved the target ref explicitly to keep the update predictable."
            );
          }
          console.log(
            "- When you are ready, rerun openassist upgrade without --dry-run."
          );
          printUpgradeNextSteps(baseUrl, skipRestart);
          return;
        }

        if (plan.usePullOnCurrentBranch) {
          await runOrThrow(runner, "git", ["pull", "--ff-only", "origin", context.targetRef], {
            cwd: installDir
          });
        } else {
          const checkout = await runner.run("git", ["checkout", context.targetRef], {
            cwd: installDir
          });
          if (checkout.code !== 0) {
            await runOrThrow(runner, "git", ["checkout", "--detach", "FETCH_HEAD"], {
              cwd: installDir
            });
          }
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
          trackedRef: context.targetRef,
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
            await performRollback(runner, installed, context, skipRestart, baseUrl);
            console.error("Rollback completed.");
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
