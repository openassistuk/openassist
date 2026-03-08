import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  detectInstallStateFromRepo,
  loadInstallState,
  mergeInstallState,
  saveInstallState
} from "../../apps/openassist-cli/src/lib/install-state.js";
import { defaultConfigPath } from "../../apps/openassist-cli/src/lib/runtime-context.js";

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
    expect(saved.configPath).toBe(defaultConfigPath());
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

  it("preserves existing fields when saving a partial update", () => {
    const existing = mergeInstallState(undefined, {
      installDir: "/srv/openassist",
      repoUrl: "https://github.com/openassistuk/openassist.git",
      trackedRef: "main",
      configPath: "/srv/openassist/openassist.toml",
      envFilePath: "/home/test/.config/openassist/openassistd.env",
      lastKnownGoodCommit: "abc123"
    });

    const merged = mergeInstallState(existing, {
      serviceManager: "systemd-user",
      lastKnownGoodCommit: "def456"
    });

    expect(merged.repoUrl).toBe("https://github.com/openassistuk/openassist.git");
    expect(merged.trackedRef).toBe("main");
    expect(merged.serviceManager).toBe("systemd-user");
    expect(merged.lastKnownGoodCommit).toBe("def456");
  });

  it("returns empty repo metadata for non-git directories", () => {
    const root = tempDir("openassist-install-state-repo-");
    expect(detectInstallStateFromRepo(root)).toEqual({});
  });
});
