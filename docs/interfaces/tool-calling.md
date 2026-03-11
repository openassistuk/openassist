# Tool Calling Interface

Source of truth:

- `packages/core-types/src/common.ts`
- `packages/core-types/src/provider.ts`
- `packages/core-runtime/src/tool-registry.ts`
- `packages/core-runtime/src/tool-router.ts`

## Purpose

V1.4 adds a chat-driven autonomous tool loop:

1. provider returns tool calls
2. runtime executes tools
3. tool results are fed back to provider
4. provider returns final assistant output for channel delivery

Each provider turn also carries a bounded runtime self-knowledge system message so the model knows what OpenAssist is, which host/runtime boundary applies to the current session, which tools are configured, which tools are callable, which local docs define its behavior, which capability domains are currently available, and which kinds of self-maintenance or controlled growth are safe or blocked.

## Core Types

`ToolCall`:

- `id`
- `name`
- `argumentsJson`

`ToolResultMessage`:

- `toolCallId`
- `name`
- `content`
- `isError`

`NormalizedMessage` extensions:

- `toolCallId?`
- `toolName?`

`ChatResponse` extension:

- `toolCalls?: ToolCall[]`

## Runtime Autonomy Gate

Autonomous tool execution is enabled only when the effective sender access for that chat turn is `full-root`.

- `restricted` and `operator`: provider receives no tool schemas
- `full-root`: provider receives runtime tool schema list and may issue tool calls
- `channel.send` is the runtime-owned delivery tool for same-chat artifact replies and bounded targeted operator notifications
- same-chat file replies require a `full-root` session plus truthful outbound-file support on the active channel
- `channel.send mode="notify"` additionally requires an approved operator sender and a recipient listed in `channels[*].settings.operatorUserIds`; Discord also requires the same recipient in `allowedDmUserIds`
- Linux systemd service hardening can still narrow the live host-write boundary even in `full-root`; `/status` and `openassist tools status` report that service boundary separately
- if a provider still returns tool calls while schemas are absent, runtime ignores those calls and returns a safe non-executing assistant response
- if a provider returns a tool call that was not advertised for the current session, runtime blocks and audits that call instead of executing it
- if provider/auth/runtime errors occur during chat, runtime emits a sanitized operational diagnostic message to channel instead of dropping the request

Canonical session ID format:

- `<channelId>:<conversationKey>`
- example: `telegram-main:ops-room`

Access resolution order:

1. sender override for this chat
2. session override for the whole chat
3. configured approved-operator default for this sender on this channel
4. `runtime.defaultPolicyProfile`

Provider-independent chat command:

- `/start` and `/help` return the runtime-owned welcome and truthful capability primer for the current session
- `/capabilities` returns the live capability-domain inventory for the current session
- `/grow` returns managed growth policy, asset inventory, and safe next actions
- `/status` returns operational diagnostics without using the provider
- `/profile` returns or updates the global assistant identity without using the provider
- `/access` shows the current sender's access, source, and whether chat-side changes are allowed
- `/access full` sets `full-root` for that sender in the current chat only
- `/access standard` sets `operator` for that sender in the current chat only

## Tool Schema Registry (V1.4)

Current runtime-exposed tool names:

- `exec.run`
- `fs.read`
- `fs.write`
- `fs.delete`
- `pkg.install` (omitted from schema list when disabled in config)
- `web.search`
- `web.fetch`
- `web.run`

`web.*` schemas are exposed only when both are true:

- effective access for the current sender/chat turn is `full-root`
- `tools.web.enabled=true`

`GET /v1/tools/status` and `openassist tools status` now report both configured tool families and currently callable tools, plus native web backend mode, service manager, configured and effective Linux systemd filesystem access, and an awareness summary. Shared-chat lookups can include `senderId` so operator output matches the same actor-specific access boundary the runtime uses.

## Runtime Awareness Contract

Runtime persists a normalized awareness snapshot in the existing `session_bootstrap.systemProfile` payload and refreshes it whenever effective access, runtime tool enablement, or other key runtime state changes. `session_bootstrap` is the last-seen chat snapshot, not a permanent per-actor truth store.

The awareness snapshot includes:

- software identity (`OpenAssist`, local-first machine-assistant role)
- host summary (platform, release, arch, hostname, Node version, workspace root when known)
- runtime/session state (session ID, provider IDs, channel IDs, timezone, runtime modules)
- policy/autonomy state (effective profile, access source, callable tools, configured tools, negative capability text)
- native web state (`enabled`, `searchMode`, `searchStatus`, callable `web.*` tools)
- capability state for the current session (`canInspectLocalFiles`, `canRunLocalCommands`, `canEditConfig`, `canEditDocs`, `canEditCode`, `canControlService`, native web availability, blocked reasons)
- capability domains derived from the live session boundary (system tasks, files/docs, supported attachments, web work, automation, lifecycle help, controlled growth)
- curated local doc references (`README.md`, operations/security/interface docs, `openassist.toml`) with short purpose and when-to-use text
- maintenance/install context (repo-backed install status, install dir, config path, env path, tracked ref, last known good commit when known, service manager, configured and effective Linux systemd filesystem access, protected paths, protected surfaces, preferred lifecycle commands, safe-maintenance rules)
- growth context (`extensions-first` default mode, whether growth actions are available now, installed skill/helper counts, growth directories, update-safety note)

Chat-visible `/status` keeps the same high-level awareness boundary for every sender, including the current service boundary, but full config/env/install paths are reserved for approved operators in chat. Unapproved senders should still receive the plain-language lifecycle summary plus guidance to use host-side commands such as `openassist doctor`.

Self-maintenance contract:

- `restricted` and `operator` sessions stay advisory-only for repo/config/docs maintenance
- only `full-root` sessions with callable tools may make bounded local config/docs/code changes
- updater-owned or generated paths remain protected and should be changed through lifecycle commands instead of ad-hoc edits
- durable growth defaults to managed skills and helper tools under runtime-owned directories; direct repo edits remain advanced and less update-safe

## Tool Loop Behavior

Loop defaults:

- max tool rounds per inbound turn: `8`
- deterministic sequential execution per provider turn

Per round:

1. runtime calls provider with current conversation and tools
2. if no `toolCalls`, loop exits and output is sent to channel
3. if `toolCalls` exist, runtime executes each call through `RuntimeToolRouter`
4. runtime appends assistant tool-call and tool-result messages and repeats

Before each provider turn, runtime reconciles tool context:

- orphan assistant tool-call messages (without matching tool-result messages) are removed
- orphan tool-result messages (without matching prior assistant tool calls) are removed

This protects long-lived sessions from provider hard-failures caused by mismatched historical tool-call context.

If max rounds is exceeded, runtime returns safe operator-visible error text and stops looping.

## Durability and Audit

Tool invocation audit table:

- `tool_invocations`

Fields include:

- session/conversation identity
- tool call ID and tool name
- actor identity
- request/result payload JSON (secret-redacted before persistence)
- status (`running|succeeded|failed|blocked`)
- error text
- start/finish timestamps and duration

Redaction contract:

- runtime redacts secret-like keys and token-like values before writing request/result payloads
- storage layer applies defense-in-depth redaction on write and read paths
- operator-facing retrieval (`/v1/tools/invocations`, `openassist tools invocations`) returns redacted payload content while preserving status metadata

Runtime audit event types:

- `tool.call.start`
- `tool.call.finish`
- `tool.call.blocked`

## API and CLI Surfaces

Daemon endpoints:

- `GET /v1/tools/status`
- `GET /v1/tools/invocations?sessionId=<id>&limit=<n>`

CLI commands:

- `openassist tools status [--session <channelId>:<conversationKey>] [--sender-id <id>]`
- `openassist tools invocations [--session <channelId>:<conversationKey>] [--limit <n>]`
- `openassist skills list [--json]`
- `openassist skills install --path <dir>`
- `openassist growth status [--json] [--session <channelId>:<conversationKey>] [--sender-id <id>]`
- `openassist growth helper add --name <id> --root <path> --installer <kind> --summary <text>`

## Guardrails

`exec.run` guardrails:

- mode: `minimal|off|strict`
- configurable `extraBlockedPatterns`
- blocked commands return structured error (not silent drop)

`pkg.install`:

- policy action: `pkg.install`
- manager detection + optional manager pin
- optional non-interactive elevation via `sudo -n` on Unix

`web.search` / `web.fetch` / `web.run`:

- policy actions: `web.search`, `web.fetch`, `web.run`
- exposed only in `full-root`
- HTTP-first only (`http` and `https`)
- redirect count, response bytes, result counts, and pages-per-run are bounded
- no browser automation and no JavaScript page execution in this release
