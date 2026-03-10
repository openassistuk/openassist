# Setup Wizard Full-Access Prompt

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document must be maintained in accordance with `.agents/PLANS.md`.

## Purpose / Big Picture

After this change, an operator using the normal advanced setup flow will no longer be able to add approved operator IDs and leave the install silently stuck in standard workspace-only mode unless they do so intentionally. When `openassist setup wizard` or the `Advanced configuration` path inside bare `openassist setup` captures approved operator IDs for a channel, OpenAssist will explicitly offer to switch the installation to `Full access for approved operators`, which is the mode that grants `full-root` access and disables filesystem workspace-only restrictions for those approved operators. The visible proof is that the wizard will show the new prompt during channel editing, the saved config will reflect the operator's answer, and the docs/tests will describe and validate that behavior.

## Progress

- [x] (2026-03-10 22:28Z) Audited the setup hub, quickstart, wizard, access-mode helpers, docs, and tests to confirm the gap: quickstart couples approved operators to the full-access preset, but wizard channel editing only stores operator IDs.
- [x] (2026-03-10 22:36Z) Implemented the wizard prompt and supporting helper logic in `apps/openassist-cli/src/lib/setup-wizard.ts`, keeping the prompt limited to standard-mode channel operator-ID changes and preserving custom advanced access setups.
- [x] (2026-03-10 22:36Z) Added Vitest coverage for accepting and declining the new wizard prompt, and fixed the edit-channel settings assignment so operator IDs persist through channel edits.
- [x] (2026-03-10 22:39Z) Updated `README.md`, `docs/README.md`, `docs/operations/setup-wizard.md`, `docs/operations/quickstart-linux-macos.md`, `docs/operations/common-troubleshooting.md`, and `CHANGELOG.md` to document the new normal-flow wizard prompt.
- [x] (2026-03-10 22:41Z) Ran `pnpm exec vitest run tests/vitest/setup-wizard-runtime.test.ts` successfully.
- [x] (2026-03-10 22:44Z) Ran `pnpm verify:all` successfully.
- [x] (2026-03-10 22:31Z) Addressed the Copilot PR review follow-up by limiting the prompt trigger to newly added operator IDs instead of any order-sensitive operator-ID change, and added a reorder regression test.
- [x] (2026-03-10 22:34Z) Re-ran `pnpm exec vitest run tests/vitest/setup-wizard-runtime.test.ts` and `pnpm verify:all` successfully after the review-driven follow-up.

## Surprises & Discoveries

- Observation: the setup hub already treats quickstart as the first-time path and wizard as the advanced path, so the missing behavior is specifically a wizard gap, not a bare-hub routing bug.
  Evidence: `apps/openassist-cli/src/lib/setup-hub.ts` routes `First-time setup` to `runSetupQuickstart(...)` and `Advanced configuration` to `runSetupWizard(...)`.

- Observation: the current wizard already separates the concept of "who is approved" from "what access they get", but it only surfaces the second concept inside the runtime/access editor, not when channel operator IDs are added.
  Evidence: `apps/openassist-cli/src/lib/setup-wizard.ts` calls `setOperatorUserIds(...)` in channel add/edit flows, while `editAccessMode(...)` separately controls `runtime.operatorAccessProfile` and `tools.fs.workspaceOnly`.

- Observation: the existing edit-channel flow rebuilt `channel.settings` after calling `setOperatorUserIds(...)`, which would discard operator IDs on edit without an explicit follow-up fix.
  Evidence: before the patch, `editChannel(...)` called `setOperatorUserIds(channel, ...)` and then reassigned `channel.settings = settings`; the new test coverage now exercises the edit path and keeps the operator IDs intact.

- Observation: a naive "operator IDs changed" check is too broad for the new prompt because reordering or removing IDs in standard mode should not be treated as a new full-access onboarding moment.
  Evidence: Copilot review comment `discussion_r2914841978` on PR `#34` pointed out that the original order-sensitive comparison would reprompt on removals and reordering; the follow-up changed the helper to detect only newly added IDs and added a reorder regression test.

## Decision Log

- Decision: keep approved operator IDs and access mode as separate persisted concepts, but add an in-flow bridge prompt when operator IDs are entered in wizard.
  Rationale: the security model is sound because approved identities and elevated access are not the same thing. The missing piece is operator guidance, so the fix should add explicit prompting instead of collapsing the model.
  Date/Author: 2026-03-10 / Codex

- Decision: trigger the wizard prompt only when at least one new approved operator ID is introduced, not on every edit to a non-empty operator-ID list.
  Rationale: removals and reordering do not represent new access onboarding and would create noisy repeat prompts in the normal maintenance path.
  Date/Author: 2026-03-10 / Codex

## Outcomes & Retrospective

The intended behavior is now implemented end to end. In the normal advanced setup flow, adding approved operator IDs while the install is still in standard mode now triggers an explicit prompt to enable `Full access for approved operators` immediately. Accepting the prompt applies the same full-access/filesystem preset that quickstart already uses. Declining the prompt keeps the approved operator IDs but leaves the install in standard mode, which preserves the valid use case where operators only want later `/access full` escalation instead of automatic full access.

The implementation also tightened a directly related edit-path bug: channel edits now preserve configured approved operator IDs instead of risking a silent overwrite during settings reassignment. Focused wizard tests cover both the new accept/decline behavior and the existing custom advanced access path, and the full repository verification gate passed after the change.

After the initial PR was opened, Copilot identified one legitimate edge: the first implementation would have reprompted on operator-ID reordering because it treated any change as a new addition. The follow-up narrowed the condition to true additions only and added regression coverage for the reorder case. The local focused and full verification gates passed again after that fix.

## Context and Orientation

OpenAssist has two setup surfaces inside `apps/openassist-cli/src/lib/`. `setup-quickstart.ts` owns the first-reply onboarding path. `setup-wizard.ts` owns the advanced editor that bare `openassist setup` exposes as `Advanced configuration`. The helper module `setup-access.ts` defines the supported access presets. In this repository, "approved operator IDs" means the channel-specific sender IDs that are allowed to use in-chat access changes or receive an operator default. "Full access" means the runtime preset where `runtime.operatorAccessProfile` becomes `full-root` and `tools.fs.workspaceOnly` becomes `false`, allowing filesystem tools to escape the workspace-only boundary for approved operators.

The gap is simple and user-visible. Quickstart already asks whether approved operators should receive full access and applies the matching preset with `applySetupAccessModePreset(...)`. Wizard does not. Wizard lets the operator add IDs under the `Channels and operator access` section, but unless they separately visit the runtime access editor, the install remains in standard mode. That is confusing because the wizard menu wording implies the whole operator-access task is handled there.

The main code paths are:

- `apps/openassist-cli/src/lib/setup-wizard.ts` for runtime editing, channel editing, prompt sequencing, validation, and save behavior.
- `apps/openassist-cli/src/lib/setup-access.ts` for the `standard` and `full-access` presets plus access-mode detection.
- `tests/vitest/setup-wizard-runtime.test.ts` for wizard runtime/access coverage.
- `docs/operations/setup-wizard.md` and related lifecycle docs for operator-facing setup wording.
- `CHANGELOG.md` for public release notes.

## Plan of Work

First, add a small helper inside `setup-wizard.ts` that runs after channel operator IDs are captured. That helper should compare the prior operator-ID state and current access-mode state, then prompt only when the operator has newly configured approved IDs while the installation is not already in the full-access preset. The prompt should describe the consequence in plain language: approved operators are configured, but filesystem access is still workspace-only unless full access is enabled.

Second, wire that helper into both channel-add and channel-edit flows. The helper must preserve intentional custom advanced setups. Concretely, if the install already resolves to the `full-access` preset, do nothing. If the install is in `standard` mode or a custom access configuration that still leaves approved operators without the full-access preset, ask whether to switch to `Full access for approved operators` now. If the operator accepts, call `applySetupAccessModePreset(state.config, "full-access")`. If they decline, keep the config unchanged.

Third, extend `tests/vitest/setup-wizard-runtime.test.ts` with behavior-focused coverage. One test should prove that adding operator IDs in wizard now prompts and, when accepted, saves the `full-access` preset. Another should prove declining the prompt leaves standard mode intact while preserving the configured operator IDs. Existing custom advanced coverage must still pass so the change does not normalize away deliberate custom combinations.

Fourth, update the docs that describe setup wizard and lifecycle behavior. `docs/operations/setup-wizard.md` must explain that adding approved operator IDs in wizard now offers the matching full-access/filesystem change. `README.md` and `docs/README.md` should mention the normal setup path clearly enough that operators understand wizard now prompts when channel-level operator access is configured. `CHANGELOG.md` must record the behavior change concretely. If any lifecycle runbook text references wizard access behavior directly, update that wording too.

Finally, run focused tests for the wizard flow, then run `pnpm verify:all` from the repository root and record the evidence in this plan.

## Concrete Steps

From `c:\Users\dange\Coding\openassist`:

1. Edit `apps/openassist-cli/src/lib/setup-wizard.ts` to add the post-operator-ID prompt helper and call it from both channel add/edit flows.
2. Edit `tests/vitest/setup-wizard-runtime.test.ts` to cover accept/decline behavior.
3. Edit operator-facing docs and `CHANGELOG.md`.
4. Run:

    pnpm exec vitest run tests/vitest/setup-wizard-runtime.test.ts

5. Run:

    pnpm verify:all

Expected focused-test result:

    tests/vitest/setup-wizard-runtime.test.ts ... all tests passed

Expected final result:

    pnpm verify:all
    ... build, lint, typecheck, vitest, node tests, and coverage gates succeed

Recorded results:

    pnpm exec vitest run tests/vitest/setup-wizard-runtime.test.ts
    ✓ tests/vitest/setup-wizard-runtime.test.ts (10 tests)

    pnpm verify:all
    ✓ workflow lint, workspace build, lint, typecheck, Vitest, Node tests, and both coverage gates

    pnpm exec vitest run tests/vitest/setup-wizard-runtime.test.ts
    ✓ tests/vitest/setup-wizard-runtime.test.ts (11 tests)

    pnpm verify:all
    ✓ workflow lint, workspace build, lint, typecheck, Vitest, Node tests, and both coverage gates

## Validation and Acceptance

Acceptance is behavior-based:

1. Start `openassist setup`, choose `Advanced configuration`, then add or edit a channel and enter approved operator IDs while the install is still in standard mode. The wizard must ask whether to enable `Full access for approved operators` now.
2. If the operator accepts, the saved config must behave like the `full-access` preset: approved operators default to `full-root` and filesystem tools are no longer workspace-only.
3. If the operator declines, the saved config must keep the chosen operator IDs but remain in standard mode.
4. Existing custom advanced access tests must still pass, proving the new prompt did not erase intentional custom setups.
5. Docs and changelog must describe the new wizard prompt so the operator-facing change is documented in the same PR.

## Idempotence and Recovery

This change is safe to retry because it is additive. Re-running the wizard after the patch only re-prompts when the operator-ID and access-mode combination still needs clarification. If the operator answers incorrectly, they can rerun `openassist setup wizard` and either change the access mode in `Runtime and assistant identity` or edit the channel again. No migration or destructive state change is required.

## Artifacts and Notes

The key evidence to capture after implementation is:

- the new wizard prompt text from the channel flow,
- the focused Vitest run for `tests/vitest/setup-wizard-runtime.test.ts`,
- the final `pnpm verify:all` result,
- the changelog and docs updates that mention the wizard prompt.

## Interfaces and Dependencies

At completion, the following behavior must exist:

- `apps/openassist-cli/src/lib/setup-wizard.ts` contains a helper that can inspect existing operator IDs, inspect the current setup access mode with `detectSetupAccessMode(...)`, and optionally call `applySetupAccessModePreset(state.config, "full-access")`.
- The channel add and edit paths in `apps/openassist-cli/src/lib/setup-wizard.ts` call that helper immediately after `setOperatorUserIds(...)`.
- `tests/vitest/setup-wizard-runtime.test.ts` includes coverage for both accepting and declining the new wizard prompt.
- `docs/operations/setup-wizard.md`, `README.md`, `docs/README.md`, and `CHANGELOG.md` describe the new operator-facing behavior.

Revision note (2026-03-10): Created the initial ExecPlan after auditing the current quickstart and wizard behavior so the missing normal-setup prompt can be implemented with tests and docs in one change.
Revision note (2026-03-10): Updated the plan after implementation to record the added standard-mode wizard prompt, the related edit-channel operator-ID persistence fix, the doc updates, the Copilot review follow-up that narrowed the trigger to newly added IDs only, and the successful focused/full verification results.
