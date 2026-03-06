# Restart and Recovery

OpenAssist is designed so restart and reboot events do not silently lose durable intent.

The lifecycle commands in this repo now rely on the same persistent install and runtime state:

- bootstrap writes install state
- `openassist doctor` reads it to report readiness
- `openassist service install` refreshes service metadata without discarding repo data
- `openassist upgrade` updates the same record with the current known-good commit

## Durable Runtime State

OpenAssist persists the state needed for safe recovery:

- durable jobs and attempts
- idempotency keys
- scheduler cursors and run history
- tool invocation audit rows
- module and clock health records
- session bootstrap state used for runtime grounding

This is why restart safety is based on durable state, not in-memory retries.

## Startup Recovery Sequence

At daemon startup, OpenAssist restores runtime state and then brings services online in a restart-safe order.

High-level sequence:

1. load persisted runtime and auth state
2. verify security and path posture
3. run clock health checks
4. start channel adapters
5. start recovery and replay workers
6. start scheduler when the install is eligible to do so

Channel startup remains non-blocking for daemon health. A degraded connector can fail independently without taking the whole daemon health surface down.

## Setup and Service Recovery

Quickstart and wizard are intentionally recovery-first.

Quickstart:

- strict mode offers retry or abort when service checks fail
- `--allow-incomplete` adds an explicit skip path
- wildcard bind addresses still probe through loopback URLs

Wizard:

- saves first, then runs post-save restart and health checks by default
- offers retry, skip, or abort on post-save failure
- can skip post-save checks only with `--skip-post-checks`

## Upgrade Recovery

`openassist upgrade` keeps recovery explicit:

- dry-run prints the full plan before mutation
- live upgrade records the rollback target
- live-upgrade failures after rollback-target capture trigger automatic rollback
- the command prints the next validation commands after both success and rollback

## Operator Verification

Lifecycle verification commands:

```bash
openassist doctor
openassist service status
openassist service health
openassist time status
openassist scheduler status
```

Chat-side diagnostics:

- send `/status` for local diagnostics without provider dependency
- `/status` shows the current sender ID, canonical session ID, effective access, and access source
- approved operators can use `/access full` or `/access standard` for their own current chat only
- use `/profile` to inspect persisted assistant profile state

## Incident Notes

Use `openassist doctor` when you are unsure whether the install is still coherent enough for setup changes or upgrade.

Use `openassist upgrade --dry-run` when you want the current repo, ref, and rollback plan without mutating anything.

Re-run bootstrap instead of forcing an in-place recovery when:

- the install is not repo-backed anymore
- wrapper commands are broken beyond simple PATH repair
- the checkout is damaged or untrusted
- build output is missing under `apps/openassist-cli/dist` or `apps/openassistd/dist`
- you want to move a detached install back onto an explicit branch or tag through the installer flow
