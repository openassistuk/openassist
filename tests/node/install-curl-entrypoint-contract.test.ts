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
    assert.ok(
      script.includes("raw.githubusercontent.com/openassistuk/openassist/main/scripts/install/bootstrap.sh")
    );
    assert.match(script, /curl -fsSL/);
    assert.match(script, /exec "\$\{bootstrap_path\}" "\$@"/);
    assert.match(script, /exec <\/dev\/tty/);
  });
});
