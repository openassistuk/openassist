# Configuration Reference

Managed applications live under `~/.local/share/openassist/install`, while canonical operator config/data paths remain unchanged. `OPENASSIST_STATE_ROOT` redirects CLI and daemon defaults to `<root>/config` and `<root>/share` for isolated instances. Install-state schema version 2 records active/previous applications and ownership; lifecycle report version 4 distinguishes release/source. Update notification on/off preferences are configured through `openassist update notifications <mode>`, not TOML.

`update-check.json` beside the install record is a disposable versioned status cache: local check time, availability status and an explicit-target boolean only. It contains no downloaded versions, commits or catalogue text. Old unversioned caches are ignored and refreshed on the next permitted check. Use `openassist update check` for fresh target details; no TOML cache or network-policy override is provided.

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
| `type` | enum | `openai`, `codex`, `anthropic`, `azure-foundry`, `openai-compatible` |
| `defaultModel` | string | required |
| `baseUrl` | string | optional URL |
| `metadata` | record | optional |

### OpenAI

```toml
[[runtime.providers]]
id = "openai-main"
type = "openai"
defaultModel = "gpt-6-sol"
# reasoningEffort = "medium"
```

Additional fields:

- `reasoningEffort`: `none`, `low`, `medium`, `high`, `xhigh`, `max` (model-dependent)
- `reasoningMode`: optional `standard` or `pro`, only for cataloged supporting models; independent of effort, with omission preserving the provider default
- optional `oauth` object for advanced provider-managed OAuth configuration

### Codex

```toml
[[runtime.providers]]
id = "codex-main"
type = "codex"
defaultModel = "gpt-6-sol"
# reasoningEffort = "medium"
```

Additional fields:

- `reasoningEffort`: `none`, `low`, `medium`, `high`, `xhigh`, `max` (model-dependent)

Codex is the separate account-login route. Linked-account auth is managed through `openassist auth ...`, not by storing a normal API key in the TOML.

### Anthropic

```toml
[[runtime.providers]]
id = "anthropic-main"
type = "anthropic"
defaultModel = "claude-sonnet-5"
# thinkingMode = "adaptive"
# thinkingEffort = "high"
```

Additional fields:

- `thinkingMode`: optional `adaptive`, `enabled` (manual), or `disabled`
- `thinkingEffort`: optional `low`, `medium`, `high`, `xhigh`, or `max`, where supported
- `thinkingBudgetTokens`: integer `1024..32000`, only for manual-thinking models
- `maxOutputTokens`: optional integer `1..128000`, covering thinking plus visible output; model-specific limits also apply (Haiku 4.5: `64000`). Must exceed a configured manual budget. Default is `16384` for Opus 5.5/Fable 5.1/Mythos 5.1; earlier models use `4096` or manual budget plus `1024`, whichever is larger.
- `workspaceId`: optional Claude Console ID matching `wrkspc_` followed by letters or numbers; sent as `anthropic-workspace-id` for multi-workspace keys. Omit for workspace-scoped keys. This is an identifier, not a credential.
- optional `oauth` object for advanced provider-managed OAuth configuration

### Azure Foundry

```toml
[[runtime.providers]]
id = "azure-foundry-main"
type = "azure-foundry"
defaultModel = "gpt-5-deployment"
authMode = "entra"
resourceName = "your-resource-name"
endpointFlavor = "openai-resource"
# Optional but recommended when the deployment name hides the model family:
# underlyingModel = "gpt-6-sol"
# Optional for supported Responses-model families:
# reasoningEffort = "medium"
# Optional advanced override:
# baseUrl = "https://your-resource-name.openai.azure.com/openai/v1"
```

Additional fields:

- `authMode`: `api-key` or `entra`
- `resourceName`: Azure resource host prefix used to derive the endpoint
- `endpointFlavor`: `openai-resource` or `foundry-resource`
- `underlyingModel`: optional model-family hint used for reasoning and compatibility guidance
- `reasoningEffort`: optional, `none`, `low`, `medium`, `high`, `xhigh`, `max` (model-dependent)
- `reasoningMode`: optional `standard` or `pro`; requires a cataloged supporting `underlyingModel`. An Azure deployment name never establishes capabilities.

Azure Foundry sends the deployment name in `defaultModel`. This route uses Azure resource-style `/openai/v1/` endpoints only and the Responses API only. For Entra host auth, the optional service-principal env vars are global process settings: `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, and `AZURE_CLIENT_SECRET`.

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

Where supported, `oauth` may contain these required fields:

- `authorizeUrl`
- `tokenUrl`
- `clientId`

Optional fields:

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
- WhatsApp operator IDs are only schema-validated as non-empty strings; operators should copy the exact sender ID or JID shown by `/status`.
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

## Modernization compatibility

Reasoning options are filtered by the exact cataloged route/model. OpenAI API GPT-6 Sol/Luna accept `none` through `max`; OpenAI Astra excludes `none`. Codex GPT-6 Astra/Sol/Luna all exclude `none`. Azure GPT-6 Astra/Sol/Luna all include `none`, using a verified `underlyingModel`. See the [route-specific matrix](../providers/model-compatibility.md#gpt-6-settings-by-route), including compatibility caveats. `reasoningMode` belongs only to OpenAI API and Azure; Codex rejects it.

Sonnet 5 and Opus 5 support adaptive or disabled thinking and reject manual budgets; Opus 5 requires adaptive thinking at `xhigh`/`max`. Opus 5.5/Fable 5.1/Mythos 5.1 require adaptive thinking at every effort. Haiku 4.5 supports manual thinking and no effort. Budget-only settings on compatible older models retain their manual meaning. `Default` leaves the operator override unset; it does not turn off provider-default thinking or remove required replay/binding controls. Unknown models remain accepted without inferred optional capabilities; explicit unsupported Anthropic tuning and unverified `reasoningMode` are rejected.

Anthropic compatibility: the verified `claude-opus-4-5` alias retains manual `thinkingBudgetTokens` exactly like `claude-opus-4-5-20251101`. Quickstart preserves compatible saved thinking settings. If a selected model rejects them (for example, Sonnet 5 with an old manual budget), quickstart asks before resetting to provider defaults. The default answer is No, which returns to model selection so the operator can keep the previous model/settings. Saving remains subject to normal validation; wizard provides the full thinking editor.

Quickstart and wizard can set or clear Anthropic `workspaceId`; wizard exposes the full reasoning, thinking and output-limit controls listed above. See [authentication readiness](../operations/provider-channel-readiness.md) for credential handling and live checks.

## Related Docs

- [Configuration File Guide](config-file-guide.md)
- [OpenAI Provider](../providers/openai.md)
- [Telegram Channel](../channels/telegram.md)
