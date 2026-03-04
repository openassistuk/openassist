# Test Matrix

This document defines local and CI validation expectations.

## Primary Local Gate

Run this before merge:

```bash
pnpm verify:all
```

`verify:all` executes strict workflow lint, build, type/lint checks, test suites, and coverage gates.

## Local Command Breakdown

```bash
pnpm lint:workflows
pnpm -r build
pnpm lint
pnpm typecheck
pnpm test:vitest
pnpm test:node
pnpm test:coverage:vitest
pnpm test:coverage:node
```

## Coverage Gates

Vitest gate (`pnpm test:coverage:vitest`):

- lines/statements/functions >= 81
- branches >= 71

Node integration gate (`pnpm test:coverage:node`):

- lines/statements >= 79
- functions >= 80
- branches >= 70

## Unit and Logic Suites (Vitest)

Current suite files under `tests/vitest/`:

- `clock-health-eval.test.ts`
- `clock-health-branches.test.ts`
- `scheduler-worker.test.ts`
- `scheduler-branches.test.ts`
- `scheduler-cron.test.ts`
- `scheduler-interval.test.ts`
- `misfire-policy.test.ts`
- `time-validation.test.ts`
- `setup-wizard-runtime.test.ts`
- `setup-wizard-transform.test.ts`
- `setup-wizard-branches.test.ts`
- `setup-quickstart-validation.test.ts`
- `setup-quickstart-flow.test.ts`
- `setup-quickstart-branches.test.ts`
- `prompt-validation.test.ts`
- `bootstrap-arg-parsing.test.ts`
- `service-manager-linux.test.ts`
- `service-manager-macos.test.ts`
- `service-manager-adapter.test.ts`
- `upgrade-state-machine.test.ts`
- `command-runner.test.ts`
- `env-file.test.ts`
- `runtime-context.test.ts`
- `install-state.test.ts`
- `health-check.test.ts`
- `channel-env-resolution.test.ts`
- `context.test.ts`
- `migration.test.ts`
- `config-security-schema.test.ts`
- `exec-guardrails.test.ts`
- `fs-tool-delete.test.ts`
- `fs-tool-write.test.ts`
- `pkg-install-tool.test.ts`
- `tool-loop-runtime.test.ts`
- `runtime-config-tools-wiring.test.ts`
- `observability-redaction.test.ts`
- `secrets-box.test.ts`
- `setup-post-save.test.ts`
- `setup-quickstart-oauth.test.ts`
- `provider-openai-tool-mapping.test.ts`
- `provider-anthropic-tool-mapping.test.ts`
- `provider-openai-compatible-tool-mapping.test.ts`
- `pnpm-workspace-policy.test.ts`

## Integration Suites (Node test runner)

Current suite files under `tests/node/`:

- `cli-api-surface-coverage.test.ts`
- `cli-root-commands.test.ts`
- `cli-command-integration.test.ts`
- `cli-command-branches.test.ts`
- `cli-setup-validation-coverage.test.ts`
- `cli-lib-coverage.test.ts`
- `cli-prompt-validation-coverage.test.ts`
- `cli-setup-quickstart.test.ts`
- `cli-setup-quickstart-oauth.test.ts`
- `cli-setup-quickstart-runtime.test.ts`
- `cli-setup-post-save-recovery.test.ts`
- `cli-setup-wizard.test.ts`
- `cli-service-lifecycle.test.ts`
- `cli-service-manager-coverage.test.ts`
- `cli-upgrade-rollback.test.ts`
- `workflow-lint-script.test.ts`
- `install-bootstrap-idempotence.test.ts`
- `bootstrap-interactive-contract.test.ts`
- `install-curl-entrypoint-contract.test.ts`
- `systemd-template-contract.test.ts`
- `runtime.test.ts`
- `runtime-chat-tool-exec.test.ts`
- `runtime-chat-tool-policy-gate.test.ts`
- `runtime-tool-audit.test.ts`
- `runtime-pkg-install-sudo.test.ts`
- `runtime-provider-tool-contracts.test.ts`
- `scheduler-runtime.test.ts`
- `manual-run.test.ts`
- `storage.test.ts`

## Required CI Workflows

### CI (`.github/workflows/ci.yml`)

- workflow lint job (`pnpm lint:workflows`)
- quality and coverage matrix running `pnpm ci:strict` on:
  - `ubuntu-latest`
  - `macos-latest`
  - `windows-latest`

### Service Smoke (`.github/workflows/service-smoke.yml`)

- trigger model:
  - `workflow_dispatch` (manual)
  - scheduled cadence (Mon/Thu 06:00 UTC)
- supplemental signal:
  - validates lifecycle dry-run behavior outside required per-push/PR gates
  - useful for periodic drift detection on hosted runners
- dry-run lifecycle checks on:
  - `ubuntu-latest`
  - `macos-latest`
- includes service install dry-run and upgrade dry-run

## Manual Acceptance Checklist

1. Bootstrap install succeeds and writes install-state.
2. Bootstrap prerequisite preflight detects missing `git`/`node`/`pnpm`, auto-installs when enabled, and provides retry/manual-fix troubleshooting flow on failures.
3. Bootstrap private-repo auth failures provide interactive recovery choices (`retry`, `clear cached credentials`, `abort`) rather than immediate hard-exit.
4. Direct CLI wrappers (`openassist`, `openassistd`) execute successfully.
5. Setup quickstart enforces strict validation by default and writes schema-valid config/env output.
6. Setup wizard remains functional for advanced section edits and post-save checks support retry/skip/abort recovery.
7. Service install/start/status/restart/logs/health all behave on target platform.
8. Upgrade success path advances commit and remains healthy.
9. Upgrade failure path performs rollback and restores health.
10. Time status and timezone confirmation behave as configured.
11. Scheduler status/tasks/manual-run behave and persist run records.
12. Restart across scheduled windows respects misfire policy and dedup behavior.
13. Channel and OAuth command surfaces return clear diagnostics on failures.
14. In-channel `/status` returns runtime diagnostics without provider dependency.
15. In-channel `/profile` returns global assistant profile memory without provider dependency; updates require explicit force (`/profile force=true; ...`).
16. Global assistant profile memory persists across sessions, and session bootstrap host profile context is injected deterministically into runtime context.
17. Provider/auth/runtime chat failures return sanitized operational diagnostic replies to channel.
18. Chat-driven tool loop executes end-to-end in `full-root` sessions and remains disabled in `operator/restricted`.
19. Tool invocation audit rows persist complete lifecycle (`running -> succeeded/failed/blocked`).
20. Guardrail blocks are visible and deterministic for destructive command patterns.
21. Provider tool-call mapping contracts (OpenAI/Anthropic/OpenAI-compatible) remain interoperable.
22. Runtime startup remains non-blocking when a channel connector hangs during startup; daemon and health surfaces stay available.

## Remaining Gaps

- full live-provider contract certification with production credentials
- fully automated live channel end-to-end tests in CI
- long-duration multi-day soak data collection on production-like hosts
