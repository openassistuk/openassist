# Restart and Recovery

OpenAssist persists all critical execution state so restart/reboot events do not lose durable intent or create duplicate scheduled side effects.

## Durable State Components

- `messages`, `events`
- `jobs`, `job_attempts`, `dead_letters`
- `idempotency_keys`
- `scheduled_task_cursors`, `scheduled_task_runs`
- `tool_invocations`
- `session_bootstrap`
- `clock_checks`, `module_health`

Secret material safety:

- provider OAuth token material is encrypted at rest
- OAuth flow PKCE verifier values are encrypted before DB write (`enc:` payload format)
- tool invocation request/result payloads are stored in redacted form

## Startup Recovery Sequence

1. load OAuth/account state
2. verify security/path posture (secret backend support and secret-bearing path permission checks where host semantics support it)
3. run clock health check
4. launch channel adapters asynchronously
5. start replay worker
6. start scheduler if enabled and timezone confirmation requirements are satisfied

Channel startup is non-blocking for daemon readiness. A single channel can remain degraded/connecting without blocking runtime startup or `/v1/health`.

## Conversational Recovery

Outbound send failures enqueue durable `send_outbound` jobs. Recovery worker retries with bounded backoff and eventually dead-letters terminal failures.

Provider/auth/runtime failures during inbound chat now produce channel-visible operational diagnostics (sanitized) instead of silent drops. Operators and end users can also request runtime diagnostics directly from chat with `/status`.

Assistant profile memory and host context are also durable:

- global assistant profile memory persists across all sessions (main agent identity/persona/preferences)
- `/profile` reads persisted global assistant profile memory
- `/profile force=true; ...` updates persisted global assistant profile memory (first-boot lock-in guard blocks non-force updates)
- first-contact profile bootstrap prompt state and host profile context persist per session in `session_bootstrap`

Autonomous tool calls are executed inline but audited durably:

- each call writes a `tool_invocations` row (`running -> succeeded/failed/blocked`) with redacted request/result payloads
- restart does not retroactively duplicate already-completed tool invocations for the same inbound idempotency key

## Scheduled Recovery

Scheduler enqueues durable `scheduled_task_execute` jobs keyed by `scheduler:<taskId>:<scheduledFor>`. This keying prevents duplicate execution of the same window after restart.

Run persistence model:

- every scheduled execution creates a `scheduled_task_runs` row
- success stores output payload and optional transport message ID
- failure stores error text for replay and triage

## Misfire Behavior After Downtime

Per-task policy controls catch-up behavior:

- `catch-up-once`
- `skip`
- `backfill` (bounded)

## Operational Verification Commands

Installed command path:

```bash
openassist time status
openassist scheduler status
openassist scheduler tasks
openassist service status
openassist service health
```

In-channel diagnostic command:

- send `/status` to receive runtime/time/scheduler/channel profile status without provider dependency
- send `/profile` to view memory and `/profile force=true; ...` to update persistent global assistant profile memory

## Setup/Service Interaction

- `setup quickstart` can install/restart service and run health checks unless `--skip-service` is used.
- `setup quickstart` service checks are recoverable: strict mode offers retry/abort; `--allow-incomplete` also offers skip.
- `setup wizard` runs post-save service restart + health/time/scheduler checks by default (or `--skip-post-checks` to opt out).
- wizard post-save failures now offer retry/skip/abort paths instead of immediate hard failure.
- wildcard bind-address health checks use loopback probe fallbacks during setup/service validation.
- Restart-safe guarantees still rely on durable queue and idempotency state, not in-memory process state.

## Useful SQL Checks

```sql
SELECT task_id, scheduled_for, status, started_at, finished_at
FROM scheduled_task_runs
ORDER BY id DESC
LIMIT 20;
```

```sql
SELECT key, created_at
FROM idempotency_keys
WHERE key LIKE 'scheduler:%'
ORDER BY created_at DESC
LIMIT 20;
```

## Incident Triage Notes

- correlate `dead_letters.payload_json` with `scheduled_task_runs.error_text`
- confirm scheduler block reasons via `/v1/scheduler/status`
- confirm clock and timezone status via `/v1/time/status`
