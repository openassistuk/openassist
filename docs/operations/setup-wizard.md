# Setup Quickstart and Setup Wizard

For a named developer instance, use the setup command printed by `openassist dev test`. Setup saves credentials to that instance's env file; stop and rerun the foreground instance to load changes. These credentials are passed only to its daemon, never to Git/pnpm builds or the primary service. See [developer testing](developer-testing.md).

Setup resolves the recorded active application for both packaged and source installations. Packaged services use private Node. The hub also exposes update, rollback, interrupted-operation recovery and data-preserving uninstall, all using the shared lifecycle commands. Developer tracks remain outside beginner choices; see [developer testing](developer-testing.md).

OpenAssist has one primary setup hub and two stable subpaths.

- `openassist setup`: interactive lifecycle hub and beginner entrypoint
- `openassist setup quickstart`: minimal first-reply onboarding
- `openassist setup wizard`: advanced section editor

They are not interchangeable.

If setup or repair still goes sideways after using the right path, use `docs/operations/common-troubleshooting.md` for the shared recovery commands.

Route and config references for the choices you make in setup:

- provider guides: [`docs/providers/openai.md`](../providers/openai.md), [`docs/providers/codex.md`](../providers/codex.md), [`docs/providers/anthropic.md`](../providers/anthropic.md), [`docs/providers/azure-foundry.md`](../providers/azure-foundry.md), [`docs/providers/openai-compatible.md`](../providers/openai-compatible.md)
- channel guides: [`docs/channels/telegram.md`](../channels/telegram.md), [`docs/channels/discord.md`](../channels/discord.md), [`docs/channels/whatsapp-md.md`](../channels/whatsapp-md.md)
- config docs: [`docs/configuration/config-file-guide.md`](../configuration/config-file-guide.md), [`docs/configuration/config-reference.md`](../configuration/config-reference.md)

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
- Azure Foundry stays the Azure resource-style Responses-only route with API-key or Entra host auth
- legacy `openai + oauth` configs remain readable for compatibility, but new account-login installs should use `codex`
- account linking later uses `openassist auth start --provider <provider-id> --device-code` on headless or remote hosts, with `--open-browser` kept as the browser/manual fallback
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
- on Linux, the same section now also lets you choose `Hardened systemd sandbox` or `Unrestricted systemd filesystem access` for the daemon service
- `Channels, allowlists, and operator access` keeps chat allowlists separate from approved operator accounts
- Discord DM allow-lists stay separate from guild or thread allow-lists so beginners can tell “where the bot may reply” from “which direct-message users may use it”
- approved operator IDs decide who may use `/access full` or receive automatic full access defaults on that channel
- when you add approved operator IDs while the install is still in `Standard mode`, wizard now prompts to switch to `Full access for approved operators` immediately so filesystem tools do not stay workspace-only by accident
- after that switch on Linux, wizard immediately asks whether the systemd service should stay hardened or become unrestricted, with a second warning before saving unrestricted mode
- this Linux service mode is separate from chat access mode: `full-root` controls OpenAssist tool policy, while the systemd mode controls whether the daemon service keeps OpenAssist-added systemd hardening, including filesystem sandboxing
- channel allowlists still decide who may message the bot at all

Use wizard for:

- advanced runtime changes
- later edits to the global main assistant identity or re-enabling the first-chat identity reminder
- additional providers or provider OAuth config
- choosing between the five first-class provider routes:
  - OpenAI (API Key)
  - Codex (OpenAI account login)
  - Anthropic (API Key)
  - Azure Foundry
  - OpenAI-compatible
- advanced provider-native reasoning controls:
  - OpenAI `reasoningEffort` (model-filtered `Default`, `none`, `low`, `medium`, `high`, `xhigh`, `max`)
  - Codex `reasoningEffort` (model-filtered `Default`, `none`, `low`, `medium`, `high`, `xhigh`, `max`)
  - Azure Foundry `reasoningEffort` (model-filtered `Default`, `none`, `low`, `medium`, `high`, `xhigh`, `max`)
  - OpenAI/Azure `reasoningMode` (`Default`, `standard`, `pro`) when the selected model or Azure hint supports it; Pro can increase cost and latency. Codex has no mode field.
  - Anthropic `thinkingMode` / `thinkingEffort`, plus `thinkingBudgetTokens` on compatible manual-thinking models (blank clears the manual budget; thinking defaults remain model-specific)
  - Anthropic `maxOutputTokens` for total thinking plus visible output; blank uses the model-specific default
  - Anthropic `workspaceId` for multi-workspace keys; blank clears it, suitable for workspace-scoped keys
  - OpenAI-compatible asks for the backend's served model ID without prefilling an OpenAI model; its Chat Completions transport and tuning stay backend-defined
- additional channels or non-default channel behavior
- Discord DM allow-lists or other channel-specific scope changes
- scheduler task and timing changes
- native web settings
- advanced tools, workspace, and security posture

The effort lists above describe the available field values, not a promise that every model accepts every value. For GPT-6, Codex and OpenAI Astra exclude `none`, while Azure Astra includes it. Use the [model compatibility matrix](../providers/model-compatibility.md) for exact route choices, Claude thinking restrictions and output limits.

When one of those changes is provider-, channel-, or config-specific, use the matching reference page rather than relying only on the summary labels inside wizard:

- OpenAI: [`docs/providers/openai.md`](../providers/openai.md)
- Codex: [`docs/providers/codex.md`](../providers/codex.md)
- Anthropic: [`docs/providers/anthropic.md`](../providers/anthropic.md)
- Azure Foundry: [`docs/providers/azure-foundry.md`](../providers/azure-foundry.md)
- OpenAI-compatible: [`docs/providers/openai-compatible.md`](../providers/openai-compatible.md)
- Telegram: [`docs/channels/telegram.md`](../channels/telegram.md)
- Discord: [`docs/channels/discord.md`](../channels/discord.md)
- WhatsApp MD: [`docs/channels/whatsapp-md.md`](../channels/whatsapp-md.md)
- config guide: [`docs/configuration/config-file-guide.md`](../configuration/config-file-guide.md)

Provider reasoning-control notes:

- Quickstart exposes a beginner-facing reasoning-effort prompt for both OpenAI and Codex, with choices filtered independently by route and model.
- Wizard remains the full provider-tuning surface.
- Default leaves the operator override unset and preserves model defaults. It does not turn thinking off or remove required replay/binding controls; effort, execution mode and output limits are separate settings.
- OpenAI/Codex effort is sent only for an exact supported route/model; Azure additionally requires the configured deployment's cataloged underlying-model hint.
- Unknown/custom IDs remain accepted without inferred effort. Known incompatible efforts, unverified execution modes and unsupported/conflicting Anthropic thinking settings fail validation. Remove the override or choose a cataloged compatible model; do not interpret a warning about an unknown model as permission to send arbitrary tuning.

Provider-route notes:

- OpenAI remains the public API-key route in setup and docs.
- Codex is the public OpenAI account-login route and is intentionally Codex-only in this release.
- Azure Foundry is the Azure resource-style `/openai/v1/` route and uses the Responses API only.
- Azure Foundry setup asks for the Azure resource name, host flavor, deployment name, auth mode, and optional underlying model hint.
- Azure Foundry Entra auth uses `DefaultAzureCredential` on the host and does not use linked-account storage or `openassist auth start/complete`.
- Codex does not ask for a custom base URL in the normal wizard provider editor.
- Codex account linking is headless-friendly: OpenAssist can print the authorization URL, pause so you can copy or open it on another device, and accept either the full callback URL or a pasted code when you complete the login.
- The default Codex browser redirect is `http://localhost:1455/auth/callback`; if that localhost page cannot load on a VPS, copy the full URL from the browser address bar and paste it back into OpenAssist.
- Manual host-side completion can now use:

```bash
openassist auth complete --provider codex-main --callback-url "<full callback URL>" --base-url http://127.0.0.1:3344
```

- Automatic browser launch is best-effort only. If the local host cannot open a browser, OpenAssist still prints the URL and keeps the account-link flow usable.
- If the completion step still fails, OpenAssist should report a sanitized account-linking problem, not a generic service failure or raw `500`.
- A fresh quickstart that chooses Codex now replaces the seeded `openai-main` placeholder provider instead of saving both routes in the first-run config.
- `openassist auth status --provider <provider-id>` remains redacted, but it now reports whether the linked account is present and whether the current auth handle is actually chat-ready for the route.
- Once a default Codex provider is linked and chat-ready, reachable lifecycle validation should stop surfacing the pending account-link warning for that provider instead of keeping stale quickstart-era output around.
- Once the linked account is chat-ready, Codex chat requests now preserve the upstream conversation contract by sending the runtime session id, account header, top-level instructions, and the upstream-aligned `/responses` fields Codex currently requires such as `store=false`, `stream=true`, and a prompt-cache key derived from the session id. OpenAssist folds the returned event stream back into the normal reply contract before channel delivery. If auth is chat-ready and chat still fails, treat that as a provider request issue rather than an auth issue.
- Codex linked-account state is stored as encrypted OAuth material in SQLite, and OpenAssist attempts automatic refresh before expiry and again on auth-style provider failures when a refresh token is available.
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


## Outbound Delivery Notes

Same-chat artifact replies do not need a separate recipient list; when the active session can call `channel.send`, OpenAssist can return the requested file back into the current Telegram, Discord, or WhatsApp chat.

Wizard channel settings already contain the only proactive recipient allow-list used in this release:

- `channels[*].settings.operatorUserIds` controls which specific operator IDs may receive targeted notify delivery
- Telegram and WhatsApp direct-recipient sends use those IDs directly
- Discord direct-recipient sends also require the same recipient in `allowedDmUserIds`
- there is no separate `notificationUserIds` setting

Setup readiness rejects invalid bind addresses before network probing. If this blocks setup or repair, correct the address using the [invalid-bind-address guidance](common-troubleshooting.md#invalid-bind-address) and retry; valid addresses still receive normal port checks.

## Node 24 runtime migration

OpenAssist requires Node.js `>=24.21.0 <25`. Existing Node 22 installs must update their shell and service runtime before upgrading OpenAssist. Follow the [backup, service verification and rollback procedure](upgrade-and-rollback.md#node-24-runtime-migration); saved configuration, model IDs, credentials and conversations are preserved.


## Modernization compatibility

The provider editor prints current recommendations without overwriting saved IDs. It filters reasoning choices by exact model and route, supports adaptive Anthropic thinking/effort, and preserves the legacy budget editing path. Retired Codex selections must be explicitly replaced before readiness succeeds.

Anthropic compatibility: the verified `claude-opus-4-5` alias retains manual `thinkingBudgetTokens` exactly like `claude-opus-4-5-20251101`. Quickstart preserves compatible saved thinking settings. If a selected model rejects them (for example, Sonnet 5 with an old manual budget), quickstart asks before resetting to provider defaults. The default answer is No, which returns to model selection so the operator can keep the previous model/settings. Saving remains subject to normal validation; wizard provides the full thinking editor.

Current-model tuning: OpenAI/Azure show a separate execution-mode prompt only for verified models, with explicit Pro cost guidance; Codex does not. Opus 5.5/Fable 5.1/Mythos 5.1 offer Default/adaptive plus five efforts and an optional total-output ceiling. Blank ceiling uses 16384 on these models. Invalid numeric limits re-prompt; config validation remains blocking.

Anthropic add/edit asks for `workspaceId` before thinking controls. Use the Claude Console workspace ID for multi-workspace keys; blank removes the explicit selection for a workspace-scoped key. Quickstart offers the same auth requirement. See [provider/channel readiness](provider-channel-readiness.md).

## Ubuntu regression candidate

A successful validated wizard save marks recorded onboarding complete. Default post-save service checks require matching build and instance before completing activation. Packaged preflight needs no source-build tools; generated systemd and launchd environments include OpenAssist and the selected Node runtime.

See the [native reminder contract](../interfaces/scheduler-and-time.md#managed-one-shot-reminders) and [resolution matrix](../testing/ubuntu-live-test-resolution.md).

New OpenAI/Codex providers suggest GPT-6.1 Sol with xhigh. Azure suggests xhigh only for the exact GPT-6.1 Sol underlying-model hint; it still sends the deployment name. Editing a saved provider retains its effort, including omission. New Anthropic providers suggest Opus 5.5 with provider-default medium effort; Sonnet 5.5 is available with adaptive thinking. See [model compatibility](../providers/model-compatibility.md) for supported choices and cost tradeoffs.
