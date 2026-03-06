# Lifecycle UX Overhaul for Install, Setup, and Update

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

Maintain this document in accordance with `.agents/PLANS.md`.

## Purpose / Big Picture

After this change, a public OpenAssist operator should be able to understand one clear lifecycle: install OpenAssist, run a minimal quickstart that gets to a real first reply, use the wizard for advanced changes, and upgrade safely with a dry run that explains what will happen. The proof is visible through improved bootstrap/doctor/upgrade output, a shorter quickstart, updated operator docs, and lifecycle tests that cover the new summaries and state handling.

## Progress

- [x] (2026-03-06 14:29Z) Audited current install, setup, upgrade commands, bootstrap behavior, operator docs, and lifecycle tests.
- [x] (2026-03-06 14:51Z) Implemented shared install-state preservation across bootstrap, service install, doctor, and upgrade output.
- [x] (2026-03-06 14:56Z) Refocused `setup quickstart` on minimal first-reply onboarding and moved advanced section framing responsibility to `setup wizard`.
- [x] (2026-03-06 15:09Z) Rewrote lifecycle docs and changelog around one canonical operator journey.
- [x] (2026-03-06 15:18Z) Expanded lifecycle-focused Vitest and Node coverage for bootstrap summaries, install-state preservation, quickstart minimal-first-reply flows, operator-facing validation text, and upgrade plan rendering.
- [x] (2026-03-06 15:23Z) Ran `pnpm test:coverage:vitest` successfully after adding lifecycle coverage; global Vitest coverage finished at 83.66% lines/statements, 77.23% branches, and 92.33% functions.
- [x] (2026-03-06 15:25Z) Ran `pnpm verify:all` successfully after the final quickstart OAuth guidance wording cleanup.
- [x] (2026-03-06 18:05Z) Replaced quickstart timezone retype confirmation with a simple confirm prompt, and updated quickstart docs plus Vitest/Node scripted prompt fixtures to match.
- [x] (2026-03-06 18:19Z) Hardened the Vitest coverage entrypoint to pre-create `coverage/vitest/.tmp` on Windows, then reran `pnpm test:coverage:vitest` and `pnpm verify:all` successfully.

## Surprises & Discoveries

- Observation: The repo already has strong lifecycle primitives and tests, but many tests currently assert script/help text and broad flow coverage rather than operator-facing readiness summaries.
  Evidence: `tests/node/install-bootstrap-idempotence.test.ts`, `tests/node/bootstrap-interactive-contract.test.ts`, and `tests/node/cli-upgrade-rollback.test.ts` mostly pin command strings and dry-run planning rather than full lifecycle summaries.

- Observation: `setup quickstart` currently owns far more surface area than a first-run operator flow should expose.
  Evidence: `apps/openassist-cli/src/lib/setup-quickstart.ts` currently covers runtime base settings, assistant profile, multiple providers, multiple channels, time and scheduler tuning, optional first scheduler task, native web configuration, validation, and service health.

- Observation: The highest-risk regressions were not implementation defects but stale test fixtures that encoded the old wide quickstart prompt tree and older bootstrap summary text.
  Evidence: `tests/vitest/setup-quickstart-flow.test.ts`, `tests/vitest/setup-quickstart-branches.test.ts`, `tests/node/cli-setup-quickstart-runtime.test.ts`, `tests/node/cli-setup-quickstart-oauth.test.ts`, and the bootstrap contract tests all failed after the lifecycle changes until their scripted prompt sequences and summary assertions were rewritten.

- Observation: `openassist upgrade` already had the right rollback structure, so the biggest UX gain came from printing the resolved plan before mutation rather than changing the rollback mechanics themselves.
  Evidence: `apps/openassist-cli/src/commands/upgrade.ts` already handled fetch/build/restart/rollback sequencing; the change concentrated on pre-mutation summary rendering and operator next-step text.

- Observation: `validateSetupReadiness()` now short-circuits on schema parse failures, which made several older branch-level test expectations invalid and pushed the useful coverage work toward schema-valid operator flows instead.
  Evidence: `apps/openassist-cli/src/lib/setup-validation.ts` returns immediately on `parseConfig(...)` failure, and the refreshed `tests/vitest/setup-quickstart-validation.test.ts` had to be rewritten around `config.schema_invalid` versus reachable readiness warnings/errors.

- Observation: a few lifecycle tests were only stable in isolation because they implicitly reused the default quickstart bind port `3344`; the full suite exposed those collisions immediately.
  Evidence: `tests/vitest/setup-quickstart-flow.test.ts` needed a dedicated free-port allocation for the anthropic/WhatsApp quickstart case before `pnpm test:coverage:vitest` would pass consistently.

- Observation: the Windows Vitest coverage run can fail with `ENOENT` when the provider attempts to write raw JSON files under `coverage/vitest/.tmp` before that directory exists.
  Evidence: `pnpm verify:all` failed on 2026-03-06 with `ENOENT: no such file or directory, open 'C:\Users\dange\Coding\openassist\coverage\vitest\.tmp\coverage-33.json'`, and succeeded immediately after pre-creating that temp directory in `scripts/dev/ensure-vitest-coverage-dir.mjs`.

## Decision Log

- Decision: Keep the current Git-backed install/update model and existing command names in this PR.
  Rationale: The goal is lifecycle UX clarity and operator confidence, not a packaging model migration.
  Date/Author: 2026-03-06 / Codex

- Decision: Redefine `setup quickstart` around the outcome “first real reply” rather than “configure every runtime subsystem”.
  Rationale: The current quickstart is technically thorough but operator-hostile for a public first-run path.
  Date/Author: 2026-03-06 / Codex

- Decision: Preserve advanced native web and OAuth account-linking support, but move them out of first-run quickstart capture and into wizard or post-health follow-up paths.
  Rationale: Quickstart should optimize for first success, while advanced provider and tool configuration should remain available without blocking onboarding.
  Date/Author: 2026-03-06 / Codex

- Decision: Keep lifecycle contract tests focused on operator-visible text, but update them to assert the new plan/summary phrasing rather than legacy wrapper/path dump strings.
  Rationale: The lifecycle UX changes are intentionally operator-facing, so contract coverage should pin the new user-visible surfaces instead of internal implementation details.
  Date/Author: 2026-03-06 / Codex

- Decision: Make the quickstart OAuth hint explicitly conditional on configuring OAuth later in the wizard.
  Rationale: Quickstart remains API-key-first; the terminal hint should not imply that account-linking is ready before OAuth client configuration exists.
  Date/Author: 2026-03-06 / Codex

- Decision: Keep guided timezone selection, but change the quickstart confirmation step from exact retyping to a simple yes/no confirmation that shows the selected zone.
  Rationale: Re-entering the full timezone string added friction and false-negative UX without adding meaningful safety once the guided country/region -> city picker has already produced the concrete IANA timezone value.
  Date/Author: 2026-03-06 / Codex

- Decision: Pre-create `coverage/vitest/.tmp` before Vitest coverage runs.
  Rationale: The lifecycle work was already green, but `pnpm verify:all` was still brittle on Windows because Vitest's raw coverage temp directory was not reliably present at write time.
  Date/Author: 2026-03-06 / Codex

## Outcomes & Retrospective

Lifecycle UX overhaul completed and verified.

Concrete evidence:

- `pnpm test:coverage:vitest` passed on 2026-03-06 with global Vitest coverage at 83.66% lines/statements, 77.23% branches, and 92.33% functions.
- `pnpm verify:all` passed on 2026-03-06 after the final quickstart OAuth wording cleanup, and passed again on 2026-03-06 after the timezone-confirmation follow-up and Windows Vitest coverage-dir hardening.
- Operator-facing lifecycle output is now pinned by refreshed tests in `tests/node/bootstrap-interactive-contract.test.ts`, `tests/node/install-bootstrap-idempotence.test.ts`, `tests/node/cli-root-commands.test.ts`, `tests/node/cli-command-branches.test.ts`, `tests/node/cli-setup-quickstart-runtime.test.ts`, `tests/node/cli-setup-quickstart-oauth.test.ts`, `tests/vitest/setup-quickstart-flow.test.ts`, `tests/vitest/setup-quickstart-branches.test.ts`, `tests/vitest/setup-quickstart-validation.test.ts`, `tests/vitest/install-state.test.ts`, and `tests/vitest/upgrade-state-machine.test.ts`.

Retrospective:

- The highest-value changes were not architectural; they were operator-language and flow-boundary changes that reduced ambiguity at install time, first-run setup time, and upgrade time without destabilizing the existing Git-backed lifecycle model.
- The most expensive part of the work was synchronizing old lifecycle test fixtures with the new UX contract. That investment was worthwhile because the refreshed tests now describe the public operator journey instead of legacy incidental output.
- The docs rewrite and the final quickstart OAuth wording adjustment closed the remaining mismatch between “API-key-first quickstart” and “wizard owns advanced OAuth configuration,” leaving the public lifecycle narrative internally consistent.

## Context and Orientation

The install entrypoint is `install.sh`, which downloads and executes `scripts/install/bootstrap.sh`. The bootstrap script currently handles prerequisite recovery, clone/update logic, build, wrapper creation, optional quickstart handoff, service install, and direct install-state JSON writing. The CLI lifecycle surfaces live in `apps/openassist-cli/src/index.ts`, with setup commands in `apps/openassist-cli/src/commands/setup.ts`, service commands in `apps/openassist-cli/src/commands/service.ts`, and upgrade behavior in `apps/openassist-cli/src/commands/upgrade.ts`.

Install-state persistence currently lives in `apps/openassist-cli/src/lib/install-state.ts`. Runtime path and default lifecycle context helpers live in `apps/openassist-cli/src/lib/runtime-context.ts`. The strict onboarding flow is implemented in `apps/openassist-cli/src/lib/setup-quickstart.ts`, the advanced editor in `apps/openassist-cli/src/lib/setup-wizard.ts`, and the operator-facing save summary in `apps/openassist-cli/src/lib/setup-summary.ts`. Validation messaging for quickstart lives in `apps/openassist-cli/src/lib/setup-validation.ts`.

The operator docs that must stay in sync are the root `README.md`, `docs/README.md`, `docs/operations/quickstart-linux-macos.md`, `docs/operations/install-linux.md`, `docs/operations/install-macos.md`, `docs/operations/setup-wizard.md`, `docs/operations/upgrade-and-rollback.md`, `docs/operations/restart-recovery.md`, and `CHANGELOG.md`.

## Plan of Work

First, introduce shared install-state preservation helpers so CLI lifecycle commands can merge with existing install metadata instead of overwriting fields with empty strings. Use those helpers from service install, doctor, and upgrade, and align bootstrap output and final persisted state with the same model.

Second, simplify quickstart so it confirms or lightly edits safe runtime defaults, configures one primary provider and one primary channel, preserves timezone confirmation and service-health recovery behavior, and ends with a first-reply checklist. Keep advanced runtime/security/tool tuning and bulk editing in the wizard, and improve setup summaries and validation text so operators see outcome-first messaging.

Third, improve upgrade dry-run and live output so the operator sees the resolved target plan, restart/rollback behavior, and the next validation commands before and after mutation. Keep rollback semantics intact.

Fourth, rewrite the lifecycle docs to tell one installed-command-first story: install, quickstart to first reply, advanced reconfiguration with the wizard, and safe updates with `openassist upgrade`.

Fifth, expand lifecycle tests for install-state preservation, bootstrap summary text, doctor output, quickstart summaries, and upgrade dry-run/live summary rendering. Then run the project quality gate and capture the result here.

## Concrete Steps

From the repository root:

    pnpm test -- --runInBand tests/vitest/install-state.test.ts
    pnpm test -- --runInBand tests/node/cli-command-integration.test.ts
    pnpm verify:all

During implementation, also run targeted Vitest and Node test files for setup, bootstrap, and upgrade behavior after each subsystem change.

## Validation and Acceptance

Acceptance requires all of the following:

1. `openassist doctor` prints operator-facing lifecycle readiness, including install-state presence, tracked ref, config/env paths, and next-step guidance.
2. `openassist upgrade --dry-run` prints the resolved update plan before mutation, including target ref behavior and rollback target.
3. `setup quickstart` can complete with one provider and one channel, preserve strict validation and service recovery behavior, and end with a first-reply-oriented summary.
4. `setup wizard` remains the advanced editor and its labels/summaries clearly distinguish advanced configuration from quickstart essentials.
5. Docs consistently describe one canonical operator lifecycle without contradictory flow guidance.
6. `pnpm verify:all` passes.

## Idempotence and Recovery

Bootstrap and upgrade must remain safe to rerun with the existing dirty-worktree protections intact. Install-state persistence must merge and preserve authoritative fields instead of dropping them. Quickstart and wizard must keep their existing retry/skip/abort recovery semantics where already supported, and rollback behavior in `openassist upgrade` must remain explicit and observable.

## Artifacts and Notes

Important evidence to capture before completion:

    - `openassist doctor` sample output showing lifecycle readiness fields.
    - `openassist upgrade --dry-run` sample output showing the resolved plan.
    - `pnpm verify:all` success summary.

## Interfaces and Dependencies

The implementation will keep existing public commands and flags stable. New helper behavior should be added behind the current interfaces rather than inventing a second lifecycle API surface. `apps/openassist-cli/src/lib/install-state.ts` should end this work with explicit helpers for loading normalized state, merging partial updates with existing persisted state, and saving the merged result. `apps/openassist-cli/src/lib/upgrade.ts` should end this work with richer plan data that the command can print directly.

Revision (2026-03-06 14:29Z): Created the initial ExecPlan after auditing lifecycle behavior, docs, and tests so implementation can proceed with a single self-contained plan.

Revision (2026-03-06 15:09Z): Updated progress and decision log after implementing install-state preservation, minimal quickstart, wizard relabeling, richer doctor/upgrade summaries, rewritten lifecycle docs, and refreshed lifecycle-focused Vitest/Node suites.

Revision (2026-03-06 15:25Z): Recorded the final lifecycle coverage expansion, schema-validation testing discoveries, conditional OAuth quickstart wording cleanup, and successful `pnpm verify:all` evidence.

Revision (2026-03-06 18:19Z): Recorded the quickstart timezone-confirmation follow-up, the Windows Vitest coverage-dir hardening, and the second successful `pnpm verify:all` run so the plan stays accurate after the post-implementation cleanup.
