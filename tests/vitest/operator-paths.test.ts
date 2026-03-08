import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  defaultConfigPath,
  resolveConfigOverlaysDir,
  resolveOperatorPaths
} from "../../packages/config/src/operator-paths.js";

describe("operator path defaults", () => {
  it("resolves the canonical home-state layout from one shared helper", () => {
    const homeDir = path.join(os.tmpdir(), "openassist-home-state");
    const installDir = path.join(homeDir, "openassist");
    const paths = resolveOperatorPaths({ homeDir, installDir });

    expect(paths.installDir).toBe(installDir);
    expect(paths.configPath).toBe(path.join(homeDir, ".config", "openassist", "openassist.toml"));
    expect(paths.overlaysDir).toBe(path.join(homeDir, ".config", "openassist", "config.d"));
    expect(paths.envFilePath).toBe(path.join(homeDir, ".config", "openassist", "openassistd.env"));
    expect(paths.installStatePath).toBe(path.join(homeDir, ".config", "openassist", "install-state.json"));
    expect(paths.dataDir).toBe(path.join(homeDir, ".local", "share", "openassist", "data"));
    expect(paths.logsDir).toBe(path.join(homeDir, ".local", "share", "openassist", "logs"));
    expect(paths.skillsDir).toBe(path.join(homeDir, ".local", "share", "openassist", "skills"));
    expect(paths.helperToolsDir).toBe(
      path.join(homeDir, ".local", "share", "openassist", "data", "helper-tools")
    );
  });

  it("keeps explicit custom config paths on their own nearby overlay directory", () => {
    const homeDir = path.join(os.tmpdir(), "openassist-overlay-home");
    const operatorConfigPath = defaultConfigPath(homeDir);
    const customConfigPath = path.join(homeDir, "custom", "openassist.toml");

    expect(resolveConfigOverlaysDir(operatorConfigPath, homeDir)).toBe(
      path.join(homeDir, ".config", "openassist", "config.d")
    );
    expect(resolveConfigOverlaysDir(customConfigPath, homeDir)).toBe(
      path.join(homeDir, "custom", "config.d")
    );
  });
});
