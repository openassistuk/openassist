# Provider Adapter Interface

Source of truth: `packages/core-types/src/provider.ts`.

Provider adapters convert normalized runtime chat requests into provider-specific API calls, including tool-call turns.

## Required Contract

Every adapter must implement:

- `id(): string`
- `capabilities(): ProviderCapabilities`
- `validateConfig(config: unknown): Promise<ValidationResult>`
- `chat(req: ChatRequest, auth: ProviderAuthHandle | ApiKeyAuth): Promise<ChatResponse>`

Optional OAuth hooks:

- `startOAuthLogin(ctx: OAuthStartContext)`
- `completeOAuthLogin(ctx: OAuthCompleteContext)`

## Auth Expectations

Runtime resolves auth context and passes either:

- API-key auth material
- OAuth auth handle

Adapter implementations should fail explicitly for missing or invalid auth, rather than silently degrading.

Provider OAuth config requirements:

- OAuth client secret must be referenced by env name (`runtime.providers[].oauth.clientSecretEnv`), not inline plaintext.
- `clientSecretEnv` must match env-var format (`^[A-Za-z_][A-Za-z0-9_]*$`).
- Adapters must not log raw provider credentials, OAuth code verifiers, or bearer/access tokens.

## Chat Request Semantics

`ChatRequest` includes:

- session ID
- model ID
- normalized message list
- tool schemas
- generation parameters
- metadata map

Message semantics now include attachment-aware turns:

- `NormalizedMessage.content` stays the bounded text transcript, caption text, and extracted text surface
- `NormalizedMessage.attachments` carries durable attachment metadata
- only providers with `ProviderCapabilities.supportsImageInputs=true` may receive image binaries
- supported text-like documents stay provider-agnostic in this release: runtime injects extracted text into the normal user text context instead of using provider-specific file APIs

Runtime now prepends a bounded runtime self-knowledge system message on every provider turn. Adapters must preserve system-message order and content exactly; they must not collapse or drop the message because it tells the model what OpenAssist is, what host it is running on, what effective access is active for that sender/chat turn, which tools are callable right now, which capability domains are available or limited, which local docs/config/install surfaces define behavior, and what kinds of self-maintenance or controlled growth are safe or blocked.

The runtime-awareness payload is now actor-aware in shared chats. For the same chat, one sender may arrive with `full-root` access while another stays `operator`, and provider adapters must preserve that exact system-message boundary on every turn.

The runtime-owned commands `/start`, `/help`, `/capabilities`, `/grow`, `/status`, and `/profile` are handled before provider dispatch. Provider adapters only see normal model turns plus scheduler-driven work; they should not try to emulate or replace those runtime-owned command surfaces.

Scheduler prompt actions use the same `chat()` path with metadata that identifies scheduler context (`source`, `taskId`, `scheduledFor`).

Tool-calling request requirements:

- when runtime autonomy is enabled for the session (`full-root`), `req.tools` contains the authoritative tool schema list for host tools and enabled native web tools
- adapters must preserve assistant tool-call turns and tool-result turns in provider-native formats
- tool-result messages are represented as normalized `role="tool"` messages with `toolCallId`
- when `req.tools` is empty, adapters should not emit tool calls; runtime treats unsolicited tool calls as non-executable

## Chat Response Semantics

`ChatResponse` must provide:

- normalized output message
- usage metrics (`inputTokens`, `outputTokens`, `totalTokens`)
- optional raw provider response ID
- optional `finishReason`
- optional `toolCalls` array

Tool-turn contract:

- when the provider wants tool execution, adapter returns `toolCalls`
- for tool-turn responses, `output.content` is allowed to be empty
- after runtime executes tools and appends tool-result messages, adapter receives another `chat()` call
- final user-visible turns return no `toolCalls` and include assistant text in `output.content`

`toolCalls` item shape:

- `id`: provider/tool-call identifier
- `name`: normalized tool name (`exec.run`, `fs.read`, `fs.write`, `fs.delete`, `pkg.install`, `web.search`, `web.fetch`, `web.run`)
- `argumentsJson`: JSON string payload consumed by runtime tool router

## Failure Behavior

Adapters should return actionable failures for:

- auth setup errors
- OAuth exchange failures
- provider-side non-2xx responses
- malformed provider response payloads

Runtime converts provider/auth/runtime failures into sanitized channel diagnostics, so adapter error text should be operator-actionable and secret-safe.

## Current Implementations

- OpenAI: `packages/providers-openai/src/index.ts`
- Anthropic: `packages/providers-anthropic/src/index.ts`
- OpenAI-compatible: `packages/providers-openai-compatible/src/index.ts`

Current image-input rule:

- OpenAI and Anthropic are first-class image-input providers in the built-in adapter set
- OpenAI-compatible providers remain text-only for images and must preserve the runtime note that image binaries were not inspected

OpenAI adapter endpoint behavior:

- Chat-completions remains supported for chat-capable OpenAI models.
- GPT-5/codex-class models are routed through the OpenAI Responses API.
- If chat-completions returns a model/endpoint mismatch (for example "not a chat model"), adapter falls back to Responses API automatically.

## Compatibility Rule

Changes to provider contract require synchronized updates across:

- `packages/core-types/src/provider.ts`
- runtime call sites
- all provider adapter packages
- this document
