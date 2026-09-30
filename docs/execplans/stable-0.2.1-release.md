# Prepare and publish the 0.2.1 security patch

This living ExecPlan follows `.agents/PLANS.md`. Maintain Progress, Surprises & Discoveries, Decision Log and Outcomes & Retrospective as evidence arrives.

## Purpose / Big Picture

Deliver the merged Axios security repair to packaged Linux/macOS installations through a new signed stable release. Existing 0.2.0/rc.1 assets remain immutable and contain affected Axios 1.18.0; 0.2.1 must contain 1.20.0. Also remove Node DEP0190 warnings from Windows source command launches by executing pnpm directly with literal arguments. Operators can observe the repair by selecting stable through the installed updater after publication and checking version 0.2.1.

## Progress

- [x] (2026-09-30 18:16Z) Fast-forwarded local main to PR #71 merge `c2b34677bf19558a302fc941fa5accdbf0c60c74`, pruned the deleted remote branch and deleted merged local `codex/fix-axios-release-docs`.
- [x] Verified merged-main CI [36757344528](https://github.com/openassistuk/openassist/actions/runs/36757344528) and full CodeQL [36757344449](https://github.com/openassistuk/openassist/actions/runs/36757344449) passed; both audits have zero findings on all three quality platforms and no open scanner alerts remain.
- [x] Created `codex/release-0.2.1`; located shell-based Windows pnpm/readiness launches causing DEP0190 warnings.
- [x] Implemented shell-free command resolution and 10 focused command-runner tests, including real Windows captured/streaming literal-argument execution. Corrected the developer fixture and passed its isolated local-instance test.
- [x] Reconciled root/CLI/daemon 0.2.1 versions, changelog, new release notes, README/AGENTS, docs index, test matrix, release maintenance and PR #71's final merge evidence. All 11 docs-truth checks passed, including executable version/flag checks.
- [x] (2026-09-30 18:53Z) Full `pnpm verify:all` passed: Vitest 522 passed/1 skipped; Node 205 passed/6 skipped; coverage Node 124 passed/5 skipped. Vitest statements 83.13%, branches 74.19%, functions 85.85%, lines 84.10%; Node statements/lines 80.11%, branches 73.44%, functions 86.54%. Both audits report zero at every severity; the log contains no DEP0190 warning. Two Node skips require Git Bash on PATH and receive supplementary checks below; remaining skips are explicit platform exclusions.
- [x] Supplementary Git Bash checks passed both previously skipped public-installer syntax/failure cases. Reviewed the final code/docs/test changes for regressions, secrets and unrelated edits; dependency lock and published assets are unchanged.
- [x] Opened and attached [PR #72](https://github.com/openassistuk/openassist/pull/72), source revision `3938affee8d1c4c2fbeb1295e796cb23051bb489`.
- [x] Corrected the hosted Windows npm layout: pnpm 12.5.1 install.js writes native pnpm.exe at the package root. Covered both global/local npm paths plus its mjs wrapper; 17 focused command-runner/setup-hub tests passed. An actual isolated npm install of pinned pnpm 12.5.1 passed captured/streaming commands and the shell-free prerequisite probe with empty stderr.
- [x] (2026-09-30 19:07Z) Full verification with actual native pnpm 12.5.1 and Git Bash passed: Vitest 524 passed/1 skipped, Node 207 passed/4 skipped, coverage Node 126 passed/3 skipped. Vitest statements 83.13%, branches 74.19%, functions 85.85%, lines 84.10%; Node statements/lines 80.11%, branches 73.43%, functions 86.54%. Both audits are zero at every severity; no DEP0190 warning in `coverage/release-0.2.1-native-verify.log`.
- [x] (2026-09-30 19:14Z) Pushed corrected source revision `8a8f407ae6810a53aab04e41c054961c1d6c516f`; all 13 hosted checks passed: [CI 36763518636](https://github.com/openassistuk/openassist/actions/runs/36763518636), [full CodeQL 36763518704](https://github.com/openassistuk/openassist/actions/runs/36763518704), [live macOS 36763518798](https://github.com/openassistuk/openassist/actions/runs/36763518798) and [native artifacts/signing 36763518960](https://github.com/openassistuk/openassist/actions/runs/36763518960). The retained three-platform CI log has zero production/full audit counts and no DEP0190/warning annotation. Separate queries returned zero open CodeQL alerts and zero review threads. Initial Windows failure remains historical evidence; publish/public-install skip on PRs. Documentation-evidence revisions receive their own checks on the PR's actual head.
- [x] (2026-09-30 23:08Z) Maintainer merged PR #72 at `a30ebc18b50a5a4d023f8cf78a7d2b9b1b97f89a`; merged-main [CI 36787999719](https://github.com/openassistuk/openassist/actions/runs/36787999719) and [full CodeQL 36787999708](https://github.com/openassistuk/openassist/actions/runs/36787999708) passed. All three quality platforms report zero production/full audits. Local main was fast-forwarded, the merged stale branch deleted, and separate scanner/review-thread queries returned no open entries. The maintainer then explicitly authorized publication. Created immutable `v0.2.1` at that exact commit and added only that tag to the protected environment without changing reviewer protection.
- [x] Reproduced review comment 1 with real Windows subprocesses: both captured and streaming calls bypassed an unsupported first shim and ran a later executable. Both new regressions failed before the fix.
- [x] Return explicit resolution errors for unsupported first shims and missing selected-PATH pnpm; captured/streaming calls reject before spawn and source readiness marks the prerequisite unavailable. All 19 focused command-runner/setup-hub tests passed.
- [x] (2026-09-30 21:50Z) Full review-fix `pnpm verify:all` passed with native pnpm 12.5.1 and Git Bash: Vitest 526 passed/1 skipped; Node 208 passed/4 skipped; coverage Node 127 passed/3 skipped. The real CLI regression passed in both Node runs. Vitest statements 83.11%, branches 74.19%, functions 85.85%, lines 84.09%; Node statements/lines 80.11%, branches 73.54%, functions 86.54%. Both audits remain zero at every severity; no DEP0190 warning in `coverage/release-0.2.1-review-fix-verify.log`. Final diff inspection and whitespace checks passed.
- [x] (2026-09-30 21:58Z) Pushed review fix `6b9b0de5378c5ead691c6a5891eb8af89b35b4e7`; all 13 checks passed: [three-platform quality 36782034373](https://github.com/openassistuk/openassist/actions/runs/36782034373), [full CodeQL 36782034425](https://github.com/openassistuk/openassist/actions/runs/36782034425), [live macOS 36782034500](https://github.com/openassistuk/openassist/actions/runs/36782034500) and [four native packages/signing 36782034546](https://github.com/openassistuk/openassist/actions/runs/36782034546). All three quality platforms report zero production/full audit findings, with no DEP0190 or warning annotation. The Intel Mac package log retains successful-download slowness warnings; these are not suppressed. Separate queries found zero open scanner alerts and zero review threads. Documentation-only reconciliation revisions receive their own checks, recorded on PR #72's actual head; publication/public-install still skip on PRs.
- [x] (2026-09-30 23:08Z) Dispatched [publication 36789528574](https://github.com/openassistuk/openassist/actions/runs/36789528574) from `v0.2.1` with `tag=v0.2.1`, `channel=stable`, `publish=true`; it resolves reviewed commit `a30ebc18b50a5a4d023f8cf78a7d2b9b1b97f89a`.
- [x] (2026-09-30 23:17Z) All four native builds, Linux candidate `pnpm verify:all` and signing-contract checks passed. Approved only this authorized protected release job through the existing maintainer reviewer; [v0.2.1 stable](https://github.com/openassistuk/openassist/releases/tag/v0.2.1) published at 23:17:06Z with all 16 assets and is GitHub latest stable.
- [x] Independently verified both production RSA/SHA-256 signatures against `release-public.pem`, exact version/commit/channel, unchanged compatibility and all 16 GitHub asset digests against downloaded metadata or signed indexes/manifests. The downloaded Linux x64 archive matches its signed size/hash and contains Axios `1.20.0`.
- [x] (2026-09-30 23:21Z) [Publication 36789528574](https://github.com/openassistuk/openassist/actions/runs/36789528574) concluded success: all four public stable-channel/exact-version installations and data-preserving uninstalls passed. Exact-tag Linux candidate verification passed Vitest 524/3 skipped, Node 211/1 skipped and coverage Node 129/1 skipped; unchanged coverage gates and both production/full audits passed with zero findings. No DEP0190 or warning annotations were emitted; transient registry slowness remains visible in the build logs.
- [x] Reconciled README/AGENTS, changelog date/publication entry, docs index, quickstart/platform guides, release maintenance/notes, provider/security/testing delivery notices and the repair plan using actual publication evidence. Older immutable releases and dated verification evidence remain intact; fresh provider/channel and second-account testing gaps remain explicit.
- [x] (2026-09-30 23:29Z) Publication-documentation `pnpm verify:all` passed: Vitest 526/1 skipped, Node 208/4 skipped, coverage Node 127/3 skipped, all unchanged coverage gates and zero production/full audit findings. All 11 docs-truth checks and final diff/whitespace review passed; changes are documentation only. Retained log: `coverage/release-0.2.1-publication-docs-verify.log`.
- [ ] Merge the separate availability/evidence documentation PR after its exact-head checks and required maintainer review. Current-head hosted results are recorded on that PR independently of the successful signed release.

## Surprises & Discoveries

Review comment 1 showed that returning bare pnpm at an unsupported shim does not stop Windows lookup: child_process ignores the cmd shim and can execute a later pnpm.exe. Actual captured and streaming regressions with a copy of Node as the later native executable both returned success before the fix. Resolution must express failure rather than returning a bare command; the readiness caller must handle it as unavailable. The new CLI fixture needs complete source install/config/env state so it reaches prerequisite checks instead of handing back to bootstrap.

Merged-main Windows CI emits DEP0190 because source readiness uses spawnSync with shell enabled and command arguments. The command runner also uses that pattern for pnpm. This host has a Corepack pnpm.cmd shim whereas CI installs the pnpm 12 native executable via npm; direct invocation must support both layouts while honoring the provided PATH and leaving missing-tool checks truthful. Initial full verification passed 522 Vitest tests but exposed the developer-instance integration fixture's custom Windows cmd shim: the resolver selected a later real pnpm and attempted a frozen install on the synthetic checkout. Stop at an unfamiliar first shim and adapt the fixture to npm's known entrypoint layout; retain isolation and credential checks. The installed audio-decode 2.2.3 optional Baileys peer has an upstream rename deprecation. Removing that warning requires an independently validated decoder migration; merely downgrading or hiding it is not a repair.

## Decision Log

Publication authorization: the maintainer's instruction to proceed covers stable v0.2.1 from reviewed PR #72's actual merge. Tag the checked main commit, preserve reviewer protection, approve only the resulting release job, and update availability only after public installation and independent signature verification pass. Date/author: 2026-09-30, Codex.

Publication reconciliation: keep tag `v0.2.1` and all signed assets at the reviewed `a30ebc1` source. Update current availability/evidence through a separate documentation PR after all four public checks pass; this does not rebuild packages or imply fresh account certification. Use the UTC publication date, September 30, while preserving earlier dated entries. Date/author: 2026-09-30, Codex.

Review fix: use a command/args-or-error result for Windows pnpm resolution. Missing or unsupported first selections produce bounded actionable errors; no caller restarts PATH lookup. The runner rejects before process creation and source readiness returns false. Keep known layouts and Unix behavior unchanged. Date/author: 2026-09-30, Codex.

Use 0.2.1 rather than changing existing signed artifacts. The user requested propagation after merging the source repair; immutable artifacts need a new reviewed release. Keep public availability on 0.2.0 until protected publication and actual public installation succeed. Preserve unchanged database compatibility version 1, build features, access controls and platform support. Windows remains a quality/source-development platform. Resolve only known pnpm executable/shim layouts on the selected PATH and launch without a shell; do not silence Node warnings. Date/author: 2026-09-30, Codex.

## Outcomes & Retrospective

Stable v0.2.1 is published from reviewed PR #72/main `a30ebc18b50a5a4d023f8cf78a7d2b9b1b97f89a` and selects as GitHub latest stable. All native builds, exact-tag candidate quality/coverage/audits, protected production signing and four-target public installation passed. Independent checks verified both production signatures, all 16 asset digests and Axios `1.20.0` in the downloaded Linux x64 archive. Review comment 1's captured/streaming and CLI readiness regressions passed complete local/hosted gates. Current availability/evidence changes await their separate documentation PR review; earlier evidence remains dated.

Main cleanup, merged repair verification, candidate implementation/docs, corrected native-PATH local verification and final-head hosted checks are complete. Ignored evidence includes `coverage/release-0.2.1-publication.log`, `coverage/release-0.2.1-public-assets.json`, `coverage/check-v0.2.1-release.mjs` and downloaded signed metadata under `coverage/current-public-release-check/v0.2.1`; prior logs and both JSON audits remain retained. [PR #72](https://github.com/openassistuk/openassist/pull/72) is merged and the authorized stable release is verified. Historical v0.2.0/rc.1 packages remain unchanged and affected; operators must explicitly update to receive this repair. Fresh live provider/channel certification remains unverified and upstream audio-decode deprecation metadata remains disclosed. No warning is hidden or audit gate weakened.

## Context and Orientation

`pnpm-workspace.yaml` and `pnpm-lock.yaml` already resolve Axios 1.20.0 through WhatsApp/Baileys. The prior repair and its evidence are in `docs/execplans/post-release-axios-audit-2026-09-30.md`. Root `package.json`, `apps/openassist-cli/package.json` and `apps/openassistd/package.json` define the public application version. `apps/openassist-cli/src/lib/command-runner.ts` launches source lifecycle commands; `source-update-plan.ts` probes git/pnpm/node readiness. The same shell-free resolver must serve both paths. Tests in `tests/vitest/command-runner.test.ts` cover execution, and `tests/node/cli-command-integration.test.ts` covers truthful missing prerequisites.

`.github/workflows/release.yml` builds Linux glibc/macOS x64/arm64, checks native SQLite/media and lifecycle transitions, tests signing with ephemeral keys, then manually publishes reviewed tag notes through the protected release environment. Public installation is a separate four-target gate. `release-public.pem` is public; production secrets stay in the environment. Main requires a reviewed PR and strict checks.

## Plan of Work

Milestone 1 adds known-layout Windows pnpm resolution and literal-argument/no-shell tests without changing Linux/macOS execution or the pinned package manager. Bump only the three application manifests to 0.2.1, create `docs/releases/v0.2.1.md`, collect the security delta and warning correction under the new changelog heading, link the candidate from README/docs index/release maintenance, and reconcile PR #71's actual final-head/merge checks. Update root contributor guidance for direct pnpm launches and retain historical release evidence.

Milestone 2 runs focused tests and `pnpm verify:all`, including unchanged coverage and production/full audits. Review for regressions, accidental changes and secrets; open the preparation PR and wait for exact-head quality, CodeQL, macOS LaunchAgent, four artifact builds and signing contract. Inspect open scanner alerts and unresolved review threads separately. Publication jobs should skip on the PR.

Milestone 3 follows required review/merge before tagging the exact checked main revision. Add only the exact v0.2.1 tag to the protected environment's deployment rules. Dispatch release.yml from that tag with tag=v0.2.1, channel=stable, publish=true. Approve only the authorized protected job, retain logs and require every public-install target to pass. Independently verify both public metadata signatures and all listed asset hashes. Record actual results and update availability through a reviewed follow-up PR; do not infer live certification.

## Concrete Steps

Run in `C:/Users/dange/Coding/openassist` with Node 24.21.0 and pnpm 12.5.1:

    pnpm exec vitest run tests/vitest/command-runner.test.ts
    pnpm verify:all
    git diff --check

The full gate passed with the counts above. Git Bash was installed but absent from the shell's PATH; adding `C:/Program Files/Git/bin` for the focused invocation and running `pnpm exec tsx --test --test-name-pattern='keeps public' tests/node/install-bootstrap-idempotence.test.ts` passed both skipped public-installer cases without modifying environment settings persistently.

Retain generated logs under ignored `coverage/`. Create PR descriptions with a body file. Use `gh pr checks` and exact-head Actions runs to record hosted evidence. After merge use `git fetch origin --prune --tags`, fast-forward clean main and delete only merged stale feature branches. Publication uses `gh workflow run release.yml --ref v0.2.1 -f tag=v0.2.1 -f channel=stable -f publish=true` only once the reviewed tag exists.

## Validation and Acceptance

PnPM launches preserve spaces and shell metacharacters literally, both captured and streaming paths work, and missing PATH tools remain missing. Full verification must pass unchanged coverage/audit gates with no DEP0190 warnings. Record upstream dependency deprecations separately; do not claim all warnings cleared if any remain. Candidate notes, three manifest versions, CLI version output and changelog must agree at 0.2.1. All four native candidate artifacts and signing contract must pass before publication. After publication, stable discovery and exact-version installation must report 0.2.1 on all four targets with signatures verified and operator state retained. No additional fresh-host provider/channel testing is implied.

## Idempotence and Recovery

Never move existing tags or replace signed assets. A failed preparation check is repaired on the branch. A failed public-install check leaves publication visible for investigation; retry verification-only mode without rebuilding or bypassing signatures. Preserve config, credentials and databases. Do not relax coverage, audit or reviewer protection. If review is pending, leave the concrete checked PR for the maintainer rather than bypassing main protection.

## Artifacts and Notes

Current latest stable is v0.2.1, published at 2026-09-30 23:17:06 UTC with all 16 signed assets. Older v0.2.0 stable and v0.2.0-rc.1 preview remain available with unchanged affected Axios. Their earlier compilation, signing and public-install success remain dated evidence. Source checks, protected publication and public verification are independently tied to their exact commits above.

## Interfaces and Dependencies

Keep RunCommandOptions/CommandRunner contracts unchanged. Add resolveCommandInvocation(command, args, options, platform) returning either the executable plus argument array or an explicit error, using existing node:fs/node:path and child_process modules. Runner and readiness callers must handle the error before process creation. No new production dependencies or shell interpolation. Application/database compatibility and provider/channel behavior are unchanged.

Revision note (2026-09-30): initialized from actual merged-main evidence, immutable-release requirements and the observed Windows warning; remaining review/publication work is explicit.

Revision note (2026-09-30 integration): full verification revealed a custom test shim; preserve PATH precedence at unknown shims and use a realistic npm fixture before rerunning the gate.

Revision note (2026-09-30 local gate): recorded actual passing counts/coverage/audits and separate docs checks; explicitly distinguished Bash availability skips and outstanding hosted/publication evidence.

Revision note (2026-09-30 hosted Windows failure): source CI failed three setup-hub tests because the assumed npm native path was wrong. The pinned pnpm 12.5.1 tarball's install.js places pnpm.exe at the package root, not bin/. Add that global/local npm layout and the wrapper's bin/pnpm.mjs script entrypoint; verify a real isolated installation before rerunning checks. Linux artifacts, macOS ARM artifacts, CodeQL and live macOS passed on the initial revision; do not infer corrected-head results from those successes.

Revision note (2026-09-30 native validation): an isolated npm-installed pnpm 12.5.1 verified the corrected native path and all three invocation surfaces; all four first-revision artifacts and signing contract passed in [run 36761995528](https://github.com/openassistuk/openassist/actions/runs/36761995528). The full native-PATH gate and corrected-head hosted results remain separate requirements.

Revision note (2026-09-30 native full gate): recorded complete final local counts/coverage and zero audits/warnings using the same npm native layout as hosted Windows, with Git Bash tests included. Hosted checks must validate the pushed correction independently.

Revision note (2026-09-30 hosted reconciliation): recorded actual successful corrected-source runs, every native artifact/signing gate, clear audits/scanner/review-thread queries and required review. Later documentation-head checks remain separately visible on PR #72; no protected publication or public-install success is inferred.

Revision note (2026-09-30 review fix): recorded failing-before/passing-after real subprocess regressions for comment 1, explicit resolution/error handling, the passing CLI prerequisite regression and complete local gate evidence. Prior candidate success does not certify this fix's pending hosted checks.

Revision note (2026-09-30 review-fix hosted reconciliation): recorded actual successful checks on the source fix, clear three-platform audits and scanner queries, and the remaining transient Intel Mac registry warnings. Final documentation-head checks remain visible on PR #72; no protected publication is inferred.

Revision note (2026-09-30 publication start): reconciled the actual PR #72 merge, checked main revision, maintainer rollout authorization, exact immutable tag and protected manual workflow. Public availability remains pending its independent gates.

Revision note (2026-09-30 publication completion): recorded actual protected publication, latest-stable selection, all four successful public installation/removal jobs, fresh exact-tag audits, independent signatures/digests and the downloaded Linux Axios version. Updated availability only after these gates passed; the documentation PR and live account checks remain separate.

Revision note (2026-09-30 documentation verification): recorded the complete passing publication-documentation local gate and final review. Required documentation PR checks/review remain separate from the immutable, verified public release.
