# Release maintenance

Release archive validation resolves link chains against the complete entry list before extraction, rejecting escapes, cycles and excessive chains while retaining internal production-dependency symlinks and direct regular-file hardlinks. Hardlinks to symlinks or other aliases are rejected. Native artifact/lifecycle gates verify relocation and candidate identity while the previous installation record is still committed. Packaged bootstrap owns only its recorded shell PATH blocks; uninstall preserves modified or unrecognized profile content.

Packaged installations support Linux glibc and macOS on x64 and arm64. Artifacts contain the compiled CLI/daemon, production dependencies, local docs, service templates and Node 24.21.0. Normal operators do not need Git, pnpm or system Node. Source builds retain the pinned development toolchain.

## Publication prerequisites

OpenAssist packages are signed with RSA/SHA-256 and verified against the public key in `release-public.pem`. Operators do not need a signing key. Signature or checksum failures stop installation; an unavailable release never falls back to main or an unsigned download. Explicit `--source --ref main` remains available.

Production signing is restricted to the protected `release` environment and approved publication jobs. PR jobs never receive signing credentials. Key rotation requires a reviewed trust-anchor update and a bridge release trusted by existing clients before retiring the old public key. Private operational details are not part of the public documentation.

The release environment requires explicit maintainer approval and permits approved release tags only.

The HTTPS shell entrypoint is the initial trust boundary. Bootstrap downloads the pinned public key from the reviewed main entrypoint, authenticates the release index using OpenSSL, then verifies the separately compressed private Node runtime, standalone verifier and application archive. The authenticated verifier checks the entire archive and link topology before extraction, using the same bounded tar validator as installed updates. Bootstrap requires curl, gzip and OpenSSL. Installed clients verify signed JSON manifests using Node crypto. Never bypass verification to repair an unavailable release.

## Build and publish

On each native target, install the pinned toolchain, run `pnpm verify:all`, then `node scripts/release/package.mjs coverage/release`. Packaging refuses an existing stage and produces the artifact plus commit/hash metadata. Run `node scripts/release/smoke.mjs coverage/release/stage-<platform>-<arch>` to verify relocated startup without system Node, Git or pnpm in PATH.

The `Release Artifacts` workflow runs on PRs and manual dispatch. Publication is manual, requires an existing version tag matching `package.json`, waits for all four builds, portable media/SQLite checks, live Linux service activation and the signing contract job, and uses the protected environment. All artifacts must have the same immutable commit. Stable releases are the normal target; previews require explicit selection.

Each publication requires reviewed notes at `docs/releases/<tag>.md`; the workflow uses that file as the GitHub release body. For this candidate, root/CLI/daemon package versions are `0.2.0-rc.1` and the notes are [v0.2.0-rc.1](../releases/v0.2.0-rc.1.md). After the preparation PR is reviewed and merged, tag that exact reviewed main commit without moving an existing tag. Dispatch `release.yml` **from the tag**, with `tag=v0.2.0-rc.1`, `channel=preview`, and `publish=true`, so the environment's tag restriction applies. A maintainer must approve the waiting publish job.

After publication, the workflow's `public-install` matrix runs on all four supported targets. It uses the public main installer and downloaded signed assets, tests both channel and exact-version selection, checks installed CLI/daemon versions, inspects update plans, and uninstalls while retaining config/env files. It uses temporary homes, installs no service and receives no signing secret. These jobs are skipped when publication is skipped. A failure leaves the preview published for investigation; it must not be presented as validated. The pre-publication artifact/service gates separately exercise daemon health, state, update and rollback.

To verify an existing publication without rebuilding, signing or uploading anything, dispatch `release.yml` with its `tag`, matching `channel`, and `verify_published=true`. This mode takes precedence over `publish`, skips packaging/signing/publication and runs only the four public-installer checks. The checks use the script from the dispatched revision so reviewed diagnostic fixes can test immutable published assets. Download failures report the stage and bounded, unauthenticated endpoint status/rate-limit headers; they never bypass signatures or make a failed check pass.

Only after these checks pass should the README, quickstart, platform-guide and docs-index availability notices change from pending to published. Record additional real setup/provider/channel testing separately. The unqualified stable installer remains unavailable until stable publication; never mark the preview as latest stable to work around that distinction.

The signing contract job downloads all four artifacts and runs `scripts/release/test-signing.mjs`. It generates an ephemeral RSA key outside the checkout, exercises the production signing script, verifies both signed formats with OpenSSL and the JSON manifest with the packaged Node client, and proves the production trust anchor rejects its test signature. Test private keys are never uploaded or used for publication. The supplemental scheduled/manual service and lifecycle workflows also exercise packaged artifacts while retaining source-bootstrap coverage.

Before publication, reconcile the exact commit, dependency audits, coverage, Linux/macOS lifecycle evidence and changelog. Publish a preview first and validate fresh installation and release/source transitions on test hosts before stable. A merged PR or Windows quality run is not live operator-platform certification.

## State and recovery

Managed applications live under `~/.local/share/openassist/install/releases`; `current` selects a version. Install-state version 2 records method, build, runtime, previous application and ownership. Lifecycle JSON version 4 distinguishes source and release readiness. Operator config/data/logs/skills/helper paths are unchanged.

Successful updates retain current and previous applications plus two recent recovery backups. Unfinished operations protect referenced files. Backups contain secrets and remain owner-only. Application rollback never silently restores a database.

See [upgrade and recovery](upgrade-and-rollback.md), [developer testing](developer-testing.md), [uninstall](uninstall.md), and [common troubleshooting](common-troubleshooting.md).
