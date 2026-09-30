# Repair the post-release Axios audit and reconcile release documentation

This living ExecPlan follows `.agents/PLANS.md`. Keep Progress, Surprises & Discoveries, Decision Log and Outcomes & Retrospective current.

## Purpose / Big Picture


Restore the dependency security gate after the final merged-main check for OpenAssist 0.2.0 detected five high and two moderate Axios advisories. Source builds containing this change must resolve Axios 1.20.0 or later through WhatsApp/Baileys and pass the existing production/full audits. Correct current release guidance and record actual merges without replacing dated evidence or claiming that published packages have changed. The maintainer approved this repair through a branch and PR on September 30, 2026.

## Progress


- [x] (2026-09-30 16:52Z) Confirmed clean main `98422373c63dc907300d5dd7d2c9e0dadc646d23`, Node 24.21.0, pnpm 12.5.1 and authenticated GitHub CLI; created `codex/fix-axios-release-docs`.
- [x] Reproduced the merged-main audit failure and identified all seven advisories on Baileys -> Axios 1.18.0; each has patched floor 1.20.0.
- [x] Verified Axios 1.20.0 availability and upstream release notes; strengthened the existing resolved-version regression.
- [x] Both strengthened checks failed against the original Axios 1.18.0 lockfile; updated the scoped override and Axios-only lockfile diff and installed frozen dependencies.
- [x] Reconciled root README/AGENTS, changelog, docs index, release maintenance, dependency/security/testing guidance and PR #67/#68/#70 outcomes. Independently verified CodeQL #42 fixed on main without dismissal.
- [x] All 19 focused dependency/audit/docs-truth checks passed.
- [x] Full `pnpm verify:all` passed; Vitest 515 passed/1 skipped, Node 207 passed/4 skipped, coverage Node 126 passed/3 skipped, unchanged coverage gates and zero findings in production/full audits.
- [x] Baileys-resolved Axios 1.20.0 passed loopback JSON GET, redirected streamed download and streamed POST compatibility checks; no live WhatsApp session was used.
- [x] Reviewed the final source/docs diff for accidental edits, regressions, secret exposure and unnecessary changes; all 11 final docs-truth checks and `git diff --check` passed.
- [x] (2026-09-30 17:10Z) Committed/pushed source revision `157341a7aa6b8bc0b8206177af137b91d4d16bda` and opened/attached [PR #71](https://github.com/openassistuk/openassist/pull/71) against main.
- [x] All 13 required source-revision hosted checks passed; publication/public-install skipped by design. Separate queries found zero open code-scanning alerts and no unresolved review threads. Recorded results for maintainer review; final documentation evidence has its own current-head checks on the PR.

## Surprises & Discoveries


The release-preparation and publication checks passed when executed, but a later registry audit on merged documentation main now reports high=5 and moderate=2 in both production and full dependency trees. [Main CI run 36744864202](https://github.com/openassistuk/openassist/actions/runs/36744864202) fails at audits on Linux, macOS and Windows; builds, tests and coverage passed. Local final verification reproduces the same failure. The retained baseline reports are `coverage/audit/final-production-all-severities.json` and `coverage/stable-0.2.0-final-audit.log` (ignored).

The affected dependency path is `packages/channels-whatsapp-md` -> `@whiskeysockets/baileys` 6.7.24 -> Axios 1.18.0. High advisories are `GHSA-c29m-xwm3-cm6r`, `GHSA-mghh-pgcx-3jjj`, `GHSA-x97p-jq2g-jp4f`, `GHSA-3pq3-5fj3-cg6v` and `GHSA-542g-h47m-68v8`; moderate advisories are `GHSA-vh66-26gq-q6x8` and `GHSA-9fr6-4gfg-395g`. All seven identify 1.20.0 as the first patched Axios version. Their reports cover denial of service, polluted option handling and HTTP/2 network controls; no claim of an observed OpenAssist exploit is made.

Both published releases still have four successful native builds, verified production signatures and successful four-target public installation. The existing signed stable and preview packages are immutable and retain Axios 1.18.0. A source dependency fix does not deliver a new packaged release.

## Decision Log


Decision: Raise only the existing Axios override from `<1.18.0 -> 1.18.0` to `<1.20.0 -> 1.20.0`, preserving Baileys 6.7.24 and all audit/coverage gates. Rationale: this is the smallest compatible repair covering all seven findings; a Baileys major migration requires separate session/protocol validation. Date/author: 2026-09-30, Codex.

Decision: Keep package versions, published tags and release assets unchanged. Rationale: the authorized task is a dependency/documentation repair PR; a subsequent packaged release requires its own reviewed version and publication. Describe affected published packages explicitly. Date/author: 2026-09-30, Codex.

Decision: Reconcile living outcomes while retaining dated preparation/check evidence. Rationale: PRs #67 and #70 actually merged, but their plans still describe pending merges/review. Later failing audits must be recorded separately from previously successful runs. Fresh-host provider/channel and second-account testing remain unverified. Date/author: 2026-09-30, Codex.

## Outcomes & Retrospective


The source dependency repair and documentation reconciliation are complete in [PR #71](https://github.com/openassistuk/openassist/pull/71). Full local verification passed with zero audit findings. All 13 required hosted checks passed on source revision `157341a7aa6b8bc0b8206177af137b91d4d16bda`, including three-platform quality/coverage/audits, full CodeQL, live macOS LaunchAgent, four native artifacts and the signing contract. Separate scanner/review-thread queries returned no open findings; maintainer review is required. Axios is the only changed dependency version. Strengthened regressions reject the old lockfile and HTTP compatibility checks exercise the actual Baileys-resolved Axios. Subsequent documentation-evidence revisions are checked separately on the PR's actual head, not inferred from source-revision results. Published 0.2.0/rc.1 packages remain affected until a later reviewed release; no new live integration certification is claimed.

## Context and Orientation


`pnpm-workspace.yaml` contains narrowly scoped dependency overrides; `pnpm-lock.yaml` records exact resolved package versions and integrity hashes. `tests/node/dependency-security-overrides.test.ts` checks every resolved copy against advisory floors and rejects vulnerable versions. `scripts/dev/audit-dependencies.mjs` retains production/full registry reports and fails on high/critical findings or incomplete responses. `package.json` includes this audit in `pnpm verify:all`; `.github/workflows/ci.yml` runs that gate on Linux/macOS/Windows.

`README.md` provides operator installation/update guidance. `AGENTS.md` states contributor security and release rules. `docs/security/threat-model.md`, `docs/testing/test-matrix.md`, `docs/operations/provider-channel-readiness.md` and `docs/operations/release-maintenance.md` distinguish source repairs from published package contents. `docs/execplans/stable-0.2.0-release.md` records stable preparation/publication and PR #70; `docs/execplans/ubuntu-live-test-fixes.md` records PR #67; `docs/execplans/ci-391-dependency-audit-2026-09-30.md` records PR #68 and main CodeQL #42 closure. Their historical evidence stays intact while current outcomes receive explicit merge/check reconciliation.

## Plan of Work


Milestone 1 strengthens the existing lockfile regression, proves failure on Axios 1.18.0, updates the scoped override, regenerates the lockfile using pnpm 12.5.1 and installs with `--frozen-lockfile`. Inspect transitive changes and expect every Axios copy at 1.20.0 or later, without unrelated direct dependency updates.

Milestone 2 corrects the README's post-publication stable migration wording, adds the Axios patched floor to contributor rules and the Unreleased changelog, links this evidence from the docs index, and synchronizes security/testing/provider/release guidance. Reconcile PR #67's merge at `9004841df1038bff77daa1763dfd00312c2509be` and PR #70's merge at `98422373c63dc907300d5dd7d2c9e0dadc646d23`, preserving earlier dated results. Record the newly failing merged-main audit without rewriting previous successful checks.

Milestone 3 runs focused regressions and full verification, reviews the final diff and opens a PR against main. Require exact-revision CI, full CodeQL, native artifacts, signing contract and live macOS LaunchAgent results. Publishing/public-install jobs should skip on this PR. Review scanner alerts and unresolved review threads independently before handing the PR to the maintainer.

## Concrete Steps


Run from `C:/Users/dange/Coding/openassist` with Node 24.21.0, pnpm 12.5.1 and Git Bash available:

    pnpm exec tsx --test tests/node/dependency-security-overrides.test.ts
    pnpm install --lockfile-only
    pnpm install --frozen-lockfile
    pnpm exec tsx --test tests/node/dependency-security-overrides.test.ts tests/node/dependency-audit.test.ts tests/node/cli-docs-truth.test.ts
    pnpm verify:all
    git diff --check

The first regression run must fail before the lockfile repair. Subsequent focused/full runs must pass with unchanged coverage thresholds and zero findings in both dependency audits. Commit the reviewed diff, push `codex/fix-axios-release-docs`, create a PR with a body file and inspect its final checks using gh. Generated logs stay under ignored `coverage/`.

## Validation and Acceptance


Resolved Axios versions meet the 1.20.0 floor, and the old vulnerable lockfile fails the strengthened test. Builds, lint, type checking, docs truth, tests, coverage and both audits pass locally. Hosted results are tied to the actual PR revision. Root/current docs accurately describe stable publication, explicit migration, merged evidence and affected immutable package contents. Existing security controls and compatibility behavior are unchanged. Missing live integration checks remain disclosed.

## Idempotence and Recovery


Use the existing branch/PR for follow-ups. Repeat installs/checks safely with the pinned toolchain; do not lower thresholds, suppress advisories, move tags, publish artifacts or alter operator state. Restore only this repair's scoped changes if implementation fails; leave unrelated work intact.

## Artifacts and Notes


Baseline: main `9842237` has successful CodeQL run `36744863974` and failed CI run `36744864202`. PR #70's 13 required checks passed at `a41c2f426b4c32e4a2aaeab3732b511a23a69d56` before its actual merge. Both public releases' 16 assets match signed manifests/indexes and their release bodies match checked-in notes. Registry availability and [Axios 1.20.0 release notes](https://github.com/axios/axios/releases/tag/v1.20.0) were inspected on September 30. New implementation and final hosted evidence will be appended here.

Regression evidence: both dependency-security checks failed against the old lockfile, specifically `axios@1.18.0 is below patched floor 1.20.0` and `Vulnerable version remains: axios@1.18.0`. After updating Axios, frozen installation and all 19 focused tests passed. pnpm's incidental hasown deduplication was reverted to preserve the original unrelated resolutions; the frozen lockfile validated successfully. No direct dependency or additional transitive version changed. Ignored focused log: `coverage/post-release-axios-focused.log`.

Full local evidence: `pnpm verify:all` exited zero on Windows/Node 24.21.0/pnpm 12.5.1 with Git Bash available. Vitest: 72 files, 515 passed/1 skipped; Node: 207 passed/4 skipped; coverage Node: 126 passed/3 skipped. Vitest coverage is statements 83.08%, branches 74.09%, functions 85.82%, lines 84.08%; Node coverage is statements/lines 80.06%, branches 73.38%, functions 86.52%. Both retained audits report zero vulnerabilities at every severity. The ignored log is `coverage/post-release-axios-verify.log`. An independent loopback check resolved Axios through Baileys, asserted version 1.20.0, and passed JSON GET, redirected stream download and stream upload behavior; this is local transport validation, not live channel certification.

Hosted source-revision evidence: [CI 36749502938](https://github.com/openassistuk/openassist/actions/runs/36749502938), [CodeQL 36749502781](https://github.com/openassistuk/openassist/actions/runs/36749502781), [live macOS 36749502789](https://github.com/openassistuk/openassist/actions/runs/36749502789) and [artifacts/signing 36749502840](https://github.com/openassistuk/openassist/actions/runs/36749502840) all concluded success at `157341a7aa6b8bc0b8206177af137b91d4d16bda`. The PR reports 13 successes and two intentional publication/public-install skips. Open code-scanning alerts and unresolved review threads were queried independently and both returned empty lists. GitHub reports `REVIEW_REQUIRED`. This final plan reconciliation changes only documentation; its current-head checks remain recorded separately on PR #71.

## Interfaces and Dependencies


No new direct production dependency or runtime interface is introduced. Preserve the existing Axios/Baileys dependency path, package versions, signed-manifest/database/config compatibility and command surfaces. Review any transitive packages introduced by Axios's compatible minor update as part of the lockfile diff.

Revision 2026-09-30: Created for the approved post-release Axios repair and documentation reconciliation, recording the reproduced audit failure and immutable-publication boundary before changing dependencies.

Revision 2026-09-30 implementation: Recorded failing-before/passing-after regressions, Axios-only lockfile changes, focused validation and actual prior merges/scanner closure; full local verification remains in progress.

Revision 2026-09-30 local verification: Recorded complete quality/coverage/audit and local HTTP compatibility evidence; current operator guidance now exposes the unchanged published-package dependency limitation before installation commands. Hosted PR validation remains separate.

Revision 2026-09-30 hosted reconciliation: Recorded actual PR creation, source revision, all successful hosted workflows, expected publication skips and separate scanner/review checks; retained maintainer review, subsequent-revision checks and later packaged delivery as explicit boundaries.
