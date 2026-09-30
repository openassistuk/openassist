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
- [ ] Push the corrected native-path revision and verify its exact-head hosted checks; initial source-head Windows failure remains historical evidence.
- [ ] Obtain required maintainer review/merge, verify actual merged main, tag its exact revision and authorize only v0.2.1 in the protected release environment.
- [ ] Publish from v0.2.1 with stable selected; verify all four public installs and production signatures, then reconcile availability/evidence through a PR.

## Surprises & Discoveries

Merged-main Windows CI emits DEP0190 because source readiness uses spawnSync with shell enabled and command arguments. The command runner also uses that pattern for pnpm. This host has a Corepack pnpm.cmd shim whereas CI installs the pnpm 12 native executable via npm; direct invocation must support both layouts while honoring the provided PATH and leaving missing-tool checks truthful. Initial full verification passed 522 Vitest tests but exposed the developer-instance integration fixture's custom Windows cmd shim: the resolver selected a later real pnpm and attempted a frozen install on the synthetic checkout. Stop at an unfamiliar first shim and adapt the fixture to npm's known entrypoint layout; retain isolation and credential checks. The installed audio-decode 2.2.3 optional Baileys peer has an upstream rename deprecation. Removing that warning requires an independently validated decoder migration; merely downgrading or hiding it is not a repair.

## Decision Log

Use 0.2.1 rather than changing existing signed artifacts. The user requested propagation after merging the source repair; immutable artifacts need a new reviewed release. Keep public availability on 0.2.0 until protected publication and actual public installation succeed. Preserve unchanged database compatibility version 1, build features, access controls and platform support. Windows remains a quality/source-development platform. Resolve only known pnpm executable/shim layouts on the selected PATH and launch without a shell; do not silence Node warnings. Date/author: 2026-09-30, Codex.

## Outcomes & Retrospective

Main cleanup, merged repair verification, candidate implementation/docs and corrected native-PATH full local verification are complete. The candidate passes existing coverage/audit gates without DEP0190. Ignored evidence logs are `coverage/release-0.2.1-verify.log` and the final `coverage/release-0.2.1-native-verify.log`; both JSON audits remain under `coverage/audit`. [PR #72](https://github.com/openassistuk/openassist/pull/72) is open. Corrected-head hosted checks, required review and signed publication remain pending. Historical public releases are intact; fresh live provider/channel certification remains unverified and upstream audio-decode install deprecation remains disclosed.

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

Current published releases are v0.2.0 stable and v0.2.0-rc.1 preview. Earlier compilation, production signing and public-install success are dated evidence; both contain the affected old Axios version. Candidate build logs and new publication evidence must identify their exact commits.

## Interfaces and Dependencies

Keep RunCommandOptions/CommandRunner contracts unchanged. Add resolveCommandInvocation(command, args, options, platform) returning the executable plus argument array, using existing node:fs/node:path and child_process modules. No new production dependencies or shell interpolation. Application/database compatibility and provider/channel behavior are unchanged.

Revision note (2026-09-30): initialized from actual merged-main evidence, immutable-release requirements and the observed Windows warning; remaining review/publication work is explicit.

Revision note (2026-09-30 integration): full verification revealed a custom test shim; preserve PATH precedence at unknown shims and use a realistic npm fixture before rerunning the gate.

Revision note (2026-09-30 local gate): recorded actual passing counts/coverage/audits and separate docs checks; explicitly distinguished Bash availability skips and outstanding hosted/publication evidence.

Revision note (2026-09-30 hosted Windows failure): source CI failed three setup-hub tests because the assumed npm native path was wrong. The pinned pnpm 12.5.1 tarball's install.js places pnpm.exe at the package root, not bin/. Add that global/local npm layout and the wrapper's bin/pnpm.mjs script entrypoint; verify a real isolated installation before rerunning checks. Linux artifacts, macOS ARM artifacts, CodeQL and live macOS passed on the initial revision; do not infer corrected-head results from those successes.

Revision note (2026-09-30 native validation): an isolated npm-installed pnpm 12.5.1 verified the corrected native path and all three invocation surfaces; all four first-revision artifacts and signing contract passed in [run 36761995528](https://github.com/openassistuk/openassist/actions/runs/36761995528). The full native-PATH gate and corrected-head hosted results remain separate requirements.

Revision note (2026-09-30 native full gate): recorded complete final local counts/coverage and zero audits/warnings using the same npm native layout as hosted Windows, with Git Bash tests included. Hosted checks must validate the pushed correction independently.
