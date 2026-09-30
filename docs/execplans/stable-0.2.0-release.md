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
- [x] (2026-09-30) Final PR head `ab4696c` passed all 13 checks and the requested single-agent read-only review found no actionable issues. The maintainer merged #69 to main at `10c1c20bc4203c3d204cf41e77dfebc160baf722`; merged main CI and CodeQL passed.
- [x] (2026-09-30) Maintainer explicitly authorized stable publication despite the previously recorded fresh-host testing gap. Added only exact `v0.2.0` environment-tag authorization, retained reviewer protection, created the immutable annotated tag at reviewed main, and dispatched [publication run 36739241771](https://github.com/openassistuk/openassist/actions/runs/36739241771) with stable/publish inputs.
- [x] (2026-09-30 15:51Z) Protected publication succeeded with 16 assets and GitHub latest stable set to v0.2.0. Independently downloaded both signed public metadata formats and verified RSA/SHA-256 signatures against the pinned production public key; stable version/commit/four-target metadata agrees.
- [x] (2026-09-30 15:57Z) All four public-installer targets passed stable-channel and exact-version installation, installed CLI/daemon versions, update plans and data-preserving uninstall. Publication workflow concluded success.
- [x] (2026-09-30) Reconciled publication evidence, dated changelog and stable availability commands on `codex/stable-0.2.0-publication`. Full `pnpm verify:all` passed again with unchanged test/coverage results and zero production/full audit findings. Updated the public release body with verified publication facts and working GitHub links; the follow-up docs require normal PR review, and the tag/signed assets remain unchanged.

## Surprises & Discoveries


The published preview is immutable and lacks the fixes now on main. Packaging requires root/CLI/daemon versions to agree, a clean committed checkout and a native Linux/macOS host. This Windows workspace can run quality checks but cannot build the four release artifacts. The manual release workflow defaults to preview, so stable publication must explicitly select `channel=stable`.

At preparation, prior docs required a replacement clean-host test and the maintainer confirmed it had not occurred. The later explicit publication request authorized rollout with that gap disclosed, as recorded in the Decision Log. Replacement-host provider/channel and second-account live checks remain unverified and cannot be inferred from automated checks.

Before rollout, the protected release environment allowed only the `v0.2.0-rc.1` tag. Read-only inspection confirmed required-reviewer protection and an exact-tag deployment policy. Under the maintainer's later publication authorization, add only exact `v0.2.0`; both explicit tags are now permitted and reviewer protection is retained.

## Decision Log


Decision: Use current main and a new `codex/release-0.2.0` branch, without changing product behavior or dependencies. Rationale: both fix PRs are merged and this is release assembly. Date/author: 2026-09-30, Codex.

Decision: Keep public availability notices on rc.1 until stable publication and public-install checks succeed. Rationale: a stable version in Git is not a downloadable signed release. Date/author: 2026-09-30, Codex.

Decision: Prepare despite the missing replacement-host retest, explicitly retaining it before publication. Rationale: the maintainer authorized a branch/PR and confirmed the missing test; no host, rollout or publication authorization was provided. Date/author: 2026-09-30, Codex.

Decision: Document the stable environment-tag prerequisite without changing GitHub protection. Rationale: the current allowlist admits only rc.1 and changing an external release control is outside branch/PR preparation. Date/author: 2026-09-30, Codex.

Decision: Proceed with signed stable publication under the maintainer's later explicit request. Rationale: the release-preparation PR was reviewed and merged, exact merged-main checks passed, and the maintainer requested publication after the remaining live-testing gap was disclosed. Preserve that gap in the release evidence; do not infer new live certification. Permit only the exact stable tag and retain existing reviewer protection. Date/author: 2026-09-30, Codex.

## Outcomes & Retrospective


Preparation and approved publication are complete. [PR #69](https://github.com/openassistuk/openassist/pull/69) merged at `10c1c20bc4203c3d204cf41e77dfebc160baf722`, and that exact commit is tagged as [v0.2.0 stable](https://github.com/openassistuk/openassist/releases/tag/v0.2.0). The publication run passed all four native artifacts, Linux lifecycle/full verification, the signing contract, protected signing/publication and all four public-installer targets. GitHub latest stable points to 0.2.0; both downloaded public signatures independently verify with the pinned production key. [Publication documentation PR #70](https://github.com/openassistuk/openassist/pull/70) passed its required checks and merged at `98422373c63dc907300d5dd7d2c9e0dadc646d23`; current main leads with stable. Its later merged-main CI passed builds, tests and coverage but failed the newly reported Axios audit; the separate [source repair](post-release-axios-audit-2026-09-30.md) requires a subsequent packaged release. Replacement-host provider/channel retesting and the skipped second-account live check remain unverified; the maintainer authorized publication with those gaps disclosed. The tag and signed assets remain immutable and retain affected Axios 1.18.0.

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

Final preparation revision `ab4696c4df2aeee9450578ef5083cc00a4e8e799` passed [CI 36735017052](https://github.com/openassistuk/openassist/actions/runs/36735017052), [CodeQL 36735017125](https://github.com/openassistuk/openassist/actions/runs/36735017125), [macOS live 36735017350](https://github.com/openassistuk/openassist/actions/runs/36735017350) and [artifacts 36735017163](https://github.com/openassistuk/openassist/actions/runs/36735017163). The maintainer merged #69 on September 30. Actual merged-main [CI 36738452015](https://github.com/openassistuk/openassist/actions/runs/36738452015) and [CodeQL 36738451853](https://github.com/openassistuk/openassist/actions/runs/36738451853) passed; a separate open-alert query returned zero. No merged-main certification is inferred from the earlier PR results.

Publication [run 36739241771](https://github.com/openassistuk/openassist/actions/runs/36739241771) signed and published 16 assets on September 30 at 15:51:30 UTC (16:51:30 Europe/London). The annotated tag object is `e039f80abc6219d73460a69080507d743ed7e966`, peeling to reviewed main `10c1c20bc4203c3d204cf41e77dfebc160baf722`. The unauthenticated public metadata check verified both manifest/index signatures and their matching stable/four-target entries. Manifest SHA-256 is `d4f569511cc3bb140066bd3dde7b8712efeb59e9dd79f8311057d3a88d0d9e2c`. Protected approval used the existing eligible reviewer account under the maintainer's explicit request; no reviewer or signature protection was disabled. All public-installer jobs succeeded: Linux x64 at 15:52:12Z, Linux arm64 at 15:52:24Z, macOS arm64 at 15:54:15Z and macOS x64 at 15:57:23Z. Each exercised both channel and exact-version selections, update planning and retained-state removal.

Publication documentation validation: full `pnpm verify:all` exited zero on Windows/Node 24.21.0/pnpm 12.5.1 with Git Bash available. Vitest 515 passed/1 skipped; Node 207 passed/4 skipped; coverage Node 126 passed/3 skipped. Coverage totals match the preparation evidence above, with zero findings in both audits. The ignored log is `coverage/stable-0.2.0-publication-docs-verify.log`. Final docs-truth checks cover updated commands, links, test inventory and release/version coherence; hosted follow-up results are recorded with its actual PR revision rather than inferred from publication.

## Interfaces and Dependencies


No new dependency or runtime interface is introduced. Reuse existing package manifests, release scripts, signing workflow, CLI command registry and docs-truth test. Keep signed-manifest, config and database compatibility versions unchanged.

Revision 2026-09-30: Created for the authorized stable branch/PR. Record publication as pending and retain the maintainer-confirmed live testing gap.

Revision 2026-09-30 assembly: Added stable metadata, reviewed notes, current-guide links and version coherence coverage. Reconciled the earlier pre-preparation live requirement as a pending pre-publication gate under the maintainer's current request.

Revision 2026-09-30 local verification: Recorded full test, coverage, audit and executable-version evidence before PR handoff. Kept the release notes conditional on published assets so the workflow can reuse them as the release body.

Revision 2026-09-30 PR handoff: Recorded PR/revision, initial hosted runs and separate review/scanner results. Added the discovered exact-tag environment prerequisite without changing external release protection.

Revision 2026-09-30 hosted reconciliation: Recorded complete implementation-revision hosted evidence, intentional publication skips and required review. Final follow-up and eventual merge/tag/publication outcomes must be inspected independently and must not be inferred from these results.

Revision 2026-09-30 authorized rollout: Reconciled final head review/checks, actual merge and merged-main checks. Recorded explicit publication authorization, the immutable stable tag and narrowly scoped environment permission; publication/public verification are in progress and fresh-host integration checks remain unverified.

Revision 2026-09-30 publication: Recorded actual protected signing/publication, latest-stable designation, all 16 assets, immutable tag identity and independent production-signature verification. Public-install jobs are tracked separately and availability docs wait for all four outcomes.

Revision 2026-09-30 public validation: Recorded success on all four public-installer targets before updating availability notices and stable commands. Reconciled dated changelog, release notes, docs index, quickstart and platform guides on a follow-up documentation branch; signed assets and tag remain unchanged.

Revision 2026-09-30 documentation handoff: Recorded repeated full local verification for the publication-doc update, reconciled the GitHub release body and retained normal PR review for current-main availability docs. Use `gh pr view codex/stable-0.2.0-publication` for that branch's final hosted checks and review status.

Revision 2026-09-30 final reconciliation: PR #70's head `a41c2f426b4c32e4a2aaeab3732b511a23a69d56` passed [CI 36742309087](https://github.com/openassistuk/openassist/actions/runs/36742309087), [CodeQL 36742309006](https://github.com/openassistuk/openassist/actions/runs/36742309006), [live macOS 36742309157](https://github.com/openassistuk/openassist/actions/runs/36742309157) and [artifacts/signing 36742309540](https://github.com/openassistuk/openassist/actions/runs/36742309540), with publication skips expected. The maintainer merged it on September 30 at 16:31:43Z. Actual merged-main [CodeQL 36744863974](https://github.com/openassistuk/openassist/actions/runs/36744863974) passed; [CI 36744864202](https://github.com/openassistuk/openassist/actions/runs/36744864202) passed builds/tests/coverage but failed both audits with five high and two moderate Axios findings on all three platforms. Local final verification independently reproduced that failure. Both releases' signed metadata and public asset sizes/digests still match; release bodies match checked-in notes. Preserve the earlier successful audit evidence as dated results and link the newly authorized source repair separately.
