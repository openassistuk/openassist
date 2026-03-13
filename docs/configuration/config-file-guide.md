# Configuration File Guide

This guide explains where OpenAssist keeps operator configuration, how the TOML and env file fit together, and which commands to use before you hand-edit anything.

Use this page when you want to understand the practical config workflow. Use [`config-reference.md`](config-reference.md) when you need the schema-backed field list.

## Default Operator File Layout

Fresh installs keep writable operator state outside the repo checkout:

- config: `~/.config/openassist/openassist.toml`
- overlays: `~/.config/openassist/config.d`
- env file: `~/.config/openassist/openassistd.env`
- install state: `~/.config/openassist/install-state.json`
- runtime data: `~/.local/share/openassist/data`
- runtime logs: `~/.local/share/openassist/logs`
- managed skills: `~/.local/share/openassist/skills`
- managed helper tools: `~/.local/share/openassist/data/helper-tools`

The root [`openassist.toml`](../../openassist.toml) file in the repo is a source-checkout sample, not the default installed operator config path.

## TOML vs Env File

OpenAssist splits configuration into two layers:

- `openassist.toml` stores normal runtime configuration
- `openassistd.env` stores secrets and secret-like values

Examples:

```toml
[[runtime.providers]]
id = "openai-main"
type = "openai"
defaultModel = "gpt-5.4"
```

```text
OPENASSIST_PROVIDER_OPENAI_MAIN_API_KEY=replace-me
```

Channel secret-like settings should use `env:VAR_NAME` references in the TOML:

```toml
botToken = "env:OPENASSIST_CHANNEL_TELEGRAM_MAIN_BOT_TOKEN"
```

Plaintext secret-like channel values are rejected by schema validation.

## The Safest Way to Edit Config

Use setup flows first:

- `openassist setup` for the beginner lifecycle hub
- `openassist setup quickstart` for minimal first-reply onboarding
- `openassist setup wizard` for advanced editing

Useful host-side commands:

```bash
openassist setup show --config "$HOME/.config/openassist/openassist.toml"
openassist setup env --env-file "$HOME/.config/openassist/openassistd.env"
openassist config validate --config "$HOME/.config/openassist/openassist.toml"
openassist doctor
```

Use those commands to inspect and validate before and after manual edits.

## Minimal Working Example

OpenAI plus Telegram:

```toml
[runtime]
bindAddress = "127.0.0.1"
bindPort = 3344
defaultProviderId = "openai-main"
defaultPolicyProfile = "operator"
operatorAccessProfile = "operator"

[runtime.assistant]
name = "OpenAssist"
persona = "Pragmatic, concise, and execution-focused local AI assistant."
operatorPreferences = ""
promptOnFirstContact = false

[[runtime.providers]]
id = "openai-main"
type = "openai"
defaultModel = "gpt-5.4"

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

[runtime.paths]
dataDir = "/absolute/path/to/openassist/data"
skillsDir = "/absolute/path/to/openassist/skills"
logsDir = "/absolute/path/to/openassist/logs"
```

Env file:

```text
OPENASSIST_PROVIDER_OPENAI_MAIN_API_KEY=replace-me
OPENASSIST_CHANNEL_TELEGRAM_MAIN_BOT_TOKEN=replace-me
```

Replace the example `runtime.paths` values with real absolute paths for the host you are configuring.

Then validate:

```bash
openassist config validate --config "$HOME/.config/openassist/openassist.toml"
openassist service health
openassist doctor
```

## Overlays

OpenAssist supports a config overlays directory at:

```text
~/.config/openassist/config.d
```

Use overlays when you want to keep the base file stable and apply smaller environment- or host-specific additions separately. The CLI resolves overlays relative to the selected base config path.

## Naming Patterns

Provider API-key env vars follow this pattern:

```text
OPENASSIST_PROVIDER_<PROVIDER_ID>_API_KEY
```

Provider OAuth client secrets follow this pattern:

```text
OPENASSIST_PROVIDER_<PROVIDER_ID>_OAUTH_CLIENT_SECRET
```

Channel secret env vars follow this pattern:

```text
OPENASSIST_CHANNEL_<CHANNEL_ID>_<SETTING_NAME>
```

Examples:

- `openai-main` -> `OPENASSIST_PROVIDER_OPENAI_MAIN_API_KEY`
- `telegram-main` + `botToken` -> `OPENASSIST_CHANNEL_TELEGRAM_MAIN_BOT_TOKEN`

## When to Use Quickstart, Wizard, or Manual Edits

Use quickstart when:

- you want one provider, one channel, and a first real reply fast

Use wizard when:

- you need extra providers or channels
- you need advanced provider tuning
- you need scheduler, tools, or security editing

Use manual TOML edits when:

- you already understand the schema
- you need repeatable source-controlled examples
- you are validating or templating operator configs

## Related Docs

- [Configuration Reference](config-reference.md)
- [OpenAI Provider](../providers/openai.md)
- [Telegram Channel](../channels/telegram.md)
- [Config Rollout and Rollback](../operations/config-rollout-and-rollback.md)
