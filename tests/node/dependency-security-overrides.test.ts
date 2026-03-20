import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

describe("dependency security override contract", () => {
  it("pins patched transitive floors in package.json and pnpm-lock.yaml", () => {
    const packageJson = JSON.parse(fs.readFileSync(path.resolve("package.json"), "utf8")) as {
      pnpm?: { overrides?: Record<string, string> };
    };
    const overrides = packageJson.pnpm?.overrides ?? {};
    const lockfile = fs.readFileSync(path.resolve("pnpm-lock.yaml"), "utf8");

    assert.equal(overrides["undici@<6.24.0"], "6.24.0");
    assert.equal(overrides["file-type@<21.3.2"], "21.3.2");
    assert.equal(overrides["music-metadata@<11.12.3"], "11.12.3");

    assert.match(lockfile, /^  undici@<6\.24\.0: 6\.24\.0$/m);
    assert.match(lockfile, /^  file-type@<21\.3\.2: 21\.3\.2$/m);
    assert.match(lockfile, /^  music-metadata@<11\.12\.3: 11\.12\.3$/m);

    assert.match(lockfile, /^  undici@6\.24\.0:$/m);
    assert.match(lockfile, /^  file-type@21\.3\.2:$/m);
    assert.match(lockfile, /^  music-metadata@11\.12\.3:$/m);

    assert.doesNotMatch(lockfile, /undici@6\.23\.0:/m);
    assert.doesNotMatch(lockfile, /file-type@21\.3\.1:/m);
    assert.doesNotMatch(lockfile, /music-metadata@11\.12\.1:/m);
  });
});
