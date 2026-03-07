import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { describe, it } from "node:test";
import {
  createDefaultConfigObject,
  saveConfigObject
} from "../../apps/openassist-cli/src/lib/config-edit.js";

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

    const doctorHome = path.join(root, "home");
    const doctorConfigPath = path.join(root, "doctor-openassist.toml");
    const doctorEnvPath = path.join(root, "doctor-openassistd.env");
    const doctorInstallStatePath = path.join(doctorHome, ".config", "openassist", "install-state.json");
    const doctorBinDir = path.join(root, "bin");
    fs.mkdirSync(path.dirname(doctorInstallStatePath), { recursive: true });
    fs.mkdirSync(doctorBinDir, { recursive: true });
    fs.writeFileSync(doctorConfigPath, "runtime.bindPort = 3344\n", "utf8");
    fs.writeFileSync(doctorEnvPath, "# doctor test env\n", "utf8");
    fs.writeFileSync(
      doctorInstallStatePath,
      JSON.stringify(
        {
          installDir: repoRoot(),
          repoUrl: "https://github.com/openassistuk/openassist.git",
          trackedRef: "main",
          serviceManager: process.platform === "darwin" ? "launchd" : "systemd-user",
          configPath: doctorConfigPath,
          envFilePath: doctorEnvPath,
          lastKnownGoodCommit: "test-commit",
          updatedAt: "2026-03-06T00:00:00.000Z"
        },
        null,
        2
      ),
      "utf8"
    );
    if (process.platform === "win32") {
      fs.writeFileSync(path.join(doctorBinDir, "pnpm.cmd"), "@echo off\r\necho 10.0.0\r\n", "utf8");
    } else {
      const pnpmPath = path.join(doctorBinDir, "pnpm");
      fs.writeFileSync(pnpmPath, "#!/usr/bin/env sh\necho 10.0.0\n", "utf8");
      fs.chmodSync(pnpmPath, 0o755);
    }

    const doctor = await runCommand(
      process.execPath,
      [
        path.join(repoRoot(), "node_modules", "tsx", "dist", "cli.mjs"),
        path.join(repoRoot(), "apps", "openassist-cli", "src", "index.ts"),
        "doctor"
      ],
      repoRoot(),
      {
        HOME: doctorHome,
        USERPROFILE: doctorHome,
        PATH: `${doctorBinDir}${path.delimiter}${process.env.PATH ?? ""}`,
        Path: `${doctorBinDir}${path.delimiter}${process.env.Path ?? process.env.PATH ?? ""}`
      }
    );
    assert.ok(doctor.code === 0 || doctor.code === 1, doctor.stderr || doctor.stdout);
    assert.match(doctor.stdout, /OpenAssist lifecycle doctor/);
    assert.match(doctor.stdout, /Ready now/);
    assert.match(doctor.stdout, /Needs action before first reply/);
    assert.match(doctor.stdout, /Needs action before full access/);
    assert.match(doctor.stdout, /Needs action before upgrade/);
    assert.match(doctor.stdout, /Recommended next command/);
    assert.match(doctor.stdout, /Install record/);
    assert.match(doctor.stdout, /Update track/);
    assert.match(doctor.stdout, /openassist (upgrade --dry-run|doctor|setup wizard)/);

    const doctorJson = await runCommand(
      process.execPath,
      [
        path.join(repoRoot(), "node_modules", "tsx", "dist", "cli.mjs"),
        path.join(repoRoot(), "apps", "openassist-cli", "src", "index.ts"),
        "doctor",
        "--json"
      ],
      repoRoot(),
      {
        HOME: doctorHome,
        USERPROFILE: doctorHome,
        PATH: `${doctorBinDir}${path.delimiter}${process.env.PATH ?? ""}`,
        Path: `${doctorBinDir}${path.delimiter}${process.env.Path ?? process.env.PATH ?? ""}`
      }
    );
    assert.ok(doctorJson.code === 0 || doctorJson.code === 1, doctorJson.stderr || doctorJson.stdout);
    const parsedDoctorJson = JSON.parse(doctorJson.stdout) as {
      version: number;
      sections: Record<string, unknown>;
      recommendedNextCommand: { command: string };
    };
    assert.equal(parsedDoctorJson.version, 1);
    assert.equal(typeof parsedDoctorJson.sections.readyNow, "object");
    assert.equal(typeof parsedDoctorJson.sections.needsActionBeforeUpgrade, "object");
    assert.equal(typeof parsedDoctorJson.recommendedNextCommand.command, "string");

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

    const actorPolicySet = await runCli([
      "policy-set",
      "--session",
      "telegram-main:ops-room",
      "--sender-id",
      "123456789",
      "--profile",
      "full-root",
      "--db",
      dbPath
    ]);
    assert.equal(actorPolicySet.code, 0, actorPolicySet.stderr || actorPolicySet.stdout);
    assert.match(actorPolicySet.stdout, /Sender 123456789 in telegram-main:ops-room set to full-root/);

    const actorPolicyGet = await runCli([
      "policy-get",
      "--session",
      "telegram-main:ops-room",
      "--sender-id",
      "123456789",
      "--db",
      dbPath
    ]);
    assert.equal(actorPolicyGet.code, 0, actorPolicyGet.stderr || actorPolicyGet.stdout);
    assert.match(actorPolicyGet.stdout, /(?:^|\r?\n)full-root\r?\n?$/);

    const actorPolicyGetJson = await runCli([
      "policy-get",
      "--session",
      "telegram-main:ops-room",
      "--sender-id",
      "123456789",
      "--json",
      "--db",
      dbPath
    ]);
    assert.equal(actorPolicyGetJson.code, 0, actorPolicyGetJson.stderr || actorPolicyGetJson.stdout);
    assert.match(actorPolicyGetJson.stdout, /"profile": "full-root"/);
    assert.match(actorPolicyGetJson.stdout, /"source": "actor-override"/);
  });

  it("uses a loopback health probe when doctor sees a wildcard bind address", async () => {
    const root = tempDir("openassist-cli-root-wildcard-doctor-");
    const doctorHome = path.join(root, "home");
    const doctorConfigPath = path.join(root, "doctor-openassist.toml");
    const doctorEnvPath = path.join(root, "doctor-openassistd.env");
    const doctorInstallStatePath = path.join(doctorHome, ".config", "openassist", "install-state.json");
    const doctorBinDir = path.join(root, "bin");

    const requestedPaths: string[] = [];
    const server = http.createServer((req, res) => {
      requestedPaths.push(req.url ?? "");
      if (req.url === "/v1/health") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ status: "ok" }));
        return;
      }
      if (req.url === "/v1/time/status") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(
          JSON.stringify({
            time: {
              timezone: "Europe/London",
              timezoneConfirmed: true,
              clockHealth: "ok"
            }
          })
        );
        return;
      }
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "not found" }));
    });

    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => resolve());
    });

    try {
      const address = server.address();
      assert.notEqual(address, null);
      assert.equal(typeof address, "object");
      const port = (address as { port: number }).port;

      fs.mkdirSync(path.dirname(doctorInstallStatePath), { recursive: true });
      fs.mkdirSync(doctorBinDir, { recursive: true });
      const doctorConfig = createDefaultConfigObject();
      doctorConfig.runtime.bindAddress = "::";
      doctorConfig.runtime.bindPort = port;
      saveConfigObject(doctorConfigPath, doctorConfig);
      fs.writeFileSync(doctorEnvPath, "# doctor wildcard env\n", "utf8");
      fs.writeFileSync(
        doctorInstallStatePath,
        JSON.stringify(
          {
            installDir: repoRoot(),
            repoUrl: "https://github.com/openassistuk/openassist.git",
            trackedRef: "main",
            serviceManager: process.platform === "darwin" ? "launchd" : "systemd-user",
            configPath: doctorConfigPath,
            envFilePath: doctorEnvPath,
            lastKnownGoodCommit: "test-commit",
            updatedAt: "2026-03-06T00:00:00.000Z"
          },
          null,
          2
        ),
        "utf8"
      );
      if (process.platform === "win32") {
        fs.writeFileSync(path.join(doctorBinDir, "pnpm.cmd"), "@echo off\r\necho 10.0.0\r\n", "utf8");
      } else {
        const pnpmPath = path.join(doctorBinDir, "pnpm");
        fs.writeFileSync(pnpmPath, "#!/usr/bin/env sh\necho 10.0.0\n", "utf8");
        fs.chmodSync(pnpmPath, 0o755);
      }

      const doctor = await runCommand(
        process.execPath,
        [
          path.join(repoRoot(), "node_modules", "tsx", "dist", "cli.mjs"),
          path.join(repoRoot(), "apps", "openassist-cli", "src", "index.ts"),
          "doctor"
        ],
        repoRoot(),
        {
          HOME: doctorHome,
          USERPROFILE: doctorHome,
          PATH: `${doctorBinDir}${path.delimiter}${process.env.PATH ?? ""}`,
          Path: `${doctorBinDir}${path.delimiter}${process.env.Path ?? process.env.PATH ?? ""}`
        }
      );

      assert.ok(doctor.code === 0 || doctor.code === 1, doctor.stderr || doctor.stdout);
      assert.match(doctor.stdout, /Service health/);
      assert.match(doctor.stdout, /Health endpoint is responding at http:\/\/127\.0\.0\.1:/);
      assert.ok(requestedPaths.includes("/v1/health"), requestedPaths.join(","));
      assert.ok(requestedPaths.includes("/v1/time/status"), requestedPaths.join(","));
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    }
  });

  it("does not report a port conflict when doctor finds a healthy daemon already listening", async () => {
    const root = tempDir("openassist-cli-root-healthy-daemon-doctor-");
    const doctorHome = path.join(root, "home");
    const doctorConfigPath = path.join(root, "doctor-openassist.toml");
    const doctorEnvPath = path.join(root, "doctor-openassistd.env");
    const doctorInstallStatePath = path.join(doctorHome, ".config", "openassist", "install-state.json");
    const doctorBinDir = path.join(root, "bin");

    const requestedPaths: string[] = [];
    const server = http.createServer((req, res) => {
      requestedPaths.push(req.url ?? "");
      if (req.url === "/v1/health") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ status: "ok" }));
        return;
      }
      if (req.url === "/v1/time/status") {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(
          JSON.stringify({
            time: {
              timezone: "Europe/London",
              timezoneConfirmed: true,
              clockHealth: "ok"
            }
          })
        );
        return;
      }
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "not found" }));
    });

    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => resolve());
    });

    try {
      const address = server.address();
      assert.notEqual(address, null);
      assert.equal(typeof address, "object");
      const port = (address as { port: number }).port;

      fs.mkdirSync(path.dirname(doctorInstallStatePath), { recursive: true });
      fs.mkdirSync(doctorBinDir, { recursive: true });
      const doctorConfig = createDefaultConfigObject();
      doctorConfig.runtime.bindAddress = "127.0.0.1";
      doctorConfig.runtime.bindPort = port;
      saveConfigObject(doctorConfigPath, doctorConfig);
      fs.writeFileSync(doctorEnvPath, "# doctor healthy env\n", "utf8");
      fs.writeFileSync(
        doctorInstallStatePath,
        JSON.stringify(
          {
            installDir: repoRoot(),
            repoUrl: "https://github.com/openassistuk/openassist.git",
            trackedRef: "main",
            serviceManager: process.platform === "darwin" ? "launchd" : "systemd-user",
            configPath: doctorConfigPath,
            envFilePath: doctorEnvPath,
            lastKnownGoodCommit: "test-commit",
            updatedAt: "2026-03-06T00:00:00.000Z"
          },
          null,
          2
        ),
        "utf8"
      );
      if (process.platform === "win32") {
        fs.writeFileSync(path.join(doctorBinDir, "pnpm.cmd"), "@echo off\r\necho 10.0.0\r\n", "utf8");
      } else {
        const pnpmPath = path.join(doctorBinDir, "pnpm");
        fs.writeFileSync(pnpmPath, "#!/usr/bin/env sh\necho 10.0.0\n", "utf8");
        fs.chmodSync(pnpmPath, 0o755);
      }

      const doctor = await runCommand(
        process.execPath,
        [
          path.join(repoRoot(), "node_modules", "tsx", "dist", "cli.mjs"),
          path.join(repoRoot(), "apps", "openassist-cli", "src", "index.ts"),
          "doctor"
        ],
        repoRoot(),
        {
          HOME: doctorHome,
          USERPROFILE: doctorHome,
          PATH: `${doctorBinDir}${path.delimiter}${process.env.PATH ?? ""}`,
          Path: `${doctorBinDir}${path.delimiter}${process.env.Path ?? process.env.PATH ?? ""}`
        }
      );

      assert.ok(doctor.code === 0 || doctor.code === 1, doctor.stderr || doctor.stdout);
      assert.match(doctor.stdout, /Service health\.\s+Health endpoint is responding at http:\/\/127\.0\.0\.1:/);
      assert.doesNotMatch(doctor.stdout, /Unable to bind/);
      assert.doesNotMatch(doctor.stdout, /runtime\.port_unavailable/);
      assert.ok(requestedPaths.includes("/v1/health"), requestedPaths.join(","));
      assert.ok(requestedPaths.includes("/v1/time/status"), requestedPaths.join(","));
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    }
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
