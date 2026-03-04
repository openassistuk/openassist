# Context Engine

Source: `packages/core-runtime/src/context.ts`.

The context engine keeps provider input bounded and predictable so long-running conversations do not exhaust model windows or leak internal traces.

## Planner Model

`ContextPlanner` accepts:

- system prompt
- recent normalized conversation messages

Planner behavior:

1. cap retained raw messages to `maxRawTurns` (default `12`)
2. reserve fixed budget slices for system, active turn, recalled state, and safety margin
3. include newest messages first until budget is exhausted
4. emit final provider payload in deterministic role order

Default budget values in code:

- total: `24000`
- system: `1500`
- active turn: `3000`
- recalled state: `3500`
- safety margin: `1000`

Token estimation is intentionally approximate in current release.

## Snapshot Cadence

Planner emits a snapshot signal every configured cadence (`snapshotEveryNTurns`, default `8`). Runtime persists this as a durable marker for later memory compaction workflows.

## Output Sanitization

`sanitizeUserOutput()` removes known internal-trace formats before outbound channel delivery, including:

- `<think>...</think>` blocks
- fenced reasoning blocks
- `[internal_trace]...[/internal_trace]` sections

This is a strict channel-safety barrier separate from provider formatting.

## Why It Matters

This prevents three common gateway failures:

- unbounded transcript stuffing that causes provider rejection
- malformed role ordering from ad hoc truncation
- accidental chain-of-thought leakage to end users

## Tuning Rules

When adjusting budgets or planner behavior:

1. keep explicit safety margin
2. keep deterministic role order
3. keep hard cap on raw history
4. keep sanitization independent of provider adapter logic

## Current Limits

- no provider-specific tokenizer yet
- no semantic summarizer fallback path yet
- snapshot persistence is marker-based, not full structured memory object storage
