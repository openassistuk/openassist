# E2E Autonomy Validation

Use this runbook to validate full chat-driven autonomous tool behavior end-to-end.

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
- session profile explicitly set to `full-root` for autonomy tests

Optional for `pkg.install` system-install test:

- Unix host with passwordless `sudo -n` configured for daemon user

## Session Preparation

Identify target session:

- session ID format: `<channel>:<conversationKey>`
- example: `telegram:ops-room`

Set profile:

```bash
openassist policy-set --session telegram:ops-room --profile full-root
openassist policy-get --session telegram:ops-room
openassist tools status --session telegram:ops-room
```

Expected:

- policy shows `full-root`
- tools status lists enabled tools (`exec.run`, `fs.*`, optional `pkg.install`, and `web.*` when `tools.web.enabled=true`)
- tools status includes awareness summary and native web backend mode/status

## Scenario 0: Awareness Boundary Verification

1. send `/status` in the target chat before enabling `full-root`
2. confirm the reply says autonomous tools are disabled and no tools are callable
3. set the session profile to `full-root`
4. send `/status` again

Expected:

- `/status` reflects the current session profile
- before elevation, callable tools are `none`
- after elevation, `/status` lists the same callable tools exposed through `openassist tools status`
- native web state is visible as `available`, `fallback`, `unavailable`, or `disabled`

## Scenario 1: File Action Through Chat

1. send chat message asking assistant to create a file and confirm content
2. wait for assistant final reply in channel
3. verify filesystem result on host
4. inspect invocation audit

Commands:

```bash
openassist tools invocations --session telegram:ops-room --limit 20
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
openassist policy-set --session telegram:ops-room --profile operator
openassist tools status --session telegram:ops-room
```

Expected:

- tools status for session shows no autonomous enabled tools
- `/status` reports no callable tools and explains that native web tools are not callable in the current session
- assistant does not auto-execute host actions
- if provider attempts to return tool calls anyway, runtime ignores them and returns a non-executing response
- no new `tool_invocations` rows for that session

## Scenario 3: Guardrail Block Verification

1. set profile back to `full-root`
2. send prompt attempting clearly destructive command
3. inspect tool invocation rows

Expected:

- invocation status `blocked`
- error text indicates guardrail block
- final assistant response does not leak internal traces

## Scenario 4: Native Web Research Path

1. set profile back to `full-root`
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
curl -fsS "http://127.0.0.1:3344/v1/tools/status?sessionId=telegram%3Aops-room"
curl -fsS "http://127.0.0.1:3344/v1/tools/invocations?sessionId=telegram%3Aops-room&limit=20"
```

## Evidence Checklist

- channel transcripts for each scenario
- `tools status` snapshots before/after profile changes
- `/status` transcripts showing awareness boundary before and after profile elevation
- `tools invocations` output showing succeeded/failed/blocked states
- `tools invocations` output confirms redacted request/result payloads for secret-like values
- `tools invocations` output confirms web backend and citation/final-URL metadata when `web.*` tools are used
- host-side evidence for file/package operations
- service logs across restart scenario
