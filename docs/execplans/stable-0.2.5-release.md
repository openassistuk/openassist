# Prepare stable 0.2.5


This living ExecPlan follows `.agents/PLANS.md`. Maintain Progress, Surprises & Discoveries, Decision Log and Outcomes & Retrospective as evidence arrives. The October 18 request authorizes release preparation on a branch and a reviewable PR. Tagging, protected-environment changes, production signing/publication and test-host/provider actions require later authorization.

## Purpose / Big Picture


Prepare the merged model-aware context engine and recovery fixes for packaged operators as `0.2.5`. Existing signed `v0.2.4` installations keep their shipped planner until explicitly updated. Align candidate versions, collect the release changelog, explain context/memory and rollback behavior, and reconcile all affected guides without claiming unpublished assets are available. The subsequent October 18 request extends this same PR with manual `/compact` and an automatic-compaction switch; follow [the controls plan](manual-compaction-2026-10-18.md) for implementation and fresh validation.

Success for this task is a preparation PR with synchronized root/CLI/daemon versions, reviewed release notes, current README/AGENTS/docs and passing local/hosted checks. Public stable remains verified `v0.2.4`; the new preparation merge must receive its own exact-main checks before any separately authorized release.

## Progress


- [x] (2026-10-18 baseline) Confirm clean `main` at PR #88 merge `f32a1e115d5d31e2c28fec1561cdf0c313a0e4aa`, matching freshly fetched `origin/main`. Main CI `39143902526` and full CodeQL `39143902610` pass on attempt 1; current repository open scanning alerts are empty.
- [x] (2026-10-18 public state) GitHub latest stable is `v0.2.4`, published October 16. No v0.2.5 tag/release or open preparation PR exists. Create `codex/release-0.2.5`; work as one agent.
- [x] (2026-10-18) Align candidate root/CLI/daemon versions at `0.2.5`, collect the six context entries under a dated versioned changelog and write `docs/releases/v0.2.5.md`.
- [x] (2026-10-18) Update README, AGENTS, docs index and all affected context/provider/config/channel/lifecycle/security/testing guides. Retain v0.2.4 public availability and dated historical evidence. Reconcile PR #87/#88 actual merges/checks separately from release certification.
- [x] (2026-10-18) Strengthen the existing release-doc contract for AGENTS linkage. Frozen installation/build pass with the lockfile unchanged; both executable versions print `0.2.5`. All 39 focused docs/version/publication contracts pass. Manual budget/byte bounds, CLI flags and workflow/coverage claims match their implementation sources.
- [x] (2026-10-18 local gate) Commit candidate metadata as `dca3d5977df24716f37074c9984d9d21b0d5a151` and pass full `pnpm verify:all`: workflow lint, build/lint/typecheck, 668 Vitest passes/one existing skip, 245 Node passes/six existing skips, both unchanged coverage gates and zero production/full audit findings. Scoped Node coverage passes 126 tests/five existing skips. Final review corrects three guide headings, consolidates duplicate rollback guidance and closes PR #87 local evidence from its recorded validation; rerun focused docs truth after these documentation-only edits.
- [x] (2026-10-18 delivery) Review final additions for accidental runtime changes, credential markers and misleading release claims; preserve the unchanged lockfile/gates. Push `codex/release-0.2.5`, open and attach [preparation PR #89](https://github.com/openassistuk/openassist/pull/89). Its Validation section is the living final actual-head record for local docs revalidation, CI, PR/full-branch CodeQL, native/signing/live-macOS checks, separate scanning refs and unresolved review threads; reconcile it before handoff without repeated evidence-only pushes.

- [x] (2026-10-18 scope extension) Implement the separately authorized manual/automatic controls on this existing branch/PR under [the controls plan](manual-compaction-2026-10-18.md). Fresh full local verification passes 690 Vitest/252 Node tests, both unchanged coverage gates and zero audits; final actual-head hosted/scanner/review reconciliation is recorded in PR #89. Earlier metadata-head evidence remains historical and does not certify new runtime behavior.

## Surprises & Discoveries


The release version contract is dynamic: root, CLI and daemon must agree, built CLI/daemon `--version` must match, and current release notes must be linked from root/index/maintenance docs. Full integration tests can clone committed HEAD, so candidate metadata must be committed before the full gate. The `pnpm-lock.yaml` dependency content need not change merely for these private manifest versions.

PR #88 changes defaults and persistence behavior across five provider routes without changing database compatibility version 1. Source documentation already covers the implementation but uses broad unreleased wording; preparation must identify the candidate and preserve the distinction from published v0.2.4. Context checkpoints use additive tables and a legacy mirror, while permanent extraction has its own cursor. Downgrade/re-upgrade after an older binary processes more conversation requires matching-backup guidance, not an implied automatic database rollback.

The v0.2.4 availability plan had an unclosed reconciliation step, now closed from the actual PR record. GitHub confirms PR #87 merged as `b03c40b` on October 16 after all thirteen applicable PR checks passed; its actual-main CI/CodeQL evidence is independently recorded. Preserve the earlier cancelled publication attempt and immutable release target `78b3e40` while recording this later documentation merge.

## Decision Log


Decision (2026-10-18): choose the next patch candidate `0.2.5`, consistent with the repository's existing 0.2.x release cadence and additive compatibility. Package the reviewed context feature and repairs only; add no new production dependency, model capability, tool privilege or schema version.

Decision (2026-10-18): prepare a new branch/PR and stop before tagging, environment authorization, publication or paid/live provider work. Earlier v0.2.4 release authorization does not authorize a new release. Preserve required review, exact-commit `publication-checks`, protected reviewer requirements and immutable older assets.

Decision (2026-10-18): update affected live guides to say `0.2.5 candidate`, while leaving signed v0.2.4 availability/install commands and dated release/incident histories truthful. Root README and AGENTS must link the candidate notes; extend the existing dynamic release-doc test to cover AGENTS rather than adding version-specific duplicate tests.

## Outcomes & Retrospective


Candidate versions, notes, changelog and affected live guides are aligned; root AGENTS linkage is covered by the existing dynamic release contract. PR #87/#88 actual merge/main evidence is reconciled without changing old release targets. Frozen installation/build and all 39 focused contracts pass; both executables report `0.2.5`. Full local `pnpm verify:all` passes on metadata commit `dca3d59`: 668 Vitest passes/one skip, 245 Node passes/six skips, Vitest coverage 84.57% statements / 76.24% branches / 87.20% functions / 85.50% lines and Node coverage 79.93% statements/lines / 73.76% branches / 85.60% functions, with zero production/full audit findings. Only final documentation corrections/evidence and focused docs revalidation follow that gate; [Preparation PR #89](https://github.com/openassistuk/openassist/pull/89) is open and attached. Its Validation section records the final actual-head local-docs/hosted/scanner/review reconciliation at handoff, separately from this committed local evidence. Required main review, future preparation-main verification and publication remain separate. Baseline main checks are evidence for the merged feature only; they do not certify the future preparation merge, signed artifacts or live provider/account behavior.

## Context and Orientation


The initial preparation collected merged context work in PR #88 and v0.2.4 availability documentation in PR #87. The newly authorized extension adds manual `/compact`, default-on `runtime.context.autoCompact`, wizard/status/doctor visibility and fresh regressions in this same PR. `packages/config/src/provider-models.ts` and `context-limits.ts` define route-specific capacities and cost/output budgets. `packages/core-runtime/src/context-manager.ts` admits prepared payloads, projects bounded tool results and generates smaller historical checkpoints. `packages/storage-sqlite/src/context.ts` preserves original rows and transactionally verifies revision, contiguous range and raw digest before checkpoint adoption. All five adapters prepare/count/send the same mapped content. Context compaction and actor memory extraction remain separate.

Version manifests are `package.json`, `apps/openassist-cli/package.json` and `apps/openassistd/package.json`. Changelog history lives in `CHANGELOG.md`; release notes belong in `docs/releases/v0.2.5.md`. `tests/node/cli-docs-truth.test.ts` checks versions, executable output, note links, commands/workflows, coverage and testing inventory. `tests/node/runtime-version.test.ts` checks source/build identity, and `tests/node/release-publication-checks.test.ts` checks exact-main publication prerequisites.

## Plan of Work


First align the three candidate versions and move only current Unreleased context entries into a dated 0.2.5 section. Write notes describing complete current-input/history retention, actual provider payload accounting, context cost caps/diagnostics, bounded checkpoint/recovery behavior and separate extraction. Explain the 32 MiB default wire cap, distinct 32–64 MiB raw-read allowance, exact summary output caps, unknown serving windows and lossy historical excerpts without claiming new paid/live certification.

Then synchronize root README/AGENTS, docs index, release maintenance and affected architecture/config/provider/channel/interface/lifecycle/security/testing guides. Public installers continue selecting signed v0.2.4 until later publication/public verification. Explain additive state and matching-backup rollback/re-upgrade semantics. Preserve old dated notes and explicitly close actual merge/check evidence in the relevant plans.

Finally extend the existing notes-link contract to include AGENTS. Run frozen installation, build and focused version/release/docs contracts, commit the metadata and run the full quality/coverage/audit gate. Native packaging is hosted on Linux/macOS because Windows is not an operator artifact target. Open a preparation PR, wait for actual-head quality/native/signing/live-macOS and PR/full CodeQL, and query open alerts/review threads independently. Record final hosted evidence on the PR without an endless documentation-only commit/check cycle.

## Concrete Steps


Work from `C:\Users\dange\Coding\openassist` on `codex/release-0.2.5`. Use the existing Node 24/pnpm 12 toolchain:

    pnpm install --frozen-lockfile
    pnpm build
    node apps/openassist-cli/dist/index.js --version
    node apps/openassistd/dist/index.js --version
    pnpm exec tsx --test tests/node/cli-docs-truth.test.ts tests/node/runtime-version.test.ts tests/node/release-publication-checks.test.ts
    git diff --check
    pnpm verify:all

Both executable versions must print `0.2.5`. Dependency resolutions and security/coverage thresholds remain unchanged; production behavior changes are limited to the separately authorized controls plan. Commit the reviewed metadata before the full gate so clone-based tests inspect this candidate. Push the branch and open the normal PR to main, attach it to this chat and dispatch only a full branch CodeQL analysis in addition to automatic PR checks. Do not create a release tag or dispatch publication.

## Validation and Acceptance


All three manifests, built executable versions, versioned changelog and release-note links agree on candidate `0.2.5`. Root and operator guides distinguish this candidate from public v0.2.4, and current source context docs explain the additive state/rollback and independent byte/token limits accurately. The original metadata phase required no runtime implementation. The later controls extension adds runtime/config/command behavior and corresponding regressions; rerun the full gate and exact-head hosted checks rather than reusing earlier results.

Full local `pnpm verify:all` must pass with unchanged Vitest gates (81% lines/statements/functions, 71% branches), Node gates (79% lines/statements, 80% functions, 70% branches), docs truth and production/full dependency audits. Hosted quality must pass Linux/macOS/Windows plus workflow lint, actual PR/full CodeQL, native four-platform packages, ephemeral signing and macOS LaunchAgent checks. Publication-only jobs are expected PR skips. Open scanner alerts and review threads are checked separately. Baseline/PR success does not certify the future exact-main release tag or live provider/channel sessions.

## Idempotence and Recovery


Preparation is ordinary version/test/documentation work on a feature branch. Keep operator config/env/state, private test settings, SSH hosts, credentials, services, signing material, release environments and older tags/assets untouched. Recover failures through targeted fixes and the same gates; do not lower thresholds, suppress alerts or bypass reviews. A failed local/hosted check must remain visible with its repair evidence.

After later maintainer review/merge and explicit release authorization, the preparation merge needs its own exact-main CI/full CodeQL and normal protected release process. Public availability changes only after actual production signing/publication, independent signature/digest checks and all four public-install targets succeed. This plan does not authorize those later actions.

## Artifacts and Notes


Baseline: PR #88 merge `f32a1e115d5d31e2c28fec1561cdf0c313a0e4aa`, [main CI 39143902526](https://github.com/openassistuk/openassist/actions/runs/39143902526) and [full CodeQL 39143902610](https://github.com/openassistuk/openassist/actions/runs/39143902610), both attempt 1. Latest main analysis `1976239545` has zero results. Local full verification log is `C:\Users\dange\AppData\Local\Temp\openassist-release-0.2.5-verify.log`; final actual-head hosted run links, scanning refs and review-thread reconciliation belong in the preparation PR validation record. Public stable [v0.2.4](https://github.com/openassistuk/openassist/releases/tag/v0.2.4) remains immutable at its reviewed release target `78b3e40`.

## Interfaces and Dependencies


The initial metadata phase required no new runtime contract. The controls extension adds backward-compatible optional `autoCompact` config/status fields; no new production dependency or storage version is required. Keep existing Node 24.21.0, pnpm 12.5.1, model catalog/tuning, database compatibility version 1, install-state version 2, lifecycle JSON version 4, signed update manifests and `managed-one-shots-v1`. Candidate metadata must not implicitly activate new models, tools or account capabilities.

Revision note (2026-10-18): initialize 0.2.5 preparation from the verified context merge and actual public stable state, with complete documentation/version contracts and explicit limits on publication/live-testing authorization.

Revision note (2026-10-18, preparation delivery): record the passing full local gate, final guide corrections and PR #89. Keep final actual-head hosted/scanner/review evidence in the PR validation record so documenting success does not invalidate its own checked commit.
