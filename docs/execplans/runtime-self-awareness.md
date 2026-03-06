# Runtime Self-Awareness On Every Chat Turn

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This repository includes `.agents/PLANS.md`. This document must be maintained in accordance with `.agents/PLANS.md`.

## Purpose / Big Picture

After this change, OpenAssist no longer relies on a tiny host JSON blob and a generic system prompt. Every provider turn now carries a bounded runtime-awareness snapshot that tells the model what OpenAssist is, what machine it is running on, which policy profile applies to the current session, which tools are configured, which tools are callable right now, and whether native web search is available. Operators can see the same boundary through `/status` and `openassist tools status`, which means a human can confirm what the model should know without inspecting internal storage.

The behavior is visible in three ways. First, `/status` now reports awareness summary, callable tools, configured tool families, and native web mode. Second, provider requests contain an explicit runtime-awareness system message. Third, `session_bootstrap.systemProfile` persists the normalized awareness snapshot so restarts remain deterministic without growing the transcript unboundedly.

## Progress

- [x] (2026-03-06 12:20Z) Added `RuntimeAwarenessSnapshot` to `packages/core-types/src/runtime.ts` and introduced a dedicated awareness builder in `packages/core-runtime/src/awareness.ts`.
- [x] (2026-03-06 12:35Z) Replaced raw host-profile dumping in `packages/core-runtime/src/runtime.ts` with bounded awareness system-message generation and summarized status/profile output.
- [x] (2026-03-06 12:50Z) Persisted awareness inside the existing `session_bootstrap.systemProfile` payload and refreshed it when session profile or runtime tool state changes.
- [x] (2026-03-06 13:05Z) Extended `getToolsStatus()` and `/status` output so operators see callable tools, configured tools, native web state, and awareness summary.
- [x] (2026-03-06 13:20Z) Added integration coverage in `tests/node/runtime.test.ts` for provider-request awareness injection, stored bootstrap awareness, and profile-sensitive callable tool visibility.
- [x] (2026-03-06 13:55Z) Updated README, architecture, interface, operations, security, testing, and changelog surfaces to document the new awareness contract.

## Surprises & Discoveries

- Observation: The safest place to persist awareness was the existing `session_bootstrap.systemProfile` record, not a new table.
  Evidence: The storage layer already round-tripped `systemProfile` JSON in `packages/storage-sqlite/src/index.ts`, so adding a normalized `awareness` field preserved restart determinism without introducing a new migration.
- Observation: Keeping `RuntimeToolsConfig.web` temporarily optional in `packages/core-types/src/runtime.ts` avoided unnecessary test churn in manual `RuntimeConfig` literals while the config rollout was still in flight.
  Evidence: Existing tests construct partial runtime configs directly; making `web` required immediately would have caused unrelated fixtures to fail before the default loader/schema path was updated.
- Observation: `/status` needed the same awareness summary the provider sees, otherwise operators would still be debugging a different reality than the model.
  Evidence: `packages/core-runtime/src/runtime.ts` now builds awareness once per status request and surfaces `profile`, `callable tools`, `configured tool families`, and `native web` status in the channel-visible reply.

## Decision Log

- Decision: Introduce a dedicated awareness builder in `packages/core-runtime/src/awareness.ts` instead of formatting awareness inline in `runtime.ts`.
  Rationale: The snapshot needed to be reused in provider system messages, `/status`, `getToolsStatus()`, and persisted bootstrap data. A single builder reduced drift and made testing the awareness contract direct.
  Date/Author: 2026-03-06 / Codex

- Decision: Store awareness in `session_bootstrap.systemProfile.awareness` rather than in message history.
  Rationale: The requirement was restart-safe grounding without unbounded context growth. `session_bootstrap` is already the per-session durable grounding record, so extending it met that requirement cleanly.
  Date/Author: 2026-03-06 / Codex

- Decision: Keep awareness bounded and summary-oriented instead of dumping raw config.
  Rationale: The mission and AGENTS constraints explicitly forbid unbounded context growth and undocumented privileged leakage. Awareness now summarizes host/runtime/tool state without injecting secrets or raw provider/channel config.
  Date/Author: 2026-03-06 / Codex

- Decision: Make `/status` and `openassist tools status` reflect the same capability boundary the model sees.
  Rationale: Operator trust depends on a single source of truth. If humans and the model see different capability descriptions, debugging tool behavior becomes guesswork.
  Date/Author: 2026-03-06 / Codex

## Outcomes & Retrospective

The awareness pass achieved the intended user-visible result. OpenAssist now tells the model, on every turn, that it is running inside a local-first gateway on a real machine, what the active session profile is, which tools are callable, and what is not available. The same information is available to operators without provider dependency through `/status` and `openassist tools status`.

The main lesson was that grounding and operability must share a representation. Reusing one normalized snapshot for provider context, status output, and persisted bootstrap data removed an entire class of drift bugs. The remaining follow-on work, which is covered by `docs/execplans/native-web-tools.md`, was to attach a first-class web tool family to that same awareness model.

## Context and Orientation

The core runtime lives in `packages/core-runtime/src/runtime.ts`. It builds provider requests, handles inbound channel messages, runs the bounded tool loop, and owns `/status` and `/profile`. Tool schemas live in `packages/core-runtime/src/tool-registry.ts`. Persistent session grounding lives in the `session_bootstrap` table managed by `packages/storage-sqlite/src/index.ts`. Runtime contracts live in `packages/core-types/src/runtime.ts`.

In this repository, “runtime awareness” means a compact structured snapshot that describes the OpenAssist software identity, the current machine summary, the current session/runtime state, the active policy/autonomy state, and the native web state. It is not a raw config dump and it must not contain secrets. “Bounded” means the snapshot remains small and stable enough to include on every provider turn without causing unbounded transcript growth.

## Plan of Work

The implementation touched four areas. First, define the new awareness type in `packages/core-types/src/runtime.ts` so runtime and tests share one contract. Second, add `packages/core-runtime/src/awareness.ts` to build and summarize the snapshot. Third, update `packages/core-runtime/src/runtime.ts` so `handleInbound()` and `ensureSessionBootstrap()` create and persist awareness, and so `/status`, `/profile`, and `getToolsStatus()` render the same capability summary. Fourth, update tests and docs so the new contract is exercised and operator-visible.

The key runtime edits are concentrated in `runtime.ts`. `buildAwarenessSnapshot()` now derives live state from host info, runtime modules, current session profile, configured tools, callable tools, and native web status. `buildSessionBootstrapSystemMessage()` now emits assistant profile memory plus the awareness system message rather than dumping raw system-profile JSON. `buildOperationalStatusMessage()` now includes awareness, callable tools, configured tool families, and native web state. `ensureSessionBootstrap()` rewrites the persisted bootstrap record whenever assistant identity or awareness changes.

## Concrete Steps

Run the following from the repository root `c:\Users\dange\Coding\openassist`.

1. Build the workspace.

       pnpm -r build

   Expect the build to complete without TypeScript errors.

2. Run the targeted runtime and tool-loop tests.

       pnpm test:vitest
       pnpm test:node

   Expect the new runtime-awareness assertions in `tests/node/runtime.test.ts` to pass.

3. Inspect operator-facing status manually in a running environment.

       openassist tools status --session telegram:ops-room

   Expect output that includes callable tools, configured tool families, an awareness summary, and native web state.

## Validation and Acceptance

Acceptance is satisfied when all of the following are true:

1. Sending `/status` from chat produces a local diagnostic reply without provider dependency and includes session profile, callable tools, configured tool families, and native web status.
2. In `tests/node/runtime.test.ts`, the provider request contains a system message matching `runtime awareness snapshot`.
3. `session_bootstrap.systemProfile.awareness.policy.profile` updates from `operator` to `full-root` when the session profile changes.
4. Provider tool schemas remain absent in `operator` sessions and appear only after `full-root` elevation.

The concrete commands executed for this implementation were:

    pnpm -r build
    pnpm test:vitest
    pnpm test:node

All passed on 2026-03-06 in this working tree.

## Idempotence and Recovery

The implementation is additive and safe to reapply. Awareness is regenerated from live runtime state and written back into the same `session_bootstrap` row, so rerunning the code path refreshes the snapshot instead of creating duplicate durable records. If a future change needs to adjust the awareness schema, it should continue using the existing `systemProfile` payload unless a migration is explicitly justified.

## Artifacts and Notes

Important evidence from the completed work:

    tests/node/runtime.test.ts
      - "injects layered awareness snapshots and refreshes callable tool visibility by profile"

    packages/core-runtime/src/runtime.ts
      - getToolsStatus(): returns enabledTools, configuredTools, webTool, awareness
      - buildOperationalStatusMessage(): renders awareness/native web/callable tools
      - ensureSessionBootstrap(): persists awareness inside systemProfile

    packages/core-runtime/src/awareness.ts
      - buildRuntimeAwarenessSnapshot()
      - buildRuntimeAwarenessSystemMessage()
      - summarizeRuntimeAwareness()

## Interfaces and Dependencies

At completion, the following interfaces and modules must exist and are now present:

- `packages/core-types/src/runtime.ts`
  - `RuntimeAwarenessSnapshot`
- `packages/core-runtime/src/awareness.ts`
  - `buildRuntimeAwarenessSnapshot(input)`
  - `buildRuntimeAwarenessSystemMessage(snapshot)`
  - `summarizeRuntimeAwareness(snapshot)`
- `packages/core-runtime/src/runtime.ts`
  - `getToolsStatus(sessionId?)` returning awareness and configured-vs-callable tool data
  - `buildAwarenessSnapshot(sessionId, conversationKey, profile)`
  - persisted `systemProfile.awareness` handling in session bootstrap flow

Revision note (2026-03-06): Initial checked-in completed ExecPlan capturing the shipped runtime-awareness implementation, decisions, and validation evidence so a future contributor can reproduce or extend the work without reconstructing the diff.
