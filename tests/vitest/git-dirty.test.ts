import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it, vi } from "vitest";
import { classifyGitDirtyState } from "../../apps/openassist-cli/src/lib/git-dirty.js";

vi.mock("node:child_process", async () => {
  const actual = await vi.importActual<typeof import("node:child_process")>("node:child_process");
  return {
    ...actual,
    spawnSync: vi.fn()
  };
});

function tempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("git dirty classification", () => {
  it("returns clean state when the install is not repo-backed", () => {
    const installDir = tempDir("openassist-git-dirty-none-");

    expect(classifyGitDirtyState(installDir)).toEqual({
      hasRealCodeChanges: false,
      hasLegacyOperatorState: false,
      changedPaths: []
    });
  });

  it("returns clean state when git status cannot be read", () => {
    const installDir = tempDir("openassist-git-dirty-error-");
    fs.mkdirSync(path.join(installDir, ".git"));
    vi.mocked(spawnSync).mockReturnValue({
      status: 1,
      stdout: "",
      stderr: ""
    } as ReturnType<typeof spawnSync>);

    expect(classifyGitDirtyState(installDir)).toEqual({
      hasRealCodeChanges: false,
      hasLegacyOperatorState: false,
      changedPaths: []
    });
  });

  it("treats legacy repo-local operator files as non-code dirtiness", () => {
    const installDir = tempDir("openassist-git-dirty-legacy-");
    fs.mkdirSync(path.join(installDir, ".git"));
    vi.mocked(spawnSync).mockReturnValue({
      status: 0,
      stdout: [
        " M openassist.toml",
        "?? config.d/channel.toml",
        "?? .openassist/data/openassist.db",
        "R  old -> openassist.toml.bak.2026-03-08"
      ].join("\n"),
      stderr: ""
    } as ReturnType<typeof spawnSync>);

    expect(classifyGitDirtyState(installDir)).toEqual({
      hasRealCodeChanges: false,
      hasLegacyOperatorState: true,
      changedPaths: [
        "openassist.toml",
        "config.d/channel.toml",
        ".openassist/data/openassist.db",
        "openassist.toml.bak.2026-03-08"
      ]
    });
  });

  it("distinguishes real code changes from legacy operator state", () => {
    const installDir = tempDir("openassist-git-dirty-mixed-");
    fs.mkdirSync(path.join(installDir, ".git"));
    vi.mocked(spawnSync).mockReturnValue({
      status: 0,
      stdout: [
        " M README.md",
        "?? scripts/install/bootstrap.sh",
        "?? .openassist/logs/openassist.log"
      ].join("\n"),
      stderr: ""
    } as ReturnType<typeof spawnSync>);

    expect(classifyGitDirtyState(installDir)).toEqual({
      hasRealCodeChanges: true,
      hasLegacyOperatorState: true,
      changedPaths: [
        "README.md",
        "scripts/install/bootstrap.sh",
        ".openassist/logs/openassist.log"
      ]
    });
  });
});
