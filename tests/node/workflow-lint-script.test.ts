import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
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

function tempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function writeWorkflow(root: string, name: string, body: string): string {
  const filePath = path.join(root, name);
  fs.writeFileSync(filePath, body, "utf8");
  return filePath;
}

describe("workflow lint script", () => {
  it("lints repository GitHub workflow files successfully", async () => {
    const scriptPath = path.resolve("scripts", "dev", "lint-workflows.mjs");
    const result = await runCommand(process.execPath, [scriptPath], path.resolve("."));
    assert.equal(result.code, 0, result.stderr || result.stdout);
    assert.match(result.stdout + result.stderr, /workflow file\(s\)|passed lint checks/i);
  });

  it("accepts workflow files that meet the minimum tracked action major versions", async () => {
    const scriptPath = path.resolve("scripts", "dev", "lint-workflows.mjs");
    const root = tempDir("openassist-workflow-lint-good-");
    const workflowPath = writeWorkflow(
      root,
      "good.yml",
      [
        "name: Good",
        "on: push",
        "jobs:",
        "  test:",
        "    runs-on: ubuntu-latest",
        "    steps:",
        "      - uses: actions/checkout@v6",
        "      - uses: actions/setup-node@v6",
        "        with:",
        "          node-version: 22",
        "      - uses: actions/upload-artifact@v7",
        "        with:",
        "          name: artifacts",
        "          path: README.md",
        "      - uses: github/codeql-action/init@v4",
        "        with:",
        "          languages: javascript-typescript",
        "      - uses: github/codeql-action/analyze@v4"
      ].join("\n")
    );

    const result = await runCommand(process.execPath, [scriptPath, workflowPath], path.resolve("."));
    assert.equal(result.code, 0, result.stderr || result.stdout);
  });

  it("keeps policy enforcement active when invoked with a literal workflow glob", async () => {
    const scriptPath = path.resolve("scripts", "dev", "lint-workflows.mjs");
    const result = await runCommand(process.execPath, [scriptPath, ".github/workflows/*.yml"], path.resolve("."));
    assert.equal(result.code, 0, result.stderr || result.stdout);
    assert.match(result.stdout + result.stderr, /workflow file\(s\)|passed lint checks/i);
  });

  it("fails when a tracked workflow uses outdated action majors", async () => {
    const scriptPath = path.resolve("scripts", "dev", "lint-workflows.mjs");
    const root = tempDir("openassist-workflow-lint-bad-");
    const workflowPath = writeWorkflow(
      root,
      "bad.yml",
      [
        "name: Bad",
        "on: push",
        "jobs:",
        "  test:",
        "    runs-on: ubuntu-latest",
        "    steps:",
        "      - uses: actions/checkout@v5",
        "      - uses: actions/setup-node@v5",
        "        with:",
        "          node-version: 22",
        "      - uses: actions/upload-artifact@v6",
        "        with:",
        "          name: artifacts",
        "          path: README.md",
        "      - uses: github/codeql-action/init@v3",
        "        with:",
        "          languages: javascript-typescript",
        "      - uses: github/codeql-action/analyze@v3"
      ].join("\n")
    );

    const result = await runCommand(process.execPath, [scriptPath, workflowPath], path.resolve("."));
    assert.notEqual(result.code, 0, result.stdout);
    assert.match(result.stderr, /Workflow action version policy failed/);
    assert.match(result.stderr, /actions\/checkout@v5/);
    assert.match(result.stderr, /actions\/setup-node@v5/);
    assert.match(result.stderr, /actions\/upload-artifact@v6/);
    assert.match(result.stderr, /github\/codeql-action\/init@v3/);
    assert.match(result.stderr, /github\/codeql-action\/analyze@v3/);
  });
});
