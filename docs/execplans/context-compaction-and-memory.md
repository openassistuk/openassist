# Context Compaction and Durable Actor Memory

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document must be maintained in accordance with `.agents/PLANS.md`.

## Purpose / Big Picture

After this change, OpenAssist should be able to hold longer conversations without losing continuity just because old raw messages fell out of the prompt window. A chat will keep a durable rolling summary that the runtime can reuse after restart, and the same actor in the same channel can also accumulate a conservative permanent memory record for stable facts, preferences, and ongoing goals. Operators should be able to inspect that state from chat, the daemon API, and the CLI, and advanced `full-root` sessions should also get explicit memory tools.

The observable result is threefold. First, long chats continue to reference earlier context through a rolling summary plus bounded recalled memories instead of a marker-only snapshot. Second, `/memory`, `GET /v1/memory/status`, and `openassist memory status` show what was compacted and what permanent memory is currently visible for a request context. Third, the runtime continues to respect the existing autonomy boundary: standard chats do not receive new tool schemas, while `full-root` chats can intentionally use `memory.save` and `memory.search`.

## Progress

- [x] (2026-03-12 15:36Z) Created feature branch `feature/context-compaction-memory`.
- [x] (2026-03-12 15:36Z) Created this ExecPlan and recorded the agreed implementation scope and constraints.
- [x] (2026-03-12 15:58Z) Extended core config and type contracts for runtime memory enablement and memory/tool/status payloads in `packages/core-types/src/runtime.ts`, `packages/config/src/schema.ts`, and `packages/config/src/loader.ts`.
- [x] (2026-03-12 16:00Z) Added durable SQLite state for rolling per-session summaries and actor-scoped permanent memories in `packages/storage-sqlite/src/index.ts`.
- [x] (2026-03-12 16:07Z) Replaced marker-only context compaction with rolling summary injection, real payload budgeting, and bounded recall in `packages/core-runtime/src/context.ts`, `packages/core-runtime/src/memory.ts`, and `packages/core-runtime/src/runtime.ts`.
- [x] (2026-03-12 16:07Z) Added bounded sidecar provider extraction for session summaries and conservative permanent-memory candidates using the active provider/model after visible chat turns.
- [x] (2026-03-12 16:10Z) Added provider-independent `/memory`, daemon memory status API, and CLI memory status command.
- [x] (2026-03-12 16:12Z) Added `memory.save` and `memory.search` tools gated to `full-root` and audited through the normal tool lifecycle.
- [x] (2026-03-12 17:18Z) Updated tests, docs, and `CHANGELOG.md`, and completed the local verification gate by running the `ci:strict` stages successfully.
- [ ] Push branch, open PR, monitor CI/CodeQL/reviews, and fix all issues until merge-ready.

## Surprises & Discoveries

- Observation: the current context planner already exposes budget fields for `activeTurn` and `recalledState`, but the planner logic only subtracts system budget and safety margin.
  Evidence: `packages/core-runtime/src/context.ts` defines those slices, yet `plan(...)` only computes `total - system - safetyMargin`.

- Observation: snapshot cadence is currently tied to the retained raw slice size, so it stops being a true "every 8 turns" signal once conversations exceed the raw cap.
  Evidence: `snapshotWritten` is currently `raw.length > 0 && raw.length % snapshotEveryNTurns === 0` in `packages/core-runtime/src/context.ts`.

- Observation: the existing snapshot persistence path writes `[state_snapshot_written]` into the normal `messages` table, which means the marker can later be replayed as normal assistant history.
  Evidence: `packages/core-runtime/src/runtime.ts` currently records that marker via `db.recordAssistantMessage(...)`.

- Observation: adding `runtime.memory` as a required runtime config surface broke typed config constructors outside the main config loader.
  Evidence: `pnpm -r build` initially failed in `packages/migration-openclaw/src/index.ts` until typed `OpenAssistConfig` object literals were updated.

- Observation: the planner still had a hardcoded `32`-token truncation floor for newest raw messages, which meant tight budgets could drop the active turn entirely even after the new budgeting work.
  Evidence: the first targeted Vitest run failed in `tests/vitest/context.test.ts` until `fitNewestMessages()` stopped skipping truncated messages when the remaining budget was below that floor.

## Decision Log

- Decision: implement this work in one branch and one PR.
  Rationale: context compaction and durable actor memory share the same runtime/storage seam, and splitting them would require either a temporary compaction abstraction or a second storage migration immediately afterward.
  Date/Author: 2026-03-12 / Codex

- Decision: define actor-scoped permanent memory as `<channelId>:<senderId>`, while rolling chat summaries remain per session `<channelId>:<conversationKey>`.
  Rationale: this preserves cross-chat continuity for the same actor within one configured channel without inventing identity matches across unrelated channels.
  Date/Author: 2026-03-12 / Codex

- Decision: ordinary chats keep the current no-tools autonomy boundary; automatic memory extraction for non-`full-root` chats will use a bounded sidecar provider call instead of an exposed tool schema.
  Rationale: the repo explicitly gates autonomous tools to `full-root`, and this work should not relax that invariant.
  Date/Author: 2026-03-12 / Codex

- Decision: permanent memory ships enabled by default, but remains conservative and operator-visible.
  Rationale: the requested feature is intended as a first-class behavior rather than dormant plumbing, and operator-visible inspection reduces hidden-state risk.
  Date/Author: 2026-03-12 / Codex

- Decision: keep the memory sidecar on the same provider `chat()` contract instead of introducing a new provider API just for compaction.
  Rationale: all built-in providers already implement the bounded chat path and can be exercised in tests today; reusing that path preserves provider parity and keeps failure handling simple.
  Date/Author: 2026-03-12 / Codex

- Decision: remove the minimum truncated-message floor in `ContextPlanner.fitNewestMessages()`.
  Rationale: preserving at least a bounded slice of the active turn is more important than avoiding very short truncations, especially when system and recalled-state payloads consume most of a tight budget.
  Date/Author: 2026-03-12 / Codex

## Outcomes & Retrospective

The implementation is in place and the focused build/test passes are green. The runtime now stores rolling session summaries and actor-scoped permanent memory durably, `/memory` plus host-side status surfaces expose that state, and `memory.save` / `memory.search` are gated to `full-root` while ordinary chats still receive no tool schemas. The remaining work is to finish full-repo verification, then push/open the PR and carry it through CI, CodeQL, and review cleanup to merge-readiness.
Local verification is now complete as well: workflow lint, build, lint, typecheck, Vitest, Node integration, and both coverage gates all passed. The remaining work is entirely in the GitHub phase: commit, push, open the PR, and keep fixing anything CI or review finds until the branch is merge-ready.

## Context and Orientation

The core runtime lives in `packages/core-runtime/src/runtime.ts`. It owns inbound chat handling, provider request construction, the bounded tool loop, and runtime-owned chat commands such as `/status`, `/grow`, `/profile`, and now `/memory`. The current context planner is in `packages/core-runtime/src/context.ts`; today it simply truncates recent raw messages and emits a marker-style snapshot signal. Tool schema exposure is defined in `packages/core-runtime/src/tool-registry.ts`, and tool execution is routed through `packages/core-runtime/src/tool-router.ts`.

Durable state lives in `packages/storage-sqlite/src/index.ts`. That module already stores sessions, messages, attachments, events, tool audits, `system_settings`, and `session_bootstrap`. It is the correct place to add two new restart-safe memory surfaces: one per-session compaction record that tracks the rolling summary and last compacted message cursor, and one actor-scoped permanent-memory registry. Because the daemon and CLI already depend on this package directly, new storage interfaces should be added here first and then consumed upward.

Config and runtime contracts live in `packages/core-types/src/runtime.ts`, `packages/core-types/src/common.ts`, `packages/core-types/src/provider.ts`, and `packages/config/src/schema.ts`. The daemon HTTP entrypoint is `apps/openassistd/src/index.ts`, and the host-side CLI registry is `apps/openassist-cli/src/index.ts`. The CLI already follows the pattern of provider-independent status commands that proxy daemon endpoints, so memory inspection should follow that same operator-facing shape.

In this document, "rolling session summary" means a durable summary of one chat session that is rewritten as older raw messages are compacted out of the prompt tail. "Permanent memory" means a durable actor-scoped fact, preference, or goal that is expected to matter across future chats. "Actor scope" means `<channelId>:<senderId>`. "Bounded sidecar extraction" means a second provider request that runs after the main user-visible chat turn, uses a fixed prompt and bounded input, expects strict JSON output, and is allowed to fail silently without degrading the main reply path.

## Plan of Work

First, extend the public contracts and config shape. Add a small runtime memory config block in `packages/core-types/src/runtime.ts` and `packages/config/src/schema.ts` with `enabled: boolean` defaulting to `true`. Extend common/provider/runtime types with the new memory status payloads and any tool/result message metadata required for memory extraction, recall, and inspection. Keep the new contract additive so existing call sites remain source-compatible until the runtime and storage code is updated.

Second, extend the SQLite layer in `packages/storage-sqlite/src/index.ts`. Add one table for per-session compaction state keyed by session ID and one table for permanent actor memories keyed by actor scope plus a normalized dedupe key. Implement methods to read and upsert session summaries, fetch the next compactable message batch using message IDs, upsert or forget permanent memories, and search active permanent memories for an actor scope using simple scoring over normalized text and keywords. The search interface should return enough metadata for runtime ranking and operator inspection without requiring a future schema rewrite when embeddings are added later.

Third, rework runtime context construction in `packages/core-runtime/src/context.ts` and `packages/core-runtime/src/runtime.ts`. Replace the current marker-only snapshot path with a planner that accepts all system segments that truly reach the provider: base system prompt, bootstrap self-knowledge message, provider notes, rolling session summary, recalled permanent memories, and the bounded raw tail. Remove `[state_snapshot_written]` writes entirely. After each eligible turn, compact older messages in 8-message blocks into the session summary and run the sidecar extraction pass to propose a new rolling summary and conservative permanent memories. Validation must reject malformed JSON, overlong outputs, or unsupported categories without breaking the visible reply.

Fourth, add operator and tool surfaces. Add a provider-independent `/memory` command in `runtime.ts`, a daemon endpoint `GET /v1/memory/status`, and a CLI command `openassist memory status` in `apps/openassist-cli/src/index.ts`. Also extend `packages/core-runtime/src/tool-registry.ts` and `packages/core-runtime/src/tool-router.ts` with `memory.save` and `memory.search`, but advertise them only in `full-root` sessions and only when runtime memory is enabled. Their execution path must reuse the same storage layer and audit tables as the existing runtime-owned tools.

Fifth, update tests and documentation together. Add or expand Vitest coverage for planner budgeting and memory utilities, Node integration tests for storage/runtime/API/CLI behavior, and update the required docs and `CHANGELOG.md` in the same change. Finish by running `pnpm verify:all`, then push the branch, open the PR, and keep the ExecPlan updated as CI and reviews uncover anything that needs to be fixed.

## Concrete Steps

From the repository root `c:\Users\dange\Coding\openassist`:

1. Implement the runtime/config/type/storage changes.
2. Run targeted tests while developing, especially the storage, context, runtime, daemon, and CLI suites that cover the new behavior.
3. Update the required docs and changelog after the behavior is stable.
4. Run `pnpm verify:all`.
5. Push `feature/context-compaction-memory`, open a PR, and monitor GitHub Actions and review feedback until everything is green.

Expected later proof points include:

    pnpm verify:all
    # expect exit code 0

    openassist memory status --json
    # expect a JSON payload with session summary and visible actor-scoped memories

    GET /v1/memory/status?sessionId=<channelId>:<conversationKey>&senderId=<senderId>
    # expect a JSON payload aligned with the CLI status output

Commands already run during implementation:

    pnpm -r build
    # first run failed on missing runtime.memory in typed OpenAssistConfig literals; later rerun passed

    pnpm vitest run tests/vitest/context.test.ts tests/vitest/memory.test.ts tests/vitest/provider-display.test.ts tests/vitest/runtime-config-tools-wiring.test.ts tests/vitest/config-security-schema.test.ts
    # expect 5 passed test files, 25 passed tests

    pnpm tsx --test tests/node/storage.test.ts tests/node/runtime-memory.test.ts tests/node/runtime-chat-tool-policy-gate.test.ts tests/node/cli-api-surface-coverage.test.ts tests/node/cli-growth-status-coverage.test.ts
    # expect 5 passed suites, 21 passed tests

    pnpm test:node
    # rerun after fixing a stale runtime-owned command-count assertion in tests/node/runtime.test.ts; expect 40 suite entries, 139 passed, 0 failed, 3 skipped

    pnpm ci:strict
    # completed in quiet mode via redirected log after earlier timeout/noise issues; expect exit code 0

## Validation and Acceptance

Acceptance is behavior, not just compilation. A long-running chat should retain continuity through a durable rolling session summary after older raw messages have been compacted out of the prompt tail. The same actor in a new chat within the same channel should recall only their own durable memories, while a different actor or different channel should not receive those memories. `/memory`, the daemon memory endpoint, and `openassist memory status` should all surface the same visible memory state for a given request context. `memory.save` and `memory.search` should appear only in `full-root` tool status and should create audited tool invocation rows when used. Running `pnpm verify:all` must succeed before the PR is considered ready.

## Idempotence and Recovery

The storage changes must be additive and safe to re-run because `CREATE TABLE IF NOT EXISTS` is already the package convention. Session summary upserts should rewrite the same row for a session rather than append duplicates, and permanent-memory upserts should refresh existing memories using a normalized dedupe key rather than create near-duplicate records. If the sidecar extraction pass fails, the runtime must keep the user-visible response path intact and simply skip that extraction cycle. If CI or review uncovers issues later, the ExecPlan must be updated with the evidence, the fix, and the remaining work before additional changes are made.

## Artifacts and Notes

Important implementation evidence to capture as work proceeds:

    - targeted test commands and their pass/fail output
    - `pnpm verify:all` success
    - PR number and branch name
    - any CI or review failures plus the follow-up fix summary

## Interfaces and Dependencies

At the end of this work, the following interfaces should exist in substance, even if exact helper names differ slightly:

In `packages/core-types/src/runtime.ts`, define additive runtime memory config and status types that let the runtime, daemon, and CLI share one contract for:

    - `runtime.memory.enabled`
    - session summary status
    - actor-scoped permanent-memory inspection output

In `packages/storage-sqlite/src/index.ts`, add public database methods for:

    - reading and upserting a session compaction record by session ID
    - retrieving compactable message batches after a stored message cursor
    - reading, upserting, forgetting, and searching permanent memories by actor scope

In `packages/core-runtime/src/tool-registry.ts` and `packages/core-runtime/src/tool-router.ts`, expose:

    - `memory.save`
    - `memory.search`

In `apps/openassistd/src/index.ts` and `apps/openassist-cli/src/index.ts`, expose:

    - `GET /v1/memory/status`
    - `openassist memory status [--session <id>] [--sender-id <id>] [--json]`

Revision (2026-03-12 15:36Z): Initial ExecPlan created to drive implementation of rolling context summaries, actor-scoped permanent memory, operator inspection surfaces, tool gating, docs, and CI/review completion.
Revision (2026-03-12 16:18Z): Updated progress, discoveries, decisions, and concrete evidence after implementing the runtime/storage/API/CLI/docs work and running the focused build/test passes.
Revision (2026-03-12 17:18Z): Recorded the local `ci:strict` success, the stale runtime test fix, and the handoff into commit/PR/CI/review work.
