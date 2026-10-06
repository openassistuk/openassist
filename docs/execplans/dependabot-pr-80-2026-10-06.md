# Prepare replacement dependency PR #80 after the CI audit repair

This living ExecPlan follows `.agents/PLANS.md`. Maintain Progress, Surprises & Discoveries, Decision Log and Outcomes & Retrospective as work proceeds.

## Purpose / Big Picture

Prepare the routine dependency updates for reviewed merging after the user merged CI repair PR #79. Dependabot closed [PR #78](https://github.com/openassistuk/openassist/pull/78) and replaced it with [PR #80](https://github.com/openassistuk/openassist/pull/80), retaining the six original updates and adding Pino `10.4.0`. Preserve patched dependency floors, provider request/authentication contracts, logger redaction, Node 24 support and unchanged quality gates. The request authorizes preparation, not merging or publishing a release.

## Progress

- [x] (2026-10-06 13:01Z) Fast-forward local main to merged PR #79 commit `d47ef32`, delete the merged local CI-fix branch and prune its deleted remote reference.
- [x] (2026-10-06 13:01Z) Rebase PR #78's original `4e34848` onto `d47ef32` without conflicts; the new dependency commit is `72126a0`. Preserve source-map-js `1.2.2` and its affected-version override.
- [x] (2026-10-06 13:01Z) Review upstream SDK changes, complete frozen installation with Node 24.21.0/pnpm 12.5.1, and pass all three existing dependency-floor regressions without changing build-script permissions.
- [x] (2026-10-06 local verification) Synchronize dependency-maintenance documentation and pass `pnpm verify:all` without compatibility changes, new build permissions or weakened gates.
- [x] (2026-10-06 replacement reconciliation) The exact lease rejects publication after Dependabot deletes #78's branch. Inspect #80: its only additional change versus the verified six-update tree is Pino `10.4.0` in WhatsApp/observability and its lock references. Replay the maintenance commit onto its already-current base without overwriting the bot.
- [x] (2026-10-06 replacement validation) Install #80's frozen graph and pass four focused dependency/logger checks. The logger test exercises real subprocess output, credential-path redaction and JSON parsing of quoted child bindings.
- [x] (2026-10-06 13:16Z) Pass full `pnpm verify:all` on the seven-update replacement: 577 Vitest passes, 236 Node passes, both coverage gates and zero production/full audit findings. The real logger test passes without production changes.
- [ ] Publish the replacement's final preparation head; inspect hosted/security/review evidence and update merge-readiness notes.

## Surprises & Discoveries

PR #78's previous green checks were on October 5 and its old lockfile retained source-map-js `1.2.1`. PR #79 supplies the patched floor and regression. Git rebases the dependency change cleanly while preserving the new floor; frozen installation succeeds. Vitest and coverage-v8 advance together to `5.0.3`, with why-is-node-running resolved to `3.2.1` as required by the upstream patch. No extra install-script permissions are needed.

The six updates are `@types/luxon 3.7.5 -> 3.7.6`, `@types/node 24.13.6 -> 24.19.1`, `vitest` and `@vitest/coverage-v8 5.0.2 -> 5.0.3`, `@anthropic-ai/sdk 0.128.0 -> 0.131.0`, and `openai 7.23.0 -> 7.27.0`. Source package versions remain `0.2.2`; immutable published assets do not change.

Dependabot closed #78 at 13:00:25 UTC and deleted its remote branch at 13:00:28 UTC on October 6. The expected-commit lease failed safely rather than recreating or overwriting that branch. Replacement #80 at `7c8f84f` is based on the same current main and adds only Pino `10.3.1 -> 10.4.0` versus the verified dependency tree. Its own original 13 hosted checks passed. Preserve those as historical evidence, independently of later preparation commits.

Pino's [upstream comparison](https://github.com/pinojs/pino/compare/v10.3.1...v10.4.0) includes null-prototype redaction internals, escaped child binding keys, Node call-site handling and transport filtering fixes; real-require advances to `1.0.0`. OpenAssist uses a plain Node logger with configured credential paths and a plain WhatsApp logger. Keep those surfaces unchanged and exercise actual output rather than only the separate recursive redaction helper.

A local before/after probe confirms the quoted child-binding key produces invalid JSON with Pino `10.3.1` and valid JSON with `10.4.0`. The added application-logger regression passes on the replacement and verifies configured credential-path redaction using a fixed, non-secret canary.

Upstream OpenAI changes include base-URL query joining and Responses metadata fixes plus additive Agents/WebSocket capabilities. Anthropic changes include stream parsing, API types, timeout headers and helper behavior. OpenAssist uses Chat Completions/Responses HTTP requests, Anthropic Messages plus its existing stream folding, and its own bounded tool loop. Added vendor helper/tool APIs must not be activated implicitly. Validate existing route/catalog/auth/replay contracts through repository tests and types, rather than claiming new SDK features are supported automatically.

## Decision Log

- Decision: Rebase the existing Dependabot branch and use an explicit expected-commit force-with-lease when publishing it.
  Rationale: The user requested a rebase; a lease protects against overwriting any intervening Dependabot/user update. Do not create a replacement PR or merge the branch.
  Date/Author: 2026-10-06 / Codex.

- Decision: Keep the six approved dependency updates and existing regression suites, adding only maintenance documentation unless validation identifies a concrete defect.
  Rationale: Existing provider, SDK/auth/request mapping, replay and dependency-floor tests cover the affected interfaces. Avoid speculative feature changes or tests that merely mirror manifest versions.
  Date/Author: 2026-10-06 / Codex.

- Decision: Continue on the bot's replacement #80 and replay the verified maintenance work onto it; add a real logger-output regression for the extra Pino minor update.
  Rationale: #78 is closed with its branch deleted, and #80 preserves its six updates on current main. The extra logging dependency warrants validating JSON escaping and configured secret redaction before merge preparation. An optional preference question was presented while inspecting the replacement; the stated default follows the existing routine update group.
  Date/Author: 2026-10-06 / Codex.

## Outcomes & Retrospective

Local main is current and the stale CI branch is removed. The dependency branch rebases cleanly and passes frozen installation/dependency-floor checks plus full `pnpm verify:all`. No provider/runtime compatibility changes are needed. Local Windows validation passes 577 Vitest tests (one skip), 235 Node tests (six platform skips) and the Node coverage subset with 126 passes (five skips). Unix/Bash cases require hosted checks rather than local certification.

Vitest statements/branches/functions/lines remain 83.24/74.35/85.85/84.22 percent; Node coverage remains 80.15/73.67/86.07/80.15 percent. Production and full audits both return zero findings. Build, lint, types, docs-truth and dependency controls pass with unchanged thresholds and permissions. The dependency and maintenance diff contains no accidental source edits, exposed secrets or debug code.

The six-update tree's verification above is historical evidence. Dependabot replacement #80's seven-update graph installs successfully, passes four focused dependency/logger tests and completes full `pnpm verify:all` on October 6 at 13:16 UTC. It passes 577 Vitest tests (one skip), 236 Node tests (six platform skips) and the Node coverage subset with 126 passes (five skips). Coverage percentages remain unchanged and both audits report zero findings. No production compatibility fixes are needed. Publication of its preparation commits and current-head hosted certification remain pending. Keep actual heads and results separate from historical checks; maintain review requirements before any later user-approved merge. Live paid provider/channel sessions and production publication are outside this preparation.

## Context and Orientation

Root `package.json` carries types and paired test-runner/coverage versions. `packages/core-runtime/package.json` also uses Luxon types. `packages/providers-anthropic/package.json` carries the Anthropic SDK. OpenAI SDK versions are kept consistent in `packages/providers-{openai,codex,azure-foundry,openai-compatible}/package.json`. Pino lives in the observability and WhatsApp manifests. `pnpm-lock.yaml` captures resolved dependencies, while `pnpm-workspace.yaml` owns build permissions and narrow security overrides. `.github/dependabot.yml` groups routine minor/patch updates and rejects Node-types major migrations.

Provider code calls SDK Messages/Responses/Chat Completions entrypoints; supported model capabilities remain defined by the shared config catalog, not by newly available vendor SDK features. The existing provider Vitest suites and Node runtime contract tests validate request mapping, account readiness, tool policy, stream replay and authentication boundaries. `vitest.config.ts` and root scripts retain the established coverage scope and thresholds.

## Plan of Work

The first milestone verifies the rebase preserves all merged dependency controls and installs the complete updated graph without additional permissions. Inspect upstream version comparisons and affected request paths. Synchronize README, contributor rules, changelog, docs index and test guidance with the maintenance validation, retaining all operator/runtime contracts.

The second milestone runs `pnpm verify:all`, covering workflow lint, build, lint, types, both runners, both coverage gates and production/full audits. Repeat it for #80 because Pino is an additional production change after the already verified six-update tree. `tests/node/observability-logger.test.ts` launches the built application logger in a child Node process, parses its JSON, verifies quoted bindings and asserts configured credential fields are censored. Update the test inventory alongside that meaningful boundary regression. Review the final diff for unwanted dependencies, secrets, debug code and unrelated edits.

The final milestone publishes #80's existing branch by normal fast-forward, preserving the bot's original commit. The earlier lease failure has already been reconciled. If another update arrives, fetch and inspect it before retrying; never overwrite it blindly. Wait for CI, CodeQL, live macOS service and artifact/signing checks on the exact PR head. Inspect security alerts and unresolved review threads separately, then record merge readiness without merging or bypassing review.

## Concrete Steps

From the repository root, using Node 24.21.0 and pnpm 12.5.1:

    git fetch origin --prune
    git switch main
    git merge --ff-only origin/main
    git branch -d codex/fix-ci-audit-2026-10-06
    git switch --track origin/dependabot/npm_and_yarn/routine-dependencies-f93a289c65
    git rebase origin/main
    pnpm install --frozen-lockfile
    pnpm exec tsx --test tests/node/dependency-security-overrides.test.ts
    pnpm verify:all
    git diff origin/main --check

The old branch commands above are the completed #78 history. For the replacement, replay only the maintenance commit onto `origin/dependabot/npm_and_yarn/routine-dependencies-0be4fc849b`, retain its original seven-update commit and use a normal push. Use `gh pr checks 80` for current hosted evidence. Keep diagnostic logs under ignored `coverage/ci-repair-2026-10-06/pr78-*` and `pr80-*` paths.

## Validation and Acceptance

Accept a dependency-only implementation diff plus synchronized maintenance evidence, all patched floors retained, consistent SDK/test-tool versions, unchanged Node 24/runtime/access contracts and passing complete local/current-head hosted checks. Both dependency audits must return zero high/critical findings; registry errors never count as success. Do not lower coverage thresholds if the updated coverage tooling changes measured results. Record any actual skips and distinguish automated contracts from untested live sessions.

## Idempotence and Recovery

No operator state, credentials, installed services or release assets are touched. A failed rebase can be inspected and aborted before publication. An exact lease prevents clobbering another writer. Normal review and branch protections remain active; preparation stops before merge.

## Artifacts and Notes

Main/base: `d47ef32456186abb90e19c101cfc49eba9511fb9`. Original #78 head: `4e34848704e62ab5a68f2ade75b90c48d7e3cc60`; local rebase: `72126a0`. Replacement #80 head: `7c8f84fe4088865c9ed44ed98c263e3c5d737deb`; replayed maintenance commit: `808c31c`. Upstream comparisons: [OpenAI](https://github.com/openai/openai-node/compare/v7.23.0...v7.27.0), [Anthropic](https://github.com/anthropics/anthropic-sdk-typescript/compare/sdk-v0.128.0...sdk-v0.131.0), [Vitest](https://github.com/vitest-dev/vitest/releases/tag/v5.0.3) and [Pino](https://github.com/pinojs/pino/compare/v10.3.1...v10.4.0). Six-update local evidence is retained as `pr78-install.log`, `pr78-dependency-check.log` and `pr78-verify-all.log`; replacement evidence is `pr80-install.log`, `pr80-focused.log`, `pr80-logger-before-after.log` and `pr80-verify-all.log` in the ignored directory.

## Interfaces and Dependencies

No new public interfaces, model controls, tool schemas or explicit dependency families are introduced. Keep the existing provider modules, catalog, runtime-owned tool loop, pnpm policy and validation commands.

Revision note (2026-10-06): create the plan after merged-main cleanup, clean rebase, upstream comparison review and passing frozen installation/dependency regressions. Record passing six-update verification before the lease failure, then reconcile automatic #78 closure/#80 replacement, the extra Pino review, before/after evidence and passing focused/full verification. Rename the record and linked guidance to the active PR before publication.
