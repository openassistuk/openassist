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

async function runCli(args: string[], cwd = repoRoot()): Promise<{ code: number; stdout: string; stderr: string }> {
  const tsxCli = path.join(repoRoot(), "apps", "openassist-cli", "src", "index.ts");
  const tsxEntrypoint = path.join(repoRoot(), "node_modules", "tsx", "dist", "cli.mjs");
  return runCommand(process.execPath, [tsxEntrypoint, tsxCli, ...args], cwd);
}

describe("cli root command coverage", () => {
  it("exercises successful utility commands", async () => {
    const root = tempDir("openassist-cli-root-success-");
    const configPath = path.join(root, "openassist.toml");
    const dbPath = path.join(root, "policy.db");

    const init = await runCli(["init", "--config", configPath]);
    assert.equal(init.code, 0, init.stderr || init.stdout);
    assert.equal(fs.existsSync(configPath), true);

    const validate = await runCli(["config", "validate", "--config", configPath]);
    assert.equal(validate.code, 0, validate.stderr || validate.stdout);
    assert.match(validate.stdout, /Config is valid/);

    const doctor = await runCli(["doctor"]);
    assert.equal(doctor.code, 0, doctor.stderr || doctor.stdout);

    const policySet = await runCli([
      "policy-set",
      "--session",
      "s-1",
      "--profile",
      "operator",
      "--db",
      dbPath
    ]);
    assert.equal(policySet.code, 0, policySet.stderr || policySet.stdout);

    const policyGet = await runCli(["policy-get", "--session", "s-1", "--db", dbPath]);
    assert.equal(policyGet.code, 0, policyGet.stderr || policyGet.stdout);
    assert.match(policyGet.stdout, /operator/);
  });

  it("exercises remote command failure paths", async () => {
    const badBaseUrl = "http://127.0.0.1:1";
    const cases: Array<{ args: string[]; errorText: RegExp }> = [
      {
        args: ["auth", "start", "--provider", "openai-main", "--account", "acct-1", "--base-url", badBaseUrl],
        errorText: /OAuth start failed/
      },
      {
        args: ["auth", "complete", "--provider", "openai-main", "--state", "x", "--code", "y", "--base-url", badBaseUrl],
        errorText: /OAuth complete failed/
      },
      {
        args: ["auth", "status", "--base-url", badBaseUrl],
        errorText: /OAuth status failed/
      },
      {
        args: ["auth", "disconnect", "--provider", "openai-main", "--account", "acct-1", "--base-url", badBaseUrl],
        errorText: /OAuth disconnect failed/
      },
      {
        args: ["channel", "status", "--base-url", badBaseUrl],
        errorText: /Channel status failed/
      },
      {
        args: ["channel", "status", "--id", "telegram-main", "--base-url", badBaseUrl],
        errorText: /Channel status failed/
      },
      {
        args: ["channel", "qr", "--id", "whatsapp-main", "--base-url", badBaseUrl],
        errorText: /Channel QR failed/
      },
      {
        args: ["time", "status", "--base-url", badBaseUrl],
        errorText: /Time status failed/
      },
      {
        args: ["time", "confirm", "--timezone", "UTC", "--base-url", badBaseUrl],
        errorText: /Timezone confirm failed/
      },
      {
        args: ["scheduler", "status", "--base-url", badBaseUrl],
        errorText: /Scheduler status failed/
      },
      {
        args: ["scheduler", "tasks", "--base-url", badBaseUrl],
        errorText: /Scheduler task list failed/
      },
      {
        args: ["scheduler", "run", "--id", "ops-summary", "--base-url", badBaseUrl],
        errorText: /Scheduler manual run failed/
      }
    ];

    for (const testCase of cases) {
      const result = await runCli(testCase.args);
      assert.equal(result.code, 1, `expected failure for command: ${testCase.args.join(" ")}`);
      assert.match(result.stderr, testCase.errorText);
    }
  });

  it("exercises migration failure path", async () => {
    const result = await runCli([
      "migrate",
      "openclaw",
      "--input",
      path.join(tempDir("openassist-migrate-missing-"), "nope"),
      "--output",
      path.join(tempDir("openassist-migrate-out-"), "openassist.toml")
    ]);
    assert.equal(result.code, 1, result.stderr || result.stdout);
    assert.match(result.stderr, /Migration failed/);
  });

  it("exercises quickstart non-tty guard path", async () => {
    const result = await runCli(["setup", "quickstart", "--skip-service"]);
    assert.equal(result.code, 1, result.stderr || result.stdout);
    assert.match(result.stderr, /Setup quickstart failed/);
    assert.match(result.stderr, /Interactive quickstart requires TTY/);
  });
});
