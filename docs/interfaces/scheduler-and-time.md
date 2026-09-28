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

## Managed one-shot reminders

Managed reminders are separate from existing TOML cron/interval tasks; the TOML action types and schema are unchanged. SQLite tables `managed_one_shots` and `managed_one_shot_deliveries` are additive at database compatibility version 1. Older applications retain them without processing them. Builds advertise `managed-one-shots-v1`; managed rollback to an older build is blocked while tasks are pending, executing, ready or delivering.

Chat tools `scheduler.create`, `scheduler.list` and `scheduler.cancel` require an approved operator with effective `full-root` access. The runtime supplies actor, channel and conversation; tools cannot select another recipient. Listing and cancellation require the same actor and chat. Authorization and channel availability are checked again before execution and dispatch. The scheduler must be enabled and timezone confirmed before creation.

Creation accepts exactly one deadline form, plus a tagged action:

```json
{"delaySeconds":120,"action":{"type":"text","text":"OpenAssist scheduled delivery test"}}
```

```json
{"at":"2026-10-01T09:00:00+01:00","action":{"type":"prompt","prompt":"Write a brief encouraging message."}}
```

Relative time starts at persisted inbound `receivedAt`; CLI time starts at command receipt. Absolute timestamps require an offset or Z. New requests whose deadline has passed fail explicitly; countdowns never restart silently. A repeated request returns its existing durable ID even after that deadline. Identity, original deadline, timezone, action type, state and timing explanation are returned without echoing action content.

Saved text is dispatched without a model call. Prompt deadlines mark when generation begins; delivery follows generation. Prompts have `tools: []`, including no host, credential or scheduling tools. Do not use shell sleep, at, system cron or credential-reading delivery scripts as a substitute. Overdue saved work executes after restart with its original time and a delay notice.

Limits: 8000 characters per action, 32 active tasks per actor per channel across chats, 256 active tasks per installation, 50 entries per listing, eight concurrent tasks and at most eight task dispatches per tick. Generated output is bounded to 32000 characters. Generation has a 120-second timeout and at most three persisted attempts; transport attempts have a 30-second timeout. Confirmations are deadlines for best-effort execution, not hard real-time delivery guarantees.

States are pending, executing, ready, delivering, delivered, cancelled, failed and uncertain. Creation and deduplication commit atomically. Rendered prompt results persist before delivery; each part has a transport receipt. Known successful parts are never resent. An explicit rejection before acceptance can retry up to three times with persisted delay; a timeout, connection loss or crash during send becomes uncertain and is not automatically resent. Inspect the chat before explicitly rescheduling uncertain work.

Cancellation prevents unstarted work and remaining delivery parts. It reports generation or dispatch already in flight; an in-flight send cannot be retracted. Restart recovers interrupted generation using bounded attempts, but never regenerates an already saved result for delivery retries.

### Host interfaces

The local control API retains its existing trusted-host boundary. Host callers supply the configured channel, approved actor and conversation explicitly; the runtime still checks that actor's effective Full access. POST endpoints are `/v1/scheduler/create`, `/v1/scheduler/list`, and `/v1/scheduler/cancel`. Bodies contain `actorId`, `channelId`, `conversationKey`, a bounded `requestId`, optional original `receivedAt`, and `request` (the creation object above, an empty listing object, or `{"id":"reminder-..." }`). Reuse requestId when retrying a host creation request. GET `/v1/scheduler/tasks` includes up to 50 managed tasks alongside TOML tasks.

```bash
openassist scheduler create --actor 100000001 --channel telegram-main --conversation 100000001 --delay-seconds 120 --text "Reminder test" --request-id smoke-reminder
openassist scheduler create --actor 100000001 --channel telegram-main --conversation 100000001 --at "2026-10-01T09:00:00+01:00" --prompt "Write a brief greeting."
openassist scheduler list --actor 100000001 --channel telegram-main --conversation 100000001
openassist scheduler cancel --actor 100000001 --channel telegram-main --conversation 100000001 --id reminder-REPLACE_WITH_RETURNED_ID
```

### Recurring misfires and clock confirmation

For `skip`, timely due slots within `max(1000 ms, 2 × tickIntervalMs)` execute. Older slots are skipped and the cursor advances; a long outage does not require scanning every missed interval. Catch-up-once retains the latest due slot; backfill remains bounded to 100 slots per tick. Cron scheduling retains timezone/DST-aware UTC identities. Timezone confirmation immediately refreshes time-sync module health from the latest clock check, preserving degraded or unhealthy results.
