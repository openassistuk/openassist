# Modernize OpenAssist before core development

This living ExecPlan follows `.agents/PLANS.md`. Update Progress, Surprises & Discoveries, Decision Log, and Outcomes & Retrospective as implementation and verification proceed.

## Purpose / Big Picture

Operators should be able to install OpenAssist on Node 24, select supported current models, and retain their existing configuration, credentials, conversations, and service state. Contributors should have current dependencies, enforceable security checks, and a reproducible quality baseline before starting core feature work. This is a single-agent implementation; no deployment, paid API calls, or GitHub writes are authorized by this plan alone.

## Progress

- [x] (2026-09-27 reconciliation) Follow-up delivery is merged through PR #61 (`0ac0921`), including the GPT-6/Claude catalog, bounded Responses replay and auth/channel compatibility work. Exact final hosted evidence is recorded in `current-provider-models-2026-09.md`.
- [x] (2026-09-21) Inspected clean `main` at `1e17fa219a0c5ac6ec96dd38ac2543ad7e2929b3`; created `codex/modernize-foundation`.
- [x] (2026-09-21) Recorded baseline: build/lint/typecheck passed; first Vitest run had an Azure import timeout, isolated retry and coverage run passed all 328 tests; Node tests passed 171 with 3 skips; coverage passed (Vitest lines 81.09%, Node lines 80.74%).
- [x] (2026-09-21) Recorded GitHub state: 71 open dependency alerts; PRs 50/52/53 open; CI, CodeQL, Service Smoke and Lifecycle E2E Smoke disabled for inactivity; branch protection and macOS live check retained. Production audit reported 67 findings (3 critical, 25 high); full audit 85.
- [x] (2026-09-21) Milestone 1 local implementation: Node 24 launchers dynamically import main only after version checks; bootstrap/CI/docs aligned; full build and 9 targeted runtime/installer tests passed. Hosted workflow re-enabling remains pending authorization.
- [x] (2026-09-21) Milestone 2 local implementation: modernized target dependencies and built successfully; production/full audits both zero; Baileys/libsignal persisted encryption roundtrip passed; Vitest 327/328 passed before correcting an obsolete package-manager version assertion.
- [x] (2026-09-27) Milestone 3 implementation: shared catalog, current setup defaults, retired Codex readiness, adaptive/manual thinking, shared CLI/chat status, docs and regression tests. Build passed; existing 328 Vitest tests passed after fixture updates; 10 catalog tests and 19 focused Node setup/docs-truth tests passed. Final combined verification follows in milestone 4.
- [x] (2026-09-27) Rebased three milestone commits onto `61430d5` after PR #50 merged. Commits are `7a8f182` (Node), `f4a54de` (dependencies), and `c36d34f` (models). PR #52 is closed; its replacement #54 and Baileys #53 remain open.
- [x] (2026-09-27) Clean Windows checkout installed 348 packages with `CI=true pnpm install --frozen-lockfile`, including required scripts without prompts. Real Node 22.22.0 rejected both built entrypoints; Node 24.21.0 accepted both; temporary operator-state sentinel remained unchanged and no database was created.
- [x] (2026-09-27) Reconciled 17 historical ExecPlans against merged PRs and active ruleset evidence, retaining unverified historical checkboxes. Consolidated Node migration/rollback instructions and native pnpm installation guidance.
- [x] (2026-09-27) Restored Vitest coverage gates without exclusions or reduced thresholds: lines 83.12%, statements 82.93%, functions 86.33%, branches 71.12%. Added provider OAuth and Zod security regressions; sanitized upstream token errors exposed during review.
- [x] (2026-09-27) Milestone 4 local verification and review completed: `pnpm verify:all` exit 0, all gates passed, both audits zero findings. Fourth milestone commit records the tests, documentation, installer/audit portability fixes and historical evidence.
- [x] (2026-09-27) External validation completed: modernization and follow-up PRs merged; workflows re-enabled; three-platform CI, CodeQL, required macOS live gate and both smoke workflows passed. Superseded dependency PRs are closed. Main 7e42961 had successful CI run 36332180798 and CodeQL run 36332180781.
- [ ] Live integration certification: designated test credentials and authorization required; do not report mock tests as live certification.

- [x] (2026-09-27) Reconciled all 72 current GitHub Dependabot alerts and PRs #53/#54 into this branch. Every affected package is patched or removed; strengthened lockfile floor tests and confirmed both audits remain zero.

- [x] (2026-09-27) Review fixes: restore the verified Opus 4.5 alias and add explicit quickstart recovery for incompatible saved thinking. Both focused suites passed (29 tests); full `pnpm verify:all` also passed after the fixes.

## Surprises & Discoveries

Baseline coverage documentation requires 81% functions but Vitest configured 80%; docs-truth only compared the lines value. The baseline installer accepts every Node major >=22 despite requiring built-in SQLite unavailable in early Node 22. Codex validation only accepts gpt-5.4 or names containing codex; the account-login service retired gpt-5.4 on 2026-08-31. Baileys latest is a prerelease; the supported legacy tag resolves to 6.7.24. Existing dependency-floor tests assert exact old overrides and must migrate with the dependency tree.

On resumption, GitHub had merged PR #50 and closed #52 in favor of #54. The branch was rebased locally; its protobufjs 7.6.5 resolution supersedes #50's 7.6.0. The active `Protect main` ruleset (13499978) requires workflow lint, all three quality platforms, CodeQL preflight/analyze, one human approval, resolved conversations and the macOS live gate. Classic branch-protection API returns 404 because protection is ruleset-based. Four workflows remain disabled for inactivity; macOS live remains active. No GitHub mutations were made.

pnpm 12 is a native executable, including an extensionless binary on Unix. The original audit launcher only recognized Windows .exe; the corrected runner invokes native binaries directly and JavaScript shims through Node. Bootstrap/CI now use npm's scoped `--allow-scripts=pnpm` permission instead of Corepack. A clean frozen Windows installation passed; hosted Unix installation still requires certification.

Vitest 5 initially exposed branch coverage of 68.44%, below 71%. Additional OAuth and Zod rejection tests recovered coverage and found raw token response text in OpenAI/Anthropic errors. Errors now discard upstream body/status text and validate token fields; dummy-secret tests demonstrate no echo in failures. Azure cold-import setup uses a local beforeAll timeout, leaving global test timeouts unchanged.

## Decision Log

User chose full modernization, Node 24 only, and refreshed model recommendations. Preserve saved model IDs; retired Codex selections require an explicit operator update. Keep standard access the default and full-root autonomy bounded and opt-in. Keep all existing storage, replay, auth, channel identity, and redaction contracts.

Use Node 24.21.0 as minimum and pnpm 12.5.1 as the initial package-manager target; validate availability and installation before changing executable requirements. Use an isolated temporary toolchain instead of replacing the host's Node installation. Record evidence-driven target adjustments here if registry/package artifacts disagree with metadata.

On 2026-09-27, retained full historical evidence rather than marking old certification checkboxes complete merely because a PR merged. Replaced Corepack bootstrap with the pinned native pnpm installer, keeping supply-chain permissions explicit. Added focused auth/config regressions to recover coverage rather than changing measurement scope. These changes preserve storage schema, account/API-key separation and legacy manual thinking semantics.

## Outcomes & Retrospective

Current reconciliation (2026-09-27): development foundation work is merged through `0ac0921`. The model follow-up is complete, as recorded in [its ExecPlan](current-provider-models-2026-09.md). Historical disabled-workflow, unmerged-PR and authorization notes below remain evidence of earlier stages, not instructions to repeat those actions. Outstanding release evidence is still live provider/channel coverage and an actual existing-install Node migration/rollback; use the [readiness checklist](../operations/provider-channel-readiness.md#verification-and-live-checks) to record beta runs without overstating coverage.

All four local milestones are implemented and verified. Node 24 guards, dependency majors, shared model controls, additive Anthropic configuration, migration guidance and audit automation are ready for review. Config IDs and operator data were not rewritten, and no schema migration was added. The final review checked task scope, secret handling, dependency resolution, service boundaries and documentation truth.

`pnpm verify:all` passed on Windows with Node 24.21.0 and pnpm 12.5.1: workflow lint, all workspace builds/lints/typechecks, 374 Vitest tests, and 184 Node tests (3 expected platform skips). Vitest coverage: statements 82.93%, lines 83.12%, functions 86.33%, branches 71.12%. Node coverage: statements/lines 80.74%, functions 91.43%, branches 72.43% (107 coverage tests passed, 2 platform skips). Thresholds and scope remain unchanged except restoring the documented Vitest function minimum from 80 to 81. Production/full audits both returned zero info/low/moderate/high/critical findings; reports are under `coverage/audit`.

Repository automation readiness is established on main 7e42961. The merged modernization and dependency follow-ups passed hosted checks; final main CI/CodeQL passed, and the signed-in GitHub review found zero open Dependabot, code-scanning or secret-scanning alerts. Earlier disabled-workflow and open-PR statements below are historical snapshots. Remaining release evidence: actual existing-install Node 22-to-24 service migration and rollback, plus designated live provider/channel checks. The user reports successful beta testing; record the tested build/OS/provider/model/channel and behaviors before marking specific checks complete. Hosted bootstrap smoke already covers fresh temporary-home installs. The subsequent current-provider-models-2026-09.md plan addresses newer GPT-6/Claude catalog gaps; no blanket all-model certification is claimed.

## Context and Orientation

OpenAssist's daemon (`apps/openassistd`) handles chat, durable storage, and providers; its CLI (`apps/openassist-cli`) manages installation and operator configuration. Workspace packages separate contracts, configuration, runtime orchestration, SQLite, providers, channels, and tools. Dependencies resolve through the root package manifest and pnpm lockfile. Operator state normally lives outside the checkout under ~/.config/openassist and ~/.local/share/openassist.

## Plan of Work

### Milestone 1: runtime support

Add minimal entrypoint guards before loading runtime dependencies. Require Node >=24.21.0 <25 in executable packages and developer metadata. Update bootstrap prerequisite checks, NodeSource/Homebrew/fallback installation commands, service runtime discovery and setup diagnostics. Document backups and Node-first upgrades before application changes; test rejected versions without opening databases. Commit after targeted checks.

### Milestone 2: dependencies and security

Starting versions: pnpm 12.5.1, TypeScript 7.0.2, Vitest/coverage-v8 5.0.1, c8 12.0.0, OpenAI 7.20.0, Anthropic 0.127.0, Azure Identity 4.13.3, Zod 4.6.5, Commander 15.0.0, Inquirer 8.7.2, Discord.js 14.27.0, grammY 1.46.0, Baileys 6.7.24, Pino 10.3.1. Align Node types to 24.x; update supporting utilities to stable compatible releases. Adapt APIs without disabling strict checks. Prefer parent dependency fixes, then narrowly scoped security overrides with contract tests. Preserve unattended required dependency build scripts. Add weekly npm/Actions updates and audit verification that fails on high/critical findings and registry errors while retaining full reports. Do not close existing PRs until replacement validation succeeds.

### Milestone 3: models and provider contracts

Export a bounded catalog from configuration, with types in core-types. Recommend gpt-5.6-terra for OpenAI/Codex and claude-sonnet-5 for Anthropic. Offer verified alternatives and per-model reasoning choices. Azure keeps deployment names and optional underlying-model hints; custom models remain accepted without inferred capabilities. Share validation/request/status definitions. Add Anthropic thinkingMode/thinkingEffort while retaining manual budgets for compatible legacy models; reject conflicting settings. Retired Codex defaults produce a readiness blocker with explicit repair guidance, without rewriting saved configurations. Preserve SSE folding, session/account headers, refresh, image and tool gating, and sequential durable tool execution.

### Milestone 4: readiness evidence

Fix the Azure cold-import timeout locally in test setup and correct coverage/docs-truth drift. Add regression tests for migrated behavior and preserve thresholds/scope. Update README, AGENTS, CHANGELOG, docs index and all lifecycle/provider/config/interface/security/testing surfaces required by AGENTS. Reconcile completed historical plan items using merge/settings evidence, not assumptions. Review the final diff and commit only task changes.

## Concrete Steps

From the repository root, install the isolated runtime/package manager, install workspace dependencies, and run focused tests for each milestone. Final commands are `pnpm install --frozen-lockfile`, `pnpm verify:all`, `pnpm audit --prod --json`, and `pnpm audit --json`. Audit scripts must save complete reports and propagate failures. Record resulting exact versions, outcomes and failures in this file.

## Validation and Acceptance

Exercise valid/invalid config and legacy saved settings, runtime version rejection, CLI non-TTY safeguards, installer contracts, auth refresh, model compatibility, thinking replay, tools, images, redaction, restart/memory/scheduler/access behavior, upgrade failure and rollback. Preserve Vitest lines/statements/functions >=81, branches >=71; Node lines/statements >=79, functions >=80, branches >=70. No high/critical audited dependency findings may remain; unresolved fixable lower-severity findings must be repaired. Unfixable advisories are readiness blockers, not suppressed warnings.

Hosted acceptance requires the final revision to pass the existing Linux/macOS/Windows quality matrix, CodeQL, live macOS LaunchAgent check, and Linux/macOS service/lifecycle smoke workflows. Live provider/channel tests cover first reply, tool execution, attachments, auth refresh, reconnect and persisted sessions. Missing authorization or credentials must be recorded as pending.

## Idempotence and Recovery

Do not modify existing operator state or credentials during local verification. Use temporary directories for tests and toolchain installation. Preserve the existing lockfile in Git history and make incremental reviewable commits. Operator upgrades back up configuration, env file, data and service definitions before changing Node, then retain the previous checkout until post-upgrade health checks pass. No database schema migration is intended.

## Interfaces and Dependencies

Public changes are Node 24 support, new setup model recommendations, additive reasoning values, and optional Anthropic thinking controls. Existing authentication and durable runtime contracts remain stable. Configuration exports shared model lookup and tuning validation; core-types contains only their contracts. Unknown models receive no automatically inferred optional features. Existing manually configured models are not silently replaced.

## Artifacts and Notes

Baseline verification/audit logs are in the host temporary directory under `openassist-housekeeping-*`. They contain test/audit evidence, not operator credentials. External changes will be presented for authorization only after local work is reviewable.

Revision note (2026-09-21): Created from the approved modernization plan and verified repository baseline before implementation.

Revision note (2026-09-21): pnpm 12 rejects Baileys' Git subdependency. Registry `libsignal@6.0.0` is published by the same WhiskeySockets repository; use a parent-scoped override and retain blockExoticSubdeps. Real encryption/decryption and disk session reload passed. Zod 4 requires explicit record key schemas and prefault({}) to preserve nested defaults.

Revision note (2026-09-27): Resumed the existing local work. Added exact model capability validation and SDK payload tests, retained custom IDs and saved models, and corrected setup fixtures for current recommendations. First combined run exposed stale installer version assertions and a checkout-cloning test that requires the current config changes committed; these are addressed before the final gate. Hosted and live work remains pending authorization.

Revision note (2026-09-27, final verification): Recorded upstream rebase, native package-manager behavior, clean install and real runtime migration guard evidence, restored coverage, OAuth error hardening, and historical settings reconciliation. Final local verification and external certifications remain distinct.

Final local evidence (2026-09-27): Full verification log is `%TEMP%/oa-verify-final.log`; clean frozen-install log is `%TEMP%/oa-clean-frozen.log`; docs-truth rerun is `%TEMP%/oa-docs-final.log`. The frozen checkout was isolated from the working checkout and had no preexisting node_modules. Runtime tools were installed only under `%TEMP%/openassist-modernization-tools` and `%TEMP%/openassist-node22-migration`. Required audits remain reproducible through `pnpm audit:dependencies`; transient local reports are not committed. Hosted and live evidence must be appended after authorization and execution.

## Dependency PR and alert reconciliation (2026-09-27)

The user requested that PR #53, PR #54 and all 72 current Dependabot alerts be handled together on `codex/modernize-foundation`. Read-only GitHub inspection confirmed 5 critical, 25 high, 38 medium and 4 low alerts across 17 package names. Alert numbers below include separate manifest/lockfile occurrences; they are not 72 distinct packages. Every currently resolved version is at or above the highest patched floor reported for that package; UUID is absent. Production and full `pnpm audit:dependencies` reports both remain zero. The regression contract now checks all these package floors, every resolved version, removed UUID, and matching Vitest/coverage versions.

PR #53 updates Baileys 6.7.21 to 6.7.22 and is currently merge-conflicted (`DIRTY`). Its manifests and lockfile changes are superseded here by 6.7.24, the registry libsignal override, build permissions, and real persisted encryption roundtrip coverage. PR #54 updates Vitest 2.1.9 to 4.1.11 but leaves coverage-v8 at 2.1.9 and Vite at 5.4.21; its lockfile also introduces Node 26 type resolutions. It is blocked with only the macOS live check reported. This branch upgrades Vitest and coverage-v8 together to 5.0.1, Vite to 8.3.0, and keeps Node types on 24.x. The full verification result above covers that integrated migration.

These fixes are consolidated locally; GitHub still reports the unmerged default-branch dependencies. PR publication, workflow re-enabling and closing the superseded PRs remain subject to the existing authorization boundary. Do not dismiss alerts to hide them or close dependency PRs before the replacement passes hosted checks.

| Package | Open alert numbers | Highest reported patched floor | Modernization lockfile |
| --- | --- | --- | --- |
| `@protobufjs/utf8` | #37 | `1.1.1` | `1.1.2` |
| `@vitest/mocker` | #95 | `4.1.11` | `5.0.1` |
| `@whiskeysockets/baileys` | #56, #57 | `6.7.22` | `6.7.24` |
| `axios` | #18, #20, #22, #23, #24, #25, #26, #27, #28, #29, #38, #39, #43, #44, #48, #49, #52, #53, #54, #58, #59, #65, #75, #76, #78, #79, #80, #81 | `1.18.0` | `1.18.0` |
| `brace-expansion` | #73 | `5.0.7` | `5.0.9` |
| `esbuild` | #60 | `0.28.1` | `0.28.2` |
| `follow-redirects` | #17 | `1.16.0` | `1.16.0` |
| `form-data` | #64 | `4.0.6` | `4.0.6` |
| `nanoid` | #94 | `3.3.12` | `3.3.19` |
| `postcss` | #82, #85, #92, #99 | `8.5.23` | `8.5.28` |
| `protobufjs` | #19, #30, #31, #32, #33, #34, #35, #36, #41, #62, #63, #74 | `7.6.5` | `7.6.5` |
| `sharp` | #77, #98 | `0.35.4` | `0.35.4` |
| `undici` | #66, #67, #68, #69, #87, #88, #89 | `6.28.0` | `6.28.0` |
| `uuid` | #42 | `11.1.1` | Removed by parent upgrades |
| `vite` | #14, #71, #72 | `6.4.3` | `8.3.0` |
| `vitest` | #50, #51, #96, #97 | `4.1.11` | `5.0.1` |
| `ws` | #45, #70 | `8.21.0` | `8.21.0` |

Revision note (2026-09-27, consolidation): Added the exact current alert inventory and both dependency PR dispositions, so the cleanup PR has explicit evidence covering every open alert rather than relying only on an aggregate audit count. No additional dependency changes were necessary; the existing modernization resolutions already cover all 72 alerts.

Consolidation verification: 11 targeted dependency-policy/docs-truth tests passed; both audits again reported zero findings. No product or lockfile change was needed after the previously passing full verification, so the full suite was not repeated for this evidence/test-only follow-up.

## Review follow-up: saved Anthropic compatibility

Review found that `claude-opus-4-5` was omitted while its dated model was cataloged, rejecting previously valid manual-budget configurations at startup. The official Opus 4.5 specification confirms the alias and extended thinking. Added that exact alias without changing saved IDs or inferring name-based capabilities.

Quickstart also copied thinking settings after a model change without offering a repair surface. It now validates the retained tuning against the selected model and asks explicitly before resetting to provider defaults; No is the default and reopens model selection. Compatible tuning is preserved even across a model change. The reset only affects the pending in-memory configuration until normal validated save. Tests exercise complete save/reload paths for preservation, reset acceptance and refusal.

Decision (2026-09-27): keep detailed thinking editing in wizard; use an explicit reset-or-change-model prompt in quickstart to preserve its beginner-facing scope. No new dependencies or storage changes. Focused verification: 29 tests passed across the catalog and quickstart-flow suites. Full verification passed: 379 Vitest tests, 185 Node tests (3 expected skips); Vitest lines 83.20%, statements 83.02%, functions 86.46%, branches 71.29%; Node lines/statements 80.66%, functions 91.43%, branches 72.41%. Both dependency audits remain zero. Log: `%TEMP%/oa-review-fixes-verify.log`.

Review follow-up verification also identified a CodeQL URL-regex warning in the dependency contract test. This test rejects a Git dependency name rather than validating a URL, so it now checks the dependency name directly with `includes`. Both dependency contract tests pass; the assertion remains active without a URL-shaped regex. Hosted CodeQL must rerun after the update to PR #55; no alert suppression was added.
