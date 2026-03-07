import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import type { RuntimeInstallContext } from "@openassist/core-runtime";

interface StoredInstallState {
  installDir?: string;
  configPath?: string;
  envFilePath?: string;
  trackedRef?: string;
  lastKnownGoodCommit?: string;
}

function defaultInstallStatePath(): string {
  return path.join(os.homedir(), ".config", "openassist", "install-state.json");
}

function resolveEnvFilePath(): string {
  const envFile = process.env.OPENASSIST_ENV_FILE;
  if (envFile && envFile.trim().length > 0) {
    return path.resolve(envFile);
  }
  return path.join(os.homedir(), ".config", "openassist", "openassistd.env");
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

function readGitValue(repoRoot: string | undefined, args: string[]): string | undefined {
  if (!repoRoot || !fs.existsSync(path.join(repoRoot, ".git"))) {
    return undefined;
  }
  const result = spawnSync("git", ["-C", repoRoot, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"]
  });
  if (result.status !== 0) {
    return undefined;
  }
  const value = result.stdout.trim();
  return value.length > 0 ? value : undefined;
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

export function loadRuntimeInstallContext(configPath: string): RuntimeInstallContext {
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

  const trackedRefRaw = readGitValue(repoRoot, ["rev-parse", "--abbrev-ref", "HEAD"]);
  const trackedRef =
    trackedRefRaw && trackedRefRaw !== "HEAD"
      ? trackedRefRaw
      : matchedStored?.trackedRef?.trim() || undefined;

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
    lastKnownGoodCommit:
      readGitValue(repoRoot, ["rev-parse", "HEAD"]) ??
      matchedStored?.lastKnownGoodCommit?.trim() ??
      undefined
  };
}
