# OpenAI Provider

Use the OpenAI route when you want the standard OpenAI API-key path in OpenAssist.

This is the beginner-friendly route for operators who already have an OpenAI API key and want the fastest path to a first reply.

## What This Route Does

- Auth model: API key by default
- Provider type in config: `openai`
- Supports tools: yes
- Supports inbound image understanding: yes
- Optional tuning: `reasoningEffort` for supported Responses API model families

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
- offer a beginner-facing reasoning-effort choice:
  - `Default`
  - `Low`
  - `Medium`
  - `High`
  - `XHigh`

Leaving quickstart on `Default` keeps `reasoningEffort` unset so OpenAssist sends no provider-specific reasoning parameter.

## Manual TOML Setup

Provider entry:

```toml
[[runtime.providers]]
id = "openai-main"
type = "openai"
defaultModel = "gpt-5.4"
# Optional for supported Responses-model families:
# reasoningEffort = "medium"
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
- `reasoningEffort` (optional, `low|medium|high|xhigh`)
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
- If the selected model does not support reasoning effort, OpenAssist omits the parameter safely.

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

## Related Docs

- [Codex Provider](codex.md)
- [Anthropic Provider](anthropic.md)
- [Azure Foundry Provider](azure-foundry.md)
- [OpenAI-compatible Provider](openai-compatible.md)
- [Quickstart on Linux and macOS](../operations/quickstart-linux-macos.md)
- [Setup Quickstart and Setup Wizard](../operations/setup-wizard.md)
