# Telegram Channel

`0.2.5` adds `/compact` (no arguments) for one explicit older-history summary in this canonical chat. It uses the configured provider, can affect shared chat continuity, preserves original rows/current input and grants no host tools. Wait for an active provider turn to finish before invoking it. Automatic compaction can be switched off installation-wide with `runtime.context.autoCompact`; `/status` and `/memory` show the mode without using the provider.

`0.2.5` candidate `/status` includes grouped context limits/occupancy, and `/memory` includes checkpoint/failure diagnostics without provider dependency. Replies still use shared channel rendering/chunking and existing session/access scope; context compaction does not change Telegram inline defaults. See the [context engine](../architecture/context-engine.md).

Use Telegram when you want a bot that can work in private chats, group chats, and forum topics.

Telegram is the default beginner-friendly channel in OpenAssist because the setup flow is straightforward and the default conversation behavior stays inline unless you deliberately change it later.

## What Telegram Supports

- private chats
- groups
- forum topics
- inbound images
- supported text-like document uploads
- outbound file replies back into the same chat

Telegram can also do targeted direct-recipient delivery when the current session is allowed to use `channel.send`.

## Required Settings

Adapter-backed settings:

- `botToken`
- `allowedChatIds`
- `conversationMode`
- `responseMode`

Recommended beginner shape:

```toml
[[runtime.channels]]
id = "telegram-main"
type = "telegram"
enabled = true

[runtime.channels.settings]
botToken = "env:OPENASSIST_CHANNEL_TELEGRAM_MAIN_BOT_TOKEN"
allowedChatIds = ["123456789"]
operatorUserIds = ["123456789"]
conversationMode = "chat"
responseMode = "inline"
```

Env file entry:

```text
OPENASSIST_CHANNEL_TELEGRAM_MAIN_BOT_TOKEN=replace-me
```

## What the Main Settings Mean

- `allowedChatIds`: Telegram chats the bot may answer in
- `operatorUserIds`: approved operator accounts for access/default-notify behavior
- `conversationMode = "chat"`: one conversation per chat
- `conversationMode = "chat-thread"`: split Telegram forum topics into separate conversation keys
- `responseMode = "inline"`: reply normally in chat
- `responseMode = "reply-threaded"`: reply to a specific Telegram message when available

Secret-like channel settings must use `env:VAR_NAME` references. Plaintext tokens in the TOML are rejected by config validation.

## Quickstart Path

Beginner path:

```bash
openassist setup
```

Choose `First-time setup`, then pick Telegram as the primary channel.

Direct path:

```bash
openassist setup quickstart \
  --install-dir "$HOME/openassist" \
  --config "$HOME/.config/openassist/openassist.toml" \
  --env-file "$HOME/.config/openassist/openassistd.env"
```

Quickstart keeps Telegram defaults beginner-safe:

- inline chat memory
- inline responses
- one enabled channel

## First-Message Verification

After setup:

```bash
openassist channel status
openassist service health
openassist doctor
```

Then in Telegram:

1. Open the configured private chat, group, or forum topic.
2. Send a simple message.
3. Confirm the bot replies in that same destination.
4. Send `/status` to see the exact `sender id` and `session id`.

The `sender id` is what you use later for `operatorUserIds` or host-side actor-aware access checks.

## Operator and Sender ID Notes

- Telegram operator IDs must be positive numeric user IDs.
- `operatorUserIds` is separate from `allowedChatIds`.
- `allowedChatIds` controls where the bot may reply.
- `operatorUserIds` controls which Telegram senders count as approved operators on that channel.

## Attachments and File Return Behavior

Telegram supports:

- inbound photos
- inbound supported documents
- outbound image replies
- outbound document replies

If OpenAssist creates a file and the active session can call `channel.send`, it can return that file back into the same Telegram chat instead of only mentioning a local path.

## Channel-Specific Gotchas

- Forum topics only become separate conversation keys when `conversationMode = "chat-thread"`.
- If `allowedChatIds` is non-empty, the bot ignores Telegram chats that are not listed.
- Message threading in Telegram is a channel behavior choice, not a provider feature.

## Useful Commands

```bash
openassist channel status
openassist doctor
openassist tools status --session <channelId>:<conversationKey> --sender-id <sender-id>
```

## Related Docs

- [Quickstart on Linux and macOS](../operations/quickstart-linux-macos.md)
- [Setup Quickstart and Setup Wizard](../operations/setup-wizard.md)
- [Configuration Reference](../configuration/config-reference.md)

## Modernization compatibility

Provider modernization retains inline replies and memory defaults. Channel `/status` reports the configured provider route, model, and effective tuning from the shared catalog; known retired Codex models show explicit repair guidance without making a provider call.

Dependency readiness (2026-09-27): grammY 1.46.0 is current stable and supports Bot API 10.3. Bot-token auth, chat/thread defaults and bounded file handling are unchanged. See [readiness audit](../operations/provider-channel-readiness.md).

Installation note: packaged releases include the runtime and adapter dependencies; existing provider/channel configuration stays in operator state across updates. For isolated developer testing, use dedicated test credentials and enable channels explicitly. See [developer testing](../operations/developer-testing.md) and [upgrade/recovery](../operations/upgrade-and-rollback.md).

## Native reminders

Approved Full access operators can create saved-text reminders or tool-free scheduled prompts for their current conversation. The model cannot choose a different recipient; list/cancel are scoped to the same actor and chat. Delivery uses the shared renderer and durable per-part receipts. A timeout or unknown transport outcome is shown as uncertain and is not resent automatically. Standard mode cannot use these tools.

See [deadlines, limits and cancellation](../interfaces/scheduler-and-time.md#managed-one-shot-reminders).
