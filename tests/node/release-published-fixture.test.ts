import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { test } from "node:test";
import { verifyManifest } from "../../apps/openassist-cli/src/lib/release.js";
import { loadRollbackFixture } from "../../scripts/release/published-fixture.mjs";

const { publicKey, privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const key = publicKey.export({ type: "spki", format: "pem" }).toString();
const baseUrl = "https://github.com/openassistuk/openassist/releases/download/v0.2.0-rc.1";

function fixture(version = "0.2.0-rc.1", channel = "preview") {
  const bytes = Buffer.from(JSON.stringify({
    schemaVersion: 1, channel,
    build: { id: "rollback-fixture", version, commit: "a".repeat(40), configVersion: 1, databaseVersion: 1 },
    artifacts: ["linux-x64", "linux-arm64", "darwin-x64", "darwin-arm64"].map(target => {
      const [platform, arch] = target.split("-");
      return { platform, arch, file: `${target}.tar.gz`, bytes: 100, sha256: "b".repeat(64) };
    })
  }));
  return { bytes, signature: sign("RSA-SHA256", bytes, privateKey) };
}

test("rollback fixture verifies signed fixed assets without catalogue discovery or credentials", async () => {
  const { bytes, signature } = fixture();
  const requests: { url: string; limit: number; timeout: number }[] = [];
  const result = await loadRollbackFixture({
    async download(url: string, limit: number, timeout: number) {
      requests.push({ url, limit, timeout });
      return url.endsWith("/release.json") ? bytes : signature;
    },
    verifyManifest, trustedReleaseKeys: () => [key]
  });
  assert.equal(result.baseUrl, baseUrl);
  assert.equal(result.manifest.build.version, "0.2.0-rc.1");
  assert.deepEqual(requests, [
    { url: `${baseUrl}/release.json`, limit: 1024 * 1024, timeout: 30_000 },
    { url: `${baseUrl}/release.sig`, limit: 8192, timeout: 30_000 }
  ]);
});

test("rollback fixture rejects invalid signatures, wrong identity and download failures", async () => {
  for (const scenario of ["signature", "version", "channel", "download"]) {
    const { bytes, signature } = fixture(scenario === "version" ? "0.2.5" : "0.2.0-rc.1", scenario === "channel" ? "stable" : "preview");
    await assert.rejects(loadRollbackFixture({
      async download(url: string) {
        if (scenario === "download") throw new Error("Release download failed (HTTP 403).");
        return url.endsWith("/release.json") ? bytes : scenario === "signature" ? Buffer.alloc(256) : signature;
      },
      verifyManifest, trustedReleaseKeys: () => [key]
    }), scenario === "signature" ? /signature verification failed/ : scenario === "download" ? /HTTP 403/ : /identity mismatch/);
  }
});
