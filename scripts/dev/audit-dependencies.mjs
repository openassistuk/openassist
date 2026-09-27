import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

export function auditCommand(cli, args) {
  return /\.[cm]?js$/i.test(cli)
    ? { command: process.execPath, args: [cli, ...args] }
    : { command: cli, args };
}

function main() {
  const cli = process.env.npm_execpath;
  if (!cli) throw new Error("Run dependency audits through pnpm audit:dependencies.");
  fs.mkdirSync("coverage/audit", { recursive: true });
  let failed = false;
  for (const production of [true, false]) {
    const args = ["audit", ...(production ? ["--prod"] : []), "--audit-level", "high", "--json"];
    const invocation = auditCommand(cli, args);
    const result = spawnSync(invocation.command, invocation.args, {
      encoding: "utf8", maxBuffer: 16 * 1024 * 1024, timeout: 120_000, shell: false
    });
    const name = production ? "production" : "all";
    fs.writeFileSync(path.join("coverage/audit", `${name}.json`), result.stdout ?? "");
    try {
      const report = JSON.parse(result.stdout);
      const counts = report.metadata?.vulnerabilities;
      if (!counts || !["low", "moderate", "high", "critical"].every(key => Number.isInteger(counts[key]) && counts[key] >= 0) || result.error || result.status === null) {
        throw new Error("Incomplete audit response");
      }
      console.log(`${name} dependencies: ${JSON.stringify(counts)}`);
      if (result.status !== 0 || counts.high > 0 || counts.critical > 0) failed = true;
    } catch {
      console.error(`${name} dependency audit failed to return a valid report. Check registry connectivity; this is not a clean audit.`);
      failed = true;
    }
  }
  process.exitCode = failed ? 1 : 0;
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) main();
