import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { describe, it } from "node:test";
import { resolveOperatorPaths } from "../../packages/config/src/operator-paths.js";
import { createDefaultConfigObject, saveConfigObject } from "../../apps/openassist-cli/src/lib/config-edit.js";
import { saveInstallState } from "../../apps/openassist-cli/src/lib/install-state.js";

function tempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

async function runCommand(
  command: string,
  args: string[],
  cwd: string,
  env?: NodeJS.ProcessEnv
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
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
    child.on("error", (error) => reject(error));
    child.on("close", (code) => {
      resolve({
        code: code ?? 1,
        stdout: Buffer.concat(stdoutChunks).toString("utf8"),
        stderr: Buffer.concat(stderrChunks).toString("utf8")
      });
    });
  });
}

function repoRoot(): string {
  return path.resolve(".");
}

async function runCli(
  args: string[],
  cwd: string,
  env?: NodeJS.ProcessEnv
): Promise<{ code: number; stdout: string; stderr: string }> {
  const tsxCli = path.join(repoRoot(), "apps", "openassist-cli", "src", "index.ts");
  const tsxEntrypoint = path.join(repoRoot(), "node_modules", "tsx", "dist", "cli.mjs");
  return runCommand(process.execPath, [tsxEntrypoint, tsxCli, ...args], cwd, env);
}

function childHomeEnv(homeDir: string, extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    HOME: homeDir,
    USERPROFILE: homeDir,
    ...extra
  };
}

describe("cli command integration", () => {
  it("runs setup show against project config", async () => {
    const result = await runCli(["setup", "show", "--config", "openassist.toml"], repoRoot());
    assert.equal(result.code, 0, result.stderr || result.stdout);
    assert.ok(result.stdout.includes("\"runtime\""), result.stdout);
  });

  it("runs upgrade dry-run on a clean built source checkout", async () => {
    const root = tempDir("openassist-upgrade-dryrun-");
    const cloneDir = path.join(root, "repo");
    const homeDir = path.join(root, "home");
    const cloneResult = await runCommand("git", ["clone", "--depth", "1", repoRoot(), cloneDir], repoRoot());
    assert.equal(cloneResult.code, 0, cloneResult.stderr || cloneResult.stdout);
    fs.mkdirSync(path.join(cloneDir, "apps", "openassistd", "dist"), { recursive: true });
    fs.writeFileSync(path.join(cloneDir, "apps", "openassistd", "dist", "index.js"), "// built for dry-run\n", "utf8");

    // CI checkouts can be detached and may not have origin/main fetched; using HEAD keeps dry-run deterministic.
    const result = await runCli(
      ["upgrade", "--dry-run", "--install-dir", cloneDir, "--ref", "HEAD"],
      repoRoot(),
      childHomeEnv(homeDir)
    );
    assert.equal(result.code, 1, result.stderr || result.stdout);
    assert.ok(result.stdout.includes("Update readiness"), result.stdout);
    assert.match(
      result.stdout,
      /- Current update track: (Detached or not recorded|[^\r\n]+)/,
      result.stdout
    );
    assert.ok(result.stdout.includes("- Target update track: Detached or not recorded"), result.stdout);
    assert.ok(result.stdout.includes("Needs action"), result.stdout);
    assert.ok(result.stdout.includes("rerun bootstrap instead"), result.stdout);
    assert.ok(result.stdout.includes("scripts/install/bootstrap.sh --install-dir"), result.stdout);
    assert.ok(
      result.stdout.includes("Dry-run complete. Upgrade is not ready yet: rerun bootstrap instead."),
      result.stdout
    );
  });

  it("reports missing update prerequisites instead of crashing when helper binaries are unavailable", async () => {
    const root = tempDir("openassist-upgrade-missing-binaries-");
    const cloneDir = path.join(root, "repo");
    const homeDir = path.join(root, "home");
    const emptyBinDir = path.join(root, "empty-bin");
    const cloneResult = await runCommand("git", ["clone", "--depth", "1", repoRoot(), cloneDir], repoRoot());
    assert.equal(cloneResult.code, 0, cloneResult.stderr || cloneResult.stdout);
    fs.mkdirSync(path.join(cloneDir, "apps", "openassistd", "dist"), { recursive: true });
    fs.writeFileSync(path.join(cloneDir, "apps", "openassistd", "dist", "index.js"), "// built for dry-run\n", "utf8");
    fs.mkdirSync(emptyBinDir, { recursive: true });

    const operatorPaths = resolveOperatorPaths({ homeDir, installDir: cloneDir });
    const config = createDefaultConfigObject();
    config.runtime.paths.dataDir = operatorPaths.dataDir;
    config.runtime.paths.logsDir = operatorPaths.logsDir;
    config.runtime.paths.skillsDir = operatorPaths.skillsDir;
    saveConfigObject(operatorPaths.configPath, config);
    fs.mkdirSync(path.dirname(operatorPaths.envFilePath), { recursive: true });
    fs.writeFileSync(operatorPaths.envFilePath, "", "utf8");
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
      repoRoot(),
      childHomeEnv(homeDir, {
        PATH: emptyBinDir,
        Path: emptyBinDir
      })
    );

    assert.equal(result.code, 1, result.stderr || result.stdout);
    assert.ok(result.stdout.includes("Update prerequisites"), result.stdout);
    assert.ok(result.stdout.includes("git=missing"), result.stdout);
    assert.ok(result.stdout.includes("pnpm=missing"), result.stdout);
    assert.ok(result.stdout.includes("node=missing"), result.stdout);
  });

  it("requires an explicit PR target when a detached install is tracking a pull request", async () => {
    const root = tempDir("openassist-upgrade-pr-track-");
    const cloneDir = path.join(root, "repo");
    const homeDir = path.join(root, "home");
    const cloneResult = await runCommand("git", ["clone", "--depth", "1", repoRoot(), cloneDir], repoRoot());
    assert.equal(cloneResult.code, 0, cloneResult.stderr || cloneResult.stdout);
    const detachResult = await runCommand("git", ["checkout", "--detach", "HEAD"], cloneDir);
    assert.equal(detachResult.code, 0, detachResult.stderr || detachResult.stdout);
    fs.mkdirSync(path.join(cloneDir, "apps", "openassistd", "dist"), { recursive: true });
    fs.writeFileSync(path.join(cloneDir, "apps", "openassistd", "dist", "index.js"), "// built for dry-run\n", "utf8");

    const operatorPaths = resolveOperatorPaths({ homeDir, installDir: cloneDir });
    const config = createDefaultConfigObject();
    config.runtime.paths.dataDir = operatorPaths.dataDir;
    config.runtime.paths.logsDir = operatorPaths.logsDir;
    config.runtime.paths.skillsDir = operatorPaths.skillsDir;
    saveConfigObject(operatorPaths.configPath, config);
    fs.mkdirSync(path.dirname(operatorPaths.envFilePath), { recursive: true });
    fs.writeFileSync(operatorPaths.envFilePath, "", "utf8");
    saveInstallState(
      {
        installDir: cloneDir,
        configPath: operatorPaths.configPath,
        envFilePath: operatorPaths.envFilePath,
        trackedRef: "refs/pull/23/head"
      },
      operatorPaths.installStatePath
    );

    const blocked = await runCli(
      ["upgrade", "--dry-run", "--install-dir", cloneDir],
      repoRoot(),
      childHomeEnv(homeDir)
    );
    assert.equal(blocked.code, 1, blocked.stderr || blocked.stdout);
    assert.ok(blocked.stdout.includes("Status: fix before updating"), blocked.stdout);
    assert.ok(blocked.stdout.includes("Current update track: PR #23"), blocked.stdout);
    assert.ok(blocked.stdout.includes("PR update track"), blocked.stdout);
    assert.ok(blocked.stdout.includes("--pr 23"), blocked.stdout);

    const explicit = await runCli(
      ["upgrade", "--dry-run", "--install-dir", cloneDir, "--pr", "23"],
      repoRoot(),
      childHomeEnv(homeDir)
    );
    assert.equal(explicit.code, 0, explicit.stderr || explicit.stdout);
    assert.ok(explicit.stdout.includes("Target update track: PR #23"), explicit.stdout);
    assert.ok(explicit.stdout.includes("Dry-run complete. Upgrade is safe to continue"), explicit.stdout);
  });

  it("runs service install dry-run on supported platforms", async (t) => {
    if (process.platform !== "linux" && process.platform !== "darwin") {
      t.skip("service manager integration requires linux or macOS");
      return;
    }
    const root = tempDir("openassist-service-dryrun-");
    const cloneDir = path.join(root, "repo");
    const cloneResult = await runCommand("git", ["clone", "--depth", "1", repoRoot(), cloneDir], repoRoot());
    assert.equal(cloneResult.code, 0, cloneResult.stderr || cloneResult.stdout);

    const envFile = path.join(root, "openassistd.env");
    fs.writeFileSync(envFile, "", "utf8");
    const result = await runCli(
      [
        "service",
        "install",
        "--dry-run",
        "--install-dir",
        cloneDir,
        "--config",
        path.join(cloneDir, "openassist.toml"),
        "--env-file",
        envFile
      ],
      repoRoot()
    );
    assert.equal(result.code, 0, result.stderr || result.stdout);
  });
});
