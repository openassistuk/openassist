# OpenAssist

[![CI](https://github.com/openassistuk/openassist/actions/workflows/ci.yml/badge.svg)](https://github.com/openassistuk/openassist/actions/workflows/ci.yml)
[![CodeQL](https://github.com/openassistuk/openassist/actions/workflows/codeql.yml/badge.svg)](https://github.com/openassistuk/openassist/actions/workflows/codeql.yml)
[![macOS Live Launchd](https://github.com/openassistuk/openassist/actions/workflows/macos-live-launchd.yml/badge.svg)](https://github.com/openassistuk/openassist/actions/workflows/macos-live-launchd.yml)
[![Service Smoke](https://github.com/openassistuk/openassist/actions/workflows/service-smoke.yml/badge.svg)](https://github.com/openassistuk/openassist/actions/workflows/service-smoke.yml)
[![Lifecycle E2E Smoke](https://github.com/openassistuk/openassist/actions/workflows/lifecycle-e2e-smoke.yml/badge.svg)](https://github.com/openassistuk/openassist/actions/workflows/lifecycle-e2e-smoke.yml)

OpenAssist is a local-first machine assistant built around one daemon, `openassistd`, and one operator CLI, `openassist`.

It is designed for real operator workflows on a real host:

- one primary setup hub with `openassist setup`
- first-class providers for OpenAI, Codex, Anthropic, and OpenAI-compatible backends
- first-class chat channels for Telegram, Discord, and WhatsApp MD
- restart-safe runtime behavior, policy-gated tools, and bounded native web research
- durable lifecycle commands for setup, service management, health, and upgrades

Built-in OpenAI, Codex, and Anthropic providers can inspect inbound images. OpenAI-compatible providers stay text-only for images and say so explicitly.

## Start Here

The fastest operator path is:

1. Install from GitHub or a local checkout.
2. Run `openassist setup`.
3. Choose one provider and one channel.
4. Confirm `openassist doctor` and `openassist service health`.
5. Send the first real chat message.

Canonical beginner docs:

- Quickstart runbook: [`docs/operations/quickstart-linux-macos.md`](docs/operations/quickstart-linux-macos.md)
- Common troubleshooting: [`docs/operations/common-troubleshooting.md`](docs/operations/common-troubleshooting.md)
- Full docs index: [`docs/README.md`](docs/README.md)

Linux and macOS are first-class supported operator paths for the installed lifecycle in this release. Windows stays in the required CI matrix, but service-manager parity is not the operator target yet.

## Why OpenAssist

- Local-first: OpenAssist is meant to help with the machine it runs on, not only with its own repo.
- Public-operator friendly: install, setup, service, and upgrade flows are documented for real beginner and repair paths.
- Bounded by default: autonomy, filesystem access, package installs, and web tooling stay policy-gated and auditable.
- Modular by contract: providers, channels, tools, scheduler, recovery, and storage are split across explicit package boundaries.

## Pick a Provider Route

| Route | Auth model | Best when | Learn more |
| --- | --- | --- | --- |
| OpenAI | API key | You want the standard OpenAI API-key path with image support and optional reasoning tuning. | [`docs/providers/openai.md`](docs/providers/openai.md) |
| Codex | Linked OpenAI account login | You want the separate Codex account-login route, especially on a VPS or remote host via device code. | [`docs/providers/codex.md`](docs/providers/codex.md) |
| Anthropic | API key | You want Claude-family models with optional thinking budgets. | [`docs/providers/anthropic.md`](docs/providers/anthropic.md) |
| OpenAI-compatible | API key or backend token | You are targeting an API-compatible backend and accept text-only image behavior. | [`docs/providers/openai-compatible.md`](docs/providers/openai-compatible.md) |

Provider route rules that matter at a glance:

- OpenAI remains the public API-key route.
- Codex remains the separate public account-login route.
- Codex is intentionally documented as Codex-only in this release.
- OpenAI and Codex quickstart both expose `Default`, `Low`, `Medium`, `High`, and `XHigh` reasoning effort choices.
- Anthropic exposes `thinkingBudgetTokens` in wizard for supported thinking-capable models.

## Pick a Channel

| Channel | Supported scope | Notable behavior | Learn more |
| --- | --- | --- | --- |
| Telegram | private chats, groups, forum topics | Beginner-friendly default with inline chat memory and inline responses. | [`docs/channels/telegram.md`](docs/channels/telegram.md) |
| Discord | guild text channels, threads, DMs | Explicit DM allow-listing keeps direct-message access separate from guild routing. | [`docs/channels/discord.md`](docs/channels/discord.md) |
| WhatsApp MD | private chats, groups | Requires session linking and may need `openassist channel qr --id <channel-id>` during setup. | [`docs/channels/whatsapp-md.md`](docs/channels/whatsapp-md.md) |

Channel replies render with channel-safe formatting, long replies are chunked cleanly, and supported images plus text-like documents are preserved instead of being silently dropped.

## Install and First Reply

Interactive install:

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/openassistuk/openassist/main/install.sh)"
```

Non-interactive example:

```bash
curl -fsSL https://raw.githubusercontent.com/openassistuk/openassist/main/install.sh | bash -s -- --non-interactive --skip-service
```

Then run:

```bash
openassist setup
openassist doctor
openassist service health
```

If you want the direct strict onboarding path instead of the hub:

```bash
openassist setup quickstart \
  --install-dir "$HOME/openassist" \
  --config "$HOME/.config/openassist/openassist.toml" \
  --env-file "$HOME/.config/openassist/openassistd.env"
```

Fresh installs keep writable operator state outside the repo checkout by default:

- config: `~/.config/openassist/openassist.toml`
- overlays: `~/.config/openassist/config.d`
- env file: `~/.config/openassist/openassistd.env`
- install state: `~/.config/openassist/install-state.json`
- runtime data: `~/.local/share/openassist/data`
- runtime logs: `~/.local/share/openassist/logs`
- managed skills: `~/.local/share/openassist/skills`
- managed helper tools: `~/.local/share/openassist/data/helper-tools`

Advanced developer install tracks remain command-line only:

```bash
curl -fsSL https://raw.githubusercontent.com/openassistuk/openassist/main/install.sh | bash -s -- --ref feature/my-branch
curl -fsSL https://raw.githubusercontent.com/openassistuk/openassist/main/install.sh | bash -s -- --pr 123
```

Those branch and PR flags are for non-`main` developer testing and are intentionally not surfaced through the beginner setup hub.

## Configuration

OpenAssist uses a split configuration model:

- `openassist.toml` for normal runtime configuration
- `openassistd.env` for secrets and secret-like values

Start here:

- Practical guide: [`docs/configuration/config-file-guide.md`](docs/configuration/config-file-guide.md)
- Schema-backed reference: [`docs/configuration/config-reference.md`](docs/configuration/config-reference.md)
- Source-checkout sample: [`openassist.toml`](openassist.toml)

Useful config commands:

```bash
openassist config validate --config "$HOME/.config/openassist/openassist.toml"
openassist setup show --config "$HOME/.config/openassist/openassist.toml"
openassist setup env --env-file "$HOME/.config/openassist/openassistd.env"
```

## Common Commands

Core lifecycle:

```bash
openassist doctor
openassist setup
openassist setup wizard
openassist service status
openassist service health
openassist upgrade --dry-run
```

Provider and channel checks:

```bash
openassist auth status
openassist auth start --provider codex-main --device-code
openassist channel status
openassist channel qr --id whatsapp-main
```

Operator diagnostics:

```bash
openassist tools status --session <channelId>:<conversationKey> --sender-id <sender-id>
openassist memory status --session <channelId>:<conversationKey> --sender-id <sender-id>
openassist growth status
```

## Docs Map

Beginner and operations:

- Quickstart: [`docs/operations/quickstart-linux-macos.md`](docs/operations/quickstart-linux-macos.md)
- Setup hub and wizard: [`docs/operations/setup-wizard.md`](docs/operations/setup-wizard.md)
- Troubleshooting: [`docs/operations/common-troubleshooting.md`](docs/operations/common-troubleshooting.md)
- Upgrade and rollback: [`docs/operations/upgrade-and-rollback.md`](docs/operations/upgrade-and-rollback.md)

Providers:

- [`docs/providers/openai.md`](docs/providers/openai.md)
- [`docs/providers/codex.md`](docs/providers/codex.md)
- [`docs/providers/anthropic.md`](docs/providers/anthropic.md)
- [`docs/providers/openai-compatible.md`](docs/providers/openai-compatible.md)

Channels:

- [`docs/channels/telegram.md`](docs/channels/telegram.md)
- [`docs/channels/discord.md`](docs/channels/discord.md)
- [`docs/channels/whatsapp-md.md`](docs/channels/whatsapp-md.md)

Configuration:

- [`docs/configuration/config-file-guide.md`](docs/configuration/config-file-guide.md)
- [`docs/configuration/config-reference.md`](docs/configuration/config-reference.md)

Architecture, interfaces, security, and testing:

- [`docs/architecture/overview.md`](docs/architecture/overview.md)
- [`docs/interfaces/provider-adapter.md`](docs/interfaces/provider-adapter.md)
- [`docs/interfaces/channel-adapter.md`](docs/interfaces/channel-adapter.md)
- [`docs/security/policy-profiles.md`](docs/security/policy-profiles.md)
- [`docs/testing/test-matrix.md`](docs/testing/test-matrix.md)

## Safety Model

Default install path is `Standard mode (recommended)`.

- standard mode keeps `runtime.defaultPolicyProfile=operator`, keeps approved operators at standard access by default, and keeps filesystem tools workspace-only
- full access for approved operators keeps the default chat access at `operator`, but lets explicitly approved sender IDs default to `full-root`
- approved operator IDs are configured per channel in `channels[*].settings.operatorUserIds`
- Linux systemd filesystem access is a separate service-level boundary with a safe default of `hardened`
- `full-root` does not by itself grant Unix root or remove Linux systemd sandboxing
- `/status`, `/access`, `/capabilities`, `openassist tools status`, and lifecycle output show the current service boundary as well as the effective access mode
- native web tooling remains runtime-owned, bounded, and profile-gated

## GitHub Automation

- `CI` runs on pushes to `main`, pull requests, manual dispatch, and a daily `04:30 UTC` schedule for workflow lint plus the `quality-and-coverage` matrix on `ubuntu-latest`, `macos-latest`, and `windows-latest`. The workflow lint leg also enforces the tracked action-version floors for `actions/checkout@v6`, `actions/setup-node@v6`, `actions/upload-artifact@v7`, and `github/codeql-action/*@v4`.
- `CodeQL` runs on pushes to `main`, pull requests to `main`, manual dispatch, and a weekly `Mon` at `05:15 UTC` schedule. In this public repo it runs `CodeQL preflight` plus `analyze (javascript-typescript)`.
- `macOS Live Launchd` runs on pull requests to `main` and manual dispatch. Its `launchd-live-smoke (macos-latest)` job is the required hosted live LaunchAgent gate on `main`.
- `Service Smoke` runs on manual dispatch and schedule (`Mon`/`Thu` at `06:00 UTC`) for dry-run service checks plus unconfigured-checkout upgrade routing assertions.
- `Lifecycle E2E Smoke` runs on manual dispatch and schedule (`Tue`/`Sat` at `07:00 UTC`) for stronger bootstrap, home-state, doctor, and upgrade dry-run verification.
- the two smoke workflows are supplemental manual or scheduled signals, not normal per-push or per-PR gates

## Local Verification

Local merge gate:

```bash
pnpm verify:all
```

That gate includes a docs-truth validation pass, so stale command examples, broken local doc links, broken doc anchors, incomplete docs indexing, mismatched coverage-threshold references, mismatched coverage-scope references, or workflow drift fail alongside code regressions.

Node coverage now excludes `tests/**` from reported totals, and Vitest coverage intentionally targets the CLI library plus selected daemon, config, runtime, provider, and web-tool modules instead of claiming full-repo source coverage. The exact measured source list lives in [`docs/testing/test-matrix.md`](docs/testing/test-matrix.md).
