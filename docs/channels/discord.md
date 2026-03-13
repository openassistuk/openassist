# Discord Channel

Use Discord when you want OpenAssist in guild text channels, thread channels, or carefully allow-listed DMs.

Discord has the most explicit separation between "where the bot may reply" and "which direct-message users may use it", so it is worth understanding the allow-lists before you switch a production bot on.

## What Discord Supports

- guild text channels
- thread channels
- DMs
- inbound images
- supported text-like document uploads
- outbound file replies
- targeted direct-recipient delivery when the recipient is explicitly allowed

## Required Settings

Adapter-backed settings:

- `botToken`
- `allowedChannelIds`
- `allowedDmUserIds`

Recommended shape:

```toml
[[runtime.channels]]
id = "discord-main"
type = "discord"
enabled = true

[runtime.channels.settings]
botToken = "env:OPENASSIST_CHANNEL_DISCORD_MAIN_BOT_TOKEN"
allowedChannelIds = ["123456789012345678"]
allowedDmUserIds = ["123456789012345678"]
operatorUserIds = ["123456789012345678"]
```

Env file entry:

```text
OPENASSIST_CHANNEL_DISCORD_MAIN_BOT_TOKEN=replace-me
```

## What the Main Settings Mean

- `allowedChannelIds`: guild text channels or threads where the bot may answer
- `allowedDmUserIds`: Discord users who may use the bot in DMs
- `operatorUserIds`: approved operators for access/default-notify behavior

Important distinction:

- `allowedChannelIds` decides which guild or thread destinations are allowed
- `allowedDmUserIds` decides which DM users are allowed
- `operatorUserIds` decides which senders count as approved operators

These are separate controls on purpose.

## Quickstart Path

Beginner path:

```bash
openassist setup
```

Choose `First-time setup`, then pick Discord as the primary channel.

Direct path:

```bash
openassist setup quickstart \
  --install-dir "$HOME/openassist" \
  --config "$HOME/.config/openassist/openassist.toml" \
  --env-file "$HOME/.config/openassist/openassistd.env"
```

Quickstart leaves Discord DMs disabled unless you explicitly add `allowedDmUserIds`.

## First-Message Verification

After setup:

```bash
openassist channel status
openassist service health
openassist doctor
```

Then in Discord:

1. Open the configured guild channel, thread, or allowed DM.
2. Send a message.
3. Confirm the bot replies in the same destination.
4. Send `/status` to collect the exact `sender id` and `session id`.

Discord operator IDs and DM allow-list entries must be numeric snowflakes.

## Operator and DM Notes

- Discord direct messages stay disabled unless you explicitly add `allowedDmUserIds`.
- Targeted operator notifications require the recipient in both `operatorUserIds` and `allowedDmUserIds`.
- Approved operators are still distinct from channel allow-lists.

## Attachments and File Return Behavior

Discord supports:

- inbound images
- inbound documents
- outbound image replies
- outbound document replies

Same-chat file replies do not need a separate recipient list. When the active session can call `channel.send`, OpenAssist can return the requested file into the current Discord channel or DM.

## Channel-Specific Gotchas

- If `allowedChannelIds` is empty, the bot has no guild or thread destination allow-list.
- If `allowedDmUserIds` is empty, Discord DMs are intentionally blocked.
- Direct-recipient delivery has a stricter rule than normal same-chat replies because Discord DMs require recipient overlap with `allowedDmUserIds`.

## Useful Commands

```bash
openassist channel status
openassist doctor
openassist tools status --session <channelId>:<conversationKey> --sender-id <sender-id>
```

## Related Docs

- [Quickstart on Linux and macOS](../operations/quickstart-linux-macos.md)
- [Setup Quickstart and Setup Wizard](../operations/setup-wizard.md)
- [Common Troubleshooting](../operations/common-troubleshooting.md)
