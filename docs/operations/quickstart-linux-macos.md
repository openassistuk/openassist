# Quickstart on Linux and macOS

This is the canonical operator runbook for a public OpenAssist install.

If something goes wrong while following this runbook, use `docs/operations/common-troubleshooting.md` for the beginner/intermediate repair commands that map to the symptoms you see here.

The goal is one clean path:

1. install OpenAssist
2. complete `openassist setup`
3. confirm service health
4. send the first real chat reply
5. use the wizard only for advanced changes

If you hit trouble on any of those steps, keep `docs/operations/common-troubleshooting.md` open alongside this runbook.

## Before You Start

Supported runtime baseline:

- Node `>=22`
- pnpm `>=10`
- Git

Platform notes:

- Linux is the primary release target
- macOS is supported with `launchd`
- Windows has CI coverage, but service lifecycle parity is not the operator target yet

## 1. Install OpenAssist

Interactive GitHub install:

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/openassistuk/openassist/main/install.sh)"
```

Non-interactive example:

```bash
curl -fsSL https://raw.githubusercontent.com/openassistuk/openassist/main/install.sh | bash -s -- --non-interactive --skip-service
```

Bootstrap behavior:

- uses a repo-backed checkout at `$HOME/openassist` by default
- is interactive on a TTY and non-interactive otherwise
- prints a lifecycle plan before it mutates anything
- writes install state to `~/.config/openassist/install-state.json`
- uses `~/.config/openassist/openassist.toml` as the default operator config path
- keeps runtime data, logs, skills, and helper tools under `~/.local/share/openassist`
- prints a short readiness summary with the exact next command when it stops early
- always ends with the same fixed summary sections:
  - `Ready now`
  - `Needs action`
  - `Next command`
- interactive bootstrap runs bare `openassist setup` after the build
- non-interactive bootstrap does not run quickstart for you
- non-interactive bootstrap still installs the service unless you pass `--skip-service`
- OpenAssist pins a tested `pnpm` release for consistent installs, so a newer `pnpm` update notice does not block setup
- Telegram and Discord installs do not need extra build-script approval
- if `pnpm` still reports skipped WhatsApp/media build scripts on your host, approve them before using WhatsApp image or document features

If you are installing from a local checkout instead of GitHub:

```bash
bash scripts/install/bootstrap.sh
```

## 2. Verify the wrappers

```bash
openassist --help
openassistd --help
```

If the current shell does not see the wrappers yet:

```bash
export PATH="$HOME/.local/bin:$PATH"
$HOME/.local/bin/openassist --help
```

## 3. Complete first-run onboarding

If bootstrap already ran the lifecycle hub successfully, skip to the next section.

The default beginner entrypoint is:

```bash
openassist setup
```

On a TTY, that opens the lifecycle hub with these choices:

- first-time setup
- check and repair this install
- advanced configuration
- service and health actions
- safe update planning
- show file locations and lifecycle status
- exit

If you want the direct scripted first-reply path instead, run:

```bash
openassist setup quickstart \
  --install-dir "$HOME/openassist" \
  --config "$HOME/.config/openassist/openassist.toml" \
  --env-file "$HOME/.config/openassist/openassistd.env"
```

Quickstart is still the strict first-reply path. It is intentionally minimal.

What quickstart configures:

- runtime defaults for the first reply
- the main assistant name, persona, and ongoing objectives/preferences
- one primary provider from four first-class routes:
  - OpenAI (API key)
  - Codex (OpenAI account login)
  - Anthropic
  - OpenAI-compatible
- one primary channel
- first-class Telegram, Discord, or WhatsApp chat setup with readable replies and attachment ingest
- one access mode choice:
  - `Standard mode (recommended)`
  - `Full access for approved operators`
- timezone confirmation
- one required review step before save
- service install, restart, and health checks unless `--skip-service`
- disables the later first-chat identity reminder by default because onboarding already captured the main assistant identity

What quickstart does not try to do:

- advanced runtime path tuning
- extra providers or extra channels
- scheduler task authoring
- native web tuning
- advanced tools and security changes

Those belong to `openassist setup wizard`.

Canonical writable operator state for fresh installs:

- config: `~/.config/openassist/openassist.toml`
- overlays: `~/.config/openassist/config.d`
- env file: `~/.config/openassist/openassistd.env`
- install state: `~/.config/openassist/install-state.json`
- runtime data: `~/.local/share/openassist/data`
- runtime logs: `~/.local/share/openassist/logs`
- managed skills: `~/.local/share/openassist/skills`
- managed helper tools: `~/.local/share/openassist/data/helper-tools`

If OpenAssist detects the recognized old repo-local layout (`openassist.toml`, `config.d`, and `.openassist` inside the install directory) while `openassist setup`, `openassist setup quickstart`, or `openassist setup wizard` is running, it migrates that state automatically when the target home paths are empty or compatible. The migration routine writes a timestamped backup bundle under `~/.local/share/openassist/migration-backups/<timestamp>` before it changes anything. `openassist doctor` and `openassist upgrade --dry-run` detect the same legacy layout and send you back to setup instead of migrating it themselves.

Quickstart rules:

- strict validation blocks incomplete first-reply state by default
- `--allow-incomplete` adds an explicit degraded-save path
- prompts re-ask on invalid numeric, identifier, bind-address, and timezone input
- timezone onboarding stays guided as `country or region -> city`
- timezone confirmation now shows the selected zone and asks for a simple `Y/n` confirmation
- wildcard bind addresses still probe health through loopback fallbacks
- Linux service manager selection stays automatic: non-root uses `systemd --user`, root uses system-level `systemd`
- quickstart asks for approved operator IDs only if you opt into full access
- if you opt into full access before you know those IDs, quickstart offers a clear return path back to standard mode instead of failing
- the assistant identity captured here is the same global main-agent identity that `/profile` edits later

Review-before-save actions:

- `Save`
- `Edit runtime`
- `Edit assistant identity`
- `Edit provider`
- `Edit channel`
- `Edit timezone`
- `Abort`

If validation fails, quickstart now groups repair guidance by operator task:

- provider auth
- channel auth or routing
- timezone or time
- service or health
- access or operator IDs

Provider and channel guidance:

- OpenAI stays the standard API-key route.
- Codex stays the separate OpenAI account-login route.
- OpenAI and Codex quickstart both expose a beginner-friendly reasoning-effort choice:
  - `Default (recommended)`
  - `Low`
  - `Medium`
  - `High`
- Leaving that quickstart choice on `Default` keeps the field unset, so OpenAssist sends no provider-specific reasoning parameter.
- If you choose Codex, quickstart guides the account-link flow after the daemon is healthy, prints the authorization URL, pauses so you can copy or open it on this host or another device, accepts either the full callback URL or a pasted code, and requires that linked account before the first reply can use the default provider.
- If automatic browser launch is unavailable on a headless host, OpenAssist still prints the authorization URL and treats that as an account-linking step, not as a service failure.
- Anthropic stays API-key-first for the fastest first reply; optional provider OAuth configuration still lives in `openassist setup wizard`.
- OpenAI-compatible stays the custom API-compatible route.
- legacy `openai + oauth` configs still load, but new account-login installs should use `codex`.
- after provider OAuth is configured or when you want to re-link Codex later, use `openassist auth start --provider <provider-id> --account default --open-browser`
- Telegram defaults remain inline chat memory and inline responses unless you change them later
- Discord direct messages stay disabled unless you explicitly add `allowedDmUserIds`
- OpenAI, Codex, and Anthropic can inspect inbound images; OpenAI-compatible providers will answer from text/captions only and tell you when image understanding is unavailable

## 4. Validate lifecycle readiness

```bash
openassist doctor
openassist doctor --json
openassist service status
openassist service health
openassist channel status
openassist time status
```

`openassist doctor` reports:

- whether install state exists
- whether the install is repo-backed
- tracked ref and current commit
- config and env paths
- detected service manager
- configured access mode
- whether enabled channels already have approved operator IDs
- whether in-chat `/access` switching is available yet
- the primary provider route, default model, and current reasoning/thinking state
- whether upgrade prerequisites are satisfied
- the next command you should run
- a healthy daemon already bound to the configured port is treated as success, not as a post-setup port-conflict warning

Text output is grouped as:

- `Ready now`
- `Needs action`
- `Next command`

`openassist doctor --json` keeps the grouped lifecycle structure for automation and now uses `version: 2` with per-item `stage` metadata.

## 5. Send the first reply

After quickstart completes:

1. Open the configured Telegram, Discord, or WhatsApp destination.
2. Send a simple message.
3. Confirm the bot replies with readable formatting rather than one dense wall of text.
4. Send `/status` if you need local diagnostics without provider dependency.
5. Copy the `sender id` and `session id` from `/status` if you plan to configure approved operators or inspect actor-specific access later.

Channel-specific scope:

- Telegram supports private chats, groups, and forum topics
- Discord supports guild text channels, thread channels, and DMs
- WhatsApp MD supports private chats and groups
- supported documents in this release are text-like uploads such as `.txt`, `.md`, `.csv`, `.json`, `.yaml`, and `.log`

First-reply checklist:

- provider saved in config and API key saved in env file
- one enabled channel saved in config
- `openassist service health` succeeds, unless you intentionally skipped service checks
- `openassist doctor` reports upgrade-ready or tells you the next lifecycle fix to make
- if you chose full access, the right approved operator IDs are saved for that channel

Useful first-chat runtime commands:

- `/start` or `/help` for the general OpenAssist welcome and live machine-assistant summary
- `/capabilities` for the current provider/channel/tool boundary in this chat
- `/grow` for managed skills, helper tools, and durable extension guidance
- `/status` for local operational diagnostics without provider dependency

Access mode notes:

- standard mode keeps everyone at standard access until you deliberately elevate a listed operator
- full access still does not grant Unix `root`; it enables OpenAssist's `full-root` tool profile for approved operators
- approved operators can use `/access full` or `/access standard` inside chat for their own current chat only

If the bot does not reply:

```bash
openassist service logs --lines 200 --follow
openassist channel status
openassist auth status
```

WhatsApp only:

```bash
openassist channel qr --id whatsapp-main
```

If you want to inspect or extend durable growth from the host after the first reply:

```bash
openassist skills list
openassist growth status
```

## 6. Move to advanced configuration

Use the wizard when you need deeper changes:

```bash
openassist setup wizard \
  --config "$HOME/.config/openassist/openassist.toml" \
  --env-file "$HOME/.config/openassist/openassistd.env" \
  --install-dir "$HOME/openassist"
```

Wizard sections are labeled by operator task:

- basic runtime and defaults
- providers and model access
- channels and chat destinations
- scheduling and time
- advanced tools and security

Wizard runs post-save service and health checks by default. Use `--skip-post-checks` only when you intentionally want to defer validation.

## 7. Upgrade safely

Always start with dry-run:

```bash
openassist upgrade --dry-run --install-dir "$HOME/openassist"
```

Then run the live upgrade:

```bash
openassist upgrade --install-dir "$HOME/openassist"
```

Dry-run tells you:

- current commit
- tracked ref
- resolved target ref
- update mode (`git pull` on the current branch versus checkout or detached update)
- restart behavior
- rollback target

If dry-run shows `Current branch: HEAD`, the checkout is detached. Prefer `openassist upgrade --ref <branch-or-tag> --install-dir "$HOME/openassist"` so the update target is explicit instead of inheriting the detached default behavior.

If the checkout is damaged, missing `.git`, missing build output under `apps/openassist-cli/dist` or `apps/openassistd/dist`, or no longer trustworthy, rerun bootstrap instead of forcing `openassist upgrade`.

## Troubleshooting

For the central repair matrix, use `docs/operations/common-troubleshooting.md`.

Bootstrap stopped before quickstart:

```bash
openassist setup
```

Quickstart saved config but service checks were skipped or aborted:

```bash
openassist service install --install-dir "$HOME/openassist" --config "$HOME/.config/openassist/openassist.toml" --env-file "$HOME/.config/openassist/openassistd.env"
openassist service health
```

You want to inspect the install record before upgrading:

```bash
openassist doctor
```

Dry-run reports a detached checkout or missing build output:

```bash
bash scripts/install/bootstrap.sh --install-dir "$HOME/openassist"
```

## Source-Checkout Alternative

Installed commands are the primary operator path. For contributor workflows:

```bash
pnpm install
pnpm -r build
pnpm verify:all
pnpm --filter @openassist/openassist-cli dev -- setup quickstart --config openassist.toml --env-file ~/.config/openassist/openassistd.env --skip-service
```
