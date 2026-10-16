# Context Engine

Source changes described here are unreleased; immutable `v0.2.4` installations retain their shipped planner until explicitly updated.

`ModelContextManager` in `packages/core-runtime/src/context-manager.ts` admits every runtime provider submission: normal replies, each tool continuation, scheduler prompts, context summaries and permanent-memory extraction. There is no runtime eight-message cutoff. History is read in 200-row pages, up to 10,000 messages and the configured byte bound; an incomplete read cannot be represented as complete history.

## Model and operator limits

The shared catalog supplies exact, dated model capacities. Route and endpoint matter. Azure requires an explicit `underlyingModel`; deployment names never establish capacity. Codex account-login and compatible/custom endpoints use a labeled 24,000-token fallback unless `contextWindowTokens` is configured from verified serving limits. A known native maximum remains an upper bound on that override.

Usable input is the smaller of the model/input cost ceiling and context window minus reserved output and safety. Safety is the larger of 1,024 tokens and 2% of the window. Output reservation is at least the prepared request's maximum output; when omitted, reserve the known native maximum or 8,192 tokens for an unknown route. Anthropic continues sending its existing output limit (normally 16,384); this feature does not increase generation limits. Azure's recent 1,050,000-token models additionally have a 922,000-token input ceiling.

Current GPT-6.1 Sol, GPT-6 Astra/Sol/Luna and GPT-5.6 Sol/Terra/Luna API entries use 1,050,000-token windows. Current Claude Opus/Sonnet/Haiku 5.5 and Fable/Mythos 5.1 use 1,000,000. Older exact entries retain their own capacities or the explicit unknown fallback. Capacities do not assert account entitlement, deployment availability or rate quota. Sources checked October 16, 2026: [OpenAI model comparison](https://developers.openai.com/api/docs/models/compare), [Anthropic context windows](https://platform.claude.com/docs/en/build-with-claude/context-windows), [Azure models](https://learn.microsoft.com/en-us/azure/ai-services/openai/concepts/models).

See the [configuration reference](../configuration/config-reference.md#runtimecontext). Quickstart uses defaults and preserves saved overrides. `openassist setup wizard` has a separate advanced context editor with strict numeric validation.

## Prepared request accounting

All five bundled adapters map their actual vendor payload once, freeze it, and return a short-lived `PreparedChatRequest`. Counting and sending consume this same payload. Its fingerprint covers route/endpoint/model and mapped content, including instructions, schemas, arguments, results, images and admitted opaque replay. Credentials are supplied only when counting/sending and excluded from diagnostics.

OpenAI Responses and Anthropic use native counting endpoints near 75% of usable input, with a 10-second timeout and no count retries. Other routes, unsupported counting and count failures use a labeled UTF-8 JSON estimate (bytes divided by three, plus framing). This is an approximation, particularly for images, code and token-dense text; safety is not a mathematical guarantee against provider rejection. Counts are reused only for matching prepared fingerprints. Observed Anthropic input includes cache-read and cache-creation tokens once; OpenAI cached tokens are already included in input usage.

The default prepared-request byte ceiling is 32 MiB, independent of tokens. A preparation resource guard runs before mapping. Existing attachment and 1 MiB/256-item Responses replay limits remain independent. Signed thinking is retained or omitted as whole blocks by the adapter's replay policy.

Large tool-result model projections become explicit excerpts with source session/call/message references and bounded status/exit/receipt fields. The excerpt ceiling is between 1,024 and 24,576 characters, derived from usable input. Full outputs remain in messages/tool audits. Context recovery never executes a tool to regenerate output. User input, system instructions, schemas and tool arguments are not silently sliced; an oversized mandatory request fails with narrowing guidance.

## Transactional compaction

At 85% occupancy, compact older complete conversation segments toward 60%. A segment starts at a user message and includes assistant/tool continuations. Repeated call IDs are matched by occurrence. An unsettled call prevents a boundary; the current segment is always retained. At most two summary generations run during foreground admission. If the unchanged complete request still fits after summary failure, it may proceed with degraded diagnostics; an oversized or incomplete projection blocks before inference.

Summary generation has no tools, a 30-second cancellation deadline, a default 32,768-token source ceiling and 8,192-token summary ceiling. A six-field JSON checkpoint separates goals, constraints, decisions, open work, completed actions and evidence. It retains prior checkpoint facts and requires selected tool-call receipts. Validation is structural and bounded; model summaries are not semantically lossless and never grant authorization. Original source rows remain authoritative.

SQLite adds `context_compactions`, `context_checkpoints` and `context_rejections` without rewriting transcript/audit tables. Adoption verifies the expected revision, previous frontier, contiguous source range and digest in one transaction. Empty, malformed, oversized, cancelled or stale candidates cannot advance the frontier. Legacy `session_memory` rows are readable as revision-zero summaries with their recorded boundary; historical semantic completeness is not certified. Successful checkpoints mirror into `session_memory` for older readers.

Failed generation queues bounded `context_maintenance` work through the existing durable recovery queue (three attempts, at most two source chunks per attempt). It contains no host actions. Provider-confirmed context rejection permits one persisted repair for the rejected fingerprint, only if a new projection is smaller; another rejection stops. Authentication refresh is separate. Byte limits, rate limits and output exhaustion are not context overflow.

Restart resumes abandoned context/memory jobs and pending compaction intent only; it does not replay host work. Shutdown cancels sidecar requests and drains active recovery before the database closes. Each adopted chunk must shrink the prepared projection and records source-range/tool-result references. Catch-up may require several chunks while inference remains blocked; the final full projection must pass admission before sending.

## Memory, status and rollback

Permanent actor memory remains scoped to `<channelId>:<senderId>`. Successful replies queue optional conservative extraction; it no longer writes the context frontier or blocks foreground chat. `runtime.memory.enabled = false` disables permanent memory while context admission/compaction remain active. There are no new memory/tool permissions.

`/status` groups context diagnostics; `/memory`, daemon `/v1/health` runtime status and `openassist doctor` show limits, provenance, reserved output, usable input and available measured/estimated occupancy. Checkpoint revision/frontier and last failure are visible without transcripts or raw reasoning. In-memory occupancy is stale after restart; a session's checkpoint remains durable.

Back up config and SQLite before rollback. Original history and the compatibility summary mirror remain readable by older binaries; new checkpoints are ignored. Their old retention behavior returns, and summaries created after downgrade are not automatically reconciled with an existing newer checkpoint. Restore the matching backup before re-upgrading if the old binary processed more conversation. See [rollout and rollback](../operations/config-rollout-and-rollback.md).

Offline continuity/failure fixtures and full-check evidence live in the [implementation plan](../execplans/model-aware-context-2026-10-16.md) and [test matrix](../testing/test-matrix.md). Hosted CI and live-provider certification are separate evidence.
