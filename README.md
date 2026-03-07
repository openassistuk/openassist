# OpenAssist

[![CI](https://github.com/openassistuk/openassist/actions/workflows/ci.yml/badge.svg)](https://github.com/openassistuk/openassist/actions/workflows/ci.yml)
[![Service Smoke](https://github.com/openassistuk/openassist/actions/workflows/service-smoke.yml/badge.svg)](https://github.com/openassistuk/openassist/actions/workflows/service-smoke.yml)

OpenAssist is a local-first LLM-to-chat gateway built around one daemon, `openassistd`, and one operator CLI, `openassist`.

It is designed for a public operator workflow:

- install from GitHub into a repo-backed checkout
- reach a first real reply with one provider and one channel
- use an advanced editor only when you need deeper changes
- upgrade in place with a dry-run plan and automatic rollback on failure

Supported first-class chat surfaces in the current release:

- Telegram: private chats, groups, forum topics
- Discord: guild text channels, threads, DMs
- WhatsApp MD: private chats, groups

Channel replies now render with channel-safe formatting, long replies are chunked cleanly, and inbound images plus supported text-like documents are preserved instead of being dropped. Built-in OpenAI and Anthropic providers can inspect inbound images; OpenAI-compatible providers stay text-only and say so explicitly.

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
Its final summary now always ends in the same operator order used by the CLI lifecycle surfaces:

- `Ready now`
- `Needs action`
- `Next command`

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
- choose the main assistant name, persona, and ongoing objectives before the first chat
- choose one primary provider
- capture API-key auth first
- configure one primary channel
- choose an access mode:
  - `Standard mode (recommended)`
  - `Full access for approved operators`
- confirm the selected timezone with a simple `Y/n` prompt
- review the first-reply plan before files are written
- run service and health checks unless `--skip-service`

Before quickstart saves, it now pauses at a required review step with these actions:

- `Save`
- `Edit runtime`
- `Edit assistant identity`
- `Edit provider`
- `Edit channel`
- `Edit timezone`
- `Abort`

If quickstart validation fails, it now groups repair guidance by operator task instead of printing one flat issue list:

- provider auth
- channel auth or routing
- timezone or time
- service or health
- access or operator IDs

Quickstart writes the same global main-agent identity that `/profile` manages later, and a successful quickstart disables the later first-chat identity reminder by default.

OAuth client configuration, extra providers, extra channels, scheduler tasks, native web tuning, and deeper runtime policy changes stay in `openassist setup wizard`.

Quickstart blocks invalid or incomplete first-reply state by default. Use `--allow-incomplete` only when you explicitly want to save a degraded setup.
If you opt into full access, quickstart asks for approved operator IDs for the chosen channel and falls back cleanly to standard mode if you are not ready to enter them yet.
Discord direct messages stay disabled unless you explicitly add `allowedDmUserIds`.

### 4. Check install and runtime readiness

```bash
openassist doctor
openassist doctor --json
openassist service status
openassist service health
openassist channel status
```

`openassist doctor` now uses the same grouped lifecycle model as bootstrap, quickstart, and upgrade. It always reports in this order:

- `Ready now`
- `Needs action before first reply`
- `Needs action before full access`
- `Needs action before upgrade`
- `Recommended next command`

Use `openassist doctor --json` when you want the same grouped report shape for automation or scripting.

## Runtime Self-Knowledge

Normal chat turns and `/status` now carry a bounded OpenAssist self-knowledge pack so the assistant can stay grounded in:

- what OpenAssist is and which modules it owns
- the current host/runtime/access/tool boundary
- local config, env, install, and update facts when known
- the local docs that define lifecycle, security, interfaces, and runtime behavior
- which kinds of self-maintenance are safe right now and which are blocked

This does not weaken the security model. Lower-access sessions stay advisory-only for self-maintenance. Only `full-root` sessions with callable tools may make bounded local config/docs/code changes, and updater-owned paths still stay off-limits to ad-hoc edits.
In chat, full config/env/install filesystem paths are reserved for approved operators; other senders still get the high-level lifecycle summary plus host-side command guidance.

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
2. Confirm you receive a reply with readable formatting instead of one dense wall of text.
3. Confirm the assistant introduces itself with the name/persona you chose in quickstart.
4. Send `/status` if you need local diagnostics without depending on provider health.
5. Copy the sender ID and session ID from `/status` if you want to configure approved operators or inspect actor-specific access from the CLI later.

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
- whether the update is:
  - safe to continue
  - fix before updating
  - rerun bootstrap instead

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

WhatsApp/media install baseline:

- `pnpm-workspace.yaml` now allows the WhatsApp/media build-script dependencies used by the supported path
- if `pnpm` still reports skipped WhatsApp/media build scripts on your host, approve them before relying on WhatsApp image or document handling

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

Actor-aware access checks:

```bash
openassist policy-get --session <channelId>:<conversationKey> --sender-id <sender-id>
openassist policy-get --session <channelId>:<conversationKey> --sender-id <sender-id> --json
openassist tools status --session <channelId>:<conversationKey> --sender-id <sender-id>
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

Default install path is `Standard mode (recommended)`.

- standard mode keeps `runtime.defaultPolicyProfile=operator`, keeps approved operators at standard access by default, and keeps filesystem tools workspace-only
- full access for approved operators keeps the default chat access at `operator`, but lets explicitly approved sender IDs default to `full-root`
- approved operator IDs are configured per channel in `channels[*].settings.operatorUserIds`
- `/access` is available only to approved operators and only changes that sender's access for the current chat
- `restricted` and `operator` do not expose autonomous tool execution
- `full-root` enables autonomous host-impacting tools for that sender/chat resolution only
- native web tooling remains runtime-owned, bounded, and profile-gated
- `/status` shows the current sender ID, canonical session ID, effective access, and access source
- `/status` and lifecycle CLI output are designed to stay useful even when provider auth is broken

Local merge gate:

```bash
pnpm verify:all
```
