# Anthropic Provider

Use the Anthropic route when you want the standard Anthropic API-key path in OpenAssist.

This route is the fastest way to use Anthropic in quickstart, while still leaving room for advanced provider OAuth configuration later when you explicitly need it.

## What This Route Does

- Auth model: API key by default
- Provider type in config: `anthropic`
- Supports tools: yes
- Supports inbound image understanding: yes
- Optional tuning: `thinkingBudgetTokens` for supported thinking-capable Claude families

## Choose Anthropic When

- you already have an Anthropic API key
- you want Claude-family models as the default provider
- you want optional thinking budgets but do not need linked-account setup for the first reply

## Quickstart Path

Beginner path:

```bash
openassist setup
```

Choose `First-time setup`, then select `Anthropic (API Key)`.

Direct quickstart path:

```bash
openassist setup quickstart \
  --install-dir "$HOME/openassist" \
  --config "$HOME/.config/openassist/openassist.toml" \
  --env-file "$HOME/.config/openassist/openassistd.env"
```

Quickstart behavior:

- stores the Anthropic API key in the env file
- saves the provider entry in `openassist.toml`
- keeps provider OAuth client configuration in wizard rather than the beginner flow

## Manual TOML Setup

Provider entry:

```toml
[[runtime.providers]]
id = "anthropic-main"
type = "anthropic"
defaultModel = "claude-sonnet-4-6"
# Optional for supported thinking-capable Claude families:
# thinkingBudgetTokens = 4096
```

Env file entry:

```text
OPENASSIST_PROVIDER_ANTHROPIC_MAIN_API_KEY=replace-me
```

Advanced optional OAuth example:

```toml
[runtime.providers.oauth]
authorizeUrl = "https://provider.example.com/oauth/authorize"
tokenUrl = "https://provider.example.com/oauth/token"
clientId = "your-client-id"
clientSecretEnv = "OPENASSIST_PROVIDER_ANTHROPIC_MAIN_OAUTH_CLIENT_SECRET"
```

When `oauth` is present, `authorizeUrl`, `tokenUrl`, and `clientId` are required. Use provider-documented values for the route you are configuring.

## Relevant Config Fields

Schema-backed provider fields:

- `id`
- `type = "anthropic"`
- `defaultModel`
- `baseUrl` (optional)
- `thinkingBudgetTokens` (optional, `1024..32000`)
- `oauth` (optional advanced configuration)
- `metadata` (optional)

## Thinking and Image Behavior

- Anthropic can inspect inbound image attachments.
- `thinkingBudgetTokens` is only sent on supported thinking-capable Claude families.
- If the selected model does not support thinking mode, OpenAssist omits the budget safely.
- Anthropic replay metadata stays internal to the provider/runtime path and is not exposed as raw internal reasoning in channels.

## Verify the Route

```bash
openassist config validate --config "$HOME/.config/openassist/openassist.toml"
openassist setup show --config "$HOME/.config/openassist/openassist.toml"
openassist auth status --provider anthropic-main
openassist doctor
```

What to look for:

- the `anthropic-main` provider appears in the effective config
- the provider is using API-key auth
- `doctor` shows the model and thinking-budget state

## Common Problems

API key missing:

```bash
openassist auth status --provider anthropic-main
openassist doctor
```

Thinking budget not taking effect:

- confirm the provider is `anthropic`
- confirm the model is a supported thinking-capable Claude family
- check `openassist doctor` or `openassist setup show` to see the saved value

Troubleshooting runbook:

- [`docs/operations/common-troubleshooting.md`](../operations/common-troubleshooting.md)

## Related Docs

- [OpenAI Provider](openai.md)
- [Codex Provider](codex.md)
- [Azure Foundry Provider](azure-foundry.md)
- [OpenAI-compatible Provider](openai-compatible.md)
- [Configuration File Guide](../configuration/config-file-guide.md)
