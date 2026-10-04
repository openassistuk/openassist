import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { describe, it } from "node:test";
import { pathToFileURL } from "node:url";

async function runCommand(
  command: string,
  args: string[],
  cwd: string,
  env?: NodeJS.ProcessEnv
): Promise<{ code: number; stdout: string; stderr: string }> {
  return await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env,
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

  it("rejects an unmatched workflow glob instead of reporting a clean lint", async () => {
    const root = tempDir("openassist-workflow-lint-missing-");
    try {
      for (const script of ["lint-workflows.mjs", "lint-workflows-node.mjs"]) {
        const result = await runCommand(process.execPath, [
          path.resolve("scripts", "dev", script), path.join(root, "*.yml")
        ], path.resolve("."));
        assert.notEqual(result.code, 0, result.stdout);
        assert.match(result.stderr, /No workflow files matched/);
      }
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("enforces action versions on the actual files selected by an explicit glob", async () => {
    const root = tempDir("openassist-workflow-lint-glob-");
    try {
      writeWorkflow(root, "old.yml", [
        "name: Old", "on: push", "jobs:", "  test:", "    runs-on: ubuntu-latest",
        "    steps:", "      - uses: actions/checkout@v5"
      ].join("\n"));
      const result = await runCommand(process.execPath, [
        path.resolve("scripts", "dev", "lint-workflows.mjs"), path.join(root, "*.yml")
      ], path.resolve("."));
      assert.notEqual(result.code, 0, result.stdout);
      assert.match(result.stderr, /Workflow action version policy failed/);
      assert.match(result.stderr, /actions\/checkout@v5/);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("keeps WASM syntax checks and configured runner-label validation active", async () => {
    const root = tempDir("openassist-workflow-lint-wasm-");
    try {
      for (const [runner, step, success, diagnostic] of [
        ["macos-15-intel", "run: echo ok", true, /passed lint checks/],
        ["openassist-unknown-runner", "run: echo ok", false, /runner-label/],
        ["ubuntu-latest", "uses: actions/checkout@v7\n        invalid-field: true", false, /invalid-field/]
      ] as const) {
        const file = writeWorkflow(root, "fixture.yml", [
          "name: Fixture", "on: push", "jobs:", "  test:", `    runs-on: ${runner}`,
          "    steps:", `      - ${step}`
        ].join("\n"));
        const result = await runCommand(process.execPath, [
          path.resolve("scripts", "dev", "lint-workflows-node.mjs"), file
        ], path.resolve("."));
        assert.equal(result.code === 0, success, result.stderr || result.stdout);
        assert.match(result.stdout + result.stderr, diagnostic);
      }
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("checks multiple targets, deduplicates matches and rejects a missing target among valid ones", async () => {
    const root = tempDir("openassist-workflow-lint-targets-");
    try {
      const files = ["first.yml", "second.yaml"].map(name => writeWorkflow(root, name, [
        "name: Valid", "on: push", "jobs:", "  test:", "    runs-on: ubuntu-latest",
        "    steps:", "      - uses: actions/checkout@v7"
      ].join("\n")));
      const script = path.resolve("scripts", "dev", "lint-workflows.mjs");
      const valid = await runCommand(process.execPath, [script, ...files, path.join(root, "*.yml")], path.resolve("."));
      assert.equal(valid.code, 0, valid.stderr || valid.stdout);
      assert.match(valid.stdout, /Checking 2 workflow file\(s\)/);
      const missing = await runCommand(process.execPath, [script, ...files, path.join(root, "missing.yml")], path.resolve("."));
      assert.notEqual(missing.code, 0, missing.stdout);
      assert.match(missing.stderr, /No workflow files matched/);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("preserves native and Docker option operands without treating them as workflow targets", async () => {
    const root = tempDir("openassist-workflow-lint-options-");
    try {
      const preload = path.join(root, "native-tools.mjs");
      fs.writeFileSync(preload, `
        import childProcess from "node:child_process";
        import { syncBuiltinESMExports } from "node:module";
        childProcess.spawnSync = (command, args) => {
          if (command !== "actionlint" && command !== "docker") throw new Error("Unexpected tool: " + command);
          const probe = args[0] === "-version" || args[0] === "version";
          if (!probe) console.log("LINT_ARGS=" + JSON.stringify(command === "docker" ? args.slice(7) : args));
          return { status: 0, stdout: "", stderr: "" };
        };
        syncBuiltinESMExports();
      `);
      const preloadUrl = pathToFileURL(preload).href;
      const script = path.resolve("scripts", "dev", "lint-workflows.mjs");
      const file = writeWorkflow(root, "valid.yml", [
        "name: Valid", "on: push", "jobs:", "  test:", "    runs-on: ubuntu-latest",
        "    steps:", "      - uses: actions/checkout@v7"
      ].join("\n"));
      const options = [
        ["-ignore", "SC.*"], ["-ignore", "SC.*", "-ignore", "-literal"],
        ["--ignore=SC.*"], ["-format", "{{json .}}"], ["-config-file", "custom.yaml"],
        ["-shellcheck", ""], ["-pyflakes", "custom command"], ["-stdin-filename", "input.yml"],
        ["-color=false", "-oneline"], ["--"]
      ];
      for (const mode of ["path", "docker"]) {
        const env = { ...process.env, OPENASSIST_ACTIONLINT_MODE: mode };
        for (const flags of options) {
          const args = [...flags, file];
          const result = await runCommand(process.execPath, ["--import", preloadUrl, script, ...args], path.resolve("."), env);
          assert.equal(result.code, 0, `${mode} ${JSON.stringify(args)}: ${result.stderr}`);
          assert.deepEqual(JSON.parse(result.stdout.split("LINT_ARGS=")[1].trim()), args);
        }
        const defaults = await runCommand(process.execPath, ["--import", preloadUrl, script, "-ignore", "SC.*"], path.resolve("."), env);
        assert.equal(defaults.code, 0, defaults.stderr);
        const forwarded = JSON.parse(defaults.stdout.split("LINT_ARGS=")[1].trim());
        assert.deepEqual(forwarded.slice(0, 2), ["-ignore", "SC.*"]);
        assert.ok(forwarded.slice(2).every((target: string) => target.startsWith(".github/workflows/")));
        assert.ok(forwarded.length > 2, "Options alone must still lint default workflows");

        const missing = await runCommand(process.execPath, ["--import", preloadUrl, script, "-ignore"], path.resolve("."), env);
        assert.notEqual(missing.code, 0, missing.stdout);
        assert.match(missing.stderr, /Missing value for actionlint option: -ignore/);
        assert.doesNotMatch(missing.stdout, /LINT_ARGS=/);

        const outdated = writeWorkflow(root, "old.yml", fs.readFileSync(file, "utf8").replace("checkout@v7", "checkout@v5"));
        const oldResult = await runCommand(process.execPath, ["--import", preloadUrl, script, "-ignore", "SC.*", outdated], path.resolve("."), env);
        assert.notEqual(oldResult.code, 0, oldResult.stdout);
        assert.match(oldResult.stderr, /actions\/checkout@v5/);
      }
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
