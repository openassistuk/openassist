# Lifecycle Readiness and Guided Repair Pass

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document must be maintained in accordance with `.agents/PLANS.md`.

## Purpose / Big Picture

After this change, OpenAssist should explain install, setup, service state, doctor output, and upgrade readiness in one consistent lifecycle language. A beginner should no longer have to compare bootstrap output, quickstart summaries, doctor checks, and upgrade dry-runs manually to decide what is ready, what is blocked, and which command to run next.

The proof should be visible in five places: `bootstrap.sh` ends with one compact readiness summary, `setup quickstart` adds a required review step and clearer repair paths, `setup wizard` uses the same lifecycle section language, `openassist doctor` prints grouped readiness output and supports `--json`, and `openassist upgrade --dry-run` classifies whether it is safe to continue, needs a fix first, or should hand the operator back to bootstrap.

## Progress

- [x] (2026-03-07 23:44Z) Re-audited the current bootstrap, quickstart, wizard, doctor, upgrade, tests, and lifecycle docs after the earlier crash/restart.
- [x] (2026-03-07 23:50Z) Created this ExecPlan so the follow-up implementation can proceed from a single self-contained plan.
- [x] (2026-03-08 00:28Z) Shared lifecycle readiness module and grouped report shape are implemented and wired into `doctor`, quickstart/wizard flows, upgrade dry-run, and bootstrap summary.
- [x] (2026-03-08 00:35Z) Lifecycle docs and changelog were updated to match the grouped readiness wording, quickstart review step, guided repair buckets, and `doctor --json`.
- [x] (2026-03-08 00:41Z) Targeted lifecycle tests and the full `pnpm verify:all` gate passed.

## Surprises & Discoveries

- Observation: PR `#3` improved lifecycle wording, but the current code still computes install/setup/upgrade readiness in four separate places.
  Evidence: `scripts/install/bootstrap.sh`, `apps/openassist-cli/src/lib/setup-summary.ts`, `apps/openassist-cli/src/index.ts` (`doctor`), and `apps/openassist-cli/src/commands/upgrade.ts` each still render their own lifecycle conclusions independently.

- Observation: quickstart already resumes from existing config and env files, so this pass does not need a separate “resume quickstart” feature to improve lifecycle repair.
  Evidence: `loadSetupQuickstartState()` in `apps/openassist-cli/src/lib/setup-quickstart.ts` loads existing config/env state through `loadWizardState(...)`.

- Observation: the current quickstart validation menu is already the natural insertion point for guided repair buckets, but the summary and failure wording still expose flat issue lists instead of grouped lifecycle help.
  Evidence: `runValidationGate()` in `apps/openassist-cli/src/lib/setup-quickstart.ts` already loops through re-entry choices, while `renderValidationIssues()` in `apps/openassist-cli/src/lib/setup-validation.ts` still produces flat message strings.

- Observation: the shared recommended-next-command logic needed explicit precedence for broken upgrade installs. Without that, a missing repo checkout plus missing config could still recommend quickstart even when the right repair was rerunning bootstrap.
  Evidence: during test isolation, `openassist upgrade --dry-run --install-dir <missing-dir>` reported `rerun bootstrap instead` in its readiness section but still surfaced quickstart as the recommended command until `buildLifecycleReport()` was reordered.

## Decision Log

- Decision: introduce one shared lifecycle report builder in the CLI layer instead of trying to keep bootstrap, quickstart, doctor, and upgrade summaries manually synchronized.
  Rationale: The user asked for one coherent lifecycle language. A shared report shape is the lowest-drift way to achieve that without adding new commands beyond `doctor --json`.
  Date/Author: 2026-03-07 / Codex

- Decision: keep bootstrap as the shell entrypoint, but let it render its final summary from the shared CLI lifecycle report after build/install-state persistence.
  Rationale: The shell script still owns install orchestration, but the readiness judgment should come from the same code path as `doctor` so the operator sees the same conclusions in both places.
  Date/Author: 2026-03-07 / Codex

- Decision: keep quickstart minimal, but add a required review-before-save checkpoint and grouped repair buckets instead of expanding quickstart back into a large advanced wizard.
  Rationale: The goal is a clearer beginner path, not a wider one. Review and repair are missing UX steps, while advanced editing still belongs in the wizard.
  Date/Author: 2026-03-07 / Codex

## Outcomes & Retrospective

Outcome: the lifecycle surfaces now read from one shared readiness model in `apps/openassist-cli/src/lib/lifecycle-readiness.ts`. `openassist doctor` prints grouped lifecycle sections and supports `--json`, bootstrap renders its final summary from doctor JSON with the fixed headings `Ready now`, `Needs action`, and `Next command`, quickstart now pauses at a required review-before-save step and groups repair guidance by operator task, and upgrade dry-run/live output now uses the same readiness language and clearer rollback summaries.

Docs and release notes were synchronized in the same change across `README.md`, `docs/README.md`, `docs/operations/quickstart-linux-macos.md`, `docs/operations/install-linux.md`, `docs/operations/install-macos.md`, `docs/operations/setup-wizard.md`, `docs/operations/upgrade-and-rollback.md`, `docs/operations/restart-recovery.md`, and `CHANGELOG.md`.

Verification evidence:

- Focused lifecycle node suites:

      pnpm exec tsx --test tests/node/cli-root-commands.test.ts tests/node/cli-setup-quickstart-runtime.test.ts tests/node/cli-setup-validation-coverage.test.ts tests/node/cli-setup-web-coverage.test.ts tests/node/bootstrap-interactive-contract.test.ts tests/node/install-bootstrap-idempotence.test.ts tests/node/cli-command-integration.test.ts tests/node/cli-command-branches.test.ts

  Result: passed on 2026-03-08.

- Focused lifecycle vitest suites:

      pnpm exec vitest run tests/vitest/lifecycle-readiness.test.ts tests/vitest/setup-quickstart-flow.test.ts tests/vitest/setup-quickstart-branches.test.ts tests/vitest/upgrade-state-machine.test.ts

  Result: passed on 2026-03-08.

- Full gate:

      pnpm verify:all

  Result: passed on 2026-03-08.

## Context and Orientation

The CLI entrypoint is `apps/openassist-cli/src/index.ts`. It currently defines `openassist doctor` directly in that file. The beginner onboarding flow lives in `apps/openassist-cli/src/lib/setup-quickstart.ts`, with the final quickstart output currently produced by `apps/openassist-cli/src/lib/setup-summary.ts`. The advanced editor lives in `apps/openassist-cli/src/lib/setup-wizard.ts`, and its post-save service/health loop lives in `apps/openassist-cli/src/lib/setup-post-save.ts`.

The upgrade command is registered from `apps/openassist-cli/src/commands/upgrade.ts`, and its current planning/rendering helpers live in `apps/openassist-cli/src/lib/upgrade.ts`. The install entrypoint is `scripts/install/bootstrap.sh`; it still owns prerequisite checks, clone/update/build flow, wrapper creation, quickstart handoff, and the final shell summary.

“Lifecycle readiness” in this plan means a bounded operator-facing report that answers the same questions everywhere: what is ready now, what still needs action before first reply, what still needs action before full access, what still needs action before upgrade, and what single command should run next. The report must be suitable for both text output and `doctor --json`.

## Plan of Work

First, add a new lifecycle report builder under `apps/openassist-cli/src/lib/` that accepts install facts, config facts, access-mode facts, service facts, validation issues, and upgrade facts, then returns one grouped report shape plus a recommended next command. Keep the types explicit and reusable from quickstart, doctor, bootstrap, and upgrade.

Second, update `apps/openassist-cli/src/index.ts` so `openassist doctor` builds that report, prints grouped text sections, and supports `--json` with the same grouped structure. The JSON output must not invent a different automation-only schema; it should be a serialized form of the same report the text output uses.

Third, refactor quickstart so it adds a required review step before save, shortens repeat guidance on re-entry, groups validation failures into repair buckets, and replaces the old config-dump summary with a lifecycle-oriented summary. Update wizard save/post-save wording so it uses the same lifecycle section language and repair phrasing where possible.

Fourth, update `apps/openassist-cli/src/commands/upgrade.ts`, `apps/openassist-cli/src/lib/upgrade.ts`, and `scripts/install/bootstrap.sh` so dry-run, rollback/failure messaging, and bootstrap’s final summary all consume the shared lifecycle conclusions instead of parallel ad hoc wording.

Fifth, refresh lifecycle docs and the changelog together, then update the relevant node/vitest suites and run the full local verification gate.

## Concrete Steps

From the repository root:

    pnpm exec vitest run tests/vitest/upgrade-state-machine.test.ts tests/vitest/setup-quickstart-flow.test.ts tests/vitest/setup-quickstart-validation.test.ts
    pnpm exec tsx --test tests/node/cli-root-commands.test.ts tests/node/bootstrap-interactive-contract.test.ts tests/node/install-bootstrap-idempotence.test.ts tests/node/cli-setup-quickstart-runtime.test.ts
    pnpm verify:all

As implementation progresses, this section must be updated with any additional focused commands used to verify the new lifecycle report shape or bootstrap rendering.

## Validation and Acceptance

Acceptance is behavioral:

1. `openassist doctor` prints grouped lifecycle sections in the order `Ready now`, `Needs action before first reply`, `Needs action before full access`, `Needs action before upgrade`, and `Recommended next command`.
2. `openassist doctor --json` returns the same grouped readiness report shape that the text output uses.
3. Quickstart pauses at a required review step with the exact actions `Save`, `Edit runtime`, `Edit assistant identity`, `Edit provider`, `Edit channel`, `Edit timezone`, and `Abort`.
4. Quickstart validation failures are grouped into guided repair buckets instead of a flat issue list, and the saved summary focuses on first reply destination, access mode, service state, first reply checklist, and advanced settings handoff.
5. `openassist upgrade --dry-run` clearly states whether it is safe to continue, needs a fix before updating, or should hand the operator back to bootstrap, and rollback/failure summaries always state what was restored, whether service health was rechecked, and what to run next.
6. `bootstrap.sh` ends with the fixed sections `Ready now`, `Needs action`, and `Next command`, including clear PATH/wrapper guidance and installer-warning classification.
7. `pnpm verify:all` passes.

## Idempotence and Recovery

This work is additive and safe to retry. The shared lifecycle report builder does not mutate operator state by itself; it only reads facts and classifies readiness. If a specific surface fails mid-refactor, the safe recovery path is to restore that surface to compiling state, rerun its targeted tests, and keep the report builder authoritative rather than reintroducing local summary logic.

Bootstrap remains rerunnable with the existing dirty-worktree and prerequisite protections. Quickstart and wizard must retain their existing retry/skip/abort behavior where already supported, and upgrade rollback behavior must stay explicit and observable.

## Artifacts and Notes

Important evidence to capture later in this document:

- sample `openassist doctor` grouped text output
- sample `openassist doctor --json` output shape
- sample bootstrap final summary with `Ready now`, `Needs action`, and `Next command`
- sample `openassist upgrade --dry-run` classification output
- final `pnpm verify:all` result

## Interfaces and Dependencies

The main new interface in this plan is a shared lifecycle report module under `apps/openassist-cli/src/lib/`, ending with explicit types for grouped readiness sections, readiness states, repair buckets, and recommended next commands. `apps/openassist-cli/src/index.ts` must expose `openassist doctor --json` on top of that shared report. No command renames or packaging changes are allowed.

Revision (2026-03-07 23:50Z): Initial ExecPlan created after the post-crash re-audit so the implementation can continue from one self-contained lifecycle/readiness plan.
