import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import type { BuildIdentity } from "@openassist/core-types";
import { defaultConfigDir } from "./operator-paths.js";

/** Read-only cached notice: status never performs network access or installs updates. */
export function cachedUpdateStatus(): string | undefined {
  try {
    const state=JSON.parse(fs.readFileSync(path.join(defaultConfigDir(),"install-state.json"),"utf8"));
    if(state.notifications===false) return "Update notices disabled";
    const file=path.join(defaultConfigDir(),"update-check.json");
    if(fs.statSync(file).size>16_384)return undefined;
    const cache=JSON.parse(fs.readFileSync(file,"utf8"));
    if(typeof cache.checkedAt!=="number" || Date.now()-cache.checkedAt>86_400_000 || Date.now()<cache.checkedAt) return undefined;
    if(cache.updateAvailable && typeof cache.available==="string" && /^[a-zA-Z0-9._-]{1,80}$/.test(cache.available)) return `Update available: ${cache.available}; run openassist update --dry-run`;
    return cache.status==="unavailable" ? "Update check unavailable" : "No update available at last check";
  } catch { return undefined; }
}

export function runtimeInstanceId(configPath: string): string {
  return createHash("sha256").update(path.resolve(configPath)).digest("hex").slice(0, 24);
}

export function getBuildIdentity(start = path.dirname(fileURLToPath(import.meta.url))): BuildIdentity {
  let current = start;
  while (true) {
    const file = path.join(current, "build-identity.json");
    if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8")) as BuildIdentity;
    const parent = path.dirname(current);
    if (parent === current) return {id: "development", version: "0.1.0", commit: "unknown", nodeVersion: process.versions.node, configVersion: 1, databaseVersion: 1};
    current = parent;
  }
}
