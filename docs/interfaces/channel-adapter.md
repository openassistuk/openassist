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

## Current Implementations

- Telegram: `packages/channels-telegram/src/index.ts`
- Discord: `packages/channels-discord/src/index.ts`
- WhatsApp MD: `packages/channels-whatsapp-md/src/index.ts`

Supported first-class scope:

- Telegram: private chats, groups, forum topics; inbound photos and supported documents; outbound HTML rendering
- Discord: guild text channels, threads, DMs; inbound image and supported document attachments; outbound text-based channel sends with reply references
- WhatsApp MD: private chats and groups; inbound image and supported document messages; outbound quoted replies where supported
