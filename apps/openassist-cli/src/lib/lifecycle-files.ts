import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { randomUUID } from "node:crypto";
import { atomicWriteJson } from "./install-state.js";

/** Never follow a symlink while deleting managed state or deciding ownership. */
export function containedPath(root: string, target: string): string {
  const base = path.resolve(root);
  const absolute = path.resolve(target);
  const relative = path.relative(base, absolute);
  if (!relative || relative.startsWith(`..${path.sep}`) || relative === '..' || path.isAbsolute(relative)) throw new Error("Refusing a path outside the managed directory.");
  let current = base;
  for (const segment of ["", ...relative.split(path.sep)]) {
    current = path.join(current, segment);
    if (fs.lstatSync(current, {throwIfNoEntry: false})?.isSymbolicLink()) throw new Error("Refusing a symlink in a managed path.");
  }
  return absolute;
}

export function removeManagedPath(root: string, target: string): void {
  fs.rmSync(containedPath(root, target), {recursive: true, force: true});
}

export function acquireLifecycleLock(root: string): () => void {
  containedPath(path.dirname(root), root);
  fs.mkdirSync(root, {recursive: true, mode: 0o700});
  const lock = path.join(root, "operation.lock");
  const token = randomUUID();
  try { fs.mkdirSync(lock, {mode: 0o700}); }
  catch { throw new Error("Another lifecycle operation or interrupted lock exists. Inspect openassist update recover before retrying."); }
  atomicWriteJson(path.join(lock, "owner.json"), {token, pid: process.pid, host: os.hostname(), startedAt: new Date().toISOString()});
  return () => {
    const owner = JSON.parse(fs.readFileSync(path.join(lock, "owner.json"), "utf8"));
    if (owner.token !== token) throw new Error("Lifecycle lock ownership changed.");
    fs.rmSync(lock, {recursive: true});
  };
}

export function switchCurrent(root: string, target: string): void {
  const current = path.join(root, "current");
  if (fs.existsSync(current) && !fs.lstatSync(current).isSymbolicLink()) throw new Error("Managed current pointer is not a symbolic link.");
  const pending = path.join(root, `current-${randomUUID()}`);
  fs.symlinkSync(target, pending, process.platform === "win32" ? "junction" : "dir");
  fs.renameSync(pending, current);
}

export function copyPrivateTree(source: string, destination: string): void {
  const info = fs.lstatSync(source);
  if (info.isSymbolicLink()) throw new Error(`Backup needs manual attention for symbolic link: ${source}`);
  if (info.isDirectory()) {
    fs.mkdirSync(destination, {recursive: true, mode: 0o700});
    for (const entry of fs.readdirSync(source)) copyPrivateTree(path.join(source, entry), path.join(destination, entry));
  } else if (info.isFile()) {
    fs.mkdirSync(path.dirname(destination), {recursive: true, mode: 0o700});
    fs.copyFileSync(source, destination, fs.constants.COPYFILE_EXCL);
    if (process.platform !== "win32") fs.chmodSync(destination, 0o600);
  } else throw new Error(`Unsupported state file in backup: ${source}`);
}
