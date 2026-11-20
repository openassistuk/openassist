import fs from "node:fs";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { test } from "node:test";

for (const app of ["openassist-cli", "openassistd"]) {
  for (const version of ["22.0.0", "24.21.0", "24.22.0", "24.22.1", "24.22.2", "25.0.0"]) {
    test(`${app} rejects Node ${version} before importing application modules`, () => {
      const entry = pathToFileURL(path.resolve(`apps/${app}/dist/index.js`)).href;
      const result = spawnSync(process.execPath, ["--input-type=module", "-e",
        `Object.defineProperty(process.versions, "node", { value: ${JSON.stringify(version)} }); await import(${JSON.stringify(entry)});`
      ], { encoding: "utf8" });
      assert.equal(result.status, 1);
      assert.match(result.stderr, /OpenAssist requires Node\.js >=24\.22\.3 <25/);
      assert.doesNotMatch(result.stderr, /SQLite|ERR_UNKNOWN_BUILTIN_MODULE|credentials|ENOENT/);
      assert.equal(result.stdout, "");
    });
  }
  for (const version of ["24.22.3", "24.23.0"]) {
    test(`${app} accepts patched Node ${version}`, () => {
      const entry = pathToFileURL(path.resolve(`apps/${app}/dist/index.js`)).href;
      const result = spawnSync(process.execPath, ["--input-type=module", "-e",
        `Object.defineProperty(process.versions, "node", { value: ${JSON.stringify(version)} }); process.argv = [process.execPath, "openassist", "--version"]; await import(${JSON.stringify(entry)});`
      ], { encoding: "utf8" });
      assert.equal(result.status, 0, result.stderr);
      assert.equal(result.stdout.trim(), JSON.parse(fs.readFileSync("package.json", "utf8")).version);
      assert.equal(result.stderr, "");
    });
  }
}
