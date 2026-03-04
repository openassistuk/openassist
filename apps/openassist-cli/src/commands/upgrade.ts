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
import { loadInstallState, saveInstallState } from "../lib/install-state.js";
import { buildUpgradePlan } from "../lib/upgrade.js";

interface UpgradeContext {
  installDir: string;
  configPath: string;
  envFilePath: string;
  targetRef: string;
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
    throw new Error("Upgrade aborted: git working tree is dirty. Commit/stash changes before upgrading.");
  }
}

async function verifyBinary(runner: SpawnCommandRunner, command: string): Promise<void> {
  const result = await runner.run(command, ["--version"]);
  if (result.code !== 0) {
    throw new Error(`Required command is unavailable: ${command}`);
  }
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

  console.error(`Rolling back to commit ${context.oldCommit}...`);
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
        targetRef: String(options.ref ?? "")
      };

      const skipRestart = Boolean(options.skipRestart);
      const dryRun = Boolean(options.dryRun);

      try {
        await verifyBinary(runner, "git");
        await verifyBinary(runner, "pnpm");
        await verifyBinary(runner, "node");

        context.currentBranch = await detectCurrentBranch(runner, installDir);
        context.oldCommit = await detectCurrentCommit(runner, installDir);
        const plan = buildUpgradePlan({
          optionRef: context.targetRef || undefined,
          currentBranch: context.currentBranch,
          skipRestart,
          dryRun
        });
        context.targetRef = plan.targetRef;

        await ensureGitClean(runner, installDir);
        await runOrThrow(runner, "git", ["fetch", "origin", context.targetRef], {
          cwd: installDir
        });

        if (dryRun) {
          console.log("Upgrade dry-run checks passed.");
          console.log(`installDir: ${installDir}`);
          console.log(`currentCommit: ${context.oldCommit}`);
          console.log(`targetRef: ${context.targetRef}`);
          console.log(`skipRestart: ${String(skipRestart)}`);
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
        const baseUrl = detectDefaultDaemonBaseUrl(configPath);

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
            console.warn(
              `Warning: service not installed; daemon health check failed (status=${health.status}).`
            );
          }
        }

        saveInstallState({
          installDir,
          repoUrl: "",
          trackedRef: context.targetRef,
          serviceManager: service.kind,
          configPath,
          envFilePath,
          lastKnownGoodCommit: currentCommit
        });

        console.log(`Upgrade complete: ${context.oldCommit} -> ${currentCommit}`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`Upgrade failed: ${message}`);

        if (!dryRun) {
          try {
            const service = createServiceManager(runner);
            const installed = await service.isInstalled();
            const baseUrl = detectDefaultDaemonBaseUrl(context.configPath);
            await performRollback(runner, installed, context, skipRestart, baseUrl);
            console.error("Rollback completed.");
            saveInstallState({
              installDir: context.installDir,
              repoUrl: "",
              trackedRef: context.targetRef,
              serviceManager: service.kind,
              configPath: context.configPath,
              envFilePath: context.envFilePath,
              lastKnownGoodCommit: context.oldCommit ?? ""
            });
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
