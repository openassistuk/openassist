import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

test("systemd template avoids MDWE that can break Node/V8", () => {
  const templatePath = path.resolve(process.cwd(), "deploy/systemd/openassistd.service");
  const template = fs.readFileSync(templatePath, "utf8");

  assert.ok(template.includes("NoNewPrivileges=true"));
  assert.ok(template.includes("ProtectSystem=strict"));
  assert.ok(template.includes("ReadWritePaths="));
  assert.ok(!template.includes("MemoryDenyWriteExecute=true"));
});
