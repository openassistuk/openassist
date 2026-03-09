# Provider Reasoning UX and Visibility Pass

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document must be maintained in accordance with `.agents/PLANS.md`.

## Purpose / Big Picture

After this change, operators can see and edit provider reasoning settings where they actually look during setup. OpenAI and Codex both expose a beginner-facing reasoning-effort choice during quickstart, wizard remains the full provider-tuning surface, and lifecycle output now shows the active provider route, model, and reasoning or thinking state. A human can prove the change by running `openassist setup quickstart`, `openassist setup wizard`, and `openassist doctor` and observing the provider-tuning details in each surface.

## Progress

- [x] (2026-03-08 22:05Z) Added `codex.reasoningEffort` to shared provider contracts and config schema.
- [x] (2026-03-08 22:18Z) Wired daemon runtime construction so saved OpenAI, Codex, and Anthropic tuning fields actually reach the live adapters.
- [x] (2026-03-08 22:41Z) Added shared provider-display helpers and surfaced provider route/model/tuning in quickstart, wizard summaries, and lifecycle report context.
- [x] (2026-03-08 22:57Z) Added quickstart and wizard prompts for Codex reasoning effort and updated validation warnings for unsupported Codex reasoning models.
- [x] (2026-03-08 23:14Z) Updated root docs, operator docs, sample config, and AGENTS so the repo truth matches the new operator story.
- [x] (2026-03-09 00:21Z) Ran `pnpm verify:all` successfully after fixing stale scripted-answer fixtures and docs-truth inventory drift for the new provider-display coverage.
- [ ] Commit the branch, open the PR, and monitor GitHub CI, CodeQL, and review until green.

## Surprises & Discoveries

- Observation: the earlier provider-reasoning work had saved config fields, but `openassistd` was not actually passing those tuning values into the live OpenAI, Codex, or Anthropic adapters.
  Evidence: `apps/openassistd/src/index.ts` previously constructed built-in adapters without `reasoningEffort` or `thinkingBudgetTokens`.

- Observation: the discoverability gap was larger than just quickstart. Lifecycle summaries and `openassist doctor` also lacked any provider route, model, or tuning visibility, which made operators reopen wizard to confirm the current state.
  Evidence: the earlier lifecycle report only surfaced provider ID, not route/model/tuning, in `apps/openassist-cli/src/lib/lifecycle-readiness.ts`.

- Observation: focused Codex adapter tests can fail with `reasoningPayload is not a function` if the shared provider package export is stale in build output.
  Evidence: targeted Vitest runs against `tests/vitest/provider-codex-auth.test.ts` failed before a fresh build-aware verification pass.

## Decision Log

- Decision: keep `openai-compatible` unchanged and provider-default only.
  Rationale: the existing reasoning controls are only safe on the built-in OpenAI and Codex Responses-model families plus Anthropic thinking-capable families. Extending the public control to OpenAI-compatible would risk unsupported parameter errors on arbitrary backends.
  Date/Author: 2026-03-08 / Codex

- Decision: expose reasoning effort in quickstart only for the two OpenAI routes and keep Anthropic thinking-budget editing in wizard.
  Rationale: quickstart needs to stay beginner-friendly. A simple `Default / Low / Medium / High` select is small enough for OpenAI and Codex, while Anthropic token-budget tuning is more advanced and better left to wizard.
  Date/Author: 2026-03-08 / Codex

- Decision: extend the existing lifecycle report context additively instead of creating a new provider-status command.
  Rationale: the repo already centralized lifecycle reporting across bootstrap, quickstart, wizard, and doctor. Adding provider route/model/tuning to that shared report keeps the operator story consistent and preserves backward compatibility for `doctor --json`.
  Date/Author: 2026-03-08 / Codex

## Outcomes & Retrospective

The implementation now passes the full local verification gate and delivers the intended operator behavior: OpenAI and Codex expose a beginner-facing reasoning-effort choice in quickstart, wizard surfaces active reasoning or thinking settings for all supported provider routes, and lifecycle output shows the current provider route, model, and tuning state instead of hiding it in provider-edit internals. The main lesson from the work was that the earlier discoverability gap was partly UX and partly runtime truth: daemon adapter wiring, lifecycle summaries, docs-truth inventory, and scripted answer fixtures all had to be corrected together for the feature to be real rather than only configurable on paper.

## Context and Orientation

OpenAssist has four first-class provider routes in operator-facing setup: `openai`, `codex`, `anthropic`, and `openai-compatible`. Provider config contracts live in `packages/core-types/src/provider.ts`, runtime config validation lives in `packages/config/src/schema.ts`, provider adapters live in `packages/providers-*`, the daemon constructs them in `apps/openassistd/src/index.ts`, and operator setup flows live in `apps/openassist-cli/src/lib/setup-quickstart.ts` and `apps/openassist-cli/src/lib/setup-wizard.ts`.

The repo already has one earlier reasoning-controls plan in `docs/execplans/provider-reasoning-controls.md`. This plan carries forward only the context that matters now: the earlier work added backend support and wizard controls for OpenAI and Anthropic, but left Codex without a public reasoning-effort knob and left lifecycle/status surfaces too thin to show what was actually active.

In this repository, “reasoning effort” means the OpenAI-style enum `low | medium | high` that is only safe on supported Responses-model families. “Thinking budget” means the Anthropic token budget for supported thinking-capable Claude models. “Lifecycle output” means the shared human-visible `Ready now / Needs action / Next command` rendering used by quickstart summaries, wizard summaries, and `openassist doctor`.

## Plan of Work

First, finish the provider contract and runtime truth path. `packages/core-types/src/provider.ts` and `packages/config/src/schema.ts` must accept `codex.reasoningEffort`. `packages/providers-openai-shared/src/index.ts` should remain the one shared place for model-family gating and reasoning payload generation so both OpenAI and Codex behave the same way. `packages/providers-codex/src/index.ts` must attach reasoning only when configured and supported. `apps/openassistd/src/index.ts` must pass `reasoningEffort` and `thinkingBudgetTokens` into the live adapters so setup changes actually affect runtime behavior.

Second, finish the operator UX path. `apps/openassist-cli/src/lib/setup-wizard.ts` must expose Codex reasoning effort alongside the existing OpenAI and Anthropic controls. `apps/openassist-cli/src/lib/setup-quickstart.ts` must ask for reasoning effort on the OpenAI and Codex routes only. `apps/openassist-cli/src/lib/provider-display.ts`, `apps/openassist-cli/src/lib/lifecycle-readiness.ts`, `apps/openassist-cli/src/lib/setup-summary.ts`, and `apps/openassist-cli/src/commands/setup.ts` must keep provider route/model/tuning visible in quickstart, wizard, and doctor output.

Third, synchronize documentation and tests. Root `README.md` and `AGENTS.md` are mandatory updated surfaces. `docs/README.md`, `docs/interfaces/provider-adapter.md`, `docs/operations/quickstart-linux-macos.md`, `docs/operations/setup-wizard.md`, `docs/operations/common-troubleshooting.md`, `openassist.toml`, and `CHANGELOG.md` must all tell the same story: quickstart now exposes OpenAI and Codex reasoning effort, wizard remains the full provider-tuning surface, Anthropic thinking is wizard-editable but lifecycle-visible, and doctor shows provider route/model/tuning. Tests must cover the new Codex contract, quickstart/wizard persistence, lifecycle visibility, and additive doctor JSON context.

## Concrete Steps

From the repository root `c:\Users\dange\Coding\openassist`:

1. Inspect the branch state and modified files.

   `git status --short`

2. Update the code paths named above.

3. Update the docs and this ExecPlan in the same change.

4. Run the full local verification gate:

   `pnpm verify:all`

   Expected outcome: the build completes, Node tests pass, Vitest passes, and docs-truth checks stay green.

5. If the full gate passes, commit the branch:

   `git add .`
   `git commit -m "feat: improve provider reasoning visibility"`

6. Push and open the PR:

   `git push -u origin feat/provider-reasoning-ux`

7. Monitor GitHub CI, CodeQL, and Copilot review. Fix any actionable findings on-branch before reporting ready.

## Validation and Acceptance

Acceptance is behavioral:

- Running `openassist setup quickstart` with an OpenAI provider shows a reasoning-effort select and saves the chosen value only when it is not `Default`.
- Running `openassist setup quickstart` with a Codex provider shows the same reasoning-effort select and saves the chosen value only when it is not `Default`.
- Running `openassist setup wizard` and editing providers shows OpenAI reasoning effort, Codex reasoning effort, and Anthropic thinking budget with the correct defaults and edit behavior.
- Running `openassist doctor` shows the current primary provider route, default model, and reasoning/thinking state under `Ready now`.
- Running `openassist doctor --json` still returns the same grouped lifecycle structure and also includes additive provider route/model/tuning context fields.
- The Codex adapter sends reasoning only when configured and supported; unsupported or unset cases omit the field safely.

The test gate must prove these behaviors. The new or updated tests should include:

- `tests/vitest/config-security-schema.test.ts`
- `tests/vitest/provider-codex-auth.test.ts`
- `tests/vitest/setup-quickstart-flow.test.ts`
- `tests/vitest/setup-quickstart-oauth.test.ts`
- `tests/vitest/setup-wizard-runtime.test.ts`
- `tests/vitest/setup-quickstart-validation.test.ts`
- `tests/vitest/lifecycle-readiness.test.ts`
- `tests/vitest/provider-display.test.ts`
- `tests/node/cli-root-commands.test.ts`

## Idempotence and Recovery

The code and docs edits are safe to reapply while the branch is in progress. If `pnpm verify:all` fails because of stale build artifacts in a workspace package, rerun the full gate instead of relying only on targeted tests; the full gate rebuilds the workspace and is the authoritative acceptance path. If GitHub review later finds an issue, update this ExecPlan’s `Progress`, `Surprises & Discoveries`, and `Decision Log` entries before pushing the fix so the plan remains restart-safe for the next contributor.

## Artifacts and Notes

Expected operator-facing examples after the change:

    Quickstart provider guidance:
    - OpenAI and Codex quickstart both expose a beginner-friendly reasoning-effort choice:
      - Default (recommended)
      - Low
      - Medium
      - High

    Doctor output:
    Ready now
      - Primary provider: codex-main (Codex (OpenAI account login))
      - Provider model: gpt-5.4
      - Provider tuning: Reasoning effort: medium

## Interfaces and Dependencies

At the end of this work the following repository interfaces must exist and remain aligned:

- `packages/core-types/src/provider.ts`
  - `CodexProviderRuntimeConfig` includes `reasoningEffort?: OpenAIReasoningEffort`
- `packages/config/src/schema.ts`
  - the `codex` provider schema accepts optional `reasoningEffort`
- `packages/providers-openai-shared/src/index.ts`
  - exports shared reasoning-model gating and payload helpers used by both OpenAI and Codex
- `packages/providers-codex/src/index.ts`
  - attaches reasoning only when configured and supported
- `apps/openassistd/src/index.ts`
  - passes OpenAI/Codex reasoning and Anthropic thinking config into adapter constructors
- `apps/openassist-cli/src/lib/provider-display.ts`
  - centralizes provider route/model/tuning display strings for quickstart, wizard, and lifecycle output
- `apps/openassist-cli/src/lib/lifecycle-readiness.ts`
  - adds provider route/model/tuning context additively without breaking lifecycle report version `2`

Revision note: This ExecPlan was created after the core code changes were already underway so the repo has one self-contained record of the final implementation, remaining verification work, and the reasoning behind the UX and lifecycle changes.
