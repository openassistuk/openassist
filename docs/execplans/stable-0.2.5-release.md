# Publish stable 0.2.5


This living ExecPlan follows `.agents/PLANS.md`. Maintain Progress, Surprises & Discoveries, Decision Log and Outcomes & Retrospective as evidence arrives. The initial October 18 request authorized release preparation and the later controls extension on PR #89. After confirming its merge, the maintainer explicitly authorized updating local main, removing the merged branch, checking main CI/CodeQL and continuing the 0.2.5 release. This continuation covers the exact reviewed tag, narrowly scoped environment tag authorization, normal protected approval, signing/publication, independent signatures/digests, public installation and a reviewed availability-docs follow-up. Private settings, credentials, live providers and test hosts remain outside scope.

## Purpose / Big Picture


Prepare the merged model-aware context engine and recovery fixes for packaged operators as `0.2.5`. Existing signed `v0.2.4` installations keep their shipped planner until explicitly updated. Align candidate versions, collect the release changelog, explain context/memory and rollback behavior, and reconcile all affected guides without claiming unpublished assets are available. The subsequent October 18 request extends this same PR with manual `/compact` and an automatic-compaction switch; follow [the controls plan](manual-compaction-2026-10-18.md) for implementation and fresh validation.

The initial preparation succeeded through reviewed PR #89 with synchronized versions, notes, docs and fresh local/hosted gates. Signed stable v0.2.5 now targets that exact reviewed merge; all four public-install targets and independent signatures/digests verify, and older releases remain immutable. Current public availability is v0.2.5. The remaining continuation work is a separately reviewed availability-docs PR and its own local/hosted gates.

## Progress


- [x] (2026-10-18 baseline) Confirm clean `main` at PR #88 merge `f32a1e115d5d31e2c28fec1561cdf0c313a0e4aa`, matching freshly fetched `origin/main`. Main CI `39143902526` and full CodeQL `39143902610` pass on attempt 1; current repository open scanning alerts are empty.
- [x] (2026-10-18 public state) GitHub latest stable is `v0.2.4`, published October 16. No v0.2.5 tag/release or open preparation PR exists. Create `codex/release-0.2.5`; work as one agent.
- [x] (2026-10-18) Align candidate root/CLI/daemon versions at `0.2.5`, collect the six context entries under a dated versioned changelog and write `docs/releases/v0.2.5.md`.
- [x] (2026-10-18) Update README, AGENTS, docs index and all affected context/provider/config/channel/lifecycle/security/testing guides. Retain v0.2.4 public availability and dated historical evidence. Reconcile PR #87/#88 actual merges/checks separately from release certification.
- [x] (2026-10-18) Strengthen the existing release-doc contract for AGENTS linkage. Frozen installation/build pass with the lockfile unchanged; both executable versions print `0.2.5`. All 39 focused docs/version/publication contracts pass. Manual budget/byte bounds, CLI flags and workflow/coverage claims match their implementation sources.
- [x] (2026-10-18 local gate) Commit candidate metadata as `dca3d5977df24716f37074c9984d9d21b0d5a151` and pass full `pnpm verify:all`: workflow lint, build/lint/typecheck, 668 Vitest passes/one existing skip, 245 Node passes/six existing skips, both unchanged coverage gates and zero production/full audit findings. Scoped Node coverage passes 126 tests/five existing skips. Final review corrects three guide headings, consolidates duplicate rollback guidance and closes PR #87 local evidence from its recorded validation; rerun focused docs truth after these documentation-only edits.
- [x] (2026-10-18 delivery) Review final additions for accidental runtime changes, credential markers and misleading release claims; preserve the unchanged lockfile/gates. Push `codex/release-0.2.5`, open and attach [preparation PR #89](https://github.com/openassistuk/openassist/pull/89). Its Validation section is the living final actual-head record for local docs revalidation, CI, PR/full-branch CodeQL, native/signing/live-macOS checks, separate scanning refs and unresolved review threads; reconcile it before handoff without repeated evidence-only pushes.

- [x] (2026-10-18 scope extension) Implement the separately authorized manual/automatic controls on this existing branch/PR under [the controls plan](manual-compaction-2026-10-18.md). Fresh full local verification passes 690 Vitest/252 Node tests, both unchanged coverage gates and zero audits; final actual-head hosted/scanner/review reconciliation is recorded in PR #89. Earlier metadata-head evidence remains historical and does not certify new runtime behavior.
- [x] (2026-10-18 merge continuation) PR #89 merged at 19:12:31 UTC as `190727fd21040724ab17e49fd950d6856cafda4f`. Fetch/prune and fast-forward local main; verify its tree exactly matches reviewed head `45fb88873a21a7c8087dee66d7ba7201c8b20ded`. Delete only the confirmed merged `codex/release-0.2.5` branch locally and remotely. Start the documentation follow-up on `codex/release-0.2.5-availability` while retaining the release target at that merge.
- [x] (2026-10-18 exact-main checks) CI `39157702831` passes all four jobs on unchanged-code attempt 2; Linux/macOS/Windows production and full audits report zero findings. Full CodeQL `39157702759` passes attempt 1; analysis `1976674430` has zero results/no error for the exact merge, and separate main/PR/branch alert and review-thread checks are empty. Preserve CI attempt 1's Windows 30-minute timeout: the hanging-channel startup case measured 742 ms against a 500 ms assertion, then exited before cleanup. The isolated local case and full hosted retry pass without code changes.
- [x] (2026-10-18 tag and dispatch) Create/push annotated `v0.2.5` object `68f202d39b37240ea0a937784f35c9034492c309`, targeting exactly `190727fd21040724ab17e49fd950d6856cafda4f`. Read-only publication preflight passes exact-main CI attempt 2 and CodeQL attempt 1. Add only exact tag policy `63502964`; snapshot comparison confirms reviewer/protection settings and all six older policies unchanged. Dispatch stable protected publication [39160662895](https://github.com/openassistuk/openassist/actions/runs/39160662895). Native, signing, approval, public-install and independent verification outcomes remain pending at this checkpoint.
- [x] (2026-10-18 protected approval) All four native packages, Linux x64 service activation/full candidate `pnpm verify:all`, zero production/full candidate audits and ephemeral signing contracts pass on publication attempt 1. Recheck exact-main CI/CodeQL immediately before the normal existing reviewer approval; deployment `7159885469` is approved for the exact tagged merge under the unchanged `release` reviewer rules. No bypass or signing secret retrieval is used. The protected job still performs its own final prerequisite check before signing.
- [x] (2026-10-18 publication and independent verification) Protected production signing/publication succeeds at 19:58:05 UTC on attempt 1 with sixteen assets; GitHub latest stable selects v0.2.5. Both RSA/SHA-256 signatures verify against pinned `release-public.pem`; all sixteen GitHub asset sizes/digests agree with downloaded metadata or the signed index/manifest. Signed build identity is exactly `0.2.5-190727fd21040724ab17e49fd950d6856cafda4f`, private Node 24.21.0, stable channel, config/database compatibility 1 and `managed-one-shots-v1`. Original v0.2.4 annotated tag, release identity and all sixteen asset IDs/names/sizes/digests/states/timestamps remain unchanged. No asset replacement, signing-key retrieval or trust-anchor edit occurs.
- [x] (2026-10-18 public verification) All four Linux/macOS x64/arm64 public-install targets pass stable-channel and exact-version installation, version/update planning and data-preserving uninstall. Publication run `39160662895` succeeds on attempt 1, with no publication or public-verification retry and no asset replacement. Change availability notices only after these results and independent verification.
- [x] (2026-10-18 availability reconciliation) Update README, AGENTS, changelog, docs index, shipped context/provider/config/channel/interface/security/lifecycle/testing guides and release notes for signed stable v0.2.5. Preserve older release evidence and explicitly reconcile the implementation/control/preparation merges; no production, dependency, workflow, gate or test-deadline change is needed.
- [x] (2026-10-18 focused validation and release metadata) All eleven docs-truth contracts pass, including commands/flags, local links/anchors/index, versions, workflows, coverage scope/thresholds and test inventory. Review the documentation-only diff/credential markers. Refresh the new GitHub release title/description with reviewed behavior and verified publication facts, converting local links to absolute GitHub links; all sixteen immutable asset fields and publication identity remain unchanged. Download counters are intentionally excluded from immutability comparisons.
- [x] (2026-10-18 follow-up opened) Commit documentation as `62d9e43` and open/attach draft [availability PR #90](https://github.com/openassistuk/openassist/pull/90). Add this plan pointer before the full clone-based local gate and final hosted checks. The release tag remains immutable at `190727f`.
- [ ] Pass full `pnpm verify:all`, reconcile final actual-head CI/PR and full-branch CodeQL/native/signing/live-macOS, open scanning refs and review threads in PR #90, then mark it ready for normal maintainer review. Its Validation section is the final living check record; do not add repeated evidence-only commits or bypass main review.

## Surprises & Discoveries


The release version contract is dynamic: root, CLI and daemon must agree, built CLI/daemon `--version` must match, and current release notes must be linked from root/index/maintenance docs. Full integration tests can clone committed HEAD, so candidate metadata must be committed before the full gate. The `pnpm-lock.yaml` dependency content need not change merely for these private manifest versions.

PR #88 changes defaults and persistence behavior across five provider routes without changing database compatibility version 1. Source documentation already covers the implementation but uses broad unreleased wording; preparation must identify the candidate and preserve the distinction from published v0.2.4. Context checkpoints use additive tables and a legacy mirror, while permanent extraction has its own cursor. Downgrade/re-upgrade after an older binary processes more conversation requires matching-backup guidance, not an implied automatic database rollback.

The v0.2.4 availability plan had an unclosed reconciliation step, now closed from the actual PR record. GitHub confirms PR #87 merged as `b03c40b` on October 16 after all thirteen applicable PR checks passed; its actual-main CI/CodeQL evidence is independently recorded. Preserve the earlier cancelled publication attempt and immutable release target `78b3e40` while recording this later documentation merge.

The release-main Windows attempt hits a strict 500 ms startup assertion at 742 ms under hosted load. The assertion precedes `runtime.stop()`/database cleanup, so the failed test leaves the runtime active until the job's 30-minute limit. This is not a passed check or release certification. One unchanged-code retry is appropriate before deciding whether a reviewed fixture repair is necessary; do not weaken the production startup behavior or coverage gate. `publication-checks` requires all jobs on the latest run attempt, so retry the entire CI run rather than only Windows.

The same hanging-channel startup case passes by itself on the local Windows host with `pnpm exec tsx --test --test-name-pattern='does not block runtime start when a channel start hangs' tests/node/runtime.test.ts` (one pass, 861 ms total command test duration). This supports a load-sensitive fixture explanation but does not replace the complete hosted retry or prove a clean audit.

## Decision Log


Decision (2026-10-18, release continuation): the maintainer's new explicit release request supersedes the preparation-only limit below. Tag only PR #89's reviewed merge `190727f`, never a later evidence/documentation commit. Preserve reviewer rules and every existing environment tag policy; add only exact `v0.2.5`. Use the existing protected publication and public-install workflows, then submit availability changes through the normal reviewed PR path.

Decision (2026-10-18): choose the next patch candidate `0.2.5`, consistent with the repository's existing 0.2.x release cadence and additive compatibility. Package the reviewed context feature and repairs only; add no new production dependency, model capability, tool privilege or schema version.

Decision (2026-10-18): prepare a new branch/PR and stop before tagging, environment authorization, publication or paid/live provider work. Earlier v0.2.4 release authorization does not authorize a new release. Preserve required review, exact-commit `publication-checks`, protected reviewer requirements and immutable older assets.

Decision (2026-10-18): update affected live guides to say `0.2.5 candidate`, while leaving signed v0.2.4 availability/install commands and dated release/incident histories truthful. Root README and AGENTS must link the candidate notes; extend the existing dynamic release-doc test to cover AGENTS rather than adding version-specific duplicate tests.

## Outcomes & Retrospective


Release continuation: PR #89 is merged and local main is current at `190727f`; the reviewed feature branch is removed locally/remotely. Exact-main CI passes unchanged-code attempt 2 after the retained Windows timing-assertion timeout; full CodeQL passes attempt 1 with zero results, all platform audits are clean and open alerts/threads are empty. Annotated v0.2.5 targets that exact merge, and read-only preflight/rechecks pass. Only exact v0.2.5 was added to the environment, with reviewers and older policies unchanged. Protected run `39160662895` passes all eleven jobs on attempt 1, including production signing/publication and all four public-install targets. Both production signatures and all sixteen GitHub asset digests independently verify; v0.2.4's tag/assets remain identical. Signed stable was published at 19:58:05 UTC and availability documentation is reconciled afterward on the follow-up branch. Its local/hosted checks and reviewed PR remain pending at this checkpoint. The preparation results below remain historical.

Historical preparation delivery: candidate versions, notes, changelog and affected live guides were aligned; root AGENTS linkage is covered by the existing dynamic release contract. PR #87/#88 actual merge/main evidence is reconciled without changing old release targets. Frozen installation/build and all 39 focused contracts pass; both executables report `0.2.5`. Full local `pnpm verify:all` passes on metadata commit `dca3d59`: 668 Vitest passes/one skip, 245 Node passes/six skips, Vitest coverage 84.57% statements / 76.24% branches / 87.20% functions / 85.50% lines and Node coverage 79.93% statements/lines / 73.76% branches / 85.60% functions, with zero production/full audit findings. Only final documentation corrections/evidence and focused docs revalidation follow that gate; [Preparation PR #89](https://github.com/openassistuk/openassist/pull/89) is open and attached. Its Validation section records the final actual-head local-docs/hosted/scanner/review reconciliation at handoff, separately from this committed local evidence. Required main review, future preparation-main verification and publication remain separate. Baseline main checks are evidence for the merged feature only; they do not certify the future preparation merge, signed artifacts or live provider/account behavior.

## Context and Orientation


The initial preparation collected merged context work in PR #88 and v0.2.4 availability documentation in PR #87. The newly authorized extension adds manual `/compact`, default-on `runtime.context.autoCompact`, wizard/status/doctor visibility and fresh regressions in this same PR. `packages/config/src/provider-models.ts` and `context-limits.ts` define route-specific capacities and cost/output budgets. `packages/core-runtime/src/context-manager.ts` admits prepared payloads, projects bounded tool results and generates smaller historical checkpoints. `packages/storage-sqlite/src/context.ts` preserves original rows and transactionally verifies revision, contiguous range and raw digest before checkpoint adoption. All five adapters prepare/count/send the same mapped content. Context compaction and actor memory extraction remain separate.

Version manifests are `package.json`, `apps/openassist-cli/package.json` and `apps/openassistd/package.json`. Changelog history lives in `CHANGELOG.md`; release notes belong in `docs/releases/v0.2.5.md`. `tests/node/cli-docs-truth.test.ts` checks versions, executable output, note links, commands/workflows, coverage and testing inventory. `tests/node/runtime-version.test.ts` checks source/build identity, and `tests/node/release-publication-checks.test.ts` checks exact-main publication prerequisites.

## Plan of Work


The initial preparation procedure below is complete through PR #89. Its preparation-only authorization was superseded by the maintainer's explicit release continuation; the later Authorized Release Continuation section records that procedure and its remaining availability-review checks. Do not restart the deleted preparation branch or retag the documentation follow-up.

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


All three manifests, built executable versions, versioned changelog and release-note links agree on published `0.2.5`. Root and operator guides distinguish the current stable release from older immutable releases and explain additive state/rollback and independent byte/token limits accurately. The original metadata phase required no runtime implementation. The later controls extension received fresh regressions and full local/hosted checks, followed by independent exact-main and release certification. The documentation follow-up requires its own committed-head local/hosted checks; never move the release tag to it.

Full local `pnpm verify:all` must pass with unchanged Vitest gates (81% lines/statements/functions, 71% branches), Node gates (79% lines/statements, 80% functions, 70% branches), docs truth and production/full dependency audits. Hosted quality must pass Linux/macOS/Windows plus workflow lint, actual PR/full CodeQL, native four-platform packages, ephemeral signing and macOS LaunchAgent checks. Publication-only jobs are expected PR skips. Open scanner alerts and review threads are checked separately. Baseline/PR success does not certify the future exact-main release tag or live provider/channel sessions.

## Idempotence and Recovery


Preparation was ordinary version/test/documentation work on a feature branch; the current follow-up changes documentation only. Keep operator config/env/state, private test settings, SSH hosts, credentials, services and signing material untouched. The separately authorized release added only its exact tag environment policy; preserve reviewers and every older tag/asset. Recover failures through targeted fixes and the same gates; do not lower thresholds, suppress alerts or bypass reviews. A failed local/hosted check must remain visible with its repair evidence.

The maintainer has now supplied review/merge confirmation and explicit release authorization. Require the preparation merge's own exact-main CI/full CodeQL and normal protected release process. Public availability changes only after actual production signing/publication, independent signature/digest checks and all four public-install targets succeed. Never replace assets or move a published tag; a public-verification failure is retried with `verify_published=true` against the same assets after diagnosis.

## Authorized Release Continuation


From the checkout at `190727fd21040724ab17e49fd950d6856cafda4f`, create annotated `v0.2.5` explicitly targeting that commit, then push only that tag. Set `RELEASE_TAG=v0.2.5`, `GITHUB_SHA` to that exact merge and `GITHUB_REPOSITORY=openassistuk/openassist`; supply an authenticated `GH_TOKEN` only in the child process environment and run `node scripts/release/check-publication-checks.mjs`. Both latest exact-main runs and their required jobs must succeed. Never print or persist the token.

Snapshot the release environment and older tag policies before adding only `{name: "v0.2.5", type: "tag"}`. Confirm the existing reviewer requirement, self-review setting and all older policies are identical afterward. Dispatch `gh workflow run release.yml --ref v0.2.5 -f tag=v0.2.5 -f channel=stable -f publish=true -f verify_published=false`. After native/signing prerequisites pass, use the normal existing environment reviewer approval. The protected job rechecks exact-main gates immediately before production signing. Signing secrets remain exclusively in that protected job.

Require public stable/exact-version install and data-preserving uninstall to pass on Linux/macOS x64/arm64. Independently verify both RSA/SHA-256 production signatures against `release-public.pem`, all sixteen GitHub asset digests, the signed version/commit/channel and older immutable release identities. Only then change live availability guidance and the GitHub release description; the tag and signed assets stay untouched. Commit availability docs on the follow-up branch before `pnpm verify:all` so clone-based tests inspect them, then open and attach a normal review PR and reconcile its exact-head hosted checks, separate open scanning refs and review threads. Record final check evidence on the PR without an endless evidence-only commit loop.

## Artifacts and Notes


Baseline: PR #88 merge `f32a1e115d5d31e2c28fec1561cdf0c313a0e4aa`, [main CI 39143902526](https://github.com/openassistuk/openassist/actions/runs/39143902526) and [full CodeQL 39143902610](https://github.com/openassistuk/openassist/actions/runs/39143902610), both attempt 1. Latest main analysis `1976239545` has zero results. Local full verification log is `C:\Users\dange\AppData\Local\Temp\openassist-release-0.2.5-verify.log`; final actual-head hosted run links, scanning refs and review-thread reconciliation belong in the preparation PR validation record. Public stable [v0.2.4](https://github.com/openassistuk/openassist/releases/tag/v0.2.4) remains immutable at its reviewed release target `78b3e40`.

## Interfaces and Dependencies


The initial metadata phase required no new runtime contract. The controls extension adds backward-compatible optional `autoCompact` config/status fields; no new production dependency or storage version is required. Keep existing Node 24.21.0, pnpm 12.5.1, model catalog/tuning, database compatibility version 1, install-state version 2, lifecycle JSON version 4, signed update manifests and `managed-one-shots-v1`. Candidate metadata must not implicitly activate new models, tools or account capabilities.

Revision note (2026-10-18): initialize 0.2.5 preparation from the verified context merge and actual public stable state, with complete documentation/version contracts and explicit limits on publication/live-testing authorization.

Revision note (2026-10-18, preparation delivery): record the passing full local gate, final guide corrections and PR #89. Keep final actual-head hosted/scanner/review evidence in the PR validation record so documenting success does not invalidate its own checked commit.

Revision note (2026-10-18, release continuation and publication): record the maintainer's explicit authorization, actual PR #89 merge, branch cleanup, initial Windows timing timeout and successful unchanged-code main CI retry, exact annotated tag, narrow environment authorization, normal protected approval, independent signatures/digests and first-attempt publication/public verification on all four targets. Reconcile current availability only after these results and keep its follow-up review separate from the immutable release target and deferred live testing.
