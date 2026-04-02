# Runtime and Modules

Primary orchestrator: `OpenAssistRuntime` in `packages/core-runtime/src/runtime.ts`.

## Runtime Composition

Runtime is built from:

- parsed `RuntimeConfig`
- durable dependencies (`OpenAssistDatabase`, logger)
- loaded provider and channel adapter instances

Current first-class provider routes in runtime config are:

- `openai` for OpenAI API-key auth
- `codex` for the separate OpenAI account-login route
- `anthropic`
- `azure-foundry` for Azure resource-style `/openai/v1/` endpoints with API-key or Entra host auth
- `openai-compatible`

Runtime-owned components:

- `ContextPlanner`
- rolling session-memory compaction manager (`session_memory`)
- durable actor-memory store/recall manager (`permanent_memories`)
- bounded post-turn memory extraction sidecar using the active provider/model
- layered runtime-awareness builder/system-message generator
- curated runtime self-knowledge manifest (local docs, install surfaces, safe-maintenance rules)
- live capability-domain builder and managed-growth status builder
- `DatabasePolicyEngine`
- `ExecTool`, `FsTool`, `PackageInstallTool`, and `WebTool`
- `RuntimeToolRouter` and runtime tool schema registry
- `FileSkillRuntime`
- managed capability registry sync (`skills` + `helper-tools`)
- `RecoveryWorker`
- `ClockHealthMonitor`
- `SchedulerWorker`
- global assistant profile memory reader/writer (`system_settings` key `assistant.globalProfile`)
- session bootstrap host-context writer/reader (`session_bootstrap` table)

## Startup Sequence

`start()` executes in this order:

1. load persisted OAuth account state
2. ensure global assistant identity/profile state
3. sync installed skills into the durable managed-capability registry
4. run immediate clock health check
5. enforce startup fail-fast only when `ntpPolicy=hard-fail` and health is `unhealthy`
6. start recurring clock monitor
7. launch enabled channel adapters asynchronously (non-blocking)
8. start durable recovery worker
9. start scheduler worker if enabled and timezone confirmation requirements are met

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
- `getToolsStatus(sessionId?, senderId?)`
- `getMemoryStatus(sessionId?, senderId?)`
- `listToolInvocations(sessionId?, limit?)`
- `listInstalledSkills()`
- `installSkillFromPath(path)`
- `getGrowthStatus(sessionId?, senderId?)`
- `registerManagedHelper(input)`

Daemon HTTP endpoints map directly to these methods in `apps/openassistd/src/index.ts`.

`getToolsStatus()` now returns:

- currently callable tool names for the session
- configured tool families even when they are not callable
- package-tool status
- native web-tool status (`enabled`, `searchMode`, `searchStatus`, limits, Brave API availability)
- a compact awareness summary string

## Chat Tool Loop

`handleInbound()` now runs a bounded multi-round provider loop:

1. persist inbound event/message (idempotent)
2. resolve effective access for the current sender/chat turn
3. include tool schemas only for `full-root`
4. call provider
5. if tool calls exist:
   - execute each call sequentially through `RuntimeToolRouter`
   - persist assistant tool-call and tool-result messages
   - persist `tool_invocations` lifecycle rows
   - repeat (max rounds: 8)
6. if no tool calls, sanitize final text and send outbound
7. if provider/auth/runtime failure occurs, send sanitized operational diagnostic reply to channel (no silent drop)
8. if user sends `/start` or `/help`, return runtime-owned welcome and capability primer without provider dependency
9. if user sends `/capabilities`, return the live capability inventory without provider dependency
10. if user sends `/grow`, return managed growth policy and asset status without provider dependency
11. if user sends `/memory`, return rolling session summary plus actor-scoped durable-memory visibility without provider dependency
12. if user sends `/status`, return runtime diagnostics without provider dependency
13. if user sends `/profile`, return persisted global assistant profile memory without provider dependency; updates require explicit force (`/profile force=true; ...`)
14. first-contact bootstrap prompt can be emitted for `/new` when enabled by config (`runtime.assistant.promptOnFirstContact=true`)
15. quickstart-created installs usually disable that first-contact prompt because the main assistant identity was already captured during onboarding

If max rounds is exceeded, runtime returns a safe operator-visible error message instead of unbounded looping.

Context planner input now includes a second runtime system message containing:

- global assistant profile memory (name/persona/preferences)
- OpenAssist core identity statement
- per-session layered runtime self-knowledge snapshot:
  - host/runtime/profile/tool/web state
  - capability domains for the current live session
  - local config/env/install/update facts when known
  - curated local doc references for lifecycle, security, interfaces, and runtime behavior
  - managed growth mode, asset counts, directories, and update-safety note
  - explicit safe-maintenance rules and protected lifecycle paths
  - rolling session summary and recalled actor-scoped durable memories when available

Global assistant profile memory is persisted once in `system_settings`; session bootstrap host context is persisted per chat and reused deterministically for future turns. The runtime self-knowledge snapshot is stored inside the existing `session_bootstrap.systemProfile` payload as the last-seen chat snapshot and refreshed when assistant identity, install context, effective access, or runtime tool state changes. Rolling session summaries are persisted in `session_memory`, and actor-scoped durable memories are persisted in `permanent_memories`.

After a successful visible chat reply, runtime may run one bounded sidecar provider pass over the next compactable 8-message transcript block. That pass updates the rolling session summary and may propose conservative permanent-memory candidates. Sidecar failures are logged and dropped without failing the main chat turn.

## Config Apply Behavior

Config generation methods track candidate/apply/rollback metadata.

Current behavior:

- runtime swaps active config in-memory on successful apply
- scheduler/time workers refresh against new config
- tool implementations and router bindings rebuild against new config, including `tools.web`
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
- `skills *`: managed skill install and listing against the runtime-owned skills directory.
- `growth *`: managed helper registration and growth-policy inspection.
- `memory status`: host-side inspection of rolling session summaries and actor-scoped durable memory.
