import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";

test("dependency policy rejects the previously vulnerable dependency floors", () => {
  const policy = fs.readFileSync("pnpm-workspace.yaml", "utf8");
  const lock = fs.readFileSync("pnpm-lock.yaml", "utf8");
  assert.match(policy, /engineStrict: true/);
  assert.doesNotMatch(policy, /blockExoticSubdeps: false|trustLockfile: true/);
  for (const spec of ["undici@6.24.0", "protobufjs@6.8.8", "protobufjs@7.5.4", "axios@1.13.5", "ws@8.19.0", "sharp@0.34.5", "vitest@2.1.9"]) {
    assert.ok(!lock.includes(spec + ":"), "Vulnerable version remains: " + spec);
  }
  assert.match(policy, /'@whiskeysockets\/baileys>libsignal': '6.0.0'/);
  assert.doesNotMatch(lock, /codeload\.github\.com\/whiskeysockets\/libsignal-node/);
});
