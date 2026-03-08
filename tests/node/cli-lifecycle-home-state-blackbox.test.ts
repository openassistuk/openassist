import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { describe, it } from "node:test";
import { resolveOperatorPaths } from "../../packages/config/src/operator-paths.js";
import { createDefaultConfigObject, saveConfigObject } from "../../apps/openassist-cli/src/lib/config-edit.js";
import { saveInstallState } from "../../apps/openassist-cli/src/lib/install-state.js";
import { autoMigrateLegacyDefaultLayoutIfNeeded } from "../../apps/openassist-cli/src/lib/operator-layout.js";

function tempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function repoRoot(): string {
  return path.resolve(".");
}

async function runCommand(
  command: string,
  args: string[],
  cwd: string,
  env?: NodeJS.ProcessEnv
): Promise<{ code: number; stdout: string; stderr: string }> {
  return await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: env ? { ...process.env, ...env } : process.env,
      stdio: ["ignore", "pipe", "pipe"],
      shell: false
    });
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    child.stdout.on("data", (chunk) => {
      stdoutChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    child.stderr.on("data", (chunk) => {
      stderrChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    child.once("error", reject);
    child.once("close", (code) => {
      resolve({
        code: code ?? 1,
        stdout: Buffer.concat(stdoutChunks).toString("utf8"),
        stderr: Buffer.concat(stderrChunks).toString("utf8")
      });
    });
  });
}

async function runCli(
  args: string[],
  env?: NodeJS.ProcessEnv
): Promise<{ code: number; stdout: string; stderr: string }> {
  const tsxCli = path.join(repoRoot(), "apps", "openassist-cli", "src", "index.ts");
  const tsxEntrypoint = path.join(repoRoot(), "node_modules", "tsx", "dist", "cli.mjs");
  return await runCommand(process.execPath, [tsxEntrypoint, "--", tsxCli, ...args], repoRoot(), env);
}

async function cloneRepo(cloneDir: string): Promise<void> {
  const cloneResult = await runCommand("git", ["clone", "--depth", "1", repoRoot(), cloneDir], repoRoot());
  assert.equal(cloneResult.code, 0, cloneResult.stderr || cloneResult.stdout);
}

function childHomeEnv(homeDir: string, extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    HOME: homeDir,
    USERPROFILE: homeDir,
    ...extra
  };
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

function writeHomeStateConfig(operatorPaths: ReturnType<typeof resolveOperatorPaths>): void {
  const config = createDefaultConfigObject();
  config.runtime.paths.dataDir = operatorPaths.dataDir;
  config.runtime.paths.logsDir = operatorPaths.logsDir;
  config.runtime.paths.skillsDir = operatorPaths.skillsDir;
  saveConfigObject(operatorPaths.configPath, config);
}

function writeLegacyRepoLocalConfig(installDir: string): string {
  const config = createDefaultConfigObject();
  config.runtime.paths.dataDir = ".openassist/data";
  config.runtime.paths.logsDir = ".openassist/logs";
  config.runtime.paths.skillsDir = ".openassist/skills";
  const configPath = path.join(installDir, "openassist.toml");
  saveConfigObject(configPath, config);
  return configPath;
}

describe("lifecycle home-state black-box coverage", () => {
  it("prints non-TTY setup guidance with the operator's explicit custom paths and does not mutate files", async () => {
    const root = tempDir("openassist-setup-hub-nontty-");
    const homeDir = path.join(root, "home");
    const installDir = path.join(root, "install");
    const customConfigPath = path.join(root, "custom", "openassist.toml");
    const customEnvFilePath = path.join(root, "custom", "openassistd.env");

    fs.mkdirSync(homeDir, { recursive: true });
    fs.mkdirSync(installDir, { recursive: true });

    const result = await runCli(
      [
        "setup",
        "--install-dir",
        installDir,
        "--config",
        customConfigPath,
        "--env-file",
        customEnvFilePath
      ],
      childHomeEnv(homeDir)
    );

    assert.equal(result.code, 1, result.stderr || result.stdout);
    assert.match(result.stderr, /Interactive lifecycle hub requires TTY/);
    assert.match(
      result.stderr,
      new RegExp(
        `openassist setup quickstart --install-dir "${installDir.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}" --config "${customConfigPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}" --env-file "${customEnvFilePath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`
      )
    );
    assert.match(
      result.stderr,
      new RegExp(
        `openassist setup wizard --install-dir "${installDir.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}" --config "${customConfigPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}" --env-file "${customEnvFilePath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`
      )
    );
    assert.equal(fs.existsSync(customConfigPath), false);
    assert.equal(fs.existsSync(customEnvFilePath), false);
  });

  it("does not treat normal home-state operator files as repo dirtiness during upgrade dry-run", async () => {
    const root = tempDir("openassist-home-state-upgrade-");
    const cloneDir = path.join(root, "repo");
    const homeDir = path.join(root, "home");
    await cloneRepo(cloneDir);

    const operatorPaths = resolveOperatorPaths({ homeDir, installDir: cloneDir });
    writeHomeStateConfig(operatorPaths);
    fs.mkdirSync(path.dirname(operatorPaths.envFilePath), { recursive: true });
    fs.writeFileSync(operatorPaths.envFilePath, "", "utf8");
    fs.mkdirSync(operatorPaths.logsDir, { recursive: true });
    fs.writeFileSync(path.join(operatorPaths.logsDir, "daemon.log"), "ok\n", "utf8");
    fs.mkdirSync(operatorPaths.dataDir, { recursive: true });
    fs.writeFileSync(path.join(operatorPaths.dataDir, "openassist.db"), "", "utf8");
    fs.mkdirSync(path.join(cloneDir, "apps", "openassistd", "dist"), { recursive: true });
    fs.writeFileSync(path.join(cloneDir, "apps", "openassistd", "dist", "index.js"), "// built for dry-run\n", "utf8");
    saveInstallState(
      {
        installDir: cloneDir,
        configPath: operatorPaths.configPath,
        envFilePath: operatorPaths.envFilePath,
        trackedRef: "main"
      },
      operatorPaths.installStatePath
    );

    const result = await runCli(
      ["upgrade", "--dry-run", "--install-dir", cloneDir, "--ref", "HEAD"],
      childHomeEnv(homeDir)
    );

    assert.equal(result.code, 0, result.stderr || result.stdout);
    assert.match(result.stdout, /Update readiness/);
    assert.match(result.stdout, /Dry-run complete\. Upgrade is safe to continue/);
    assert.doesNotMatch(result.stdout, /Local code changes/);
    assert.doesNotMatch(result.stdout, /Legacy repo-local operator state/);
  });

  it("migrates recognized legacy repo-local state into home-state paths and leaves the repo clean when no service is installed", async () => {
    const root = tempDir("openassist-legacy-migration-blackbox-");
    const cloneDir = path.join(root, "repo");
    const homeDir = path.join(root, "home");
    await cloneRepo(cloneDir);

    const operatorPaths = resolveOperatorPaths({ homeDir, installDir: cloneDir });
    const legacyConfigPath = writeLegacyRepoLocalConfig(cloneDir);
    fs.mkdirSync(path.join(cloneDir, "config.d"), { recursive: true });
    fs.writeFileSync(path.join(cloneDir, "config.d", "extra.toml"), "[runtime]\n", "utf8");
    fs.mkdirSync(path.join(cloneDir, ".openassist", "data"), { recursive: true });
    fs.writeFileSync(path.join(cloneDir, ".openassist", "data", "openassist.db"), "", "utf8");
    fs.mkdirSync(path.dirname(operatorPaths.envFilePath), { recursive: true });
    fs.writeFileSync(operatorPaths.envFilePath, "", "utf8");
    fs.mkdirSync(path.join(cloneDir, "apps", "openassistd", "dist"), { recursive: true });
    fs.writeFileSync(path.join(cloneDir, "apps", "openassistd", "dist", "index.js"), "// built for migration\n", "utf8");
    saveInstallState(
      {
        installDir: cloneDir,
        configPath: legacyConfigPath,
        envFilePath: operatorPaths.envFilePath,
        trackedRef: "main"
      },
      operatorPaths.installStatePath
    );

    const migration = await withHomeDir(homeDir, async () =>
      await autoMigrateLegacyDefaultLayoutIfNeeded({
        installDir: cloneDir,
        configPath: operatorPaths.configPath,
        envFilePath: operatorPaths.envFilePath
      })
    );

    assert.equal(migration.migrated, true);
    assert.equal(fs.existsSync(operatorPaths.configPath), true);
    assert.equal(fs.existsSync(path.join(operatorPaths.overlaysDir, "extra.toml")), true);
    assert.equal(fs.existsSync(path.join(operatorPaths.dataDir, "openassist.db")), true);

    const gitStatus = await runCommand("git", ["status", "--short"], cloneDir);
    assert.equal(gitStatus.code, 0, gitStatus.stderr || gitStatus.stdout);
    assert.equal(gitStatus.stdout.trim(), "");

    const doctor = await runCli(["doctor"], childHomeEnv(homeDir));
    const doctorOutput = `${doctor.stdout}${doctor.stderr}`;
    assert.equal(doctor.code, 1, doctor.stderr || doctor.stdout);
    assert.match(doctorOutput, new RegExp(operatorPaths.configPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.doesNotMatch(doctorOutput, /Legacy repo-local operator state/);

    const dryRun = await runCli(
      ["upgrade", "--dry-run", "--install-dir", cloneDir, "--ref", "HEAD"],
      childHomeEnv(homeDir)
    );
    assert.equal(dryRun.code, 0, dryRun.stderr || dryRun.stdout);
    assert.doesNotMatch(dryRun.stdout, /Local code changes/);
    assert.doesNotMatch(dryRun.stdout, /Legacy repo-local operator state/);
  });

  it("surfaces conflicting migration targets with repair guidance and leaves files untouched", async () => {
    const root = tempDir("openassist-legacy-migration-conflict-");
    const cloneDir = path.join(root, "repo");
    const homeDir = path.join(root, "home");
    await cloneRepo(cloneDir);

    const operatorPaths = resolveOperatorPaths({ homeDir, installDir: cloneDir });
    const legacyConfigPath = writeLegacyRepoLocalConfig(cloneDir);
    fs.mkdirSync(path.join(cloneDir, ".openassist", "data"), { recursive: true });
    fs.writeFileSync(path.join(cloneDir, ".openassist", "data", "openassist.db"), "", "utf8");
    fs.mkdirSync(operatorPaths.dataDir, { recursive: true });
    fs.writeFileSync(path.join(operatorPaths.dataDir, "already-there.db"), "", "utf8");
    saveInstallState(
      {
        installDir: cloneDir,
        configPath: legacyConfigPath,
        envFilePath: operatorPaths.envFilePath,
        trackedRef: "main"
      },
      operatorPaths.installStatePath
    );

    const doctor = await runCli(
      ["doctor"],
      childHomeEnv(homeDir)
    );
    const doctorOutput = `${doctor.stdout}${doctor.stderr}`;

    assert.equal(doctor.code, 1, doctor.stderr || doctor.stdout);
    assert.match(doctorOutput, /Legacy repo-local operator state/);
    assert.match(doctorOutput, /Needs action/);
    assert.match(doctorOutput, /Automatic migration stopped because target home-state paths already contain data/);
    assert.equal(fs.existsSync(path.join(cloneDir, ".openassist", "data", "openassist.db")), true);
    assert.equal(fs.existsSync(path.join(operatorPaths.dataDir, "already-there.db")), true);
  });
});
