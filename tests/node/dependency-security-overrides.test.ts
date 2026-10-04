import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";

function resolvedVersions(lock: string, name: string): string[] {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`^  '?${escaped}@(\\d+\\.\\d+\\.\\d+)(?=['(:])`, "gm");
  return [...new Set([...lock.matchAll(pattern)].map(match => match[1]))];
}

test("the resolved tree covers the Dependabot snapshot, CI #391 and post-release Axios advisories", () => {
  const lock = fs.readFileSync("pnpm-lock.yaml", "utf8");
  // Patched floors for the 72-alert snapshot, CI #391 and the final 0.2.0 audit.
  const floors: Record<string, string> = {
    "@protobufjs/utf8": "1.1.1",
    "@vitest/mocker": "4.1.11",
    "@whiskeysockets/baileys": "6.7.22",
    axios: "1.20.0",
    "brace-expansion": "5.0.12",
    esbuild: "0.28.1",
    "follow-redirects": "1.16.0",
    "form-data": "4.0.6",
    nanoid: "3.3.12",
    postcss: "8.5.23",
    protobufjs: "7.6.5",
    sharp: "0.35.4",
    undici: "6.28.1",
    vite: "6.4.3",
    vitest: "4.1.11",
    ws: "8.21.0"
  };
  for (const [name, floor] of Object.entries(floors)) {
    const versions = resolvedVersions(lock, name);
    assert.ok(versions.length > 0, `Expected resolved package ${name}; review alert reconciliation if removed`);
    const minimum = floor.split(".").map(Number);
    for (const version of versions) {
      const parts = version.split(".").map(Number);
      const different = parts.findIndex((value, index) => value !== minimum[index]);
      assert.ok(different === -1 || parts[different] > minimum[different], `${name}@${version} is below patched floor ${floor}`);
    }
  }
  // Parent upgrades removed the vulnerable UUID dependency entirely.
  assert.deepEqual(resolvedVersions(lock, "uuid"), []);
  // PR #54 left coverage-v8 on 2.x; the modernization upgrades both together.
  assert.deepEqual(resolvedVersions(lock, "@vitest/coverage-v8"), resolvedVersions(lock, "vitest"));
});

test("dependency policy rejects the previously vulnerable dependency floors", () => {
  const policy = fs.readFileSync("pnpm-workspace.yaml", "utf8");
  const lock = fs.readFileSync("pnpm-lock.yaml", "utf8");
  assert.match(policy, /engineStrict: true/);
  assert.doesNotMatch(policy, /blockExoticSubdeps: false|trustLockfile: true/);
  for (const spec of ["undici@6.24.0", "undici@6.28.0", "brace-expansion@5.0.9", "brace-expansion@5.0.10", "brace-expansion@5.0.11", "protobufjs@6.8.8", "protobufjs@7.5.4", "axios@1.13.5", "axios@1.18.0", "axios@1.19.0", "ws@8.19.0", "sharp@0.34.5", "vitest@2.1.9"]) {
    assert.ok(!lock.includes(spec + ":"), "Vulnerable version remains: " + spec);
  }
  assert.match(policy, /'@whiskeysockets\/baileys>libsignal': '6.0.0'/);
  assert.ok(!lock.includes("libsignal-node"), "Baileys must use registry libsignal rather than a Git snapshot");
});

test("workflow lint omits the unused CLI glob tree affected by GHSA-vfj7-8cjw-p6xm", () => {
  const lock = fs.readFileSync("pnpm-lock.yaml", "utf8");
  for (const name of ["fast-glob", "micromatch", "braces"]) {
    assert.deepEqual(resolvedVersions(lock, name), [], `Unused vulnerable glob dependency remains: ${name}`);
  }
});
