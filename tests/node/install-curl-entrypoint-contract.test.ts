import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

describe("curl installer entrypoint contract", () => {
  it("provides a top-level install.sh that fetches bootstrap from GitHub", () => {
    const scriptPath = path.resolve("install.sh");
    assert.equal(fs.existsSync(scriptPath), true);
    const script = fs.readFileSync(scriptPath, "utf8");

    assert.match(script, /OPENASSIST_BOOTSTRAP_URL/);
    assert.match(script, /BOOTSTRAP_REF_EXPLICIT=0/);
    assert.ok(script.includes("raw.githubusercontent.com/openassistuk/openassist/${BOOTSTRAP_REF}/scripts/install/bootstrap.sh"));
    assert.ok(script.includes("raw.githubusercontent.com/openassistuk/openassist/refs/pull/${BOOTSTRAP_PR}/head/scripts/install/bootstrap.sh"));
    assert.match(script, /--pr/);
    assert.match(script, /Use either --ref or --pr, not both/);
    assert.match(script, /curl -fsSL/);
    assert.match(script, /exec "\$\{bootstrap_path\}" "\$\{FORWARDED_ARGS\[@\]\}"/);
    assert.match(script, /exec <\/dev\/tty/);
  });
});
