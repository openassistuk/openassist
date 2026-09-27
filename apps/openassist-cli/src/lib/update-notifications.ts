import fs from "node:fs";
import path from "node:path";
import { defaultConfigDir } from "@openassist/config";
import { atomicWriteJson, loadInstallState, saveInstallState } from "./install-state.js";
import { resolveRelease } from "./release.js";

export async function checkForUpdate(force = false): Promise<Record<string, unknown>> {
  const state = loadInstallState();
  const file = path.join(defaultConfigDir(),"update-check.json");
  if (!force && state?.notifications === false) return {disabled: true};
  if (!force && fs.existsSync(file)) {
    try { const cached = JSON.parse(fs.readFileSync(file,"utf8")); if (Date.now() - cached.checkedAt < 86_400_000) return cached; } catch { /* Refresh damaged cache. */ }
  }
  let result: Record<string, unknown>;
  try {
    if (!state?.active || state.active.method === "source") return {method: "source", ref: state?.trackedRef ?? "main", detail: "Use update --dry-run with an explicit --pr for PR tracks to inspect the source update."};
    const {manifest} = await resolveRelease({channel: state.active.channel, version: state.active.pinnedVersion});
    result = {checkedAt: Date.now(), current: state.active.build.version, available: manifest.build.version, updateAvailable: state.active.build.id !== manifest.build.id, pinned: Boolean(state.active.pinnedVersion)};
  } catch {
    result = {checkedAt: Date.now(), status: "unavailable", detail: "Update information is unavailable; the installed application is unchanged."};
  }
  atomicWriteJson(file,result);
  return result;
}

export function setUpdateNotifications(enabled: boolean): void {
  const state = loadInstallState();
  if (!state) throw new Error("Install OpenAssist before configuring update notices.");
  saveInstallState({...state, notifications: enabled});
}

export async function showUpdateNotice(): Promise<void> {
  if (!process.stdout.isTTY) return;
  const result = await checkForUpdate();
  if (result.updateAvailable) console.log(`OpenAssist ${result.available} is available. Run: openassist update --dry-run`);
}
