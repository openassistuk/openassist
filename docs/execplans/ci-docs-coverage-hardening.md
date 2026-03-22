# CI, Docs Truth, and Coverage Hardening

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document must be maintained in accordance with `.agents/PLANS.md`.

## Purpose / Big Picture

This branch hardens OpenAssist's CI, workflow freshness checks, docs truth, and coverage reporting without changing the product contract. After this work, GitHub workflow majors should stay aligned with the current safe action channels, docs should describe the workflow and coverage surfaces truthfully, and the enforced coverage reports should better reflect real product code rather than mixing in test files.

The visible proof is that `pnpm verify:all` passes locally, the PR reaches green `CI`, `CodeQL`, and `macOS Live Launchd`, the two supplemental smoke workflows pass when manually dispatched on the branch, and there are no actionable review comments or PR-head code-scanning alerts left open.

## Progress

- [x] (2026-03-22 13:36Z) Created branch `chore/ci-docs-coverage-hardening` from `main`.
- [x] (2026-03-22 13:36Z) Re-audited the current workflow files, coverage configuration, docs-truth suite, and low-confidence test surfaces before editing.
- [x] (2026-03-22 14:07Z) Updated the tracked workflow action majors and extended `scripts/dev/lint-workflows.mjs` plus `tests/node/workflow-lint-script.test.ts` to enforce the approved minimum action floors.
- [x] (2026-03-22 14:10Z) Adjusted coverage reporting scope so Node coverage excludes `tests/**` and Vitest measures the selected additional operator-relevant source files.
- [x] (2026-03-22 14:24Z) Added the requested targeted Vitest coverage plus targeted Node coverage for the remaining CLI command surface needed to keep the honest Node gate green.
- [x] (2026-03-22 14:26Z) Refreshed `README.md`, `AGENTS.md`, `docs/README.md`, `docs/testing/test-matrix.md`, `CHANGELOG.md`, and `tests/node/cli-docs-truth.test.ts` so workflow and coverage statements match code truth.
- [x] (2026-03-22 14:30Z) Ran focused suites and a full `pnpm verify:all` pass and recorded the evidence below.
- [x] (2026-03-22 14:48Z) Pushed the branch, opened PR `#47`, reran the supplemental smoke workflows on the final head SHA, addressed the Copilot review follow-ups, and confirmed the PR’s automated state is green.

## Surprises & Discoveries

- Observation: the branch baseline is already green, so this is a hardening pass rather than a break-fix pass.
  Evidence: `pnpm verify:all` passed on `main` during the 2026-03-22 planning audit before branch creation.

- Observation: the current enforced coverage stories are selective, not repo-wide.
  Evidence: the current audit found `77` tracked `src` files under `apps/` and `packages/`, while the active coverage configurations currently measure only a subset of those files and the Node report still includes test files in its totals.

- Observation: the tracked workflow action majors are no longer at the latest safe channels.
  Evidence: `.github/workflows/*.yml` currently use `actions/checkout@v5`, `actions/setup-node@v5`, and `actions/upload-artifact@v6`, while GitHub releases on 2026-03-22 show `actions/checkout@v6.0.2`, `actions/setup-node@v6.3.0`, and `actions/upload-artifact@v7.0.0`.

- Observation: excluding `tests/**` from the Node coverage command made the gate more honest but immediately exposed remaining low-value CLI command plumbing as the real local blocker.
  Evidence: after the coverage-scope change, `pnpm test:coverage:node` initially rose only to `78.31%` lines/statements and the largest misses were concentrated in `apps/openassist-cli/src/commands/{service,setup,upgrade}.ts` plus the two large setup flow modules.

- Observation: the cheapest safe way to recover the honest Node gate was to make `apps/openassist-cli/src/commands/service.ts` injectable for tests instead of adding more black-box CLI coverage that would touch the real host service manager.
  Evidence: a small dependency-injection seam plus `tests/node/cli-service-command-registration.test.ts` raised the Node gate to `80.08%` lines/statements without changing operator-facing behavior.

- Observation: the automated review loop surfaced two valid follow-ups after the first green PR build, but both were small truth-preserving fixes rather than architectural changes.
  Evidence: Copilot flagged the workflow-lint glob fallback and an unrestored `vi.spyOn(fs.promises, "rm")`; both were fixed in follow-up commit `ada2578` and revalidated with `pnpm verify:all`.

## Decision Log

- Decision: keep this branch scoped to truthful hardening of CI, docs, and selected high-value coverage surfaces instead of trying to cover every tracked source file.
  Rationale: the repo is already green, and the highest-value improvement is to make current gates more honest and slightly broader without turning this into an unbounded test rewrite.
  Date/Author: 2026-03-22 / Codex

- Decision: keep `github/codeql-action/*@v4` unchanged unless implementation-time verification finds an official stable successor channel.
  Rationale: the current workflow is green, the planning audit did not identify a newer stable major channel, and the requested work is workflow freshness hardening rather than speculative churn.
  Date/Author: 2026-03-22 / Codex

- Decision: recover the honest Node gate with targeted command-registration tests rather than weakening thresholds or broadening the branch into a full CLI rewrite.
  Rationale: once `tests/**` were excluded from the Node report, the remaining shortfall was concentrated in deterministic command plumbing that could be covered safely with injected dependencies and without touching the real host lifecycle manager.
  Date/Author: 2026-03-22 / Codex

## Outcomes & Retrospective

Local implementation is complete and the branch is ready for the GitHub PR/check loop. The workflow files now use the approved action majors, workflow lint enforces those floors, docs describe the workflow inventory and required-versus-supplemental semantics truthfully, Node coverage excludes `tests/**`, Vitest measures the selected additional operator-relevant files, and the targeted tests close the widened coverage gaps without lowering thresholds.

Local evidence captured on 2026-03-22:

- Focused Node truth/lint/growth/command tests passed:
  - `pnpm exec tsx --test tests/node/workflow-lint-script.test.ts tests/node/cli-docs-truth.test.ts tests/node/cli-growth-status-coverage.test.ts tests/node/cli-service-command-registration.test.ts`
- Focused Vitest suites passed:
  - `pnpm exec vitest run tests/vitest/provider-auth-readiness.test.ts tests/vitest/growth-status.test.ts tests/vitest/operator-layout.test.ts tests/vitest/operator-layout-cleanup.test.ts tests/vitest/runtime-context.test.ts tests/vitest/upgrade-state-machine.test.ts`
  - `pnpm exec vitest run tests/vitest/growth-status.test.ts tests/vitest/install-context.test.ts tests/vitest/runtime-self-knowledge.test.ts tests/vitest/runtime-attachments-rendering.test.ts`
- Full Vitest coverage passed:
  - `pnpm test:coverage:vitest`
  - Result: lines/statements `81.32%`, branches `76.21%`, functions `90.49%`
- Full Node coverage passed after the final command-coverage additions:
  - `pnpm test:coverage:node`
  - Result: lines/statements `80.08%`, branches `73.01%`, functions `91.70%`
- Full local merge gate passed:
  - `pnpm verify:all`

Remaining work is external to the workspace: push the branch, open the PR, wait for green `CI`, `CodeQL`, and `macOS Live Launchd`, manually dispatch and pass `service-smoke.yml` plus `lifecycle-e2e-smoke.yml`, confirm there are no unresolved actionable review comments or `CHANGES_REQUESTED`, and confirm there are no open code-scanning alerts for the PR head SHA.

PR validation evidence on the final head SHA `ada257830f6d52c3ec7f63faedb5dc3495c8afc3`:

- PR: `https://github.com/openassistuk/openassist/pull/47`
- Required checks green:
  - `workflow-lint`
  - `quality-and-coverage (ubuntu-latest)`
  - `quality-and-coverage (macos-latest)`
  - `quality-and-coverage (windows-latest)`
  - `CodeQL preflight`
  - `analyze (javascript-typescript)`
  - `CodeQL`
  - `launchd-live-smoke (macos-latest)`
- Supplemental workflow_dispatch runs green on the same branch head:
  - Service Smoke run `23405403907`
  - Lifecycle E2E Smoke run `23405404217`
- Review state:
  - No `CHANGES_REQUESTED`
  - Both Copilot review threads resolved after follow-up commit `ada2578`
  - No issue comments requiring action
- Code scanning:
  - `gh api "repos/openassistuk/openassist/code-scanning/alerts?state=open&ref=refs/heads/chore/ci-docs-coverage-hardening&per_page=100"` returned `[]`
- Merge status:
  - `mergeable = MERGEABLE`
  - `mergeStateStatus = BLOCKED`
  - `reviewDecision = REVIEW_REQUIRED`
  - Interpretation: the remaining block is human review/approval, which is expected for manual check and merge.

## Context and Orientation

The workflow truth sources for this branch are `.github/workflows/ci.yml`, `.github/workflows/codeql.yml`, `.github/workflows/macos-live-launchd.yml`, `.github/workflows/service-smoke.yml`, and `.github/workflows/lifecycle-e2e-smoke.yml`. Workflow freshness enforcement currently lives in `scripts/dev/lint-workflows.mjs` and is covered only lightly by `tests/node/workflow-lint-script.test.ts`.

The current docs-truth suite is `tests/node/cli-docs-truth.test.ts`. It already validates live-doc links, anchors, docs index completeness, workflow wording, thresholds, and test inventory, but it does not yet validate any explicit coverage-scope wording and it relies on the current workflow files and package config as the source of truth.

The coverage configuration lives in root `package.json` (`test:coverage:node`) and `vitest.config.ts` (`test.coverage.include`). The current Node coverage report still includes test files in its totals, and the current Vitest coverage scope excludes several already-tested operator-relevant files such as `apps/openassistd/src/install-context.ts`, `apps/openassistd/src/oauth-redirect.ts`, `packages/config/src/schema.ts`, `packages/core-runtime/src/attachments.ts`, `packages/core-runtime/src/memory.ts`, and `packages/tools-web/src/index.ts`.

The main low-confidence implementation surfaces for this pass are `apps/openassist-cli/src/lib/provider-auth-readiness.ts`, `apps/openassist-cli/src/lib/growth-status.ts`, `apps/openassist-cli/src/lib/operator-layout.ts`, `apps/openassist-cli/src/lib/runtime-context.ts`, and `apps/openassist-cli/src/lib/upgrade.ts`.

## Plan of Work

First, update the active workflow files and the workflow lint helper together. The workflow files must move to the current major tags for `actions/checkout`, `actions/setup-node`, and `actions/upload-artifact` where applicable while preserving the existing trigger, concurrency, Node, pnpm, and required-versus-supplemental semantics. In the same milestone, `scripts/dev/lint-workflows.mjs` must grow a policy check that fails if tracked workflows use older-than-approved major tags for those actions or for `github/codeql-action/*`.

Next, make the coverage reports more truthful before widening docs. The Node coverage command in `package.json` must exclude `tests/**` so the reported totals describe product files, not test files. The Vitest coverage include list in `vitest.config.ts` must expand only to the selected already-tested operator-relevant source files for this branch.

Then add the targeted tests needed to keep the widened coverage scope green and to close current branch gaps. This includes new Vitest files for provider auth readiness and growth status plus extensions to the existing operator-layout, operator-layout-cleanup, runtime-context, and upgrade-state-machine suites.

Finally, update the required docs and release notes so they describe the workflow inventory, workflow freshness policy, local verification path, and coverage-scope truth precisely. Then widen `tests/node/cli-docs-truth.test.ts` so those statements are enforced, rerun focused validation plus `pnpm verify:all`, push the branch, open the PR, dispatch the supplemental smoke workflows, and keep iterating until the PR is fully green.

## Concrete Steps

From the repository root:

1. Update `scripts/dev/lint-workflows.mjs`, `tests/node/workflow-lint-script.test.ts`, and the changed workflow files.
2. Update root `package.json` and `vitest.config.ts`.
3. Add or extend the targeted Vitest coverage files.
4. Update `README.md`, `AGENTS.md`, `docs/README.md`, `docs/testing/test-matrix.md`, `CHANGELOG.md`, and `tests/node/cli-docs-truth.test.ts`.
5. Run focused validation:

       pnpm exec tsx --test tests/node/workflow-lint-script.test.ts tests/node/cli-docs-truth.test.ts tests/node/cli-growth-status-coverage.test.ts
       pnpm exec vitest run tests/vitest/provider-auth-readiness.test.ts tests/vitest/growth-status.test.ts tests/vitest/operator-layout.test.ts tests/vitest/operator-layout-cleanup.test.ts tests/vitest/runtime-context.test.ts tests/vitest/upgrade-state-machine.test.ts

6. Run the full merge gate:

       pnpm verify:all

7. Push the branch, open the PR, manually dispatch `service-smoke.yml` and `lifecycle-e2e-smoke.yml`, and monitor GitHub until everything is green.

## Validation and Acceptance

Acceptance is met when all of the following are true:

1. The workflow files use the current approved action majors and `scripts/dev/lint-workflows.mjs` fails on older tracked majors.
2. `tests/node/workflow-lint-script.test.ts` covers both passing and failing workflow-policy cases.
3. Node coverage excludes test files from its totals.
4. Vitest coverage includes the newly selected operator-relevant source files and still clears the repo thresholds.
5. The new and extended Vitest suites cover the requested branch cases in provider-auth-readiness, growth-status, operator-layout, runtime-context, and upgrade rendering.
6. `README.md`, `AGENTS.md`, `docs/README.md`, `docs/testing/test-matrix.md`, and `CHANGELOG.md` describe the same workflow and coverage truth as the tracked code.
7. `tests/node/cli-docs-truth.test.ts` enforces the documented coverage-scope wording alongside the existing workflow and threshold truth checks.
8. `pnpm verify:all` passes locally.
9. The PR shows green `CI`, `CodeQL`, `macOS Live Launchd`, green manual runs for `service-smoke.yml` and `lifecycle-e2e-smoke.yml`, no open PR-head code-scanning alerts, and no unresolved actionable review findings.

## Idempotence and Recovery

These edits are safe to reapply on the same branch. If the new workflow-policy checks fail, update the tracked workflow file or the approved floor in the same branch rather than weakening the assertion. If the widened coverage scope fails thresholds, add focused tests for the newly included product files instead of lowering thresholds or removing files from scope without evidence. If a GitHub workflow fails after push, inspect the logs, make the smallest truth-restoring fix, rerun the relevant focused suites plus `pnpm verify:all`, push again, and rerun the affected workflow.

## Artifacts and Notes

Primary artifacts for this branch:

- `docs/execplans/ci-docs-coverage-hardening.md`
- `.github/workflows/ci.yml`
- `.github/workflows/macos-live-launchd.yml`
- `.github/workflows/service-smoke.yml`
- `.github/workflows/lifecycle-e2e-smoke.yml`
- `scripts/dev/lint-workflows.mjs`
- `tests/node/workflow-lint-script.test.ts`
- `tests/node/cli-docs-truth.test.ts`
- `tests/vitest/provider-auth-readiness.test.ts`
- `tests/vitest/growth-status.test.ts`
- `tests/vitest/operator-layout.test.ts`
- `tests/vitest/operator-layout-cleanup.test.ts`
- `tests/vitest/runtime-context.test.ts`
- `tests/vitest/upgrade-state-machine.test.ts`

## Interfaces and Dependencies

Workflow truth sources:

- `.github/workflows/ci.yml`
- `.github/workflows/codeql.yml`
- `.github/workflows/macos-live-launchd.yml`
- `.github/workflows/service-smoke.yml`
- `.github/workflows/lifecycle-e2e-smoke.yml`

Coverage truth sources:

- root `package.json`
- `vitest.config.ts`

CLI docs truth sources:

- `apps/openassist-cli/src/index.ts`
- `apps/openassist-cli/src/commands/setup.ts`
- `apps/openassist-cli/src/commands/service.ts`
- `apps/openassist-cli/src/commands/upgrade.ts`

Revision note (2026-03-22 13:36Z): Created this ExecPlan after branch creation and the initial audit of workflows, docs truth, coverage configuration, and targeted low-confidence test surfaces.
