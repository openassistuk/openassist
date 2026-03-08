import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveOperatorPaths } from "../../packages/config/src/operator-paths.js";
import { createDefaultConfigObject, loadBaseConfigObject, saveConfigObject } from "../../apps/openassist-cli/src/lib/config-edit.js";
import { loadInstallState, saveInstallState } from "../../apps/openassist-cli/src/lib/install-state.js";
import {
  autoMigrateLegacyDefaultLayoutIfNeeded,
  detectLegacyDefaultLayout
} from "../../apps/openassist-cli/src/lib/operator-layout.js";

function tempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

async function withHomeDir<T>(homeDir: string, fn: () => T | Promise<T>): Promise<T> {
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

describe("legacy operator layout migration", () => {
  it("does not treat the tracked sample config alone as legacy operator state", async () =>
    await withHomeDir(tempDir("openassist-operator-layout-home-none-"), () => {
      const installDir = tempDir("openassist-operator-layout-install-none-");
      writeLegacyDefaultConfig(installDir);

      const detection = detectLegacyDefaultLayout(
        installDir,
        resolveOperatorPaths({ homeDir: process.env.HOME, installDir })
      );

      expect(detection.status).toBe("none");
    }));

  it("detects a real repo-local operator layout when legacy runtime state exists", async () =>
    await withHomeDir(tempDir("openassist-operator-layout-home-ready-"), () => {
      const installDir = tempDir("openassist-operator-layout-install-ready-");
      writeLegacyDefaultConfig(installDir);
      fs.mkdirSync(path.join(installDir, ".openassist", "data"), { recursive: true });
      fs.writeFileSync(path.join(installDir, ".openassist", "data", "openassist.db"), "", "utf8");

      const detection = detectLegacyDefaultLayout(
        installDir,
        resolveOperatorPaths({ homeDir: process.env.HOME, installDir })
      );

      expect(detection.status).toBe("ready");
    }));

  it("migrates the recognized legacy default layout into the canonical home-state directories", async () =>
    await withHomeDir(tempDir("openassist-operator-layout-home-migrate-"), async () => {
      const homeDir = process.env.HOME!;
      const installDir = tempDir("openassist-operator-layout-install-migrate-");
      const operatorPaths = resolveOperatorPaths({ homeDir, installDir });
      const legacyConfigPath = writeLegacyDefaultConfig(installDir);

      fs.mkdirSync(path.join(installDir, "config.d"), { recursive: true });
      fs.writeFileSync(path.join(installDir, "config.d", "channel.toml"), "[runtime]\n", "utf8");
      fs.mkdirSync(path.join(installDir, ".openassist", "data"), { recursive: true });
      fs.writeFileSync(path.join(installDir, ".openassist", "data", "openassist.db"), "", "utf8");
      fs.mkdirSync(path.dirname(operatorPaths.envFilePath), { recursive: true });
      fs.writeFileSync(operatorPaths.envFilePath, "# env\n", "utf8");
      saveInstallState({
        installDir,
        configPath: legacyConfigPath,
        envFilePath: operatorPaths.envFilePath
      });

      const result = await autoMigrateLegacyDefaultLayoutIfNeeded({
        installDir,
        configPath: operatorPaths.configPath,
        envFilePath: operatorPaths.envFilePath
      });

      expect(result.migrated).toBe(true);
      expect(result.configPath).toBe(operatorPaths.configPath);
      expect(fs.existsSync(operatorPaths.configPath)).toBe(true);
      expect(fs.existsSync(path.join(operatorPaths.overlaysDir, "channel.toml"))).toBe(true);
      expect(fs.existsSync(path.join(operatorPaths.dataDir, "openassist.db"))).toBe(true);

      const migratedConfig = loadBaseConfigObject(operatorPaths.configPath);
      expect(migratedConfig.runtime.paths.dataDir).toBe(operatorPaths.dataDir);
      expect(migratedConfig.runtime.paths.logsDir).toBe(operatorPaths.logsDir);
      expect(migratedConfig.runtime.paths.skillsDir).toBe(operatorPaths.skillsDir);

      const installState = loadInstallState();
      expect(installState?.configPath).toBe(operatorPaths.configPath);
      expect(installState?.envFilePath).toBe(operatorPaths.envFilePath);
      expect(fs.existsSync(path.join(operatorPaths.migrationBackupsDir))).toBe(true);
    }));

  it("stops automatic migration when home-state targets already contain conflicting data", async () =>
    await withHomeDir(tempDir("openassist-operator-layout-home-blocked-"), () => {
      const homeDir = process.env.HOME!;
      const installDir = tempDir("openassist-operator-layout-install-blocked-");
      const operatorPaths = resolveOperatorPaths({ homeDir, installDir });
      writeLegacyDefaultConfig(installDir);
      fs.mkdirSync(path.join(installDir, ".openassist", "data"), { recursive: true });
      fs.writeFileSync(path.join(installDir, ".openassist", "data", "openassist.db"), "", "utf8");
      fs.mkdirSync(operatorPaths.dataDir, { recursive: true });
      fs.writeFileSync(path.join(operatorPaths.dataDir, "existing.db"), "", "utf8");

      const detection = detectLegacyDefaultLayout(installDir, operatorPaths);

      expect(detection.status).toBe("blocked");
      expect(detection.reason).toContain(operatorPaths.dataDir);
    }));
});
