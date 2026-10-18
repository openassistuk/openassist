# Release stable 0.2.4


This living ExecPlan follows `.agents/PLANS.md`. Maintain Progress, Surprises & Discoveries, Decision Log and Outcomes & Retrospective as evidence arrives.

## Purpose / Big Picture


Deliver the merged Anthropic transport, replay and model-control improvements to packaged operators as stable `0.2.4`. A merged source fix does not update installed packages. The initial task prepared PR #86 only; after merging it, the maintainer explicitly asks to continue the v0.2.4 release. That continuation authorizes the verified preparation merge's exact tag, narrowly scoped environment authorization, normal protected approval, signing/publication and public verification. Public stable is now verified v0.2.4; availability documentation was reconciled in reviewed PR #87. Live Anthropic API-credit testing remains deferred.

## Progress


- [x] (2026-10-16 baseline) Confirm clean main at PR #85's merge `fa0b6afc1297330ccd25ca876661da2e58e339cf`. Actual main CI `38914623498` and full CodeQL `38914624021`, both attempt 1, pass; all three platform production/full audits report zero findings. Separate scanner/review-thread queries are empty.
- [x] (2026-10-16 public state) Verify GitHub latest stable is signed `v0.2.3`, published October 10. No `v0.2.4` tag/release or open preparation PR exists. Fetch/prune, fast-forward main and create `codex/release-0.2.4`. Work as a single agent.
- [x] (2026-10-16 candidate edits) Align root/CLI/daemon versions at `0.2.4`, collect Unreleased changes under the versioned changelog, and write candidate release notes with explicit environment/replay compatibility and testing limits for review.
- [x] (2026-10-16 documentation) Reconcile PR #85's final merge/check evidence and synchronize README/AGENTS/docs index and affected release/provider/update/testing guidance while keeping public availability at `v0.2.3`.
- [x] (2026-10-16 preliminary checks) Frozen installation and workspace build pass without lockfile/dependency changes. CLI and daemon both print `0.2.4` from their built entrypoints.
- [x] (2026-10-16 local verification) Candidate commit `bd3c0a7cc6d8c1fdfb0b0ac5c8be246786730685` passes 39 focused release/version/docs contracts and `pnpm verify:all`: workflow lint, workspace build/lint/typecheck/docs truth, 600 Vitest passes/one skip, 242 Node passes/six skips, unchanged coverage gates and zero fresh production/full audit findings. Final diff review confirms only intended release metadata/docs changes and no secrets, runtime edits or publication operations.
- [x] (2026-10-16 preparation PR) Open and attach PR #86. Final head `739141891f9a514327c9e02e21256d9748c283db` passes thirteen checks, all attempt 1: CI `38918622053`, CodeQL `38918622090`, macOS `38918622039` and artifacts/signing `38918622035`. Separate scanners/review threads are empty; the independent read-only review finds no actionable issues.
- [x] (2026-10-16 maintainer merge) PR #86 merges at 15:00:15 UTC as `78b3e40c2eeed2d921232060efd47b41935b57dc`, whose tree matches the reviewed PR head exactly. Sync local main, remove the proven merged branch and confirm root/CLI/daemon versions `0.2.4`.
- [x] (2026-10-16 exact-main checks) CI `38920363680` and full CodeQL `38920363551`, both attempt 1, pass for `78b3e40`. All three platform logs report zero production/full audits; separate open scanner alerts and review threads remain zero. The maintainer requests release continuation for v0.2.4.
- [x] (2026-10-16 tag/authorization) Create annotated tag object `cf3ffe3fff2c403b8b5c4d0d9e99448f6d70531f`, resolving to preparation merge `78b3e40c2eeed2d921232060efd47b41935b57dc`. The actual publication prerequisite passes locally for latest main CI/CodeQL. Add only exact `v0.2.4` environment policy `63287252`; compare before/after reviewers, protection rules and all five older tag entries unchanged.
- [x] (2026-10-16 dispatch) Start stable publication from `v0.2.4`, run `38921925528`, with matching tag input, `channel=stable`, `publish=true` and verification-only mode off. Existing tags/assets remain untouched.
- [x] (2026-10-16 protected approval) Run `38921925528`, attempt 2, passes all four native packages, exact-main prerequisite and ephemeral signing contract. The retained Linux candidate gate passes 598 Vitest/three skips, 247 Node/one skip, unchanged coverage and zero audits. Recheck latest exact-main CI/CodeQL, then submit the existing authorized reviewer approval for deployment `7122978957` at v0.2.4/`78b3e40`; no bypass or reviewer change is used.
- [x] (2026-10-16 publication) Run `38921925528`, attempt 2, signs and publishes stable v0.2.4 at 15:34:48 UTC from exact main/tag `78b3e40`, with sixteen uploaded assets and latest-stable selection. The original cancelled attempt never signed/published; no public asset is replaced.
- [x] (2026-10-16 independent verification) Verify both production RSA/SHA-256 metadata signatures against pinned `release-public.pem`; all sixteen GitHub asset digests match downloaded metadata or signed indexes/manifests. Confirm stable version, exact commit, private Node 24.21.0, database version 1 and managed-one-shots-v1. Compare all sixteen older v0.2.3 assets and its tag unchanged.
- [x] (2026-10-16 public verification) The same publication run finishes successfully with Linux/macOS x64/arm64 all passing public stable/exact installation, versions, update planning and data-preserving uninstall. No public verification retry or skipped target is needed.
- [x] (2026-10-16 availability edits) Reconcile README, contributor rules, docs index, install/quickstart/update/provider guidance, release notes, changelog and security/testing evidence on `codex/release-0.2.4-availability`, only after public verification. Preserve actual release target and deferred live testing.
- [x] (2026-10-16 availability preflight) All eleven focused docs-truth tests pass. Manually inspect availability prose, installed command flags, release facts and the final diff; correct the remaining stale release-maintenance version and distinguish historical candidate acceptance from completed publication.
- [x] (2026-10-18 retrospective reconciliation) Availability PR #87 final head `e816ba0c9a588a917eed11fd30f0710eb29854e1` merged on October 16 at 16:09:32 UTC as `b03c40b0cce1990e3e7ae071093febf0f310d5db` after thirteen applicable hosted checks passed, with three expected publication skips. Actual-main CI `38929715925` and full CodeQL `38929715898` pass on attempt 1. PR review threads and merge-ref open alerts are empty. The earlier eleven focused local docs checks remain recorded; do not infer additional historical local runs from hosted success.
- [x] (2026-10-16 release description) Refresh the GitHub description with the already reviewed behavior notes plus verified publication facts. Compare all sixteen asset IDs/names/sizes/digests/states unchanged and the exact tag still at `78b3e40`; the body matches the reconciled notes. This reversible metadata correction does not bypass the separate source-documentation review.

## Surprises & Discoveries


Published `v0.2.3` contains Anthropic SDK `0.131.0`; merged source now uses `0.135.0`. PR #85 adds API-safe tool identifiers, complete bounded/scoped replay, safe continuation after round limits/interruption, Haiku 5.5 controls and explicit SDK diagnostic/credential isolation. PR #84 also updates OpenAI SDK `7.31.0`, cron-parser `5.10.2` and Inquirer prompts `8.7.3`. These deltas belong in the new package rather than another mutation of existing signed assets.

PR #85's Windows quality job initially exceeded the unchanged scheduler backfill test's five-second timeout, then passed a Windows-only rerun. Its actual merged-main CI passes on the first attempt. Retain the failed PR attempt separately; neither rerun success nor main checks certify a future release-preparation merge. Preparation PR #86 reconciles that implementation's actual final merge/check evidence.

Release version contracts require root, CLI and daemon manifests to agree and require matching notes linked from README, docs index and release maintenance. Source-clone tests read committed HEAD; commit metadata before the full gate. Public availability and source candidate version intentionally differ during preparation.

Publication attempt 1 completes the exact-commit prerequisite, Linux ARM/x64 and Intel macOS packages, including the full Linux candidate gate with zero audits. Apple Silicon remains in Node setup for over eleven minutes and does not respond promptly to normal cancellation. Stop that build attempt before any signing/publication, wait for terminal cancellation, then request a rerun of unfinished jobs at the same immutable tag. Retain the successful artifacts/candidate evidence and cancelled attempt separately; no production asset exists or is replaced by this retry.

## Decision Log


Decision (2026-10-16): prepare only the version/changelog/notes PR requested by the user. Do not reuse authorization for an earlier tag as permission to publish a new version. Preserve required reviewing approval, exact-main `publication-checks`, environment reviewer protection and immutable old assets.

Decision (2026-10-16 release continuation): the maintainer's new instruction after merging PR #86 extends authorization to releasing v0.2.4 from its verified main `78b3e40`. Create only that exact tag and allowlist entry, use the existing protected reviewer approval rather than bypassing it, and retain actual native/public results. Later documentation commits must not become the release tag target. This does not authorize paid provider testing or relaxing repository/environment protections.

Decision (2026-10-16 infrastructure retry): after the Apple Silicon Node-setup stall and unresponsive normal cancellation, force-stop the unsigned attempt and rerun its unfinished jobs only once. Keep run `38921925528`, tag/commit, successful artifacts and all protections unchanged. The original attempt is cancelled before signing/publication; subsequent approval still requires every prerequisite to pass.

Decision (2026-10-16 published description): after all public checks and independent signature/digest verification pass, correct the new release's preparation wording using its already reviewed behavioral notes and actual publication facts. Keep asset identities/digests and tags unchanged. The release-continuation authorization covers this reversible metadata correction; source availability docs retain their normal required PR review. Do not leave the public description incorrectly claiming the verified release is unpublished while that review proceeds.

Decision (2026-10-16): package the existing reviewed source changes without new dependency updates, provider behavior, schema changes or privileges. Keep the Opus 5.5 recommendation, compatible saved model IDs/manual budgets, Node `24.21.0`, pnpm `12.5.1`, security floors and build permissions intact.

Decision (2026-10-16): document the intentional SDK environment-isolation change and replay rollback limits. An older adapter does not understand newly versioned wire-name metadata and retains the old dotted-tool limitation; a deliberate rollback needs compatible model/tuning and a fresh conversation or matching state backup, with current audit history retained separately. No automated rollback restores databases.

Decision (2026-10-16): no paid Anthropic calls, credential discovery, primary operator configuration changes or service operations. Existing real-SDK HTTP/SSE and database-restart fixtures are offline evidence; live account, quota, model performance and fresh provider/channel sessions remain unverified.

## Outcomes & Retrospective


Stable v0.2.4 is published at 2026-10-16 15:34:48 UTC with sixteen immutable assets from reviewed preparation merge `78b3e40`, and GitHub latest stable selects it. Exact-main CI/full CodeQL, native candidate quality/zero audits, four packages, signing contracts, normal protected approval and production signing pass. Both signatures and all sixteen asset digests independently verify. Publication run `38921925528`, attempt 2, finishes successfully across all four public stable/exact installation/uninstall targets. Preserve attempt 1's cancelled unresponsive Apple Silicon setup separately; no production signing/publication happened before retry and no asset was replaced.

Only exact v0.2.4 was added to the release environment's tag allowlist; all reviewer/protection rules and older entries remain unchanged. v0.2.3's sixteen assets/tag are unchanged. Availability edits passed eleven focused local docs checks; reviewed [PR #87](https://github.com/openassistuk/openassist/pull/87) subsequently merged as `b03c40b` after all thirteen applicable checks passed: CI `38927105232`, CodeQL `38927105193`, macOS live `38927105218` and native/signing contracts `38927105180`, with three expected publication skips. Independent actual-main [CI 38929715925](https://github.com/openassistuk/openassist/actions/runs/38929715925) and [full CodeQL 38929715898](https://github.com/openassistuk/openassist/actions/runs/38929715898) pass on attempt 1. Separate PR threads and merge-ref open alerts are empty. This retrospective reconciliation does not invent missing historical local logs or change the immutable publication target. The GitHub description now matches the reconciled notes, with all sixteen asset identities/digests and the tag unchanged. Paid/live Anthropic testing remains deferred and is not certified by artifact/public installation checks.

Local evidence is retained under ignored `coverage/release-0.2.4-build.log`, `release-0.2.4-focused.log` and `release-0.2.4-verify.log`. Vitest coverage is statements 83.39%, branches 74.77%, functions 86.02%, lines 84.37%. Node product-code coverage is statements/lines 80.15%, branches 73.60%, functions 86.07%; its scoped run passes 126 tests with five existing skips. The normal suites retain one Vitest/six Node skips for existing platform/hosted limits. All dependency-audit categories are zero; thresholds/scope, lockfile and build permissions are unchanged.

## Context and Orientation


Release versions live in `package.json`, `apps/openassist-cli/package.json` and `apps/openassistd/package.json`; individual library versions are separate. `CHANGELOG.md` groups included behavioral changes. `.github/workflows/release.yml` reads `docs/releases/<tag>.md` for the public release body and builds Linux glibc/macOS x64/arm64 packages. It uses ephemeral keys for PR signing contracts and the protected environment only for production signing. `scripts/release/check-publication-checks.mjs` checks the latest CI/full CodeQL jobs for the exact tagged main commit. `tests/node/cli-docs-truth.test.ts` validates version/notes/command/workflow documentation. The existing Anthropic plan records the implementation and its regression evidence.

## Plan of Work


First bump only the three release manifests to `0.2.4`, move the October 16 Unreleased entries under a dated candidate section, and add `docs/releases/v0.2.4.md`. Notes explain native tool-name translation, complete/incomplete replay, cutoff continuation, SDK diagnostic/header controls, Haiku tuning and included routine dependencies. State that the candidate is not yet published; label future installer/update examples as usable only after publication.

Next reconcile PR #85's actual final PR/main results in `docs/execplans/anthropic-integration-2026-10-16.md`. Link new notes/evidence from root and affected operator/provider/testing documentation while retaining all current `v0.2.3` availability commands. Explain saved-model preservation, explicit Haiku/manual-setting changes, output limits, changed ambient SDK handling and rollback compatibility. Keep workflow and signing trust unchanged; the subsequently authorized release continuation adds only the exact v0.2.4 environment tag entry, preserving its reviewers and all older entries.

Then commit the candidate, run frozen installation and existing executable/version/release contracts, followed by `pnpm verify:all`. Record exact test/coverage/audit results and inspect the complete patch. Open one PR on `codex/release-0.2.4` and attach it to this chat. Wait for all current-head CI/CodeQL/macOS/artifact/signing jobs to become terminal; inspect failures rather than assuming prior green results apply. Record hosted evidence in the PR body to avoid repeated evidence-only pushes.

## Concrete Steps


Run from the OpenAssist repository root, the directory containing `package.json`, with the repository's Node/pnpm versions. Keep logs under ignored `coverage/`; do not print credentials.

    pnpm install --frozen-lockfile
    pnpm build
    node apps/openassist-cli/dist/index.js --version
    node apps/openassistd/dist/index.js --version
    pnpm exec tsx --test tests/node/cli-docs-truth.test.ts tests/node/runtime-version.test.ts tests/node/release-publication-checks.test.ts
    pnpm verify:all
    git diff origin/main --check

Both executables must print `0.2.4`; focused contracts and the unchanged full gate must pass. The preparation PR is now merged and independently verified on main. The maintainer-authorized release continuation uses only that exact merge:

    git tag -a v0.2.4 78b3e40c2eeed2d921232060efd47b41935b57dc -m "OpenAssist v0.2.4 Anthropic reliability patch"
    git push origin refs/tags/v0.2.4
    gh workflow run release.yml --ref v0.2.4 -f tag=v0.2.4 -f channel=stable -F publish=true

Before dispatch, validate the exact-tag publication prerequisite and add only `v0.2.4` to the release environment's tag allowlist. After native/candidate/signing prerequisites pass, inspect the pending deployment and exercise its existing reviewer approval. Record actual run/attempt/head, publication time, signatures/digests and all public targets. Do not dispatch from a later availability-doc revision.

## Validation and Acceptance


All three release manifests agree with `docs/releases/v0.2.4.md` and the versioned changelog. During preparation, candidate docs distinguished `0.2.4` from then-public stable `0.2.3`; frozen installation, executable-version/doc truth, full quality/coverage and zero dependency-audit findings passed. The reviewed preparation merge now passes its own exact-main CI/full CodeQL, protected publication, independent production signatures/digests and all four public-install targets. Availability docs must pass their own local full gate and exact-head hosted Linux/macOS/Windows quality, CodeQL, live macOS, native packages and ephemeral signing checks; production publication jobs are expected PR skips. Check open scanner alerts and unresolved review threads separately and retain required main review. Live Anthropic certification remains deferred.

## Idempotence and Recovery


Preparation changes only release metadata and documentation on a branch and can be reverted normally. Release continuation may create only the new exact v0.2.4 tag/allowlist and its signed publication; do not modify operator credentials/config/databases/services, old tags/assets, trust anchors or existing environment reviewer rules. Never lower coverage thresholds, suppress scanner alerts or bypass required reviews. A failed publication can leave assets public; inspect actual state before deciding whether a verification-only retry is appropriate.

## Artifacts and Notes


Baseline main: `fa0b6afc1297330ccd25ca876661da2e58e339cf`. [CI 38914623498](https://github.com/openassistuk/openassist/actions/runs/38914623498) and [full CodeQL 38914624021](https://github.com/openassistuk/openassist/actions/runs/38914624021) both pass, attempt 1. Previous signed stable [v0.2.3](https://github.com/openassistuk/openassist/releases/tag/v0.2.3) was published October 10 with sixteen immutable assets. These facts are a baseline, not `0.2.4` release certification.

## Interfaces and Dependencies


No new production dependency, command, model setting, runtime contract, schema migration or channel behavior is introduced by preparation. Keep all current provider/runtime/security contracts and signing/publication gates. The candidate collects already merged Anthropic SDK `0.135.0`, OpenAI SDK `7.31.0`, cron-parser `5.10.2` and Inquirer prompts `8.7.3` using the existing lockfile.

Revision note (2026-10-16): initialize preparation from exact merged-main health and actual public stable state. Bound authorization to the requested branch/PR; separate later exact-tag/protected publication and the operator's deferred paid testing.

Revision note (2026-10-16 local verification): record candidate commit `bd3c0a7`, aligned executable versions, frozen installation, 39 focused contracts and the unchanged full quality/coverage/audit gate. Keep current-head hosted checks in the preparation PR validation record; required review, exact-main tagging and publication remain separate.

Revision note (2026-10-16 release continuation): record PR #86's successful final checks/review and actual maintainer merge, its independent first-attempt main CI/full CodeQL/zero audits, completed branch cleanup and the user's new release authorization. Extend the plan through protected publication/public verification while retaining deferred live API-credit testing and required documentation review.

Revision note (2026-10-16 release dispatch): record the verified exact annotated tag, narrow allowlist entry with unchanged reviewers/older policies, read-only publication preflight and stable run `38921925528`. Leave all signing, publication and public verification conclusions pending until actual results arrive.

Revision note (2026-10-16 protected approval): preserve cancelled attempt 1's unresponsive Apple Silicon setup separately from the successful unfinished-job retry. Record all four packages/candidate/signing prerequisites, zero candidate audits, fresh exact-main recheck and normal protected approval for deployment `7122978957`. Production publication/public results remain pending.

Revision note (2026-10-16 publication and public verification): record actual publication time/commit/assets, independent production signatures/digests, all four successful public targets and unchanged older assets/tag. Reconcile availability only after these results; retain the separate documentation PR review and correct the new release description's factual preparation wording within authorized release bookkeeping.

Revision note (2026-10-18): close the stale availability follow-up using PR #87's actual merge and exact PR/main hosted checks. Preserve original release target, cancelled publication attempt and public verification; distinguish known focused local evidence from later hosted results.
