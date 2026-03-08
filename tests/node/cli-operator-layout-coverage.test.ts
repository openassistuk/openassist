import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { resolveOperatorPaths } from "../../packages/config/src/operator-paths.js";
import { createDefaultConfigObject, loadBaseConfigObject, saveConfigObject } from "../../apps/openassist-cli/src/lib/config-edit.js";
import { loadInstallState, saveInstallState } from "../../apps/openassist-cli/src/lib/install-state.js";
import {
  autoMigrateLegacyDefaultLayoutIfNeeded,
  detectLegacyDefaultLayout,
  legacyDefaultLayoutPaths
} from "../../apps/openassist-cli/src/lib/operator-layout.js";

function tempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

async function withHomeDir<T>(homeDir: string, fn: () => Promise<T> | T): Promise<T> {
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

describe("legacy operator layout coverage", () => {
  it("skips migration when no repo-local config exists", async () =>
    await withHomeDir(tempDir("openassist-layout-home-none-"), async () => {
      const installDir = tempDir("openassist-layout-install-none-");
      const operatorPaths = resolveOperatorPaths({ homeDir: process.env.HOME!, installDir });
      const detection = detectLegacyDefaultLayout(installDir, operatorPaths);

      assert.equal(detection.status, "none");
      assert.equal(detection.legacy.configPath, legacyDefaultLayoutPaths(installDir).configPath);
    }));

  it("does not treat the tracked sample config alone as legacy operator state", async () =>
    await withHomeDir(tempDir("openassist-layout-home-sample-"), async () => {
      const installDir = tempDir("openassist-layout-install-sample-");
      writeLegacyDefaultConfig(installDir);

      const detection = detectLegacyDefaultLayout(
        installDir,
        resolveOperatorPaths({ homeDir: process.env.HOME!, installDir })
      );

      assert.equal(detection.status, "none");
    }));

  it("blocks automatic migration for custom repo-local runtime paths", async () =>
    await withHomeDir(tempDir("openassist-layout-home-custom-"), async () => {
      const installDir = tempDir("openassist-layout-install-custom-");
      const configPath = writeLegacyDefaultConfig(installDir);
      const config = loadBaseConfigObject(configPath);
      config.runtime.paths.dataDir = path.join(installDir, "custom-data");
      saveConfigObject(configPath, config);

      const detection = detectLegacyDefaultLayout(
        installDir,
        resolveOperatorPaths({ homeDir: process.env.HOME!, installDir })
      );

      assert.equal(detection.status, "blocked");
      assert.match(detection.reason ?? "", /custom runtime paths/i);
    }));

  it("migrates the recognized default repo-local layout into home-state directories", async () =>
    await withHomeDir(tempDir("openassist-layout-home-migrate-"), async () => {
      const homeDir = process.env.HOME!;
      const installDir = tempDir("openassist-layout-install-migrate-");
      const operatorPaths = resolveOperatorPaths({ homeDir, installDir });
      const legacyConfigPath = writeLegacyDefaultConfig(installDir);

      fs.mkdirSync(path.join(installDir, "config.d"), { recursive: true });
      fs.writeFileSync(path.join(installDir, "config.d", "extra.toml"), "[runtime]\n", "utf8");
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

      assert.equal(result.migrated, true);
      assert.equal(result.configPath, operatorPaths.configPath);
      assert.equal(result.envFilePath, operatorPaths.envFilePath);
      assert.equal(fs.existsSync(operatorPaths.configPath), true);
      assert.equal(fs.existsSync(path.join(operatorPaths.overlaysDir, "extra.toml")), true);
      assert.equal(fs.existsSync(path.join(operatorPaths.dataDir, "openassist.db")), true);

      const migratedConfig = loadBaseConfigObject(operatorPaths.configPath);
      assert.equal(migratedConfig.runtime.paths.dataDir, operatorPaths.dataDir);
      assert.equal(migratedConfig.runtime.paths.logsDir, operatorPaths.logsDir);
      assert.equal(migratedConfig.runtime.paths.skillsDir, operatorPaths.skillsDir);

      const installState = loadInstallState();
      assert.equal(installState?.configPath, operatorPaths.configPath);
      assert.equal(installState?.envFilePath, operatorPaths.envFilePath);
      assert.equal(fs.existsSync(operatorPaths.migrationBackupsDir), true);
    }));

  it("stops migration when target home-state paths already contain conflicting data", async () =>
    await withHomeDir(tempDir("openassist-layout-home-conflict-"), async () => {
      const homeDir = process.env.HOME!;
      const installDir = tempDir("openassist-layout-install-conflict-");
      const operatorPaths = resolveOperatorPaths({ homeDir, installDir });
      writeLegacyDefaultConfig(installDir);
      fs.mkdirSync(path.join(installDir, ".openassist", "data"), { recursive: true });
      fs.writeFileSync(path.join(installDir, ".openassist", "data", "openassist.db"), "", "utf8");
      fs.mkdirSync(operatorPaths.dataDir, { recursive: true });
      fs.writeFileSync(path.join(operatorPaths.dataDir, "already-there.db"), "", "utf8");

      const detection = detectLegacyDefaultLayout(installDir, operatorPaths);
      assert.equal(detection.status, "blocked");
      assert.match(detection.reason ?? "", /already contain data/i);

      const result = await autoMigrateLegacyDefaultLayoutIfNeeded({
        installDir,
        configPath: operatorPaths.configPath,
        envFilePath: operatorPaths.envFilePath
      });
      assert.equal(result.migrated, false);
      assert.match(result.blockedReason ?? "", /already contain data/i);
    }));

  it("keeps explicit custom config and env paths out of automatic migration", async () =>
    await withHomeDir(tempDir("openassist-layout-home-custom-paths-"), async () => {
      const homeDir = process.env.HOME!;
      const installDir = tempDir("openassist-layout-install-custom-paths-");
      writeLegacyDefaultConfig(installDir);
      fs.mkdirSync(path.join(installDir, ".openassist", "data"), { recursive: true });
      fs.writeFileSync(path.join(installDir, ".openassist", "data", "openassist.db"), "", "utf8");

      const customConfigPath = path.join(homeDir, "manual", "openassist.toml");
      const customEnvFilePath = path.join(homeDir, "manual", "openassistd.env");
      const result = await autoMigrateLegacyDefaultLayoutIfNeeded({
        installDir,
        configPath: customConfigPath,
        envFilePath: customEnvFilePath
      });

      assert.equal(result.migrated, false);
      assert.equal(result.configPath, customConfigPath);
      assert.equal(result.envFilePath, customEnvFilePath);
      assert.equal(fs.existsSync(customConfigPath), false);
    }));
});
