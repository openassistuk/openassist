# OpenAI-compatible Provider

Use the OpenAI-compatible route when you are connecting OpenAssist to an API-compatible backend instead of the built-in OpenAI, Codex, or Anthropic integrations.

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

Use the built-in [OpenAI](openai.md), [Codex](codex.md), or [Anthropic](anthropic.md) routes when you want first-class provider-specific behavior instead.

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

Quickstart will prompt for the backend URL and the auth material the backend expects.

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

If you need image-capable chat, use OpenAI, Codex, or Anthropic instead.

## Common Problems

Backend URL wrong or unreachable:

```bash
openassist service health
openassist auth status --provider compat-main
openassist doctor
```

If the backend accepts chat but tool calls fail, confirm the backend really supports the API-compatible tool-calling shape OpenAssist is using.

## Related Docs

- [OpenAI Provider](openai.md)
- [Configuration Reference](../configuration/config-reference.md)
- [Common Troubleshooting](../operations/common-troubleshooting.md)
