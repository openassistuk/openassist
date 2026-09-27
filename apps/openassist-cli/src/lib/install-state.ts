import fs from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { InstalledApplication, OwnedInstallFile } from "@openassist/core-types";
import {
  defaultConfigPath,
  defaultEnvFilePath,
  defaultInstallDir,
  defaultInstallStatePath
} from "./runtime-context.js";

export type ServiceManagerKind = "systemd-user" | "systemd-system" | "launchd";

export interface InstallState {
  schemaVersion: 2;
  active?: InstalledApplication;
  previous?: InstalledApplication;
  ownedFiles?: OwnedInstallFile[];
  shellProfiles?: OwnedInstallFile[];
  managedRoot?: string;
  instanceId?: string;
  notifications?: boolean;
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
    ...input,
    schemaVersion: 2,
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

export function detectCurrentBranchFromRepo(installDir: string): string | undefined {
  return readGitValue(installDir, ["rev-parse", "--abbrev-ref", "HEAD"]);
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
    if (!raw || typeof raw !== "object" || Array.isArray(raw) ||
        (raw.schemaVersion !== undefined && raw.schemaVersion !== 2) ||
        typeof raw.installDir !== "string" || !path.isAbsolute(raw.installDir)) {
      throw new Error("invalid installation record");
    }
    for (const app of [raw.active, raw.previous]) {
      if (app === null) throw new Error("invalid application record");
      if (app && (!path.isAbsolute(app.path) || !path.isAbsolute(app.nodePath) ||
          !["source", "release"].includes(app.method) || !app.build ||
          typeof app.build.id !== "string" || !/^[a-zA-Z0-9._-]{1,160}$/.test(app.build.id) ||
          typeof app.build.version !== "string" || typeof app.build.nodeVersion !== "string" ||
          !/^[a-f0-9]{40,64}$/.test(app.build.commit) ||
          !Number.isInteger(app.build.configVersion) || !Number.isInteger(app.build.databaseVersion) ||
          typeof app.verified !== "boolean" || (app.channel !== undefined && !["stable","preview"].includes(app.channel)) ||
          (app.ref !== undefined && typeof app.ref !== "string") ||
          (app.pinnedVersion !== undefined && (typeof app.pinnedVersion !== "string" || !/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/.test(app.pinnedVersion))))) {
        throw new Error("invalid application record");
      }
    }
    for (const file of [raw.configPath,raw.envFilePath,raw.managedRoot]) if(file!==undefined && (typeof file!=="string" || !path.isAbsolute(file))) throw new Error("invalid recorded path");
    for (const value of [raw.repoUrl,raw.trackedRef,raw.instanceId,raw.lastKnownGoodCommit,raw.updatedAt]) if(value!==undefined && typeof value!=="string") throw new Error("invalid recorded metadata");
    if(raw.serviceManager!==undefined && !["systemd-user","systemd-system","launchd"].includes(raw.serviceManager)) throw new Error("invalid service ownership");
    if(raw.notifications!==undefined && typeof raw.notifications!=="boolean") throw new Error("invalid notice preference");
    if(raw.ownedFiles!==undefined && (!Array.isArray(raw.ownedFiles) || raw.ownedFiles.length>32 || raw.ownedFiles.some(file=>!file || !path.isAbsolute(file.path) || !/^[a-f0-9]{64}$/.test(file.sha256)))) throw new Error("invalid ownership record");
    if(raw.shellProfiles!==undefined && (!Array.isArray(raw.shellProfiles) || raw.shellProfiles.length>8 || raw.shellProfiles.some(file=>!file || !path.isAbsolute(file.path) || !/^[a-f0-9]{64}$/.test(file.sha256)))) throw new Error("invalid shell profile ownership");
    if(raw.active && raw.installDir !== raw.active.path) throw new Error("active application does not match install directory");
    return normalizeState(raw);
  } catch {
    throw new Error(`Invalid install-state at ${statePath}. Preserve the file and repair it before changing this installation.`);
  }
}

export function saveInstallState(
  state: Partial<InstallState>,
  statePath = defaultInstallStatePath(),
  current?: Partial<InstallState>
): InstallState {
  const normalized = mergeInstallState(current ?? loadInstallState(statePath), state);
  // Service generation may have recorded ownership since the caller's snapshot.
  if (current && !state.ownedFiles) normalized.ownedFiles = loadInstallState(statePath)?.ownedFiles ?? normalized.ownedFiles;
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  atomicWriteJson(statePath, normalized);
  return normalized;
}

export function atomicWriteJson(file: string, value: unknown): void {
  atomicWriteText(file, JSON.stringify(value, null, 2));
}

export function atomicWriteText(file: string, value: string, mode = 0o600): void {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const temporary = `${file}.${randomUUID()}.tmp`;
  const fd = fs.openSync(temporary, "wx", mode);
  try {
    fs.writeFileSync(fd, value);
    fs.fsyncSync(fd);
  } finally { fs.closeSync(fd); }
  fs.renameSync(temporary, file);
}
