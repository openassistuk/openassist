import path from "node:path";
import { defaultConfigDir, readUpdateCache } from "@openassist/config";
import { atomicWriteJson, loadInstallState, saveInstallState } from "./install-state.js";
import { discoverRelease, discoverSource } from "./update-discovery.js";

export async function checkForUpdate(force = false): Promise<Record<string, unknown>> {
  const state = loadInstallState();
  const file = path.join(defaultConfigDir(),"update-check.json");
  if (!force && state?.notifications === false) return {disabled: true};
  if (!force) {
    const cached=readUpdateCache();
    if(cached) {
      const age=Date.now()-cached.checkedAt;
      if(Number.isFinite(age) && age>=0 && age<86_400_000) return cached;
    }
  }
  let result: Record<string, unknown>;
  try {
    if (!state) return {detail:"No installation record. Install OpenAssist before checking its track."};
    if (!state.active || state.active.method === "source") {
      const ref=state.active?.ref ?? state.trackedRef;
      if (state.repoUrl && !/^https:\/\/github.com\/openassistuk\/openassist(?:\.git)?$/.test(state.repoUrl)) throw new Error("Custom source remotes require an explicit source update dry-run.");
      const current=state.active?.build.commit ?? state.lastKnownGoodCommit;
      const {commit:available,pinned}=await discoverSource(ref,current);
      result={checkedAt:Date.now(),method:"source",ref,current,available,pinned,updateAvailable:current!==available,requiresExplicitTarget:/^refs\/pull\/\d+\/head$/.test(ref),compatibility:"Checked during staged preparation before service stop."};
    } else {
      const release = await discoverRelease({channel: state.active.channel, version: state.active.pinnedVersion});
      result = {checkedAt: Date.now(), method:"release", current: state.active.build.version, available: release.version, updateAvailable: state.active.build.version !== release.version, pinned: Boolean(state.active.pinnedVersion),compatibility:"Checked against the signed manifest during preparation before service stop."};
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
