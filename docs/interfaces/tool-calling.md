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

Autonomous tool execution is enabled only when the session policy profile is `full-root`.

- `restricted` and `operator`: provider receives no tool schemas
- `full-root`: provider receives runtime tool schema list and may issue tool calls
- if a provider still returns tool calls while schemas are absent, runtime ignores those calls and returns a safe non-executing assistant response
- if provider/auth/runtime errors occur during chat, runtime emits a sanitized operational diagnostic message to channel instead of dropping the request

Session ID format for profile commands:

- `<channel>:<conversationKey>`
- example: `telegram:ops-room`

## Tool Schema Registry (V1.4)

Current runtime-exposed tool names:

- `exec.run`
- `fs.read`
- `fs.write`
- `fs.delete`
- `pkg.install` (omitted from schema list when disabled in config)

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

- `openassist tools status [--session <channel:conversationKey>]`
- `openassist tools invocations [--session <channel:conversationKey>] [--limit <n>]`

## Guardrails

`exec.run` guardrails:

- mode: `minimal|off|strict`
- configurable `extraBlockedPatterns`
- blocked commands return structured error (not silent drop)

`pkg.install`:

- policy action: `pkg.install`
- manager detection + optional manager pin
- optional non-interactive elevation via `sudo -n` on Unix
