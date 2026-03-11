# E2E Autonomy Validation

Use this runbook to validate full chat-driven autonomous tool behavior end-to-end.

This runbook assumes you already completed quickstart or wizard setup and understand the difference between:

- `Standard mode (recommended)`
- `Full access for approved operators`

`full-root` in this document means OpenAssist's highest tool profile. It does not grant Unix root by itself, and on Linux it still does not remove the daemon's OpenAssist-added systemd hardening unless the service is explicitly configured for unrestricted filesystem access.

## Goal

Prove this complete path:

1. inbound channel message reaches runtime
2. provider issues tool calls
3. runtime executes tools with policy gating and audit persistence
4. provider receives tool results and returns final assistant text
5. channel receives final user-visible output

## Prerequisites

- OpenAssist installed and running
- one provider configured and authenticated
- one channel configured and healthy
- either:
  - an approved operator account on a channel configured for `Full access for approved operators`, or
  - permission to set `full-root` with `openassist policy-set`

Optional for `pkg.install` system-install test:

- Unix host with passwordless `sudo -n` configured for daemon user
- if OpenAssist runs under Linux systemd, `[service].systemdFilesystemAccess` must be set to `"unrestricted"` and the service must be reinstalled so the daemon is not still sandboxed

## Session Preparation

Identify the target chat and sender:

- send `/status` in the target chat
- copy the `session ID` and `sender ID` shown there
- canonical session ID format: `<channelId>:<conversationKey>`
- example session ID: `telegram-main:ops-room`
- example sender ID: `123456789`

Choose one elevation path:

1. For a shared chat where only one approved operator should run autonomy, use a sender-scoped override:

```bash
openassist policy-set --session telegram-main:ops-room --sender-id 123456789 --profile full-root
openassist policy-get --session telegram-main:ops-room --sender-id 123456789
openassist policy-get --session telegram-main:ops-room --sender-id 123456789 --json
openassist tools status --session telegram-main:ops-room --sender-id 123456789
```

2. For a dedicated test chat where the whole room can be treated as elevated, use a session-wide override:

```bash
openassist policy-set --session telegram-main:ops-room --profile full-root
openassist policy-get --session telegram-main:ops-room
openassist policy-get --session telegram-main:ops-room --json
openassist tools status --session telegram-main:ops-room
```

Expected:

- policy output shows `full-root`
- policy output shows whether the source is a sender override or session override
- tools status lists enabled tools (`exec.run`, `fs.*`, optional `pkg.install`, and `web.*` when `tools.web.enabled=true`)
- tools status includes awareness summary and native web backend mode/status

Optional host-side growth check before chat-led growth tests:

```bash
openassist skills list
openassist growth status --session telegram-main:ops-room --sender-id 123456789
```

## Scenario 0: Awareness Boundary Verification

1. send `/start`, `/help`, and `/capabilities` in the target chat before enabling `full-root`
2. confirm the replies describe OpenAssist as the machine assistant for this host, but keep autonomous host actions and web tooling limited in the current session
3. send `/grow`
4. confirm it describes the `extensions-first` growth policy without claiming that growth actions are available yet
5. send `/status`
6. confirm the reply says autonomous tools are disabled and no tools are callable
7. set the session or sender override to `full-root`
8. send `/status` and `/grow` again

Expected:

- `/start` and `/help` stay runtime-owned and do not depend on provider availability
- `/capabilities` lists capability domains that match the current provider, channel, and access state
- `/grow` reports managed skill/helper counts and only exposes growth directory paths to approved operators
- `/status` reflects the current effective access for that sender
- `/status` shows the current sender ID and session ID
- `/status` identifies OpenAssist, names the local docs that define lifecycle and security behavior, and only reveals full config/env/install filesystem paths for approved operators
- before elevation, callable tools are `none`
- after elevation, `/status` lists the same callable tools exposed through `openassist tools status`
- after elevation, `/status` makes it explicit whether bounded local self-maintenance is available or still blocked
- after elevation, `/grow` shows whether managed growth actions are available now and points operators to `openassist skills install --path ...` and `openassist growth helper add ...`
- native web state is visible as `available`, `fallback`, `unavailable`, or `disabled`

## Scenario 1: File Action Through Chat

1. send chat message asking assistant to create a file and confirm content
2. wait for assistant final reply in channel
3. verify filesystem result on host
4. inspect invocation audit

Commands:

```bash
openassist tools invocations --session telegram-main:ops-room --limit 20
```

Expected:

- at least one `fs.write` invocation
- status `succeeded`
- request/result payloads are redacted for secret-like fields
- assistant final message confirms completion

## Scenario 2: Policy Gate Verification

1. switch profile to `operator`
2. repeat same tool-demanding chat prompt

```bash
openassist policy-set --session telegram-main:ops-room --profile operator
openassist tools status --session telegram-main:ops-room
```

Expected:

- tools status for session shows no autonomous enabled tools
- `/status` reports no callable tools and explains that native web tools are not callable in the current session
- assistant does not auto-execute host actions
- if provider attempts to return tool calls anyway, runtime ignores them and returns a non-executing response
- no new `tool_invocations` rows for that session

## Scenario 3: Guardrail Block Verification

1. set access back to `full-root`
2. send prompt attempting clearly destructive command
3. inspect tool invocation rows

Expected:

- invocation status `blocked`
- error text indicates guardrail block
- final assistant response does not leak internal traces

## Scenario 4: Native Web Research Path

1. set access back to `full-root`
2. send a prompt that requires current web data, for example:
   - "Search the web for the latest OpenAI API docs on tool calling and summarize the cited sources."
3. inspect tool invocation output

Expected:

- invocation list includes `web.search` and either `web.fetch` or `web.run`
- tool output shows the active backend (`brave-api`, `duckduckgo-html`, or structured unavailable guidance)
- fetched source material includes citations and final URLs
- runtime does not attempt browser automation or non-HTTP schemes

## Scenario 5: Package Install Path

1. send prompt requesting package install via autonomy
2. inspect tool invocation output

Expected:

- invocation includes `pkg.install`
- on Unix elevated installs: command shows `sudo -n ...` when required
- if sudo is unavailable, failure is explicit and actionable (not silent)

## Scenario 6: Restart Resilience During Tool Activity

1. start repeated chat requests that trigger tools
2. restart service mid-activity
3. send new request after restart

Expected:

- daemon returns healthy after restart
- new autonomous tool requests still work
- no duplicate side effects for the same inbound idempotency key

## API-Level Validation

Use daemon endpoints directly when needed:

```bash
curl -fsS "http://127.0.0.1:3344/v1/tools/status?sessionId=telegram-main%3Aops-room&senderId=123456789"
curl -fsS "http://127.0.0.1:3344/v1/tools/invocations?sessionId=telegram-main%3Aops-room&limit=20"
```

## Evidence Checklist

- channel transcripts for each scenario
- `tools status` snapshots before/after access changes
- `/status` transcripts showing awareness boundary before and after elevation, including sender ID and session ID
- `tools invocations` output showing succeeded/failed/blocked states
- `tools invocations` output confirms redacted request/result payloads for secret-like values
- `tools invocations` output confirms web backend and citation/final-URL metadata when `web.*` tools are used
- host-side evidence for file/package operations
- service logs across restart scenario
