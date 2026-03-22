# OpenAssist Documentation

Use this index by task, lifecycle stage, provider, channel, or config area.

## Start Here

Recommended operator flow:

1. Install OpenAssist from GitHub or a local checkout.
2. Run bare `openassist setup` and choose `First-time setup`.
3. Confirm `openassist doctor` and `openassist service health`.
4. Use `openassist setup wizard` only for advanced changes.
5. Use `openassist upgrade --dry-run` before every update.

Core entrypoints:

- Product landing page: [`README.md`](../README.md)
- Quickstart runbook: [`docs/operations/quickstart-linux-macos.md`](operations/quickstart-linux-macos.md)
- Common troubleshooting: [`docs/operations/common-troubleshooting.md`](operations/common-troubleshooting.md)
- Setup hub and wizard guide: [`docs/operations/setup-wizard.md`](operations/setup-wizard.md)

Linux and macOS are the first-class operator paths for lifecycle and service validation in this release. Windows stays in the required CI matrix, but it is not the service-manager parity target.

Fresh installs keep writable operator state outside the repo checkout by default:

- config: `~/.config/openassist/openassist.toml`
- overlays: `~/.config/openassist/config.d`
- env: `~/.config/openassist/openassistd.env`
- install state: `~/.config/openassist/install-state.json`
- runtime data: `~/.local/share/openassist/data`
- runtime logs: `~/.local/share/openassist/logs`
- managed skills: `~/.local/share/openassist/skills`
- managed helper tools: `~/.local/share/openassist/data/helper-tools`

Advanced developer note:

- branch and PR install tracks are supported through command-line flags only
- use `install.sh --ref <branch>` or `install.sh --pr <number>` when you need to test non-`main` code on a real host
- beginner lifecycle surfaces do not advertise those tracks
- PR installs require an explicit `openassist upgrade --pr <number>` or `--ref <target>` on later updates

## Providers

- OpenAI: [`docs/providers/openai.md`](providers/openai.md)
- Codex: [`docs/providers/codex.md`](providers/codex.md)
- Anthropic: [`docs/providers/anthropic.md`](providers/anthropic.md)
- OpenAI-compatible: [`docs/providers/openai-compatible.md`](providers/openai-compatible.md)
- Provider contract: [`docs/interfaces/provider-adapter.md`](interfaces/provider-adapter.md)

Provider truth that stays consistent across setup and docs:

- OpenAI is the public API-key route.
- Codex is the separate OpenAI account-login route.
- Codex is intentionally documented as Codex-only in this release.
- OpenAI and Codex reasoning controls include `xhigh` alongside `low`, `medium`, and `high`.
- Anthropic thinking budgets are supported only on thinking-capable Claude families.

## Channels

- Telegram: [`docs/channels/telegram.md`](channels/telegram.md)
- Discord: [`docs/channels/discord.md`](channels/discord.md)
- WhatsApp MD: [`docs/channels/whatsapp-md.md`](channels/whatsapp-md.md)
- Channel contract: [`docs/interfaces/channel-adapter.md`](interfaces/channel-adapter.md)

First-class channel scope:

- Telegram: private chats, groups, forum topics
- Discord: guild text channels, threads, DMs
- WhatsApp MD: private chats, groups

Inbound images and supported text-like documents now flow through the runtime as durable attachment metadata. OpenAI, Codex, and Anthropic can inspect inbound images; OpenAI-compatible providers stay text-only and surface an explicit note when image understanding is unavailable.
Generated files can also be returned back through the active Telegram, Discord, or WhatsApp chat when the current session can call `channel.send`. Targeted operator notifications stay bounded to `channels[*].settings.operatorUserIds`, with Discord additionally requiring `allowedDmUserIds` overlap for DM delivery.

## Configuration

- Practical config guide: [`docs/configuration/config-file-guide.md`](configuration/config-file-guide.md)
- Schema-backed config reference: [`docs/configuration/config-reference.md`](configuration/config-reference.md)
- Config rollout and rollback: [`docs/operations/config-rollout-and-rollback.md`](operations/config-rollout-and-rollback.md)
- Root sample config: [`openassist.toml`](../openassist.toml)

Useful config commands:

- `openassist setup show`
- `openassist setup env`
- `openassist config validate`
- `openassist doctor`

## Operations

- Quickstart on Linux and macOS: [`docs/operations/quickstart-linux-macos.md`](operations/quickstart-linux-macos.md)
- Common troubleshooting: [`docs/operations/common-troubleshooting.md`](operations/common-troubleshooting.md)
- Linux install details: [`docs/operations/install-linux.md`](operations/install-linux.md)
- macOS install details: [`docs/operations/install-macos.md`](operations/install-macos.md)
- Setup quickstart and setup wizard: [`docs/operations/setup-wizard.md`](operations/setup-wizard.md)
- Upgrade and rollback: [`docs/operations/upgrade-and-rollback.md`](operations/upgrade-and-rollback.md)
- Restart and recovery: [`docs/operations/restart-recovery.md`](operations/restart-recovery.md)
- End-to-end autonomy validation: [`docs/operations/e2e-autonomy-validation.md`](operations/e2e-autonomy-validation.md)

Lifecycle surfaces now share one readiness model instead of each inventing their own wording. Human-readable lifecycle output is always rendered as:

- `Ready now`
- `Needs action`
- `Next command`

`openassist doctor --json` keeps the grouped lifecycle report for automation and is now `version: 3` with per-item `stage` metadata plus shared service-boundary context.

Recognized older installs that still use repo-local operator state (`openassist.toml`, `config.d`, and `.openassist` inside the install directory) are migrated into the home-state layout automatically when a setup flow runs and the target home paths are empty or compatible. The migration routine writes a timestamped backup bundle under `~/.local/share/openassist/migration-backups/` before it changes anything. `openassist doctor` and `openassist upgrade --dry-run` detect the same legacy layout and route the operator back to setup instead of migrating it in place.

## Architecture and Interfaces

- System overview: [`docs/architecture/overview.md`](architecture/overview.md)
- Context engine: [`docs/architecture/context-engine.md`](architecture/context-engine.md)
- Runtime modules: [`docs/architecture/runtime-and-modules.md`](architecture/runtime-and-modules.md)
- Tool-calling contract: [`docs/interfaces/tool-calling.md`](interfaces/tool-calling.md)
- Skills manifest and managed growth contract: [`docs/interfaces/skills-manifest.md`](interfaces/skills-manifest.md)
- Scheduler and time contract: [`docs/interfaces/scheduler-and-time.md`](interfaces/scheduler-and-time.md)

## Security and Testing

- Threat model: [`docs/security/threat-model.md`](security/threat-model.md)
- Policy profiles: [`docs/security/policy-profiles.md`](security/policy-profiles.md)
- Test matrix and quality gates: [`docs/testing/test-matrix.md`](testing/test-matrix.md)
- Chaos and soak scenarios: [`docs/testing/chaos-and-soak.md`](testing/chaos-and-soak.md)
- Changelog: [`CHANGELOG.md`](../CHANGELOG.md)

The test matrix is expected to match the on-disk suite inventory exactly, and the normal Node test gate validates all live docs except archived ExecPlans: local links and anchors, docs-index completeness, workflow statements, coverage-threshold references, coverage-scope references, and documented command examples must stay in sync with the real repo.

GitHub automation:

- `CI` runs on pushes to `main`, pull requests, manual dispatch, and a daily `04:30 UTC` schedule for workflow lint plus the `quality-and-coverage` matrix. The workflow lint leg also enforces the tracked action-version floors for `actions/checkout@v6`, `actions/setup-node@v6`, `actions/upload-artifact@v7`, and `github/codeql-action/*@v4`.
- `CodeQL` runs on pushes to `main`, pull requests to `main`, manual dispatch, and a weekly `Mon` at `05:15 UTC` schedule. In this public repo it runs `CodeQL preflight` plus `analyze (javascript-typescript)`.
- `.github/workflows/macos-live-launchd.yml` runs on `pull_request` targeting `main` and `workflow_dispatch`
- it provides required `launchd-live-smoke (macos-latest)` proof of live LaunchAgent install, health, status, stop/start recovery, restart, logs, and uninstall on hosted macOS

Supplemental smoke notes:

- `.github/workflows/service-smoke.yml` runs on `workflow_dispatch` and schedule (`Mon`/`Thu` at `06:00 UTC`)
- it is a supplemental lifecycle check, not a required per-push or per-PR gate
- `.github/workflows/lifecycle-e2e-smoke.yml` runs on `workflow_dispatch` and schedule (`Tue`/`Sat` at `07:00 UTC`)
- it is a stronger bootstrap or home-state lifecycle smoke, also supplemental and not a required per-push or per-PR gate

Coverage reporting stays intentionally targeted rather than pretending to be full-repo source coverage. Node coverage excludes `tests/**` from its totals, and the exact Vitest plus Node source lists are documented in `docs/testing/test-matrix.md`.

## Migration and Planning

- OpenClaw import guide: [`docs/migration/openclaw-import.md`](migration/openclaw-import.md)
- ExecPlan process: [`.agents/PLANS.md`](../.agents/PLANS.md)

Current lifecycle ExecPlans:

- [`docs/execplans/access-mode-opt-in-and-beginner-copy.md`](execplans/access-mode-opt-in-and-beginner-copy.md)
- [`docs/execplans/actions-node24-runtime-cleanup.md`](execplans/actions-node24-runtime-cleanup.md)
- [`docs/execplans/bootstrap-setup-hub-regression.md`](execplans/bootstrap-setup-hub-regression.md)
- [`docs/execplans/branch-pr-install-tracks.md`](execplans/branch-pr-install-tracks.md)
- [`docs/execplans/channel-first-class-integrations.md`](execplans/channel-first-class-integrations.md)
- [`docs/execplans/codex-auth-completion-headless.md`](execplans/codex-auth-completion-headless.md)
- [`docs/execplans/codex-auth-device-code-realignment.md`](execplans/codex-auth-device-code-realignment.md)
- [`docs/execplans/codex-chat-instructions-contract.md`](execplans/codex-chat-instructions-contract.md)
- [`docs/execplans/codex-chat-request-contract-completion.md`](execplans/codex-chat-request-contract-completion.md)
- [`docs/execplans/codex-chat-request-shape.md`](execplans/codex-chat-request-shape.md)
- [`docs/execplans/codex-fresh-setup-auth-readiness.md`](execplans/codex-fresh-setup-auth-readiness.md)
- [`docs/execplans/codex-provider-route.md`](execplans/codex-provider-route.md)
- [`docs/execplans/context-compaction-and-memory.md`](execplans/context-compaction-and-memory.md)
- [`docs/execplans/filesystem-access-service-mode.md`](execplans/filesystem-access-service-mode.md)
- [`docs/execplans/general-purpose-assistant-identity-and-growth.md`](execplans/general-purpose-assistant-identity-and-growth.md)
- [`docs/execplans/github-landing-and-beginner-docs.md`](execplans/github-landing-and-beginner-docs.md)
- [`docs/execplans/lifecycle-hub-home-state.md`](execplans/lifecycle-hub-home-state.md)
- [`docs/execplans/lifecycle-readiness-guided-repair.md`](execplans/lifecycle-readiness-guided-repair.md)
- [`docs/execplans/lifecycle-ux-overhaul.md`](execplans/lifecycle-ux-overhaul.md)
- [`docs/execplans/native-web-tools.md`](execplans/native-web-tools.md)
- [`docs/execplans/open-source-secrets-hardening.md`](execplans/open-source-secrets-hardening.md)
- [`docs/execplans/openassist-v1.md`](execplans/openassist-v1.md)
- [`docs/execplans/outbound-channel-delivery.md`](execplans/outbound-channel-delivery.md)
- [`docs/execplans/pr36-review-fixes.md`](execplans/pr36-review-fixes.md)
- [`docs/execplans/protected-branch-docs-coverage-alignment.md`](execplans/protected-branch-docs-coverage-alignment.md)
- [`docs/execplans/provider-reasoning-controls.md`](execplans/provider-reasoning-controls.md)
- [`docs/execplans/provider-reasoning-ux.md`](execplans/provider-reasoning-ux.md)
- [`docs/execplans/public-release-codeql-hardening.md`](execplans/public-release-codeql-hardening.md)
- [`docs/execplans/ci-docs-coverage-hardening.md`](execplans/ci-docs-coverage-hardening.md)
- [`docs/execplans/repo-wide-docs-test-hardening.md`](execplans/repo-wide-docs-test-hardening.md)
- [`docs/execplans/repo-wide-docs-tests-ci-hardening-followup.md`](execplans/repo-wide-docs-tests-ci-hardening-followup.md)
- [`docs/execplans/runtime-self-awareness.md`](execplans/runtime-self-awareness.md)
- [`docs/execplans/runtime-self-knowledge-and-quickstart-identity.md`](execplans/runtime-self-knowledge-and-quickstart-identity.md)
- [`docs/execplans/runtime-self-knowledge-review-followups.md`](execplans/runtime-self-knowledge-review-followups.md)
- [`docs/execplans/setup-codex-auth-polish.md`](execplans/setup-codex-auth-polish.md)
- [`docs/execplans/setup-wizard-full-access-prompt.md`](execplans/setup-wizard-full-access-prompt.md)
- [`docs/execplans/status-tool-loop-followups.md`](execplans/status-tool-loop-followups.md)
