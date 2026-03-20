# Chaos and Soak

This document defines reliability stress scenarios for OpenAssist runtime, scheduler, and lifecycle controls.

Use `docs/operations/common-troubleshooting.md` for the operator-facing repair commands that correspond to the lifecycle failures described here. This file is for deeper reliability validation, not first-line beginner recovery.

## Goal

Prove that restart safety, scheduling correctness, and upgrade rollback behavior remain correct under adverse conditions.

Supplemental workflow context:

- `.github/workflows/service-smoke.yml` is the lighter dry-run lifecycle smoke on hosted runners
- `.github/workflows/lifecycle-e2e-smoke.yml` is the stronger bootstrap/home-state/doctor/upgrade smoke on hosted runners
- neither workflow replaces the deeper scenario checks in this document

## Scenario A: Restart During Scheduled Execution

1. configure an interval task
2. trigger execution and terminate daemon during pending/running state
3. restart daemon/service

Expected:

- no duplicate execution for the same `taskId + scheduledFor`
- retries remain bounded and durable

## Scenario B: Misfire Policy Verification

For each policy (`catch-up-once`, `skip`, `backfill`):

1. stop daemon across multiple due windows
2. restart daemon
3. inspect `scheduled_task_runs` and cursor state

Expected:

- behavior exactly matches selected policy

## Scenario C: Timezone Confirmation Gate

1. set `requireTimezoneConfirmation=true`
2. start daemon without confirmed timezone
3. inspect scheduler status
4. confirm timezone via CLI/API

Expected:

- scheduler blocked before confirmation
- scheduler transitions to running after confirmation

## Scenario D: Clock Source Instability

1. set policy `warn-degrade`
2. simulate failing OS clock checks and HTTP date sources
3. inspect time status and module health

Expected:

- daemon remains available
- time module reports degraded/unhealthy with actionable diagnostics

## Scenario E: Scheduled Output Push During Channel Failure

1. configure task output push to a channel
2. break channel connectivity/auth
3. observe retries and run outcomes
4. restore channel

Expected:

- bounded retries
- persisted run/error history
- recoverable send behavior

## Scenario F: Upgrade Failure Rollback

1. capture current commit
2. induce upgrade failure (for example: temporary build break)
3. execute `openassist upgrade`
4. inspect resulting commit/service health

Expected:

- automatic rollback to prior good commit
- daemon healthy after rollback
- non-zero upgrade exit on failure path

## Scenario G: Strict Onboarding Validation Gate

1. run `openassist setup quickstart` with missing provider API key and unresolved channel env refs
2. verify quickstart blocks save by default
3. intentionally paste invalid values into numeric/timezone fields and verify re-prompt loops (no silent coercion)
4. re-run with corrected inputs and verify successful save
5. optionally run with `--allow-incomplete` and verify explicit warning/confirmation path

Expected:

- blocking behavior on invalid/incomplete setup by default
- prompt-level validation rejects malformed numeric/timezone/identifier/bind-address input until corrected
- explicit override path only when requested
- resulting config/env artifacts remain parseable

## Scenario H: Autonomous Tool Policy Gate

1. run chat prompt requiring tool action with effective access `operator`
2. verify no autonomous tool execution
3. switch effective access to `full-root`
4. run same prompt and verify tool execution occurs

Expected:

- deterministic autonomy gate by profile
- no hidden escalation path from operator to full-root

## Scenario I: Tool Guardrail and Audit Integrity

1. trigger clearly destructive command pattern via chat
2. inspect `tool_invocations` and log events
3. verify final assistant output remains sanitized

Expected:

- invocation status `blocked`
- `tool.call.blocked` audit event present
- no internal trace leakage in channel output

## Scenario J: Installer and Setup Recovery Paths

1. run bootstrap on host missing `node >= 22` and force initial prereq failure
2. verify troubleshooting commands are printed and interactive retry path is offered
3. run `openassist setup wizard`, induce post-save health failure, and exercise retry/skip/abort choices
4. run `openassist setup quickstart` with service check failure:
  - strict mode: verify retry/abort choices only
  - `--allow-incomplete`: verify skip choice is available

Expected:

- no abrupt hard-exit on recoverable installer/setup check failures
- operator receives actionable remediation commands
- strict quickstart posture is preserved while explicit overrides remain opt-in

## Scenario K: In-Channel Diagnostics Without Provider Dependency

1. configure channel connectivity, break provider auth (unset API key / invalid token)
2. send normal chat message
3. verify bot returns operational diagnostic reply
4. send `/status` in channel
5. verify runtime diagnostics reply is returned without provider call

Expected:

- no silent chat failure when provider/auth path is broken
- `/status` returns local runtime/time/scheduler/channel profile diagnostics
- replies remain sanitized and do not leak secrets

## Scenario L: Non-Blocking Channel Startup

1. configure a channel adapter to hang/fail during startup (for example invalid token or forced network block)
2. restart daemon/service
3. inspect daemon health and channel health separately
4. inspect runtime/module state transitions

Expected:

- daemon startup and `/v1/health` remain available
- affected connector is marked degraded/unhealthy without blocking other runtime modules
- operator can triage via `openassist channel status` while service stays controllable

## Scenario M: Global Profile Lock + Persistence

Quickstart-created installs now disable the first-contact identity reminder by default because onboarding already captured the main assistant identity. Re-enable the reminder in `openassist setup wizard` before running this scenario, or set `runtime.assistant.promptOnFirstContact=true` in config explicitly.

1. start a new channel conversation and send `/start`
2. verify first-contact profile prompt is emitted when `runtime.assistant.promptOnFirstContact=true`
3. send `/profile name=<name>; persona=<style>; prefs=<preferences>` and verify lock-guard block
4. send `/profile force=true; name=<name>; persona=<style>; prefs=<preferences>` and verify update
5. restart daemon/service
6. send `/profile` again from a different conversation/session

Expected:

- first-boot lock-in guard blocks accidental non-force updates
- forced profile update persists globally across restart and across sessions
- returned `/profile` output reflects updated name/persona/preferences
- provider-independent profile command works even when provider auth is unavailable

## Evidence to Capture

- command transcripts
- `/v1/health`, `/v1/time/status`, `/v1/scheduler/status` snapshots
- module health data
- `scheduled_task_runs` and scheduler idempotency rows
- `tool_invocations` rows and `tool.call.*` log events
- `system_settings` rows (`assistant.globalProfile`, `assistant.globalProfileLock`) and `session_bootstrap` rows for profile-memory persistence checks
- service logs during failure and recovery windows

## Exit Criteria for Release Candidate

- all applicable scenarios pass on Linux and macOS supported operator paths
- hosted Linux/macOS lifecycle smoke remains stable
- residual risks documented in security/testing docs
- ExecPlan retrospective updated with evidence
