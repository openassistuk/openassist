import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi, afterEach } from "vitest";
import * as childProcess from "node:child_process";

vi.mock("node:child_process", () => ({
  spawnSync: vi.fn()
}));

const roots: string[] = [];

function tempDir(prefix: string): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  roots.push(root);
  return root;
}

afterEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("loadRuntimeInstallContext", () => {
  it("reuses stored install metadata when the config stays under the stored install directory", async () => {
    const root = tempDir("openassist-install-context-stored-relative-");
    const homeDir = path.join(root, "home");
    const installDir = path.join(root, "install");
    const configPath = path.join(installDir, "configs", "openassist.toml");
    const installStatePath = path.join(homeDir, ".config", "openassist", "install-state.json");

    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.mkdirSync(path.dirname(installStatePath), { recursive: true });
    fs.writeFileSync(configPath, "bindAddress = \"127.0.0.1\"\n", "utf8");
    fs.writeFileSync(
      installStatePath,
      JSON.stringify({
        installDir,
        trackedRef: "feature/coverage-hardening",
        lastKnownGoodCommit: "abc123"
      }),
      "utf8"
    );

    vi.stubEnv("HOME", homeDir);
    vi.stubEnv("USERPROFILE", homeDir);
    vi.stubEnv("OPENASSIST_ENV_FILE", "");
    vi.spyOn(process, "cwd").mockReturnValue(root);

    const spawnSync = vi.mocked(childProcess.spawnSync);
    const { loadRuntimeInstallContext } = await import("../../apps/openassistd/src/install-context.js");
    const context = loadRuntimeInstallContext(configPath);

    expect(spawnSync).not.toHaveBeenCalled();
    expect(context.repoBackedInstall).toBe(false);
    expect(context.installDir).toBe(installDir);
    expect(context.configPath).toBe(configPath);
    expect(context.trackedRef).toBe("feature/coverage-hardening");
    expect(context.lastKnownGoodCommit).toBe("abc123");
  });

  it("prefers stored config and env paths when install-state matches the exact config file", async () => {
    const root = tempDir("openassist-install-context-stored-exact-");
    const homeDir = path.join(root, "home");
    const installDir = path.join(root, "install");
    const configPath = path.join(root, "active-config", "openassist.toml");
    const storedEnvFilePath = path.join(root, "canonical", "openassistd.env");
    const installStatePath = path.join(homeDir, ".config", "openassist", "install-state.json");

    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.mkdirSync(path.dirname(storedEnvFilePath), { recursive: true });
    fs.mkdirSync(path.dirname(installStatePath), { recursive: true });
    fs.writeFileSync(configPath, "bindAddress = \"127.0.0.1\"\n", "utf8");
    fs.writeFileSync(
      installStatePath,
      JSON.stringify({
        installDir,
        configPath,
        envFilePath: storedEnvFilePath
      }),
      "utf8"
    );

    vi.stubEnv("HOME", homeDir);
    vi.stubEnv("USERPROFILE", homeDir);
    vi.stubEnv("OPENASSIST_ENV_FILE", path.join(root, "env-from-process.env"));
    vi.spyOn(process, "cwd").mockReturnValue(root);

    const { loadRuntimeInstallContext } = await import("../../apps/openassistd/src/install-context.js");
    const context = loadRuntimeInstallContext(configPath);

    expect(context.repoBackedInstall).toBe(false);
    expect(context.installDir).toBe(installDir);
    expect(context.configPath).toBe(configPath);
    expect(context.envFilePath).toBe(storedEnvFilePath);
  });

  it("times out git probing, logs once, and falls back to best-effort install metadata", async () => {
    const root = tempDir("openassist-install-context-");
    const homeDir = path.join(root, "home");
    const repoRoot = path.join(root, "repo");
    const configPath = path.join(repoRoot, "openassist.toml");

    fs.mkdirSync(path.join(homeDir, ".config", "openassist"), { recursive: true });
    fs.mkdirSync(path.join(repoRoot, ".git"), { recursive: true });
    fs.writeFileSync(configPath, "bindAddress = \"127.0.0.1\"\n", "utf8");

    vi.stubEnv("HOME", homeDir);
    vi.stubEnv("USERPROFILE", homeDir);
    vi.stubEnv("OPENASSIST_ENV_FILE", "");

    const spawnSync = vi.mocked(childProcess.spawnSync);
    spawnSync.mockReturnValue({
      status: null,
      stdout: "",
      error: Object.assign(new Error("spawnSync git ETIMEDOUT"), { code: "ETIMEDOUT" })
    } as unknown as ReturnType<typeof childProcess.spawnSync>);

    const warnings: Array<{ payload: unknown; message?: string }> = [];
    const { GIT_SPAWN_TIMEOUT_MS, loadRuntimeInstallContext } = await import(
      "../../apps/openassistd/src/install-context.js"
    );

    const context = loadRuntimeInstallContext(configPath, {
      warn(payload: unknown, message?: string) {
        warnings.push({ payload, message });
      }
    });

    expect(spawnSync).toHaveBeenCalledTimes(1);
    expect(spawnSync).toHaveBeenCalledWith(
      "git",
      ["-C", repoRoot, "rev-parse", "--abbrev-ref", "HEAD"],
      expect.objectContaining({
        encoding: "utf8",
        timeout: GIT_SPAWN_TIMEOUT_MS
      })
    );
    expect(context.repoBackedInstall).toBe(true);
    expect(context.installDir).toBe(repoRoot);
    expect(context.configPath).toBe(configPath);
    expect(context.trackedRef).toBeUndefined();
    expect(context.lastKnownGoodCommit).toBeUndefined();
    expect(context.serviceManager).toBe("unknown");
    expect(context.systemdFilesystemAccessEffective).toBe("unknown");
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.message).toBe("runtime install context git probe failed");
    expect(warnings[0]?.payload).toMatchObject({
      repoRoot,
      gitArgs: ["rev-parse", "--abbrev-ref", "HEAD"],
      error: expect.stringMatching(/ETIMEDOUT/i)
    });
  });

  it("reads live service manager and systemd filesystem mode from env when present", async () => {
    const root = tempDir("openassist-install-context-service-env-");
    const homeDir = path.join(root, "home");
    const configPath = path.join(root, "openassist.toml");

    fs.mkdirSync(path.join(homeDir, ".config", "openassist"), { recursive: true });
    fs.writeFileSync(configPath, "bindAddress = \"127.0.0.1\"\n", "utf8");

    vi.stubEnv("HOME", homeDir);
    vi.stubEnv("USERPROFILE", homeDir);
    vi.stubEnv("OPENASSIST_ENV_FILE", "");
    vi.stubEnv("OPENASSIST_SERVICE_MANAGER_KIND", "systemd-system");
    vi.stubEnv("OPENASSIST_SYSTEMD_FILESYSTEM_ACCESS", "unrestricted");

    const { loadRuntimeInstallContext } = await import("../../apps/openassistd/src/install-context.js");
    const context = loadRuntimeInstallContext(configPath);

    expect(context.serviceManager).toBe("systemd-system");
    expect(context.systemdFilesystemAccessEffective).toBe("unrestricted");
  });

  it("keeps launchd install context explicitly outside Linux filesystem access", async () => {
    const root = tempDir("openassist-install-context-launchd-env-");
    const homeDir = path.join(root, "home");
    const configPath = path.join(root, "openassist.toml");

    fs.mkdirSync(path.join(homeDir, ".config", "openassist"), { recursive: true });
    fs.writeFileSync(configPath, "bindAddress = \"127.0.0.1\"\n", "utf8");

    vi.stubEnv("HOME", homeDir);
    vi.stubEnv("USERPROFILE", homeDir);
    vi.stubEnv("OPENASSIST_ENV_FILE", "");
    vi.stubEnv("OPENASSIST_SERVICE_MANAGER_KIND", "launchd");
    vi.stubEnv("OPENASSIST_SYSTEMD_FILESYSTEM_ACCESS", "unrestricted");

    const { loadRuntimeInstallContext } = await import("../../apps/openassistd/src/install-context.js");
    const context = loadRuntimeInstallContext(configPath);

    expect(context.serviceManager).toBe("launchd");
    expect(context.systemdFilesystemAccessEffective).toBe("not-applicable");
  });

  it("ignores malformed install-state and falls back to explicit env plus manual service metadata", async () => {
    const root = tempDir("openassist-install-context-invalid-state-");
    const homeDir = path.join(root, "home");
    const repoRoot = path.join(root, "repo");
    const configPath = path.join(repoRoot, "openassist.toml");
    const installStatePath = path.join(homeDir, ".config", "openassist", "install-state.json");
    const explicitEnvFile = path.join(root, "custom", "openassistd.env");

    fs.mkdirSync(path.join(homeDir, ".config", "openassist"), { recursive: true });
    fs.mkdirSync(path.join(repoRoot, ".git"), { recursive: true });
    fs.writeFileSync(configPath, "bindAddress = \"127.0.0.1\"\n", "utf8");
    fs.writeFileSync(installStatePath, "{not-json", "utf8");

    vi.stubEnv("HOME", homeDir);
    vi.stubEnv("USERPROFILE", homeDir);
    vi.stubEnv("OPENASSIST_ENV_FILE", explicitEnvFile);
    vi.stubEnv("OPENASSIST_SERVICE_MANAGER_KIND", "manual");
    vi.stubEnv("OPENASSIST_SYSTEMD_FILESYSTEM_ACCESS", "hardened");

    const spawnSync = vi.mocked(childProcess.spawnSync);
    spawnSync.mockReturnValue({
      status: 1,
      stdout: ""
    } as unknown as ReturnType<typeof childProcess.spawnSync>);

    const { loadRuntimeInstallContext } = await import("../../apps/openassistd/src/install-context.js");
    const context = loadRuntimeInstallContext(configPath);

    expect(spawnSync).toHaveBeenCalledTimes(2);
    expect(context.repoBackedInstall).toBe(true);
    expect(context.installDir).toBe(repoRoot);
    expect(context.envFilePath).toBe(path.resolve(explicitEnvFile));
    expect(context.trackedRef).toBeUndefined();
    expect(context.lastKnownGoodCommit).toBeUndefined();
    expect(context.serviceManager).toBe("manual");
    expect(context.systemdFilesystemAccessEffective).toBe("unknown");
  });
});
