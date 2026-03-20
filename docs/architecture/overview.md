# Architecture Overview

OpenAssist has two durable execution planes sharing one local state model.

1. Conversational plane: inbound channel message, provider call, outbound message.
2. Scheduled plane: cron/interval task evaluation, durable job enqueue, task execution, optional channel push.

Both planes use the same SQLite durability layer, idempotency model, policy model, and restart/replay worker.

## Design Goals

- deterministic behavior across restarts
- modular adapters for providers/channels/tools
- explicit host-control policy boundaries
- chat-driven autonomous tool loop with deterministic auditability
- bounded prompt construction and output sanitization
- operator-visible health for runtime, scheduler, and clock state

## Layer Breakdown

- Contracts: `packages/core-types`
- Runtime orchestration: `packages/core-runtime`
- Durability and replay: `packages/storage-sqlite`, `packages/recovery`
- Integrations: `packages/providers-*`, `packages/channels-*`, `packages/tools-*`, `packages/skills-engine`
- Operator surfaces: `apps/openassistd`, `apps/openassist-cli`

Current first-class provider routes are implemented as separate adapter packages:

- `packages/providers-openai`
- `packages/providers-codex`
- `packages/providers-anthropic`
- `packages/providers-openai-compatible`

Operator CLI includes dual setup surfaces:

- strict onboarding: `setup quickstart`
- advanced editor: `setup wizard`

## Message Plane Flow

1. Channel adapter emits `InboundEnvelope`.
2. Runtime persists event + message + idempotency data in one transaction.
3. Context planner builds bounded provider payload.
4. Runtime resolves effective access for the current sender/chat turn and exposes tool schemas only for `full-root`.
5. Runtime loads/persists global assistant profile memory (assistant identity/persona/preferences) plus per-session host profile snapshot.
6. Provider adapter executes chat request.
7. If provider returns tool calls, runtime executes tools, persists audit, appends tool-result messages, and loops back to provider (bounded rounds).
8. Output sanitizer removes internal-trace markers from final assistant text.
9. Runtime persists assistant message.
10. Channel send occurs immediately or via durable retry job.

## Scheduled Plane Flow

1. Clock health monitor updates effective timezone and clock status.
2. Scheduler worker evaluates enabled tasks (`cron` or `interval`).
3. Misfire policy determines due windows to enqueue.
4. Runtime enqueues `scheduled_task_execute` jobs with idempotency key `scheduler:<taskId>:<scheduledFor>`.
5. Recovery worker executes prompt or skill action.
6. Run result is persisted.
7. Optional channel push is sent and transport ID persisted.

## Durability Model

Key tables:

- `messages`, `events`
- `jobs`, `job_attempts`, `dead_letters`
- `idempotency_keys`
- `oauth_accounts`, `oauth_flows`
- `policy_profiles`, `skill_registry`
- `system_settings`, `clock_checks`, `module_health`
- `scheduled_task_cursors`, `scheduled_task_runs`
- `tool_invocations`
- `config_generations`

SQLite runs in WAL mode for local durability and concurrent reader behavior.

## Security Posture

- loopback-only API bind by default
- no WebUI in current release
- host actions gated by explicit access profiles
- autonomous chat tool execution only when the current sender/chat turn resolves to `full-root`
- OAuth token material encrypted at rest
- scheduler currently supports prompt and skill actions only (no first-class shell action)

## Platform Scope

- Linux: first-class supported operator path (`systemd --user` or system-level `systemd`)
- macOS: first-class supported operator path (`launchd`)
- Windows: CI validated, service-manager parity deferred

## Non-Goals for Current Release

- distributed multi-node scheduler
- hosted multi-tenant control plane
- visual scheduler editor
