# Test Matrix

This document defines local and CI validation expectations.

The normal Node integration gate now includes docs-truth validation, so stale live-doc links or anchors, incomplete docs indexing, mismatched workflow statements, stale threshold references, and stale test inventories are expected to fail before merge instead of waiting for release review.

## Primary Local Gate

Run this before merge:

```bash
pnpm verify:all
```

`verify:all` executes workflow lint, build, lint, typecheck, both test runners, and both coverage gates.

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

- `bootstrap-arg-parsing.test.ts`
- `channel-adapter-send.test.ts`
- `channel-env-resolution.test.ts`
- `clock-health-branches.test.ts`
- `clock-health-eval.test.ts`
- `command-runner.test.ts`
- `config-security-schema.test.ts`
- `context.test.ts`
- `env-file.test.ts`
- `exec-guardrails.test.ts`
- `fs-tool-delete.test.ts`
- `fs-tool-write.test.ts`
- `git-dirty.test.ts`
- `health-check.test.ts`
- `install-context.test.ts`
- `install-state.test.ts`
- `lifecycle-readiness.test.ts`
- `migration.test.ts`
- `misfire-policy.test.ts`
- `oauth-redirect.test.ts`
- `observability-redaction.test.ts`
- `operator-layout-cleanup.test.ts`
- `operator-layout.test.ts`
- `operator-paths.test.ts`
- `pkg-install-tool.test.ts`
- `pnpm-workspace-policy.test.ts`
- `prompt-validation.test.ts`
- `provider-anthropic-tool-mapping.test.ts`
- `provider-codex-auth.test.ts`
- `provider-display.test.ts`
- `provider-openai-compatible-tool-mapping.test.ts`
- `provider-openai-tool-mapping.test.ts`
- `runtime-attachments-rendering.test.ts`
- `runtime-config-tools-wiring.test.ts`
- `runtime-context.test.ts`
- `runtime-self-knowledge.test.ts`
- `scheduler-branches.test.ts`
- `scheduler-cron.test.ts`
- `scheduler-interval.test.ts`
- `scheduler-worker.test.ts`
- `secrets-box.test.ts`
- `service-access.test.ts`
- `service-manager-adapter.test.ts`
- `service-manager-linux.test.ts`
- `service-manager-macos.test.ts`
- `setup-hub-actions.test.ts`
- `setup-hub.test.ts`
- `setup-post-save.test.ts`
- `setup-quickstart-branches.test.ts`
- `setup-quickstart-flow.test.ts`
- `setup-quickstart-oauth.test.ts`
- `setup-quickstart-validation.test.ts`
- `setup-wizard-branches.test.ts`
- `setup-wizard-runtime.test.ts`
- `setup-wizard-transform.test.ts`
- `time-validation.test.ts`
- `tool-loop-runtime.test.ts`
- `upgrade-state-machine.test.ts`
- `update-track.test.ts`
- `web-tool.test.ts`

## Integration Suites (Node test runner)

Current suite files under `tests/node/`:

- `bootstrap-interactive-contract.test.ts`
- `cli-api-surface-coverage.test.ts`
- `cli-command-branches.test.ts`
- `cli-command-integration.test.ts`
- `cli-docs-truth.test.ts`
- `cli-growth-status-coverage.test.ts`
- `cli-lib-coverage.test.ts`
- `cli-lifecycle-home-state-blackbox.test.ts`
- `cli-operator-layout-coverage.test.ts`
- `cli-prompt-validation-coverage.test.ts`
- `cli-root-commands.test.ts`
- `cli-service-lifecycle.test.ts`
- `cli-service-manager-coverage.test.ts`
- `cli-setup-hub-coverage.test.ts`
- `cli-setup-post-save-recovery.test.ts`
- `cli-setup-quickstart-oauth.test.ts`
- `cli-setup-quickstart-runtime.test.ts`
- `cli-setup-quickstart.test.ts`
- `cli-setup-validation-coverage.test.ts`
- `cli-setup-web-coverage.test.ts`
- `cli-setup-wizard.test.ts`
- `cli-upgrade-rollback.test.ts`
- `install-bootstrap-idempotence.test.ts`
- `install-curl-entrypoint-contract.test.ts`
- `manual-run.test.ts`
- `policy-engine.test.ts`
- `runtime-access-mode.test.ts`
- `runtime-attachments.test.ts`
- `runtime-codex-auth.test.ts`
- `runtime-chat-tool-exec.test.ts`
- `runtime-chat-tool-policy-gate.test.ts`
- `runtime-pkg-install-sudo.test.ts`
- `runtime-provider-tool-contracts.test.ts`
- `runtime-tool-audit.test.ts`
- `runtime.test.ts`
- `scheduler-runtime.test.ts`
- `storage.test.ts`
- `systemd-template-contract.test.ts`
- `workflow-lint-script.test.ts`

## Docs-Truth Validation

`tests/node/cli-docs-truth.test.ts` now validates:

- command examples across all live docs except `docs/execplans/**` resolve to real `openassist` commands
- relative links and in-repo anchors across all live docs resolve to real paths and headings
- `docs/README.md` links every live non-ExecPlan doc under `docs/`
- workflow statements match `.github/workflows/ci.yml`, `.github/workflows/codeql.yml`, `.github/workflows/service-smoke.yml`, and `.github/workflows/lifecycle-e2e-smoke.yml`
- coverage-threshold wording matches `vitest.config.ts` plus root `package.json`
- lifecycle E2E smoke keeps its inline `doctor --json` report-version expectation aligned with the current lifecycle-report version
- this file matches the exact on-disk `tests/node/*.test.ts` and `tests/vitest/*.test.ts` inventories

## GitHub Workflow Inventory

### CI (`.github/workflows/ci.yml`)

- trigger model:
  - `push` on `main`
  - `pull_request`
  - `workflow_dispatch`
  - scheduled cadence (`daily` at `04:30 UTC`)
- jobs:
  - workflow lint (`pnpm lint:workflows`)
  - quality and coverage matrix (`pnpm ci:strict`) on:
    - `ubuntu-latest`
    - `macos-latest`
    - `windows-latest`

### CodeQL (`.github/workflows/codeql.yml`)

- trigger model:
  - `push` on `main`
  - `pull_request` targeting `main`
  - `workflow_dispatch`
  - scheduled cadence (`Mon` at `05:15 UTC`)
- jobs:
  - `CodeQL preflight`
  - `analyze (javascript-typescript)`
- public-repo note:
  - this repo is currently public, so the workflow runs normally on PRs and pushes to `main`
  - the workflow still keeps its private-repo preflight guard for reuse in other repository contexts

### Service Smoke (`.github/workflows/service-smoke.yml`)

- trigger model:
  - `workflow_dispatch` (manual)
  - scheduled cadence (`Mon`/`Thu` at `06:00 UTC`)
- supplemental signal:
  - validates lifecycle dry-run behavior outside required per-push/PR gates
  - useful for periodic drift detection on hosted runners
- dry-run lifecycle checks on:
  - `ubuntu-latest`
  - `macos-latest`
- includes service install dry-run, tolerant service-status probing, and the expected `upgrade --dry-run` routing back to `openassist setup` when the checkout has not been configured as an install yet

### Lifecycle E2E Smoke (`.github/workflows/lifecycle-e2e-smoke.yml`)

- trigger model:
  - `workflow_dispatch` (manual)
  - scheduled cadence (`Tue`/`Sat` at `07:00 UTC`)
- supplemental signal:
  - validates a stronger bootstrap/home-state/install-state/doctor/upgrade path outside required per-push/PR gates
  - useful for catching lifecycle drift that dry-run-only smoke would miss
- bootstrap/home-state lifecycle checks on:
  - `ubuntu-latest`
  - `macos-latest`
- verifies:
  - non-interactive bootstrap onboarding handoff
  - home-state config/env/install-state paths
  - `openassist doctor` and `openassist doctor --json`
  - `openassist upgrade --dry-run`
  - clean repo status after normal operator-state creation outside the checkout

## Manual Acceptance Checklist

1. Bootstrap install succeeds and writes install-state.
2. Bootstrap prerequisite preflight detects missing `git`/`node`/`pnpm`, auto-installs when enabled, and provides retry/manual-fix troubleshooting flow on failures.
3. Bootstrap private-repo auth failures provide interactive recovery choices (`retry`, `clear cached credentials`, `abort`) rather than immediate hard-exit.
4. Direct CLI wrappers (`openassist`, `openassistd`) execute successfully.
5. Bare `openassist setup` opens the lifecycle hub on a TTY and refuses non-TTY mutation while printing scriptable guidance.
6. Setup quickstart enforces strict validation by default and writes schema-valid config/env output.
7. Setup wizard remains functional for advanced section edits and post-save checks support retry/skip/abort recovery.
8. Recognized legacy repo-local installs migrate safely into the home-state layout when targets are compatible, and conflicting targets stop with guided recovery instead of partial mutation.
9. Service install/start/status/restart/logs/health all behave on target platform.
10. `openassist doctor` and `openassist doctor --json` agree on the grouped lifecycle assessment.
11. Upgrade dry-run stays clean when operator state lives outside the repo, and real repo code changes still block live update.
12. Advanced developer install tracks behave predictably: branch installs follow their branch, and PR installs require explicit `--pr` or `--ref` on later upgrades.
13. Upgrade success path advances commit and remains healthy.
14. Upgrade failure path performs rollback and restores health.
15. Time status and timezone confirmation behave as configured.
16. Scheduler status/tasks/manual-run behave and persist run records.
17. Restart across scheduled windows respects misfire policy and dedup behavior.
18. Channel and OAuth command surfaces return clear diagnostics on failures.
19. In-channel `/status` returns runtime diagnostics without provider dependency and includes local docs/config/install pointers, the current service boundary, and the current self-maintenance boundary.
20. In-channel `/profile` returns global assistant profile memory without provider dependency; updates require explicit force (`/profile force=true; ...`).
21. Quickstart captures the main assistant name, persona, and ongoing objectives, and a quickstart-created install disables the later first-contact identity reminder by default.
22. Global assistant profile memory persists across sessions, and session bootstrap host profile context is injected deterministically into runtime context.
23. Provider/auth/runtime chat failures return sanitized operational diagnostic replies to channel.
24. Chat-driven tool loop executes end-to-end in `full-root` sessions and remains disabled in `operator/restricted`.
25. Tool invocation audit rows persist complete lifecycle (`running -> succeeded/failed/blocked`).
26. Guardrail blocks are visible and deterministic for destructive command patterns.
27. `/status` and `openassist tools status` show the same awareness boundary the model receives, including callable tools, native web backend state, and the current Linux service boundary when applicable.
28. Native web tools remain bounded: `web.search`/`web.fetch` work only in `full-root`, stay within HTTP/redirect/byte/result caps, and return structured unavailable guidance when no backend is configured.
29. Provider tool-call mapping contracts (OpenAI/Codex/Anthropic/OpenAI-compatible) remain interoperable.
30. Runtime startup remains non-blocking when a channel connector hangs during startup; daemon and health surfaces stay available.
31. Root `README.md`, root `AGENTS.md`, `docs/README.md`, all live non-ExecPlan docs, and `docs/testing/test-matrix.md` all describe the same current command, threshold, workflow, and troubleshooting reality.

## Remaining Gaps

- full live-provider contract certification with production credentials
- fully automated live channel end-to-end tests in CI
- long-duration multi-day soak data collection on production-like hosts
