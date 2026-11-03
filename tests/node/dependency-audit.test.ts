import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { test } from "node:test";
import { auditCommand } from "../../scripts/dev/audit-dependencies.mjs";

test("patched coverage glob dependencies preserve source selection and exclusions", async () => {
  const require = createRequire(import.meta.url);
  const coverageRequire = createRequire(require.resolve("c8/package.json"));
  const TestExclude = coverageRequire("test-exclude");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "openassist-coverage-glob-"));
  try {
    const included = ["apps/cli/src/main.ts", "apps/cli/src/.hidden.ts"];
    for (const file of [...included, "apps/cli/dist/main.ts", "tests/example.ts", "apps/cli/node_modules/dep/index.ts", "apps/cli/src/readme.md"]) {
      const target = path.join(root, file);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, "fixture");
    }
    const filter = new TestExclude({ cwd: root, include: ["apps/**"], exclude: ["**/dist/**", "tests/**"], extension: [".ts"] });
    assert.deepEqual(filter.globSync().sort(), included.sort());
    assert.deepEqual((await filter.glob()).sort(), included.sort());
    assert.equal(filter.shouldInstrument(path.join(root, "..", "outside.ts")), false);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("audit runner handles native Unix/Windows pnpm and JavaScript shims", () => {
  for (const cli of ["/usr/local/bin/pnpm", "C:/tools/pnpm.exe"]) {
    assert.deepEqual(auditCommand(cli, ["audit"]), { command: cli, args: ["audit"] });
  }
  assert.deepEqual(auditCommand("/tools/pnpm.cjs", ["audit"]), { command: process.execPath, args: ["/tools/pnpm.cjs", "audit"] });
});

for (const scenario of ["clean", "moderate", "high", "registry", "malformed"]) {
  test(`dependency audits retain both reports and handle ${scenario} results`, () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "openassist-audit-test-"));
    try {
      const cli = path.join(root, "fake-pnpm.cjs");
      fs.writeFileSync(cli, `
        const scenario = ${JSON.stringify(scenario)};
        const counts = { low: 0, moderate: scenario === "moderate" ? 1 : 0, high: scenario === "high" ? 1 : 0, critical: 0 };
        console.log(JSON.stringify(scenario === "registry" ? { error: "Registry unavailable" } : { metadata: { vulnerabilities: scenario === "malformed" ? {} : counts }, advisories: { retained: true }, production: process.argv.includes("--prod") }));
        process.exitCode = scenario === "registry" || scenario === "high" ? 1 : 0;
      `);
      const result = spawnSync(process.execPath, [path.resolve("scripts/dev/audit-dependencies.mjs")], {
        cwd: root, env: { ...process.env, npm_execpath: cli }, encoding: "utf8"
      });
      assert.equal(result.status, ["clean", "moderate"].includes(scenario) ? 0 : 1, result.stderr);
      for (const name of ["production", "all"]) {
        const report = JSON.parse(fs.readFileSync(path.join(root, "coverage/audit", `${name}.json`), "utf8"));
        if (scenario !== "registry") {
          assert.equal(report.advisories.retained, true);
          assert.equal(report.production, name === "production");
        }
      }
      if (["registry", "malformed"].includes(scenario)) assert.match(result.stderr, /not a clean audit/);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  });
}
