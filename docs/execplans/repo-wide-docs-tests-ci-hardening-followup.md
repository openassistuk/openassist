# Repo-Wide Docs, Tests, and CI Hardening Follow-Up

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document must be maintained in accordance with `.agents/PLANS.md`.

## Purpose / Big Picture

This branch tightens OpenAssist's repo-wide docs, tests, and GitHub workflow truth checks without changing coverage thresholds or shipping unrelated product behavior. After this work, the live docs index should cover every current non-ExecPlan doc, the docs-truth suite should validate the full live doc set instead of only the lifecycle subset, and GitHub workflow docs/tests should stay aligned with the real CI, CodeQL, and supplemental smoke workflows.

The visible proof should be that `pnpm verify:all` still passes locally, the widened docs-truth suite fails on stale doc/workflow drift that currently slips through, and the branch PR reaches a fully green GitHub state including manual supplemental smoke reruns if this branch touches those workflows.

## Progress

- [x] (2026-03-11 20:29Z) Created branch `hardening/repo-wide-docs-tests-ci-followup` from `main` and re-validated the current baseline with `pnpm verify:all`.
- [x] (2026-03-11 20:29Z) Re-audited the current live docs, test inventory, workflow files, and low-confidence coverage surfaces before editing.
- [x] (2026-03-11 21:23Z) Updated the live docs and release notes across `README.md`, `AGENTS.md`, `docs/README.md`, `docs/testing/test-matrix.md`, and `CHANGELOG.md`, and aligned `.github/workflows/lifecycle-e2e-smoke.yml` with lifecycle report `version: 3`.
- [x] (2026-03-11 21:23Z) Expanded `tests/node/cli-docs-truth.test.ts` to cover all live non-ExecPlan docs, relative links plus anchors, docs-index completeness, coverage-threshold truth, CodeQL workflow truth, and the lifecycle-smoke report-version guard.
- [x] (2026-03-11 21:23Z) Added focused lifecycle/operator-layout coverage in `tests/vitest/lifecycle-readiness.test.ts` and `tests/vitest/operator-layout.test.ts` for wrapper fallback, skipped-service onboarding, launchd/full-access truth, legacy-layout upgrade blockers, existing home-state config handling, and install-state-driven legacy detection.
- [x] (2026-03-11 21:23Z) Ran focused suites successfully, then reran the full local gate with `pnpm verify:all` and recorded the results below.
- [ ] Push the branch, open the PR, dispatch supplemental smoke workflows if touched, and monitor Actions/CodeQL/review until only human merge remains.

## Surprises & Discoveries

- Observation: `pnpm verify:all` is green on `main` as of 2026-03-11, so this branch is a truth-hardening pass rather than a baseline-fix pass.
  Evidence: local `pnpm verify:all` exited `0` before any branch edits.

- Observation: the current docs-truth suite still has a workflow blind spot because `.github/workflows/lifecycle-e2e-smoke.yml` asserts `doctor --json` report `version !== 2` while the implementation and existing tests now use `version: 3`.
  Evidence: `.github/workflows/lifecycle-e2e-smoke.yml` contains `report.version !== 2`, while `apps/openassist-cli/src/lib/lifecycle-readiness.ts` and `tests/vitest/lifecycle-readiness.test.ts` both pin `version: 3`.

- Observation: `docs/README.md` is not yet a complete index for live docs.
  Evidence: live files such as `docs/architecture/context-engine.md`, `docs/operations/config-rollout-and-rollback.md`, and `docs/migration/openclaw-import.md` are not linked from the current docs index.

- Observation: spawning the CLI recursively through `--help` made the widened docs-truth command-surface check unnecessarily slow and brittle because Commander's built-in `help [command]` path reintroduces recursion noise.
  Evidence: the first widened `tests/node/cli-docs-truth.test.ts` pass stalled until the command-surface check was rewritten to parse the tracked CLI registry files (`apps/openassist-cli/src/index.ts`, `apps/openassist-cli/src/commands/setup.ts`, `apps/openassist-cli/src/commands/service.ts`, and `apps/openassist-cli/src/commands/upgrade.ts`) directly.

- Observation: the focused local suites and the full merge gate are green after the docs/test/workflow hardening edits.
  Evidence: `pnpm exec tsx --test tests/node/cli-docs-truth.test.ts tests/node/cli-root-commands.test.ts tests/node/cli-command-branches.test.ts tests/node/cli-setup-hub-coverage.test.ts tests/node/cli-operator-layout-coverage.test.ts`, `pnpm exec vitest run tests/vitest/lifecycle-readiness.test.ts tests/vitest/operator-layout.test.ts tests/vitest/operator-layout-cleanup.test.ts tests/vitest/setup-hub.test.ts tests/vitest/setup-hub-actions.test.ts`, and `pnpm verify:all` all exited `0` on 2026-03-11.

## Decision Log

- Decision: keep historical `docs/execplans/*.md` files archival and untouched, and add a new active ExecPlan for this branch instead of rewriting older plans.
  Rationale: the user asked for live-doc hardening, not historical plan normalization, and the archival plans already serve as implementation history.
  Date/Author: 2026-03-11 / Codex

- Decision: keep coverage thresholds unchanged and recover confidence only through deterministic new tests plus small truth-restoring fixes.
  Rationale: the baseline is already green and AGENTS explicitly forbids lowering thresholds to get a green run.
  Date/Author: 2026-03-11 / Codex

- Decision: document CodeQL as an active repo workflow and validate it in docs-truth, while avoiding unverifiable branch-protection wording in repo-tracked docs.
  Rationale: this repo is currently public, CodeQL is active in GitHub, and workflow triggers/jobs are derivable from tracked files whereas branch-protection state is not.
  Date/Author: 2026-03-11 / Codex

- Decision: derive the docs-truth command surface from the tracked Commander registry files instead of recursively spawning `openassist --help`.
  Rationale: the source-registry approach is faster, deterministic, and matches the AGENTS docs-sync rule that command examples must be validated against the CLI registry files.
  Date/Author: 2026-03-11 / Codex

## Outcomes & Retrospective

The local implementation phase is complete and green. Live docs now describe CI, CodeQL, and the supplemental smoke workflows using tracked workflow truth; `docs/README.md` now indexes every live non-ExecPlan doc; the lifecycle E2E smoke workflow now checks the current `doctor --json` report `version: 3`; and the docs-truth suite now validates the full live-doc set plus link, anchor, index, threshold, workflow, and report-version drift. The main implementation lesson was that "truth hardening" needed both broader assertions and a faster source-of-truth strategy: parsing the CLI registry files directly made the command-surface validation practical enough to keep in the normal test gate.

## Context and Orientation

The current live doc set for this task is root `README.md`, root `AGENTS.md`, `CHANGELOG.md`, and all Markdown files under `docs/` except `docs/execplans/`. The current docs-truth suite lives in `tests/node/cli-docs-truth.test.ts` and validates only a lifecycle-heavy subset of those docs. The main workflow truth sources are `.github/workflows/ci.yml`, `.github/workflows/codeql.yml`, `.github/workflows/service-smoke.yml`, and `.github/workflows/lifecycle-e2e-smoke.yml`.

The current low-confidence implementation surfaces relevant to this pass are `apps/openassist-cli/src/lib/lifecycle-readiness.ts`, `apps/openassist-cli/src/lib/operator-layout.ts`, plus thin command entrypoints in `apps/openassist-cli/src/commands/setup.ts`, `apps/openassist-cli/src/commands/service.ts`, and `apps/openassist-cli/src/lib/setup-hub.ts`. Existing tests already cover most runtime behavior; this branch is mainly about catching truth drift earlier and filling a few reporting/branch gaps.

## Plan of Work

First, update the live docs together so the public/testing workflow story is internally consistent before widening enforcement. `docs/README.md` must become the complete live-doc index. Root docs and testing docs must describe CI, CodeQL, and the supplemental smoke workflows truthfully, without relying on untracked branch-protection wording. `CHANGELOG.md` must record the operator-facing impact of the stronger docs/test/workflow truth enforcement.

Next, widen `tests/node/cli-docs-truth.test.ts` from a hand-maintained lifecycle subset to the full live-doc set. The widened suite must validate: local markdown links and fragments, docs-index completeness, `openassist`/`openassistd` command examples across live docs, coverage-threshold wording against `vitest.config.ts` and `package.json`, workflow wording against the four workflow files, and the lifecycle E2E smoke doctor-report version against the real lifecycle-report version.

Then add a small number of focused tests in existing lifecycle/operator-layout/root-command suites to improve confidence in the branches this work touches, especially lifecycle-report rendering and legacy-layout/home-state behavior plus a couple of low-cost setup/service command paths.

Finally, run the focused suites, run `pnpm verify:all`, update this plan with evidence, push the branch, open the PR, and monitor Actions/CodeQL/review until everything is green. If either smoke workflow file changes, manually dispatch the supplemental smoke workflows on this branch and wait for completion.

## Concrete Steps

From the repository root:

1. Update `README.md`, `AGENTS.md`, `docs/README.md`, `docs/testing/test-matrix.md`, `CHANGELOG.md`, and any directly affected workflow file(s).
2. Expand `tests/node/cli-docs-truth.test.ts`.
3. Add focused tests in existing lifecycle/operator-layout/root-command suites.
4. Run focused validation:

       pnpm exec tsx --test tests/node/cli-docs-truth.test.ts tests/node/cli-root-commands.test.ts tests/node/cli-setup-hub-coverage.test.ts
       pnpm exec vitest run tests/vitest/lifecycle-readiness.test.ts tests/vitest/operator-layout.test.ts tests/vitest/operator-layout-cleanup.test.ts

5. Run the full gate:

       pnpm verify:all

6. Push the branch, open the PR, and monitor GitHub checks. If `.github/workflows/service-smoke.yml` or `.github/workflows/lifecycle-e2e-smoke.yml` changed, dispatch both supplemental workflows on the branch and wait for completion.

## Validation and Acceptance

Acceptance is met when all of the following are true:

1. `docs/README.md` links every live non-ExecPlan doc under `docs/`.
2. Root docs and testing docs describe CI, CodeQL, and supplemental smoke workflows using tracked workflow truth rather than branch-protection assumptions.
3. `tests/node/cli-docs-truth.test.ts` validates the full live-doc set, local links plus anchors, docs-index completeness, coverage-threshold truth, workflow truth, and the lifecycle-smoke doctor-report version guard.
4. The widened docs-truth suite passes locally and would fail on the workflow/doc drift identified at the start of this plan.
5. Focused lifecycle/operator-layout/root-command suites pass locally.
6. `pnpm verify:all` passes locally.
7. The PR reaches green GitHub checks, green CodeQL, green manual smoke reruns if applicable, and no actionable review or PR-head code-scanning findings remain.

## Idempotence and Recovery

The doc edits and tests in this plan are safe to reapply. If the widened docs-truth suite fails, fix the stale doc or the directly-related workflow/code mismatch in the same branch rather than weakening the check. If a manual smoke workflow fails after the branch is pushed, use the failure log to make the smallest truth-restoring fix, rerun the relevant local suites plus `pnpm verify:all`, push again, and re-dispatch the affected supplemental workflow.

## Artifacts and Notes

Primary artifacts for this branch:

- `docs/execplans/repo-wide-docs-tests-ci-hardening-followup.md`
- `tests/node/cli-docs-truth.test.ts`
- `tests/vitest/lifecycle-readiness.test.ts`
- `tests/vitest/operator-layout.test.ts`
- `README.md`
- `docs/README.md`
- `docs/testing/test-matrix.md`

## Interfaces and Dependencies

Workflow truth sources:

- `.github/workflows/ci.yml`
- `.github/workflows/codeql.yml`
- `.github/workflows/service-smoke.yml`
- `.github/workflows/lifecycle-e2e-smoke.yml`

Coverage-threshold truth sources:

- `vitest.config.ts`
- root `package.json` scripts `test:coverage:vitest` and `test:coverage:node`

CLI command truth sources:

- `apps/openassist-cli/src/index.ts`
- `apps/openassist-cli/src/commands/setup.ts`
- `apps/openassist-cli/src/commands/service.ts`
- `apps/openassist-cli/src/commands/upgrade.ts`

Revision note (2026-03-11 20:29Z): Created this ExecPlan after re-auditing the live docs, workflows, coverage reports, and local baseline so the implementation can proceed from one current branch-specific source of truth.
