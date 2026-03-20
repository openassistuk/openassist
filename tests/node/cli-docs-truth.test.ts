import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

function repoRoot(): string {
  return path.resolve(".");
}

function readText(filePath: string): string {
  return fs.readFileSync(path.join(repoRoot(), filePath), "utf8");
}

function listMarkdownFiles(rootDir: string): string[] {
  const entries = fs.readdirSync(rootDir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const absolute = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listMarkdownFiles(absolute));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".md")) {
      files.push(path.relative(repoRoot(), absolute));
    }
  }
  return files;
}

function liveDocFiles(): string[] {
  const docsFiles = listMarkdownFiles(path.join(repoRoot(), "docs"))
    .map((filePath) => filePath.replace(/\\/g, "/"))
    .filter((filePath) => !filePath.startsWith("docs/execplans/"));
  return ["README.md", "AGENTS.md", "CHANGELOG.md", ...docsFiles].sort();
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

function normalizeCommandSegment(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed || trimmed === "help") {
    return undefined;
  }
  const [firstToken] = trimmed.split(/\s+/);
  const normalized = firstToken?.trim();
  if (!normalized || normalized === "help") {
    return undefined;
  }
  return normalized;
}

function extractRegisteredCommands(filePath: string): string[] {
  const supported = new Set<string>(["openassist", "openassistd"]);
  const varPaths = new Map<string, string[]>([["program", []]]);
  const source = readText(filePath);
  const assignmentPattern = /const\s+(\w+)\s*=\s*(\w+)\s*\.\s*command\("([^"]+)"\)/g;
  const callPattern = /(\w+)\s*\.\s*command\("([^"]+)"\)/g;
  const chainedCommandPattern = /(\w+)\s*\.\s*command\("([^"]+)"\)([\s\S]*?)\.\s*command\("([^"]+)"\)/g;

  for (const match of source.matchAll(assignmentPattern)) {
    const [, childVar, parentVar, commandLiteral] = match;
    const parentPath = parentVar ? varPaths.get(parentVar) : undefined;
    const commandSegment = commandLiteral ? normalizeCommandSegment(commandLiteral) : undefined;
    if (!childVar || !parentPath || !commandSegment) {
      continue;
    }
    varPaths.set(childVar, [...parentPath, commandSegment]);
  }

  for (const match of source.matchAll(callPattern)) {
    const [, parentVar, commandLiteral] = match;
    const parentPath = parentVar ? varPaths.get(parentVar) : undefined;
    const commandSegment = commandLiteral ? normalizeCommandSegment(commandLiteral) : undefined;
    if (!parentPath || !commandSegment) {
      continue;
    }
    const fullPath = [...parentPath, commandSegment];
    supported.add(`openassist ${fullPath.join(" ")}`);
  }

  for (const match of source.matchAll(chainedCommandPattern)) {
    const [, parentVar, firstLiteral, , secondLiteral] = match;
    const parentPath = parentVar ? varPaths.get(parentVar) : undefined;
    const firstCommand = firstLiteral ? normalizeCommandSegment(firstLiteral) : undefined;
    const secondCommand = secondLiteral ? normalizeCommandSegment(secondLiteral) : undefined;
    if (!parentPath || !firstCommand || !secondCommand) {
      continue;
    }
    supported.add(`openassist ${[...parentPath, firstCommand].join(" ")}`);
    supported.add(`openassist ${[...parentPath, firstCommand, secondCommand].join(" ")}`);
  }

  return [...supported].sort();
}

function collectSupportedCommands(): Set<string> {
  const supported = new Set<string>(["openassist", "openassistd"]);
  for (const filePath of [
    "apps/openassist-cli/src/index.ts",
    "apps/openassist-cli/src/commands/setup.ts",
    "apps/openassist-cli/src/commands/service.ts",
    "apps/openassist-cli/src/commands/upgrade.ts"
  ]) {
    for (const command of extractRegisteredCommands(filePath)) {
      if (command === "openassist" || command === "openassistd") {
        continue;
      }
      supported.add(command);
    }
  }
  return supported;
}

interface MarkdownLink {
  sourceFile: string;
  rawTarget: string;
  resolvedPath: string;
  fragment?: string;
}

function extractMarkdownLinks(filePath: string): MarkdownLink[] {
  const markdown = readText(filePath);
  const sourceAbs = path.join(repoRoot(), filePath);
  const sourceDir = path.dirname(sourceAbs);
  const links: MarkdownLink[] = [];
  for (const match of markdown.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
    const target = match[1]?.trim() ?? "";
    if (
      target.length === 0 ||
      target.startsWith("http://") ||
      target.startsWith("https://") ||
      target.startsWith("mailto:")
    ) {
      continue;
    }
    if (target.startsWith("#")) {
      links.push({
        sourceFile: filePath,
        rawTarget: target,
        resolvedPath: sourceAbs,
        fragment: target.slice(1)
      });
      continue;
    }
    const [pathPart, fragment] = target.split("#");
    links.push({
      sourceFile: filePath,
      rawTarget: target,
      resolvedPath: path.resolve(sourceDir, pathPart ?? target),
      ...(fragment ? { fragment } : {})
    });
  }
  return links;
}

function stripHeadingMarkdown(text: string): string {
  return text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/[*_~]/g, "")
    .replace(/[<>]/g, "")
    .trim();
}

function slugifyHeading(text: string): string {
  return stripHeadingMarkdown(text)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\- ]+/gu, "")
    .trim()
    .replace(/\s+/g, "-");
}

function extractHeadingAnchors(filePath: string): Set<string> {
  const markdown = readText(filePath);
  const anchors = new Set<string>();
  const seen = new Map<string, number>();
  let inFence = false;
  for (const rawLine of markdown.split(/\r?\n/)) {
    const trimmed = rawLine.trim();
    if (trimmed.startsWith("```")) {
      inFence = !inFence;
      continue;
    }
    if (inFence) {
      continue;
    }
    const heading = rawLine.match(/^#{1,6}\s+(.+)$/);
    if (!heading?.[1]) {
      continue;
    }
    const base = slugifyHeading(heading[1]);
    if (!base) {
      continue;
    }
    const count = seen.get(base) ?? 0;
    seen.set(base, count + 1);
    anchors.add(count === 0 ? base : `${base}-${count}`);
  }
  return anchors;
}

function extractDocIndexTargets(filePath: string): Set<string> {
  const targets = new Set<string>();
  for (const link of extractMarkdownLinks(filePath)) {
    const normalizedPath = path.relative(repoRoot(), link.resolvedPath).replace(/\\/g, "/");
    if (!normalizedPath.startsWith("docs/") || !normalizedPath.endsWith(".md")) {
      continue;
    }
    if (normalizedPath.startsWith("docs/execplans/")) {
      continue;
    }
    targets.add(normalizedPath);
  }
  return targets;
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

function formatWorkflowSchedule(cron: string): { cadence: "daily" | "weekly"; detail: string } {
  const daily = cron.match(/^(\d+)\s+(\d+)\s+\*\s+\*\s+\*$/);
  if (daily) {
    const [, minute, hour] = daily;
    return {
      cadence: "daily",
      detail: `\`${hour.padStart(2, "0")}:${minute.padStart(2, "0")} UTC\``
    };
  }
  const weekdays = cron.match(/^(\d+)\s+(\d+)\s+\*\s+\*\s+([0-7](?:,[0-7])*)$/);
  assert.ok(weekdays, `Unsupported workflow cron format: ${cron}`);
  const [, minute, hour, weekdayList] = weekdays;
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const renderedDays = weekdayList
    .split(",")
    .map((value) => Number(value) % 7)
    .map((value) => `\`${dayNames[value]}\``)
    .join("/");
  return {
    cadence: "weekly",
    detail: `${renderedDays} at \`${hour.padStart(2, "0")}:${minute.padStart(2, "0")} UTC\``
  };
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

function extractVitestThresholds(): { lines: number; functions: number; branches: number; statements: number } {
  const config = readText("vitest.config.ts");
  const match = config.match(
    /thresholds:\s*{[\s\S]*?lines:\s*(\d+)[\s\S]*?functions:\s*(\d+)[\s\S]*?branches:\s*(\d+)[\s\S]*?statements:\s*(\d+)/m
  );
  assert.ok(match, "Could not parse Vitest thresholds from vitest.config.ts");
  return {
    lines: Number(match[1]),
    functions: Number(match[2]),
    branches: Number(match[3]),
    statements: Number(match[4])
  };
}

function extractNodeCoverageThresholds(): { lines: number; functions: number; branches: number; statements: number } {
  const packageJson = JSON.parse(readText("package.json")) as {
    scripts?: Record<string, string>;
  };
  const script = packageJson.scripts?.["test:coverage:node"] ?? "";
  const match = script.match(/--lines (\d+) --functions (\d+) --branches (\d+) --statements (\d+)/);
  assert.ok(match, "Could not parse node coverage thresholds from package.json");
  return {
    lines: Number(match[1]),
    functions: Number(match[2]),
    branches: Number(match[3]),
    statements: Number(match[4])
  };
}

function extractLifecycleSmokeDoctorJsonVersion(workflowPath: string): number {
  const workflow = readText(workflowPath);
  const match = workflow.match(/report\.version !== (\d+)/);
  assert.ok(match?.[1], `Could not parse doctor --json report version guard from ${workflowPath}`);
  return Number(match[1]);
}

async function currentLifecycleReportVersion(): Promise<number> {
  const { buildLifecycleReport } = await import("../../apps/openassist-cli/src/lib/lifecycle-readiness.js");
  return buildLifecycleReport({
    installDir: "/tmp/openassist",
    configPath: "/tmp/openassist/openassist.toml",
    envFilePath: "/tmp/openassist/openassistd.env",
    installStatePresent: false,
    repoBacked: false,
    configExists: false,
    envExists: false,
    daemonBuildExists: false
  }).version;
}

describe("docs truth", () => {
  it("keeps documented command examples across live docs aligned with the real CLI surface", () => {
    const supported = collectSupportedCommands();
    for (const filePath of liveDocFiles()) {
      for (const command of extractCommandsFromDoc(filePath)) {
        assert.ok(supported.has(command), `${filePath} documents a CLI command that is not registered: ${command}`);
      }
    }
  });

  it("keeps local markdown links and in-repo anchors valid across live docs", () => {
    for (const filePath of liveDocFiles()) {
      for (const link of extractMarkdownLinks(filePath)) {
        assert.equal(fs.existsSync(link.resolvedPath), true, `${filePath} links to missing path ${link.rawTarget}`);
        if (!link.fragment) {
          continue;
        }
        const targetFile = path.relative(repoRoot(), link.resolvedPath).replace(/\\/g, "/");
        const anchors = extractHeadingAnchors(targetFile);
        assert.ok(
          anchors.has(link.fragment),
          `${filePath} links to missing anchor ${link.rawTarget} (resolved file ${targetFile})`
        );
      }
    }
  });

  it("keeps docs/README.md as a complete index for live non-ExecPlan docs", () => {
    const indexedDocs = extractDocIndexTargets("docs/README.md");
    const actualDocs = listMarkdownFiles(path.join(repoRoot(), "docs"))
      .map((filePath) => filePath.replace(/\\/g, "/"))
      .filter((filePath) => filePath !== "docs/README.md")
      .filter((filePath) => !filePath.startsWith("docs/execplans/"))
      .sort();

    for (const filePath of actualDocs) {
      assert.ok(indexedDocs.has(filePath), `docs/README.md is missing live doc link ${filePath}`);
    }
  });

  it("keeps coverage-threshold wording aligned with config truth", () => {
    const agents = readText("AGENTS.md");
    const testMatrix = readText("docs/testing/test-matrix.md");
    const vitest = extractVitestThresholds();
    const node = extractNodeCoverageThresholds();

    assert.match(
      agents,
      new RegExp(`Vitest: lines/statements/functions >= ${vitest.lines}, branches >= ${vitest.branches}`)
    );
    assert.match(
      agents,
      new RegExp(
        `Node integration: lines/statements >= ${node.lines}, functions >= ${node.functions}, branches >= ${node.branches}`
      )
    );
    assert.match(agents, /`vitest\.config\.ts`/);
    assert.match(agents, /`package\.json`/);

    assert.match(testMatrix, new RegExp(`lines/statements/functions >= ${vitest.lines}`));
    assert.match(testMatrix, new RegExp(`branches >= ${vitest.branches}`));
    assert.match(testMatrix, new RegExp(`lines/statements >= ${node.lines}`));
    assert.match(testMatrix, new RegExp(`functions >= ${node.functions}`));
    assert.match(testMatrix, new RegExp(`branches >= ${node.branches}`));
  });

  it("keeps Linux and macOS operator parity wording aligned across shared docs", () => {
    const readme = readText("README.md");
    const docsIndex = readText("docs/README.md");
    const quickstart = readText("docs/operations/quickstart-linux-macos.md");
    const linuxInstall = readText("docs/operations/install-linux.md");
    const macosInstall = readText("docs/operations/install-macos.md");
    const architecture = readText("docs/architecture/overview.md");
    const chaos = readText("docs/testing/chaos-and-soak.md");
    const agents = readText("AGENTS.md");

    assert.match(readme, /Linux and macOS are first-class supported operator paths/i);
    assert.match(docsIndex, /Linux and macOS are the first-class operator paths/i);
    assert.match(quickstart, /Linux and macOS are first-class supported operator paths/);
    assert.doesNotMatch(quickstart, /Linux is the primary release target/);
    assert.match(linuxInstall, /Linux is a first-class OpenAssist operator path\./);
    assert.match(macosInstall, /macOS is a first-class OpenAssist operator path and uses `launchd` service management\./);
    assert.doesNotMatch(macosInstall, /Linux remains the deeper validation target/);
    assert.match(architecture, /Linux: first-class supported operator path/);
    assert.match(architecture, /macOS: first-class supported operator path/);
    assert.match(chaos, /all applicable scenarios pass on Linux and macOS supported operator paths/);
    assert.match(agents, /shared operator docs and lifecycle messaging must treat Linux and macOS as first-class supported operator paths/);
  });

  it("keeps workflow statements aligned with workflow truth", () => {
    const readme = readText("README.md");
    const docsIndex = readText("docs/README.md");
    const testMatrix = readText("docs/testing/test-matrix.md");
    const agents = readText("AGENTS.md");
    const ciSchedule = formatWorkflowSchedule(extractWorkflowScheduleCron(".github/workflows/ci.yml"));
    const codeqlSchedule = formatWorkflowSchedule(extractWorkflowScheduleCron(".github/workflows/codeql.yml"));
    const serviceSmokeSchedule = formatWorkflowSchedule(extractWorkflowScheduleCron(".github/workflows/service-smoke.yml"));
    const lifecycleSmokeSchedule = formatWorkflowSchedule(
      extractWorkflowScheduleCron(".github/workflows/lifecycle-e2e-smoke.yml")
    );

    assert.deepEqual(parseWorkflowMatrixOs(".github/workflows/ci.yml").sort(), [
      "macos-latest",
      "ubuntu-latest",
      "windows-latest"
    ]);
    assert.match(
      readme,
      new RegExp(
        `CI\` runs on pushes to \`main\`, pull requests, manual dispatch, and a ${ciSchedule.cadence} ${escapeRegExp(ciSchedule.detail)} schedule`
      )
    );
    assert.match(readme, /quality-and-coverage` matrix on `ubuntu-latest`, `macos-latest`, and `windows-latest`/);
    assert.match(testMatrix, /### CI \(`\.github\/workflows\/ci\.yml`\)/);
    assert.match(testMatrix, /quality and coverage matrix \(`pnpm ci:strict`\) on:/);

    assert.match(
      readme,
      new RegExp(
        `CodeQL\` runs on pushes to \`main\`, pull requests to \`main\`, manual dispatch, and a ${codeqlSchedule.cadence} ${escapeRegExp(codeqlSchedule.detail)} schedule`
      )
    );
    assert.match(readme, /CodeQL preflight` plus `analyze \(javascript-typescript\)`/);
    assert.match(
      docsIndex,
      new RegExp(
        `CodeQL\` runs on pushes to \`main\`, pull requests to \`main\`, manual dispatch, and a ${codeqlSchedule.cadence} ${escapeRegExp(codeqlSchedule.detail)} schedule`
      )
    );
    assert.match(testMatrix, /### CodeQL \(`\.github\/workflows\/codeql\.yml`\)/);
    assert.match(testMatrix, /`CodeQL preflight`/);
    assert.match(testMatrix, /`analyze \(javascript-typescript\)`/);
    assert.match(agents, /`\.github\/workflows\/codeql\.yml`/);

    assert.deepEqual(parseWorkflowMatrixOs(".github/workflows/service-smoke.yml").sort(), [
      "macos-latest",
      "ubuntu-latest"
    ]);
    assert.match(
      readme,
      new RegExp(`Service Smoke\` runs on manual dispatch and schedule \\(${escapeRegExp(serviceSmokeSchedule.detail)}\\)`)
    );
    assert.match(
      docsIndex,
      new RegExp(
        `service-smoke\\.yml\` runs on \`workflow_dispatch\` and schedule \\(${escapeRegExp(serviceSmokeSchedule.detail)}\\)`
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
        `Lifecycle E2E Smoke\` runs on manual dispatch and schedule \\(${escapeRegExp(lifecycleSmokeSchedule.detail)}\\)`
      )
    );
    assert.match(
      docsIndex,
      new RegExp(
        `lifecycle-e2e-smoke\\.yml\` runs on \`workflow_dispatch\` and schedule \\(${escapeRegExp(lifecycleSmokeSchedule.detail)}\\)`
      )
    );
    assert.match(testMatrix, /### Lifecycle E2E Smoke \(`\.github\/workflows\/lifecycle-e2e-smoke\.yml`\)/);
  });

  it("keeps the lifecycle E2E smoke doctor-report version guard aligned with the lifecycle report", async () => {
    const expectedVersion = await currentLifecycleReportVersion();
    const workflowVersion = extractLifecycleSmokeDoctorJsonVersion(".github/workflows/lifecycle-e2e-smoke.yml");
    assert.equal(workflowVersion, expectedVersion);
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
