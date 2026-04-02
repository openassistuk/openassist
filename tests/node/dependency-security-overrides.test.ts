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
    assert.equal(overrides["brace-expansion@>=5.0.0 <5.0.5"], "5.0.5");
    assert.equal(overrides["lodash@<4.18.1"], "4.18.1");
    assert.equal(overrides["picomatch@<2.3.2"], "2.3.2");

    assert.match(lockfile, /^  undici@<6\.24\.0: 6\.24\.0$/m);
    assert.match(lockfile, /^  file-type@<21\.3\.2: 21\.3\.2$/m);
    assert.match(lockfile, /^  music-metadata@<11\.12\.3: 11\.12\.3$/m);
    assert.match(lockfile, /^  brace-expansion@>=5\.0\.0 <5\.0\.5: 5\.0\.5$/m);
    assert.match(lockfile, /^  lodash@<4\.18\.1: 4\.18\.1$/m);
    assert.match(lockfile, /^  picomatch@<2\.3\.2: 2\.3\.2$/m);

    assert.match(lockfile, /^  undici@6\.24\.0:$/m);
    assert.match(lockfile, /^  file-type@21\.3\.2:$/m);
    assert.match(lockfile, /^  music-metadata@11\.12\.3:$/m);
    assert.match(lockfile, /^  brace-expansion@5\.0\.5:$/m);
    assert.match(lockfile, /^  lodash@4\.18\.1:$/m);
    assert.match(lockfile, /^  picomatch@2\.3\.2:$/m);

    assert.doesNotMatch(lockfile, /undici@6\.23\.0:/m);
    assert.doesNotMatch(lockfile, /file-type@21\.3\.1:/m);
    assert.doesNotMatch(lockfile, /music-metadata@11\.12\.1:/m);
    assert.doesNotMatch(lockfile, /brace-expansion@5\.0\.3:/m);
    assert.doesNotMatch(lockfile, /lodash@4\.17\.23:/m);
    assert.doesNotMatch(lockfile, /lodash@4\.18\.0:/m);
    assert.doesNotMatch(lockfile, /picomatch@2\.3\.1:/m);
  });
});
