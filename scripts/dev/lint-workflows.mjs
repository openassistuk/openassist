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
const minimumActionMajors = new Map([
  ["actions/checkout", 6],
  ["actions/setup-node", 6],
  ["actions/upload-artifact", 7],
  ["github/codeql-action/init", 4],
  ["github/codeql-action/analyze", 4],
  ["github/codeql-action/autobuild", 4],
  ["github/codeql-action/upload-sarif", 4]
]);
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

function workflowTargetsForPolicy() {
  const explicitTargets = effectiveArgs
    .filter((arg) => !arg.startsWith("-"))
    .filter((arg) => !arg.includes("*") && !arg.includes("?"));
  const targets = explicitTargets.length > 0 ? explicitTargets : defaultTargets;
  return targets
    .map((target) => (path.isAbsolute(target) ? target : path.join(repoRoot, target)));
}

function parseTaggedActionMajor(ref) {
  const match = /^v(\d+)(?:[.-].*)?$/i.exec(ref.trim());
  return match ? Number(match[1]) : undefined;
}

function validateWorkflowPolicies() {
  const errors = [];
  for (const workflowPath of workflowTargetsForPolicy()) {
    if (!fs.existsSync(workflowPath)) {
      errors.push(`${path.relative(repoRoot, workflowPath)} does not exist.`);
      continue;
    }

    const workflow = fs.readFileSync(workflowPath, "utf8");
    for (const match of workflow.matchAll(/uses:\s*([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)?)@([^\s#]+)/g)) {
      const action = match[1];
      const ref = match[2];
      const requiredMajor = action ? minimumActionMajors.get(action) : undefined;
      if (!action || !ref || requiredMajor === undefined) {
        continue;
      }

      const major = parseTaggedActionMajor(ref);
      if (major === undefined) {
        errors.push(
          `${path.relative(repoRoot, workflowPath)} uses ${action}@${ref}, which is not a major tag. Use v${requiredMajor}+ for repo-tracked workflows.`
        );
        continue;
      }
      if (major < requiredMajor) {
        errors.push(
          `${path.relative(repoRoot, workflowPath)} uses ${action}@${ref}, which is below the required v${requiredMajor}+ floor.`
        );
      }
    }
  }
  return errors;
}

function finishLint(result) {
  const status = result.status ?? 1;
  if (status !== 0) {
    process.exit(status);
  }

  const policyErrors = validateWorkflowPolicies();
  if (policyErrors.length > 0) {
    fail(`Workflow action version policy failed:\n- ${policyErrors.join("\n- ")}`);
  }

  process.exit(0);
}

function runPathActionlint() {
  finishLint(run("actionlint", effectiveArgs));
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
  finishLint(run(process.execPath, [cliPath, target]));
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
  finishLint(run("docker", ["run", "--rm", "-v", mount, "-w", "/repo", image, ...effectiveArgs]));
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
