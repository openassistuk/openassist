# Publish and verify the 0.2.6 maintenance release

This living ExecPlan follows `.agents/PLANS.md`. Keep Progress, Surprises & Discoveries, Decision Log and Outcomes & Retrospective current. The maintainer explicitly authorized merging PR #93 and proceeding with the 0.2.6 maintenance release, then confirmed performing the merge and deleting its stale feature branch. This continuation covers exact-tag authorization, normal protected approval/publication, independent signature/digest checks, public installation and a reviewed availability-documentation follow-up. It does not authorize another version, weakened reviews, old asset replacement or paid/live provider calls.

## Purpose / Big Picture

Deliver the maintenance repairs already implemented and verified in PR #93 to packaged operators as signed stable v0.2.6. The user-visible result is a publicly installable release containing the dependency security floors, optional decoder migration and reliable maintenance checks. Existing installs receive the fixes through an explicit update. Preserve the distinction between source checks, exact-main verification, protected publication, public installation and live provider certification.

## Progress

- [x] (2026-11-03) Verify PR #93 merged at 17:44:41 UTC as `2d3c498a5c0534889edf89c875ec69c0e03296d3`; main and local checkout agree. Prune the deleted remote feature ref and remove its fully merged local branch.
- [x] (2026-11-03) Verify all seven updates from PR #92 on merged main, including Azure Identity's newer patched 4.14.1 parent; close PR #92 as superseded.
- [x] (2026-11-03) Confirm root/CLI/daemon versions 0.2.6, reviewed release notes, no existing v0.2.6 tag, and protected release environment with existing reviewer rules and seven exact older tag policies. Snapshot environment, policies and v0.2.5 immutable identity/assets under ignored Git evidence storage.
- [x] (2026-11-03) Exact-main CI `41687188216` and full CodeQL `41687188189` pass attempt 1 with every required job. All three platform production/full audits are zero; main analysis `2088137385` has zero results. Open code-scanning, Dependabot/secret alerts and unresolved PR #93 review threads are empty.
- [x] (2026-11-03 17:55 UTC) Create/push annotated v0.2.6 object `2cfb58d6b20540dae0c3a3ac6cc6aa5700b1a84a` pointing only to the verified merge; read-only publication preflight passes. Add only exact v0.2.6 and compare snapshots: all seven older policies and complete reviewer/protection rules are unchanged.
- [x] (2026-11-03) Dispatch stable publication [41689000939](https://github.com/openassistuk/openassist/actions/runs/41689000939) from the exact tag. Attempt 1 passed the preflight, both Linux packages (including full candidate quality/live lifecycle/zero audits) and Intel macOS. Apple Silicon stayed queued without a runner or steps for over twelve minutes; cancel that unassigned work and retry only failed/cancelled jobs as attempt 2. Native/signing completion and normal protected approval remain pending.
- [x] (2026-11-03 18:13 UTC) All four native packages and ephemeral signing contracts pass on attempt 2, retaining three successful attempt-1 packages and Linux full candidate/live lifecycle/zero-audit evidence. Re-run exact-main publication preflight and verify full analysis 2088137385 still has zero results. Normal existing reviewer approval accepts deployment 7526898573 for exact v0.2.6/merge 2d3c498; no reviewer/protection edit, bypass or signing-key retrieval. Protected publish independently rechecks the same prerequisites.
- [x] (2026-11-03 18:14 UTC) Protected publication succeeds at 18:13:57 UTC with sixteen assets, release ID `433056724` and GitHub latest stable selecting v0.2.6. Independently verify both production RSA/SHA-256 signatures against `release-public.pem`, all sixteen GitHub asset sizes/digests against downloaded metadata or signed index/manifest, exact stable build identity/private Node/compatibility/features and unchanged v0.2.5 tag/release/assets. Final environment snapshot confirms unchanged protection/reviewers and seven older policies, with only exact v0.2.6 added.
- [x] (2026-11-03 18:18 UTC) All four public-install targets pass stable-channel and exact-version installation, CLI/daemon versions, update planning and data-preserving uninstall. Publication `41689000939` completes successfully on attempt 2, without a public-verification retry or asset replacement.
- [x] (2026-11-03) After public verification, create `codex/release-0.2.6-availability` from the exact release merge and update root/operator/contributor/testing/security/channel availability notes, exact pins, changelog and this evidence. Preserve historical behavior and release records; no runtime, dependency, workflow, gate or test-deadline changes.
- [x] (2026-11-03) All eleven focused docs-truth contracts pass: links/anchors/index, executable versions, flags, workflow claims, coverage thresholds/scope and test inventory. Review the documentation-only diff, retaining every maintenance changelog entry and dated earlier evidence. No source/dependency/workflow/credential material is added.
- [ ] Commit availability metadata and update GitHub release title/body without modifying assets. Push/open the follow-up as a normal reviewed PR.
- [ ] Pass the full required local and hosted gates and record final exact-head/scanning/review reconciliation on the follow-up PR; mark it ready for normal maintainer review without bypassing protection or moving the release tag.

## Surprises & Discoveries

The first normal merge attempt was refused because GitHub required one approving review and auto-merge was disabled. No review bypass or repository-rule change was made by the agent. The maintainer subsequently confirmed merging #93; GitHub records its exact merge above. Publication must target that merge, not a later documentation/evidence commit.

PR #93's final head `b01f0260f79aa343287d84f3ab09887ba67830b5` passes all thirteen applicable PR checks and seven workflows. CI `41678921968`, PR CodeQL `41678921946`, full branch CodeQL `41678907564`, live launchd `41678922038` and service smoke `41678913478` pass attempt 1. Native/signing `41678922014` and lifecycle E2E `41678918798` pass attempt 3 after preserving deliberate queue cancellations and hosted macOS arm64 acquisition failures before any steps. Earlier head `3606366` additionally records an Intel artifact-upload DNS failure after successful portable smoke, followed by an unchanged-code retry. These infrastructure outcomes are not source/test failures and do not certify the later merge by themselves.

Before authorization the release environment permitted only v0.2.0-rc.1 and v0.2.0 through v0.2.5; exact v0.2.6 is now its only addition. Normal approval must use its existing required-reviewer rule; do not alter the reviewer list or bypass it. Preserve the complete protection configuration in ignored snapshots, while keeping private operational details out of public documentation. Signing secrets remain exclusively in the protected runner job.

## Decision Log

Decision (2026-11-03): the maintainer's explicit release instruction supersedes preparation-only limits in the [maintenance plan](maintenance-0.2.6-2026-11-03.md). Release only exact 0.2.6 from PR #93's merge, with an immutable annotated tag, existing required review, exact-main checks and protected publication. Add only its exact tag policy; retain all older policies and reviewer protection.

Decision (2026-11-03): public availability remains v0.2.5 until signing/publication, independent metadata verification and four-target public installation pass. Keep this release plan uncommitted during tag preparation, then include it in the separately reviewed availability follow-up so recording evidence cannot move the release target.

Decision (2026-11-03): do not retry a published release by rebuilding or replacing assets. If public installation fails, preserve the failure and use `verify_published=true` against the unchanged public assets after diagnosis. Live provider/account/channel and replacement-host certification remain separate.

## Outcomes & Retrospective

PR #93 is merged and PR #92 is closed as superseded. Exact-main CI/full CodeQL pass attempt 1 with zero audits and analysis results. Annotated v0.2.6 targets only `2d3c498`, and preflight/rechecks pass. Only the exact new tag was added to the release environment; final comparison confirms reviewers, protections and seven older policies unchanged. Publication `41689000939` succeeds on attempt 2, including all four native packages, Linux full candidate/live lifecycle/zero audits, ephemeral signing, normal protected approval/production signing and all four public-install targets. Preserve attempt 1's unassigned Apple Silicon queue cancellation separately. Stable v0.2.6 was published at 18:13:57 UTC with sixteen assets; both production signatures and all sixteen GitHub asset sizes/digests independently verify. Signed identity/channel/runtime/compatibility/features match the exact merge; older v0.2.5 tag/release/assets remain unchanged. The availability follow-up is now prepared on its own branch, with focused/full local validation, normal reviewed PR and hosted checks still pending. Prior maintenance verification passed 690 Vitest cases/one existing skip and 257 Node cases/six existing skips, unchanged coverage gates and zero audits. Live provider/account/channel and replacement-host certification remain unverified separately.

## Context and Orientation

`package.json`, `apps/openassist-cli/package.json` and `apps/openassistd/package.json` define version 0.2.6. `docs/releases/v0.2.6.md` and the matching changelog contain the reviewed candidate scope. PR #93 updates production Undici, follow-redirects, Zod and Azure Identity/MSAL; it pairs Vitest/coverage and patches development Vite/coverage glob dependencies. The optional @audio/decode 4.2.0 alias and exact Baileys patch preserve waveform output and lazy codec assets. No config/database compatibility version or privilege expansion is introduced.

`.github/workflows/release.yml` builds Linux glibc/macOS x64/arm64, runs portable media/onboarding and live Linux lifecycle gates, verifies ephemeral signing, then waits for the protected release environment. `scripts/release/check-publication-checks.mjs` checks the latest matching main CI/full CodeQL runs and every required current-attempt job for the exact tag commit, both before publication and again in publish. A prior green run or PR-only analysis is insufficient. `scripts/release/sign.mjs` uses the protected signing key and pinned public trust anchor; never read private signing material locally.

The signed release has sixteen assets: four application archives, four compressed bootstrap runtimes, four standalone bootstrap verifiers, JSON manifest/signature and text index/signature. `public-install` tests stable-channel and exact-version installation/removal on all four platforms. The previous immutable v0.2.5 remained the public stable target during preparation; verified v0.2.6 is now latest stable.

## Plan of Work

First wait for main CI/full CodeQL on `2d3c498a5c0534889edf89c875ec69c0e03296d3`; inspect every job and audit counts, full analysis results and open scanning/review state. Preserve infrastructure failures and use bounded unchanged-code retries when justified; never lower gates or accept skipped/missing evidence. Create the annotated tag only for that exact commit and run the repository's publication preflight from the matching checkout/tag. The GitHub token may be passed in a child environment but must never be printed or persisted.

Snapshot and compare the release environment's protection rules and older exact-tag policies. Add only `{name: "v0.2.6", type: "tag"}` after confirming it is missing; compare snapshots to ensure reviewers, prevent-self-review and all older policies are unchanged. Dispatch the existing stable publication workflow from v0.2.6. Require all four packages, Linux full candidate quality/zero audits, live lifecycle and ephemeral signing; recheck main prerequisites before approving the normal protected deployment. Keep all credentials in the protected job.

After production publication, verify both RSA/SHA-256 metadata signatures against `release-public.pem`, the exact build/version/channel/features, all sixteen asset sizes/digests and the unchanged previous release. Require all four public-install jobs to pass. Then create `codex/release-0.2.6-availability` from merged main, commit updated README/AGENTS/docs index, changelog, release notes, relevant current guides and this evidence. Preserve dated older release history. Run docs truth and `pnpm verify:all` on committed follow-up metadata, open a normal reviewed PR and reconcile its final actual-head checks there without an endless evidence-only commit loop.

## Concrete Steps

Work in `C:\Users\dange\Coding\openassist` with Node >=24.21.0 <25 and pnpm 12.5.1. Resolve every SHA from GitHub/ Git rather than copying a future evidence commit.

    gh run view 41687188216 --json status,conclusion,jobs
    gh run view 41687188189 --json status,conclusion,jobs
    git tag -a v0.2.6 2d3c498a5c0534889edf89c875ec69c0e03296d3 -m "OpenAssist 0.2.6 maintenance release"
    git push origin v0.2.6
    gh workflow run release.yml --ref v0.2.6 -f tag=v0.2.6 -f channel=stable -f publish=true -f verify_published=false

Run `scripts/release/check-publication-checks.mjs` with `RELEASE_TAG=v0.2.6`, `GITHUB_SHA` equal to the verified merge, `GITHUB_REPOSITORY=openassistuk/openassist` and a child-only authenticated GH_TOKEN. It must print successful exact-main CI and CodeQL evidence. Set no signing-key variable outside the protected runner. Store public snapshots, run metadata and downloaded signed metadata under ignored `.git/release-0.2.6`; never store authentication tokens.

## Validation and Acceptance

Exact-main CI must pass workflow lint and Linux/macOS/Windows quality/coverage; full CodeQL must run actual JavaScript/TypeScript analysis for the same commit. Registry reports must be clean. The publication preflight and its protected recheck must succeed. The signed manifest must identify version 0.2.6, stable channel, exact commit `2d3c498a5c0534889edf89c875ec69c0e03296d3`, private Node 24.21.0, config/database compatibility 1 and managed-one-shots-v1. Verify both signatures and every asset, then require all four public installation targets. Existing operators can explicitly update to 0.2.6 afterward; do not claim account/provider/channel certification from these checks.

For the availability follow-up, validate commands/flags against CLI registries, workflow descriptions against YAML, coverage claims against package/Vitest configuration and test inventory against actual suite files. Run `pnpm verify:all`, preserve its exact revision/results, and finish with a clean diff/security/secret review. Main review and any future rollout approval remain normal gates, never administrative bypasses.

## Idempotence and Recovery

Never move v0.2.6 after creation or replace published assets. Check for existing tags, policies, releases and deployments before retrying a mutation. A failed pre-publication package/signing job may be retried with unchanged code, retaining its original outcome. A published release with failed public verification remains published but unvalidated; use verification-only mode, not republishing. Existing operator config/data/services and credentials remain untouched. Availability updates cannot change the release tag. Preserve prior v0.2.5 tag and asset identities from snapshots.

## Artifacts and Notes

The merge is `2d3c498a5c0534889edf89c875ec69c0e03296d3`, from [PR #93](https://github.com/openassistuk/openassist/pull/93). Main CI is [41687188216](https://github.com/openassistuk/openassist/actions/runs/41687188216); full CodeQL is [41687188189](https://github.com/openassistuk/openassist/actions/runs/41687188189). PR #92 is closed after programmatic confirmation of its seven updates on main. Ignored snapshots include `environment-before.json`, `policies-before.json`, `v0.2.5-tag-before.json` and `v0.2.5-release-before.json` under `.git/release-0.2.6`.

## Interfaces and Dependencies

Keep runtime/provider/config/channel/tool contracts, shared model catalog and state compatibility unchanged. Retain pnpm build permissions, exact optional decoder/patch/peer wiring, dependency security floors and coverage/audit thresholds. Production signing uses only the existing protected key and public trust anchor. No new runtime dependency, service, scheduled action or privilege is introduced by release delivery.

Revision note (2026-11-03): initialize the authorized stable release continuation after the actual maintainer merge, exact local main update and closure of the superseded dependency PR; preserve all distinct verification/publication stages and prior infrastructure evidence.

Revision note (2026-11-03): record exact-main success/zero audits, immutable annotated tagging, passing publication preflight, narrow environment authorization and stable publication dispatch before protected approval or availability changes.

Revision note (2026-11-03 18:09 UTC): preserve publication attempt 1 after an unassigned Apple Silicon queue, with three successful native packages and no source/test failure, signing or publication. Retry only failed/cancelled work against the unchanged exact tag.

Revision note (2026-11-03 18:13 UTC): record successful four-native/signing completion, fresh exact-main preflight and normal protected approval before production signing/publication and public verification.

Revision note (2026-11-03): record protected publication, independent production signatures/all sixteen GitHub asset digests, old-release/protection immutability, four successful public-install targets and the separately validated availability-docs follow-up. Its final committed-head local/hosted/scanning/review results will be reconciled in the PR Validation section without moving the tag or repeated evidence-only commits.
