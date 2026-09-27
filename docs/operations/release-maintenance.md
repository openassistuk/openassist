# Release maintenance

Packaged installations support Linux glibc and macOS on x64 and arm64. Artifacts contain the compiled CLI/daemon, production dependencies, local docs, service templates and Node 24.21.0. Normal operators do not need Git, pnpm or system Node. Source builds retain the pinned development toolchain.

## Publication prerequisites

`release-public.pem` is intentionally unprovisioned. Release installation fails closed until a maintainer provisions the RSA public key and publishes a signed release. An unavailable release never falls back to main or an unsigned download. Explicit `--source --ref main` remains available.

Generate and retain the private key outside the checkout. Commit only the PEM public key to `release-public.pem`; configure the private key as `OPENASSIST_RELEASE_SIGNING_KEY` in GitHub's protected `release` environment. Restrict publication to approved refs and required maintainers. PR jobs never receive this secret. Key rotation requires a reviewed trust-anchor update and a bridge release trusted by existing clients before retiring the old key.

The HTTPS shell entrypoint is the initial trust boundary. Bootstrap downloads the pinned public key from the reviewed main entrypoint, authenticates the release index using OpenSSL, then verifies the separately compressed private Node runtime, standalone verifier and application archive. The authenticated verifier checks the entire archive and link topology before extraction, using the same bounded tar validator as installed updates. Bootstrap requires curl, gzip and OpenSSL. Installed clients verify signed JSON manifests using Node crypto. Never bypass verification to repair an unavailable release.

## Build and publish

On each native target, install the pinned toolchain, run `pnpm verify:all`, then `node scripts/release/package.mjs coverage/release`. Packaging refuses an existing stage and produces the artifact plus commit/hash metadata. Run `node scripts/release/smoke.mjs coverage/release/stage-<platform>-<arch>` to verify relocated startup without system Node, Git or pnpm in PATH.

The `Release Artifacts` workflow runs on PRs and manual dispatch. Publication is manual, requires an existing version tag matching `package.json`, waits for all four builds, portable media/SQLite checks, live Linux service activation and the signing contract job, and uses the protected environment. All artifacts must have the same immutable commit. Stable releases are the normal target; previews require explicit selection.

The signing contract job downloads all four artifacts and runs `scripts/release/test-signing.mjs`. It generates an ephemeral RSA key outside the checkout, exercises the production signing script, verifies both signed formats with OpenSSL and the JSON manifest with the packaged Node client, and proves the production trust anchor rejects its test signature. Test private keys are never uploaded or used for publication. The supplemental scheduled/manual service and lifecycle workflows also exercise packaged artifacts while retaining source-bootstrap coverage.

Before publication, reconcile the exact commit, dependency audits, coverage, Linux/macOS lifecycle evidence and changelog. Publish a preview first and validate fresh installation and release/source transitions on test hosts before stable. A merged PR or Windows quality run is not live operator-platform certification.

## State and recovery

Managed applications live under `~/.local/share/openassist/install/releases`; `current` selects a version. Install-state version 2 records method, build, runtime, previous application and ownership. Lifecycle JSON version 4 distinguishes source and release readiness. Operator config/data/logs/skills/helper paths are unchanged.

Successful updates retain current and previous applications plus two recent recovery backups. Unfinished operations protect referenced files. Backups contain secrets and remain owner-only. Application rollback never silently restores a database.

See [upgrade and recovery](upgrade-and-rollback.md), [developer testing](developer-testing.md), [uninstall](uninstall.md), and [common troubleshooting](common-troubleshooting.md).
