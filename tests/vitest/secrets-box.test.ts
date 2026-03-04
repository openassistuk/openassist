import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SecretBox } from "../../packages/core-runtime/src/secrets.js";

function tempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

describe("SecretBox", () => {
  it("rejects weak env key formats", () => {
    const root = tempDir("openassist-secretbox-weak-");
    expect(
      () =>
        new SecretBox({
          dataDir: root,
          keyFromEnv: "this-is-a-passphrase"
        })
    ).toThrow(/OPENASSIST_SECRET_KEY/);
  });

  it("accepts strict base64 key material and round-trips values", () => {
    const root = tempDir("openassist-secretbox-strong-");
    const keyMaterial = Buffer.alloc(32, 7).toString("base64");
    const box = new SecretBox({
      dataDir: root,
      keyFromEnv: `base64:${keyMaterial}`
    });

    const ciphertext = box.encrypt("hello");
    expect(box.decrypt(ciphertext)).toBe("hello");
  });

  it("creates secure local key files when env key is unset", () => {
    const root = tempDir("openassist-secretbox-filekey-");
    const box = new SecretBox({ dataDir: root });
    const ciphertext = box.encrypt("value");
    expect(box.decrypt(ciphertext)).toBe("value");

    const keyPath = path.join(root, "secrets.key");
    expect(fs.existsSync(keyPath)).toBe(true);
    if (process.platform !== "win32") {
      const mode = fs.statSync(keyPath).mode & 0o777;
      expect(mode & 0o077).toBe(0);
    }
  });
});
