# OpenAssist

[![CI](https://github.com/openassistuk/openassist/actions/workflows/ci.yml/badge.svg)](https://github.com/openassistuk/openassist/actions/workflows/ci.yml)
[![CodeQL](https://github.com/openassistuk/openassist/actions/workflows/codeql.yml/badge.svg)](https://github.com/openassistuk/openassist/actions/workflows/codeql.yml)
[![macOS Live Launchd](https://github.com/openassistuk/openassist/actions/workflows/macos-live-launchd.yml/badge.svg)](https://github.com/openassistuk/openassist/actions/workflows/macos-live-launchd.yml)
[![Service Smoke](https://github.com/openassistuk/openassist/actions/workflows/service-smoke.yml/badge.svg)](https://github.com/openassistuk/openassist/actions/workflows/service-smoke.yml)
[![Lifecycle E2E Smoke](https://github.com/openassistuk/openassist/actions/workflows/lifecycle-e2e-smoke.yml/badge.svg)](https://github.com/openassistuk/openassist/actions/workflows/lifecycle-e2e-smoke.yml)

OpenAssist is a local-first machine assistant built around one daemon, `openassistd`, and one operator CLI, `openassist`.

It is designed for real operator workflows on a real host:

- one primary setup hub with `openassist setup`
- first-class providers for OpenAI, Codex, Anthropic, Azure Foundry, and OpenAI-compatible backends
- first-class chat channels for Telegram, Discord, and WhatsApp MD
- restart-safe runtime behavior, policy-gated tools, and bounded native web research
- durable lifecycle commands for setup, service management, health, and upgrades

Built-in OpenAI, Codex, Anthropic, and Azure Foundry providers can inspect inbound images. OpenAI-compatible providers stay text-only for images and say so explicitly.

## Start Here

Start with [Install and First Reply](#install-and-first-reply) below. It includes copy-and-paste commands, supported systems and the difference between packaged releases and source builds.

The first-reply path is:

1. Install OpenAssist using an available installation method below.
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
| Anthropic | API key | You want Claude-family models with adaptive thinking and legacy manual budgets. | [`docs/providers/anthropic.md`](docs/providers/anthropic.md) |
| Azure Foundry | API key or Microsoft Entra host credentials | You want Azure resource-style `/openai/v1/` endpoints with a deployed Azure model and optional reasoning hints. | [`docs/providers/azure-foundry.md`](docs/providers/azure-foundry.md) |
| OpenAI-compatible | API key or backend token | You are targeting an API-compatible backend and accept text-only image behavior. | [`docs/providers/openai-compatible.md`](docs/providers/openai-compatible.md) |

Provider route rules that matter at a glance:

- OpenAI remains the public API-key route.
- Codex remains the separate public account-login route.
- Codex is intentionally documented as Codex-only in this release.
- Fresh OpenAI and Codex setup recommends `gpt-6-sol`, with Astra and Luna alternatives. Reasoning choices are model-specific and include `none` and `max` where supported; `Default` omits the parameter.
- Fresh Anthropic setup recommends `claude-sonnet-5`. Wizard exposes adaptive thinking and effort controls, plus manual budgets for compatible older models.
- Saved model IDs remain unchanged. Retired Codex `gpt-5.4` selections block readiness until you explicitly choose a replacement in `openassist setup wizard`. See [model compatibility](docs/providers/model-compatibility.md).
- Azure Foundry is the Azure resource-style `/openai/v1/` route, uses the Responses API only, and requires a deployed Azure deployment name plus either API-key or Entra host auth.

Current models include GPT-6 Astra/Sol/Luna and Claude Opus 5.5/Fable 5.1, alongside Sonnet 5 and Haiku 4.5. Azure keeps your deployment name and requires a known underlying model for tuning. Wizard exposes API/Azure Standard/Pro execution and Claude output budgets. [Model compatibility](docs/providers/model-compatibility.md) lists exact controls, availability limits and preserved-thinking behavior.

Anthropic quickstart/wizard supports optional `workspaceId` for multi-workspace keys. Current stable SDK versions, credential handling and remaining live checks are recorded in the [provider/channel readiness guide](docs/operations/provider-channel-readiness.md).

## Pick a Channel

| Channel | Supported scope | Notable behavior | Learn more |
| --- | --- | --- | --- |
| Telegram | private chats, groups, forum topics | Beginner-friendly default with inline chat memory and inline responses. | [`docs/channels/telegram.md`](docs/channels/telegram.md) |
| Discord | guild text channels, threads, DMs | Explicit DM allow-listing keeps direct-message access separate from guild routing. | [`docs/channels/discord.md`](docs/channels/discord.md) |
| WhatsApp MD | private chats, groups | Requires session linking and may need `openassist channel qr --id <channel-id>` during setup. | [`docs/channels/whatsapp-md.md`](docs/channels/whatsapp-md.md) |

Channel replies render with channel-safe formatting, long replies are chunked cleanly, and supported images plus text-like documents are preserved instead of being silently dropped.

## Install and First Reply

**Current availability:** [v0.2.0 stable](https://github.com/openassistuk/openassist/releases/tag/v0.2.0) is published and signed. Public installation passed on Linux and macOS, each on x64 and arm64. The default installer now selects this stable release.

The [stable release notes](docs/releases/v0.2.0.md) cover the merged Ubuntu lifecycle/reminder fixes and dependency/security repairs. Publication, independent signature checks and four-target public installation are recorded in the [release evidence](docs/execplans/stable-0.2.0-release.md). Additional fresh-host provider/channel retesting remains unverified.

The final merged-main audit detected seven additional Axios advisories through WhatsApp/Baileys. Source builds containing the [post-release repair](docs/execplans/post-release-axios-audit-2026-09-30.md) resolve Axios `1.20.0`. Published `v0.2.0` and `v0.2.0-rc.1` packages retain affected Axios `1.18.0`; this source repair does not update installed packages. The [v0.2.1 security patch](docs/releases/v0.2.1.md) is being prepared for signed publication; it is not available through the release track yet. See its [preparation evidence](docs/execplans/stable-0.2.1-release.md). After publication and public-install verification, existing installations can select it with `openassist update --release --channel stable` (inspect `--dry-run` first); exact-version pins do not advance automatically.

### Install the packaged stable release

Packaged releases contain OpenAssist, its dependencies and a private Node runtime. You do **not** need to install Node, Git or pnpm, or obtain a signing key: verification is automatic. The installer itself needs Bash, curl, OpenSSL, gzip and standard Unix utilities.

Supported packaged targets are Linux x64/arm64 with glibc 2.28+ and kernel 4.18+, and macOS 13.5+ on Intel or Apple Silicon. Alpine/musl and Windows operator installations are not supported. See the [Linux](docs/operations/install-linux.md) and [macOS](docs/operations/install-macos.md) guides for platform details.

Run this in a terminal on Linux or macOS, using your normal login account unless you deliberately want a system-level Linux service:

```bash
curl -fsSL https://raw.githubusercontent.com/openassistuk/openassist/main/install.sh | bash
```

To pin this release, use the piped installer with `bash -s -- --version 0.2.0`. Exact-version installations stay pinned until you explicitly change their track. See the [stable release notes](docs/releases/v0.2.0.md) for limits and migration guidance. The older rc.1 preview remains available with `--channel preview`.

For unattended packaged installation without setup prompts or service installation:

```bash
curl -fsSL https://raw.githubusercontent.com/openassistuk/openassist/main/install.sh | bash -s -- --non-interactive --skip-service
```

These commands are for a fresh installation. If OpenAssist is already installed, use its update command instead of rerunning the packaged installer; see [Updates and switching installation method](#updates-and-switching-installation-method).

Existing preview or source installations can review `openassist update --release --channel stable --dry-run`, then run `openassist update --release --channel stable` to switch explicitly.

### Build from main instead

For source development or testing the latest main revision:

```bash
curl -fsSL https://raw.githubusercontent.com/openassistuk/openassist/main/install.sh | bash -s -- --source --ref main
```

This downloads source into `~/openassist`, builds it, and starts guided setup on an interactive terminal. Source builds use Git, Node `>=24.21.0 <25` and pnpm `12.5.1`; bootstrap checks for these and can install missing prerequisites, which may require elevated permission. For branches, PRs and isolated local changes, see [developer testing](docs/operations/developer-testing.md).

### Finish setup and send a message

If the installer already opened setup, continue there. Otherwise open a new terminal and run:

```bash
openassist setup
```

If your shell cannot find the command yet, use `~/.local/bin/openassist setup`. Packaged bootstrap adds a marked PATH block for Bash/Zsh; it preserves existing marked blocks and symlinked profiles and prints guidance when manual setup is needed.

Choose **First-time setup**, then select a provider and a channel. The guided flow collects the required credentials or account login and configures the background service. Linux uses systemd; macOS uses a LaunchAgent. Then check:

```bash
openassist doctor
openassist service health
```

Send a message through the channel you configured. Use `openassist setup quickstart` for direct first-time onboarding, or `openassist setup wizard` for advanced editing. If a check fails, follow [Common troubleshooting](docs/operations/common-troubleshooting.md).

### Updates and switching installation method

```bash
openassist update check
openassist update --dry-run
openassist update
```

An existing source installation continues following its source track. To switch it to the published stable release, explicitly run:

```bash
openassist update --release --channel stable
```

Preview selection remains explicit with `openassist update --release --channel preview`. Method changes require confirmation; unattended use requires `--yes`. Configuration and conversations remain in their existing locations. See [upgrade and rollback](docs/operations/upgrade-and-rollback.md) for recovery and compatibility checks.

### Installation and data locations

Packaged applications live under `~/.local/share/openassist/install`; source bootstrap defaults to `~/openassist`. Operator state stays separate:

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
- [`docs/providers/azure-foundry.md`](docs/providers/azure-foundry.md)
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
- `Service Smoke` runs on manual dispatch and schedule (`Mon`/`Thu` at `06:00 UTC`) for dry-run service checks, source upgrade routing and portable release smoke tests.
- `Lifecycle E2E Smoke` runs on manual dispatch and schedule (`Tue`/`Sat` at `07:00 UTC`) for source bootstrap/home-state checks, doctor/update output, portable release smoke and live Linux update/rollback/uninstall.
- `Release Artifacts` runs on PRs and manual dispatch for all four supported native targets, live Linux lifecycle checks and signing tests using ephemeral keys. Only explicit publication dispatch can access the protected production signing key. After publication, a separate four-target check exercises the public installer; PRs skip publishing and those dependent public-install jobs. Maintainers can rerun public installation with `verify_published=true` without rebuilding or republishing assets.
- the two smoke workflows are supplemental manual or scheduled signals, not normal per-push or per-PR gates

## Local Verification

Local merge gate:

```bash
pnpm verify:all
```

That gate includes a docs-truth validation pass, so unregistered command names in examples, broken local doc links, broken doc anchors, incomplete docs indexing, mismatched coverage-threshold references, mismatched coverage-scope references, or tracked workflow drift fail alongside code regressions. Changed prose, command flags and model-control descriptions also need manual comparison with implementation. Production and full dependency audits run in the same gate, retaining reports under `coverage/audit`.

The source dependency policy includes patched Undici `6.28.1` for provider/Discord dependency paths and brace-expansion `5.0.12` for coverage tooling, addressing the denial-of-service advisories detected by scheduled CI #391, including the related moderate brace-expansion finding. Stable `v0.2.0` includes these fixes; the older `v0.2.0-rc.1` preview is unchanged. See the [repair evidence](docs/execplans/ci-391-dependency-audit-2026-09-30.md).

Daemon health reports a stable instance fingerprint derived only from the resolved configuration path. Configuration and environment-file contents do not affect it, and it grants no authentication or access rights. Compatibility tests preserve existing instance IDs; account-link test fixtures allocate independent directories without credential labels.

Node coverage now excludes `tests/**` from reported totals, and Vitest coverage intentionally targets the CLI library plus selected daemon, config, runtime, provider, and web-tool modules instead of claiming full-repo source coverage. The exact measured source list lives in [`docs/testing/test-matrix.md`](docs/testing/test-matrix.md).

Setup readiness rejects malformed bind addresses before attempting network probes. Repair guidance is in [common troubleshooting](docs/operations/common-troubleshooting.md#invalid-bind-address).

## Node 24 runtime migration

OpenAssist requires Node.js `>=24.21.0 <25`. Existing Node 22 installs must update their shell and service runtime before upgrading OpenAssist. Follow the [backup, service verification and rollback procedure](docs/operations/upgrade-and-rollback.md#node-24-runtime-migration); saved configuration, model IDs, credentials and conversations are preserved.


pnpm 12.5.1 ships a native executable. Bootstrap and CI install it through npm with `--allow-scripts=pnpm`; Corepack is no longer used. Workspace build permissions remain explicitly listed in `pnpm-workspace.yaml` under `allowBuilds`. Dependency audits invoke the package-manager executable directly on Linux, macOS and Windows and retain both complete JSON reports under `coverage/audit`.

Windows source command launches and readiness probes reject an unsupported first `pnpm.cmd` shim or missing pnpm on the selected PATH. They do not search again for another executable; install the checkout's pinned npm-managed pnpm to repair that prerequisite. Windows operator/service parity remains out of scope.

Quickstart preserves compatible Anthropic thinking settings when changing models. If saved settings conflict with the selected model, it asks before resetting them to provider defaults; declining lets you choose another model. Saved `claude-opus-4-5` aliases retain their manual thinking budgets.

## Development and release readiness

The merged foundation includes Node 24 support, dependency audits, shared model capabilities, bounded durable Responses replay and concurrent OAuth refresh handling. See [Contributing](CONTRIBUTING.md) for local development and [AGENTS.md](AGENTS.md) for engineering requirements.

Automated regression and hosted workflow results establish development readiness. Live provider/channel certification and real existing-install Node migration/rollback evidence remain separate release checks. Record beta testing by commit, OS, route/model, channel and observed behavior using the [readiness evidence checklist](docs/operations/provider-channel-readiness.md#verification-and-live-checks); a successful beta reply alone does not certify every integration.

## Packaged releases and developer testing

See [Install and First Reply](#install-and-first-reply) for copy-and-paste commands. The signed [v0.2.0 stable release](https://github.com/openassistuk/openassist/releases/tag/v0.2.0) is published and its public installer passed on all four supported targets. Its [release notes](docs/releases/v0.2.0.md) describe testing limits. Use the default installer for stable packages or `--source --ref main` for development code; previews require explicit selection.

```bash
openassist update check
openassist update --dry-run
openassist update
openassist rollback --dry-run
openassist uninstall --dry-run
openassist dev test --pr 123 --name pr-test
```

`upgrade` remains an alias, existing source installs retain their track, and `update --release --channel stable --yes` explicitly migrates to releases. Updates prepare separately, retain a previous application/runtime, and never silently restore an old database. Notices never install software automatically. Isolated tests keep separate state and ports and do not inherit channel credentials; primary source switching remains available for deliberate real-state testing.

Update checks fetch bounded public GitHub catalogues and compare saved versions/refs locally. Saved selectors, credentials and configuration contents are not included in discovery requests. Notices are advisory; preparation verifies the selected release's signed manifest. Installed-client downloads restrict destinations and every redirect to approved GitHub routes/hosts. See [upgrade and rollback](docs/operations/upgrade-and-rollback.md) for limits, notification controls and track repair.

Cached notices store availability status only; exact discovered versions/commits are not persisted. Run `openassist update check` for fresh target details.

See [release maintenance](docs/operations/release-maintenance.md), [developer testing](docs/operations/developer-testing.md), [uninstall](docs/operations/uninstall.md), and [upgrade/recovery](docs/operations/upgrade-and-rollback.md). `Release Artifacts` adds four native packaging targets on PR/manual runs; publication requires protected signing configuration and explicit dispatch. A merged PR is not proof of a published or live-certified release.

## Ubuntu live-test fixes and native reminders

The stable release includes fixes for the eight findings from the September 28 Ubuntu test: piped installation, first-time setup selection, packaged prerequisites, activation verification, timezone health, service PATH, native reminders, and recurring `skip` scheduling. See the [resolution matrix](docs/testing/ubuntu-live-test-resolution.md) and [scheduler contract](docs/interfaces/scheduler-and-time.md#managed-one-shot-reminders).

Approved operators using Full access can create saved-text reminders or tool-free scheduled prompts in their current chat. Deadlines retain the original request time; confirmation includes the durable task ID. Standard access cannot create, list, or cancel chat reminders. Known successful sends are not repeated; uncertain transport outcomes require inspection.

PR #67 merged the Ubuntu fixes and native reminders; PR #68 merged the dependency-audit repair and CodeQL fixture correction. PR #69 prepared `0.2.0`, now published with signed assets and verified public installation. The destroyed droplet remains baseline evidence only, and replacement-host provider/channel testing remains unverified. See the [stable notes](docs/releases/v0.2.0.md) and [publication evidence](docs/execplans/stable-0.2.0-release.md).
