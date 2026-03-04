# Runtime and Modules

Primary orchestrator: `OpenAssistRuntime` in `packages/core-runtime/src/runtime.ts`.

## Runtime Composition

Runtime is built from:

- parsed `RuntimeConfig`
- durable dependencies (`OpenAssistDatabase`, logger)
- loaded provider and channel adapter instances

Runtime-owned components:

- `ContextPlanner`
- `DatabasePolicyEngine`
- `ExecTool`, `FsTool`, and `PackageInstallTool`
- `RuntimeToolRouter` and runtime tool schema registry
- `FileSkillRuntime`
- `RecoveryWorker`
- `ClockHealthMonitor`
- `SchedulerWorker`
- global assistant profile memory reader/writer (`system_settings` key `assistant.globalProfile`)
- session bootstrap host-context writer/reader (`session_bootstrap` table)

## Startup Sequence

`start()` executes in this order:

1. load persisted OAuth account state
2. run immediate clock health check
3. enforce startup fail-fast only when `ntpPolicy=hard-fail` and health is `unhealthy`
4. start recurring clock monitor
5. launch enabled channel adapters asynchronously (non-blocking)
6. start durable recovery worker
7. start scheduler worker if enabled and timezone confirmation requirements are met

During channel config load, string settings in `env:VAR_NAME` form are resolved from process environment.

Channel startup is application-wide non-blocking: one connector can be degraded or still connecting without preventing daemon startup, `/v1/health`, or other modules from running.

## Clock Health Monitor

Implementation: `packages/core-runtime/src/clock-health.ts`.

Responsibilities:

- resolve effective timezone
- enforce timezone confirmation gate (when required)
- evaluate clock sync health using OS checks plus HTTP Date fallback
- persist checks to `clock_checks`
- update `module_health` for `time-sync`

NTP policy behavior:

- `off`: health marked healthy/disabled
- `warn-degrade`: daemon continues with degraded health
- `hard-fail`: startup fails when health is unhealthy

## Scheduler Worker

Implementation: `packages/core-runtime/src/scheduler.ts`.

Responsibilities:

- evaluate enabled task schedules on tick interval
- apply misfire policy (`catch-up-once`, `skip`, `backfill` with cap)
- maintain durable task cursor state
- enqueue durable execution jobs with scheduler idempotency keys
- publish heartbeat and worker status into `module_health`

## Recovery Handlers

Runtime registers durable handlers:

- `send_outbound`
- `scheduled_task_execute`

Tool calls execute inline inside inbound chat handling, but each invocation is durably audited in `tool_invocations`.

`scheduled_task_execute` path:

1. insert running row in `scheduled_task_runs`
2. execute action:
   - prompt action via provider adapter
   - skill action via skill runtime
3. persist success/failure
4. optionally send channel output and persist transport message ID

Failures are retried through durable queue policy and eventually moved to `dead_letters` when attempts are exhausted.

## Runtime Status Surfaces

Runtime methods consumed by daemon API:

- `getStatus()`
- `getTimeStatus()`
- `confirmTimezone(timezone)`
- `getSchedulerStatus()`
- `listSchedulerTasks()`
- `enqueueScheduledTaskNow(taskId)`
- `getToolsStatus(sessionId?)`
- `listToolInvocations(sessionId?, limit?)`

Daemon HTTP endpoints map directly to these methods in `apps/openassistd/src/index.ts`.

## Chat Tool Loop

`handleInbound()` now runs a bounded multi-round provider loop:

1. persist inbound event/message (idempotent)
2. resolve policy profile for session
3. include tool schemas only for `full-root`
4. call provider
5. if tool calls exist:
   - execute each call sequentially through `RuntimeToolRouter`
   - persist assistant tool-call and tool-result messages
   - persist `tool_invocations` lifecycle rows
   - repeat (max rounds: 8)
6. if no tool calls, sanitize final text and send outbound
7. if provider/auth/runtime failure occurs, send sanitized operational diagnostic reply to channel (no silent drop)
8. if user sends `/status`, return runtime diagnostics without provider dependency
9. if user sends `/profile`, return persisted global assistant profile memory without provider dependency; updates require explicit force (`/profile force=true; ...`)
10. first-contact bootstrap prompt can be emitted for `/start`/`/new` when enabled by config (`runtime.assistant.promptOnFirstContact=true`)

If max rounds is exceeded, runtime returns a safe operator-visible error message instead of unbounded looping.

Context planner input now includes a second runtime system message containing:

- global assistant profile memory (name/persona/preferences)
- OpenAssist core identity statement
- per-session host runtime profile snapshot (platform/arch/node/hostname)

Global assistant profile memory is persisted once in `system_settings`; session bootstrap host context is persisted per session and reused deterministically for future turns.

## Config Apply Behavior

Config generation methods track candidate/apply/rollback metadata.

Current behavior:

- runtime swaps active config in-memory on successful apply
- scheduler/time workers refresh against new config
- candidate failures are marked rolled back and active generation remains unchanged

## Current Runtime Limits

- single-daemon scheduler only
- no distributed leader election
- no first-class scheduled shell action
- no WebUI control plane

## Operator Lifecycle Surfaces

- `setup quickstart`: strict staged onboarding with validation gates and optional service/health execution.
- `setup wizard`: section-based configuration editor for post-onboarding maintenance.
- `service *`: managed runtime lifecycle operations (`install/start/stop/restart/status/logs`).
- `upgrade`: health-gated in-place update with rollback.
