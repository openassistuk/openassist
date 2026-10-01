# OpenAI Provider

Use the OpenAI route when you want the standard OpenAI API-key path in OpenAssist.

This is the beginner-friendly route for operators who already have an OpenAI API key and want the fastest path to a first reply.

## What This Route Does

- Auth model: API key by default
- Provider type in config: `openai`
- Supports tools: yes
- Supports inbound image understanding: yes
- Optional tuning: model-filtered `reasoningEffort` and independent `reasoningMode` for supported Responses models

OpenAssist keeps OpenAI and Codex separate on purpose:

- `openai` is the public API-key route
- `codex` is the separate OpenAI account-login route

## Choose OpenAI When

- you already manage an OpenAI API key
- you want the simplest quickstart flow
- you want image-capable chat without linked-account setup
- you want optional reasoning-effort tuning later in wizard

Use the separate [Codex](codex.md) route instead when you want OpenAI account login rather than API-key auth.

## Quickstart Path

The simplest path is:

```bash
openassist setup
```

Choose `First-time setup`, then select `OpenAI (API Key)` as the provider route.

If you prefer the direct scripted onboarding path:

```bash
openassist setup quickstart \
  --install-dir "$HOME/openassist" \
  --config "$HOME/.config/openassist/openassist.toml" \
  --env-file "$HOME/.config/openassist/openassistd.env"
```

Quickstart will:

- create an `openai` provider entry in `openassist.toml`
- store the API key in the env file, not in the TOML
- offer `Default` plus the reasoning efforts supported by the selected model: older GPT-6 Sol/Luna accept `none`, `low`, `medium`, `high`, `xhigh`, `max`; GPT-6.1 Sol and Astra exclude `none`; fresh GPT-6.1 Sol setup suggests `xhigh`

Leaving quickstart on `Default` keeps `reasoningEffort` unset and omits the effort parameter. It does not disable reasoning or clear an independently configured execution mode; cataloged reasoning models still request opaque replay content.

## Manual TOML Setup

Provider entry:

```toml
[[runtime.providers]]
id = "openai-main"
type = "openai"
defaultModel = "gpt-6.1-sol"
# Optional for supported Responses-model families:
reasoningEffort = "xhigh"
```

Env file entry:

```text
OPENASSIST_PROVIDER_OPENAI_MAIN_API_KEY=replace-me
```

OpenAssist derives provider API-key variable names from the provider ID:

- pattern: `OPENASSIST_PROVIDER_<PROVIDER_ID>_API_KEY`
- `openai-main` becomes `OPENASSIST_PROVIDER_OPENAI_MAIN_API_KEY`

## Relevant Config Fields

Main provider fields accepted by the schema:

- `id`
- `type = "openai"`
- `defaultModel`
- `baseUrl` (optional)
- `reasoningEffort` (optional, `none|low|medium|high|xhigh|max`, filtered by the exact model and route)
- `reasoningMode` (optional, `standard|pro`, only for cataloged supporting models; wizard exposes this independently of effort)
- `metadata` (optional)

Advanced provider OAuth fields are also supported in the schema for explicit operator-managed flows, but the public beginner path for OpenAI remains API-key auth.

For broader config structure, use:

- [`docs/configuration/config-file-guide.md`](../configuration/config-file-guide.md)
- [`docs/configuration/config-reference.md`](../configuration/config-reference.md)

## Verify the Route

After saving config:

```bash
openassist config validate --config "$HOME/.config/openassist/openassist.toml"
openassist setup show --config "$HOME/.config/openassist/openassist.toml"
openassist auth status --provider openai-main
openassist doctor
```

What to look for:

- config validates cleanly
- `setup show` lists the `openai-main` provider
- `auth status` reports API-key auth for the provider
- `doctor` shows the primary provider route, model, and reasoning state

## Image, Tool, and Reasoning Behavior

- OpenAI can inspect inbound images when the channel supplies image attachments.
- OpenAI can receive runtime-owned tool schemas when the current session is allowed to use tools.
- `reasoningEffort` is only sent on supported Responses-model families.
- Unknown/custom model IDs receive no inferred optional reasoning effort. A known model with an unsupported explicit effort fails validation; unverified `reasoningMode` also fails validation. Choose Default or a supported value in wizard.

## Common Problems

API key missing or invalid:

```bash
openassist auth status --provider openai-main
openassist service health
openassist doctor
```

If OpenAssist is responding but image understanding is not working, confirm that:

- the active channel supports inbound images
- the uploaded file stayed within attachment limits
- you are using `openai`, `codex`, `anthropic`, or `azure-foundry`, not `openai-compatible`

If you need a richer troubleshooting path, start with:

- [`docs/operations/common-troubleshooting.md`](../operations/common-troubleshooting.md)

## Modernization compatibility

Fresh setup recommends `gpt-6.1-sol` with `xhigh` effort; Astra (`gpt-6-astra`), Luna (`gpt-6-luna`) and older Sol (`gpt-6-sol`) are alternatives. GPT-6.1 Sol supports low, medium, high, xhigh and max; it excludes none, omits temperature and uses Responses for tools. Xhigh is an OpenAssist recommendation and can increase reasoning-token cost and latency; Default keeps the upstream medium effort. Saved API-key model IDs remain unchanged. Capability checks use exact catalog entries, not family-name matching.

OpenAI and Anthropic OAuth token-exchange failures expose only a sanitized HTTP status or validation error. Upstream response bodies and status text are never included in these errors; malformed token fields are rejected before credentials are stored. Existing callback, PKCE, refresh-token and expiry metadata remain supported.

GPT-6 uses Responses for tool calls. Optional `reasoningMode = "standard"` or `"pro"` is independent of effort; leaving it unset omits mode. Pro increases model work, latency and potential cost. Older Sol/Luna accept none through max; GPT-6.1 Sol and Astra exclude none. Temperature is always omitted for GPT-6.1 Sol/Astra and sent for older Sol/Luna only with explicit none. See [the verified matrix](model-compatibility.md).

Responses output items with opaque reasoning or message phase are now retained in bounded, provider/model-scoped durable metadata. Tool-call audit rows are deduplicated on replay. API-key authentication is unchanged; see [harness/auth readiness](../operations/provider-channel-readiness.md).

## Related Docs

- [Codex Provider](codex.md)
- [Anthropic Provider](anthropic.md)
- [Azure Foundry Provider](azure-foundry.md)
- [OpenAI-compatible Provider](openai-compatible.md)
- [Quickstart on Linux and macOS](../operations/quickstart-linux-macos.md)
- [Setup Quickstart and Setup Wizard](../operations/setup-wizard.md)

Installation note: packaged releases include the runtime and adapter dependencies; existing provider/channel configuration stays in operator state across updates. For isolated developer testing, use dedicated test credentials and enable channels explicitly. See [developer testing](../operations/developer-testing.md) and [upgrade/recovery](../operations/upgrade-and-rollback.md).

The full October 1 catalog includes GPT-6/6.1, GPT-5.6 (including the verified `gpt-5.6` Sol alias), GPT-5.5/Pro, GPT-5.4 Nano/Pro, the other standalone Pro/o-series families, `chat-latest` and exact API snapshot pins. Original GPT-5/Mini/Nano offers `minimal`; later models do not. Standalone Pro IDs use Responses and their own effort ranges. Restricted Daybreak IDs use verified Responses/tool transport without inferred tuning. Setup readiness/status warn before announced retirements; retired API IDs reject requests before transport. Saved IDs remain readable. See the [full inventory and dated lifecycle matrix](model-compatibility.md#full-conversational-catalog).

Restricted Daybreak models declare reasoning replay independently of effort controls: Responses requests ask for encrypted reasoning content and retain it through the existing bounded, session/model-scoped replay path without exposing raw reasoning.
