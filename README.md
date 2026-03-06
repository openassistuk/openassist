# OpenAssist

[![CI](https://github.com/openassistuk/openassist/actions/workflows/ci.yml/badge.svg)](https://github.com/openassistuk/openassist/actions/workflows/ci.yml)
[![Service Smoke](https://github.com/openassistuk/openassist/actions/workflows/service-smoke.yml/badge.svg)](https://github.com/openassistuk/openassist/actions/workflows/service-smoke.yml)

OpenAssist is a local-first LLM-to-chat gateway built around one daemon, `openassistd`, and one operator CLI, `openassist`.

It is designed for a public operator workflow:

- install from GitHub into a repo-backed checkout
- reach a first real reply with one provider and one channel
- use an advanced editor only when you need deeper changes
- upgrade in place with a dry-run plan and automatic rollback on failure

`Service Smoke` is a supplemental lifecycle workflow that runs on manual dispatch and schedule (`Mon`/`Thu` at `06:00 UTC`). It is not a required push or PR gate.

## Lifecycle

OpenAssist now has one canonical operator path:

1. Install OpenAssist with `install.sh` or `scripts/install/bootstrap.sh`.
2. Run `openassist setup quickstart` to get one provider, one channel, healthy service state, and a clear first-reply checklist.
3. Use `openassist setup wizard` for advanced runtime, provider, channel, scheduler, and tool/security changes.
4. Use `openassist upgrade --dry-run` before every update, then `openassist upgrade` when the plan looks correct.

## Fast Start

Full runbook: [`docs/operations/quickstart-linux-macos.md`](docs/operations/quickstart-linux-macos.md)

### 1. Install from GitHub

Interactive install:

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/openassistuk/openassist/main/install.sh)"
```

Non-interactive example:

```bash
curl -fsSL https://raw.githubusercontent.com/openassistuk/openassist/main/install.sh | bash -s -- --non-interactive --skip-service
```

Bootstrap keeps the current Git-backed model. It clones or updates a repo checkout, builds it, writes install state, and prints a lifecycle plan before it mutates anything.

Bootstrap mode matters:

- interactive TTY bootstrap runs `openassist setup quickstart` after the build
- non-interactive bootstrap leaves onboarding for a later `openassist setup quickstart` run
- non-interactive bootstrap still installs the service unless you pass `--skip-service`

### 2. Verify wrappers

```bash
openassist --help
openassistd --help
```

If your shell has not picked up the wrappers yet:

```bash
export PATH="$HOME/.local/bin:$PATH"
$HOME/.local/bin/openassist --help
```

### 3. Finish first-run onboarding

If bootstrap stopped early or you installed non-interactively, run quickstart explicitly:

```bash
openassist setup quickstart \
  --install-dir "$HOME/openassist" \
  --config "$HOME/openassist/openassist.toml" \
  --env-file "$HOME/.config/openassist/openassistd.env"
```

Quickstart is intentionally minimal:

- confirm runtime defaults for the first reply
- choose one primary provider
- capture API-key auth first
- configure one primary channel
- confirm the selected timezone with a simple `Y/n` prompt
- run service and health checks unless `--skip-service`

OAuth client configuration, extra providers, extra channels, scheduler tasks, native web tuning, and deeper runtime policy changes stay in `openassist setup wizard`.

Quickstart blocks invalid or incomplete first-reply state by default. Use `--allow-incomplete` only when you explicitly want to save a degraded setup.

### 4. Check install and runtime readiness

```bash
openassist doctor
openassist service status
openassist service health
openassist channel status
```

`openassist doctor` now reports install-state presence, repo-backed install status, tracked ref, config and env paths, detected service manager, and whether the current install is ready for `openassist upgrade`.

### 5. Send the first reply

Default quickstart success means:

- one provider is configured
- one channel is configured
- service health checks have passed, unless you explicitly skipped them
- the summary tells you exactly what to do next

For Telegram, quickstart keeps the default inline behavior:

- one memory stream per chat or group
- inline responses by default
- threaded behavior only when you configure it deliberately later

When the bot is online:

1. Send a simple message in the configured chat.
2. Confirm you receive a reply.
3. Send `/status` if you need local diagnostics without depending on provider health.

### 6. Use the advanced editor when needed

```bash
openassist setup wizard \
  --config "$HOME/openassist/openassist.toml" \
  --env-file "$HOME/.config/openassist/openassistd.env" \
  --install-dir "$HOME/openassist"
```

Wizard owns the advanced surfaces:

- basic runtime and defaults
- providers and model access
- channels and chat destinations
- scheduling and time
- advanced tools and security

Wizard saves also run post-save restart, health, time, and scheduler checks by default. Use `--skip-post-checks` only when you intentionally want to defer operational validation.

### 7. Upgrade safely

```bash
openassist upgrade --dry-run --install-dir "$HOME/openassist"
openassist upgrade --install-dir "$HOME/openassist"
```

Dry-run prints the resolved plan before any mutation:

- install directory
- current commit
- tracked ref
- target ref
- whether the update is a pull on the current branch or a detached checkout
- restart and health behavior
- rollback target

Use `openassist upgrade` for normal in-place updates on a clean repo-backed checkout. Re-run bootstrap instead when the checkout is damaged, missing `.git`, or you want a fresh install directory.

If the checkout is detached, dry-run will show that state before any mutation. In that case, prefer `--ref <branch-or-tag>` so the update target is explicit. Re-run bootstrap instead of forcing `upgrade` when the repo metadata is damaged or build output under `apps/openassist-cli/dist` or `apps/openassistd/dist` is missing.

## Install Model

OpenAssist does not currently use packaged release artifacts. Install and update both operate on a local Git checkout.

Bootstrap writes and preserves an install record at `~/.config/openassist/install-state.json` with the lifecycle fields that matter for later commands:

- `installDir`
- `repoUrl`
- `trackedRef`
- `serviceManager`
- `configPath`
- `envFilePath`
- `lastKnownGoodCommit`

`openassist service install`, `openassist doctor`, and `openassist upgrade` all read or update the same record instead of drifting independent state.

The install record keeps the tracked ref visible to operators, but `openassist upgrade` still follows the current checked-out branch by default. If the repo is detached, dry-run will show the target ref it resolved, and you should usually pass `--ref` explicitly.

## Command Reference

Core lifecycle:

```bash
openassist doctor
openassist setup quickstart
openassist setup wizard
openassist service install --install-dir "$HOME/openassist" --config "$HOME/openassist/openassist.toml" --env-file "$HOME/.config/openassist/openassistd.env"
openassist upgrade --dry-run --install-dir "$HOME/openassist"
```

Service operations:

```bash
openassist service status
openassist service restart
openassist service logs --lines 200 --follow
openassist service health
```

Auth and channels:

```bash
openassist auth start --provider <provider-id> --account default --open-browser
openassist auth status
openassist channel status
openassist channel qr --id <channel-id>
```

Time and scheduler:

```bash
openassist time status
openassist time confirm --timezone Europe/London
openassist scheduler status
openassist scheduler tasks
```

Source-checkout alternatives are documented, but the installed commands above are the primary operator path.

## Docs

- Lifecycle runbook: [`docs/operations/quickstart-linux-macos.md`](docs/operations/quickstart-linux-macos.md)
- Linux install details: [`docs/operations/install-linux.md`](docs/operations/install-linux.md)
- macOS install details: [`docs/operations/install-macos.md`](docs/operations/install-macos.md)
- Quickstart vs wizard: [`docs/operations/setup-wizard.md`](docs/operations/setup-wizard.md)
- Upgrade and rollback: [`docs/operations/upgrade-and-rollback.md`](docs/operations/upgrade-and-rollback.md)
- Restart and recovery: [`docs/operations/restart-recovery.md`](docs/operations/restart-recovery.md)
- Full docs index: [`docs/README.md`](docs/README.md)

## Safety Model

Default session profile is `operator`.

- `restricted` and `operator` do not expose autonomous tool execution
- `full-root` enables autonomous host-impacting tools for that session only
- native web tooling remains runtime-owned, bounded, and profile-gated
- `/status` and lifecycle CLI output are designed to stay useful even when provider auth is broken

Local merge gate:

```bash
pnpm verify:all
```
