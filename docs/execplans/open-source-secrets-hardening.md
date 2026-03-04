# Open Source Secrets Hardening Baseline and Rewrite

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document is maintained under the rules in `.agents/PLANS.md`.

## Purpose / Big Picture

This change makes OpenAssist safer to release publicly by enforcing a single supported secret backend, rejecting plaintext secret material in config, encrypting OAuth flow verifier material at rest, and redacting secret-bearing payloads before durable audit persistence and logs. After this plan is complete, operators can run the same setup flow while getting stronger secret defaults, stricter validation, and cleaner audit trails without losing operational observability.

## Progress

- [x] (2026-03-02 18:24Z) Enforced `security.secretsBackend` as `"encrypted-file"` only in core types, config schema, loader guardrails, runtime startup guard, and setup wizard/config edit defaults.
- [x] (2026-03-02 18:24Z) Enforced secret-safe config patterns: channel secret-like settings now require `env:VAR_NAME`, and `clientSecretEnv` now validates env-var naming constraints.
- [x] (2026-03-02 18:24Z) Added migration conversion for plaintext channel secret-like values to `env:` references with explicit warnings.
- [x] (2026-03-02 18:24Z) Hardened `SecretBox` key handling to strict 32-byte base64 key material and removed weak passphrase fallback.
- [x] (2026-03-02 18:24Z) Added Unix secret-path permission enforcement for key files, runtime data dir, DB path, and env file handling with explicit Windows diagnostics.
- [x] (2026-03-02 18:24Z) Encrypted OAuth PKCE verifier at rest with backward-compatible plaintext fallback for legacy rows.
- [x] (2026-03-02 18:24Z) Implemented centralized deep redaction and applied it to tool invocation persistence and high-risk structured logs.
- [x] (2026-03-02 18:24Z) Added and updated tests covering schema enforcement, strict key format, redaction behavior, and OAuth verifier storage behavior.
- [x] (2026-03-02 18:40Z) Synchronized release docs/changelog and added CodeQL workflow (`.github/workflows/codeql.yml`).
- [x] (2026-03-02 18:40Z) Ran full strict validation gate successfully (`pnpm verify:all`).
- [x] (2026-03-02 18:40Z) Created safety backup branch, rewrote `main` to a single new root commit, and force-pushed rewritten history.
- [x] (2026-03-02 18:40Z) Deleted pre-rewrite workflow runs and Actions cache where GitHub permissions allowed deletion.
- [x] (2026-03-02 18:40Z) Applied `main` branch protection (PR required, conversation resolution required, required CI contexts, force-push/deletion blocked).
- [x] (2026-03-03 12:55Z) Fixed Unix/macOS CI regressions from strict env permission checks in launchd adapter/tests and revalidated with `pnpm verify:all`.
- [ ] (2026-03-03 12:55Z) Enable secret scanning/push protection/code scanning while repo is private (blocked: GitHub reports feature unavailable without Advanced Security on current private repository).

## Surprises & Discoveries

- Observation: Existing docs and setup flows already strongly implied env indirection for channel secrets, but enforcement was not fully schema-level for all secret-like channel keys.
  Evidence: New schema and setup-validation tests now fail plaintext secret-like channel values and invalid env-var references.
- Observation: Tool invocation data needed redaction both at write time and read time to protect pre-hardening rows.
  Evidence: Storage-layer redaction now runs on insert/update and on `listToolInvocations` output.
- Observation: Permission testing required host-filesystem awareness rather than mocked `process.platform` alone.
  Evidence: Env-file permission checks now gate strict mode using filesystem semantics (`path.sep`) to avoid false failures under test mocks.
- Observation: Enforcing env-file directory permissions surfaced real Unix-path failures in CI test paths.
  Evidence: Linux/macOS CI failed in `env-file.test.ts` and `service-manager-adapter.test.ts` with `0o644`/`0o755` errors until launchd wrapper-dir chmod + test expectations were corrected.
- Observation: GitHub scanning controls are partially plan-gated for this private repository.
  Evidence: `gh api` returned HTTP 422 for secret scanning (`Secret scanning is not available for this repository`) and Advanced Security (`Advanced security has not been purchased`); CodeQL run reported `Code scanning is not enabled for this repository`.

## Decision Log

- Decision: Support only `encrypted-file` for V1.4 baseline and explicitly reject legacy unsupported backend values.
  Rationale: A single deterministic backend is easier to validate cross-platform and avoids exposing nonfunctional UX choices.
  Date/Author: 2026-03-02 / Codex
- Decision: Enforce env-reference semantics for secret-like channel fields in schema, not only setup prompts.
  Rationale: Schema-level enforcement protects all config paths, including manual edits and overlays.
  Date/Author: 2026-03-02 / Codex
- Decision: Encrypt PKCE flow verifier material at rest while preserving plaintext fallback reads.
  Rationale: Security hardening should not break existing in-flight flow rows in previously initialized databases.
  Date/Author: 2026-03-02 / Codex
- Decision: Redact secrets before durable tool invocation persistence and also on retrieval.
  Rationale: Prevent future leakage and clean presentation of historical rows in operator APIs/CLI.
  Date/Author: 2026-03-02 / Codex

## Outcomes & Retrospective

Runtime/config hardening, docs synchronization, full strict validation, history rewrite, and branch protection rollout are complete. Remaining gap is GitHub feature availability for secret scanning/push protection/code-scanning while this repository remains private under the current account plan.

## Context and Orientation

Relevant implementation surfaces:

- Core contracts: `packages/core-types/src/runtime.ts`
- Config validation/load: `packages/config/src/schema.ts`, `packages/config/src/loader.ts`
- Runtime enforcement and OAuth flow handling: `packages/core-runtime/src/runtime.ts`, `packages/core-runtime/src/secrets.ts`, `packages/core-runtime/src/tool-router.ts`
- Durable storage and tool invocation persistence: `packages/storage-sqlite/src/index.ts`
- CLI setup/service/env management: `apps/openassist-cli/src/lib/setup-wizard.ts`, `apps/openassist-cli/src/lib/setup-validation.ts`, `apps/openassist-cli/src/lib/setup-quickstart.ts`, `apps/openassist-cli/src/lib/service-manager.ts`, `apps/openassist-cli/src/lib/env-file.ts`
- Daemon startup security checks: `apps/openassistd/src/index.ts`
- Observability redaction utility: `packages/observability/src/index.ts`

Terms used in this plan:

- Secret backend: component that handles encryption key material and at-rest secret encryption/decryption behavior.
- Env indirection: config value in `env:VAR_NAME` form that is resolved from process environment at runtime.
- PKCE verifier: temporary OAuth proof value used during OAuth authorization-code exchange.
- Durable audit row: persisted database record in `tool_invocations` that tracks tool execution lifecycle states.

## Plan of Work

The work is executed in four chunks. First, lock secret backend behavior and schema semantics so unsupported backends and plaintext secret-like channel settings are rejected consistently in loader, runtime, and setup flows. Second, harden secret material handling by requiring strict encryption key format and enforcing Unix file-permission checks for key/env/data/db paths where host semantics support it. Third, protect sensitive runtime data by encrypting OAuth flow verifier values and redacting secret-bearing request/result payloads before audit persistence and log emission while preserving lifecycle metadata. Fourth, complete release discipline by synchronizing required docs/changelog, validating with `pnpm verify:all`, rewriting history to a single hardened root commit, and enabling GitHub scanning/protection controls before public release.

## Concrete Steps

Run from repository root:

1. `pnpm -r build`
2. `pnpm test:vitest`
3. `pnpm test:node`
4. `pnpm verify:all`
5. `git branch backup/pre-security-rewrite-<timestamp>`
6. `git checkout --orphan rewritten-main`
7. `git add -A`
8. `git commit -m "Initial commit: security-hardened secret handling baseline"`
9. `git branch -M main`
10. `git push --force-with-lease origin main`
11. `gh run list --repo openassistuk/openassist --json databaseId --jq '.[].databaseId' | ForEach-Object { gh run delete $_ --repo openassistuk/openassist }`
12. `gh cache delete --all --repo openassistuk/openassist`
13. Enable secret scanning + push protection + branch protection via `gh api`/repo settings and verify with follow-up API reads.

## Validation and Acceptance

Accept when all behaviors below are observed:

- Config schema rejects plaintext secret-like channel settings and invalid `clientSecretEnv`.
- Setup wizard no longer offers `os-keyring` and persists `encrypted-file`.
- Runtime fails fast if a legacy config still provides unsupported `security.secretsBackend`.
- `SecretBox` accepts only strict base64 32-byte env key material.
- OAuth flow rows store encrypted verifier payload (`enc:` prefix), and legacy plaintext rows remain consumable.
- `tool_invocations` request/result payloads are redacted in persisted rows and API/CLI reads.
- Unix permission checks enforce owner-only modes for secret-bearing paths where supported.
- `pnpm verify:all` succeeds.
- Remote `main` history shows one root commit after rewrite.

## Idempotence and Recovery

Code and doc edits are additive and safe to rerun. Validation commands are repeatable. Before rewrite, create a timestamped backup branch for rollback. If force-push or guardrail configuration fails, keep repo private, restore from backup branch, and re-run runbook steps after fixing the blocking issue. Cleanup steps (`gh run delete`, `gh cache delete --all`) are safe to repeat and naturally no-op when nothing remains.

## Artifacts and Notes

Key implementation artifacts:

- New tests:
  - `tests/vitest/config-security-schema.test.ts`
  - `tests/vitest/observability-redaction.test.ts`
  - `tests/vitest/secrets-box.test.ts`
- Updated integration/unit tests for runtime, storage, migration, setup, env-file, and service-manager behavior.

Expected branch-protection contexts for `main`:

- `workflow-lint`
- `quality-and-coverage (ubuntu-latest)`
- `quality-and-coverage (macos-latest)`
- `quality-and-coverage (windows-latest)`

## Interfaces and Dependencies

Interface changes:

- `RuntimeSecurityConfig.secretsBackend` is now `"encrypted-file"` only.
- Config schema now enforces env-var naming for `clientSecretEnv`.
- Channel secret-like settings now require `env:VAR_NAME` strings.
- Tool invocation persistence/read behavior returns redacted request/result payload content while preserving lifecycle metadata.

Dependencies and workflow surfaces:

- Runtime contracts in `packages/core-types`.
- Schema/loader in `packages/config`.
- SQLite persistence in `packages/storage-sqlite`.
- Observability utility in `packages/observability`.
- GitHub Actions workflows in `.github/workflows/`.

Revision (2026-03-02 18:24Z): Initialized plan with implemented hardening decisions, evidence-backed progress, and remaining release/rewrite guardrail tasks to complete public-readiness baseline.
Revision (2026-03-02 18:40Z): Recorded completion of docs/changelog sync, full strict verification, single-root rewrite, force-push, Actions cleanup, and branch protection configuration.
Revision (2026-03-03 12:55Z): Recorded Unix/macOS CI follow-up fixes for strict permission enforcement paths and documented private-repo GitHub scanning feature blockers.
