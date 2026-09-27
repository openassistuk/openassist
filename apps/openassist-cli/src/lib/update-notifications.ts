import fs from "node:fs";
import path from "node:path";
import { defaultConfigDir } from "@openassist/config";
import { atomicWriteJson, loadInstallState, saveInstallState } from "./install-state.js";
import { download, resolveRelease } from "./release.js";

export async function checkForUpdate(force = false): Promise<Record<string, unknown>> {
  const state = loadInstallState();
  const file = path.join(defaultConfigDir(),"update-check.json");
  if (!force && state?.notifications === false) return {disabled: true};
  if (!force && fs.existsSync(file)) {
    try { const cached = JSON.parse(fs.readFileSync(file,"utf8")); if (Date.now() - cached.checkedAt < 86_400_000) return cached; } catch { /* Refresh damaged cache. */ }
  }
  let result: Record<string, unknown>;
  try {
    if (!state) return {detail:"No installation record. Install OpenAssist before checking its track."};
    if (!state.active || state.active.method === "source") {
      const ref=state.active?.ref ?? state.trackedRef;
      const match=/^refs\/pull\/(\d+)\/head$/.exec(ref);
      const api=match ? `https://api.github.com/repos/openassistuk/openassist/pulls/${match[1]}` : `https://api.github.com/repos/openassistuk/openassist/commits/${encodeURIComponent(ref)}`;
      if (state.repoUrl && !/^https:\/\/github.com\/openassistuk\/openassist(?:\.git)?$/.test(state.repoUrl)) throw new Error("Custom source remotes require an explicit source update dry-run.");
      const metadata=JSON.parse((await download(api,1024*1024,5000)).toString("utf8"));
      const available=match ? metadata.head?.sha : metadata.sha;
      if (!/^[a-f0-9]{40}$/.test(available)) throw new Error("Invalid source revision response.");
      const current=state.active?.build.commit ?? state.lastKnownGoodCommit;
      result={checkedAt:Date.now(),method:"source",ref,current,available,updateAvailable:current!==available,requiresExplicitTarget:Boolean(match),compatibility:"Checked during staged preparation before service stop."};
    } else {
      const {manifest} = await resolveRelease({channel: state.active.channel, version: state.active.pinnedVersion});
      result = {checkedAt: Date.now(), method:"release", current: state.active.build.version, available: manifest.build.version, updateAvailable: state.active.build.id !== manifest.build.id, pinned: Boolean(state.active.pinnedVersion),compatibility:{config:manifest.build.configVersion,database:manifest.build.databaseVersion}};
    }
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
  if (result.updateAvailable) console.log(`OpenAssist ${result.available} is available. Run: openassist update --dry-run${result.requiresExplicitTarget ? " --pr <number>" : ""}`);
}
