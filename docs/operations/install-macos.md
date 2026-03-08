# Install on macOS

This page covers macOS-specific installation details. For the full install-to-first-reply path, start with `docs/operations/quickstart-linux-macos.md` and keep `docs/operations/common-troubleshooting.md` nearby for repair commands.

## Platform Behavior

macOS is a supported OpenAssist operator path and uses `launchd` service management.

Bootstrap can install missing prerequisites automatically with Homebrew unless you disable it:

- Git
- Node `>=22`
- pnpm `>=10`

If Homebrew is not already available, install it first from `https://brew.sh`.

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

Interactive bootstrap on macOS runs bare `openassist setup` after build. Non-interactive bootstrap does not run onboarding, but it still installs the `launchd` service unless `--skip-service` is set.

Bootstrap now ends with three fixed operator sections so the stopping point is obvious:

- `Ready now`
- `Needs action`
- `Next command`

Quickstart now captures the main assistant identity during onboarding:

- assistant name
- assistant character/persona
- ongoing objectives or operator preferences

When quickstart succeeds, it saves those values into the same global assistant profile that `/profile` edits later and disables the later first-chat identity reminder by default.

Expected installer note:

- OpenAssist pins a tested `pnpm` release for consistent installs, so a newer `pnpm` update notice does not block setup
- Telegram and Discord installs do not need extra build-script approval
- if `pnpm` still reports skipped WhatsApp/media build scripts on your host, approve them before using WhatsApp image or document features

## macOS Service Manager Rules

macOS uses `launchd`.

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

Later lifecycle commands use the same install-state record to preserve:

- install directory
- tracked ref
- config and env paths
- service manager
- last known good commit

If you install with `--ref <git-ref>`, that ref is also recorded in install state for later lifecycle reporting.

If setup later detects the recognized old repo-local layout (`openassist.toml`, `config.d`, and `.openassist` inside the install directory), it migrates that state into the canonical home-state layout when the target home paths are empty or compatible. Migration writes a timestamped backup under `~/.local/share/openassist/migration-backups/` before it changes anything. `openassist doctor` and `openassist upgrade --dry-run` detect the same legacy layout and route you back to setup instead of migrating it in place.

## When to Use Setup, Quickstart, Service Install, or Bootstrap Again

Use bare `openassist setup` when:

- you want the beginner lifecycle hub
- you need repair guidance and do not want to remember the exact lifecycle command yet
- you want the default first-time setup path after bootstrap
- you want file locations, service actions, or safe update planning from one menu

Use quickstart when:

- bootstrap finished building but did not complete onboarding
- you want the minimal first-reply setup flow

Use `openassist service install` when:

- config is already present
- you skipped service setup earlier
- you need to refresh the `launchd` service after config or runtime changes

Re-run bootstrap when:

- the repo checkout is missing `.git`
- the checkout is no longer trustworthy
- wrappers are missing or broken
- build output is missing under `apps/openassist-cli/dist` or `apps/openassistd/dist`
- you are on a detached checkout and want the installer to repin a known branch or tag
- you want a clean install directory

## macOS Recovery Notes

The cross-platform repair matrix lives in `docs/operations/common-troubleshooting.md`.

If the current shell cannot find wrappers yet:

```bash
export PATH="$HOME/.local/bin:$PATH"
$HOME/.local/bin/openassist --help
```

If you are about to upgrade and want a lifecycle check first:

```bash
openassist doctor
openassist upgrade --dry-run --install-dir "$HOME/openassist"
```

Linux remains the deeper validation target, but the installed-command lifecycle is the same on macOS.
