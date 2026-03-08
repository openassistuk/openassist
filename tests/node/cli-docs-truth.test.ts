import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { describe, it } from "node:test";

function repoRoot(): string {
  return path.resolve(".");
}

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

async function runCliHelp(args: string[]): Promise<string> {
  const tsxCli = path.join(repoRoot(), "apps", "openassist-cli", "src", "index.ts");
  const tsxEntrypoint = path.join(repoRoot(), "node_modules", "tsx", "dist", "cli.mjs");
  const result = await runCommand(process.execPath, [tsxEntrypoint, tsxCli, ...args, "--help"], repoRoot());
  assert.equal(result.code, 0, result.stderr || result.stdout);
  return result.stdout;
}

function readText(filePath: string): string {
  return fs.readFileSync(path.join(repoRoot(), filePath), "utf8");
}

function normalizeDocCommand(line: string): string | undefined {
  const trimmed = line.trim().replace(/\\$/, "").trim();
  if (trimmed.startsWith("openassistd ")) {
    return "openassistd";
  }
  if (!trimmed.startsWith("openassist ")) {
    return undefined;
  }
  const tokens = trimmed.split(/\s+/);
  const kept: string[] = [];
  for (const token of tokens) {
    if (token.startsWith("--") || token.startsWith("-")) {
      break;
    }
    if (token.includes("<") || token.includes("$") || token.includes("~")) {
      break;
    }
    kept.push(token);
  }
  return kept.join(" ");
}

function extractCommandsFromDoc(filePath: string): string[] {
  const markdown = readText(filePath);
  const commands = new Set<string>();
  let inFence = false;
  for (const rawLine of markdown.split(/\r?\n/)) {
    const trimmed = rawLine.trim();
    if (trimmed.startsWith("```")) {
      inFence = !inFence;
      continue;
    }
    if (!inFence) {
      continue;
    }
    const normalized = normalizeDocCommand(trimmed);
    if (normalized) {
      commands.add(normalized);
    }
  }
  return [...commands].sort();
}

function extractCommandsFromHelp(helpText: string): string[] {
  const commands = new Set<string>();
  let inCommands = false;
  for (const line of helpText.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed === "Commands:") {
      inCommands = true;
      continue;
    }
    if (!inCommands) {
      continue;
    }
    if (trimmed.length === 0 || trimmed === "Options:" || trimmed === "Arguments:") {
      if (trimmed.length === 0) {
        continue;
      }
      break;
    }
    const raw = trimmed.split(/\s{2,}/)[0] ?? "";
    if (raw.startsWith("-")) {
      continue;
    }
    const normalized = raw.split(/\s+\[/)[0]?.trim();
    if (normalized) {
      commands.add(normalized);
    }
  }
  return [...commands].sort();
}

function extractMarkdownLinks(filePath: string): string[] {
  const markdown = readText(filePath);
  const fileDir = path.dirname(path.join(repoRoot(), filePath));
  const links = [...markdown.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)]
    .map((match) => match[1]?.trim() ?? "")
    .filter((target) => target.length > 0)
    .filter((target) => !target.startsWith("http://") && !target.startsWith("https://") && !target.startsWith("#"));

  return links.map((target) => path.resolve(fileDir, target.split("#")[0] ?? target));
}

function parseWorkflowMatrixOs(workflowPath: string): string[] {
  const workflow = readText(workflowPath);
  const values = [...workflow.matchAll(/^\s+- (ubuntu-latest|macos-latest|windows-latest)$/gm)].map(
    (match) => match[1] ?? ""
  );
  return [...new Set(values)];
}

function extractWorkflowScheduleCron(workflowPath: string): string {
  const workflow = readText(workflowPath);
  const match = workflow.match(/^\s+- cron: "([^"]+)"$/m);
  assert.ok(match?.[1], `Missing cron schedule in ${workflowPath}`);
  return match[1];
}

function formatWorkflowSchedule(cron: string): string {
  const match = cron.match(/^(\d+)\s+(\d+)\s+\*\s+\*\s+([0-7](?:,[0-7])*)$/);
  assert.ok(match, `Unsupported workflow cron format: ${cron}`);
  const [, minute, hour, weekdays] = match;
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const renderedDays = weekdays
    .split(",")
    .map((value) => Number(value) % 7)
    .map((value) => `\`${dayNames[value]}\``)
    .join("/");
  const renderedTime = `\`${hour.padStart(2, "0")}:${minute.padStart(2, "0")} UTC\``;
  return `${renderedDays} at ${renderedTime}`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractSectionBullets(markdown: string, heading: string): string[] {
  const escapedHeading = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = markdown.match(new RegExp(`## ${escapedHeading}\\r?\\n([\\s\\S]*?)(?:\\r?\\n## |$)`));
  assert.ok(match, `Missing section ${heading}`);
  return (match[1] ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- `"))
    .map((line) => line.replace(/^- `/, "").replace(/`$/, ""));
}

describe("docs truth", () => {
  it("keeps documented lifecycle command examples aligned with the real CLI surface", async () => {
    const topLevelHelp = await runCliHelp([]);
    const supported = new Set<string>();
    supported.add("openassist");
    supported.add("openassistd");
    for (const command of extractCommandsFromHelp(topLevelHelp)) {
      supported.add(`openassist ${command}`);
    }

    for (const parent of ["setup", "service", "auth", "channel", "time", "scheduler", "tools", "skills", "growth", "config", "migrate"]) {
      const help = await runCliHelp([parent]);
      for (const child of extractCommandsFromHelp(help)) {
        supported.add(`openassist ${parent} ${child}`);
      }
    }
    supported.add("openassist growth helper add");

    const docFiles = [
      "README.md",
      "docs/README.md",
      "docs/operations/quickstart-linux-macos.md",
      "docs/operations/install-linux.md",
      "docs/operations/install-macos.md",
      "docs/operations/setup-wizard.md",
      "docs/operations/upgrade-and-rollback.md",
      "docs/operations/restart-recovery.md",
      "docs/operations/config-rollout-and-rollback.md",
      "docs/operations/common-troubleshooting.md"
    ];

    for (const filePath of docFiles) {
      for (const command of extractCommandsFromDoc(filePath)) {
        assert.ok(supported.has(command), `${filePath} documents a CLI command that is not registered: ${command}`);
      }
    }
  });

  it("keeps root doc links valid", () => {
    for (const filePath of ["README.md", "docs/README.md"]) {
      for (const target of extractMarkdownLinks(filePath)) {
        assert.equal(fs.existsSync(target), true, `${filePath} links to missing path ${target}`);
      }
    }
  });

  it("keeps workflow statements aligned with the actual workflow files", () => {
    const readme = readText("README.md");
    const docsIndex = readText("docs/README.md");
    const testMatrix = readText("docs/testing/test-matrix.md");
    const serviceSmokeSchedule = formatWorkflowSchedule(extractWorkflowScheduleCron(".github/workflows/service-smoke.yml"));
    const lifecycleSmokeSchedule = formatWorkflowSchedule(
      extractWorkflowScheduleCron(".github/workflows/lifecycle-e2e-smoke.yml")
    );

    assert.deepEqual(parseWorkflowMatrixOs(".github/workflows/ci.yml").sort(), [
      "macos-latest",
      "ubuntu-latest",
      "windows-latest"
    ]);
    assert.match(readme, /workflow lint/);
    assert.match(readme, /quality-and-coverage on `ubuntu-latest`, `macos-latest`, and `windows-latest`/);
    assert.match(testMatrix, /quality and coverage matrix .*`pnpm ci:strict`.*on:/);
    assert.match(testMatrix, /`ubuntu-latest`/);
    assert.match(testMatrix, /`macos-latest`/);
    assert.match(testMatrix, /`windows-latest`/);

    assert.deepEqual(parseWorkflowMatrixOs(".github/workflows/service-smoke.yml").sort(), [
      "macos-latest",
      "ubuntu-latest"
    ]);
    assert.match(
      readme,
      new RegExp(`Service Smoke\` runs on manual dispatch and schedule \\(${escapeRegExp(serviceSmokeSchedule)}\\)`)
    );
    assert.match(
      docsIndex,
      new RegExp(
        `service-smoke\\.yml\` runs on \`workflow_dispatch\` and schedule \\(${escapeRegExp(serviceSmokeSchedule)}\\)`
      )
    );
    assert.match(testMatrix, /### Service Smoke \(`\.github\/workflows\/service-smoke\.yml`\)/);

    assert.deepEqual(parseWorkflowMatrixOs(".github/workflows/lifecycle-e2e-smoke.yml").sort(), [
      "macos-latest",
      "ubuntu-latest"
    ]);
    assert.match(
      readme,
      new RegExp(
        `Lifecycle E2E Smoke\` runs on manual dispatch and schedule \\(${escapeRegExp(lifecycleSmokeSchedule)}\\)`
      )
    );
    assert.match(
      docsIndex,
      new RegExp(
        `lifecycle-e2e-smoke\\.yml\` runs on \`workflow_dispatch\` and schedule \\(${escapeRegExp(lifecycleSmokeSchedule)}\\)`
      )
    );
    assert.match(testMatrix, /### Lifecycle E2E Smoke \(`\.github\/workflows\/lifecycle-e2e-smoke\.yml`\)/);
  });

  it("keeps the documented test inventory in sync with the real suite files", () => {
    const markdown = readText("docs/testing/test-matrix.md");
    const documentedVitest = extractSectionBullets(markdown, "Unit and Logic Suites (Vitest)").sort();
    const documentedNode = extractSectionBullets(markdown, "Integration Suites (Node test runner)").sort();
    const actualVitest = fs.readdirSync(path.join(repoRoot(), "tests", "vitest")).sort();
    const actualNode = fs.readdirSync(path.join(repoRoot(), "tests", "node")).sort();

    assert.deepEqual(documentedVitest, actualVitest);
    assert.deepEqual(documentedNode, actualNode);
  });
});
