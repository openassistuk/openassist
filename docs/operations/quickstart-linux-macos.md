# Quickstart on Linux and macOS

This is the canonical operator runbook for a public OpenAssist install.

The goal is one clean path:

1. install OpenAssist
2. complete `openassist setup quickstart`
3. confirm service health
4. send the first real chat reply
5. use the wizard only for advanced changes

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
- prints a short readiness summary with the exact next command when it stops early
- interactive bootstrap runs quickstart after the build
- non-interactive bootstrap does not run quickstart for you
- non-interactive bootstrap still installs the service unless you pass `--skip-service`

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

If bootstrap already ran quickstart successfully, skip to the next section.

Otherwise run:

```bash
openassist setup quickstart \
  --install-dir "$HOME/openassist" \
  --config "$HOME/openassist/openassist.toml" \
  --env-file "$HOME/.config/openassist/openassistd.env"
```

Quickstart is the default onboarding path. It is intentionally minimal.

What quickstart configures:

- runtime defaults for the first reply
- one primary provider
- one primary channel
- timezone confirmation
- service install, restart, and health checks unless `--skip-service`

What quickstart does not try to do:

- advanced runtime path tuning
- extra providers or extra channels
- scheduler task authoring
- native web tuning
- advanced tools and security changes
- persona or profile editing

Those belong to `openassist setup wizard`.

Quickstart rules:

- strict validation blocks incomplete first-reply state by default
- `--allow-incomplete` adds an explicit degraded-save path
- prompts re-ask on invalid numeric, identifier, bind-address, and timezone input
- timezone onboarding stays guided as `country or region -> city`
- timezone confirmation now shows the selected zone and asks for a simple `Y/n` confirmation
- wildcard bind addresses still probe health through loopback fallbacks
- Linux service manager selection stays automatic: non-root uses `systemd --user`, root uses system-level `systemd`

Provider and channel guidance:

- quickstart is API-key-first because it is the fastest path to the first reply
- provider OAuth client configuration stays in `openassist setup wizard`
- after OAuth is configured, use `openassist auth start --provider <provider-id> --account default --open-browser`
- Telegram defaults remain inline chat memory and inline responses unless you change them later

## 4. Validate lifecycle readiness

```bash
openassist doctor
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
- whether upgrade prerequisites are satisfied
- the next command you should run

## 5. Send the first reply

After quickstart completes:

1. Open the configured Telegram, Discord, or WhatsApp destination.
2. Send a simple message.
3. Confirm the bot replies.
4. Send `/status` if you need local diagnostics without provider dependency.

First-reply checklist:

- provider saved in config and API key saved in env file
- one enabled channel saved in config
- `openassist service health` succeeds, unless you intentionally skipped service checks
- `openassist doctor` reports upgrade-ready or tells you the next lifecycle fix to make

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

## 6. Move to advanced configuration

Use the wizard when you need deeper changes:

```bash
openassist setup wizard \
  --config "$HOME/openassist/openassist.toml" \
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

Bootstrap stopped before quickstart:

```bash
openassist setup quickstart --install-dir "$HOME/openassist" --config "$HOME/openassist/openassist.toml" --env-file "$HOME/.config/openassist/openassistd.env"
```

Quickstart saved config but service checks were skipped or aborted:

```bash
openassist service install --install-dir "$HOME/openassist" --config "$HOME/openassist/openassist.toml" --env-file "$HOME/.config/openassist/openassistd.env"
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
