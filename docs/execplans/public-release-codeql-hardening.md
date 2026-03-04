# Public Release CodeQL Hardening and Single-Commit Rewrite

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document is maintained under the rules in `.agents/PLANS.md`.

## Purpose / Big Picture

This change closes all open CodeQL alerts before public release and keeps repository history as a single hardened initial commit. After completion, operators can keep current CLI/daemon behavior while reducing log exposure risk, tightening file-write race safety, and enforcing stronger main-branch protections with required CI and CodeQL checks.

## Progress

- [x] (2026-03-03 18:15Z) Created execution plan artifact and started implementation tracking.
- [x] (2026-03-03 18:15Z) Patched CLI browser launch to non-shell path with strict URL validation.
- [x] (2026-03-03 18:15Z) Removed clear-text OAuth/API-key status body logging in CLI auth status and quickstart flow.
- [x] (2026-03-03 18:15Z) Hardened daemon HTTP error responses to avoid returning internal server details.
- [x] (2026-03-03 18:15Z) Refactored OAuth callback/complete handling to avoid direct presence-check gate pattern.
- [x] (2026-03-03 18:15Z) Replaced regex-based hidden-block removal with deterministic block stripping.
- [x] (2026-03-03 18:15Z) Reworked fs/env/secrets writes to descriptor-based and atomic create flows.
- [x] (2026-03-03 18:15Z) Fixed test-surface findings (anchored contract assertion and unused import) and updated impacted tests.
- [x] (2026-03-03 18:15Z) Added/updated targeted tests and ran focused suites for modified surfaces.
- [x] (2026-03-03 18:18Z) Ran full quality and audit gates (`pnpm verify:all`, `pnpm audit --prod --audit-level high`, `pnpm audit --audit-level high`).
- [ ] Re-run CodeQL on preflight branch and verify open alerts by ref are zero.
- [ ] Rewrite/push final single-commit main with minimal ruleset disable window and restore hardened ruleset.
- [ ] Confirm post-push release-readiness checks (alerts/check-runs/security settings/ruleset contexts).

## Surprises & Discoveries

- Observation: CodeQL clear-text logging findings were triggered by structured CLI output paths even when values were operator-facing and not raw secrets.
  Evidence: Alert set included OAuth status and quickstart operator guidance lines in CLI surfaces.
- Observation: Existing node/vitest tests did not depend on quickstart OAuth console text, allowing safer redaction without changing control flow assertions.
  Evidence: Focused suite pass after text hardening in quickstart and auth status paths.

## Decision Log

- Decision: Keep auth-status command operational but redact OAuth account details from CLI output.
  Rationale: Preserve command usability while eliminating high-risk sink patterns and avoiding raw OAuth payload output.
  Date/Author: 2026-03-03 / Codex
- Decision: Convert daemon 500 responses to generic `internal server error` while preserving detailed server logs.
  Rationale: Close stack-trace exposure risk without losing operator diagnostics in log streams.
  Date/Author: 2026-03-03 / Codex
- Decision: Use `openSync` (`O_CREAT|O_EXCL`) and descriptor writes for env/secrets creation paths.
  Rationale: Remove TOCTOU patterns and make creation semantics deterministic under concurrent access.
  Date/Author: 2026-03-03 / Codex

## Outcomes & Retrospective

Implementation-level remediation is in progress and targeted suites already pass. Remaining work is end-to-end verification plus GitHub-side preflight/rewriting/re-hardening sequence.

## Context and Orientation

Primary touched surfaces:

- CLI auth/remote command orchestration: `apps/openassist-cli/src/index.ts`
- CLI quickstart OAuth onboarding: `apps/openassist-cli/src/lib/setup-quickstart.ts`
- Daemon HTTP API and OAuth endpoints: `apps/openassistd/src/index.ts`
- Runtime output sanitization: `packages/core-runtime/src/context.ts`
- Runtime OAuth completion validation: `packages/core-runtime/src/runtime.ts`
- File/secret/env write safety paths: `packages/tools-fs/src/index.ts`, `packages/core-runtime/src/secrets.ts`, `apps/openassist-cli/src/lib/env-file.ts`
- Coverage/tests: `tests/node/cli-command-branches.test.ts`, `tests/node/install-curl-entrypoint-contract.test.ts`, `tests/vitest/context.test.ts`, `tests/vitest/setup-wizard-branches.test.ts`, `tests/vitest/fs-tool-write.test.ts`
- Release notes: `CHANGELOG.md`

## Plan of Work

Apply code-level remediations for every open CodeQL finding first, then run full quality and audit gates locally. After local green status, run a preflight branch CodeQL pass and confirm zero open alerts on that ref. Finally, perform a minimal-time ruleset disable only for force-pushing the amended single commit to `main`, then immediately restore hardened branch/ruleset requirements including required CodeQL analyze check context.

## Concrete Steps

Run from repository root:

1. `pnpm verify:all`
2. `pnpm audit --prod --audit-level high`
3. `pnpm audit --audit-level high`
4. `git commit --amend --no-edit`
5. `git checkout -B hardening/preflight-initial-rewrite`
6. `git push --force-with-lease origin hardening/preflight-initial-rewrite`
7. `gh workflow run CodeQL --ref hardening/preflight-initial-rewrite`
8. Poll run completion and verify: `gh api "repos/openassistuk/openassist/code-scanning/alerts?state=open&ref=refs/heads/hardening/preflight-initial-rewrite&per_page=100" --jq 'length'`
9. Disable ruleset `13459693` enforcement briefly, force-push amended `main`, re-enable ruleset with required contexts including `analyze (javascript-typescript) (javascript-typescript)`.
10. Validate post-push security and checks:
   - alert counts (Code scanning/Dependabot/Secret scanning)
   - required checks green on `main`
   - ruleset contexts match expected list.

## Validation and Acceptance

Accept when all of the following are true:

- `pnpm verify:all` passes.
- Both `pnpm audit` commands pass at high threshold.
- Preflight branch has zero open CodeQL alerts.
- `main` remains a single commit after rewrite force-push.
- Ruleset `Protect main` is active and requires PR + CI matrix + CodeQL preflight + CodeQL analyze context.
- Open alert counts are all zero (Code scanning, Dependabot, secret scanning).

## Idempotence and Recovery

All code changes are safe to rerun and tests are repeatable. Before any force push, capture current ruleset JSON and keep the preflight branch as rollback reference. If rewrite or ruleset restore fails, immediately reapply saved ruleset JSON and force-push known-good commit hash.

## Artifacts and Notes

Focused validation evidence already collected during implementation:

- `pnpm exec vitest run tests/vitest/context.test.ts tests/vitest/env-file.test.ts tests/vitest/secrets-box.test.ts tests/vitest/fs-tool-write.test.ts tests/vitest/setup-wizard-branches.test.ts` passed.
- `pnpm exec tsx --test tests/node/cli-command-branches.test.ts tests/node/install-curl-entrypoint-contract.test.ts` passed.

## Interfaces and Dependencies

No public API/schema contract changes. Internal behavior changes are limited to safer output/log handling, safer URL launch handling, safer file creation/write semantics, and stricter OAuth completion input validation.

Revision (2026-03-03 18:15Z): Initialized plan and recorded active remediation implementation status.
Revision (2026-03-03 18:18Z): Recorded full local verification success and high-threshold audit gate results.
