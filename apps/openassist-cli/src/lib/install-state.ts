import fs from "node:fs";
import path from "node:path";
import { defaultEnvFilePath, defaultInstallDir, defaultInstallStatePath } from "./runtime-context.js";

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
    configPath: input.configPath ?? path.join(installDir, "openassist.toml"),
    envFilePath: input.envFilePath ?? defaultEnvFilePath(),
    lastKnownGoodCommit: input.lastKnownGoodCommit ?? "",
    updatedAt: input.updatedAt ?? new Date().toISOString()
  };
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

export function saveInstallState(state: Partial<InstallState>, statePath = defaultInstallStatePath()): InstallState {
  const normalized = normalizeState(state);
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  fs.writeFileSync(statePath, JSON.stringify(normalized, null, 2), "utf8");
  return normalized;
}
