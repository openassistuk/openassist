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
- `refreshOAuthAuth(auth: ProviderAuthHandle)`

## Auth Expectations

Runtime resolves auth context and passes either:

- API-key auth material
- OAuth auth handle

Adapter implementations should fail explicitly for missing or invalid auth, rather than silently degrading.

Built-in public provider-route expectations:

- `openai`: API-key route in operator-facing setup and docs
- `codex`: OpenAI account-login route in operator-facing setup and docs
- `anthropic`: API-key route, with optional account-linking where configured
- `openai-compatible`: API-compatible route

`codex` is intentionally a separate route so account-login auth does not collide with OpenAI API-key auth on the same provider ID. In this release it is Codex-only: use `gpt-5.4` or another Codex-family model on that route.

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
- Codex: `packages/providers-codex/src/index.ts`
- Anthropic: `packages/providers-anthropic/src/index.ts`
- OpenAI-compatible: `packages/providers-openai-compatible/src/index.ts`

Current image-input rule:

- OpenAI, Codex, and Anthropic are first-class image-input providers in the built-in adapter set
- OpenAI-compatible providers remain text-only for images and must preserve the runtime note that image binaries were not inspected

Provider-native reasoning controls:

- OpenAI providers may optionally set `reasoningEffort = "low" | "medium" | "high"` in config.
- Codex providers do not expose a separate public reasoning control in this release.
- Anthropic providers may optionally set `thinkingBudgetTokens = <integer>` in config.
- OpenAI-compatible providers do not expose a public reasoning control in this release.
- Safe default is unset: when the field is omitted, adapters do not send any reasoning or thinking parameter.
- Adapters must omit unsupported reasoning fields instead of risking provider API errors:
  - OpenAI reasoning effort is sent only on supported Responses API model families.
  - Anthropic thinking budget is sent only on supported thinking-capable Claude families.
- Setup validation may warn when a configured default model does not match the built-in allow-list, but runtime still stays safe by omitting the field.

OpenAI adapter endpoint behavior:

- Chat-completions remains supported for chat-capable OpenAI models.
- GPT-5/codex-class models are routed through the OpenAI Responses API.
- If chat-completions returns a model/endpoint mismatch (for example "not a chat model"), adapter falls back to Responses API automatically.
- `reasoningEffort` is only attached on the supported Responses API path. It is never sent on chat-completions requests.

Codex adapter behavior:

- Codex account login uses a dedicated Codex/OpenAI PKCE flow with restart-safe linked-account storage in the existing OAuth tables.
- The adapter refreshes the linked account before expiry or when a provider call proves the stored account needs renewal.
- The current public route keeps one linked account per provider instance.
- The Codex route is account-login only in operator-facing setup and docs; it is not the generic OpenAI API-key route.
- The Codex route validates `gpt-5.4` and Codex-family models only in this release.

Anthropic thinking replay behavior:

- When Anthropic returns provider-native thinking blocks, the adapter stores reserved replay metadata on the normalized assistant output.
- Runtime persists that metadata on assistant messages during tool turns and final assistant messages.
- On later Anthropic follow-up calls, the adapter reconstructs the original assistant content blocks from replay metadata instead of relying only on synthetic tool-call placeholders.
- Internal thinking content remains provider-side replay state only. It must never appear in channel-visible output.

Legacy compatibility note:

- Existing `openai` provider configs that still carry OAuth settings may remain readable for compatibility.
- New account-login installs should use `codex` instead of creating a new mixed `openai + oauth` provider.

## Compatibility Rule

Changes to provider contract require synchronized updates across:

- `packages/core-types/src/provider.ts`
- runtime call sites
- all provider adapter packages
- this document
