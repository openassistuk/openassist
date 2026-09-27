import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import type { BuildIdentity } from "@openassist/core-types";
import { defaultConfigDir } from "./operator-paths.js";

export function readUpdateCache(): (Record<string, unknown> & {checkedAt:number}) | undefined {
  let fd: number | undefined;
  try {
    fd=fs.openSync(path.join(defaultConfigDir(),"update-check.json"),fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    const buffer=Buffer.alloc(16_385);
    const size=fs.readSync(fd,buffer,0,buffer.length,null);
    if(size>16_384) return undefined;
    const cache=JSON.parse(buffer.subarray(0,size).toString("utf8"));
    return cache && typeof cache.checkedAt==="number" ? cache : undefined;
  } catch {return undefined;}
  finally {if(fd!==undefined)fs.closeSync(fd);}
}

/** Read-only cached notice: status never performs network access or installs updates. */
export function cachedUpdateStatus(): string | undefined {
  try {
    const state=JSON.parse(fs.readFileSync(path.join(defaultConfigDir(),"install-state.json"),"utf8"));
    if(state.notifications===false) return "Update notices disabled";
    const cache=readUpdateCache();
    if(!cache || Date.now()-cache.checkedAt>86_400_000 || Date.now()<cache.checkedAt) return undefined;
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
