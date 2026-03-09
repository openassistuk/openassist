# Setup Quickstart and Setup Wizard

OpenAssist has two setup paths on purpose.

- `openassist setup`: interactive lifecycle hub and beginner entrypoint
- `openassist setup quickstart`: minimal first-reply onboarding
- `openassist setup wizard`: advanced section editor

They are not interchangeable.

If setup or repair still goes sideways after using the right path, use `docs/operations/common-troubleshooting.md` for the shared recovery commands.

Use the bare hub when you want the default beginner path:

```bash
openassist setup
```

On a TTY, the hub lets you choose first-time setup, repair, advanced configuration, service actions, safe update planning, or file-location/status review without remembering separate lifecycle commands up front.

## Quickstart

Run quickstart when the goal is to get from install to a real reply with the least possible operator decision load.

Command:

```bash
openassist setup quickstart \
  --install-dir "$HOME/openassist" \
  --config "$HOME/.config/openassist/openassist.toml" \
  --env-file "$HOME/.config/openassist/openassistd.env"
```

Quickstart owns only the essentials:

- confirm safe runtime defaults
- choose the main assistant name, persona, and ongoing objectives/preferences
- choose one primary provider
- complete the auth path for that provider route
- configure one primary channel
- keep channel setup in the supported first-class scope:
  - Telegram private chats, groups, forum topics
  - Discord guild text channels, threads, DMs
  - WhatsApp private chats and groups
- choose an access mode:
  - `Standard mode (recommended)`
  - `Full access for approved operators`
- confirm timezone
- run service install, restart, and health checks unless `--skip-service`
- disable the later first-chat identity reminder by default because onboarding already captured the main assistant identity

Quickstart success should leave you with:

- one provider configured
- one channel configured
- a healthy service, unless you explicitly skipped checks
- a first-reply checklist in the summary
- a clear `/status` path to discover the exact sender ID and session ID for later operator access changes

Quickstart now also includes a required review-before-save step so beginners can confirm the first-reply plan before files are written. The review actions are:

- `Save`
- `Edit runtime`
- `Edit assistant identity`
- `Edit provider`
- `Edit channel`
- `Edit timezone`
- `Abort`

When quickstart validation fails, the repair guidance is grouped by operator task instead of one flat issue list:

- provider auth
- channel auth or routing
- timezone or time
- service or health
- access or operator IDs

Quickstart rules:

- strict validation blocks incomplete first-reply setup by default
- `--allow-incomplete` adds an explicit degraded-save path
- recovery flows remain retry-first; skip is available only when the flow allows degraded continuation
- guided timezone selection stays `country or region -> city`
- timezone confirmation shows the selected zone and uses a simple `Y/n` confirmation
- wildcard bind addresses still use loopback health probes
- OpenAI stays the API-key route in quickstart and wizard
- Codex stays the separate OpenAI account-login route and quickstart can complete its account linking during onboarding
- Anthropic stays API-key-first for the fastest first reply; provider OAuth client configuration still belongs in wizard
- legacy `openai + oauth` configs remain readable for compatibility, but new account-login installs should use `codex`
- account linking later still uses `openassist auth start --provider <provider-id> --account default --open-browser`
- quickstart only asks for approved operator IDs if you opt into full access
- if you opt into full access before you know the operator IDs, quickstart offers a return path back to standard mode instead of failing

Quickstart intentionally does not own:

- extra providers
- extra channels
- scheduler task authoring
- native web tuning
- advanced tools and security changes

## Wizard

Run wizard when you need to edit configuration beyond first-reply essentials.

Command:

```bash
openassist setup wizard \
  --config "$HOME/.config/openassist/openassist.toml" \
  --env-file "$HOME/.config/openassist/openassistd.env" \
  --install-dir "$HOME/openassist"
```

Wizard sections:

- basic runtime and defaults
- providers, models, and advanced provider controls
- channels and chat destinations
- scheduling and time
- advanced tools and security

These labels now intentionally match the lifecycle language used by quickstart summaries and doctor output so the two setup paths read like one system instead of separate tools.

Wizard access behavior:

- `Basic runtime and access mode` lets you choose `Standard mode`, `Full access for approved operators`, or `Custom advanced access settings`
- `Channels, allowlists, and operator access` keeps chat allowlists separate from approved operator accounts
- Discord DM allow-lists stay separate from guild or thread allow-lists so beginners can tell “where the bot may reply” from “which direct-message users may use it”
- approved operator IDs decide who may use `/access full` or receive automatic full access defaults on that channel
- channel allowlists still decide who may message the bot at all

Use wizard for:

- advanced runtime changes
- later edits to the global main assistant identity or re-enabling the first-chat identity reminder
- additional providers or provider OAuth config
- choosing between the four first-class provider routes:
  - OpenAI (API Key)
  - Codex (OpenAI account login)
  - Anthropic (API Key)
  - OpenAI-compatible
- advanced provider-native reasoning controls:
  - OpenAI `reasoningEffort` (`Default`, `low`, `medium`, `high`, `xhigh`)
  - Codex `reasoningEffort` (`Default`, `low`, `medium`, `high`, `xhigh`)
  - Anthropic `thinkingBudgetTokens` (blank disables it)
  - OpenAI-compatible stays unchanged in this release
- additional channels or non-default channel behavior
- Discord DM allow-lists or other channel-specific scope changes
- scheduler task and timing changes
- native web settings
- advanced tools, workspace, and security posture

Provider reasoning-control notes:

- Quickstart now exposes the same beginner-facing reasoning-effort choice for OpenAI and Codex.
- Wizard remains the full provider-tuning surface.
- Safe default is unset, which means OpenAssist sends no provider-specific reasoning/thinking parameter.
- OpenAssist omits unsupported request fields automatically:
  - OpenAI reasoning effort is only sent on supported Responses API model families.
  - Codex reasoning effort is only sent on supported Codex Responses-model families.
  - Anthropic thinking budget is only sent on supported thinking-capable Claude families.
- If your configured default model does not match a supported family, setup validation warns but still saves safely.

Provider-route notes:

- OpenAI remains the public API-key route in setup and docs.
- Codex is the public OpenAI account-login route and is intentionally Codex-only in this release.
- Codex does not ask for a custom base URL in the normal wizard provider editor.
- Codex account linking is headless-friendly: OpenAssist can print the authorization URL, pause so you can copy or open it on another device, and accept either the full callback URL or a pasted code when you complete the login.
- The default Codex browser redirect is `http://localhost:1455/auth/callback`; if that localhost page cannot load on a VPS, copy the full URL from the browser address bar and paste it back into OpenAssist.
- Automatic browser launch is best-effort only. If the local host cannot open a browser, OpenAssist still prints the URL and keeps the account-link flow usable.
- OpenAssist does not present Codex as generic ChatGPT API auth for arbitrary OpenAI models.
- Existing mixed `openai + oauth` configs still load for compatibility, but new account-login installs should use `codex`.

Wizard is safe to re-run after install, after a successful quickstart, and after upgrades when you need to edit advanced settings instead of redoing first-run onboarding.

## Post-Save Behavior

Wizard saves are operational by default, not just config writes.

After a save, wizard:

1. writes the config and env file
2. creates a backup when the config already exists
3. restarts the service
4. checks daemon health
5. checks time status
6. checks scheduler status

If checks fail, wizard offers:

- retry
- skip
- abort

Use `--skip-post-checks` only when you intentionally want to save without operational validation.

If you skip or abort post-save checks, follow up with:

```bash
openassist service restart
openassist service health
openassist doctor
```

## Secret Handling

Setup flows keep secret values in the env file and keep config references as `env:VAR_NAME`.

Examples:

```toml
botToken = "env:OPENASSIST_CHANNEL_TELEGRAM_MAIN_BOT_TOKEN"
```

```toml
clientSecretEnv = "OPENASSIST_PROVIDER_ANTHROPIC_MAIN_OAUTH_CLIENT_SECRET"
```

Important rules:

- plaintext secret-like channel settings are rejected
- provider OAuth `clientSecretEnv` must be a valid env-var name
- Unix secret-bearing files are kept owner-only where the host supports it

## Related Commands

Show effective config:

```bash
openassist setup show --config "$HOME/.config/openassist/openassist.toml"
```

Edit env values interactively:

```bash
openassist setup env --env-file "$HOME/.config/openassist/openassistd.env"
```

Validate lifecycle readiness after setup:

```bash
openassist doctor
openassist service health
```
