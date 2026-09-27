import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import type { OwnedInstallFile } from "@openassist/core-types";
import { atomicWriteText, loadInstallState, saveInstallState } from "./install-state.js";

const START = "# >>> openassist path >>>";
const END = "# <<< openassist path <<<";
const hash = (value: string) => createHash("sha256").update(value).digest("hex");

export function shellPathBlock(): string {
  const bin = path.join(os.homedir(), ".local", "bin");
  const quoted = `'${bin.replaceAll("'", "'\\''")}'`;
  return `${START}\ncase ":$PATH:" in\n  *:${quoted}:*) ;;\n  *) export PATH=${quoted}:"$PATH" ;;\nesac\n${END}\n`;
}

function profilePaths(): {bash: string[]; zsh: string[]} {
  const zshRoot = process.env.ZDOTDIR ? path.resolve(process.env.ZDOTDIR) : os.homedir();
  return {
    bash: [path.join(os.homedir(), ".bashrc"), path.join(os.homedir(), ".profile")],
    zsh: [path.join(zshRoot, ".zshrc"), path.join(zshRoot, ".zprofile")]
  };
}

function readProfile(file: string): {text: string; mode: number} | undefined {
  let fd: number | undefined;
  try {
    fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    const info = fs.fstatSync(fd);
    if (!info.isFile()) return undefined;
    const buffer = Buffer.alloc(1024 * 1024 + 1);
    const size = fs.readSync(fd, buffer, 0, buffer.length, null);
    if (size > 1024 * 1024) return undefined;
    return {text: buffer.subarray(0, size).toString("utf8"), mode: info.mode & 0o777};
  } catch { return undefined; }
  finally { if (fd !== undefined) fs.closeSync(fd); }
}

/** Called only after packaged bootstrap has committed an installation record. */
export function installShellPath(): {updated: string[]; preserved: string[]} {
  const state = loadInstallState();
  if (!state?.active || process.env.OPENASSIST_STATE_ROOT) throw new Error("Shell PATH setup requires a primary managed installation.");
  const profiles = profilePaths();
  const shell = path.basename(process.env.SHELL ?? "");
  const files = shell === "zsh" ? profiles.zsh : shell === "bash" ? profiles.bash : [profiles.bash[1]];
  const block = shellPathBlock();
  const owned = [...(state.shellProfiles ?? [])];
  const updated: string[] = [], preserved: string[] = [];
  for (const file of files) {
    const existing = readProfile(file);
    if ((!existing && fs.lstatSync(file, {throwIfNoEntry: false})) || existing?.text.includes(START) || existing?.text.includes(END)) {
      preserved.push(file);
      continue;
    }
    const text = existing?.text ?? "";
    atomicWriteText(file, `${text}${text && !text.endsWith("\n") ? "\n" : ""}${block}`, existing?.mode ?? 0o600);
    owned.push({path: file, sha256: hash(block)});
    // Persist ownership after each addition; never claim an existing marker.
    saveInstallState({shellProfiles: owned});
    updated.push(file);
  }
  return {updated, preserved};
}

export function removeShellPathBlocks(owned: OwnedInstallFile[], dryRun: boolean): {edited: string[]; preserved: string[]} {
  const profiles = profilePaths();
  const allowed = new Set([...profiles.bash, ...profiles.zsh]);
  const block = shellPathBlock();
  const edited: string[] = [], preserved: string[] = [];
  for (const item of owned) {
    const current = allowed.has(item.path) ? readProfile(item.path) : undefined;
    if (!current || item.sha256 !== hash(block) || current.text.split(START).length !== 2 || current.text.split(END).length !== 2 || !current.text.includes(block)) {
      preserved.push(item.path);
      continue;
    }
    if (!dryRun) atomicWriteText(item.path, current.text.replace(block, ""), current.mode);
    edited.push(item.path);
  }
  return {edited, preserved};
}
