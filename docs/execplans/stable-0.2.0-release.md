# Prepare OpenAssist 0.2.0 stable through a release PR

This ExecPlan is a living document maintained under `.agents/PLANS.md`. Keep Progress, Surprises & Discoveries, Decision Log and Outcomes & Retrospective current.

## Purpose / Big Picture


Prepare the first stable packaged OpenAssist release with the fixes already merged in PRs #67 and #68. A reviewer can inspect one branch with matching `0.2.0` versions, complete release notes, migration commands and current validation evidence. After approved publication, operators can use the default stable installer or explicitly migrate their preview/source installation. Preparing a PR does not publish assets.

## Progress


- [x] (2026-09-30 14:52Z) Inspected release scripts, publication workflow, package versions, changelog, relevant docs and prior verification records. Confirmed PRs #67/#68 merged and the only published release is rc.1.
- [x] (2026-09-30 14:52Z) Created `codex/release-0.2.0` from `origin/main` at `fa3968b`; working tree was clean. Maintainer confirmed no replacement-host retest has occurred.
- [x] (2026-09-30 14:58Z) Aligned root/CLI/daemon versions, stable notes, changelog and current release guidance; added version/notes regression coverage in the existing docs-truth suite.
- [x] (2026-09-30 15:02Z) `pnpm verify:all` passed on Windows/Node 24.21.0/pnpm 12.5.1 with Git Bash available. Verified both executable versions print 0.2.0 and reviewed the full tracked patch and new notes/plan.
- [x] (2026-09-30 15:04Z) Committed and pushed `fa229fad77f40e385f32595453bc470bce471fb8`; opened and attached [PR #69](https://github.com/openassistuk/openassist/pull/69). Separate queries found no review threads and zero open scanning alerts; maintainer review is required.
- [x] (2026-09-30 15:11Z) All 13 implementation-revision checks passed at `fa229fa`, including four artifacts and signing-contract. Publication/public-install skipped intentionally. Separate final scanner query found zero open alerts; review remains required. Subsequent evidence-only commit checks are recorded in the PR.

## Surprises & Discoveries


The published preview is immutable and lacks the fixes now on main. Packaging requires root/CLI/daemon versions to agree, a clean committed checkout and a native Linux/macOS host. This Windows workspace can run quality checks but cannot build the four release artifacts. The manual release workflow defaults to preview, so stable publication must explicitly select `channel=stable`.

Prior docs require a replacement clean-host test before stable preparation. The maintainer requested the release PR while confirming that retest has not occurred. Preparation can proceed, but the live test remains a publication gate and cannot be inferred from automated checks. The second-account live check remains unverified separately.

The protected release environment currently allows only the `v0.2.0-rc.1` tag. Read-only inspection confirmed required-reviewer protection and an exact-tag deployment policy. Stable dispatch needs separate authorization to permit the exact `v0.2.0` tag; this preparation does not alter environment protections.

## Decision Log


Decision: Use current main and a new `codex/release-0.2.0` branch, without changing product behavior or dependencies. Rationale: both fix PRs are merged and this is release assembly. Date/author: 2026-09-30, Codex.

Decision: Keep public availability notices on rc.1 until stable publication and public-install checks succeed. Rationale: a stable version in Git is not a downloadable signed release. Date/author: 2026-09-30, Codex.

Decision: Prepare despite the missing replacement-host retest, explicitly retaining it before publication. Rationale: the maintainer authorized a branch/PR and confirmed the missing test; no host, rollout or publication authorization was provided. Date/author: 2026-09-30, Codex.

Decision: Document the stable environment-tag prerequisite without changing GitHub protection. Rationale: the current allowlist admits only rc.1 and changing an external release control is outside branch/PR preparation. Date/author: 2026-09-30, Codex.

## Outcomes & Retrospective


Release assembly, local verification and [PR #69 handoff](https://github.com/openassistuk/openassist/pull/69) are complete: root/CLI/daemon are 0.2.0, the changelog collects the development line, stable notes cover fixes and compatibility, and current docs retain truthful preview availability. All local gates and all 13 implementation-revision hosted checks pass without changing thresholds. The final evidence-only documentation commit is checked separately in the PR; results below certify `fa229fa`, not an untested future revision or merge. No stable tag, public release or production rollout exists. Fresh-host testing, stable-tag environment authorization, review/merge and protected publication remain distinct follow-up gates.

## Context and Orientation


`package.json`, `apps/openassist-cli/package.json` and `apps/openassistd/package.json` define the release versions. Internal workspace libraries retain their existing private versions. `scripts/release/package.mjs` deploys the apps with a private Node runtime and immutable commit identity; `scripts/release/sign.mjs` validates all four build identities and signs using the protected key matching `release-public.pem`.

`.github/workflows/release.yml` builds Linux glibc/macOS x64/arm64 packages and checks them on native hosts. Its protected publication job only runs on an explicit manual dispatch from a release tag. `docs/releases/v0.2.0.md` becomes the release body. `CHANGELOG.md` collects the existing development history under 0.2.0 while retaining dated earlier evidence. `README.md`, `AGENTS.md`, `docs/README.md`, release maintenance, platform guides, quickstart and the Ubuntu resolution matrix explain actual availability and remaining gates. `tests/node/cli-docs-truth.test.ts` checks documented commands/workflows and release version coherence.

The destroyed September 28 Ubuntu host tested rc.1; it does not certify the candidate. PR #67 merged runtime/lifecycle/reminder fixes; PR #68 merged dependency and CodeQL fixes. Prior exact-commit hosted evidence lives in `docs/execplans/ubuntu-live-test-fixes.md` and `docs/execplans/ci-391-dependency-audit-2026-09-30.md`; those results are baseline evidence for this new candidate.

## Plan of Work


### Milestone 1: reviewable stable assembly


Change only the three release version fields to `0.2.0`. Add the per-tag notes with preview-to-stable/source migration, reminder rollback compatibility, security repairs and platform/testing limits. Move the unreleased development history under a pending-publication 0.2.0 changelog heading without rewriting historical evidence. Update current docs with links and the stable tag/channel dispatch while leaving currently usable preview commands first. Extend the existing docs-truth test to detect app version or release-note drift.

### Milestone 2: local quality and PR handoff


From `C:/Users/dange/Coding/openassist`, run `pnpm verify:all` using Node 24.21.0 and pnpm 12.5.1. It builds, lints, typechecks, runs unit/integration tests, checks coverage and audits dependencies. Verify both compiled commands report 0.2.0. Review the patch for unintended changes and secret exposure, then commit and push the new branch and create a PR against main. Attach it to this chat.

### Milestone 3: hosted evidence and later rollout


Inspect CI on Linux/macOS/Windows, workflow lint, CodeQL preflight/analyze, live macOS LaunchAgent, four native artifacts and signing-contract for the exact PR revision. Inspect unresolved review threads and open code-scanning alerts independently. Record outcomes and failures explicitly. Publication/public-install skips on PRs are expected. A reviewer may evaluate the preparation independently; do not tag, merge or publish in this task.

Before later stable publication, exercise the exact candidate on a replacement clean Ubuntu host: public-style pipe without prerequisite workarounds, chat/files/images/web/memory/access, text and prompt reminders, cancellation, restart, recurring skip and rc.1 update preserving operator state. Record second-account authorization testing separately. After approval and merge, reconcile merged-commit checks, authorize rollout and permit the exact stable tag in the protected release environment while retaining required reviewers. Tag the exact reviewed main commit `v0.2.0`, then dispatch release.yml from that tag with tag=v0.2.0, channel=stable and publish=true. Approve the protected publish job. Require stable-channel and exact-version public installation on all four targets before availability docs lead with stable.

## Concrete Steps


Run from the repository root:

    pnpm verify:all
    node apps/openassist-cli/dist/index.js --version
    node apps/openassistd/dist/index.js --version
    git diff --check

Both version commands must print `0.2.0`. Commit the reviewed files, push with `git push -u origin codex/release-0.2.0`, and create the PR using a body file describing the candidate and missing live check. Query PR checks and review/scanner status using gh. Record the PR URL and revision with results below.

## Validation and Acceptance


The three package versions agree, both executable versions are 0.2.0, the matching notes exist and all local quality/coverage/audit gates pass without lowering thresholds. Documented commands match the CLI registry and workflows. The release PR contains only release metadata/docs and the related regression. Native hosted results are tied to the candidate revision. A missing live check stays visibly unverified; no artifact publication is claimed from preparation.

## Idempotence and Recovery


Local checks are repeatable and their generated output stays ignored. Reuse the same branch and PR for fixes instead of opening duplicates. Never move an existing release tag, alter the preview assets, expose production signing secrets to PRs, bypass signatures or touch operator state. There is no database migration or production action in this preparation.

## Artifacts and Notes


Initial evidence: main `fa3968b` contains merged #67/#68; GitHub release listing contains only v0.2.0-rc.1, published September 27. Separate default-branch open-alert query returned zero alerts on September 30. Local environment reports Node v24.21.0 and pnpm 12.5.1.

Local evidence: `pnpm verify:all` exited zero; 72 Vitest files, 515 tests passed/1 skipped, 207 Node tests passed/4 skipped, and 126 coverage Node tests passed/3 skipped. Vitest coverage: statements 83.08%, branches 74.09%, functions 85.82%, lines 84.08%. Node coverage: statements/lines 80.06%, branches 73.38%, functions 86.52%. Production and full audits each report zero findings. Existing skips cover platform/host-only paths; native release packaging requires hosted Linux/macOS. Both compiled commands print 0.2.0. The complete ignored log is `coverage/stable-0.2.0-verify.log`.

Candidate hosted runs at `fa229fad77f40e385f32595453bc470bce471fb8` all succeeded: [CI 36733878032](https://github.com/openassistuk/openassist/actions/runs/36733878032), [CodeQL 36733877850](https://github.com/openassistuk/openassist/actions/runs/36733877850), [macOS LaunchAgent 36733877848](https://github.com/openassistuk/openassist/actions/runs/36733877848) and [Release Artifacts 36733877925](https://github.com/openassistuk/openassist/actions/runs/36733877925). CI covers all three OS quality/coverage/audit jobs and workflow lint. All four native artifacts and signing-contract passed; Linux x64 exercised actual signed rc.1 update, preserved state and reminder rollback protection. Publication and public-install skipped by design. Separate queries found zero open code-scanning alerts and no review threads; the PR requires maintainer review. The evidence-only follow-up adds the exact-tag prerequisite and records these outcomes without changing the validated application.

## Interfaces and Dependencies


No new dependency or runtime interface is introduced. Reuse existing package manifests, release scripts, signing workflow, CLI command registry and docs-truth test. Keep signed-manifest, config and database compatibility versions unchanged.

Revision 2026-09-30: Created for the authorized stable branch/PR. Record publication as pending and retain the maintainer-confirmed live testing gap.

Revision 2026-09-30 assembly: Added stable metadata, reviewed notes, current-guide links and version coherence coverage. Reconciled the earlier pre-preparation live requirement as a pending pre-publication gate under the maintainer's current request.

Revision 2026-09-30 local verification: Recorded full test, coverage, audit and executable-version evidence before PR handoff. Kept the release notes conditional on published assets so the workflow can reuse them as the release body.

Revision 2026-09-30 PR handoff: Recorded PR/revision, initial hosted runs and separate review/scanner results. Added the discovered exact-tag environment prerequisite without changing external release protection.

Revision 2026-09-30 hosted reconciliation: Recorded complete implementation-revision hosted evidence, intentional publication skips and required review. Final follow-up and eventual merge/tag/publication outcomes must be inspected independently and must not be inferred from these results.
