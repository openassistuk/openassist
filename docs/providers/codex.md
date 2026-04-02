# Codex Provider

Use the Codex route when you want the separate OpenAI account-login path in OpenAssist.

This route is intentionally Codex-only in the current release. It is not documented as generic ChatGPT API auth for arbitrary OpenAI models.

## What This Route Does

- Auth model: linked OpenAI account login
- Provider type in config: `codex`
- Supports tools: yes
- Supports inbound image understanding: yes
- Optional tuning: `reasoningEffort` for supported Codex Responses-model families

Codex setup success means OpenAssist has a chat-ready Codex/ChatGPT auth handle. Exchanging into a separate OpenAI API key is optional auxiliary metadata, not the definition of success.

## Choose Codex When

- you want the account-login route instead of managing an API key
- you are specifically using Codex-family or supported OpenAI/Codex models on this route
- you are comfortable completing a device-code or browser callback flow

Use [OpenAI](openai.md) instead when you want the standard OpenAI API-key route.

## Quickstart Path

The beginner path is:

```bash
openassist setup
```

Choose `First-time setup`, then select `Codex (OpenAI account login)`.

Quickstart behavior:

- saves a `codex` provider entry
- does not ask for a custom Codex base URL in normal flows
- recommends device code for VPS or remote hosts
- keeps browser callback/manual paste available as the fallback path
- only treats setup as complete when the linked account is chat-ready

Direct quickstart path:

```bash
openassist setup quickstart \
  --install-dir "$HOME/openassist" \
  --config "$HOME/.config/openassist/openassist.toml" \
  --env-file "$HOME/.config/openassist/openassistd.env"
```

Quickstart also exposes the same beginner-facing reasoning-effort choice as OpenAI:

- `Default`
- `Low`
- `Medium`
- `High`
- `XHigh`

## Manual TOML Setup

Provider entry:

```toml
[[runtime.providers]]
id = "codex-main"
type = "codex"
defaultModel = "gpt-5.4"
# Optional for supported Codex Responses-model families:
# reasoningEffort = "medium"
```

There is no API-key env entry required for the normal Codex route. Instead, link the account after the daemon is healthy:

```bash
openassist auth start --provider codex-main --device-code
```

Browser/manual fallback:

```bash
openassist auth start --provider codex-main --account default --open-browser
```

Manual completion fallback:

```bash
openassist auth complete --provider codex-main --callback-url "<full callback URL>" --base-url http://127.0.0.1:3344
```

The older split-state path remains supported:

```bash
openassist auth complete --provider codex-main --state <state> --code <code> --base-url http://127.0.0.1:3344
```

## Relevant Config Fields

Schema-backed provider fields:

- `id`
- `type = "codex"`
- `defaultModel`
- `baseUrl` (optional, advanced/manual only)
- `reasoningEffort` (optional, `low|medium|high|xhigh`)
- `metadata` (optional)

Normal operator setup should not prompt for a custom base URL. The built-in route uses the supported Codex login and chat endpoints.

## Headless and Remote-Host Guidance

Recommended path for VPS or remote hosts:

```bash
openassist auth start --provider codex-main --device-code
```

Important details:

- device code is the recommended path for headless hosts
- the default browser redirect is `http://localhost:1455/auth/callback`
- if that localhost page does not load on the machine where you approved the login, copy the full URL from the browser address bar and paste it back into quickstart or `openassist auth complete`
- missing local browser launchers are a fallback condition, not a fatal setup failure

## Verify the Route

```bash
openassist auth status --provider codex-main
openassist service health
openassist channel status
openassist doctor
```

What to look for:

- `auth status` shows the linked account is present
- `auth status` reports the current auth as chat-ready
- `doctor` shows the Codex route as the active primary provider

`openassist auth status` stays redacted, but it should still show:

- route
- linked-account presence
- active auth kind or method
- token expiry when known
- whether auth is chat-ready

## Upstream Request Contract Notes

Once linked, Codex chat requests preserve the upstream linked-account contract:

- top-level `instructions` built from the vendored Codex baseline plus bounded runtime guidance
- per-turn `session_id`
- `ChatGPT-Account-ID` when available
- upstream-aligned `/responses` fields such as `tool_choice="auto"`, `parallel_tool_calls=true`, `store=false`, and `stream=true`

OpenAssist consumes the upstream event stream and folds it back into the normal non-streaming chat contract before replies reach the channel.

That means a linked, chat-ready account plus a failing chat request should be treated as a provider request problem, not as missing auth.

## Common Problems

Linked account missing or incomplete:

```bash
openassist auth start --provider codex-main --device-code
openassist auth status --provider codex-main
openassist doctor
```

Auth is chat-ready but chat still fails:

```bash
openassist auth status --provider codex-main
openassist service health
openassist channel status
openassist service logs --lines 250
```

If `auth status` says the route is chat-ready and service/channel health are fine, remaining failures are likely upstream request-contract or provider-side failures, not login failures.

Start with:

- [`docs/operations/common-troubleshooting.md`](../operations/common-troubleshooting.md)

## Related Docs

- [OpenAI Provider](openai.md)
- [Azure Foundry Provider](azure-foundry.md)
- [Quickstart on Linux and macOS](../operations/quickstart-linux-macos.md)
- [Setup Quickstart and Setup Wizard](../operations/setup-wizard.md)
- [Common Troubleshooting](../operations/common-troubleshooting.md)
