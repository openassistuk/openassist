# Configuration Reference

This page is the schema-backed reference for `openassist.toml`.

It summarizes the top-level config shape from `packages/config/src/schema.ts`, the public runtime/provider/channel contracts from `packages/core-types`, and the required channel/provider-specific settings from the built-in adapters.

## Top-Level Shape

```toml
[runtime]
[service]
[tools]
[security]
```

## `[runtime]`

Core fields:

| Field | Type | Default / Notes |
| --- | --- | --- |
| `bindAddress` | string | default `127.0.0.1` |
| `bindPort` | integer | `1..65535`, default `3344` |
| `defaultProviderId` | string | must match one provider `id` |
| `defaultPolicyProfile` | enum | `restricted`, `operator`, `full-root`; default `operator` |
| `operatorAccessProfile` | enum | `operator`, `full-root`; default `operator` |
| `workspaceRoot` | string | optional |
| `providers` | array | at least one provider |
| `channels` | array | optional, default empty |

### `[runtime.assistant]`

| Field | Type | Default / Notes |
| --- | --- | --- |
| `name` | string | default `OpenAssist` |
| `persona` | string | default pragmatic local assistant persona |
| `operatorPreferences` | string | default empty |
| `promptOnFirstContact` | boolean | default `true` |

### `[runtime.attachments]`

| Field | Type | Default / Notes |
| --- | --- | --- |
| `maxFilesPerMessage` | integer | `1..16`, default `4` |
| `maxImageBytes` | integer | positive, max `25000000`, default `10000000` |
| `maxDocumentBytes` | integer | positive, max `10000000`, default `1000000` |
| `maxExtractedChars` | integer | positive, max `100000`, default `12000` |

### `[runtime.memory]`

| Field | Type | Default / Notes |
| --- | --- | --- |
| `enabled` | boolean | default `true` |

### `[runtime.toolLoop]`

| Field | Type | Default / Notes |
| --- | --- | --- |
| `maxRoundsPerTurn` | integer | `1..24`, default `12` |

### `[runtime.time]`

| Field | Type | Default / Notes |
| --- | --- | --- |
| `defaultTimezone` | string | optional, must be a valid IANA timezone |
| `ntpPolicy` | enum | `warn-degrade`, `hard-fail`, `off`; default `warn-degrade` |
| `ntpCheckIntervalSec` | integer | positive, default `300` |
| `ntpMaxSkewMs` | integer | non-negative, default `10000` |
| `ntpHttpSources` | string[] | URL list, default Google, Cloudflare, Microsoft |
| `requireTimezoneConfirmation` | boolean | default `true` |

### `[runtime.scheduler]`

| Field | Type | Default / Notes |
| --- | --- | --- |
| `enabled` | boolean | default `true` |
| `tickIntervalMs` | integer | positive, default `1000` |
| `heartbeatIntervalSec` | integer | positive, default `30` |
| `defaultMisfirePolicy` | enum | `catch-up-once`, `skip`, `backfill`; default `catch-up-once` |
| `tasks` | array | default `[]` |

Task shape:

- `id`
- `enabled`
- `scheduleKind = "cron"` with `cron`
- or `scheduleKind = "interval"` with `intervalSec`
- optional `timezone`
- optional `misfirePolicy`
- optional `maxRuntimeSec`
- `action`
- optional `output`

Action shapes:

- `type = "prompt"` with `promptTemplate` and optional `providerId`, `model`, `metadata`
- `type = "skill"` with `skillId`, `entrypoint`, and optional `input`

Output shape:

- `channelId`
- `conversationKey`
- `messageTemplate`

If `output.channelId` is set for a prompt action, `output.conversationKey` is required.

### `[runtime.paths]`

| Field | Type | Notes |
| --- | --- | --- |
| `dataDir` | string | required |
| `skillsDir` | string | required |
| `logsDir` | string | required |

## `[[runtime.providers]]`

Common fields for all providers:

| Field | Type | Notes |
| --- | --- | --- |
| `id` | string | required |
| `type` | enum | `openai`, `codex`, `anthropic`, `openai-compatible` |
| `defaultModel` | string | required |
| `baseUrl` | string | optional URL |
| `metadata` | record | optional |

### OpenAI

```toml
[[runtime.providers]]
id = "openai-main"
type = "openai"
defaultModel = "gpt-5.4"
# reasoningEffort = "medium"
```

Additional fields:

- `reasoningEffort`: `low`, `medium`, `high`, `xhigh`
- optional `oauth` object for advanced provider-managed OAuth configuration

### Codex

```toml
[[runtime.providers]]
id = "codex-main"
type = "codex"
defaultModel = "gpt-5.4"
# reasoningEffort = "medium"
```

Additional fields:

- `reasoningEffort`: `low`, `medium`, `high`, `xhigh`

Codex is the separate account-login route. Linked-account auth is managed through `openassist auth ...`, not by storing a normal API key in the TOML.

### Anthropic

```toml
[[runtime.providers]]
id = "anthropic-main"
type = "anthropic"
defaultModel = "claude-sonnet-4-6"
# thinkingBudgetTokens = 4096
```

Additional fields:

- `thinkingBudgetTokens`: integer `1024..32000`
- optional `oauth` object for advanced provider-managed OAuth configuration

### OpenAI-compatible

```toml
[[runtime.providers]]
id = "compat-main"
type = "openai-compatible"
defaultModel = "your-model-name"
baseUrl = "http://127.0.0.1:1234/v1"
```

No provider-specific reasoning or thinking field is supported on this route in the current schema.

### Provider OAuth Object

Where supported, `oauth` may contain:

- `authorizeUrl`
- `tokenUrl`
- `clientId`
- `clientSecretEnv`
- `scopes`
- `audience`
- `extraAuthParams`
- `extraTokenParams`

`clientSecretEnv` must be a valid env-var name.

## `[[runtime.channels]]`

Common fields:

| Field | Type | Notes |
| --- | --- | --- |
| `id` | string | letters, numbers, dot, dash, underscore |
| `type` | enum | `telegram`, `discord`, `whatsapp-md` |
| `enabled` | boolean | default `true` |
| `settings` | record | string, number, boolean, or string array values |

### Shared Channel Validation Rules

- `operatorUserIds` must be a string array.
- Telegram operator IDs must be positive numeric user IDs.
- Discord operator IDs must be numeric snowflakes.
- WhatsApp operator IDs must match the exact sender ID or JID shown by `/status`.
- Secret-like channel settings must use `env:VAR_NAME`.
- `allowedDmUserIds` is only supported on Discord channels.

### Telegram Settings

Required adapter settings:

- `botToken`
- `allowedChatIds`
- `conversationMode`
- `responseMode`

`conversationMode`:

- `chat`
- `chat-thread`

`responseMode`:

- `inline`
- `reply-threaded`

### Discord Settings

Required adapter settings:

- `botToken`
- `allowedChannelIds`
- `allowedDmUserIds`

### WhatsApp MD Settings

Supported adapter settings:

- `mode` (`production` or `experimental`, default `production`)
- `sessionDir`
- `printQrInTerminal`
- `syncFullHistory`
- `maxReconnectAttempts`
- `reconnectDelayMs`
- `browserName`
- `browserVersion`
- `browserPlatform`

## `[service]`

| Field | Type | Default / Notes |
| --- | --- | --- |
| `systemdFilesystemAccess` | enum | `hardened` or `unrestricted`, default `hardened` |

This setting affects Linux systemd service hardening. It is separate from chat access mode.

## `[tools]`

### `[tools.fs]`

| Field | Type | Default / Notes |
| --- | --- | --- |
| `workspaceOnly` | boolean | default `true` |
| `allowedReadPaths` | string[] | default `[]` |
| `allowedWritePaths` | string[] | default `[]` |

### `[tools.exec]`

| Field | Type | Default / Notes |
| --- | --- | --- |
| `defaultTimeoutMs` | integer | positive, default `60000` |

`[tools.exec.guardrails]`:

| Field | Type | Default / Notes |
| --- | --- | --- |
| `mode` | enum | `minimal`, `off`, `strict`; default `minimal` |
| `extraBlockedPatterns` | string[] | default `[]` |

### `[tools.pkg]`

| Field | Type | Default / Notes |
| --- | --- | --- |
| `enabled` | boolean | default `true` |
| `preferStructuredInstall` | boolean | default `true` |
| `allowExecFallback` | boolean | default `true` |
| `sudoNonInteractive` | boolean | default `true` |
| `allowedManagers` | string[] | default `[]` |

### `[tools.web]`

| Field | Type | Default / Notes |
| --- | --- | --- |
| `enabled` | boolean | default `true` |
| `searchMode` | enum | `hybrid`, `api-only`, `fallback-only`; default `hybrid` |
| `requestTimeoutMs` | integer | positive, default `15000` |
| `maxRedirects` | integer | `0..10`, default `5` |
| `maxFetchBytes` | integer | positive, max `5000000`, default `1000000` |
| `maxSearchResults` | integer | positive, max `20`, default `8` |
| `maxPagesPerRun` | integer | positive, max `10`, default `4` |

## `[security]`

| Field | Type | Default / Notes |
| --- | --- | --- |
| `auditLogEnabled` | boolean | default `true` |
| `secretsBackend` | enum | currently `encrypted-file` only |

## Validation Commands

Use these after editing:

```bash
openassist config validate --config "$HOME/.config/openassist/openassist.toml"
openassist setup show --config "$HOME/.config/openassist/openassist.toml"
openassist doctor
```

## Related Docs

- [Configuration File Guide](config-file-guide.md)
- [OpenAI Provider](../providers/openai.md)
- [Telegram Channel](../channels/telegram.md)
