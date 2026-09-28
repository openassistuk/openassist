import fs from "node:fs";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import { loadConfig } from "@openassist/config";
import { createDefaultConfigObject } from "./config-edit.js";
import { loadInstallState, saveInstallState } from "./install-state.js";

export function needsFirstTimeSetup(configPath: string): boolean {
  if (!fs.existsSync(configPath)) return true;
  const record = loadInstallState();
  if (record && path.resolve(record.configPath) === path.resolve(configPath) && record.onboarding) {
    return record.onboarding === "pending";
  }
  try {
    return isDeepStrictEqual(loadConfig({ baseFile: configPath }).config, createDefaultConfigObject());
  } catch {
    // An invalid or customized existing config belongs in repair, never reseed it.
    return false;
  }
}

export function completeOnboarding(configPath: string): void {
  const record = loadInstallState();
  if (record && path.resolve(record.configPath) === path.resolve(configPath)) {
    saveInstallState({ ...record, onboarding: "complete" });
  }
}
