import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { describe, it } from "node:test";

function tempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

async function runCommand(
  command: string,
  args: string[],
  cwd: string
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
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

async function runCli(args: string[], cwd: string): Promise<{ code: number; stdout: string; stderr: string }> {
  const tsxCli = path.join(repoRoot(), "apps", "openassist-cli", "src", "index.ts");
  const tsxEntrypoint = path.join(repoRoot(), "node_modules", "tsx", "dist", "cli.mjs");
  return runCommand(process.execPath, [tsxEntrypoint, tsxCli, ...args], cwd);
}

describe("cli command integration", () => {
  it("runs setup show against project config", async () => {
    const result = await runCli(["setup", "show", "--config", "openassist.toml"], repoRoot());
    assert.equal(result.code, 0, result.stderr || result.stdout);
    assert.ok(result.stdout.includes("\"runtime\""), result.stdout);
  });

  it("runs upgrade dry-run on a clean cloned working tree", async () => {
    const root = tempDir("openassist-upgrade-dryrun-");
    const cloneDir = path.join(root, "repo");
    const cloneResult = await runCommand("git", ["clone", "--depth", "1", repoRoot(), cloneDir], repoRoot());
    assert.equal(cloneResult.code, 0, cloneResult.stderr || cloneResult.stdout);

    // CI checkouts can be detached and may not have origin/main fetched; using HEAD keeps dry-run deterministic.
    const result = await runCli(
      ["upgrade", "--dry-run", "--install-dir", cloneDir, "--ref", "HEAD"],
      repoRoot()
    );
    assert.equal(result.code, 0, result.stderr || result.stdout);
    assert.ok(result.stdout.includes("Update plan"), result.stdout);
    assert.ok(result.stdout.includes("- Target update track: HEAD"), result.stdout);
    assert.ok(
      result.stdout.includes(
        "The update can be applied safely with the same install directory and target ref shown above."
      ),
      result.stdout
    );
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
