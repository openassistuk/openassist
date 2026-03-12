# Context Engine

Source: `packages/core-runtime/src/context.ts` plus the memory helpers in `packages/core-runtime/src/memory.ts`.

The context engine keeps provider input bounded and predictable so long-running conversations do not exhaust model windows or leak internal traces. It now does that with two durable memory layers instead of a marker-only transcript hint:

- a rolling session summary stored per canonical session ID (`<channelId>:<conversationKey>`)
- conservative actor-scoped permanent memory stored per `<channelId>:<senderId>`

## Planner Model

`ContextPlanner` now accepts three input segments:

- `systemMessages`: the exact system messages that will reach the provider, including the default prompt, bootstrap self-knowledge, and provider input notes
- `recalledStateMessages`: rolling session summary plus recalled durable actor memories
- `recentMessages`: the bounded raw conversation tail from SQLite

Planner behavior:

1. cap retained raw messages to `maxRawTurns` (default `8`)
2. reserve fixed budget slices for system, recalled state, active turn, and safety margin
3. fit system and recalled-state messages in order
4. fit newest raw messages into the remaining active-turn budget
5. emit final provider payload in deterministic role order

Default budget values in code:

- total: `24000`
- system: `6000`
- active turn: `9000`
- recalled state: `5000`
- safety margin: `1000`

Token estimation is intentionally approximate in the current release. The planner counts all injected provider payload segments together so compacted summaries and recalled memories consume the same bounded budget as the raw tail.

## Durable Compaction

Older transcript is no longer represented by `[state_snapshot_written]` markers in `messages`. Runtime compacts older stable transcript in 8-message batches, stores the updated rolling summary in the `session_memory` table, and tracks the last compacted `messages.id` cursor there. This keeps cadence correct after very long chats and after restart because compaction advances by stored message IDs rather than by the current raw-tail length.

After a visible chat turn completes, runtime may run a second bounded provider call using the same provider/model. That sidecar call receives only the existing summary plus the next compactable transcript block and must return strict JSON. If the payload is malformed or the provider fails, runtime drops that extraction pass without failing the user-visible chat reply.

## Durable Actor Memory

Permanent memory is conservative and actor-scoped:

- scope: `<channelId>:<senderId>`
- categories: `preference`, `fact`, `goal`
- recall: top 4 active memories ranked by keyword overlap, salience, and recency

The sidecar extraction pass proposes permanent-memory candidates only for stable preferences, durable facts, or ongoing goals/projects worth recalling in future chats with the same actor. Runtime validates and redacts the response locally before storing it in `permanent_memories`. Repeated memory candidates refresh the same normalized row instead of creating transcript-shaped drift.

`runtime.memory.enabled = false` disables only permanent-memory extraction, recall, and `memory.*` tools. Rolling session summaries remain on so long chats still stay bounded.

## Output Sanitization

`sanitizeUserOutput()` removes known internal-trace formats before outbound channel delivery, including:

- `<think>...</think>` blocks
- fenced reasoning blocks
- `[internal_trace]...[/internal_trace]` sections

This is a strict channel-safety barrier separate from provider formatting and separate from the memory-compaction sidecar.

## Why It Matters

This prevents four common gateway failures:

- unbounded transcript stuffing that causes provider rejection
- continuity loss once old raw messages fall out of the prompt window
- transcript-marker leakage into future provider turns
- accidental chain-of-thought leakage to end users

## Tuning Rules

When adjusting budgets or planner behavior:

1. keep explicit safety margin
2. keep deterministic role order
3. keep hard cap on raw history
4. keep session compaction cursor-based and restart-safe
5. keep permanent memory conservative and actor-scoped
6. keep sanitization independent of provider adapter logic

## Current Limits

- no provider-specific tokenizer yet
- no embeddings or semantic vector search yet; durable memory recall is rule-based
- sidecar extraction is JSON-in-text rather than provider-native structured output
