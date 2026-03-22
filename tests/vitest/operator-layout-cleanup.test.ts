import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveOperatorPaths } from "../../packages/config/src/operator-paths.js";
import { createDefaultConfigObject, saveConfigObject } from "../../apps/openassist-cli/src/lib/config-edit.js";
import { saveInstallState } from "../../apps/openassist-cli/src/lib/install-state.js";

const spawnSyncMock = vi.hoisted(() => vi.fn());

vi.mock("node:child_process", () => ({
  spawnSync: spawnSyncMock
}));

function tempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

async function withHomeDir<T>(homeDir: string, fn: () => Promise<T>): Promise<T> {
  const previousHome = process.env.HOME;
  const previousUserProfile = process.env.USERPROFILE;
  process.env.HOME = homeDir;
  process.env.USERPROFILE = homeDir;
  try {
    return await fn();
  } finally {
    if (previousHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = previousHome;
    }
    if (previousUserProfile === undefined) {
      delete process.env.USERPROFILE;
    } else {
      process.env.USERPROFILE = previousUserProfile;
    }
  }
}

function writeLegacyDefaultConfig(installDir: string): string {
  const config = createDefaultConfigObject();
  config.runtime.paths.dataDir = ".openassist/data";
  config.runtime.paths.logsDir = ".openassist/logs";
  config.runtime.paths.skillsDir = ".openassist/skills";
  const configPath = path.join(installDir, "openassist.toml");
  saveConfigObject(configPath, config);
  return configPath;
}

function writeOwnerOnlyFile(target: string, content = ""): void {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content, "utf8");
  if (process.platform !== "win32") {
    fs.chmodSync(target, 0o600);
  }
}

afterEach(() => {
  spawnSyncMock.mockReset();
  vi.resetModules();
});

describe("legacy operator layout cleanup safety", () => {
  it("keeps tracked repo files in place when git cannot restore them during cleanup", async () =>
    await withHomeDir(tempDir("openassist-layout-cleanup-home-"), async () => {
      const homeDir = process.env.HOME!;
      const installDir = tempDir("openassist-layout-cleanup-install-");
      const operatorPaths = resolveOperatorPaths({ homeDir, installDir });
      const legacyConfigPath = writeLegacyDefaultConfig(installDir);

      fs.mkdirSync(path.join(installDir, ".git"), { recursive: true });
      fs.mkdirSync(path.join(installDir, "config.d"), { recursive: true });
      fs.writeFileSync(path.join(installDir, "config.d", ".gitkeep"), "", "utf8");
      fs.writeFileSync(path.join(installDir, "config.d", "extra.toml"), "[runtime]\n", "utf8");
      writeOwnerOnlyFile(path.join(installDir, ".openassist", "data", "openassist.db"));
      fs.mkdirSync(path.dirname(operatorPaths.envFilePath), { recursive: true });
      fs.writeFileSync(operatorPaths.envFilePath, "# env\n", "utf8");
      saveInstallState(
        {
          installDir,
          configPath: legacyConfigPath,
          envFilePath: operatorPaths.envFilePath
        },
        operatorPaths.installStatePath
      );

      spawnSyncMock.mockImplementation((_command: string, args?: readonly string[]) => {
        if (args?.includes("ls-files")) {
          return {
            status: 0,
            error: undefined
          };
        }
        if (args?.includes("checkout")) {
          return {
            status: null,
            error: new Error("git unavailable")
          };
        }
        return {
          status: 1,
          error: undefined
        };
      });

      const { autoMigrateLegacyDefaultLayoutIfNeeded } = await import(
        "../../apps/openassist-cli/src/lib/operator-layout.js"
      );
      const result = await autoMigrateLegacyDefaultLayoutIfNeeded({
        installDir,
        configPath: operatorPaths.configPath,
        envFilePath: operatorPaths.envFilePath
      });

      expect(result.migrated).toBe(true);
      expect(result.message).toContain("kept tracked repo files in place because git checkout was unavailable");
      expect(fs.existsSync(path.join(installDir, "openassist.toml"))).toBe(true);
      expect(fs.existsSync(path.join(installDir, "config.d", ".gitkeep"))).toBe(true);
      expect(fs.existsSync(path.join(installDir, "config.d", "extra.toml"))).toBe(true);
      expect(fs.existsSync(path.join(installDir, ".openassist"))).toBe(false);
    }));

  it("keeps tracked repo files in place when git metadata lookup fails before checkout", async () =>
    await withHomeDir(tempDir("openassist-layout-cleanup-home-lookup-failure-"), async () => {
      const homeDir = process.env.HOME!;
      const installDir = tempDir("openassist-layout-cleanup-install-lookup-failure-");
      const operatorPaths = resolveOperatorPaths({ homeDir, installDir });
      const legacyConfigPath = writeLegacyDefaultConfig(installDir);

      fs.mkdirSync(path.join(installDir, ".git"), { recursive: true });
      fs.mkdirSync(path.join(installDir, "config.d"), { recursive: true });
      fs.writeFileSync(path.join(installDir, "config.d", ".gitkeep"), "", "utf8");
      fs.writeFileSync(path.join(installDir, "config.d", "extra.toml"), "[runtime]\n", "utf8");
      writeOwnerOnlyFile(path.join(installDir, ".openassist", "data", "openassist.db"));
      fs.mkdirSync(path.dirname(operatorPaths.envFilePath), { recursive: true });
      fs.writeFileSync(operatorPaths.envFilePath, "# env\n", "utf8");
      saveInstallState(
        {
          installDir,
          configPath: legacyConfigPath,
          envFilePath: operatorPaths.envFilePath
        },
        operatorPaths.installStatePath
      );

      spawnSyncMock.mockImplementation((_command: string, args?: readonly string[]) => {
        if (args?.includes("ls-files")) {
          return {
            status: null,
            error: new Error("git unavailable")
          };
        }
        return {
          status: 1,
          error: undefined
        };
      });

      const { autoMigrateLegacyDefaultLayoutIfNeeded } = await import(
        "../../apps/openassist-cli/src/lib/operator-layout.js"
      );
      const result = await autoMigrateLegacyDefaultLayoutIfNeeded({
        installDir,
        configPath: operatorPaths.configPath,
        envFilePath: operatorPaths.envFilePath
      });

      expect(result.migrated).toBe(true);
      expect(result.message).toContain("kept tracked repo files in place because git checkout was unavailable");
      expect(fs.existsSync(path.join(installDir, "openassist.toml"))).toBe(true);
      expect(fs.existsSync(path.join(installDir, "config.d", ".gitkeep"))).toBe(true);
      expect(fs.existsSync(path.join(installDir, "config.d", "extra.toml"))).toBe(true);
      expect(fs.existsSync(path.join(installDir, ".openassist"))).toBe(false);
    }));
});
