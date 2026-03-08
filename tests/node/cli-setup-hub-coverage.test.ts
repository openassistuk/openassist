import assert from "node:assert/strict";
import path from "node:path";
import { spawn } from "node:child_process";
import { describe, it } from "node:test";

async function runCommand(
  command: string,
  args: string[],
  cwd: string
): Promise<{ code: number; stdout: string; stderr: string }> {
  return await new Promise((resolve, reject) => {
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
    child.on("error", reject);
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

async function runCli(args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  const tsxCli = path.join(repoRoot(), "apps", "openassist-cli", "src", "index.ts");
  const tsxEntrypoint = path.join(repoRoot(), "node_modules", "tsx", "dist", "cli.mjs");
  return await runCommand(process.execPath, [tsxEntrypoint, tsxCli, ...args], repoRoot());
}

describe("setup hub coverage", () => {
  it("prints scriptable guidance when bare setup is used without a TTY", async () => {
    const result = await runCli(["setup"]);

    assert.equal(result.code, 1, result.stderr || result.stdout);
    assert.match(result.stderr, /Interactive lifecycle hub requires TTY/);
    assert.match(result.stderr, /openassist setup quickstart/);
    assert.match(result.stderr, /openassist setup wizard/);
  });
});
