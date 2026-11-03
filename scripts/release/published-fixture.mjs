// Fixed historical input for hosted upgrade/rollback tests, not update discovery.
export async function loadRollbackFixture(release) {
  const baseUrl = 'https://github.com/openassistuk/openassist/releases/download/v0.2.0-rc.1';
  const [bytes, signature] = await Promise.all([
    release.download(`${baseUrl}/release.json`, 1024 * 1024, 30_000),
    release.download(`${baseUrl}/release.sig`, 8192, 30_000)
  ]);
  const manifest = release.verifyManifest(bytes, signature, release.trustedReleaseKeys());
  if (manifest.build.version !== '0.2.0-rc.1' || manifest.channel !== 'preview') {
    throw new Error('Published rollback fixture identity mismatch.');
  }
  return { manifest, baseUrl };
}
