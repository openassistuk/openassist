import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { generateKeyPairSync, verify } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Ephemeral test keys exist only in this job. Never replace the repository trust anchor.
const artifacts = path.resolve(process.argv[2]);
const signingScript = fileURLToPath(new URL('./sign.mjs', import.meta.url));
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'openassist-signing-test-'));
try {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const publicPem = publicKey.export({ type: 'spki', format: 'pem' });
  fs.writeFileSync(path.join(temporary, 'release-public.pem'), publicPem);
  const record = JSON.parse(fs.readFileSync(path.join(artifacts, 'linux-x64.json'), 'utf8'));
  execFileSync(process.execPath, [signingScript, artifacts, record.build.version.includes('-') ? 'preview' : 'stable'], {
    cwd: temporary,
    env: { ...process.env, OPENASSIST_RELEASE_SIGNING_KEY: privateKey.export({ type: 'pkcs8', format: 'pem' }) },
    stdio: 'pipe'
  });
  const manifest = fs.readFileSync(path.join(artifacts, 'release.json'));
  const signature = fs.readFileSync(path.join(artifacts, 'release.sig'));
  assert(verify('RSA-SHA256', manifest, publicKey, signature));
  for (const [data, sig] of [['release.json', 'release.sig'], ['release-index.txt', 'release-index.sig']]) {
    execFileSync('openssl', ['dgst', '-sha256', '-verify', path.join(temporary, 'release-public.pem'), '-signature', path.join(artifacts, sig), path.join(artifacts, data)], { stdio: 'pipe' });
  }
  const node = path.join(temporary, 'node');
  fs.writeFileSync(node, gunzipSync(fs.readFileSync(path.join(artifacts, record.artifact.bootstrap.runtime.file))), { mode: 0o700 });
  const application = path.join(temporary, 'application');
  execFileSync(node, [path.join(artifacts, record.artifact.bootstrap.verifier.file), path.join(artifacts, record.artifact.file), application, record.build.version], { stdio: 'pipe' });
  const release = await import(pathToFileURL(path.join(application, 'apps/openassist-cli/dist/lib/release.js')));
  assert.equal(release.verifyManifest(manifest, signature, [publicPem]).build.id, record.build.id);
  assert.throws(() => release.verifyManifest(Buffer.concat([manifest, Buffer.from(' ')]), signature, [publicPem]), /signature/);
  // Either the production trust anchor is not provisioned yet, or it rejects the test key.
  assert.throws(() => release.verifyManifest(manifest, signature, release.trustedReleaseKeys(application)), /signature|provisioned/);
  console.log('All four artifacts signed with an ephemeral test key; Node/OpenSSL agree; production trust rejects test signatures.');
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}
