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
- transport message ID
- conversation key
- sender ID
- optional text and attachments
- receive timestamp
- idempotency key

Idempotency keys must be stable for the same transport event.

## Outbound Envelope Contract

`OutboundEnvelope` includes:

- channel ID
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
