# Prepare stable 0.2.4


This living ExecPlan follows `.agents/PLANS.md`. Maintain Progress, Surprises & Discoveries, Decision Log and Outcomes & Retrospective as evidence arrives.

## Purpose / Big Picture


Prepare the merged Anthropic transport, replay and model-control improvements for packaged operators as stable `0.2.4`. A merged source fix does not update installed packages. This task creates one version/changelog/release-notes PR; it does not authorize tagging, changing the protected release environment, signing or publishing. Public stable availability remains the verified immutable `v0.2.3` until a later exact-main verification, authorized tag, protected publication and four-target public-install verification succeed. The operator has deferred live Anthropic API-credit testing.

## Progress


- [x] (2026-10-16 baseline) Confirm clean main at PR #85's merge `fa0b6afc1297330ccd25ca876661da2e58e339cf`. Actual main CI `38914623498` and full CodeQL `38914624021`, both attempt 1, pass; all three platform production/full audits report zero findings. Separate scanner/review-thread queries are empty.
- [x] (2026-10-16 public state) Verify GitHub latest stable is signed `v0.2.3`, published October 10. No `v0.2.4` tag/release or open preparation PR exists. Fetch/prune, fast-forward main and create `codex/release-0.2.4`. Work as a single agent.
- [x] (2026-10-16 candidate edits) Align root/CLI/daemon versions at `0.2.4`, collect Unreleased changes under the versioned changelog, and write candidate release notes with explicit environment/replay compatibility and testing limits for review.
- [x] (2026-10-16 documentation) Reconcile PR #85's final merge/check evidence and synchronize README/AGENTS/docs index and affected release/provider/update/testing guidance while keeping public availability at `v0.2.3`.
- [x] (2026-10-16 preliminary checks) Frozen installation and workspace build pass without lockfile/dependency changes. CLI and daemon both print `0.2.4` from their built entrypoints.
- [x] (2026-10-16 local verification) Candidate commit `bd3c0a7cc6d8c1fdfb0b0ac5c8be246786730685` passes 39 focused release/version/docs contracts and `pnpm verify:all`: workflow lint, workspace build/lint/typecheck/docs truth, 600 Vitest passes/one skip, 242 Node passes/six skips, unchanged coverage gates and zero fresh production/full audit findings. Final diff review confirms only intended release metadata/docs changes and no secrets, runtime edits or publication operations.
- [ ] Open/attach the preparation PR and record its actual final-head hosted checks plus separate scanner/review-thread results in the PR validation record. Preserve required main review; no merge is part of this preparation request.
- [ ] Later release work, outside this task: merge the reviewed preparation, verify that exact main commit, obtain exact-tag authorization and protected publication approval, build/sign/publish, independently verify signatures/digests, verify public stable/exact installation on all four targets, and then update availability docs.

## Surprises & Discoveries


Published `v0.2.3` contains Anthropic SDK `0.131.0`; merged source now uses `0.135.0`. PR #85 adds API-safe tool identifiers, complete bounded/scoped replay, safe continuation after round limits/interruption, Haiku 5.5 controls and explicit SDK diagnostic/credential isolation. PR #84 also updates OpenAI SDK `7.31.0`, cron-parser `5.10.2` and Inquirer prompts `8.7.3`. These deltas belong in the new package rather than another mutation of existing signed assets.

PR #85's Windows quality job initially exceeded the unchanged scheduler backfill test's five-second timeout, then passed a Windows-only rerun. Its actual merged-main CI passes on the first attempt. Retain the failed PR attempt separately; neither rerun success nor main checks certify a future release-preparation merge. The Anthropic plan still needs its final merge/check reconciliation.

Release version contracts require root, CLI and daemon manifests to agree and require matching notes linked from README, docs index and release maintenance. Source-clone tests read committed HEAD; commit metadata before the full gate. Public availability and source candidate version intentionally differ during preparation.

## Decision Log


Decision (2026-10-16): prepare only the version/changelog/notes PR requested by the user. Do not reuse authorization for an earlier tag as permission to publish a new version. Preserve required reviewing approval, exact-main `publication-checks`, environment reviewer protection and immutable old assets.

Decision (2026-10-16): package the existing reviewed source changes without new dependency updates, provider behavior, schema changes or privileges. Keep the Opus 5.5 recommendation, compatible saved model IDs/manual budgets, Node `24.21.0`, pnpm `12.5.1`, security floors and build permissions intact.

Decision (2026-10-16): document the intentional SDK environment-isolation change and replay rollback limits. An older adapter does not understand newly versioned wire-name metadata and retains the old dotted-tool limitation; a deliberate rollback needs compatible model/tuning and a fresh conversation or matching state backup, with current audit history retained separately. No automated rollback restores databases.

Decision (2026-10-16): no paid Anthropic calls, credential discovery, primary operator configuration changes or service operations. Existing real-SDK HTTP/SSE and database-restart fixtures are offline evidence; live account, quota, model performance and fresh provider/channel sessions remain unverified.

## Outcomes & Retrospective


Candidate metadata/notes/docs, final Anthropic merge reconciliation and local verification are complete. Both executables report `0.2.4`; frozen installation and all 39 focused contracts pass. The full gate at `bd3c0a7` passes with 600 Vitest and 242 Node tests. The preparation PR and its own exact-head hosted results remain pending. Published `v0.2.3` remains immutable at `cc29135a8cddf45e032dd235a86cf8f854a6f124`. Only a later protected and independently verified publication can make `0.2.4` available to ordinary packaged updates.

Local evidence is retained under ignored `coverage/release-0.2.4-build.log`, `release-0.2.4-focused.log` and `release-0.2.4-verify.log`. Vitest coverage is statements 83.39%, branches 74.77%, functions 86.02%, lines 84.37%. Node product-code coverage is statements/lines 80.15%, branches 73.60%, functions 86.07%; its scoped run passes 126 tests with five existing skips. The normal suites retain one Vitest/six Node skips for existing platform/hosted limits. All dependency-audit categories are zero; thresholds/scope, lockfile and build permissions are unchanged.

## Context and Orientation


Release versions live in `package.json`, `apps/openassist-cli/package.json` and `apps/openassistd/package.json`; individual library versions are separate. `CHANGELOG.md` groups included behavioral changes. `.github/workflows/release.yml` reads `docs/releases/<tag>.md` for the public release body and builds Linux glibc/macOS x64/arm64 packages. It uses ephemeral keys for PR signing contracts and the protected environment only for production signing. `scripts/release/check-publication-checks.mjs` checks the latest CI/full CodeQL jobs for the exact tagged main commit. `tests/node/cli-docs-truth.test.ts` validates version/notes/command/workflow documentation. The existing Anthropic plan records the implementation and its regression evidence.

## Plan of Work


First bump only the three release manifests to `0.2.4`, move the October 16 Unreleased entries under a dated candidate section, and add `docs/releases/v0.2.4.md`. Notes explain native tool-name translation, complete/incomplete replay, cutoff continuation, SDK diagnostic/header controls, Haiku tuning and included routine dependencies. State that the candidate is not yet published; label future installer/update examples as usable only after publication.

Next reconcile PR #85's actual final PR/main results in `docs/execplans/anthropic-integration-2026-10-16.md`. Link new notes/evidence from root and affected operator/provider/testing documentation while retaining all current `v0.2.3` availability commands. Explain saved-model preservation, explicit Haiku/manual-setting changes, output limits, changed ambient SDK handling and rollback compatibility. Do not alter the existing workflow, signing trust anchor or environment rules.

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

Both executables must print `0.2.4`; focused contracts and the unchanged full gate must pass. After local completion, push the branch and create the preparation PR with concrete validation and publication limits. Later publication, outside this task, must use the reviewed preparation merge's exact tag with `channel=stable`; do not dispatch from an unrelated main revision.

## Validation and Acceptance


All three release manifests agree with `docs/releases/v0.2.4.md` and the versioned changelog. Candidate docs clearly distinguish `0.2.4` from public stable `0.2.3`. Frozen installation, executable-version/doc truth, full quality/coverage and zero dependency-audit findings pass. Current-head hosted Linux/macOS/Windows quality, actual CodeQL analysis, live macOS, four native packages and ephemeral signing contracts pass; production publication jobs are expected PR skips. Open scanner alerts and unresolved review threads are checked separately. Live Anthropic certification, tagging and publication remain pending and unclaimed.

## Idempotence and Recovery


Preparation changes only release metadata and documentation on a branch and can be reverted normally. Do not modify operator credentials/config/databases/services, old tags/assets, signed indexes, trust anchors or environment authorization. Never lower coverage thresholds, suppress scanner alerts or bypass required reviews. A failed publication can leave assets public; future work must inspect actual state before deciding whether a verification-only retry is appropriate.

## Artifacts and Notes


Baseline main: `fa0b6afc1297330ccd25ca876661da2e58e339cf`. [CI 38914623498](https://github.com/openassistuk/openassist/actions/runs/38914623498) and [full CodeQL 38914624021](https://github.com/openassistuk/openassist/actions/runs/38914624021) both pass, attempt 1. Previous signed stable [v0.2.3](https://github.com/openassistuk/openassist/releases/tag/v0.2.3) was published October 10 with sixteen immutable assets. These facts are a baseline, not `0.2.4` release certification.

## Interfaces and Dependencies


No new production dependency, command, model setting, runtime contract, schema migration or channel behavior is introduced by preparation. Keep all current provider/runtime/security contracts and signing/publication gates. The candidate collects already merged Anthropic SDK `0.135.0`, OpenAI SDK `7.31.0`, cron-parser `5.10.2` and Inquirer prompts `8.7.3` using the existing lockfile.

Revision note (2026-10-16): initialize preparation from exact merged-main health and actual public stable state. Bound authorization to the requested branch/PR; separate later exact-tag/protected publication and the operator's deferred paid testing.

Revision note (2026-10-16 local verification): record candidate commit `bd3c0a7`, aligned executable versions, frozen installation, 39 focused contracts and the unchanged full quality/coverage/audit gate. Keep current-head hosted checks in the preparation PR validation record; required review, exact-main tagging and publication remain separate.
