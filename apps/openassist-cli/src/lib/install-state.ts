import fs from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import {
  defaultConfigPath,
  defaultEnvFilePath,
  defaultInstallDir,
  defaultInstallStatePath
} from "./runtime-context.js";

export type ServiceManagerKind = "systemd-user" | "systemd-system" | "launchd";

export interface InstallState {
  installDir: string;
  repoUrl: string;
  trackedRef: string;
  serviceManager: ServiceManagerKind;
  configPath: string;
  envFilePath: string;
  lastKnownGoodCommit: string;
  updatedAt: string;
}

function normalizeState(input: Partial<InstallState>): InstallState {
  const installDir = input.installDir ?? defaultInstallDir();
  const defaultServiceManager: ServiceManagerKind =
    process.platform === "darwin"
      ? "launchd"
      : process.getuid?.() === 0
        ? "systemd-system"
        : "systemd-user";
  return {
    installDir,
    repoUrl: input.repoUrl ?? "",
    trackedRef: input.trackedRef ?? "main",
    serviceManager: input.serviceManager ?? defaultServiceManager,
    configPath: input.configPath ?? defaultConfigPath(),
    envFilePath: input.envFilePath ?? defaultEnvFilePath(),
    lastKnownGoodCommit: input.lastKnownGoodCommit ?? "",
    updatedAt: input.updatedAt ?? new Date().toISOString()
  };
}

function mergeDefined<T extends Record<string, unknown>>(base: T, updates: Partial<T>): T {
  const merged = { ...base };
  for (const [key, value] of Object.entries(updates)) {
    if (value !== undefined) {
      merged[key as keyof T] = value as T[keyof T];
    }
  }
  return merged;
}

function readGitValue(installDir: string, args: string[]): string | undefined {
  if (!fs.existsSync(path.join(installDir, ".git"))) {
    return undefined;
  }
  const result = spawnSync("git", ["-C", installDir, ...args], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"]
  });
  if (result.status !== 0) {
    return undefined;
  }
  const value = result.stdout.trim();
  return value.length > 0 ? value : undefined;
}

export function detectInstallStateFromRepo(installDir: string): Partial<InstallState> {
  const trackedRefRaw = readGitValue(installDir, ["rev-parse", "--abbrev-ref", "HEAD"]);
  const trackedRef =
    trackedRefRaw && trackedRefRaw !== "HEAD" ? trackedRefRaw : undefined;

  return {
    repoUrl: readGitValue(installDir, ["config", "--get", "remote.origin.url"]),
    trackedRef,
    lastKnownGoodCommit: readGitValue(installDir, ["rev-parse", "HEAD"])
  };
}

export function mergeInstallState(
  current: Partial<InstallState> | undefined,
  updates: Partial<InstallState>
): InstallState {
  const merged = mergeDefined(current ?? {}, updates);
  return normalizeState(merged);
}

export function loadInstallState(statePath = defaultInstallStatePath()): InstallState | undefined {
  if (!fs.existsSync(statePath)) {
    return undefined;
  }
  try {
    const raw = JSON.parse(fs.readFileSync(statePath, "utf8")) as Partial<InstallState>;
    return normalizeState(raw);
  } catch {
    return undefined;
  }
}

export function saveInstallState(
  state: Partial<InstallState>,
  statePath = defaultInstallStatePath(),
  current?: Partial<InstallState>
): InstallState {
  const normalized = mergeInstallState(current ?? loadInstallState(statePath), state);
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  fs.writeFileSync(statePath, JSON.stringify(normalized, null, 2), "utf8");
  return normalized;
}
