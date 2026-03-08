# Provider Reasoning Controls

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document must be maintained in accordance with `.agents/PLANS.md`.

## Purpose / Big Picture

After this change, an operator can keep quickstart simple while using `openassist setup wizard` to tune provider-native reasoning for the built-in OpenAI and Anthropic adapters without risking unsupported API parameters on providers that do not support them. OpenAI operators can choose a reasoning effort, Anthropic operators can choose a thinking budget, and OpenAssist will only send those parameters on the model families it knows how to use safely. Anthropic tool turns will also preserve provider replay state so tool-enabled “thinking” sessions continue to work across follow-up calls instead of silently degrading.

The result is observable in three ways. First, the wizard will offer the new reasoning controls only on the appropriate provider types. Second, provider adapter tests will show the correct request payloads and safe omission behavior. Third, `pnpm verify:all` will pass with the new config/docs/test coverage in place.

## Progress

- [x] (2026-03-08 11:05Z) Reviewed the interrupted branch and confirmed the partially implemented files for provider config, wizard prompts, and runtime metadata persistence.
- [x] (2026-03-08 11:20Z) Finished schema and type support for provider-native reasoning fields on built-in providers while keeping OpenAI-compatible free of new public reasoning knobs.
- [x] (2026-03-08 11:45Z) Added wizard prompts for OpenAI reasoning effort and Anthropic thinking budget, including unset/default behavior.
- [x] (2026-03-08 12:10Z) Added setup-validation warnings so unsupported model families keep working safely while telling the operator the configured reasoning field will be omitted.
- [x] (2026-03-08 13:20Z) Completed provider/runtime regression tests for OpenAI reasoning payloads, Anthropic thinking replay, and wizard scripted fixtures.
- [x] (2026-03-08 13:22Z) Updated docs and changelog so the operator story matches the implementation.
- [x] (2026-03-08 13:25Z) Ran targeted suites and `pnpm verify:all` successfully.
- [ ] (2026-03-08 13:25Z) Commit, push, open the PR, and monitor review/CI to green.

## Surprises & Discoveries

- Observation: Anthropic “thinking” support is not just a request-field problem. Tool-enabled follow-up calls need the original provider content blocks to survive across runtime persistence and replay.
  Evidence: The Anthropic adapter originally reduced assistant tool turns to synthetic `tool_use` placeholders only, which would discard provider-native thinking blocks between rounds.

- Observation: The existing runtime persistence path already has the right place to carry provider replay state without a schema migration.
  Evidence: `ChatResponse.output.metadata` is already stored on assistant messages via `db.recordAssistantMessage(...)`, so reserved replay keys can survive recent-message reconstruction without a new table.

- Observation: The wizard test surface is sensitive to every new prompt in add/edit flows.
  Evidence: The scripted prompt adapters in `tests/node/cli-setup-wizard.test.ts`, `tests/vitest/setup-wizard-branches.test.ts`, and `tests/vitest/setup-wizard-runtime.test.ts` all depend on exact answer order and must be updated when a provider edit gains one more prompt.

- Observation: The interrupted runtime change left one compile bug that only appeared once the full workspace build reran.
  Evidence: `packages/core-runtime/src/runtime.ts` referenced `response.output.metadata` outside the provider-call loop; the fix was to track `finalResponseMetadata` explicitly.

## Decision Log

- Decision: Keep reasoning controls in `openassist setup wizard` only and leave quickstart unchanged.
  Rationale: Quickstart is the first-reply path and should not absorb advanced provider tuning.
  Date/Author: 2026-03-08 / Codex

- Decision: Use provider-native fields instead of one cross-provider “reasoning level” abstraction.
  Rationale: OpenAI and Anthropic do not expose the same contract. A shared field would either over-promise or force unsupported passthrough behavior on other providers.
  Date/Author: 2026-03-08 / Codex

- Decision: Keep OpenAI-compatible out of scope for public reasoning controls in this PR.
  Rationale: Safe-by-default matters more than “maybe this upstream-compatible API accepts it”. Omission avoids accidental request failures.
  Date/Author: 2026-03-08 / Codex

- Decision: Reuse `ChatResponse.output.metadata` for Anthropic replay state instead of adding a new persistence table.
  Rationale: The runtime already persists assistant-message metadata durably, so this keeps the change additive and restart-safe without schema churn.
  Date/Author: 2026-03-08 / Codex

- Decision: Surface unsupported-model cases as validation warnings, not blocking errors.
  Rationale: The operator may intentionally keep one model today and another later. OpenAssist can stay safe by omitting the unsupported request field while still telling the operator why the control is inactive.
  Date/Author: 2026-03-08 / Codex

## Outcomes & Retrospective

The implementation is complete locally. OpenAssist now exposes provider-native reasoning controls in setup wizard, validates them safely, sends them only on the supported built-in provider/model combinations, and preserves Anthropic replay metadata across tool turns. The main lesson is that “reasoning control” is not just a config surface: Anthropic continuity required runtime-aware replay handling and explicit regression coverage.

## Context and Orientation

OpenAssist has one operator CLI in `apps/openassist-cli`, one runtime orchestrator in `packages/core-runtime`, and one adapter package per model provider under `packages/providers-*`. Provider config types live in `packages/core-types/src/provider.ts` and are validated by `packages/config/src/schema.ts`. The setup wizard lives in `apps/openassist-cli/src/lib/setup-wizard.ts`. The built-in OpenAI adapter is `packages/providers-openai/src/index.ts`, and the built-in Anthropic adapter is `packages/providers-anthropic/src/index.ts`.

In this repository, a “provider adapter” is the module that turns OpenAssist’s normalized `ChatRequest` into a provider-specific API call and turns the provider response back into a normalized `ChatResponse`. A “tool turn” is a model response that asks OpenAssist to execute a local tool such as `fs.write` or `exec.run`, after which the runtime calls the provider again with the tool result. “Replay metadata” means reserved assistant-message metadata that stores provider-native content blocks so a later provider call can reconstruct what the provider originally emitted.

The important files for this change are:

- `packages/core-types/src/provider.ts` for the public provider config contract.
- `packages/config/src/schema.ts` for runtime config validation.
- `apps/openassist-cli/src/lib/setup-wizard.ts` for the operator prompts.
- `apps/openassist-cli/src/lib/setup-validation.ts` for non-blocking operator warnings.
- `packages/providers-openai/src/index.ts` for Responses API reasoning effort handling.
- `packages/providers-anthropic/src/index.ts` for thinking-budget request handling and replay reconstruction.
- `packages/core-runtime/src/runtime.ts` for persisting replay metadata across tool turns.
- `tests/vitest/provider-openai-tool-mapping.test.ts`, `tests/vitest/provider-anthropic-tool-mapping.test.ts`, and `tests/node/runtime.test.ts` for the adapter/runtime proof.
- `docs/interfaces/provider-adapter.md`, `docs/operations/setup-wizard.md`, `docs/README.md`, `README.md`, and `CHANGELOG.md` for operator-facing documentation.

## Plan of Work

Finish the provider/runtime implementation first so the underlying behavior is stable before the docs are rewritten. The OpenAI adapter must send `reasoning: { effort }` only on the Responses API path and only for the supported model families already routed that way. The Anthropic adapter must send `thinking: { type: "enabled", budget_tokens }` only on supported Claude thinking families and must preserve replay metadata when a thinking-enabled tool turn occurs. The runtime must continue storing `response.output.metadata` on assistant messages so follow-up provider calls can reconstruct the original provider content.

Next, finish the CLI/operator layer. `apps/openassist-cli/src/lib/setup-validation.ts` must warn when an operator configures one of these controls on a default model OpenAssist does not know how to use safely. `apps/openassist-cli/src/lib/setup-wizard.ts` must keep quickstart untouched while offering the new prompts in add/edit provider flows. The scripted wizard tests must be updated to match the new prompt order, and at least one explicit wizard test must prove the values persist.

Once the behavior and tests are in place, update the docs so they stay truthful. `README.md` and `docs/README.md` should mention that advanced provider reasoning controls live in setup wizard. `docs/interfaces/provider-adapter.md` should describe the new provider-native controls, safe omission behavior, and Anthropic replay-metadata rule. `docs/operations/setup-wizard.md` should tell operators where these controls live and that leaving them unset is the safe default. `CHANGELOG.md` must describe the user-visible impact concretely.

## Concrete Steps

Run all commands from the repository root, `c:\Users\dange\Coding\openassist`.

1. Update the code and tests with `apply_patch`, then run targeted suites while the scope is still small:

       pnpm vitest tests/vitest/config-security-schema.test.ts tests/vitest/setup-quickstart-validation.test.ts tests/vitest/provider-openai-tool-mapping.test.ts tests/vitest/provider-anthropic-tool-mapping.test.ts tests/vitest/setup-wizard-runtime.test.ts tests/vitest/setup-wizard-branches.test.ts
       pnpm test -- tests/node/runtime.test.ts tests/node/cli-setup-wizard.test.ts

   Expect the targeted suites to pass and to prove:
   - OpenAI reasoning effort is included only on supported Responses API requests.
   - Chat-completions and unsupported model families omit reasoning safely.
   - Anthropic thinking budget is sent only when configured and supported.
   - Anthropic replay metadata survives tool turns.
   - Wizard scripted answers and saved config include the new provider fields.

2. Update the docs and changelog once the code behavior is stable.

3. Run the full local gate:

       pnpm verify:all

   Expect the repository verification command to exit `0`.

4. Commit and push:

       git status --short
       git add .
       git commit -m "feat: add provider reasoning controls"
       git push -u origin feat/provider-reasoning-controls

5. Open and monitor the PR with GitHub CLI:

       gh pr create --fill
       gh pr checks --watch

   If Copilot or CodeQL comments appear, fix them on the same branch, rerun `pnpm verify:all`, and push again until the PR is green and the actionable review surface is resolved.

## Validation and Acceptance

Acceptance is behavioral, not just compile success.

OpenAI acceptance:

- Run the OpenAI provider mapping test and observe that GPT-5-class requests include `reasoning.effort` in the Responses API payload.
- Observe that chat-completions payloads do not contain a reasoning field even when the provider config includes `reasoningEffort`.
- Observe that a Responses API call triggered by image input on a non-reasoning model omits the field safely.

Anthropic acceptance:

- Run the Anthropic provider mapping test and observe that `thinking` appears only when the config sets `thinkingBudgetTokens` on a supported model.
- Observe that a response containing a thinking block stores replay metadata and that a follow-up call reconstructs the original assistant content blocks without duplicating the synthetic tool-use placeholder.

Wizard acceptance:

- Run the wizard scripted tests and observe that OpenAI providers can persist `reasoningEffort` and Anthropic providers can persist `thinkingBudgetTokens`.
- Confirm that quickstart tests remain unchanged because quickstart does not ask about provider reasoning controls.

Docs/release acceptance:

- Read `README.md`, `docs/README.md`, `docs/interfaces/provider-adapter.md`, and `docs/operations/setup-wizard.md` and confirm they all say the same thing: advanced provider reasoning controls live in setup wizard, defaults are unset/safe, OpenAI-compatible does not get the knob in this PR, and internal reasoning never appears in channel output.

Final gate acceptance:

- Run `pnpm verify:all` and expect success.
- After the PR is opened, wait for all GitHub checks to turn green and for any actionable Copilot/CodeQL comments to be fixed or explicitly resolved.

Local proof collected during implementation:

- `pnpm vitest run tests/vitest/config-security-schema.test.ts tests/vitest/setup-quickstart-validation.test.ts tests/vitest/provider-openai-tool-mapping.test.ts tests/vitest/provider-anthropic-tool-mapping.test.ts tests/vitest/setup-wizard-runtime.test.ts tests/vitest/setup-wizard-branches.test.ts`
- `pnpm -r build`
- `pnpm exec tsx --test tests/node/runtime.test.ts tests/node/cli-setup-wizard.test.ts`
- `pnpm verify:all`

## Idempotence and Recovery

All code and doc edits in this plan are additive or localized and can be re-applied safely. The wizard scripted tests are deterministic once their answer queues are updated. If a targeted suite fails, fix the specific file and rerun the same targeted suite before rerunning `pnpm verify:all`. If a PR review finds a provider-specific bug, keep the same branch, apply the minimal fix, rerun `pnpm verify:all`, and push again. No database migration or destructive lifecycle step is involved in this plan.

## Artifacts and Notes

The most important proof from this plan should be concise test output showing the new payload behavior. Keep examples short when updating the plan later, for example:

    ✓ provider-openai-tool-mapping > routes GPT-5 class models through responses API and maps function_call output
    ✓ provider-anthropic-tool-mapping > stores replay metadata for thinking blocks and replays them without duplicating tool_use placeholders
    ✓ setup wizard runtime flow > persists provider-native reasoning controls through wizard add and edit flows

## Interfaces and Dependencies

At the end of this work, these public shapes must exist and stay aligned:

- In `packages/core-types/src/provider.ts`:
  - `export type OpenAIReasoningEffort = "low" | "medium" | "high"`
  - `export interface OpenAIProviderRuntimeConfig extends BaseProviderConfig { type: "openai"; reasoningEffort?: OpenAIReasoningEffort }`
  - `export interface AnthropicProviderRuntimeConfig extends BaseProviderConfig { type: "anthropic"; thinkingBudgetTokens?: number }`
  - `export type ProviderConfig = OpenAIProviderRuntimeConfig | AnthropicProviderRuntimeConfig | OpenAICompatibleProviderRuntimeConfig`

- In `packages/config/src/schema.ts`, provider config validation must accept the built-in fields above and keep OpenAI-compatible free of public reasoning controls.

- In `packages/providers-openai/src/index.ts`, the adapter must send the reasoning payload only on supported Responses API requests.

- In `packages/providers-anthropic/src/index.ts`, the adapter must:
  - send `thinking` only when configured and supported,
  - emit replay metadata through `ChatResponse.output.metadata`,
  - reconstruct replay content blocks on later calls.

- In `packages/core-runtime/src/runtime.ts`, the runtime must preserve `response.output.metadata` on assistant messages created during tool loops and final assistant persistence.

Revision note: updated after the local verification pass to record the completed implementation, the runtime compile fix discovered during the full build, and the successful evidence collected before PR creation.
