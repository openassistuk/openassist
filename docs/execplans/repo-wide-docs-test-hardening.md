# Repo-Wide Docs and Test Hardening Pass

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document must be maintained in accordance with `.agents/PLANS.md`.

## Purpose / Big Picture

After this change, the public GitHub landing page, the contributor discipline document, the lifecycle runbooks, the testing docs, and the supporting CI/test gates should all tell the same story. A beginner operator should be able to install from GitHub, run `openassist setup`, repair problems with `openassist doctor`, and plan an update with `openassist upgrade --dry-run` without running into stale docs or hand-maintained testing claims that no longer match the repo.

The proof should be visible in four places. First, root `README.md` and root `AGENTS.md` should be fully current and link to one central troubleshooting runbook. Second, `docs/testing/test-matrix.md` should exactly match the on-disk test suites and workflow behavior. Third, a new docs-truth test should fail when lifecycle docs drift from CLI or workflow reality. Fourth, a stronger supplemental lifecycle smoke workflow should exercise the real bootstrap and home-state path model without becoming a required PR gate.

## Progress

- [x] (2026-03-08 14:12Z) Re-read root `README.md`, root `AGENTS.md`, `docs/README.md`, lifecycle runbooks, `docs/testing/test-matrix.md`, `.github/workflows/ci.yml`, `.github/workflows/service-smoke.yml`, and the current CLI command registry to re-establish the real operator story before editing anything.
- [x] (2026-03-08 14:18Z) Confirmed the largest current drift: `docs/testing/test-matrix.md` no longer matches the actual `tests/node` and `tests/vitest` inventories, and the repo has no central troubleshooting runbook despite multiple lifecycle docs sending operators to different ad-hoc recovery snippets.
- [x] (2026-03-08 15:06Z) Completed the root truth-source rewrite across `README.md`, `AGENTS.md`, `docs/README.md`, the main lifecycle runbooks, `docs/testing/test-matrix.md`, and the new central troubleshooting runbook `docs/operations/common-troubleshooting.md`.
- [x] (2026-03-08 15:14Z) Added repo-wide docs-truth validation in `tests/node/cli-docs-truth.test.ts`, broader lifecycle black-box coverage in `tests/node/cli-lifecycle-home-state-blackbox.test.ts`, plus supporting hub and migration coverage updates in `tests/node/cli-setup-hub-coverage.test.ts` and `tests/vitest/setup-hub.test.ts`.
- [x] (2026-03-08 15:21Z) Added and linted the supplemental lifecycle smoke workflow in `.github/workflows/lifecycle-e2e-smoke.yml`, then documented it in the root docs and `docs/testing/test-matrix.md` as a manual or scheduled signal rather than a required PR gate.
- [x] (2026-03-08 16:12Z) Re-ran targeted docs/lifecycle suites and `pnpm verify:all` after the final workflow-schedule and migration-wording audit fixes; all local gates are green and the branch is ready to push for CI and review.
- [x] (2026-03-08 18:09Z) Fixed the final PR follow-up issues: legacy-layout cleanup now preserves tracked repo files when Git cannot restore them, Unix black-box fixtures now write owner-only SQLite files, `docs/testing/test-matrix.md` includes the new cleanup-safety suite, and the full local gate is green again.

## Surprises & Discoveries

- Observation: the current docs already describe the home-state layout and lifecycle hub well, but the testing doc is lagging badly behind the actual suite inventory.
  Evidence: `docs/testing/test-matrix.md` is missing current suites such as `tests/node/policy-engine.test.ts`, `tests/node/runtime-access-mode.test.ts`, `tests/node/runtime-attachments.test.ts`, `tests/vitest/channel-adapter-send.test.ts`, `tests/vitest/install-context.test.ts`, and `tests/vitest/runtime-attachments-rendering.test.ts`.

- Observation: bare `openassist setup` still prints default non-TTY fallback commands even when the operator supplied explicit `--install-dir`, `--config`, or `--env-file` values.
  Evidence: `apps/openassist-cli/src/lib/setup-hub.ts` currently renders non-TTY guidance with `defaultInstallDir()`, `defaultConfigPath()`, and `defaultEnvFilePath()` instead of the resolved `rawOptions`.

- Observation: the first pass of the new docs-truth test still had a blind spot because the lifecycle smoke cadence was hard-coded in the assertions instead of being derived from `.github/workflows/lifecycle-e2e-smoke.yml`.
  Evidence: root `README.md` and `docs/README.md` initially claimed `Tue/Fri 06:30 UTC` while `.github/workflows/lifecycle-e2e-smoke.yml` was actually scheduled for `Tue/Sat 07:00 UTC`, and the original `tests/node/cli-docs-truth.test.ts` assertions would not have caught that drift.

- Observation: legacy-layout migration wording was broader in the docs than it is in the implementation.
  Evidence: `apps/openassist-cli/src/commands/setup.ts` and `apps/openassist-cli/src/lib/setup-hub.ts` run `autoMigrateLegacyDefaultLayoutIfNeeded(...)`, but `doctor` and `upgrade --dry-run` only detect the legacy layout and route operators back to setup instead of migrating it in place.

- Observation: the first GitHub CI rerun exposed two cross-platform issues that local Windows-heavy verification did not catch: the new black-box fixtures were creating insecure `0644` SQLite files, and the cleanup helper was too willing to delete tracked repo files when Git was unavailable.
  Evidence: PR `#16` Ubuntu/macOS logs failed with `Insecure permissions on file ... openassist.db: 0o644` in `packages/storage-sqlite/src/index.ts`, and Copilot flagged `apps/openassist-cli/src/lib/operator-layout.ts` for treating any `git checkout` failure as safe-to-delete.

## Decision Log

- Decision: make root `README.md` and root `AGENTS.md` the first edited surfaces and treat them as mandatory deliverables, not collateral.
  Rationale: the user explicitly called these out as the public and contributor truth sources, and the rest of the repo should align to them rather than the other way around.
  Date/Author: 2026-03-08 / Codex

- Decision: add one dedicated troubleshooting runbook under `docs/operations/common-troubleshooting.md` and link it from the root docs plus the main lifecycle runbooks.
  Rationale: install/setup/upgrade issues are currently discoverable, but the guidance is fragmented and repeated. A central runbook lowers beginner confusion and creates one required doc surface that tests and release discipline can point to.
  Date/Author: 2026-03-08 / Codex

- Decision: implement docs-truth validation as a normal Node integration test under `tests/node/` instead of a one-off script.
  Rationale: the repo already treats `pnpm verify:all` as the merge gate. Putting docs-truth in the normal test gate makes drift fail in the same place as code regressions.
  Date/Author: 2026-03-08 / Codex

## Outcomes & Retrospective

The branch now enforces repo-wide docs truth instead of relying on manual sync. Root `README.md` and `AGENTS.md` were rewritten first, then the lifecycle runbooks, testing docs, and `CHANGELOG.md` were brought into line behind them. The new `docs/operations/common-troubleshooting.md` gives beginner and intermediate operators one repair runbook instead of scattering recovery snippets across install, quickstart, setup, and upgrade pages.

The implementation also adds concrete enforcement, not just prose. `tests/node/cli-docs-truth.test.ts` now validates documented command examples, root-doc links, workflow statements, and the exact `tests/node` plus `tests/vitest` inventories. `tests/node/cli-lifecycle-home-state-blackbox.test.ts` now proves home-state installs stay upgrade-clean, recognized legacy repo-local layouts migrate safely, conflicting migrations stop cleanly, and non-TTY `openassist setup` guidance preserves explicit custom paths. `.github/workflows/lifecycle-e2e-smoke.yml` adds a stronger bootstrap/home-state smoke path on Linux and macOS without turning it into a required PR gate. The final follow-up also hardened the legacy cleanup path itself: `apps/openassist-cli/src/lib/operator-layout.ts` now preserves tracked repo files when Git cannot restore them, and the Unix migration fixtures now write owner-only SQLite files so the black-box lifecycle coverage matches the real daemon security posture.

Final evidence recorded for this plan:

- `pnpm exec tsx --test tests/node/cli-docs-truth.test.ts tests/node/cli-lifecycle-home-state-blackbox.test.ts tests/node/cli-setup-hub-coverage.test.ts` passed on 2026-03-08.
- `pnpm exec vitest run tests/vitest/operator-paths.test.ts tests/vitest/operator-layout.test.ts tests/vitest/operator-layout-cleanup.test.ts tests/vitest/lifecycle-readiness.test.ts tests/vitest/setup-hub.test.ts` passed on 2026-03-08.
- `pnpm verify:all` passed on 2026-03-08 after the workflow-schedule, migration-wording, cleanup-safety, and Unix fixture-permissions corrections.

## Context and Orientation

The public operator story starts in `README.md`, then expands in `docs/README.md`, then narrows into the lifecycle runbooks under `docs/operations/`. The contributor and release discipline story lives in `AGENTS.md`. The CLI command registry is split between `apps/openassist-cli/src/index.ts` and dedicated command modules such as `apps/openassist-cli/src/commands/setup.ts`, `apps/openassist-cli/src/commands/service.ts`, and `apps/openassist-cli/src/commands/upgrade.ts`.

The current lifecycle model already uses home-state defaults outside the repo checkout and a shared readiness report shape. That behavior is implemented. The main missing work is truth enforcement: the docs must describe it consistently, the test matrix must stop drifting from the actual suite inventory, and CI should include a stronger supplemental lifecycle smoke that exercises the real bootstrap/home-state path without adding a heavy required PR gate.

For this plan, “docs truth” means that statements about commands, workflows, test inventories, and default lifecycle paths are checked against the real repo. “Supplemental smoke” means a manual or scheduled GitHub Actions workflow that gives extra confidence, but is not required for every PR.

## Plan of Work

Start by rewriting the two root truth sources, `README.md` and `AGENTS.md`, then carry the same wording and linking structure into `docs/README.md`, the lifecycle runbooks, and `docs/testing/`. Add `docs/operations/common-troubleshooting.md` and make the main operator docs point to it whenever they currently embed one-off recovery snippets.

Next, add a Node integration test that reads the root docs and key lifecycle/testing docs, extracts documented `openassist` command examples, verifies that those command prefixes exist in the actual CLI surface, verifies the linked doc paths exist, verifies the workflow claims match `.github/workflows/ci.yml`, `.github/workflows/service-smoke.yml`, and the new supplemental lifecycle smoke workflow, and verifies that `docs/testing/test-matrix.md` lists the exact current `tests/node/*.test.ts` and `tests/vitest/*.test.ts` inventories.

Then strengthen lifecycle acceptance by fixing the setup-hub non-TTY custom-path guidance bug and adding black-box tests around non-TTY `openassist setup`, home-state upgrade cleanliness, and migration/update consistency. Add the new supplemental workflow under `.github/workflows/` so it performs a real non-interactive bootstrap into a temporary install directory, verifies the home-state install record and wrapper behavior, verifies `openassist doctor` and `openassist upgrade --dry-run`, and verifies the repo checkout stays clean from normal operator state.

Finally, run the full gate, update this plan with evidence, open the PR, and monitor CI/CodeQL/review findings until the branch is ready to merge.

## Concrete Steps

From the repository root:

1. Edit the root docs and governance files plus the linked lifecycle/testing runbooks.
2. Add the new troubleshooting runbook under `docs/operations/`.
3. Fix `apps/openassist-cli/src/lib/setup-hub.ts` so non-TTY scriptable guidance respects explicit custom paths.
4. Add the docs-truth integration test and the broader lifecycle black-box tests under `tests/node/` and any supporting Vitest assertions under `tests/vitest/`.
5. Add the supplemental lifecycle smoke workflow under `.github/workflows/`.
6. Run:

       pnpm exec tsx --test tests/node/cli-docs-truth.test.ts tests/node/cli-lifecycle-home-state-blackbox.test.ts tests/node/cli-setup-hub-coverage.test.ts
       pnpm exec vitest run tests/vitest/setup-hub.test.ts tests/vitest/setup-hub-actions.test.ts tests/vitest/operator-layout.test.ts
       pnpm verify:all

Expected proof points:

- the docs-truth test passes and would fail if a documented command/workflow/test inventory drifts
- the black-box lifecycle test proves home-state installs do not create false repo dirtiness and that non-TTY setup guidance reflects custom paths
- the root docs and lifecycle docs all point to the same troubleshooting runbook

## Validation and Acceptance

Acceptance is met when all of the following are true:

1. `README.md` presents the current GitHub operator story accurately and links to the troubleshooting runbook.
2. `AGENTS.md` explicitly requires root-doc updates, docs-truth validation, and the troubleshooting doc in lifecycle changes.
3. `docs/testing/test-matrix.md` exactly matches the current test file inventories and workflow semantics.
4. `tests/node/cli-docs-truth.test.ts` passes and fails if the root docs/test matrix/workflow statements drift.
5. `tests/node/cli-lifecycle-home-state-blackbox.test.ts` proves the lifecycle surfaces remain coherent for home-state installs and non-TTY setup guidance.
6. `.github/workflows/lifecycle-e2e-smoke.yml` exists, is lint-clean, and is clearly documented as supplemental manual/scheduled smoke rather than a required PR gate.
7. `pnpm verify:all` passes locally.

## Idempotence and Recovery

The docs edits are safe to repeat. The docs-truth test should be rerunnable and deterministic because it reads committed files only. The supplemental smoke workflow must use temporary directories for `HOME` and install paths so it does not mutate the checked-out workspace permanently. If the new smoke workflow or tests reveal a mismatch, fix the docs or the contained lifecycle bug in the same branch instead of weakening the checks.

## Artifacts and Notes

Planned proof artifacts:

- `tests/node/cli-docs-truth.test.ts`
- `tests/node/cli-lifecycle-home-state-blackbox.test.ts`
- `.github/workflows/lifecycle-e2e-smoke.yml`
- `docs/operations/common-troubleshooting.md`

## Interfaces and Dependencies

The CLI command truth source remains the existing registry files:

- `apps/openassist-cli/src/index.ts`
- `apps/openassist-cli/src/commands/setup.ts`
- `apps/openassist-cli/src/commands/service.ts`
- `apps/openassist-cli/src/commands/upgrade.ts`

The workflow truth sources remain:

- `.github/workflows/ci.yml`
- `.github/workflows/service-smoke.yml`
- `.github/workflows/lifecycle-e2e-smoke.yml` (new in this plan)

The new docs-truth test should use the Node test runner and plain file parsing rather than introducing a new documentation toolchain dependency.

Revision note (2026-03-08 14:18Z): Created the ExecPlan after re-auditing the current docs, workflows, and test inventories so the implementation can proceed from one self-contained plan instead of scattered findings.
