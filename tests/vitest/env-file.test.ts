import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  enforceEnvFileSecurity,
  loadEnvFile,
  mergeEnv,
  parseEnvFileContent,
  saveEnvFile,
  upsertEnvFile,
  writeEnvTemplateIfMissing
} from "../../apps/openassist-cli/src/lib/env-file.js";

function tempFile(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  return path.join(dir, ".env");
}

describe("env-file helpers", () => {
  it("parses simple env content", () => {
    const parsed = parseEnvFileContent(
      ["# comment", "FOO=bar", "QUOTED=\"value with spaces\"", "EMPTY=", ""].join("\n")
    );
    expect(parsed).toEqual({
      FOO: "bar",
      QUOTED: "value with spaces",
      EMPTY: ""
    });
  });

  it("merges updates and supports deletion", () => {
    const merged = mergeEnv(
      { A: "1", B: "2" },
      { B: "3", C: "4", A: undefined }
    );
    expect(merged).toEqual({
      B: "3",
      C: "4"
    });
  });

  it("writes and updates env file", () => {
    const filePath = tempFile("openassist-env-");
    saveEnvFile(filePath, { ALPHA: "one", BRAVO: "two words" });
    expect(() => enforceEnvFileSecurity(filePath)).not.toThrow();
    const loaded = loadEnvFile(filePath);
    expect(loaded).toEqual({
      ALPHA: "one",
      BRAVO: "two words"
    });

    const updated = upsertEnvFile(filePath, { BRAVO: undefined, CHARLIE: "3" });
    expect(updated).toEqual({
      ALPHA: "one",
      CHARLIE: "3"
    });

    const missingPath = path.join(path.dirname(filePath), "missing.env");
    expect(() => enforceEnvFileSecurity(missingPath, { allowMissing: true })).not.toThrow();
  });

  it("writes env template only when missing", () => {
    const filePath = tempFile("openassist-env-template-");
    writeEnvTemplateIfMissing(filePath);
    const first = fs.readFileSync(filePath, "utf8");
    expect(first).toContain("# OpenAssist runtime environment");
    expect(first).toContain("OPENASSIST_SECRET_KEY=base64:<32-byte-key-base64>");

    writeEnvTemplateIfMissing(filePath);
    const second = fs.readFileSync(filePath, "utf8");
    expect(second).toBe(first);
  });

  it("handles missing env files and optional chmod path", () => {
    const filePath = tempFile("openassist-env-missing-");
    fs.rmSync(filePath, { force: true });
    expect(loadEnvFile(filePath)).toEqual({});

    if (path.sep === "\\") {
      saveEnvFile(filePath, { ZULU: "value with # hash" }, { ensureMode600: false });
      const loaded = loadEnvFile(filePath);
      expect(loaded).toEqual({
        ZULU: "value with # hash"
      });
      return;
    }

    expect(() => saveEnvFile(filePath, { ZULU: "value with # hash" }, { ensureMode600: false })).toThrow(
      /Insecure permissions/
    );
  });
});
