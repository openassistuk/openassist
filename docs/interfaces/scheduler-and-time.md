# Scheduler and Time Interfaces

Source of truth:

- `packages/core-types/src/scheduler.ts`
- `packages/core-types/src/runtime.ts`

## Core Enums

- `ScheduleKind`: `cron | interval`
- `MisfirePolicy`: `catch-up-once | skip | backfill`
- `NtpPolicy`: `warn-degrade | hard-fail | off`

## Time Configuration

`TimeConfig` fields:

- `defaultTimezone?`
- `ntpPolicy`
- `ntpCheckIntervalSec`
- `ntpMaxSkewMs`
- `ntpHttpSources`
- `requireTimezoneConfirmation`

Timezone resolution order:

1. confirmed timezone from durable settings
2. configured `defaultTimezone`
3. system-detected timezone
4. fallback `UTC`

## Scheduler Configuration

`SchedulerConfig` fields:

- `enabled`
- `tickIntervalMs`
- `heartbeatIntervalSec`
- `defaultMisfirePolicy`
- `tasks`

Task model (`ScheduledTaskConfig`):

- task ID and enabled flag
- schedule type and parameters:
  - `cron` required for `scheduleKind=cron`
  - `intervalSec` required for `scheduleKind=interval`
- optional task timezone override
- optional per-task misfire policy override
- action block:
  - prompt action (`type=prompt`)
  - skill action (`type=skill`)
- optional output block for channel push

## Output Template Variables

When task output push is enabled, template supports:

- `{{result}}`
- `{{taskId}}`
- `{{scheduledFor}}`

## Time Status Contract

`GET /v1/time/status` returns:

- `timezone`
- `timezoneConfirmed`
- `clockHealth` (`healthy | degraded | unhealthy`)
- last check timestamp/source/offset
- active NTP policy

## Scheduler Status Contract

`GET /v1/scheduler/status` returns worker-level fields including:

- running state
- block reason (if blocked)
- last tick and heartbeat timestamps
- enabled flag and task counts
- effective timezone

`GET /v1/scheduler/tasks` returns task-level summaries including next run and latest persisted run result.

`POST /v1/scheduler/tasks/:id/run` enqueues immediate run through the same durable execution path used for timed runs.

## Runtime and CLI Surfaces

Runtime methods expose scheduler/time state and control; daemon routes expose HTTP endpoints; CLI exposes:

- `openassist time status`
- `openassist time confirm --timezone <Country/City>` (DST-aware IANA zone, for example `Europe/London`)
- `openassist scheduler status`
- `openassist scheduler tasks`
- `openassist scheduler run --id <task-id>`

## Interaction with Chat Tool Loop

Scheduler prompt actions currently call provider chat with `tools: []` intentionally.

- scheduler automation remains deterministic prompt/skill execution
- autonomous chat tool-calling is handled by inbound channel sessions under policy control
- scheduled shell-style autonomy is not a first-class scheduler action in V1.4
