# Install on Linux

**Release availability:** the signed [v0.2.1 stable release](https://github.com/openassistuk/openassist/releases/tag/v0.2.1) is published and public installation passed on all four supported targets. Use the default installer or pin `--version 0.2.1`. Source development remains available with `--source --ref main`. Signing verification is automatic; operators do not supply keys.

The [v0.2.2 model-refresh candidate](../releases/v0.2.2.md) is in preparation; protected publication and public-installer checks must pass before these availability commands select it.

Packaged bootstrap adds a marked `~/.local/bin` PATH block to Bash's `.bashrc` and `.profile`, or Zsh's `.zshrc` and `.zprofile` (respecting `ZDOTDIR`). Open a new shell after installation, or use `~/.local/bin/openassist` immediately. Existing marked blocks and symlinked profiles are preserved; other shells receive `.profile` guidance. Uninstall removes only an unchanged block whose ownership was recorded.

Normal Linux installation downloads a signed release with private Node into `~/.local/share/openassist/install`. Git/pnpm/system-Node prerequisites and package-manager remediation below apply only to explicit source bootstrap (`--source --ref main`, `--ref`, or `--pr`). Release bootstrap requires curl, gzip and OpenSSL. Unavailable releases and failed verification stop installation. See [release maintenance](release-maintenance.md) and [developer testing](developer-testing.md).

This page covers Linux-specific installation details. For the end-to-end operator flow, start with `docs/operations/quickstart-linux-macos.md` and keep `docs/operations/common-troubleshooting.md` nearby for repair commands.

The [v0.2.1 stable release](../releases/v0.2.1.md) delivers the Axios security repair alongside the earlier Ubuntu fixes. Existing installations should use the explicit stable update commands in the release notes; exact pins do not advance automatically. Replacement-host provider/channel retesting remains unverified separately from public-install validation.

## Platform Behavior

Linux is a first-class OpenAssist operator path. Packaged releases support x64 and arm64 with glibc 2.28+ and kernel 4.18+. Alpine/musl is unsupported.

Explicit source bootstrap can install missing development prerequisites automatically unless you disable it:

- Git
- Node `>=24.21.0 <25`
- pnpm `12.5.1` (the repository-pinned version)

Common Linux notes:

- Debian and Ubuntu use NodeSource when the system Node is too old
- if NodeSource still leaves Node below minimum, bootstrap can fall back to `npm` plus `n`
- package installation may require explicit `sudo`
- pass `--no-auto-install-prereqs` if you want to manage prerequisites yourself

## Install Commands

Install the packaged stable release:

```bash
curl -fsSL https://raw.githubusercontent.com/openassistuk/openassist/main/install.sh | bash
```

Non-interactive example:

```bash
curl -fsSL https://raw.githubusercontent.com/openassistuk/openassist/main/install.sh | bash -s -- --non-interactive --skip-service
```

Source build from a local checkout:

```bash
bash scripts/install/bootstrap.sh --source --ref main
```

Useful bootstrap flags:

```bash
bash scripts/install/bootstrap.sh --interactive
bash scripts/install/bootstrap.sh --non-interactive --skip-service
bash scripts/install/bootstrap.sh --install-dir "$HOME/openassist" --ref main
bash scripts/install/bootstrap.sh --install-dir "$HOME/openassist" --ref feature/my-branch
bash scripts/install/bootstrap.sh --install-dir "$HOME/openassist" --pr 123
bash scripts/install/bootstrap.sh --source --ref main --no-auto-install-prereqs
```

Advanced developer GitHub entrypoint examples:

```bash
curl -fsSL https://raw.githubusercontent.com/openassistuk/openassist/main/install.sh | bash -s -- --ref feature/my-branch
curl -fsSL https://raw.githubusercontent.com/openassistuk/openassist/main/install.sh | bash -s -- --pr 123
```

Those branch and PR flags are for developer testing only. They stay command-line only and are intentionally not shown in the beginner setup hub, quickstart, or wizard.

Interactive bootstrap on Linux runs bare `openassist setup` after installation. Non-interactive bootstrap does not run onboarding, but it still installs the service unless `--skip-service` is set.

Bootstrap now ends with three fixed operator sections so the stopping point is obvious:

- `Ready now`
- `Needs action`
- `Next command`

Quickstart now captures the main assistant identity during onboarding:

- assistant name
- assistant character/persona
- ongoing objectives or operator preferences

When quickstart succeeds, it writes those values into the same global assistant profile that `/profile` edits later and disables the later first-chat identity reminder by default.

Source-build notes (packaged releases already include production dependencies):

- OpenAssist pins a tested `pnpm` release for consistent installs, so a newer `pnpm` update notice does not block setup
- Telegram and Discord installs do not need extra build-script approval
- if `pnpm` still reports skipped WhatsApp/media build scripts on your host, approve them before using WhatsApp image or document features

## Linux Service Manager Rules

Linux service manager selection is automatic:

- non-root shell: `systemd --user`
- root shell: system-level `systemd`

Linux service filesystem access is configured separately under `[service]` in `openassist.toml`:

- `systemdFilesystemAccess = "hardened"` keeps the default OpenAssist-added systemd hardening in place
- `systemdFilesystemAccess = "unrestricted"` removes OpenAssist-added Linux systemd hardening for the daemon service
- `openassist service install` reads that setting from config every time it renders the Linux unit

Hardened units explicitly allow the configured data, logs and skills directories plus configuration state. These writable paths are created before service start, independently of the application directory, and paths with spaces are quoted. `PrivateTmp` remains enabled; place persistent operator state outside `/tmp` and `/var/tmp`. Reinstall the service after changing runtime paths so its filesystem boundary matches the saved config.

Install or reinstall the service explicitly:

```bash
openassist service install \
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

- managed release applications and private runtimes: `~/.local/share/openassist/install/releases`
- active pointer: `~/.local/share/openassist/install/current`
- explicit legacy source bootstrap checkout: `$HOME/openassist`
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

If you install with `--ref <git-ref>` or `--pr <number>`, that track is also recorded in install state for later lifecycle reporting.

Track behavior:

- default installation follows stable packaged releases
- exact `--version` installations stay pinned
- fresh explicit `--source` bootstrap uses the repository default branch; existing legacy branch checkouts keep their branch when no ref is supplied
- branch installs continue following the selected branch normally
- PR installs record `refs/pull/<n>/head`, but later `openassist upgrade` requires an explicit `--pr <n>` or `--ref <target>`

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

If a systemd unit still has older hardening that breaks Node startup, reinstall the service from the active installation:

```bash
openassist service install \
  --config "$HOME/.config/openassist/openassist.toml" \
  --env-file "$HOME/.config/openassist/openassistd.env"
openassist service restart
openassist service status
```

If you changed `[service].systemdFilesystemAccess` in config or through setup wizard, use the same reinstall path to apply the new Linux service mode outside the setup flow. `openassist doctor`, `/status`, and `openassist tools status` should then report the updated configured and effective service boundary.

If you are unsure whether the install is ready for update:

```bash
openassist doctor
openassist upgrade --dry-run --install-dir "$HOME/openassist"
```

If you installed from a PR track and want to keep testing it:

```bash
openassist upgrade --dry-run --install-dir "$HOME/openassist" --pr 123
openassist upgrade --install-dir "$HOME/openassist" --pr 123
```

If you want to move that install back to the normal release track:

```bash
openassist upgrade --dry-run --install-dir "$HOME/openassist" --ref main
openassist upgrade --install-dir "$HOME/openassist" --ref main
```

Setup readiness rejects invalid bind addresses before network probing. If this blocks setup or repair, correct the address using the [invalid-bind-address guidance](common-troubleshooting.md#invalid-bind-address) and retry; valid addresses still receive normal port checks.

## Node 24 runtime migration

OpenAssist requires Node.js `>=24.21.0 <25`. Existing Node 22 installs must update their shell and service runtime before upgrading OpenAssist. Follow the [backup, service verification and rollback procedure](upgrade-and-rollback.md#node-24-runtime-migration); saved configuration, model IDs, credentials and conversations are preserved.

When quickstart changes an Anthropic model, incompatible saved thinking settings now trigger an explicit reset-or-select-another-model prompt; compatible settings and saved Opus 4.5 aliases are preserved. See [quickstart](quickstart-linux-macos.md) for the guided repair flow.

## Ubuntu regression candidate

The public piped entrypoint attaches /dev/tty only when handing off to the downloaded bootstrap file. Packaged setup uses private Node with no system Node/Git/npm/pnpm requirement. Seeded installs select First-time setup. systemd system/user units contain explicit PATH entries for the wrapper and selected runtime.

See the [native reminder contract](../interfaces/scheduler-and-time.md#managed-one-shot-reminders) and [resolution matrix](../testing/ubuntu-live-test-resolution.md).

Model recommendations: fresh OpenAI/Codex setup suggests GPT-6.1 Sol with xhigh; Anthropic suggests Opus 5.5. Updates and restarts preserve saved model IDs and tuning. Review [route-specific compatibility](../providers/model-compatibility.md) before explicitly changing models in `openassist setup wizard`; verify with `openassist doctor` and a real reply.

Model lifecycle checks preserve saved IDs while warning for announced deprecations and blocking retired cataloged models during readiness and requests. Choose a replacement explicitly through `openassist setup wizard`; service restart or credential relinking does not restore a retired model. Check the [route-specific model matrix](../providers/model-compatibility.md#other-endpoints-and-migration), including Codex GPT-5.5 on October 14 and Claude Sonnet 4.5 on November 30.
