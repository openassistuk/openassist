#!/usr/bin/env node

import fs from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..", "..");
const lintArgs = process.argv.slice(2);

const mode = process.env.OPENASSIST_ACTIONLINT_MODE ?? "auto";
const image = process.env.OPENASSIST_ACTIONLINT_IMAGE ?? "rhysd/actionlint:1.7.11";
const workflowDir = path.join(repoRoot, ".github", "workflows");
const defaultTargets = fs.existsSync(workflowDir)
  ? fs
      .readdirSync(workflowDir)
      .filter((name) => name.endsWith(".yml") || name.endsWith(".yaml"))
      .sort()
      .map((name) => `.github/workflows/${name}`)
  : [];

const hasExplicitTarget = lintArgs.some((arg) => !arg.startsWith("-"));
const effectiveArgs =
  lintArgs.length === 0 || !hasExplicitTarget
    ? [...lintArgs, ...defaultTargets]
    : lintArgs;

if (defaultTargets.length === 0) {
  fail("No workflow files found under .github/workflows.");
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    stdio: "inherit"
  });
  if (result.error) {
    process.stderr.write(`Failed to run ${command}: ${result.error.message}\n`);
  }
  return result;
}

function canRun(command, args) {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    stdio: "ignore"
  });
  return !result.error && result.status === 0;
}

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

function runPathActionlint() {
  const result = run("actionlint", effectiveArgs);
  process.exit(result.status ?? 1);
}

function hasNodeActionlintBin() {
  return fs.existsSync(path.join(repoRoot, "node_modules", "@tktco", "node-actionlint", "bin", "node-actionlint.js"));
}

function runNodeActionlint() {
  const target = resolveNodeActionlintTarget();
  if (!target) {
    runDockerActionlint();
    return;
  }
  const cliPath = path.join(
    repoRoot,
    "node_modules",
    "@tktco",
    "node-actionlint",
    "bin",
    "node-actionlint.js"
  );
  const result = run(process.execPath, [cliPath, target]);
  process.exit(result.status ?? 1);
}

function resolveNodeActionlintTarget() {
  if (lintArgs.length === 0) {
    return ".github/workflows/*.y*ml";
  }
  if (lintArgs.length === 1 && !lintArgs[0].startsWith("-")) {
    return lintArgs[0];
  }
  return null;
}

function runDockerActionlint() {
  if (!canRun("docker", ["version", "--format", "{{.Server.Version}}"])) {
    fail(
      "actionlint is not available in PATH and Docker is not available. Install actionlint or Docker, then rerun `pnpm lint:workflows`."
    );
  }

  const mount = `${repoRoot}:/repo`;
  const result = run("docker", ["run", "--rm", "-v", mount, "-w", "/repo", image, ...effectiveArgs]);
  process.exit(result.status ?? 1);
}

if (mode === "path") {
  if (!canRun("actionlint", ["-version"])) {
    fail(
      "OPENASSIST_ACTIONLINT_MODE=path is set, but actionlint is not available in PATH."
    );
  }
  runPathActionlint();
}

if (mode === "docker") {
  runDockerActionlint();
}

if (canRun("actionlint", ["-version"])) {
  runPathActionlint();
}

if (hasNodeActionlintBin()) {
  runNodeActionlint();
}

runDockerActionlint();
