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

describe("workflow lint script", () => {
  it("lints repository GitHub workflow files successfully", async () => {
    const scriptPath = path.resolve("scripts", "dev", "lint-workflows.mjs");
    const result = await runCommand(process.execPath, [scriptPath], path.resolve("."));
    assert.equal(result.code, 0, result.stderr || result.stdout);
    assert.match(result.stdout + result.stderr, /workflow file\(s\)|passed lint checks/i);
  });
});
