# OpenAssist

[![CI](https://github.com/openassistuk/openassist/actions/workflows/ci.yml/badge.svg)](https://github.com/openassistuk/openassist/actions/workflows/ci.yml)
[![Service Smoke](https://github.com/openassistuk/openassist/actions/workflows/service-smoke.yml/badge.svg)](https://github.com/openassistuk/openassist/actions/workflows/service-smoke.yml)
[![Lifecycle E2E Smoke](https://github.com/openassistuk/openassist/actions/workflows/lifecycle-e2e-smoke.yml/badge.svg)](https://github.com/openassistuk/openassist/actions/workflows/lifecycle-e2e-smoke.yml)

OpenAssist is a local-first machine assistant built around one daemon, `openassistd`, and one operator CLI, `openassist`.

It is designed to help with the host it runs on, not just with its own repo:

- local system tasks and diagnostics
- files, supported images, and supported text-like documents
- web research through the bounded native web toolchain
- recurring automations and skill-driven jobs
- OpenAssist lifecycle and self-maintenance
- controlled capability growth through managed skills and helper tools

It is designed for a public operator workflow:

- install from GitHub into a repo-backed checkout
- run one beginner-first lifecycle hub with `openassist setup`
- reach a first real reply with one provider and one channel
- use an advanced editor only when you need deeper changes
- upgrade in place with a dry-run plan and automatic rollback on failure

Supported first-class chat surfaces in the current release:

- Telegram: private chats, groups, forum topics
- Discord: guild text channels, threads, DMs
- WhatsApp MD: private chats, groups

Channel replies now render with channel-safe formatting, long replies are chunked cleanly, and inbound images plus supported text-like documents are preserved instead of being dropped. Built-in OpenAI and Anthropic providers can inspect inbound images; OpenAI-compatible providers stay text-only and say so explicitly.

Supplemental lifecycle workflows:

- `Service Smoke` runs on manual dispatch and schedule (`Mon`/`Thu` at `06:00 UTC`) for dry-run service and upgrade checks.
- `Lifecycle E2E Smoke` runs on manual dispatch and schedule (`Tue`/`Sat` at `07:00 UTC`) for stronger bootstrap, home-state, doctor, and upgrade dry-run verification.
- neither workflow is a required push or PR gate

## Lifecycle

OpenAssist now has one canonical operator path:

1. Install OpenAssist with `install.sh` or `scripts/install/bootstrap.sh`.
2. Run `openassist setup` and choose `First-time setup` to reach one provider, one channel, healthy service state, and a clear first-reply checklist.
3. Use `openassist setup wizard` only when you need deeper runtime, provider, channel, scheduler, or tool/security changes.
4. Use `openassist upgrade --dry-run` before every update, then `openassist upgrade` when the plan looks correct.

## Fast Start

Full runbook: [`docs/operations/quickstart-linux-macos.md`](docs/operations/quickstart-linux-macos.md)
Common troubleshooting: [`docs/operations/common-troubleshooting.md`](docs/operations/common-troubleshooting.md)

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

- interactive TTY bootstrap runs bare `openassist setup` after the build
- non-interactive bootstrap leaves onboarding for a later `openassist setup` or `openassist setup quickstart` run
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

The default beginner entrypoint is now bare `openassist setup`:

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

If you want the direct scripted first-reply path instead, quickstart is still available:

```bash
openassist setup quickstart \
  --install-dir "$HOME/openassist" \
  --config "$HOME/.config/openassist/openassist.toml" \
  --env-file "$HOME/.config/openassist/openassistd.env"
```

Quickstart remains intentionally minimal:

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

Fresh installs now keep normal writable operator state outside the repo checkout:

- config: `~/.config/openassist/openassist.toml`
- overlays: `~/.config/openassist/config.d`
- env file: `~/.config/openassist/openassistd.env`
- install state: `~/.config/openassist/install-state.json`
- runtime data: `~/.local/share/openassist/data`
- runtime logs: `~/.local/share/openassist/logs`
- managed skills: `~/.local/share/openassist/skills`
- managed helper tools: `~/.local/share/openassist/data/helper-tools`

If OpenAssist detects the recognized old repo-local layout (`openassist.toml`, `config.d`, and `.openassist` inside the install directory) during `openassist setup`, `openassist setup quickstart`, or `openassist setup wizard`, it migrates that state into the canonical home-state layout when the target home paths are empty or compatible. A timestamped backup bundle is written under `~/.local/share/openassist/migration-backups/<timestamp>` before the migration changes anything. `openassist doctor` and `openassist upgrade --dry-run` detect the same legacy layout and route you back to setup instead of migrating it in place.

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

`openassist doctor` now uses the same shared lifecycle model as bootstrap, setup, and upgrade. Human-readable output always reports in this order:

- `Ready now`
- `Needs action`
- `Next command`

Use `openassist doctor --json` when you want the machine-readable grouped report. The JSON report is now `version: 2` and keeps the grouped sections while adding per-item `stage` metadata.

## Troubleshooting

Start with the central runbook:

- [`docs/operations/common-troubleshooting.md`](docs/operations/common-troubleshooting.md)

Typical host-side triage:

```bash
openassist doctor
openassist service status
openassist service health
openassist channel status
```

Use the troubleshooting runbook when:

- bootstrap stopped before onboarding
- bare `openassist setup` is running in non-TTY automation
- service checks fail after quickstart or wizard
- `/status` and host-side access checks disagree
- `openassist upgrade --dry-run` reports migration, dirtiness, or rerun-bootstrap blockers

## Runtime Awareness and Growth

Normal chat turns plus the runtime-owned `/start`, `/help`, `/capabilities`, `/grow`, and `/status` surfaces now carry one bounded OpenAssist awareness pack so the assistant can stay grounded in:

- what OpenAssist is and which modules it owns
- the current host/runtime/access/tool boundary
- local config, env, install, and update facts when known
- the local docs that define lifecycle, security, interfaces, and runtime behavior
- which kinds of self-maintenance are safe right now and which are blocked
- which capability domains are currently available or limited
- which managed growth assets already exist and how durable growth should happen safely

This does not weaken the security model. Lower-access sessions stay advisory-only for self-maintenance. Only `full-root` sessions with callable tools may make bounded local config/docs/code changes, and updater-owned paths still stay off-limits to ad-hoc edits.
In chat, full config/env/install filesystem paths are reserved for approved operators; other senders still get the high-level lifecycle summary plus host-side command guidance.

Runtime-owned chat surfaces now have clearer roles:

- `/start` and `/help`: general OpenAssist welcome plus a truthful summary of what this session can help with
- `/capabilities`: live capability inventory for the current provider, channel, tools, scheduler state, and access level
- `/grow`: managed skills, helper tools, growth policy, and safe next actions
- `/status`: operational diagnostics, lifecycle context, sender/session IDs, and effective access
- `/profile`: view or intentionally update the main assistant identity

## Controlled Growth

OpenAssist now treats durable growth as `extensions-first`.

That means:

- managed skills live under the runtime-owned skills directory
- managed helper tools live under the runtime-owned helper-tools directory
- both are tracked durably so `doctor`, `upgrade --dry-run`, `/grow`, and host-side growth commands can describe what is installed
- normal upgrades are designed to preserve those managed assets
- direct repo edits remain possible in `full-root`, but they are documented as advanced or developer work and are not treated as update-safe growth

Host-side growth commands:

```bash
openassist skills list
openassist skills install --path "/path/to/skill"
openassist growth status
openassist growth helper add --name <id> --root "/path/to/tool" --installer <kind> --summary "<text>"
```

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
  --config "$HOME/.config/openassist/openassist.toml" \
  --env-file "$HOME/.config/openassist/openassistd.env" \
  --install-dir "$HOME/openassist"
```

Wizard owns the advanced surfaces:

- basic runtime and defaults
- providers and model access
- channels and chat destinations
- scheduling and time
- advanced tools and security

Wizard is also where advanced provider-native reasoning controls live:

- OpenAI `reasoningEffort` for supported GPT-5/codex/o-series Responses API model families
- Anthropic `thinkingBudgetTokens` for supported thinking-capable Claude families
- safe default is unset, which means OpenAssist sends no provider-specific reasoning parameter
- OpenAI-compatible providers stay unchanged in this release

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

The repo checkout is now code-first by default. The root [`openassist.toml`](openassist.toml) file is a source-development sample, not the default operator config path for installed lifecycle commands.

The install record keeps the tracked ref visible to operators, but `openassist upgrade` still follows the current checked-out branch by default. If the repo is detached, dry-run will show the target ref it resolved, and you should usually pass `--ref` explicitly.

WhatsApp/media install baseline:

- `pnpm-workspace.yaml` now allows the WhatsApp/media build-script dependencies used by the supported path
- if `pnpm` still reports skipped WhatsApp/media build scripts on your host, approve them before relying on WhatsApp image or document handling

## Command Reference

Core lifecycle:

```bash
openassist doctor
openassist setup
openassist setup quickstart
openassist setup wizard
openassist service install --install-dir "$HOME/openassist" --config "$HOME/.config/openassist/openassist.toml" --env-file "$HOME/.config/openassist/openassistd.env"
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

Managed growth:

```bash
openassist skills list
openassist skills install --path "/path/to/skill"
openassist growth status
openassist growth helper add --name <id> --root "/path/to/tool" --installer <kind> --summary "<text>"
```

In-chat runtime commands:

- `/start`
- `/help`
- `/capabilities`
- `/grow`
- `/status`
- `/profile`

Source-checkout alternatives are documented, but the installed commands above are the primary operator path.

## Docs

- Lifecycle runbook: [`docs/operations/quickstart-linux-macos.md`](docs/operations/quickstart-linux-macos.md)
- Common troubleshooting: [`docs/operations/common-troubleshooting.md`](docs/operations/common-troubleshooting.md)
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
- `full-root` can also support managed growth work, but the preferred durable path is runtime-owned skills and helper tools rather than tracked repo mutation
- native web tooling remains runtime-owned, bounded, and profile-gated
- `/status` shows the current sender ID, canonical session ID, effective access, and access source
- `/status` and lifecycle CLI output are designed to stay useful even when provider auth is broken

Local merge gate:

```bash
pnpm verify:all
```

That gate now includes a docs-truth validation pass, so stale command examples, broken root-doc links, or mismatched workflow/test-matrix claims fail alongside code regressions.

Required PR CI:

- workflow lint
- quality-and-coverage on `ubuntu-latest`, `macos-latest`, and `windows-latest`

Supplemental smoke:

- `.github/workflows/service-smoke.yml` is dry-run lifecycle smoke on Linux/macOS and remains manual/scheduled only
- `.github/workflows/lifecycle-e2e-smoke.yml` is a stronger home-state/bootstrap lifecycle smoke on Linux/macOS and remains manual/scheduled only
