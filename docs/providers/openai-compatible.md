# OpenAI-compatible Provider

Use the OpenAI-compatible route when you are connecting OpenAssist to an API-compatible backend instead of the built-in OpenAI, Codex, Anthropic, or Azure Foundry integrations.

This route is intentionally simpler than the built-in providers and stays text-only for images in the current release.

## What This Route Does

- Auth model: API key or access token supplied by the compatible backend
- Provider type in config: `openai-compatible`
- Supports tools: yes
- Supports inbound image understanding: no
- Optional tuning: none in this release

## Choose OpenAI-compatible When

- you are pointing OpenAssist at a compatible local or hosted backend
- you need a custom `baseUrl`
- you understand that image inputs are not supported on this route

Use the built-in [OpenAI](openai.md), [Codex](codex.md), [Anthropic](anthropic.md), or [Azure Foundry](azure-foundry.md) routes when you want first-class provider-specific behavior instead.

## Quickstart Path

Beginner path:

```bash
openassist setup
```

Choose `First-time setup`, then select `OpenAI-compatible`.

Direct path:

```bash
openassist setup quickstart \
  --install-dir "$HOME/openassist" \
  --config "$HOME/.config/openassist/openassist.toml" \
  --env-file "$HOME/.config/openassist/openassistd.env"
```

Quickstart and wizard require the model ID served by your backend, with no vendor model prefilled. They also prompt for the backend URL and auth material. GPT-6.1 Sol requires Responses for tool calling; use the OpenAI route with a compatible custom base URL for that contract. Generic Chat Completions endpoints keep their own model and parameter requirements.

## Manual TOML Setup

Provider entry:

```toml
[[runtime.providers]]
id = "compat-main"
type = "openai-compatible"
defaultModel = "your-model-name"
baseUrl = "http://127.0.0.1:1234/v1"
```

Env file entry:

```text
OPENASSIST_PROVIDER_COMPAT_MAIN_API_KEY=replace-me
```

## Relevant Config Fields

Schema-backed provider fields:

- `id`
- `type = "openai-compatible"`
- `defaultModel`
- `baseUrl`
- `metadata` (optional)

Unlike the built-in OpenAI or Codex routes, there is no provider-specific reasoning-effort field on this route in the current release.

## Verification

```bash
openassist config validate --config "$HOME/.config/openassist/openassist.toml"
openassist setup show --config "$HOME/.config/openassist/openassist.toml"
openassist auth status --provider compat-main
openassist doctor
```

What to look for:

- config validates
- the provider appears with route `OpenAI-compatible`
- auth status reports API-key or token-based readiness

## Image and Attachment Limitations

OpenAI-compatible stays text-only for images in this release.

That means:

- text from the message still reaches the provider
- captions and extracted text from supported documents still help
- the provider must not imply it inspected an image binary when it did not

If you need image-capable chat, use OpenAI, Codex, Anthropic, or Azure Foundry instead.

## Common Problems

Backend URL wrong or unreachable:

```bash
openassist service health
openassist auth status --provider compat-main
openassist doctor
```

If the backend accepts chat but tool calls fail, confirm the backend really supports the API-compatible tool-calling shape OpenAssist is using.

## Modernization compatibility

Custom backend model IDs remain operator-supplied. The current-model catalog does not infer optional reasoning or thinking controls for this route; backend authentication and text-only image behavior remain unchanged.

The current-model catalog does not imply optional reasoning support for arbitrary compatible servers. This route retains backend-defined model IDs and its existing Chat Completions contract; GPT-6 reasoning/tool use should use the OpenAI, Codex or Azure Responses route. See [model compatibility](model-compatibility.md).

The current harness refresh does not add Responses replay or vendor-specific workspace auth to this Chat Completions route. Backend-defined credentials and capability boundaries remain unchanged; see [route-specific readiness](../operations/provider-channel-readiness.md).

## Related Docs

- [OpenAI Provider](openai.md)
- [Azure Foundry Provider](azure-foundry.md)
- [Configuration Reference](../configuration/config-reference.md)
- [Common Troubleshooting](../operations/common-troubleshooting.md)

Installation note: packaged releases include the runtime and adapter dependencies; existing provider/channel configuration stays in operator state across updates. For isolated developer testing, use dedicated test credentials and enable channels explicitly. See [developer testing](../operations/developer-testing.md) and [upgrade/recovery](../operations/upgrade-and-rollback.md).
