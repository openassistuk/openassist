# Channel First-Class Integrations

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This repository includes `.agents/PLANS.md`. This document must be maintained in accordance with `.agents/PLANS.md`.

## Purpose / Big Picture

After this change, OpenAssist can behave like a serious bot integration on Telegram, Discord, and WhatsApp MD instead of acting like a plain-text bridge. A user will be able to send images and supported text-like files into the supported channels, receive cleaner formatted replies instead of dense walls of text, and rely on the runtime to preserve attachment state safely enough for replay and diagnostics. The visible proof is simple: a configured channel accepts a text message plus an image or supported document, the runtime records the attachment, OpenAI or Anthropic can use the image as model input, and the reply comes back in channel-appropriate formatting with sane chunking.

## Progress

- [x] (2026-03-06 23:20Z) Audited the current channel adapters, runtime send path, provider contracts, storage, and setup/docs wording. Confirmed that the current implementation is text-only across adapters, storage replay, and provider requests.
- [x] (2026-03-07 00:05Z) Created the shared attachment, provider-capability, and runtime-config contracts in `packages/core-types`, `packages/config`, `apps/openassist-cli`, `apps/openassistd`, and `openassist.toml`, including Discord DM allow-list support and bounded `runtime.attachments` defaults.
- [x] (2026-03-07 00:11Z) Added durable attachment persistence, runtime-owned ingest helpers, bounded text-document extraction, and replay rehydration in `packages/storage-sqlite` and `packages/core-runtime`.
- [x] (2026-03-07 00:16Z) Upgraded built-in OpenAI and Anthropic providers for image inputs while keeping OpenAI-compatible text-only with explicit runtime diagnostics when image understanding is unavailable.
- [x] (2026-03-07 00:19Z) Upgraded Telegram, Discord, and WhatsApp MD adapters for first-class routing, attachment ingest, richer reply handling, and shared outbound formatting/chunking.
- [x] (2026-03-07 00:21Z) Updated setup flows, installer wording, `AGENTS.md`, required docs, and `CHANGELOG.md` to describe the new channel scope, attachment behavior, and supported-path media baseline.
- [x] (2026-03-07 00:25Z) Ran the full verification gate (`pnpm verify:all`) after refreshing targeted setup/runtime/provider/attachment tests. The gate completed successfully across workflow lint, build, lint, typecheck, Vitest, node tests, and both coverage runs.
- [x] (2026-03-07 12:13Z) Addressed post-PR GitHub security and Copilot review feedback: secured temporary attachment staging, added connector-side download caps and text-only fallback on attachment failures, avoided empty attachment directories on text-only turns, preserved idempotency before attachment persistence, switched provider image reads to async I/O, and tightened Telegram HTML code-block chunking. Re-ran `pnpm verify:all` successfully before updating the PR head.

## Surprises & Discoveries

- Observation: the current implementation is text-only all the way through replay and provider request construction, not just at the channel boundary.
  Evidence: `packages/channels-telegram/src/index.ts`, `packages/channels-discord/src/index.ts`, and `packages/channels-whatsapp-md/src/index.ts` all emit `attachments: []`, while `packages/core-types/src/common.ts` still defines `NormalizedMessage.content` as a plain string and the provider adapters map only text content.

- Observation: WhatsApp media support is partly blocked by product code and partly by install policy.
  Evidence: `packages/channels-whatsapp-md/src/index.ts` only extracts captions and ignores real attachment ingest, while `pnpm-workspace.yaml` only allows build scripts for `esbuild` and `protobufjs`, which is why supported-path media dependencies like `sharp` are skipped during install.

- Observation: the most common regressions from the first-class channel work landed in setup-flow prompt scripts rather than in runtime logic.
  Evidence: after adding Discord DM allow-list prompts and removing the old WhatsApp experimental warning, the failing slices were `tests/vitest/setup-quickstart-flow.test.ts`, `tests/vitest/setup-wizard-runtime.test.ts`, `tests/vitest/setup-quickstart-validation.test.ts`, and `tests/node/cli-setup-validation-coverage.test.ts`, all of which required prompt-sequence or expectation updates rather than runtime fixes.

- Observation: attachment persistence had to be normalized explicitly instead of relying on the existing raw event log.
  Evidence: the existing `events` payload retained inbound envelopes for audit, but `getRecentMessages()` did not reconstruct attachment metadata for replay until `message_attachments` and attachment rehydration were added in `packages/storage-sqlite/src/index.ts`.

- Observation: shared outbound formatting is valuable even for operator diagnostics, not just model replies.
  Evidence: once `packages/core-runtime/src/channel-rendering.ts` was introduced, the same rendering and chunking path could be applied to `/status`, runtime diagnostics, and standard assistant replies without duplicating adapter-specific formatting logic.

## Decision Log

- Decision: keep `NormalizedMessage.content` as the bounded text transcript and add explicit attachment state instead of replacing message content with a fully generic block tree in this PR.
  Rationale: the runtime, storage replay, context planner, and provider adapters all assume text content today. Keeping text as the primary transcript reduces blast radius while still making image/document input first-class.
  Date/Author: 2026-03-06 / Codex

- Decision: support plain-text document extraction only for this PR.
  Rationale: the current repo has no PDF, OCR, or Office-document extraction stack. Restricting document understanding to text-like files keeps the first-class channel work implementable in one PR without inventing a large document-processing subsystem.
  Date/Author: 2026-03-06 / Codex

- Decision: treat OpenAI and Anthropic as the only first-class image-input providers in this PR and keep OpenAI-compatible providers text-only with clear diagnostics.
  Rationale: the built-in OpenAI-compatible adapter targets heterogeneous backends, while the built-in OpenAI and Anthropic adapters can be upgraded against known request shapes in this repository.
  Date/Author: 2026-03-06 / Codex

- Decision: make the runtime own final attachment persistence while adapters only download into temporary files.
  Rationale: channel adapters are best placed to authenticate and fetch platform-specific files, but the runtime must enforce bounded size/type policy, durable storage layout, and owner-only permissions consistently across all channels.
  Date/Author: 2026-03-07 / Codex

- Decision: add a shared rendering and chunking layer in `packages/core-runtime` instead of teaching each channel adapter how to post-process raw assistant text independently.
  Rationale: the repo needs one bounded reply-formatting path for assistant output, `/status`, and diagnostics across Telegram HTML, Discord-safe markdown, and WhatsApp-safe text formatting.
  Date/Author: 2026-03-07 / Codex

- Decision: align `pnpm-workspace.yaml` build-script allow-list with the supported WhatsApp/media baseline now that WhatsApp/image ingest is part of the supported path.
  Rationale: leaving `@whiskeysockets/baileys` and `sharp` blocked while claiming first-class WhatsApp/media support would keep the installer in conflict with the public support statement.
  Date/Author: 2026-03-07 / Codex

- Decision: keep connector temp downloads in private per-file temp directories with fixed staging filenames, then rely on runtime persistence for the durable attachment names.
  Rationale: the channel adapters still need transient on-disk staging for platform downloads, but the temp path itself must not be derived from untrusted attachment metadata and must not rely on shared temp filenames.
  Date/Author: 2026-03-07 / Codex

## Outcomes & Retrospective

The implementation now covers the originally missing first-class channel surfaces:

- inbound attachment ingest is normalized and persisted durably instead of being dropped at the channel layer
- OpenAI and Anthropic can consume inbound image attachments directly, while OpenAI-compatible backends degrade explicitly instead of failing silently
- Telegram, Discord, and WhatsApp send paths now render structured replies with channel-safe formatting and chunking instead of shipping a single wall of plain text
- setup, installer, and docs now describe Telegram, Discord, and WhatsApp as supported first-class options with their real DM/group/topic scope and media expectations

The repo-wide verification milestone completed successfully. The most meaningful change-versus-baseline is that the system no longer behaves like a text-only bridge: attachments persist across storage and replay, provider mappings can use images where supported, and operators see clearer channel-native output on all three adapters.

The verification pass also confirmed that the broad lifecycle/setup surface stayed intact after the adapter/runtime changes. The final green run covered quickstart, wizard, provider mapping, storage replay, runtime attachment handling, and coverage thresholds in the same repo-wide command instead of relying only on targeted slices.

## Context and Orientation

The channel adapters live in `packages/channels-telegram`, `packages/channels-discord`, and `packages/channels-whatsapp-md`. They normalize inbound platform messages into `InboundEnvelope` and send outbound replies from `OutboundEnvelope`. Today they mostly capture text and drop attachments.

The runtime lives in `packages/core-runtime/src/runtime.ts`. It receives normalized channel messages, records them through `packages/storage-sqlite/src/index.ts`, builds provider requests, and sends the final assistant reply back through the chosen channel adapter. The context planner in `packages/core-runtime/src/context.ts` still assumes that a conversation is text. The current outbound path sends sanitized plain text directly to the adapters, so there is no channel-specific formatting layer.

The provider adapters live in `packages/providers-openai`, `packages/providers-anthropic`, and `packages/providers-openai-compatible`. They currently translate `NormalizedMessage.content` into provider request payloads but do not accept image parts or attachment metadata.

The daemon entrypoint in `apps/openassistd/src/index.ts` wires config into concrete provider and channel adapters. The setup and docs work is spread across `apps/openassist-cli/src/lib/setup-quickstart.ts`, `apps/openassist-cli/src/lib/setup-wizard.ts`, `scripts/install/bootstrap.sh`, `README.md`, `docs/README.md`, and the relevant files under `docs/interfaces`, `docs/operations`, and `docs/security`.

“First-class” in this document means the three supported surfaces are handled intentionally and documented as such: Telegram private chats, groups, and forum topics; Discord guild text channels, threads, and DMs; and WhatsApp private chats and groups. It does not mean slash commands, outbound media, OCR, audio understanding, or every advanced platform feature.

## Plan of Work

First, extend the shared contracts in `packages/core-types` and config schema in `packages/config` so attachments, image-capable providers, and bounded ingest limits become explicit. Add a runtime attachment config under `runtime.attachments`, add `supportsImageInputs` to provider capabilities, extend attachment metadata, and add Discord DM allow-list settings in the config schema. Update `openassist.toml` so the defaults are concrete and discoverable.

Second, change persistence before changing behavior. In `packages/storage-sqlite/src/index.ts`, add durable attachment storage that is tied to the inbound message rows instead of hiding everything only inside raw events. The database should still record the raw normalized event payload for audit, but replay and recent-message reconstruction must also be able to recover attachment metadata. Create a runtime-owned ingest helper in `packages/core-runtime` that saves inbound files under the configured data directory, enforces owner-only permissions where applicable, extracts bounded text from supported text-like documents, and returns normalized attachment metadata for persistence and provider mapping.

Third, upgrade the provider adapters and runtime request flow. `packages/providers-openai/src/index.ts` must map image attachments into the Responses API input format. `packages/providers-anthropic/src/index.ts` must map image attachments into Anthropic image blocks. `packages/providers-openai-compatible/src/index.ts` must remain text-only but surface explicit operator-facing guidance when image attachments arrive. The runtime must pass attachments through recent-message replay, context planning, and chat request construction without letting binary payloads explode token planning.

Fourth, upgrade the channel adapters. Telegram should accept text, photos, and supported documents, while preserving existing chat-thread and reply-threaded behavior. Discord should accept guild channels, thread channels, and DMs, store image/document attachments, and send replies to messageable Discord channel types instead of only `TextChannel`. WhatsApp MD should ingest images and supported documents, preserve captions, send quoted replies where possible, and feel like a supported core chat path rather than an experimental placeholder. The install path must be aligned with the dependencies that this supported media path actually needs.

Fifth, add a shared reply presentation layer in `packages/core-runtime` and use it from the runtime outbound path and channel adapters. Telegram should use HTML parse mode with safe escaping. Discord should use cleaned markdown that respects code fences and links. WhatsApp should use a conservative markdown subset and chunk safely. This same presentation path should be applied to assistant replies, `/status`, diagnostics, and profile/access messages so the formatting improvement is not limited to provider output.

Finally, update setup, docs, and tests. Quickstart, wizard, installer notes, README, interface docs, operations docs, security docs, `AGENTS.md`, and `CHANGELOG.md` must all describe the new supported behavior precisely. Add contract, adapter, storage, runtime, provider, and rendering tests, then run `pnpm verify:all`.

## Concrete Steps

Work from `c:\Users\dange\Coding\openassist`.

1. Implement shared contract and config edits, then run:

   `pnpm -r build`

   Expect TypeScript errors only in the areas that still need to consume the new fields. No unrelated packages should break.

2. Implement storage and runtime ingest helpers, then run:

   `pnpm --filter @openassist/storage-sqlite test`

   or, if no package-local script exists, the targeted node tests that cover storage.

3. Implement provider and channel upgrades, then run the relevant node and vitest suites for storage, runtime, providers, and adapters.

4. Update docs and lifecycle copy, then run:

   `pnpm verify:all`

   The final run must pass with the new tests in place.

This sequence is safe to repeat. If a later step fails, fix the code and rerun the same command; the database schema changes live inside tests or fresh runtime data directories.

## Validation and Acceptance

Acceptance is behavioral, not just structural.

The runtime must accept an inbound image on Telegram, Discord, and WhatsApp and preserve a normalized attachment record in storage instead of dropping it. On OpenAI and Anthropic providers, the same inbound image must be present in the provider request mapping tests. On OpenAI-compatible providers, the runtime must preserve the text/caption and return an explicit message that image understanding is unavailable for that provider.

The runtime must accept a supported text-like document upload, extract bounded text, and include that extracted text in the user-visible attachment context for provider requests and replay. Oversized or unsupported attachments must not crash the turn; they must produce a clear operator-facing explanation.

Telegram replies must render visibly better than the current plain blocks by preserving headings, lists, code fences, and links through Telegram HTML formatting. Discord and WhatsApp replies must similarly preserve readable structure and split long output cleanly.

Quickstart, wizard, and installer wording must no longer imply that WhatsApp/media are optional extras if they are part of the supported path. The required docs must describe Telegram, Discord, and WhatsApp as first-class supported integrations with the actual scope defined above.

## Idempotence and Recovery

The implementation must be safe to rerun. Attachment persistence should be idempotent per inbound idempotency key, just like existing inbound message handling. If attachment ingest fails for one file, the runtime should still preserve the rest of the turn and record a clear error rather than leaving the session in a half-written state.

The new attachment storage should use the runtime data directory and owner-only permissions. Tests should use temporary directories so they can be removed safely after each run. If a storage migration or schema change fails during development, deleting the temporary test database and rerunning the tests is the safe retry path.

## Artifacts and Notes

At the end of implementation, capture short evidence here:

- Final gate: `pnpm verify:all` completed successfully on 2026-03-07 00:25Z.
- Representative image-ingest test: `tests/node/runtime-attachments.test.ts > ingests inbound attachments, persists them, and injects bounded document text`.
- Representative rendering/chunking test: `tests/vitest/runtime-attachments-rendering.test.ts > renders telegram replies with HTML-safe formatting and chunks discord output safely`.
- Representative adapter behavior tests:
  - `tests/vitest/channel-adapter-send.test.ts > telegram send uses HTML parse mode and preserves reply metadata`
  - `tests/vitest/channel-adapter-send.test.ts > discord send supports reply references on messageable channels`
  - `tests/vitest/channel-adapter-send.test.ts > whatsapp send preserves quoted reply context when available`

## Interfaces and Dependencies

The implementation must end with explicit attachment-aware interfaces in `packages/core-types/src/common.ts`, `packages/core-types/src/provider.ts`, and the config/runtime types in `packages/core-types/src/runtime.ts`. The storage layer in `packages/storage-sqlite/src/index.ts` must reconstruct `NormalizedMessage` rows with attachments when replaying recent context. The runtime in `packages/core-runtime/src/runtime.ts` must be the sole owner of attachment ingest policy, provider capability gating, and outbound presentation orchestration.

Use the existing SDKs already present in this repository:

- `grammy` for Telegram file metadata and message sending
- `discord.js` for Discord guild, thread, and DM messaging
- `@whiskeysockets/baileys` for WhatsApp MD message download, quoted replies, and send behavior

Do not add PDF/OCR/document-conversion libraries in this change. If a file is not plainly text-like, treat it as unsupported document input for this PR.

Revision note (2026-03-06): Created the initial ExecPlan at implementation start after confirming that the current system is text-only end to end and that attachment, provider, and rendering work all need to land in one coordinated change.
