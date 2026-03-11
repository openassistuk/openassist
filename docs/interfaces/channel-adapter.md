# Channel Adapter Interface

Source of truth: `packages/core-types/src/channel.ts`.

Channel adapters normalize inbound platform messages and deliver normalized outbound messages.

## Required Contract

Every adapter must implement:

- `id(): string`
- `start(handler: (msg: InboundEnvelope) => Promise<void>): Promise<void>`
- `stop(): Promise<void>`
- `send(msg: OutboundEnvelope): Promise<{ transportMessageId: string }>`
- `health(): Promise<HealthStatus>`
- `capabilities(): ChannelCapabilities`

## Channel Capabilities Contract

`ChannelCapabilities` must stay truthful because runtime awareness, `/start`, `/help`, `/capabilities`, provider grounding, and the shared channel renderer all derive from it.

Required booleans:

- `supportsFormattedText`
- `supportsImageAttachments`
- `supportsDocumentAttachments`
- `supportsOutboundImageAttachments`
- `supportsOutboundDocumentAttachments`
- `supportsDirectRecipientDelivery`

Rules:

- report `supportsFormattedText=true` only when the adapter can safely preserve structured headings, lists, code fences, and links through the shared rendering path
- report inbound attachment booleans based on actual inbound support, not aspirational platform support
- report outbound attachment booleans based on real send support for staged runtime-owned files, not on platform marketing claims
- report `supportsDirectRecipientDelivery=true` only when the adapter can address a specific recipient outside the current chat route without broadcasting
- do not overclaim image or document support when the adapter only handles text captions or metadata

## Inbound Envelope Contract

`InboundEnvelope` fields include:

- channel type (`telegram`, `discord`, `whatsapp-md`)
- configured channel ID (`channelId`, for example `telegram-main`)
- transport message ID
- conversation key
- sender ID
- optional text plus attachment metadata
- receive timestamp
- idempotency key

Idempotency keys must be stable for the same transport event.

`channelId` is now the canonical routing identity for runtime session tracking. Runtime session IDs use `<channelId>:<conversationKey>`, not just the transport type.

Attachment rules:

- adapters normalize inbound images and supported text-like documents into `AttachmentRef[]`
- adapters may use temporary local files for downloaded media, but runtime remains the owner of final persisted attachment storage under `runtime.paths.dataDir`
- adapters must not silently drop unsupported or oversized attachments; runtime must be able to surface a clear operator note
- Discord direct-message support is explicit and audited through `channels[*].settings.allowedDmUserIds`

## Outbound Envelope Contract

`OutboundEnvelope` includes:

- channel type
- conversation key
- text body
- optional staged outbound attachments owned by the runtime
- optional direct-recipient user ID for bounded targeted delivery
- optional reply target transport message ID
- metadata map

## Secret Indirection

Channel settings support environment indirection using `env:VAR_NAME` string form. Daemon resolves these values before adapter construction.

Example:

```toml
[runtime.channels.settings]
botToken = "env:OPENASSIST_CHANNEL_TELEGRAM_MAIN_BOT_TOKEN"
```

## Scheduler Output Integration

Scheduled tasks can optionally push output through channel adapters when task output block includes `channelId` and `conversationKey`.

## Reliability Requirements

Adapters must provide:

- idempotent start/stop behavior
- clear send failures for retry queue handling
- truthful health status for operator diagnosis
- reply rendering compatibility with runtime-owned command output, diagnostics, and normal assistant responses
- explicit outbound degradation when staged files are missing and when caption-limited platforms need overflow text moved into a follow-up message

## Current Implementations

- Telegram: `packages/channels-telegram/src/index.ts`
- Discord: `packages/channels-discord/src/index.ts`
- WhatsApp MD: `packages/channels-whatsapp-md/src/index.ts`

Supported first-class scope:

- Telegram: private chats, groups, forum topics; inbound photos and supported documents; outbound HTML rendering plus staged photo/document delivery; direct-recipient private-chat sends for bounded operator notify
- Discord: guild text channels, threads, DMs; inbound image and supported document attachments; outbound text-plus-file sends with reply references; direct-recipient DM delivery when `allowedDmUserIds` permits it
- WhatsApp MD: private chats and groups; inbound image and supported document messages; outbound quoted replies, staged document/image delivery, and exact-JID direct-recipient sends where configured
