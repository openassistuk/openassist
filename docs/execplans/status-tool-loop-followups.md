# Fix Codex Quickstart Warning, /status Formatting, and Tool Loop Limits

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This repository includes [.agents/PLANS.md](/c:/Users/dange/Coding/openassist/.agents/PLANS.md). This document must be maintained in accordance with that file.

## Purpose / Big Picture

This change removes one false quickstart warning, makes the chat-side `/status` command readable in real messaging clients, and raises the runtime-owned autonomous tool loop budget to match the newer default model stack. After this work, a successful Codex device-code quickstart no longer reports a stale validation warning, `/status` renders as grouped sections instead of one long paragraph of bullets, and operators can see and configure the maximum tool rounds per turn while the runtime gives a resumable message when that limit is hit.

The observable proof is straightforward. Run the quickstart OAuth tests and the runtime `/status` tests and see that the new message shapes are present. Run `pnpm verify:all` and then the GitHub workflows for CI, CodeQL, `service-smoke.yml`, and `lifecycle-e2e-smoke.yml`. The branch is complete only when all of those checks are green and the PR has no unresolved automated review comments.

## Progress

- [x] (2026-03-13 13:57Z) Created branch `fix/status-tool-loop-followups` from `main` and confirmed GitHub auth plus workflow layout.
- [x] (2026-03-13 13:57Z) Reproduced and diagnosed the stale quickstart warning on a live host and traced it to pre-link validation counts being reused after successful Codex account linking.
- [x] (2026-03-13 13:57Z) Mapped the code areas for validation, quickstart summaries, `/status`, runtime awareness, tool-loop limits, and existing tests.
- [x] (2026-03-13 14:39Z) Implemented CLI-side provider-auth readiness plumbing so validation, quickstart, and reachable `openassist doctor` suppress the stale Codex warning when the daemon reports a linked, chat-ready account.
- [x] (2026-03-13 14:39Z) Reformatted runtime-owned `/status` into grouped `Session`, `Access & Boundaries`, `Tools & Growth`, `Runtime Health`, and `Lifecycle & Next Steps` sections while preserving existing truth, access gating, and hidden lifecycle-path behavior.
- [x] (2026-03-13 14:39Z) Added `runtime.toolLoop.maxRoundsPerTurn`, defaulted it to `12`, exposed it through runtime awareness and `/v1/tools/status`, and replaced the limit-hit message with a resumable operator-facing explanation.
- [x] (2026-03-13 14:39Z) Updated affected tests, docs, sample config, `CHANGELOG.md`, and the OpenClaw migration path that also needed the new runtime config field for strict typing.
- [x] (2026-03-13 14:39Z) Ran `pnpm verify:all` successfully after fixing the migration config and awareness back-compat typing gaps.
- [ ] Push the branch, open the PR, wait for CI and CodeQL, manually dispatch the smoke workflows, resolve any automated review comments, and record the final evidence here.

## Surprises & Discoveries

- Observation: quickstart already suppresses the web hybrid fallback warning in its visible summary, which is why the live install reported exactly one warning even though raw validation produced two warnings.
  Evidence: `apps/openassist-cli/src/lib/setup-quickstart.ts` filters `tools.web_hybrid_fallback_only` before counting visible warnings.

- Observation: `/status` is already runtime-owned and bypasses the provider path completely, so the formatting change can stay isolated to `packages/core-runtime/src/runtime.ts`.
  Evidence: `handleInbound()` routes `/status` to `buildOperationalStatusMessage()` before any provider chat call.

- Observation: the autonomous loop cap is still a single hardcoded constant in runtime orchestration rather than a schema-backed config value.
  Evidence: `packages/core-runtime/src/runtime.ts` defines `DEFAULT_MAX_TOOL_ROUNDS = 8` and uses it directly in the provider/tool loop.

- Observation: adding `runtime.toolLoop` to the shared runtime config also affects secondary config producers such as OpenClaw import, not only the main loader and sample config.
  Evidence: `pnpm verify:all` initially failed in `packages/migration-openclaw/src/index.ts` because it still emitted a `runtime` object without the new required `toolLoop` field.

- Observation: awareness snapshot back-compat needed a fully explicit `policy` rebuild once the new `maxToolRoundsPerTurn` field was added.
  Evidence: `pnpm verify:all` initially failed in `packages/core-runtime/src/runtime.ts` because the version-upgrade shim was spreading a partial legacy `policy` object into the stricter `RuntimeAwarenessSnapshot["policy"]` type.

## Decision Log

- Decision: keep the false-warning fix additive by passing optional provider-auth readiness into validation rather than making validation call the daemon itself.
  Rationale: validation stays side-effect free and remains usable in quickstart, doctor, and tests without networking.
  Date/Author: 2026-03-13 / Codex

- Decision: keep `/status` as the same runtime-owned command and change presentation only.
  Rationale: the user specifically asked for formatting, not a new verbose command or a reduction in truth.
  Date/Author: 2026-03-13 / Codex

- Decision: add the tool-loop cap under `runtime.toolLoop.maxRoundsPerTurn` instead of under `tools`.
  Rationale: the loop budget is an orchestration policy for model turns, not a property of any one tool family.
  Date/Author: 2026-03-13 / Codex

- Decision: keep `/status` section headings markdown-like (`## ...`) and rely on the existing channel renderer to produce the final chat-safe formatting.
  Rationale: the runtime can improve structure without introducing a parallel verbose command or channel-specific formatting branches inside the status builder.
  Date/Author: 2026-03-13 / Codex

## Outcomes & Retrospective

Local outcome as of 2026-03-13 14:39Z:

- the quickstart/device-code path now recomputes visible warnings after successful Codex account linking, and reachable `openassist doctor` now uses daemon-reported auth readiness so linked, chat-ready Codex defaults no longer keep the stale pending-link warning
- `/status` now emits grouped sections while preserving sender/session IDs, access/source, service and delivery boundaries, callable tools, managed growth, lifecycle detail hiding, and `/profile` plus `/memory` follow-ups
- the tool loop now defaults to `12`, is configurable through `runtime.toolLoop.maxRoundsPerTurn`, exposes that budget through runtime awareness and tools-status output, and returns a resumable limit-hit message
- docs, sample config, changelog, and migration/import paths were updated in the same change
- local proof: `pnpm verify:all` passed

Hosted PR automation evidence will be added here after the branch is pushed and the GitHub checks plus manual smoke workflows are green.

## Context and Orientation

The quickstart and lifecycle doctor logic live under `apps/openassist-cli/src/lib/` plus the CLI entrypoint at `apps/openassist-cli/src/index.ts`. The function `validateSetupReadiness()` in `apps/openassist-cli/src/lib/setup-validation.ts` performs pure config and readiness checks. The function `runSetupQuickstart()` in `apps/openassist-cli/src/lib/setup-quickstart.ts` drives the interactive quickstart flow, then builds the human summary through `apps/openassist-cli/src/lib/setup-summary.ts`.

The runtime-owned messaging behavior lives in `packages/core-runtime/src/runtime.ts`. That file handles inbound commands, provider chat turns, the bounded tool loop, and the text returned by `/status`. Runtime self-knowledge lives in `packages/core-runtime/src/awareness.ts`, and the public contracts for that snapshot live in `packages/core-types/src/runtime.ts`.

The operator config schema lives in `packages/config/src/schema.ts`, with default-file generation in `packages/config/src/loader.ts`, CLI-side default object creation in `apps/openassist-cli/src/lib/config-edit.ts`, and the repository sample config in `openassist.toml`.

The key tests are split between Vitest unit-style coverage in `tests/vitest/` and Node integration coverage in `tests/node/`. The most relevant existing files are `tests/vitest/setup-quickstart-validation.test.ts`, `tests/vitest/setup-quickstart-oauth.test.ts`, `tests/vitest/runtime-self-knowledge.test.ts`, `tests/vitest/runtime-config-tools-wiring.test.ts`, `tests/vitest/config-security-schema.test.ts`, `tests/node/runtime.test.ts`, `tests/node/runtime-access-mode.test.ts`, and `tests/node/cli-root-commands.test.ts`.

## Plan of Work

First, add a small CLI helper that converts `/v1/oauth/status` responses into a simple per-provider readiness map containing linked-account count and chat-ready state. Extend `validateSetupReadiness()` so callers may pass that map. In the default Codex route warning branch, suppress `provider.default_codex_account_link_pending` only when the default provider has at least one linked account and the daemon says the active auth is chat-ready. Then update quickstart so its final saved summary recalculates visible warnings after the service and account-link step succeeds, and update `openassist doctor` so it fetches OAuth status before validation when the daemon is reachable.

Second, replace the single-line `/status` wall of text with five markdown-like sections in `packages/core-runtime/src/runtime.ts`: `## Session`, `## Access & Boundaries`, `## Tools & Growth`, `## Runtime Health`, and `## Lifecycle & Next Steps`. Keep every fact that matters today, including sender ID, session ID, access and source, service and delivery boundaries, callable tools, managed growth, lifecycle-path hiding for unapproved senders, and the `/profile` plus `/memory` follow-up guidance.

Third, add `runtime.toolLoop.maxRoundsPerTurn` to the public types, config schema, loader defaults, CLI defaults, sample config, runtime normalization, awareness snapshot, and tools-status output. Raise the default to `12`, enforce bounds `1..24`, and replace the current generic loop-limit message with one that explains the configured cap, says completed tool results are already in history, and tells the operator to continue with a narrower follow-up request.

Finally, update tests and docs together. The docs update must include the operator-facing root docs, the mandated tool-calling and security docs, the operations docs that describe lifecycle/runtime behavior, and `CHANGELOG.md`. After local verification, open the PR, wait for CI and CodeQL, manually run the smoke workflows, address any automated review comments, and only then mark the branch merge-ready.

## Concrete Steps

Work from `c:\Users\dange\Coding\openassist`.

1. Implement the CLI auth-readiness helper and validation/doctor/quickstart plumbing.
2. Implement the runtime config, awareness, `/status`, and tool-loop changes.
3. Update the targeted tests and run them while iterating.
4. Update docs, the sample config, and `CHANGELOG.md`.
5. Run:

      pnpm verify:all

6. Push the branch and open the PR with title:

      Fix Codex quickstart warning, /status formatting, and tool loop limits

7. Wait for the normal PR checks:

      gh pr checks --watch

8. Manually dispatch the supplemental workflows on the branch:

      gh workflow run service-smoke.yml --ref fix/status-tool-loop-followups
      gh workflow run lifecycle-e2e-smoke.yml --ref fix/status-tool-loop-followups

9. Inspect workflow state and any automated review comments, fix failures, and repeat until all are green.

This section must be updated with the actual commands and outcomes as implementation progresses.

## Validation and Acceptance

Acceptance requires both local and hosted proof.

Local proof means the following behaviors are covered by tests and pass:

- a default Codex provider with a linked, chat-ready account no longer emits `provider.default_codex_account_link_pending`
- a Codex device-code quickstart path no longer prints `Validation warnings` when account linking finished successfully
- `/status` still bypasses the provider, still hides lifecycle paths for unapproved senders, and now renders the required section headings
- the runtime uses the configured tool-loop cap, defaults to `12`, reports the cap through tools status and runtime awareness, and returns the new resumable limit-hit message

Hosted proof means the PR shows green `CI` and `CodeQL` checks, plus green manually triggered `service-smoke.yml` and `lifecycle-e2e-smoke.yml` runs, with no unresolved automated code review comments.

## Idempotence and Recovery

All code and doc edits are additive or in-place and can be rerun safely from this branch. If a test fails mid-implementation, rerun the same targeted suite after the next patch. If local verification fails broadly, return to targeted suites before retrying `pnpm verify:all`. If a GitHub workflow fails, inspect the failing job logs, patch only the underlying issue, push again, and rerun the failed automation.

## Artifacts and Notes

The live-host diagnosis that motivated this plan found two raw validation warnings after a successful Codex link, but quickstart only showed one because it suppresses the web fallback warning before counting visible warnings. That means the user-visible bug is the stale `provider.default_codex_account_link_pending` warning count, not a daemon health issue.

The PR title is fixed:

    Fix Codex quickstart warning, /status formatting, and tool loop limits

## Interfaces and Dependencies

The final implementation must preserve these interfaces and add the following new contract fields:

- `apps/openassist-cli/src/lib/setup-validation.ts`
  - `SetupValidationInput` gains an optional provider-auth readiness map used only for side-effect-free suppression of the stale Codex warning.
- `packages/core-types/src/runtime.ts`
  - add `RuntimeToolLoopConfig`
  - add `RuntimeConfig.toolLoop?: RuntimeToolLoopConfig`
  - add `RuntimeAwarenessSnapshot.policy.maxToolRoundsPerTurn: number`
  - bump the awareness snapshot version to the next integer because the public snapshot shape changes
- `packages/config/src/schema.ts`
  - support `runtime.toolLoop.maxRoundsPerTurn` with default `12` and bounds `1..24`
- `packages/core-runtime/src/runtime.ts`
  - `getToolsStatus()` returns `toolLoop.maxRoundsPerTurn`
  - the provider tool loop reads the configured cap instead of the hardcoded constant
  - `/status` renders the new sectioned format

Revision note: created this ExecPlan after repository and live-host diagnosis so the implementation can proceed with a restart-safe written record.
