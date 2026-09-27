import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import type { BuildIdentity, UpdateCheckCache } from "@openassist/core-types";
import { defaultConfigDir } from "./operator-paths.js";

export function readUpdateCache(): UpdateCheckCache | undefined {
  let fd: number | undefined;
  try {
    fd=fs.openSync(path.join(defaultConfigDir(),"update-check.json"),fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
    const buffer=Buffer.alloc(16_385);
    const size=fs.readSync(fd,buffer,0,buffer.length,null);
    if(size>16_384) return undefined;
    const cache=JSON.parse(buffer.subarray(0,size).toString("utf8"));
    if (!cache || cache.schemaVersion !== 1 || typeof cache.checkedAt !== "number" || !Number.isFinite(cache.checkedAt) || cache.checkedAt < 0 ||
        !["available", "current", "unavailable"].includes(cache.status) || typeof cache.requiresExplicitTarget !== "boolean") return undefined;
    return {schemaVersion: 1, checkedAt: cache.checkedAt, status: cache.status, requiresExplicitTarget: cache.requiresExplicitTarget};
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
    if(cache.status==="available") return "Update available; run openassist update check for target details";
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
    const manifestPath = path.join(current, "package.json");
    if (fs.existsSync(path.join(current, "pnpm-workspace.yaml")) && fs.existsSync(manifestPath)) {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
      if (manifest.name === "openassist" && typeof manifest.version === "string") {
        return {id: "development", version: manifest.version, commit: "unknown", nodeVersion: process.versions.node, configVersion: 1, databaseVersion: 1};
      }
    }
    const parent = path.dirname(current);
    if (parent === current) return {id: "development", version: "0.1.0", commit: "unknown", nodeVersion: process.versions.node, configVersion: 1, databaseVersion: 1};
    current = parent;
  }
}
