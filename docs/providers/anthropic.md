# Anthropic Provider

Use the Anthropic route when you want the standard Anthropic API-key path in OpenAssist.

This route is the fastest way to use Anthropic in quickstart, while still leaving room for advanced provider OAuth configuration later when you explicitly need it.

## What This Route Does

- Auth model: API key by default
- Provider type in config: `anthropic`
- Supports tools: yes
- Supports inbound image understanding: yes
- Optional tuning: model-filtered `thinkingMode` and `thinkingEffort`, manual `thinkingBudgetTokens` where supported, and `maxOutputTokens`
- Optional workspace selection: `workspaceId` for multi-workspace keys

## Choose Anthropic When

- you already have an Anthropic API key
- you want Claude-family models as the default provider
- you want Claude thinking controls without linked-account setup for the first reply

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
- asks for optional `workspaceId` (leave blank for workspace-scoped keys)
- saves the provider entry in `openassist.toml`
- keeps provider OAuth client configuration in wizard rather than the beginner flow

## Manual TOML Setup

Provider entry:

```toml
[[runtime.providers]]
id = "anthropic-main"
type = "anthropic"
defaultModel = "claude-sonnet-5"
# Optional for supported thinking-capable Claude families:
# thinkingMode = "adaptive"
# thinkingEffort = "high"
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
- `thinkingMode` (optional, `adaptive|enabled|disabled`, filtered by model)
- `thinkingEffort` (optional, `low|medium|high|xhigh|max`, filtered by model)
- `thinkingBudgetTokens` (optional, `1024..32000`, manual-thinking models only)
- `maxOutputTokens` (optional, `1..128000`, subject to the model limit; thinking plus visible output, and greater than any manual budget)
- `workspaceId` (optional Claude Console `wrkspc_...` identifier for multi-workspace keys; never the API key)
- `oauth` (optional advanced configuration)
- `metadata` (optional)

## Thinking and Image Behavior

- Anthropic can inspect inbound image attachments.
- `thinkingBudgetTokens` is only sent on supported thinking-capable Claude families.
- Unsupported or conflicting thinking settings fail validation with repair guidance. Sonnet 5 and Opus 5 use adaptive thinking by default and reject manual budgets. Legacy budget-only settings still enable manual thinking on cataloged compatible models such as Sonnet 4.6 and Haiku 4.5. Unset controls preserve provider defaults; Opus 5.5/Fable 5.1/Mythos 5.1 still send the mandatory adaptive prefix-binding controls described below.
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
- `doctor` shows the model, effective thinking mode/effort or manual budget, and the configured output limit where applicable

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

## Modernization compatibility

Fresh setup recommends `claude-sonnet-5`, with `claude-opus-5-5`, `claude-fable-5-1` and `claude-haiku-4-5-20251001` alternatives. Sonnet 5 and Opus 5 support adaptive thinking and all five effort values. Haiku 4.5 supports manual budgets, not adaptive thinking or effort. Opus 5 cannot disable thinking at xhigh/max effort. Output tokens remain bounded: 4096 for the earlier catalog, or manual budget plus 1024 when larger; the new always-thinking models use 16384; an explicit output limit must exceed a manual budget. Thinking replay and tool results remain durable and hidden from channel-visible output.

OpenAI and Anthropic OAuth token-exchange failures expose only a sanitized HTTP status or validation error. Upstream response bodies and status text are never included in these errors; malformed token fields are rejected before credentials are stored. Existing callback, PKCE, refresh-token and expiry metadata remain supported.

Anthropic compatibility: the verified `claude-opus-4-5` alias retains manual `thinkingBudgetTokens` exactly like `claude-opus-4-5-20251101`. Quickstart preserves compatible saved thinking settings. If a selected model rejects them (for example, Sonnet 5 with an old manual budget), quickstart asks before resetting to provider defaults. The default answer is No, which returns to model selection so the operator can keep the previous model/settings. Saving remains subject to normal validation; wizard provides the full thinking editor.

Opus 5.5 (`claude-opus-5-5`), Fable 5.1 (`claude-fable-5-1`) and invitation-only Mythos 5.1 (`claude-mythos-5-1`) support adaptive thinking only. All five efforts are accepted; omitted effort defaults to medium on Opus 5.5 and high on Fable/Mythos. Disabled/manual thinking is rejected. New models default to 16384 total output tokens; maxOutputTokens can override that ceiling (1..128000), including thinking and visible text. Higher effort may need a larger budget. Requests stream internally and fold to a completed reply. These models send the thinking-binding-controls-2026-08-01 beta header with prefix_mismatch_behavior=drop_block so changed runtime guidance, tools or trimmed history do not invalidate replay. Valid signed blocks and tool results are preserved; raw thinking stays hidden. See [compatibility and limits](model-compatibility.md).

Optional `workspaceId = "wrkspc_..."` selects the workspace required by newer multi-workspace personal/service-account keys. Quickstart and wizard prompt for it; leave it blank for workspace-scoped keys. Explicit access tokens use bearer auth and explicit API keys retain the SDK key header, without inheriting the other credential type from the environment. API-key expiration requires rotation. See [authentication readiness](../operations/provider-channel-readiness.md).

## Related Docs

- [OpenAI Provider](openai.md)
- [Codex Provider](codex.md)
- [Azure Foundry Provider](azure-foundry.md)
- [OpenAI-compatible Provider](openai-compatible.md)
- [Configuration File Guide](../configuration/config-file-guide.md)
