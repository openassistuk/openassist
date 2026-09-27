import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { defaultConfigDir, defaultShareDir, defaultManagedInstallDir, defaultInstallStatePath } from "@openassist/config";
import { loadInstallState } from "./install-state.js";
import { acquireLifecycleLock, removeManagedPath } from "./lifecycle-files.js";
import { serviceOwnedFiles, assertDaemonStopped, stopManagedService } from "./lifecycle-engine.js";
import { sha256 } from "./release.js";
import { createServiceManager } from "./service-manager.js";
import { SpawnCommandRunner } from "./command-runner.js";
import { removeShellPathBlocks } from "./shell-profile.js";

function matchesOwnedFile(file: string, expectedHash: string): boolean {
  let fd: number;
  try { fd=fs.openSync(file,fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW); }
  catch { return false; }
  try { return fs.fstatSync(fd).isFile() && sha256(fs.readFileSync(fd))===expectedHash; }
  finally {fs.closeSync(fd);}
}

export async function uninstallApplication(options: {purge?: boolean; dryRun?: boolean}): Promise<Record<string, unknown>> {
  const state = loadInstallState();
  if (!state) return {action: "uninstall", detail: "No recorded installation; nothing removed."};
  const root = state.managedRoot;
  if (!root || path.resolve(root) !== path.resolve(defaultManagedInstallDir())) throw new Error("This legacy/source checkout is not managed. Use service uninstall, preserve the checkout, and follow the uninstall guide.");
  const allowed = new Set([...serviceOwnedFiles(), ...["openassist","openassistd"].map(name => path.join(os.homedir(),".local","bin",name))]);
  const remove = (state.ownedFiles ?? []).filter(item => allowed.has(item.path) && matchesOwnedFile(item.path,item.sha256)).map(item => item.path);
  const profiles = removeShellPathBlocks(state.shellProfiles ?? [], true);
  const preserved = [...(state.ownedFiles ?? []).filter(item => !remove.includes(item.path)).map(item => item.path), ...profiles.preserved];
  if (options.purge && (path.resolve(state.configPath) !== path.join(defaultConfigDir(),"openassist.toml") || path.resolve(state.envFilePath) !== path.join(defaultConfigDir(),"openassistd.env"))) throw new Error("Custom configuration paths require manual purge; refusing directory deletion.");
  const purge = options.purge ? [defaultConfigDir(), ...["data","logs","skills"].map(name => path.join(defaultShareDir(),name))] : [];
  const result = {action: "uninstall", remove, shellProfileEdits: profiles.edited, applicationPaths: ["releases","current"].map(name => path.join(root,name)), purge, preserved, backupsRetained: true};
  if (options.dryRun) return result;
  const release = acquireLifecycleLock(root);
  try {
    const journalPath = path.join(root,"operation.json");
    if (fs.existsSync(journalPath) && !["complete","rolled-back"].includes(JSON.parse(fs.readFileSync(journalPath,"utf8")).phase)) throw new Error("Recover the unfinished lifecycle operation before uninstalling.");
    const service = createServiceManager(new SpawnCommandRunner());
    if (await service.isInstalled()) {
      if (!serviceOwnedFiles().every(file => remove.includes(file))) throw new Error("Service ownership changed. Preserve the definition and resolve it before uninstalling.");
      await stopManagedService(service);
      await service.uninstall();
    }
    await assertDaemonStopped(state.configPath);
    const removedProfiles = removeShellPathBlocks(state.shellProfiles ?? [], false);
    result.shellProfileEdits = removedProfiles.edited;
    result.preserved = [...new Set([...result.preserved, ...removedProfiles.preserved])];
    for (const file of remove) if (fs.existsSync(file)) fs.unlinkSync(file);
    const current = path.join(root,"current");
    if (fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink()) fs.unlinkSync(current);
    removeManagedPath(root, path.join(root,"releases"));
    for (const file of purge) {
      const parent = file === defaultConfigDir() ? path.dirname(file) : defaultShareDir();
      removeManagedPath(parent, file);
    }
    if (fs.existsSync(defaultInstallStatePath())) fs.unlinkSync(defaultInstallStatePath());
    return result;
  } finally { release(); }
}
