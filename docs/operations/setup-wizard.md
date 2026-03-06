# Setup Quickstart and Wizard

OpenAssist provides two interactive setup modes.

- `setup quickstart`: strict onboarding flow (recommended)
- `setup wizard`: advanced section editor for targeted changes

When bootstrap runs in interactive mode (default on TTY), it launches `setup quickstart` automatically before service actions.

## Command Surface

Installed command path:

```bash
openassist setup quickstart [--config <path>] [--env-file <path>] [--install-dir <path>] [--allow-incomplete] [--skip-service]
openassist setup wizard --config <path-to-openassist.toml> --env-file <path-to-openassistd.env> [--install-dir <path>] [--base-url <url>] [--skip-post-checks]
openassist setup show --config <path-to-openassist.toml>
openassist setup env --env-file <path-to-openassistd.env>
```

If `openassist` is not available yet in the current shell `PATH`, run via:

```bash
$HOME/.local/bin/openassist setup quickstart ...
```

Source checkout alternatives:

```bash
pnpm --filter @openassist/openassist-cli dev -- setup quickstart --config openassist.toml --env-file ~/.config/openassist/openassistd.env --skip-service
pnpm --filter @openassist/openassist-cli dev -- setup wizard --config openassist.toml --env-file ~/.config/openassist/openassistd.env
pnpm --filter @openassist/openassist-cli dev -- setup show --config openassist.toml
pnpm --filter @openassist/openassist-cli dev -- setup env --env-file ~/.config/openassist/openassistd.env
```

## `setup quickstart` Flow

`setup quickstart` runs staged onboarding:

1. Preflight: runtime/tooling/path/service-manager checks.
2. Runtime base settings: bind, port, data/log/skills paths, default policy.
3. Global assistant profile memory: assistant name/persona/preferences and first-contact profile prompt toggle.
4. Provider onboarding: provider config + API key env capture.
   - OpenAI/Anthropic OAuth account linking is available when `runtime.providers[].oauth` is configured.
   - Setup now prints direct account-link commands for configured providers.
   - Setup defaults now suggest:
     - OpenAI: `gpt-5.2`
     - Anthropic: `claude-sonnet-4-5` (or newer Sonnet 4.x)
5. Channel onboarding: optional channel setup with `env:VAR` secret refs.
   - Telegram flow now prints concrete steps: create bot via `@BotFather`, add bot to target chat, and capture numeric chat IDs.
   - Discord flow now clarifies numeric channel-ID allow-list behavior.
   - Channel prompts use friendly names and show auto-generated system IDs.
   - Leaving Telegram/Discord allow-list IDs blank allows all chats/channels visible to the bot.
   - Telegram defaults to inline behavior:
     - `conversationMode=chat` (single memory stream per chat/group)
     - `responseMode=inline` (no forced reply-thread behavior)
   - Optional threaded behavior can be enabled with `conversationMode=chat-thread` and `responseMode=reply-threaded`.
6. Time/scheduler onboarding: timezone, NTP policy, scheduler defaults, optional first task.
7. Tool defaults and native web onboarding: autonomous tool defaults, `tools.web.enabled`, `tools.web.searchMode`, and optional Brave API key env capture.
   - `hybrid` is the recommended default: Brave Search API when `OPENASSIST_TOOLS_WEB_BRAVE_API_KEY` is set, DuckDuckGo HTML fallback otherwise.
   - `api-only` is blocked at validation time when `OPENASSIST_TOOLS_WEB_BRAVE_API_KEY` is missing.
8. Validation gate: strict blocking by default.
9. Save + backup: config backup and env write.
10. Service + health: install/restart/health checks unless `--skip-service`.
11. Prompt-level validation re-prompts invalid values (no silent coercion):
   - numeric/range checks for port/time/scheduler/tool timeout fields
   - guided timezone picker (`country/region -> city`) using DST-aware Country/City IANA zones
   - provider/channel prompts accept friendly names and auto-generate internal IDs
   - Telegram allowed chat IDs and Discord allowed channel IDs are now validated as numeric IDs
   - identifier validation for task/skill IDs
   - bind-address validation

Autonomy defaults during onboarding:

- default profile remains `operator`
- autonomous chat tool execution requires explicit session profile elevation to `full-root`
- quickstart does not silently enable unrestricted autonomy

Strict default behavior:

- blocks incomplete provider auth for default provider
- blocks unresolved channel secret references
- blocks plaintext secret-like channel settings (`token`, `secret`, `apiKey`, `password`, etc.) unless values are `env:VAR_NAME`
- blocks invalid provider OAuth `clientSecretEnv` names
- blocks missing timezone confirmation when required
- blocks `tools.web.searchMode="api-only"` when `OPENASSIST_TOOLS_WEB_BRAVE_API_KEY` is not configured
- blocks service-readiness issues when service step is enabled

Override path:

- `--allow-incomplete` allows continuation after explicit confirmation.

## `setup wizard` Scope

`setup wizard` remains the advanced editor mode.

Sections:

- runtime and paths
- providers
- channels
- time and scheduler
- tools and security

Security section behavior:

- backend selection is fixed to `encrypted-file` (no `os-keyring` option)
- runtime rejects unsupported legacy backend values at startup
- tools/security editing also covers native web settings:
  - `tools.web.enabled`
  - `tools.web.searchMode`
  - request timeout, redirect limit, fetch byte limit, search-result limit, and page limit
  - optional env-file update for `OPENASSIST_TOOLS_WEB_BRAVE_API_KEY`

Use wizard when you need focused edits instead of linear onboarding.

Provider auth behavior in wizard:

- API key storage in env file remains available for every provider.
- Default model suggestions in add-provider flow:
  - OpenAI / OpenAI-compatible: `gpt-5.2`
  - Anthropic: `claude-sonnet-4-5`
- For OpenAI/Anthropic providers, wizard prints OAuth account-link guidance:
  - `openassist auth start --provider <provider-id> --account default --open-browser`
  - `openassist auth status`
- `openassist auth status` confirms status endpoint reachability; OAuth/API-key details are intentionally redacted in CLI output.

Post-save behavior:

1. Save + backup runs first.
2. Service restart + daemon health + time status + scheduler status checks run automatically.
3. If service is not installed, wizard prompts to install it before checks.
4. If post-save checks fail, wizard now offers recovery actions: retry checks, skip checks, or abort checks.
5. On unsupported service-manager platforms, checks are skipped with an explicit warning.
6. `--skip-post-checks` disables this operational validation step.
7. Health probes use loopback fallbacks automatically when bind address is wildcard (`0.0.0.0` / `::`).
8. Channel startup is non-blocking at runtime start; use `openassist channel status` to inspect connector-specific degraded states even when daemon health is OK.

Quickstart service checks use similar recovery logic after save:

- strict mode: retry or abort (no silent degraded continuation)
- `--allow-incomplete`: retry, skip, or abort
- wildcard bind-address health probes are normalized to loopback where needed

## Save and Secret Behavior

On save (`quickstart` and `wizard`):

1. schema validation
2. config backup (`openassist.toml.bak.<timestamp>`)
3. TOML write
4. env file write with restricted permissions (Unix)

Secrets are stored in env file and referenced in config via `env:VAR_NAME`.

Example:

```toml
[runtime.channels.settings]
botToken = "env:OPENASSIST_CHANNEL_TELEGRAM_MAIN_BOT_TOKEN"
```

Native web search credential example:

```toml
# in openassistd.env
OPENASSIST_TOOLS_WEB_BRAVE_API_KEY=...
```

Provider OAuth example:

```toml
[runtime.providers.oauth]
clientSecretEnv = "OPENASSIST_OPENAI_OAUTH_CLIENT_SECRET"
```

`clientSecretEnv` must be a valid env-var name (`[A-Za-z_][A-Za-z0-9_]*`).

## Enabling Autonomous Tool Sessions

After onboarding, enable autonomous tool execution only for specific sessions:

```bash
openassist policy-set --session <channel>:<conversationKey> --profile full-root
openassist tools status --session <channel>:<conversationKey>
```

Inspect audited tool runs:

```bash
openassist tools invocations --session <channel>:<conversationKey> --limit 20
```

Channel diagnostics without provider dependency:

- send `/status` in Telegram/Discord/WhatsApp to get local runtime/time/scheduler/channel profile status
- `/status` now includes awareness summary, callable tools, configured tool families, and native web backend state for the current session
- if provider/auth/runtime errors occur during normal chat, runtime returns an operational diagnostic reply instead of silent failure

Global assistant profile memory commands (shared across chats for the main agent):

- `/profile` shows persisted global assistant profile memory and runtime system profile
- `/profile force=true; name=<name>; persona=<style>; prefs=<preferences>` updates persisted global memory
- first-boot lock-in guard blocks accidental global profile changes unless `force=true` is provided
- if enabled (`runtime.assistant.promptOnFirstContact=true`), `/start` or `/new` sends a first-contact profile bootstrap prompt

## TTY and Automation Notes

- `setup quickstart`, `setup wizard`, and `setup env` require TTY.
- Bootstrap defaults to interactive in TTY and non-interactive in non-TTY environments.
- For automation, use non-interactive bootstrap (`--non-interactive`) plus direct file management.

Validation command for automated pipelines:

```bash
openassist config validate --config <path-to-openassist.toml>
```
