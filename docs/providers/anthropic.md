# Anthropic Provider

Source/unreleased context admission uses the 1,000,000-token windows of current Opus/Sonnet/Haiku 5.5 and Fable/Mythos 5.1. Native count-tokens runs near budget pressure against the prepared request, including system/tools/images/thinking. Observed input adds cache-read and cache-creation tokens once. The normal 16,384 output limit and saved thinking budgets remain intact; reservation is separate from an optional input cost cap. Custom endpoints need verified overrides or the labeled fallback. See the [context engine](../architecture/context-engine.md).

Use the Anthropic route when you want the standard Anthropic API-key path in OpenAssist.

Source summary output is bounded by the exact catalog maximum and saved `maxOutputTokens`, preserving compatible manual-thinking budgets and required headroom. Impossible combinations require explicit repair. Oversized older image history can compact before unsafe mapping through strictly shrinking bounded checkpoints; current input and final token/byte admission remain intact.

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

The published [v0.2.4 notes](../releases/v0.2.4.md) collect the SDK, tool/replay and Haiku improvements below. Protected publication and four-target public installation pass; model/account access and paid API-credit testing remain separate from package verification.

Source integration checked October 16, 2026 uses the official `@anthropic-ai/sdk` `0.135.0` Messages API. Quickstart saves the API key in the operator env file; the runtime supplies that explicit credential to the adapter. Optional `workspaceId` selects a multi-workspace key's workspace. Configured `baseUrl`, credentials and workspace take precedence over ambient SDK endpoint/auth/workspace headers. SDK debug logging and automatic OpenTelemetry tracing are disabled; operational diagnostics stay in OpenAssist's sanitized runtime path. Published `v0.2.4` delivers these changes with SDK `0.135.0`; older immutable `v0.2.3` contains SDK `0.131.0` and needs an explicit update.

`claude-haiku-5-5` is available alongside the existing Opus 5.5 recommendation. Haiku defaults to adaptive thinking and medium effort, accepts all five efforts, and supports disabled thinking only at low/medium/high. Manual budgets and non-default sampling are unsupported. The total output allowance defaults to `16384`, bounded by `128000`, and includes thinking. Wizard offers only low/medium/high effort when Haiku thinking is disabled. Quickstart preserves compatible saved choices and asks before resetting incompatible manual settings. Haiku 4.5 remains supported with its existing manual-budget semantics.

Tools retain their canonical OpenAssist names in policy and audit records. The adapter maps incompatible names to deterministic API-safe identifiers and restores the canonical name on returned calls. It retains complete assistant tool turns even when thinking is absent, groups their results and skips duplicate audit placeholders after restart. New replay metadata is provider/model-scoped and bounded to 1 MiB/256 blocks; legacy records remain readable. Adaptive Haiku uses the existing prefix-binding beta controls. Disabled Haiku omits those controls and strips opaque thinking from replay while preserving text, tools and results, preventing stale-prefix errors with changing runtime guidance.

All validation for this source maintenance uses the real SDK with isolated HTTP/SSE fixtures. The operator deferred live API-credit testing; no live account, quota, model performance or channel success is certified. See [integration evidence](../execplans/anthropic-integration-2026-10-16.md), [Haiku migration](https://platform.claude.com/docs/en/models/haiku-5-5/migration-guide) and [thinking controls](https://platform.claude.com/docs/en/build-with-claude/effort).

Beginner path:

After a tool-round limit, a narrower follow-up retains completed results and the limit explanation without replaying the last calls twice. After an interrupted multi-tool turn, the adapter uses only reconciled completed call/result pairs when the native turn is incomplete. It does not execute an unfinished historical call automatically. Earlier synthetic replies carrying duplicate replay metadata also retain their text. No database migration is needed.

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
defaultModel = "claude-opus-5-5"
# Optional for supported thinking-capable Claude families:
# thinkingMode = "adaptive"
# thinkingEffort = "medium"
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

Fresh setup recommends `claude-opus-5-5` for complex autonomous work, with `claude-sonnet-5-5`, `claude-fable-5-1`, `claude-haiku-5-5` and `claude-haiku-4-5-20251001` alternatives. Opus 5.5 retains upstream medium effort and mandatory adaptive thinking. Anthropic reports Sonnet 5.5 as a faster, cheaper complement and Opus stronger for complex open-ended judgment; this recommendation is based on vendor evidence, not an OpenAssist live comparison. Sonnet 5.5 uses adaptive thinking with low through max effort, upstream high effort and a 16384-token default output limit. Disabled/manual thinking and the new between_tools mode are not supported for Sonnet 5.5 in OpenAssist. See [Anthropic's Sonnet 5.5 announcement](https://www.anthropic.com/claude-sonnet-5-5) and [our compatibility matrix](model-compatibility.md).

Sonnet 5 and Opus 5 support adaptive thinking and all five effort values. Haiku 4.5 supports manual budgets, not adaptive thinking or effort. Opus 5 cannot disable thinking at xhigh/max effort. Output tokens remain bounded: 4096 for the earlier catalog, or manual budget plus 1024 when larger; the new always-thinking models use 16384; an explicit output limit must exceed a manual budget. Thinking replay and tool results remain durable and hidden from channel-visible output.

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

Installation note: packaged releases include the runtime and adapter dependencies; existing provider/channel configuration stays in operator state across updates. For isolated developer testing, use dedicated test credentials and enable channels explicitly. See [developer testing](../operations/developer-testing.md) and [upgrade/recovery](../operations/upgrade-and-rollback.md).

The complete Claude inventory also recognizes Opus 4.7/4.8, Fable/Mythos 5 and deprecated Mythos Preview. Opus 4.7/4.8 accepts adaptive/disabled thinking with five efforts; thinking stays off when omitted, manual budgets and non-default sampling are unsupported. Fable/Mythos 5 requires adaptive thinking and defaults to high effort; it does not receive the 5.1 prefix-binding controls. Opus 4.5 pin/alias retains manual budgets with low/medium/high effort and a 64000-token output limit. Sonnet/Haiku 4.5 also has that output limit and no effort parameter. Mythos Preview retains adaptive/manual thinking and low/medium/high/max effort, with invitation-only access. Sonnet 4.5 was deprecated September 30 and retires November 30; active Haiku 4.5 has no announced retirement. Retired Sonnet 3.7, Sonnet/Opus 4 and Opus 4.1 IDs remain readable but block readiness/requests. See the [complete thinking and lifecycle matrices](model-compatibility.md#claude-settings-and-replay).
