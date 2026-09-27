import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import net from "node:net";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import TOML from "@iarna/toml";
import { defaultManagedInstallDir, defaultConfigPath, defaultEnvFilePath, defaultInstallStatePath, loadConfig, resolveConfigOverlaysDir, runtimeInstanceId } from "@openassist/config";
import type { InstalledApplication } from "@openassist/core-types";
import { inspectDatabaseVersion } from "@openassist/storage-sqlite";
import { atomicWriteJson, loadInstallState, saveInstallState, type InstallState } from "./install-state.js";
import { acquireLifecycleLock, containedPath, copyPrivateTree, switchCurrent, removeManagedPath } from "./lifecycle-files.js";
import { download, findApplicationRoot, platformArtifact, readBuildIdentity, resolveRelease, sha256, unpackRelease } from "./release.js";
import { SpawnCommandRunner, runOrThrow } from "./command-runner.js";
import { createServiceManager, type ServiceManagerAdapter } from "./service-manager.js";
import { checkHealth } from "./health-check.js";
import { detectDefaultDaemonBaseUrl } from "./runtime-context.js";
import { sourceUpdatePlan } from "./source-update-plan.js";

export interface UpdateOptions {
  source?: boolean; release?: boolean; channel?: "stable" | "preview"; version?: string;
  ref?: string; pr?: string; installDir?: string; skipRestart?: boolean; dryRun?: boolean; json?: boolean; yes?: boolean;
  prepared?: string;
}
export interface LifecycleJournal {
  version: 1; id: string; phase: "preparing" | "prepared" | "stopped" | "backed-up" | "activating" | "unverified" | "complete" | "rolled-back";
  before?: InstallState; candidate?: InstalledApplication; backup?: string; serviceInstalled?: boolean; wasRunning?: boolean;
}

export function resolveUpdateMethod(options: UpdateOptions, state?: InstallState): "source" | "release" {
  const source = Boolean(options.source || options.ref || options.pr);
  const release = Boolean(options.release || options.channel || options.version);
  if ((source && release) || (options.ref && options.pr)) throw new Error("Choose one source ref/PR or one release target, not conflicting selectors.");
  if (options.channel && !["stable", "preview"].includes(options.channel)) throw new Error("Channel must be stable or preview.");
  if (options.pr && !/^[1-9]\d*$/.test(options.pr)) throw new Error("Invalid pull request number.");
  if (options.ref && (options.ref.startsWith('-') || /[\s\x00-\x1f]/.test(options.ref))) throw new Error("Invalid source ref.");
  return source ? "source" : release ? "release" : state?.active?.method ?? (state || options.installDir ? "source" : "release");
}

export function sourceRef(options: UpdateOptions, state?: InstallState): string {
  if (options.pr) return `refs/pull/${options.pr}/head`;
  if (options.ref) return options.ref;
  const ref = state?.active?.ref ?? state?.trackedRef ?? "main";
  if (ref.startsWith("refs/pull/")) throw new Error("PR installations require an explicit --pr or --ref on every update.");
  return ref;
}

export async function prepareSource(root: string, ref: string, repoUrl = "https://github.com/openassistuk/openassist.git", env?: NodeJS.ProcessEnv): Promise<InstalledApplication> {
  const runner = new SpawnCommandRunner();
  const candidate = path.join(root, "releases", `source-${randomUUID()}`);
  fs.mkdirSync(path.dirname(candidate), {recursive: true, mode: 0o700});
  await runOrThrow(runner, "git", ["clone", "--no-checkout", "--", repoUrl, candidate], {env});
  await runOrThrow(runner, "git", ["fetch", "origin", ref], {cwd: candidate,env});
  await runOrThrow(runner, "git", ["checkout", "--detach", "FETCH_HEAD"], {cwd: candidate,env});
  const commit = (await runOrThrow(runner, "git", ["rev-parse", "HEAD"], {cwd: candidate})).stdout.trim();
  await buildSource(candidate,env);
  const manifest = JSON.parse(fs.readFileSync(path.join(candidate, "package.json"), "utf8"));
  const build = {id: `source-${commit}`, version: manifest.version, commit, nodeVersion: process.versions.node, configVersion: 1, databaseVersion: 1};
  atomicWriteJson(path.join(candidate, "build-identity.json"), build);
  const nodePath = path.join(candidate, "runtime", "bin", process.platform === "win32" ? "node.exe" : "node");
  fs.mkdirSync(path.dirname(nodePath), {recursive: true});
  fs.copyFileSync(process.execPath, nodePath);
  fs.chmodSync(nodePath, 0o700);
  fs.appendFileSync(path.join(candidate,".git","info","exclude"),"\n/build-identity.json\n/runtime/\n");
  return {method: "source", path: candidate, nodePath, build, verified: false, ref};
}

export async function buildSource(directory: string, env?: NodeJS.ProcessEnv): Promise<void> {
  const runner = new SpawnCommandRunner();
  const manifest = JSON.parse(fs.readFileSync(path.join(directory,"package.json"),"utf8"));
  const installed = (await runOrThrow(runner,"pnpm",["--version"],{cwd:directory,env})).stdout.trim();
  if (manifest.packageManager !== `pnpm@${installed}`) throw new Error(`Source builds require the checkout's pinned package manager: ${manifest.packageManager}.`);
  await runOrThrow(runner,"pnpm",["install","--frozen-lockfile"],{cwd:directory,env});
  await runOrThrow(runner,"pnpm",["-r","build"],{cwd:directory,env});
}

export async function stopManagedService(service: ServiceManagerAdapter): Promise<void> {
  if (!service.isRunning || await service.isRunning()) await service.stop();
}

async function prepareRelease(root: string, options: UpdateOptions, state?: InstallState): Promise<InstalledApplication> {
  const version = options.version ?? (!options.channel ? state?.active?.pinnedVersion : undefined);
  const {manifest, baseUrl} = await resolveRelease({channel: options.channel ?? state?.active?.channel ?? "stable", version});
  const artifact = platformArtifact(manifest);
  const free = fs.statfsSync(root);
  if (Number(free.bavail) * Number(free.bsize) < artifact.bytes * 5) throw new Error("Insufficient free space to prepare and retain this release.");
  const data = await download(`${baseUrl}/${artifact.file}`, artifact.bytes, 120_000);
  if (data.length !== artifact.bytes || sha256(data) !== artifact.sha256) throw new Error("Release archive hash/size verification failed.");
  const candidate = path.join(root, "releases", `${manifest.build.id}-${randomUUID()}`);
  unpackRelease(data, candidate);
  const build = readBuildIdentity(candidate);
  if (JSON.stringify(build) !== JSON.stringify(manifest.build)) throw new Error("Archive identity differs from signed release manifest.");
  return {method: "release", path: candidate, nodePath: path.join(candidate, "runtime", "bin", "node"), build, verified: false, channel: manifest.channel, ...(version ? {pinnedVersion: version} : {})};
}

export function assertApplicationCompatible(application: InstalledApplication, configPath: string, cwd: string): void {
  if (application.build.configVersion !== 1 || application.build.databaseVersion !== 1) throw new Error("This transition needs an explicit state migration. Automatic database downgrade is unavailable.");
  const {config} = loadConfig({baseFile: configPath, overlaysDir: resolveConfigOverlaysDir(configPath)});
  inspectDatabaseVersion(path.resolve(cwd, config.runtime.paths.dataDir, "openassist.db"));
}

function validateCandidate(app: InstalledApplication): void {
  if (app.build.id !== "development") readBuildIdentity(app.path);
  for (const entry of ["openassist-cli", "openassistd"]) {
    const result = spawnSync(app.nodePath, [path.join(app.path, "apps", entry, "dist", "index.js"), "--help"], {cwd: app.path, encoding: "utf8", timeout: 30_000});
    if (result.status !== 0) throw new Error(`Prepared ${entry} failed its startup check. Active installation is unchanged.`);
  }
}

export function normalizeConfigPaths(configPath: string, oldDirectory: string): void {
  const overlays = resolveConfigOverlaysDir(configPath);
  const files = [configPath, ...(fs.existsSync(overlays) ? fs.readdirSync(overlays).filter(name=>name.endsWith('.toml')).map(name=>path.join(overlays,name)) : [])];
  for (const file of files) {
    if (!fs.existsSync(file)) continue;
    const data = TOML.parse(fs.readFileSync(file,"utf8")) as unknown as {runtime?:{paths?: Record<string,string>;channels?:Array<{settings?:Record<string,unknown>}>}};
    let changed = false;
    for (const [name,value] of Object.entries(data.runtime?.paths ?? {})) {
      if (typeof value === "string" && !path.isAbsolute(value)) { data.runtime!.paths![name] = path.resolve(oldDirectory,value); changed = true; }
    }
    for (const channel of data.runtime?.channels ?? []) {
      for (const name of ["authDir","sessionDir"]) {
        const value = channel.settings?.[name];
        if (typeof value === "string" && !path.isAbsolute(value)) {channel.settings![name]=path.resolve(oldDirectory,value);changed=true;}
      }
    }
    if (changed) {
      const temp = `${file}.${randomUUID()}.tmp`;
      fs.writeFileSync(temp,TOML.stringify(data as unknown as TOML.JsonMap),{mode:0o600});
      fs.renameSync(temp,file);
    }
  }
}

export function pruneLifecycleHistory(state: InstallState, journal: LifecycleJournal): void {
  const root = state.managedRoot!;
  const keep = new Set([state.active?.path,state.previous?.path,journal.candidate?.path]);
  const releases = path.join(root,"releases");
  if (fs.existsSync(releases)) for (const name of fs.readdirSync(releases)) {
    const directory = path.join(releases,name);
    if (!keep.has(directory) && fs.existsSync(path.join(directory,"build-identity.json")) && !fs.lstatSync(directory).isSymbolicLink()) removeManagedPath(root,directory);
  }
  const backups = path.join(root,"backups");
  if (fs.existsSync(backups)) {
    const entries=fs.readdirSync(backups).filter(name=>/^[a-f0-9-]{36}$/.test(name)).sort((a,b)=>fs.statSync(path.join(backups,b)).mtimeMs-fs.statSync(path.join(backups,a)).mtimeMs);
    for (const name of entries.slice(2)) if(path.join(backups,name)!==journal.backup) removeManagedPath(root,path.join(backups,name));
  }
}

export function serviceOwnedFiles(): string[] {
  if (process.platform === "darwin") return [path.join(os.homedir(), "Library", "LaunchAgents", "ai.openassist.openassistd.plist"), path.join(os.homedir(), ".config", "openassist", "openassistd-launchd-wrapper.sh")];
  return [process.getuid?.() === 0 ? "/etc/systemd/system/openassistd.service" : path.join(os.homedir(), ".config", "systemd", "user", "openassistd.service")];
}

function writeWrappers(app: InstalledApplication): string[] {
  const files: string[] = [];
  for (const name of ["openassist", "openassistd"]) {
    const file = path.join(os.homedir(), ".local", "bin", name);
    if (fs.existsSync(file) && !fs.readFileSync(file,"utf8").includes("openassist")) throw new Error(`Refusing to replace an unrelated command: ${file}`);
    fs.mkdirSync(path.dirname(file), {recursive: true});
    const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;
    fs.writeFileSync(file, `#!/bin/sh\n# Managed by OpenAssist lifecycle\nexec ${quote(app.nodePath)} ${quote(path.join(app.path, "apps", name === "openassist" ? "openassist-cli" : "openassistd", "dist", "index.js"))} "$@"\n`, {mode: 0o755});
    files.push(file);
  }
  return files;
}

async function expectedHealth(app: InstalledApplication, configPath: string): Promise<boolean> {
  const deadline = Date.now() + 60_000;
  do {
    if ((await checkHealth(detectDefaultDaemonBaseUrl(configPath), app.build.id === "development" ? undefined : {buildId: app.build.id, instanceId: runtimeInstanceId(configPath)}).catch(() => ({ok: false}))).ok) return true;
    await new Promise(resolve => setTimeout(resolve, 1000));
  } while (Date.now() < deadline);
  return false;
}

export async function assertDaemonStopped(configPath: string): Promise<void> {
  const url = new URL(detectDefaultDaemonBaseUrl(configPath));
  await new Promise<void>((resolve, reject) => {
    const server = net.createServer();
    server.once("error", () => reject(new Error("A process still owns the daemon port. Stop it explicitly before changing application state.")));
    server.listen(Number(url.port), url.hostname.replace(/^\[|\]$/g,""), () => server.close(error => error ? reject(error) : resolve()));
  });
}

async function activate(app: InstalledApplication, state: InstallState, installed: boolean, start: boolean): Promise<string[]> {
  switchCurrent(state.managedRoot!, app.path);
  const wrappers = writeWrappers(app);
  if (installed) {
    const {config} = loadConfig({baseFile: state.configPath, overlaysDir: resolveConfigOverlaysDir(state.configPath)});
    await createServiceManager(new SpawnCommandRunner()).install({installDir: app.path, repoRoot: app.path, nodePath: app.nodePath, configPath: state.configPath, envFilePath: state.envFilePath, start, systemdFilesystemAccess: config.service.systemdFilesystemAccess});
  }
  return [...wrappers, ...(installed ? serviceOwnedFiles() : [])];
}

export async function executeUpdate(options: UpdateOptions, rollback = false): Promise<Record<string, unknown>> {
  let old = loadInstallState();
  const method = resolveUpdateMethod(options, old);
  const ref = method === "source" && !rollback ? sourceRef(options, old) : undefined;
  const root = old?.managedRoot ?? defaultManagedInstallDir();
  const configPath = old?.configPath ?? defaultConfigPath();
  if (options.installDir && old && path.resolve(options.installDir) !== path.resolve(old.installDir)) throw new Error("--install-dir does not match the recorded installation.");
  if (rollback && !old?.previous) throw new Error("No retained application is available for rollback.");
  if (options.dryRun) {
    const release = method === "release" && !rollback ? await resolveRelease({channel: options.channel ?? old?.active?.channel, version: options.version ?? (!options.channel ? old?.active?.pinnedVersion : undefined)}) : undefined;
    return {action: rollback ? "rollback" : "update", method, ref, target: release?.manifest.build ?? old?.previous?.build, root, restart: !options.skipRestart, current: old?.active?.build, statePreserved: true};
  }
  if (process.platform === "win32") throw new Error("Managed lifecycle activation is supported on Linux and macOS. Windows retains development/CI support.");
  if (method === "source" && old && !old.active) {
    const preflight = sourceUpdatePlan({...options,dryRun:true});
    if (!preflight.ok) throw new Error(preflight.lines.join("\n"));
  }
  fs.mkdirSync(root, {recursive: true, mode: 0o700});
  const releaseLock = acquireLifecycleLock(root);
  const journalPath = path.join(root, "operation.json");
  let journal: LifecycleJournal | undefined;
  try {
    if (fs.existsSync(journalPath)) {
      const existing = JSON.parse(fs.readFileSync(journalPath,"utf8")) as LifecycleJournal;
      if (!["complete","rolled-back"].includes(existing.phase)) throw new Error("An unfinished operation needs openassist update recover.");
    }
    if (old && !old.active) {
      const dirty = await runOrThrow(new SpawnCommandRunner(), "git", ["status", "--porcelain"], {cwd: old.installDir});
      if (dirty.stdout.trim()) throw new Error("Preserve local checkout changes before migrating the primary installation.");
      const commit = (await runOrThrow(new SpawnCommandRunner(),"git",["rev-parse","HEAD"],{cwd:old.installDir})).stdout.trim();
      const runtime = path.join(root,"legacy-runtime","node");
      fs.mkdirSync(path.dirname(runtime),{recursive:true});
      fs.copyFileSync(process.execPath,runtime);
      fs.chmodSync(runtime,0o700);
      old = {...old,managedRoot:root,active:{method:"source",path:old.installDir,nodePath:runtime,build:{id:"development",version:"0.1.0",commit,nodeVersion:process.versions.node,configVersion:1,databaseVersion:1},verified:true,ref:old.trackedRef}};
    }
    journal = {version: 1, id: randomUUID(), phase: "preparing", before: old};
    atomicWriteJson(journalPath, journal);
    const app = rollback ? old!.previous! : options.prepared ? {method: "release" as const, path: path.resolve(options.prepared), nodePath: path.join(path.resolve(options.prepared),"runtime","bin","node"), build: readBuildIdentity(options.prepared), verified: false, channel: options.channel ?? "stable", ...(options.version ? {pinnedVersion: options.version} : {})} : method === "source" ? await prepareSource(root, ref!, old?.repoUrl || undefined) : await prepareRelease(root, options, old);
    if (!rollback) containedPath(root, app.path);
    validateCandidate(app);
    assertApplicationCompatible(app, configPath, old?.installDir ?? app.path);
    journal.candidate = app;
    journal.phase = "prepared";
    const service = createServiceManager(new SpawnCommandRunner());
    journal.serviceInstalled = await service.isInstalled();
    const healthWasOk = (await checkHealth(detectDefaultDaemonBaseUrl(configPath)).catch(() => ({ok: false}))).ok;
    journal.wasRunning = service.isRunning ? await service.isRunning() : healthWasOk;
    if (healthWasOk && !journal.serviceInstalled) throw new Error("Stop the manually running daemon before activation.");
    if (!journal.wasRunning) await assertDaemonStopped(configPath);
    atomicWriteJson(journalPath, journal);
    journal.phase = "stopped";
    atomicWriteJson(journalPath, journal);
    if (journal.serviceInstalled) await stopManagedService(service);
    if ((await checkHealth(detectDefaultDaemonBaseUrl(configPath)).catch(() => ({ok: false}))).ok) throw new Error("A daemon still answers after service stop; refusing state backup.");
    await assertDaemonStopped(configPath);
    const backup = path.join(root, "backups", journal.id);
    fs.mkdirSync(backup, {recursive: true, mode: 0o700});
    const {config} = loadConfig({baseFile: configPath, overlaysDir: resolveConfigOverlaysDir(configPath)});
    for (const [name, source] of Object.entries({config: configPath, overlays: resolveConfigOverlaysDir(configPath), env: old?.envFilePath ?? defaultEnvFilePath(), data: path.resolve(old?.installDir ?? app.path, config.runtime.paths.dataDir)})) {
      if (fs.existsSync(source)) copyPrivateTree(source, path.join(backup, name));
    }
    journal.backup = backup;
    journal.phase = "backed-up";
    atomicWriteJson(journalPath, journal);
    normalizeConfigPaths(configPath,old?.installDir ?? app.path);
    const next = {...old, installDir: app.path, managedRoot: root, configPath, envFilePath: old?.envFilePath ?? defaultEnvFilePath(), repoUrl: old?.repoUrl ?? "https://github.com/openassistuk/openassist.git", trackedRef: app.ref ?? app.channel ?? "stable", serviceManager: service.kind, active: app, previous: old?.active, instanceId: runtimeInstanceId(configPath)} as InstallState;
    journal.phase = "activating";
    atomicWriteJson(journalPath, journal);
    const start = Boolean(journal.wasRunning && !options.skipRestart);
    const files = await activate(app, next, Boolean(journal.serviceInstalled), start);
    if (start && !await expectedHealth(app, configPath)) throw new Error("Candidate failed expected-build health verification.");
    app.verified = start;
    next.ownedFiles = files.filter(file => fs.existsSync(file)).map(file => ({path: file, sha256: sha256(fs.readFileSync(file))}));
    saveInstallState({...next, lastKnownGoodCommit: start ? app.build.commit : old?.lastKnownGoodCommit ?? ""});
    journal.phase = start || !journal.serviceInstalled ? "complete" : "unverified";
    atomicWriteJson(journalPath, journal);
    // Retention failure must never roll back an already committed activation.
    let retentionWarning: string | undefined;
    if (journal.phase === "complete" && old?.active) {
      try { pruneLifecycleHistory(next,journal); }
      catch { retentionWarning = "Activation completed; old unreferenced files need manual retention cleanup."; }
    }
    return {action: rollback ? "rollback" : "update", build: app.build, verified: app.verified, backup, retentionWarning, nextCommand: app.verified ? "openassist doctor" : "openassist service start; openassist update recover"};
  } catch (error) {
    if (journal && ["stopped","backed-up","activating"].includes(journal.phase) && old?.active) {
      assertApplicationCompatible(old.active, old.configPath, old.installDir);
      if (journal.serviceInstalled) await stopManagedService(createServiceManager(new SpawnCommandRunner()));
      await assertDaemonStopped(configPath);
      await activate(old.active, {...old, managedRoot: root}, Boolean(journal.serviceInstalled), Boolean(journal.wasRunning));
      if (journal.wasRunning && !await expectedHealth(old.active, old.configPath)) throw new Error("Update and rollback health failed; preserve the operation journal and run openassist update recover.");
      saveInstallState(old);
      journal.phase = "rolled-back";
      atomicWriteJson(journalPath, journal);
    } else if (journal && ["preparing","prepared"].includes(journal.phase)) {
      journal.phase = "rolled-back";
      atomicWriteJson(journalPath, journal);
    }
    throw error;
  } finally { releaseLock(); }
}

export async function recoverUpdate(dryRun = false): Promise<Record<string, unknown>> {
  const state = loadInstallState();
  const root = state?.managedRoot ?? defaultManagedInstallDir();
  const journalPath = path.join(root,"operation.json");
  if (!fs.existsSync(journalPath)) return {action: "recover", detail: "No interrupted operation."};
  const journal = JSON.parse(fs.readFileSync(journalPath,"utf8")) as LifecycleJournal;
  if (dryRun || ["complete","rolled-back"].includes(journal.phase)) return {action: "recover", operation: journal};
  if (fs.existsSync(path.join(root,"operation.lock"))) throw new Error("An operation lock remains. Verify no lifecycle process is running, preserve owner.json, then remove only that lock directory and retry recovery. PID alone is not sufficient proof.");
  const release = acquireLifecycleLock(root);
  try {
    if (journal.phase === "unverified" && journal.candidate && state && await expectedHealth(journal.candidate, state.configPath)) {
      journal.candidate.verified = true;
      saveInstallState({...state, active: journal.candidate, lastKnownGoodCommit: journal.candidate.build.commit});
      journal.phase = "complete";
    } else if (["preparing","prepared"].includes(journal.phase)) journal.phase = "rolled-back";
    else if (journal.before?.active) {
      assertApplicationCompatible(journal.before.active, journal.before.configPath, journal.before.installDir);
      if (journal.serviceInstalled) await stopManagedService(createServiceManager(new SpawnCommandRunner()));
      await assertDaemonStopped(journal.before.configPath);
      await activate(journal.before.active, {...journal.before, managedRoot: root}, Boolean(journal.serviceInstalled), Boolean(journal.wasRunning));
      if (journal.wasRunning && !await expectedHealth(journal.before.active, journal.before.configPath)) throw new Error("Previous application did not recover health.");
      saveInstallState(journal.before);
      journal.phase = "rolled-back";
    } else throw new Error("First-install recovery requires the preserved checkout/service backup; no known-good managed application exists. See the recovery runbook.");
    atomicWriteJson(journalPath, journal);
    return {action: "recover", phase: journal.phase};
  } finally { release(); }
}
