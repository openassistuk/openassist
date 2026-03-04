import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  loadInstallState,
  saveInstallState
} from "../../apps/openassist-cli/src/lib/install-state.js";

function tempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

describe("install-state", () => {
  it("normalizes defaults when saving/loading partial state", () => {
    const root = tempDir("openassist-install-state-");
    const installDir = path.join(root, "openassist");
    const statePath = path.join(root, "install-state.json");

    const saved = saveInstallState({ installDir }, statePath);
    const loaded = loadInstallState(statePath);

    expect(saved.installDir).toBe(installDir);
    expect(saved.trackedRef).toBe("main");
    expect(saved.configPath).toBe(path.join(installDir, "openassist.toml"));
    expect(saved.updatedAt.length).toBeGreaterThan(10);
    expect(loaded).toEqual(saved);
  });

  it("returns undefined on malformed json", () => {
    const root = tempDir("openassist-install-state-bad-");
    const statePath = path.join(root, "install-state.json");
    fs.mkdirSync(path.dirname(statePath), { recursive: true });
    fs.writeFileSync(statePath, "{ not-json", "utf8");

    expect(loadInstallState(statePath)).toBeUndefined();
  });
});
