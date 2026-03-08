import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  resolveOperatorPaths,
  type OpenAssistConfig,
  type OpenAssistOperatorPaths
} from "@openassist/config";
import { SpawnCommandRunner } from "./command-runner.js";
import { loadBaseConfigObject, saveConfigObject } from "./config-edit.js";
import { waitForHealthy } from "./health-check.js";
import { loadInstallState, saveInstallState } from "./install-state.js";
import { detectDefaultDaemonBaseUrl, defaultInstallDir, defaultInstallStatePath } from "./runtime-context.js";
import { createServiceManager } from "./service-manager.js";

export interface LegacyDefaultLayoutPaths {
  configPath: string;
  overlaysDir: string;
  stateRoot: string;
  dataDir: string;
  logsDir: string;
  skillsDir: string;
}

export interface LegacyDefaultLayoutDetection {
  status: "none" | "ready" | "blocked";
  installDir: string;
  legacy: LegacyDefaultLayoutPaths;
  operator: OpenAssistOperatorPaths;
  reason?: string;
}

export interface LegacyDefaultLayoutMigrationResult {
  migrated: boolean;
  cleanedLegacyArtifacts: boolean;
  backupDir?: string;
  configPath: string;
  envFilePath: string;
  message: string;
}

export interface AutoMigrationResult {
  configPath: string;
  envFilePath: string;
  migrated: boolean;
  message?: string;
  blockedReason?: string;
}

export function legacyDefaultLayoutPaths(installDir: string): LegacyDefaultLayoutPaths {
  return {
    configPath: path.join(installDir, "openassist.toml"),
    overlaysDir: path.join(installDir, "config.d"),
    stateRoot: path.join(installDir, ".openassist"),
    dataDir: path.join(installDir, ".openassist", "data"),
    logsDir: path.join(installDir, ".openassist", "logs"),
    skillsDir: path.join(installDir, ".openassist", "skills")
  };
}

function exists(pathLike: string): boolean {
  return fs.existsSync(pathLike);
}

function directoryEmptyOrMissing(target: string): boolean {
  if (!exists(target)) {
    return true;
  }
  if (!fs.statSync(target).isDirectory()) {
    return false;
  }
  return fs.readdirSync(target).length === 0;
}

function hasTomlOverlayFiles(target: string): boolean {
  if (!exists(target) || !fs.statSync(target).isDirectory()) {
    return false;
  }
  return fs.readdirSync(target).some((entry) => entry.endsWith(".toml"));
}

function matchesLegacyRuntimePaths(config: OpenAssistConfig, legacy: LegacyDefaultLayoutPaths): boolean {
  const values = config.runtime.paths;
  return (
    path.resolve(path.dirname(legacy.configPath), values.dataDir) === legacy.dataDir &&
    path.resolve(path.dirname(legacy.configPath), values.logsDir) === legacy.logsDir &&
    path.resolve(path.dirname(legacy.configPath), values.skillsDir) === legacy.skillsDir
  );
}

function looksLikeCustomizedLegacyConfig(config: OpenAssistConfig): boolean {
  if (config.runtime.channels.length > 0) {
    return true;
  }
  if (config.runtime.assistant.name !== "OpenAssist") {
    return true;
  }
  if (config.runtime.assistant.persona !== "Pragmatic, concise, and execution-focused local AI assistant.") {
    return true;
  }
  if ((config.runtime.assistant.operatorPreferences ?? "").trim().length > 0) {
    return true;
  }
  if (config.runtime.assistant.promptOnFirstContact === false) {
    return true;
  }
  if (
    config.runtime.defaultProviderId !== "openai-main" ||
    config.runtime.providers.length !== 1 ||
    config.runtime.providers[0]?.id !== "openai-main" ||
    config.runtime.providers[0]?.type !== "openai" ||
    config.runtime.providers[0]?.defaultModel !== "gpt-5.4"
  ) {
    return true;
  }
  return false;
}

export function detectLegacyDefaultLayout(
  installDir = defaultInstallDir(),
  homePaths = resolveOperatorPaths({ installDir })
): LegacyDefaultLayoutDetection {
  const legacy = legacyDefaultLayoutPaths(installDir);
  if (!exists(legacy.configPath)) {
    return {
      status: "none",
      installDir,
      legacy,
      operator: homePaths
    };
  }

  if (exists(homePaths.configPath)) {
    return {
      status: "none",
      installDir,
      legacy,
      operator: homePaths
    };
  }

  try {
    const config = loadBaseConfigObject(legacy.configPath);
    if (!matchesLegacyRuntimePaths(config, legacy)) {
      return {
        status: "blocked",
        installDir,
        legacy,
        operator: homePaths,
        reason:
          "Legacy repo-local config uses custom runtime paths. Automatic migration only handles the old default repo-local layout."
      };
    }

    const installState = loadInstallState();
    const installStateUsesLegacyConfig =
      Boolean(installState) &&
      path.resolve(installState?.installDir ?? "") === path.resolve(installDir) &&
      path.resolve(installState?.configPath ?? "") === path.resolve(legacy.configPath);
    const hasLegacyWritableState =
      exists(legacy.stateRoot) || hasTomlOverlayFiles(legacy.overlaysDir) || installStateUsesLegacyConfig;
    if (!hasLegacyWritableState && !looksLikeCustomizedLegacyConfig(config)) {
      return {
        status: "none",
        installDir,
        legacy,
        operator: homePaths
      };
    }
  } catch (error) {
    return {
      status: "blocked",
      installDir,
      legacy,
      operator: homePaths,
      reason: `Legacy repo-local config could not be read: ${error instanceof Error ? error.message : String(error)}`
    };
  }

  const conflictingTargets: string[] = [];
  if (exists(legacy.overlaysDir) && !directoryEmptyOrMissing(homePaths.overlaysDir)) {
    conflictingTargets.push(homePaths.overlaysDir);
  }
  if (exists(legacy.dataDir) && !directoryEmptyOrMissing(homePaths.dataDir)) {
    conflictingTargets.push(homePaths.dataDir);
  }
  if (exists(legacy.logsDir) && !directoryEmptyOrMissing(homePaths.logsDir)) {
    conflictingTargets.push(homePaths.logsDir);
  }
  if (exists(legacy.skillsDir) && !directoryEmptyOrMissing(homePaths.skillsDir)) {
    conflictingTargets.push(homePaths.skillsDir);
  }

  if (conflictingTargets.length > 0) {
    return {
      status: "blocked",
      installDir,
      legacy,
      operator: homePaths,
      reason: `Automatic migration stopped because target home-state paths already contain data: ${conflictingTargets.join(", ")}`
    };
  }

  return {
    status: "ready",
    installDir,
    legacy,
    operator: homePaths
  };
}

function copyIfExists(source: string, target: string): void {
  if (!exists(source)) {
    return;
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.cpSync(source, target, { recursive: true, force: true });
}

function removeIfExists(target: string): void {
  if (!exists(target)) {
    return;
  }
  fs.rmSync(target, { recursive: true, force: true });
}

type TrackedRepoPathAction = "restored" | "delete" | "preserve";

function classifyTrackedRepoPathAction(installDir: string, relativePath: string): TrackedRepoPathAction {
  if (!exists(path.join(installDir, ".git"))) {
    return "delete";
  }

  const normalizedRelativePath = relativePath.replace(/\\/g, "/");
  const trackedResult = spawnSync("git", ["-C", installDir, "ls-files", "--error-unmatch", normalizedRelativePath], {
    stdio: "ignore"
  });
  if (trackedResult.error || trackedResult.status === null) {
    return "preserve";
  }
  if (trackedResult.status !== 0) {
    return "delete";
  }

  const checkoutResult = spawnSync("git", ["-C", installDir, "checkout", "--", normalizedRelativePath], {
    stdio: "ignore"
  });
  if (checkoutResult.error || checkoutResult.status === null) {
    return "preserve";
  }
  return checkoutResult.status === 0 ? "restored" : "preserve";
}

function cleanupLegacyArtifacts(detection: LegacyDefaultLayoutDetection): { cleaned: boolean } {
  removeIfExists(detection.legacy.stateRoot);

  const configAction = classifyTrackedRepoPathAction(
    detection.installDir,
    path.relative(detection.installDir, detection.legacy.configPath)
  );
  if (configAction === "delete") {
    removeIfExists(detection.legacy.configPath);
  }

  const overlaysAction = classifyTrackedRepoPathAction(
    detection.installDir,
    path.join(path.relative(detection.installDir, detection.legacy.overlaysDir), ".gitkeep")
  );
  if (overlaysAction === "delete") {
    removeIfExists(detection.legacy.overlaysDir);
  } else if (overlaysAction === "restored" && exists(detection.legacy.overlaysDir)) {
    for (const entry of fs.readdirSync(detection.legacy.overlaysDir)) {
      if (entry === ".gitkeep") {
        continue;
      }
      removeIfExists(path.join(detection.legacy.overlaysDir, entry));
    }
  }

  return {
    cleaned: configAction !== "preserve" && overlaysAction !== "preserve"
  };
}

export async function migrateLegacyDefaultLayout(
  detection: LegacyDefaultLayoutDetection
): Promise<LegacyDefaultLayoutMigrationResult> {
  if (detection.status !== "ready") {
    return {
      migrated: false,
      cleanedLegacyArtifacts: false,
      configPath: detection.operator.configPath,
      envFilePath: detection.operator.envFilePath,
      message: detection.reason ?? "Legacy repo-local layout is not eligible for automatic migration."
    };
  }

  const config = loadBaseConfigObject(detection.legacy.configPath);
  config.runtime.paths.dataDir = detection.operator.dataDir;
  config.runtime.paths.logsDir = detection.operator.logsDir;
  config.runtime.paths.skillsDir = detection.operator.skillsDir;

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupDir = path.join(detection.operator.migrationBackupsDir, stamp);
  fs.mkdirSync(backupDir, { recursive: true });
  copyIfExists(detection.legacy.configPath, path.join(backupDir, "openassist.toml"));
  copyIfExists(detection.legacy.overlaysDir, path.join(backupDir, "config.d"));
  copyIfExists(detection.legacy.stateRoot, path.join(backupDir, ".openassist"));
  copyIfExists(defaultInstallStatePath(), path.join(backupDir, "install-state.json"));

  saveConfigObject(detection.operator.configPath, config);
  copyIfExists(detection.legacy.overlaysDir, detection.operator.overlaysDir);
  copyIfExists(detection.legacy.dataDir, detection.operator.dataDir);
  copyIfExists(detection.legacy.logsDir, detection.operator.logsDir);
  copyIfExists(detection.legacy.skillsDir, detection.operator.skillsDir);

  const current = loadInstallState();
  saveInstallState(
    {
      installDir: detection.installDir,
      configPath: detection.operator.configPath,
      envFilePath: detection.operator.envFilePath
    },
    undefined,
    current
  );

  let cleanedLegacyArtifacts = false;
  let message: string;
  const buildExists = exists(path.join(detection.installDir, "apps", "openassistd", "dist", "index.js"));
  if (!buildExists) {
    const cleanup = cleanupLegacyArtifacts(detection);
    cleanedLegacyArtifacts = cleanup.cleaned;
    message = cleanup.cleaned
      ? `Migrated repo-local operator state into ${detection.operator.configDir} and cleaned the old repo-local state because no built daemon is present yet.`
      : `Migrated repo-local operator state into ${detection.operator.configDir}, but kept tracked repo files in place because git checkout was unavailable during cleanup.`;
  } else {
    const runner = new SpawnCommandRunner();
    let service: ReturnType<typeof createServiceManager> | undefined;
    try {
      service = createServiceManager(runner);
    } catch {
      service = undefined;
    }

    if (!service) {
      const cleanup = cleanupLegacyArtifacts(detection);
      cleanedLegacyArtifacts = cleanup.cleaned;
      message = cleanup.cleaned
        ? `Migrated repo-local operator state into ${detection.operator.configDir} and cleaned the old repo-local state because no managed service refresh is available on this host.`
        : `Migrated repo-local operator state into ${detection.operator.configDir}, but kept tracked repo files in place because git checkout was unavailable during cleanup.`;
    } else {
      try {
        const installed = await service.isInstalled();
        if (installed) {
          await service.install({
            installDir: detection.installDir,
            configPath: detection.operator.configPath,
            envFilePath: detection.operator.envFilePath,
            repoRoot: detection.installDir
        });
        await service.restart();
          const health = await waitForHealthy(
            detectDefaultDaemonBaseUrl(detection.operator.configPath),
            60_000,
            2_000
          );
          if (health.ok) {
            const cleanup = cleanupLegacyArtifacts(detection);
            cleanedLegacyArtifacts = cleanup.cleaned;
            message = cleanup.cleaned
              ? `Migrated repo-local operator state into ${detection.operator.configDir} and cleaned the old repo-local state after a healthy restart.`
              : `Migrated repo-local operator state into ${detection.operator.configDir}, but kept tracked repo files in place because git checkout was unavailable during cleanup.`;
          } else {
            message = `Migrated repo-local operator state into ${detection.operator.configDir}, but kept old repo-local files because service health was not confirmed yet.`;
          }
        } else {
          const cleanup = cleanupLegacyArtifacts(detection);
          cleanedLegacyArtifacts = cleanup.cleaned;
          message = cleanup.cleaned
            ? `Migrated repo-local operator state into ${detection.operator.configDir} and cleaned the old repo-local state because no service is installed yet.`
            : `Migrated repo-local operator state into ${detection.operator.configDir}, but kept tracked repo files in place because git checkout was unavailable during cleanup.`;
        }
      } catch (error) {
        message = `Migrated repo-local operator state into ${detection.operator.configDir}, but kept old repo-local files because service refresh did not complete: ${error instanceof Error ? error.message : String(error)}`;
      }
    }
  }

  return {
    migrated: true,
    cleanedLegacyArtifacts,
    backupDir,
    configPath: detection.operator.configPath,
    envFilePath: detection.operator.envFilePath,
    message
  };
}

export async function autoMigrateLegacyDefaultLayoutIfNeeded(options: {
  installDir: string;
  configPath: string;
  envFilePath: string;
}): Promise<AutoMigrationResult> {
  const operatorPaths = resolveOperatorPaths({ installDir: options.installDir });
  if (
    path.resolve(options.configPath) !== path.resolve(operatorPaths.configPath) ||
    path.resolve(options.envFilePath) !== path.resolve(operatorPaths.envFilePath)
  ) {
    return {
      configPath: options.configPath,
      envFilePath: options.envFilePath,
      migrated: false
    };
  }

  const detection = detectLegacyDefaultLayout(options.installDir, operatorPaths);
  if (detection.status === "none") {
    return {
      configPath: options.configPath,
      envFilePath: options.envFilePath,
      migrated: false
    };
  }

  if (detection.status === "blocked") {
    return {
      configPath: options.configPath,
      envFilePath: options.envFilePath,
      migrated: false,
      blockedReason: detection.reason
    };
  }

  const result = await migrateLegacyDefaultLayout(detection);
  return {
    configPath: result.configPath,
    envFilePath: result.envFilePath,
    migrated: result.migrated,
    message: result.message
  };
}
