import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

test("systemd template avoids MDWE that can break Node/V8", () => {
  const templatePath = path.resolve(process.cwd(), "deploy/systemd/openassistd.service");
  const template = fs.readFileSync(templatePath, "utf8");

  assert.ok(template.includes("Environment=OPENASSIST_SERVICE_MANAGER_KIND=__OPENASSIST_SERVICE_MANAGER_KIND__"));
  assert.ok(template.includes("Environment=OPENASSIST_SYSTEMD_FILESYSTEM_ACCESS=__OPENASSIST_SYSTEMD_FILESYSTEM_ACCESS__"));
  assert.ok(template.includes("__OPENASSIST_SYSTEMD_HARDENING__"));
  assert.ok(!template.includes("MemoryDenyWriteExecute=true"));
});
