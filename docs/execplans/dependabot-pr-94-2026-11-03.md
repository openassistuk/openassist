# Validate the routine dependency updates in PR #94


This living ExecPlan follows `.agents/PLANS.md`. Maintain Progress, Surprises & Discoveries, Decision Log and Outcomes & Retrospective. The maintainer requested that PR #94 be sorted after publishing v0.2.6. Work as one agent on the existing PR, retaining its three updates, adding missing release/contributor documentation and validating its final revision. Do not merge without normal required review, change protections, replace published assets or run paid/live provider calls.

## Purpose / Big Picture


Prepare the newer OpenAI SDK, Discord.js and interactive prompt fixes for a future release while preserving OpenAssist's existing provider, channel, setup and security behavior. Operators keep their configured models, authentication, access profiles and attachment limits. Reviewers can inspect an accurately documented PR with passing local/hosted gates and independently checked scanning/review state. These source updates are not included in immutable signed v0.2.6.

## Progress


- [x] (2026-11-03) Confirm PR #94 was created at 17:47:49 UTC after #93 merged, at head `22ae73cd369d838f36a953d8734772bed6b6adfe`. It updates Inquirer prompts 8.7.4 to 8.7.5, Discord.js 14.27.0 to 14.28.0 and OpenAI SDK 7.43.0 to 7.47.0 across four provider manifests, plus the CLI/channel manifests and lockfile.
- [x] (2026-11-03) Diagnose initial live macOS run `41687694538`: no runner acquired, no steps executed, explicit hosted arm64 capacity annotations. Retain failed attempt 1; unchanged attempt 2 passes live LaunchAgent checks at 18:36 UTC. The original head's CI `41687694508`, PR CodeQL `41687694569` and four native packages/ephemeral signing `41687694581` also pass. They do not certify later commits.
- [x] (2026-11-03) Check out local `codex/dependabot-pr-94` tracking the existing Dependabot PR branch. Frozen pnpm 12.5.1 installation passes its supply-chain policy checks without lockfile changes, new peer suppressions or build permissions.
- [x] (2026-11-03) Review the complete manifest/lockfile delta, packaged OpenAI SDK changelog, upstream Inquirer/Discord release notes and affected provider/channel/setup paths. The newer Live Decision union, vendor agents/automations, Responses parse, Realtime and WebSocket APIs are unused in those provider paths. Existing local HTTP/SSE, channel and setup contracts cover the calls actually used.
- [x] (2026-11-03) Add concrete Unreleased notes, README/AGENTS/docs-index pointers, current source readiness/channel/testing notes and this evidence. Review all additions: only documentation extends the original dependency patch; frozen installation leaves the lockfile intact. Preserve dated older records and separate v0.2.6 availability PR #95.
- [x] (2026-11-03) Review the final diff, commit/push metadata as `00a5de3556a68e2f7b64125ff2a9d98cc660a087` on the existing PR and pass full `pnpm verify:all`: 690 Vitest passes/one existing skip, 257 Node passes/six existing skips, unchanged coverage gates and zero production/full audit findings. No runtime fix or new test/gate override is needed.
- [x] (2026-11-03) All seven final-head workflows pass attempt 1: CI `41699354619`, PR CodeQL `41699354796`, full-branch CodeQL `41699417768` (analysis `2088715874`, zero results), native/signing `41699354829`, live macOS `41699354700`, Service Smoke `41699424145` and Lifecycle E2E `41699430023`. Independent paginated default/main/branch/PR alerts, dependency/secret scanning and review threads are empty. The PR Validation section preserves original-head infrastructure attempts separately.
- [x] (2026-11-03 19:26 UTC) The maintainer merges #94 as `aeef9dc56d43fff63a97ab0e5982174e81c66e63`, then #95 as main `665e371d2e1fed08ff2152cf6afaa52ca9cc3bda`, and deletes both branches. Final main tree `61d0cbb198a26346a51f2226a4c87b71ed662975` matches the independently verified combined rehearsal, with full local quality/coverage and zero audits. Fetch/prune and remove both fully merged local branches. Exact-main CI `41703321144`/CodeQL `41703321201` are separate pending checks at this checkpoint; no publication or agent review/protection bypass occurs.

## Surprises & Discoveries


The only original failing job was a hosted allocation failure, not a source/test failure. GitHub recorded that no hosted runner acquired it after multiple attempts, plus macOS arm64 capacity notices. Attempt 2 executes all ten steps successfully; no timeout, runner label or source change was needed.

OpenAI 7.44 includes a minor-version breaking type change in the separate Live Decision API. The affected OpenAssist provider sources use Responses/Chat Completions creation, input-token counting and Codex's existing HTTP/SSE folding, not that API. A search of all five affected provider/shared source directories finds no Live Decision, vendor agent/automation, Responses parse, Realtime or WebSocket calls. New SDK declarations must not change the shared model catalog or activate upstream hosted tools.

Inquirer 8.7.5's upstream notes describe an early piped-input fix in core 12.0.6 and an empty-password prompt cursor fix in password 5.2.5. OpenAssist's explicit TTY gates and scriptable alternatives still apply. Discord.js 14.28 adds invite/type/permission helpers; OpenAssist retains its explicit clientReady event, configured intents, DM approval and outbound delivery checks. The lockfile also consolidates old Discord REST/API-type resolutions while keeping Undici 6.29.1.

## Decision Log


Decision (2026-11-03): continue the existing PR rather than create a competing dependency PR. Keep the local codex-prefixed branch tracking the Dependabot head and push only to that existing remote ref. The user authorized sorting this PR, including necessary documentation and verification.

Decision (2026-11-03): retain the three proposed versions and existing production implementation unless tests or review demonstrate a compatibility problem. Existing tests already exercise real SDK HTTP requests, Codex SSE/authentication, provider replay/tool contracts, Discord rendering/delivery boundaries and setup validation; do not add version-pinning duplicate tests for this routine update.

Decision (2026-11-03): document this under Unreleased with a clear source/publication distinction. v0.2.6's annotated tag and sixteen signed assets are immutable, and availability PR #95 is a separate documentation change. No new release, version bump, catalog feature or paid/live test is implied by #94.

## Outcomes & Retrospective


PR #94 is merged and its branch is deleted locally/remotely. Final head `00a5de3` passes full local verification and all seven hosted workflows, with zero audits/scanning findings and no unresolved threads; original runner-allocation failure/unchanged retry remain recorded. The maintainer's subsequent #95 merge produces main `665e371`, whose tree exactly matches the independently verified combined rehearsal. Exact-main hosted results remain separate and pending at this committed checkpoint. The README presentation correction continues in a small follow-up from that main. These source SDK/prompt/channel updates are not in immutable signed v0.2.6; no new upstream product capability or live-provider certification is claimed.

## Context and Orientation


`apps/openassist-cli/package.json` consumes Inquirer prompts. `packages/channels-discord/package.json` consumes Discord.js, with runtime behavior in its `src/index.ts`. `packages/providers-openai`, `packages/providers-codex`, `packages/providers-azure-foundry` and `packages/providers-openai-compatible` share the OpenAI SDK; their `src` directories and `packages/providers-openai-shared/src` define the actual request/replay mapping. `pnpm-lock.yaml` fixes the complete graph. `pnpm-workspace.yaml` retains the security overrides, optional decoder patch/peer rule and explicit build-script allowlist. Source version 0.2.6 is not proof of delivery in the already published release.

## Plan of Work


First inspect the exact PR head and all failed jobs, distinguishing allocation errors from executed tests. Read the dependency delta and upstream changes against the adapter/setup implementations. Add a single Unreleased entry in `CHANGELOG.md`, a source-maintenance note in README's development-readiness section, the matching contributor discipline in AGENTS and an index entry for this plan in `docs/README.md`. Add the newer source versions to `docs/operations/provider-channel-readiness.md`, a dated Discord follow-up in `docs/channels/discord.md` and existing contract coverage in `docs/testing/test-matrix.md`; retain older dated baselines and the separate availability work.

Commit that complete diff before running the full local gate because lifecycle tests clone committed source. Require normal workflow lint, build/lint/typecheck, existing tests, unchanged coverage and production/full audit reports. Push to the existing PR branch, follow its actual head and dispatch full-branch CodeQL plus supplemental service/lifecycle smoke for that same revision. Finish with paginated open alerts for default/main/branch/PR refs and unresolved review threads. Record the final check IDs, revision, counts and limitations in PR #94's Validation section so evidence-only edits do not endlessly invalidate its checks.

## Concrete Steps


Work in `C:\Users\dange\Coding\openassist` with Node >=24.21.0 <25 and pnpm 12.5.1. Never log authentication tokens or provider credentials. Keep temporary logs under ignored `.git/pr-94`.

    gh pr view 94 --repo openassistuk/openassist --json headRefOid,state,files
    gh pr checkout 94 --repo openassistuk/openassist --branch codex/dependabot-pr-94
    pnpm install --frozen-lockfile
    git diff origin/main...HEAD
    pnpm verify:all
    git push origin HEAD:dependabot/npm_and_yarn/routine-dependencies-c510b74d75

The frozen install must leave `pnpm-lock.yaml` unchanged. The full gate must return zero, preserving both audit reports under `coverage/audit`. PR-only publication jobs are skipped intentionally; no production signing/publication is requested. Dispatch `codeql.yml`, `service-smoke.yml` and `lifecycle-e2e-smoke.yml` from the existing PR branch after pushing, then verify every run names the actual final head.

## Validation and Acceptance


Existing OpenAI/compatible/Azure local HTTP fixtures must preserve request/auth/tool/result behavior with SDK 7.47; Codex auth/session/SSE and context/replay bounds remain unchanged. Channel tests retain Discord clientReady, rendering/files and authorized DM boundaries; setup tests retain strict prompt validation and non-TTY refusal. All existing tests, coverage thresholds and audits must pass without adding capabilities or granting build permissions. Full branch CodeQL must analyze the final revision with no error/results, and open alert/review checks must be independently empty or addressed. Normal main review remains required. No offline/hosted result certifies live account, quota or replacement-host behavior.

## Idempotence and Recovery


Recheck remote head before pushing; do not force-push over concurrent work. Retain all original attempts. An unassigned runner failure may be retried against unchanged code without lowering a gate. If an actual compatibility failure occurs, add the smallest regression/fix and rerun affected checks, then require fresh final-head hosted evidence. Leave v0.2.6 tags/assets, PR #95 and operator installations untouched. Do not merge or dismiss findings to avoid required review.

## Artifacts and Notes


The PR is [#94](https://github.com/openassistuk/openassist/pull/94), original head `22ae73cd369d838f36a953d8734772bed6b6adfe`. Upstream references are [Inquirer prompts 8.7.5](https://github.com/SBoudrias/Inquirer.js/releases/tag/%40inquirer/prompts%408.7.5), [Discord.js 14.28.0](https://github.com/discordjs/discord.js/releases/tag/14.28.0) and the packaged/official [OpenAI SDK changelog](https://github.com/openai/openai-node/blob/v7.47.0/CHANGELOG.md). The final PR Validation section supplements this committed checkpoint with actual-head local/hosted/scanning/review reconciliation.

## Interfaces and Dependencies


Keep the current OpenAssist contracts and package boundaries. Retain explicit provider credentials/routes, model catalog, immutable prepared payloads, bounded replay, attachment/access policy and sequential tool execution. Keep Node 24, paired Vitest/coverage-v8, narrow security overrides and the exact optional Baileys/decoder wiring unchanged. No new production dependency, native build permission, service, migration or privileged path is introduced.

Revision note (2026-11-03): initialize the authorized PR #94 continuation with exact original-head evidence, successful runner retry, reviewed upstream compatibility and frozen installation; complete release-facing documentation before final committed-head verification.

Revision note (2026-11-03): close the actual #94/#95 merge and branch-cleanup record, final-head local/hosted/scanning/review evidence and combined-rehearsal result. Preserve separate exact-main and immutable-publication boundaries while carrying the requested README correction forward.
