# Prepare the first installable preview

This living ExecPlan follows `.agents/PLANS.md` and builds on the merged lifecycle implementation recorded in `docs/execplans/lifecycle-modernization.md`. The new work is on `codex/first-installable-release`, based on main commit `99b513c13c47ec2fde0c0527cf698aa0f8261634`.

## Purpose / Big Picture

Give operators clear installation commands and prepare a real signed `v0.2.0-rc.1` preview for Linux/macOS x64/arm64. A preview is explicitly selected with `--channel preview`; the default stable installer remains unavailable until a stable release exists. Operators never create or supply signing keys.

## Progress

- [x] Inspected merged main, README, bootstrap, artifact/signing workflows and GitHub release configuration. No releases, tags or release environment exist; the public-key file is a placeholder.
- [x] User selected preview `v0.2.0-rc.1`. Updated the local main branch to origin/main and created a separate preparation branch.
- [x] Clarified installation docs, aligned root/CLI/daemon versions at `0.2.0-rc.1`, prepared per-tag release notes and fixed source version reporting.
- [x] Production public trust anchor prepared. The maintainer approved the protected preview rollout; private operational details are excluded from tracked documentation.
- [x] Local build, 19 focused lifecycle tests, source CLI/daemon version checks, docs-truth and full `pnpm verify:all` passed. Full verification includes 471 passing Vitest tests (one Unix-only skip), 199 passing Node tests (three platform skips), unchanged coverage gates and zero production/full audit findings. The subsequently added public-install workflow/script passed workflow lint and targeted docs/bootstrap checks (14 passed, one Bash-unavailable skip on Windows).
- [x] Candidate `489dba583308f0031ee0676188cac0b4df9757b0` in PR #64 passed all 13 hosted checks: Linux/macOS/Windows quality, four artifacts, live Linux lifecycle, macOS LaunchAgent, signing contract and CodeQL. Publication and its dependent public-installer check were intentionally skipped. Public installation cannot run until the signed release exists.
- [x] Configure approved publication controls and publish `v0.2.0-rc.1` from merged main `175de895d972a5899627979d57e6ed688424faad`. All four native packaging jobs, full publication-candidate verification and signing-contract checks passed in run `36357681467`.
- [ ] Complete four-target public-installer verification and reconcile availability documentation. Both Linux targets and macOS Intel passed; macOS ARM64 stopped on HTTP 403 in two attempts and requires download diagnostics.

## Surprises & Discoveries

The README previously began with the stable install command despite there being no published release. Its mention of requiring a signing key incorrectly read like an operator prerequisite. GitHub confirms PR #63 is merged, but an empty releases list and absent release environment mean packaging readiness is not publication readiness.

The first public-install run exposed HTTP 403 on macOS ARM64 before installation, despite passing native packaged smoke tests. A retry produced the same error. The other three public-install targets passed both channel and exact-version selection. Verification-only run `36358678271` identified GitHub's unauthenticated API rate limit: public raw entrypoints returned 200, while the release catalogue returned 403 with limit 60 and remaining 0. Bounded endpoint diagnostics and a verification-only dispatch mode allow investigation without rebuilding or altering the signed publication. Retry after the reported reset; never inject credentials into a check advertised as public unauthenticated installation.

## Decision Log

Use the user-selected `v0.2.0-rc.1` preview before stable. Keep source installation immediately usable and label future release commands accurately until publication. Keep the release candidate on a new branch rather than appending to the merged PR. Production private-key custody and protected publication remain explicit maintainer actions; never bypass the existing signature checks.

Use the existing publication workflow for a dependent four-target public-installer smoke job. It installs both channel and exact-version selections into disposable homes, checks version/update planning and data-preserving removal, and never receives signing credentials. Keep per-tag release notes under `docs/releases/` and publish those reviewed notes rather than a generic generated body. Source CLI version reporting must follow the workspace manifest after the version bump.

Use the same workflow's `verify_published` input for later checks of immutable assets. It skips packaging, signing and publication, uses the dispatched test-script revision, and retains unauthenticated downloads and mandatory signature checks. This avoids republishing to test a network diagnostic change.

## Outcomes & Retrospective

The preview is published at [v0.2.0-rc.1](https://github.com/openassistuk/openassist/releases/tag/v0.2.0-rc.1), from merged main `175de895d972a5899627979d57e6ed688424faad`. Public-installer validation is still in progress. Both published manifest/index signatures were independently downloaded and verified against the pinned public key. No stable release has been published.

The README and linked guides now distinguish install-today source builds, pending previews and future stable releases. Both commands report `0.2.0-rc.1`. Local quality and hosted native artifact checks pass. Public documentation describes package verification; private operational details remain excluded.

Candidate validation is complete at `489dba583308f0031ee0676188cac0b4df9757b0`: [CI 36356760818](https://github.com/openassistuk/openassist/actions/runs/36356760818), [Release Artifacts 36356760863](https://github.com/openassistuk/openassist/actions/runs/36356760863), [macOS live 36356760848](https://github.com/openassistuk/openassist/actions/runs/36356760848), and [CodeQL 36356760831](https://github.com/openassistuk/openassist/actions/runs/36356760831) all succeeded. Analysis `1848344498` reports zero findings/errors on the PR merge commit, and the open-alert query returns zero. The production trust anchor rejects ephemeral test signatures. Native jobs cover the Bash guard/syntax check skipped locally. Publication and `public-install` were skipped by design. This preparation is ready for review; release-environment creation, secret upload, merge/tag/publication and public installation remain pending explicit rollout approval.

## Context and Orientation

`README.md` is the operator entrypoint. `install.sh` selects the source bootstrap or release bootstrap under `scripts/install`. `release-public.pem` pins the key used to verify artifacts. `.github/workflows/release.yml` builds four native targets, runs smoke/signing checks, and publishes only through a manual dispatch with tag/channel/publish inputs. `scripts/release/package.mjs` requires root, CLI and daemon package versions to agree. `scripts/release/sign.mjs` requires the protected private key to match the pinned public key.

## Plan of Work

First rewrite the README installation section with supported platforms, an install-today source command, future preview/stable commands, setup/health guidance and existing-install migration. Synchronize the quickstart, platform guides, docs index and changelog. Next align the candidate package versions and write concrete release notes. Prepare the production public key and a narrowly restricted release environment; PR execution must never receive production signing credentials.

Run local verification and open a preparation PR for native checks. After the candidate is approved and merged, tag the reviewed commit as `v0.2.0-rc.1`, dispatch `release.yml` with channel preview, and satisfy the protected release approval. Verify signatures and metadata from public release assets and exercise fresh install on disposable supported hosts before updating availability wording. Stable publication is a later decision.

## Concrete Steps

From the repository root, run `pnpm exec tsx --test tests/node/cli-docs-truth.test.ts` after documentation edits and `pnpm verify:all` for the versioned candidate. Inspect GitHub's four artifact jobs, Linux lifecycle smoke, macOS LaunchAgent and quality/CodeQL results on the exact commit. Record the candidate tag, commit, workflow runs and public release URL separately; a passing PR publish skip is not publication.

## Validation and Acceptance

The README must let someone identify an installation command that works at the current rollout stage. Candidate artifacts must report `0.2.0-rc.1`, contain the matching public key and pass native smoke tests. Only a public preview with verified signatures and successfully exercised bootstrap counts as an installable release. Missing signing configuration or approval must be reported as an outstanding rollout step, never worked around with unsigned artifacts.

## Idempotence and Recovery

Do not overwrite an existing production key or tag. Never commit private signing material or operational notes. Reuse a failed workflow's immutable tag only if no release has been published; inspect existing assets before retrying. Never silently move a release tag. Source installs remain available throughout preparation.

## Artifacts and Notes

Initial evidence: merged PR #63 at `99b513c13c47ec2fde0c0527cf698aa0f8261634`; GitHub releases and environments both empty. The user selected the preview version explicitly.

## Interfaces and Dependencies

No new runtime dependency is needed. Use existing Node crypto, OpenSSL verification, GitHub environments/secrets and the existing release workflow. Signing credentials remain unavailable to PR jobs.

Revision 2026-09-27: Created from the user's README and first-release request, including their preview selection and request to update local main.

Revision 2026-09-27 verification: Recorded complete local/hosted candidate evidence and the two intentional publication-related skips. The evidence reconciliation is documentation-only and does not change the validated application or release workflow. Local main and origin/main both point to `99b513c13c47ec2fde0c0527cf698aa0f8261634` with no divergence.

Revision 2026-09-27 publication: The maintainer merged PR #64. The sanitized preparation commit `81d727ae9b5f346a93506ad812acb36f9385c997` passed all 13 hosted checks before merge: [CI](https://github.com/openassistuk/openassist/actions/runs/36357289471), [artifacts](https://github.com/openassistuk/openassist/actions/runs/36357289472), [CodeQL](https://github.com/openassistuk/openassist/actions/runs/36357289476), and [macOS LaunchAgent](https://github.com/openassistuk/openassist/actions/runs/36357289501). The immutable release tag points to merge commit `175de895d972a5899627979d57e6ed688424faad`; [publication run 36357681467](https://github.com/openassistuk/openassist/actions/runs/36357681467) published 16 assets at 23:15 UTC. This supersedes the earlier pending-rollout status; public installation and availability wording are being reconciled separately.
