# Install on Linux

This page covers Linux-specific installation details. For the end-to-end operator flow, start with `docs/operations/quickstart-linux-macos.md` and keep `docs/operations/common-troubleshooting.md` nearby for repair commands.

## Platform Behavior

Linux is the primary OpenAssist release target.

Bootstrap can install missing prerequisites automatically unless you disable it:

- Git
- Node `>=22`
- pnpm `>=10`

Common Linux notes:

- Debian and Ubuntu use NodeSource when the system Node is too old
- if NodeSource still leaves Node below minimum, bootstrap can fall back to `npm` plus `n`
- package installation may require explicit `sudo`
- pass `--no-auto-install-prereqs` if you want to manage prerequisites yourself

## Install Commands

GitHub install:

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/openassistuk/openassist/main/install.sh)"
```

Non-interactive example:

```bash
curl -fsSL https://raw.githubusercontent.com/openassistuk/openassist/main/install.sh | bash -s -- --non-interactive --skip-service
```

Local checkout:

```bash
bash scripts/install/bootstrap.sh
```

Useful bootstrap flags:

```bash
bash scripts/install/bootstrap.sh --interactive
bash scripts/install/bootstrap.sh --non-interactive --skip-service
bash scripts/install/bootstrap.sh --install-dir "$HOME/openassist" --ref main
bash scripts/install/bootstrap.sh --no-auto-install-prereqs
```

Interactive bootstrap on Linux runs bare `openassist setup` after build. Non-interactive bootstrap does not run onboarding, but it still installs the service unless `--skip-service` is set.

Bootstrap now ends with three fixed operator sections so the stopping point is obvious:

- `Ready now`
- `Needs action`
- `Next command`

Quickstart now captures the main assistant identity during onboarding:

- assistant name
- assistant character/persona
- ongoing objectives or operator preferences

When quickstart succeeds, it writes those values into the same global assistant profile that `/profile` edits later and disables the later first-chat identity reminder by default.

Expected installer note:

- OpenAssist pins a tested `pnpm` release for consistent installs, so a newer `pnpm` update notice does not block setup
- Telegram and Discord installs do not need extra build-script approval
- if `pnpm` still reports skipped WhatsApp/media build scripts on your host, approve them before using WhatsApp image or document features

## Linux Service Manager Rules

Linux service manager selection is automatic:

- non-root shell: `systemd --user`
- root shell: system-level `systemd`

Install or reinstall the service explicitly:

```bash
openassist service install \
  --install-dir "$HOME/openassist" \
  --config "$HOME/.config/openassist/openassist.toml" \
  --env-file "$HOME/.config/openassist/openassistd.env"
```

Service lifecycle commands:

```bash
openassist service status
openassist service restart
openassist service logs --lines 200 --follow
openassist service health
```

## Files and Paths Written by Bootstrap

Bootstrap writes or maintains:

- repo-backed checkout: `$HOME/openassist`
- config: `~/.config/openassist/openassist.toml`
- overlays: `~/.config/openassist/config.d`
- env file: `~/.config/openassist/openassistd.env`
- install state: `~/.config/openassist/install-state.json`
- runtime data: `~/.local/share/openassist/data`
- runtime logs: `~/.local/share/openassist/logs`
- managed skills: `~/.local/share/openassist/skills`
- managed helper tools: `~/.local/share/openassist/data/helper-tools`
- wrappers: `~/.local/bin/openassist`, `~/.local/bin/openassistd`

The install-state file is the lifecycle truth source used later by `openassist doctor`, `openassist service install`, and `openassist upgrade`.

If setup later detects the recognized old repo-local layout (`openassist.toml`, `config.d`, and `.openassist` inside the install directory), it migrates that state into the canonical home-state layout when the target home paths are empty or compatible. Migration writes a timestamped backup under `~/.local/share/openassist/migration-backups/` before it changes anything. `openassist doctor` and `openassist upgrade --dry-run` detect the same legacy layout and route you back to setup instead of migrating it in place.

If you install with `--ref <git-ref>`, that ref is also recorded in install state for later lifecycle reporting.

## When to Use Setup, Quickstart, Service Install, or Bootstrap Again

Use bare `openassist setup` when:

- you want the beginner lifecycle hub
- you need repair guidance and do not want to remember the exact lifecycle command yet
- you want the default first-time setup path after bootstrap
- you want file locations, service actions, or safe update planning from one menu

Use quickstart when:

- bootstrap finished building but stopped before onboarding
- you want to complete first-run setup for one provider and one channel

Use `openassist service install` when:

- config is already in place
- you skipped service install earlier
- you need to reinstall the service unit without recloning the repo

Re-run bootstrap when:

- the checkout is missing `.git`
- wrappers are missing or badly broken
- build output is missing under `apps/openassist-cli/dist` or `apps/openassistd/dist`
- you are on a detached checkout and want to repin to a known branch or tag through the installer flow
- prerequisite installation or repo sync failed and you want the installer flow again
- you want a fresh install directory

## Linux Recovery Notes

The cross-platform repair matrix lives in `docs/operations/common-troubleshooting.md`.

If user-service startup cannot write under `~/.local/state/openassist`:

```bash
mkdir -p "$HOME/.local/state/openassist"
openassist service restart
openassist service status
```

If a systemd unit still has older hardening that breaks Node startup, reinstall the service from the current checkout:

```bash
openassist service install \
  --install-dir "$HOME/openassist" \
  --config "$HOME/.config/openassist/openassist.toml" \
  --env-file "$HOME/.config/openassist/openassistd.env"
openassist service restart
openassist service status
```

If you are unsure whether the install is ready for update:

```bash
openassist doctor
openassist upgrade --dry-run --install-dir "$HOME/openassist"
```
