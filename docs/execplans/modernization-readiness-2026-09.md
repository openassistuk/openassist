# Modernize OpenAssist before core development

This living ExecPlan follows `.agents/PLANS.md`. Update Progress, Surprises & Discoveries, Decision Log, and Outcomes & Retrospective as implementation and verification proceed.

## Purpose / Big Picture

Operators should be able to install OpenAssist on Node 24, select supported current models, and retain their existing configuration, credentials, conversations, and service state. Contributors should have current dependencies, enforceable security checks, and a reproducible quality baseline before starting core feature work. This is a single-agent implementation; no deployment, paid API calls, or GitHub writes are authorized by this plan alone.

## Progress

- [x] (2026-09-21) Inspected clean `main` at `1e17fa219a0c5ac6ec96dd38ac2543ad7e2929b3`; created `codex/modernize-foundation`.
- [x] (2026-09-21) Recorded baseline: build/lint/typecheck passed; first Vitest run had an Azure import timeout, isolated retry and coverage run passed all 328 tests; Node tests passed 171 with 3 skips; coverage passed (Vitest lines 81.09%, Node lines 80.74%).
- [x] (2026-09-21) Recorded GitHub state: 71 open dependency alerts; PRs 50/52/53 open; CI, CodeQL, Service Smoke and Lifecycle E2E Smoke disabled for inactivity; branch protection and macOS live check retained. Production audit reported 67 findings (3 critical, 25 high); full audit 85.
- [x] (2026-09-21) Milestone 1 local implementation: Node 24 launchers dynamically import main only after version checks; bootstrap/CI/docs aligned; full build and 9 targeted runtime/installer tests passed. Hosted workflow re-enabling remains pending authorization.
- [x] (2026-09-21) Milestone 2 local implementation: modernized target dependencies and built successfully; production/full audits both zero; Baileys/libsignal persisted encryption roundtrip passed; Vitest 327/328 passed before correcting an obsolete package-manager version assertion.
- [ ] Milestone 3: shared model catalog, refreshed setup/status/validation, provider compatibility, and reviewable commit.
- [ ] Milestone 4: full local verification, synchronized docs, historical-plan reconciliation, final review and commit.
- [ ] External validation: authorize workflow re-enabling/publication, run required hosted checks and smoke jobs, supersede dependency PRs only after replacement evidence.
- [ ] Live integration certification: designated test credentials and authorization required; do not report mock tests as live certification.

## Surprises & Discoveries

Baseline coverage documentation requires 81% functions but Vitest configured 80%; docs-truth only compared the lines value. The baseline installer accepts every Node major >=22 despite requiring built-in SQLite unavailable in early Node 22. Codex validation only accepts gpt-5.4 or names containing codex; the account-login service retired gpt-5.4 on 2026-08-31. Baileys latest is a prerelease; the supported legacy tag resolves to 6.7.24. Existing dependency-floor tests assert exact old overrides and must migrate with the dependency tree.

## Decision Log

User chose full modernization, Node 24 only, and refreshed model recommendations. Preserve saved model IDs; retired Codex selections require an explicit operator update. Keep standard access the default and full-root autonomy bounded and opt-in. Keep all existing storage, replay, auth, channel identity, and redaction contracts.

Use Node 24.21.0 as minimum and pnpm 12.5.1 as the initial package-manager target; validate availability and installation before changing executable requirements. Use an isolated temporary toolchain instead of replacing the host's Node installation. Record evidence-driven target adjustments here if registry/package artifacts disagree with metadata.

## Outcomes & Retrospective

Implementation in progress. Hosted actions and live integrations remain pending; local completion must not be represented as production certification.

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
