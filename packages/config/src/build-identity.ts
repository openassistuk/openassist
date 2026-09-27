import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import type { BuildIdentity } from "@openassist/core-types";

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
