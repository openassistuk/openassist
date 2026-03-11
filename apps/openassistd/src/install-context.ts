import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  defaultEnvFilePath as defaultOperatorEnvFilePath,
  defaultInstallStatePath as defaultOperatorInstallStatePath
} from "@openassist/config";
import type { RuntimeInstallContext } from "@openassist/core-runtime";
import type {
  RuntimeServiceManagerKind,
  RuntimeSystemdFilesystemAccess
} from "@openassist/core-types";
import type { OpenAssistLogger } from "@openassist/observability";

interface StoredInstallState {
  installDir?: string;
  configPath?: string;
  envFilePath?: string;
  trackedRef?: string;
  lastKnownGoodCommit?: string;
}

type InstallContextLogger = Pick<OpenAssistLogger, "warn">;

export const GIT_SPAWN_TIMEOUT_MS = 1000;

function defaultInstallStatePath(): string {
  return defaultOperatorInstallStatePath();
}

function resolveEnvFilePath(): string {
  const envFile = process.env.OPENASSIST_ENV_FILE;
  if (envFile && envFile.trim().length > 0) {
    return path.resolve(envFile);
  }
  return defaultOperatorEnvFilePath();
}

function resolveServiceManagerFromEnv(): RuntimeServiceManagerKind {
  const raw = process.env.OPENASSIST_SERVICE_MANAGER_KIND?.trim();
  if (
    raw === "systemd-user" ||
    raw === "systemd-system" ||
    raw === "launchd" ||
    raw === "manual"
  ) {
    return raw;
  }
  return "unknown";
}

function resolveSystemdFilesystemAccessEffective(
  manager: RuntimeServiceManagerKind
): RuntimeSystemdFilesystemAccess | "unknown" | "not-applicable" {
  if (manager === "launchd") {
    return "not-applicable";
  }
  if (manager !== "systemd-user" && manager !== "systemd-system") {
    return "unknown";
  }

  const raw = process.env.OPENASSIST_SYSTEMD_FILESYSTEM_ACCESS?.trim();
  if (raw === "hardened" || raw === "unrestricted") {
    return raw;
  }
  return "unknown";
}

function loadStoredInstallState(): StoredInstallState | undefined {
  const statePath = defaultInstallStatePath();
  if (!fs.existsSync(statePath)) {
    return undefined;
  }
  try {
    return JSON.parse(fs.readFileSync(statePath, "utf8")) as StoredInstallState;
  } catch {
    return undefined;
  }
}

function findRepoRoot(startDir: string): string | undefined {
  let current = path.resolve(startDir);
  while (true) {
    if (fs.existsSync(path.join(current, ".git"))) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      return undefined;
    }
    current = parent;
  }
}

function createGitValueReader(
  repoRoot: string | undefined,
  logger?: InstallContextLogger
): (args: string[]) => string | undefined {
  if (!repoRoot || !fs.existsSync(path.join(repoRoot, ".git"))) {
    return () => undefined;
  }

  let probeFailed = false;
  return (args: string[]): string | undefined => {
    if (probeFailed) {
      return undefined;
    }

    const result = spawnSync("git", ["-C", repoRoot, ...args], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: GIT_SPAWN_TIMEOUT_MS
    });
    if (result.error) {
      probeFailed = true;
      logger?.warn(
        {
          repoRoot,
          gitArgs: args,
          error: result.error.message
        },
        "runtime install context git probe failed"
      );
      return undefined;
    }
    if (result.status !== 0) {
      return undefined;
    }
    const value = result.stdout.trim();
    return value.length > 0 ? value : undefined;
  };
}

function matchesStoredConfig(
  stored: StoredInstallState | undefined,
  configPath: string
): boolean {
  if (!stored) {
    return false;
  }
  if (stored.configPath && path.resolve(stored.configPath) === configPath) {
    return true;
  }
  if (stored.installDir) {
    const installDir = path.resolve(stored.installDir);
    const relative = path.relative(installDir, configPath);
    return !relative.startsWith("..") && !path.isAbsolute(relative);
  }
  return false;
}

export function loadRuntimeInstallContext(
  configPath: string,
  logger?: InstallContextLogger
): RuntimeInstallContext {
  const resolvedConfigPath = path.resolve(configPath);
  const stored = loadStoredInstallState();
  const matchedStored = matchesStoredConfig(stored, resolvedConfigPath) ? stored : undefined;

  const configuredInstallDir = matchedStored?.installDir
    ? path.resolve(matchedStored.installDir)
    : path.dirname(resolvedConfigPath);
  const repoRoot =
    findRepoRoot(configuredInstallDir) ??
    findRepoRoot(path.dirname(resolvedConfigPath)) ??
    findRepoRoot(process.cwd());

  const readGitValue = createGitValueReader(repoRoot, logger);
  const trackedRefRaw = readGitValue(["rev-parse", "--abbrev-ref", "HEAD"]);
  const trackedRef =
    trackedRefRaw && trackedRefRaw !== "HEAD"
      ? trackedRefRaw
      : matchedStored?.trackedRef?.trim() || undefined;
  const serviceManager = resolveServiceManagerFromEnv();

  return {
    repoBackedInstall: Boolean(repoRoot),
    installDir: repoRoot ?? configuredInstallDir,
    configPath: matchedStored?.configPath
      ? path.resolve(matchedStored.configPath)
      : resolvedConfigPath,
    envFilePath: matchedStored?.envFilePath
      ? path.resolve(matchedStored.envFilePath)
      : resolveEnvFilePath(),
    trackedRef,
    lastKnownGoodCommit: readGitValue(["rev-parse", "HEAD"]) ?? matchedStored?.lastKnownGoodCommit?.trim() ?? undefined,
    serviceManager,
    systemdFilesystemAccessEffective: resolveSystemdFilesystemAccessEffective(serviceManager)
  };
}
