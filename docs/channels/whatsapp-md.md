# WhatsApp MD Channel

Use WhatsApp MD when you want OpenAssist in WhatsApp private chats or groups using the multi-device connector.

WhatsApp has one extra operator step compared with Telegram or Discord: the channel may need QR linking before it becomes healthy.

## What WhatsApp MD Supports

- private chats
- groups
- inbound images
- supported text-like document uploads
- outbound file replies
- QR-based device linking

## Supported Settings

Adapter-backed settings:

- `mode`
- `sessionDir`
- `printQrInTerminal`
- `syncFullHistory`
- `maxReconnectAttempts`
- `reconnectDelayMs`
- `browserName`
- `browserVersion`
- `browserPlatform`

Recommended shape:

```toml
[[runtime.channels]]
id = "whatsapp-main"
type = "whatsapp-md"
enabled = true

[runtime.channels.settings]
sessionDir = "/absolute/path/to/openassist/data/whatsapp-main"
printQrInTerminal = true
maxReconnectAttempts = 10
reconnectDelayMs = 5000
operatorUserIds = ["447700900123@s.whatsapp.net"]
```

`operatorUserIds` should use the exact sender ID or JID that `/status` shows for that WhatsApp sender.
Keep `sessionDir` under the install's runtime data directory rather than inside the repo-backed checkout.

## What the Main Settings Mean

- `sessionDir`: where WhatsApp MD session state is stored
- `printQrInTerminal`: whether setup and status flows should print the latest QR in the terminal
- `syncFullHistory`: whether to request a fuller history sync
- `maxReconnectAttempts`: reconnect limit before the adapter gives up
- `reconnectDelayMs`: delay between reconnect attempts

## Quickstart Path

Beginner path:

```bash
openassist setup
```

Choose `First-time setup`, then pick WhatsApp as the primary channel.

Direct path:

```bash
openassist setup quickstart \
  --install-dir "$HOME/openassist" \
  --config "$HOME/.config/openassist/openassist.toml" \
  --env-file "$HOME/.config/openassist/openassistd.env"
```

WhatsApp-specific follow-up:

```bash
openassist channel qr --id whatsapp-main
```

Use that command when the connector still needs QR linking.

## First-Message Verification

After setup:

```bash
openassist channel status
openassist service health
openassist doctor
```

If WhatsApp is not healthy yet:

```bash
openassist channel qr --id whatsapp-main
```

Then:

1. Link the WhatsApp session if needed.
2. Open the configured private chat or group.
3. Send a message.
4. Confirm the bot replies.
5. Use `/status` to capture the exact sender ID or JID and session ID.

## Operator and Sender ID Notes

- WhatsApp operator IDs must match the exact sender ID or JID shown by `/status`.
- Do not guess or shorten the JID.
- `operatorUserIds` is still distinct from the fact that the bot is present in a group.

## Attachments and File Return Behavior

WhatsApp MD supports:

- inbound image attachments
- inbound document attachments
- outbound image replies
- outbound document replies

If an attachment caption would exceed the safe caption limit, OpenAssist can spill that text into a follow-up message instead of risking delivery failure.

## Channel-Specific Gotchas

- WhatsApp may require QR linking before the channel is healthy.
- The recommended session state lives under the runtime data directory, not inside the repo by default.
- If `pnpm` reported skipped WhatsApp or media build scripts during install, approve them before expecting WhatsApp image or document handling to work.

## Useful Commands

```bash
openassist channel status
openassist channel qr --id whatsapp-main
openassist doctor
```

## Related Docs

- [Quickstart on Linux and macOS](../operations/quickstart-linux-macos.md)
- [Common Troubleshooting](../operations/common-troubleshooting.md)
- [Configuration Reference](../configuration/config-reference.md)
