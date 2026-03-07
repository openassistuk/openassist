# Install on Linux

This page covers Linux-specific installation details. For the end-to-end operator flow, start with `docs/operations/quickstart-linux-macos.md`.

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

Interactive bootstrap on Linux runs `openassist setup quickstart` after build. Non-interactive bootstrap does not run onboarding, but it still installs the service unless `--skip-service` is set.

Expected installer note:

- `pnpm` version notices are informational
- the supported path now includes WhatsApp/media baseline build-script dependencies
- if `pnpm` still reports skipped WhatsApp/media build scripts on your host, approve them before relying on WhatsApp image or document handling

## Linux Service Manager Rules

Linux service manager selection is automatic:

- non-root shell: `systemd --user`
- root shell: system-level `systemd`

Install or reinstall the service explicitly:

```bash
openassist service install \
  --install-dir "$HOME/openassist" \
  --config "$HOME/openassist/openassist.toml" \
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
- config: `$HOME/openassist/openassist.toml`
- env file: `~/.config/openassist/openassistd.env`
- install state: `~/.config/openassist/install-state.json`
- wrappers: `~/.local/bin/openassist`, `~/.local/bin/openassistd`

The install-state file is the lifecycle truth source used later by `openassist doctor`, `openassist service install`, and `openassist upgrade`.

If you install with `--ref <git-ref>`, that ref is also recorded in install state for later lifecycle reporting.

## When to Use Quickstart, Service Install, or Bootstrap Again

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
  --config "$HOME/openassist/openassist.toml" \
  --env-file "$HOME/.config/openassist/openassistd.env"
openassist service restart
openassist service status
```

If you are unsure whether the install is ready for update:

```bash
openassist doctor
openassist upgrade --dry-run --install-dir "$HOME/openassist"
```
