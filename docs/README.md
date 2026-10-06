# OpenAssist Documentation

Use this index by task, lifecycle stage, provider, channel, or config area.

For packaged shell PATH setup, see the platform installation guides. For dedicated instance credentials, use [developer testing](operations/developer-testing.md); for conservative shell-profile cleanup, use [uninstall](operations/uninstall.md).

## Start Here

Recommended operator flow:

1. Follow the [README installation commands](../README.md#install-and-first-reply), including the current release-availability notice.
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
- Azure Foundry: [`docs/providers/azure-foundry.md`](providers/azure-foundry.md)
- OpenAI-compatible: [`docs/providers/openai-compatible.md`](providers/openai-compatible.md)
- Provider contract: [`docs/interfaces/provider-adapter.md`](interfaces/provider-adapter.md)
- Model recommendations and route-specific controls: [model compatibility](providers/model-compatibility.md)
- SDK, authentication and live-test evidence: [provider/channel readiness](operations/provider-channel-readiness.md)

Provider truth that stays consistent across setup and docs:

- OpenAI is the public API-key route.
- Codex is the separate OpenAI account-login route.
- Codex is intentionally documented as Codex-only in this release.
- Reasoning efforts are filtered by route and model. Fresh OpenAI/Codex recommend GPT-6.1 Sol with xhigh. Older OpenAI Sol/Luna and Azure GPT-6.1 Sol/Astra/Sol/Luna include `none` through `max`; OpenAI GPT-6.1 Sol/Astra and Codex GPT-6 models exclude `none`. API/Azure execution mode is independent of effort and is not a Codex setting.
- Anthropic uses model-specific adaptive/manual/disabled thinking and effort controls, with explicit output limits. Manual budgets remain available only on compatible models. Multi-workspace keys can select `workspaceId` in setup.
- Azure Foundry is the Azure resource-style `/openai/v1/` route with API-key or Entra host auth and a required deployed Azure deployment name.

## Channels

- Telegram: [`docs/channels/telegram.md`](channels/telegram.md)
- Discord: [`docs/channels/discord.md`](channels/discord.md)
- WhatsApp MD: [`docs/channels/whatsapp-md.md`](channels/whatsapp-md.md)
- Channel contract: [`docs/interfaces/channel-adapter.md`](interfaces/channel-adapter.md)

First-class channel scope:

- Telegram: private chats, groups, forum topics
- Discord: guild text channels, threads, DMs
- WhatsApp MD: private chats, groups

Inbound images and supported text-like documents now flow through the runtime as durable attachment metadata. OpenAI, Codex, Anthropic, and Azure Foundry can inspect inbound images; OpenAI-compatible providers stay text-only and surface an explicit note when image understanding is unavailable.
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

The upgrade guide also covers fixed public catalogue discovery, local version/ref selection, bounded failures and repair of saved source tracks. The architecture and security guides explain discovery versus authenticated preparation and installed-client download destination restrictions.

Lifecycle surfaces now share one readiness model instead of each inventing their own wording. Human-readable lifecycle output is always rendered as:

- `Ready now`
- `Needs action`
- `Next command`

`openassist doctor --json` keeps the grouped lifecycle report for automation and is now `version: 4` with per-item `stage` metadata, installation method/version, activation verification, isolation and shared service-boundary context.

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
- Release publication requires `publication-checks` for successful workflow lint, Linux/macOS/Windows CI and full CodeQL on the exact tagged main commit, rechecked before signing. Missing, pending, failed or skipped evidence blocks publication; PR artifact builds and `verify_published` skip this prerequisite.
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

Current housekeeping and release-evidence records:

- [Documentation reconciliation](execplans/documentation-readiness-2026-09.md)
- [Merged model, harness and auth refresh](execplans/current-provider-models-2026-09.md)
- [Completed Dependabot follow-up](execplans/dependabot-follow-up-2026-09.md)
- [CI #391 and CodeQL #42 repair](execplans/ci-391-dependency-audit-2026-09-30.md): patched Undici `6.28.1` and brace-expansion `5.0.12`, account-link fixture allocation and path-only instance identity checks, with local and hosted verification evidence.
- [Post-release Axios audit repair](execplans/post-release-axios-audit-2026-09-30.md): Axios `1.20.0`, seven production dependency advisories, actual release-documentation merges and the boundary between source fixes and unchanged published packages.
- [v0.2.1 patch release evidence](execplans/stable-0.2.1-release.md): reviewed main/tag, shell-free Windows source commands, protected signing, four-target public installation and independent production-signature verification.
- [v0.2.2 stable release evidence](execplans/stable-0.2.2-release.md): model refresh, reviewed main/tag, exact-main CI/CodeQL, protected signing, independent production signatures/digests and four-target public installation; retain the initial Mac network failure and successful verification-only retry separately.
- [Deterministic setup test and publication prerequisites](execplans/release-ci-gates-2026-10-01.md): scoped bind-probe isolation and automated exact-commit CI/CodeQL verification.
- [October 4 CI audit and workflow lint repair](execplans/ci-braces-workflow-lint-2026-10-04.md): remove unused development-only glob dependencies affected by an unpatched braces advisory, reject unmatched lint targets, enforce policy on actual glob matches, preserve native/Docker option operands and reconcile the exact documented coverage scope.
- [October 6 source-map tooling audit repair](execplans/ci-source-map-audit-2026-10-06.md): resolve development-only source-map-js to patched `1.2.2`, enforce its lockfile regression floor and retain unchanged audit/coverage gates with separate local and hosted evidence.
- [Dependency PR #80 preparation](execplans/dependabot-pr-80-2026-10-06.md): reconcile its automatic replacement of #78, retain the six SDK/type/test-tool updates plus Pino, preserve patched floors and validate provider/logger contracts and unchanged gates before reviewed merging.
- [`docs/execplans/modernization-readiness-2026-09.md`](execplans/modernization-readiness-2026-09.md)

Historical implementation plans (retain their original evidence and read any reconciliation notes):

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

Historical ExecPlans retain dated decisions, checks and unresolved certification evidence; they are not current operator instructions. The [documentation reconciliation](execplans/documentation-readiness-2026-09.md) records the current inventory and follow-up. Use the provider, configuration and lifecycle guides above for current behavior. A merged plan does not certify live accounts or an existing-install migration.

## Node 24 runtime migration

Setup readiness rejects malformed bind addresses before network probing; see [invalid bind address repair](operations/common-troubleshooting.md#invalid-bind-address). The [Dependabot follow-up ExecPlan](execplans/dependabot-follow-up-2026-09.md) tracks Node 24 type policy and post-modernization updates.

OpenAssist requires Node.js `>=24.21.0 <25`. Existing Node 22 installs must update their shell and service runtime before upgrading OpenAssist. Follow the [backup, service verification and rollback procedure](operations/upgrade-and-rollback.md#node-24-runtime-migration); saved configuration, model IDs, credentials and conversations are preserved.

pnpm 12.5.1 ships a native executable. Bootstrap and CI install it through npm with `--allow-scripts=pnpm`; Corepack is no longer used. Workspace build permissions remain explicitly listed in `pnpm-workspace.yaml` under `allowBuilds`. Dependency audits invoke the package-manager executable directly on Linux, macOS and Windows and retain both complete JSON reports under `coverage/audit`.

Current provider choices, route-specific reasoning modes, Claude output budgets and verified source dates are documented in [model compatibility](providers/model-compatibility.md). The [current-model ExecPlan](execplans/current-provider-models-2026-09.md) records the implementation and verification evidence.

Provider/authentication/channel maintenance: [current dependency and harness readiness](operations/provider-channel-readiness.md) records stable versions, auth compatibility, bounded reasoning replay and remaining live checks.

## Managed release lifecycle

- [Release maintenance](operations/release-maintenance.md): signed packaging, private runtime, publication prerequisites and four-platform verification.
- [v0.2.2 stable notes](releases/v0.2.2.md): the current signed stable release, full OpenAI/Anthropic catalogs, fresh setup recommendations, route-specific compatibility, explicit update guidance and verified four-target public installation. The default installer selects it; saved provider settings remain unchanged.
- [v0.2.1 security patch notes](releases/v0.2.1.md): the earlier immutable security patch, delivered Axios repair, stable-track update guidance, dated four-target verification and live-testing limits.
- [v0.2.0 release notes](releases/v0.2.0.md): the older immutable stable release, lifecycle/reminder fixes and dated verification; its packages retain affected Axios and should be updated to the current stable release.
- [v0.2.0-rc.1 release notes](releases/v0.2.0-rc.1.md): the older signed preview, selected explicitly with `--channel preview`; its immutable assets remain unchanged.
- [Developer testing](operations/developer-testing.md): main/branch/PR/local isolated tests and explicit primary-install switching.
- [Uninstall](operations/uninstall.md): owned application removal, retained state and explicit purge.

Normal installation uses verified releases; source builds require explicit selection. Install-state version 2 and lifecycle JSON version 4 distinguish the installation method. `.github/workflows/release.yml` runs on pull requests and manual dispatch, with protected publication only on explicit dispatch. Existing scheduled/manual smoke workflows and the required live macOS gate retain their trigger semantics.

Native release jobs include a separate signing contract check using ephemeral test keys. Scheduled/manual smoke workflows cover both source installation and packaged artifacts, including live Linux update/rollback/uninstall in lifecycle E2E.

## September 28 Ubuntu regression work

- [Live-test baseline](testing/2026-09-28-ubuntu-live-test-notes.md): dated observations from the destroyed Ubuntu host.
- [Eight-finding resolution matrix](testing/ubuntu-live-test-resolution.md): regression evidence and remaining release gates.
- [Native reminder interfaces](interfaces/scheduler-and-time.md#managed-one-shot-reminders): tools, CLI/API, ownership, persistence and delivery states.
- [Implementation ExecPlan](execplans/ubuntu-live-test-fixes.md): current work and verification status.

Stable v0.2.0 is published from merged preparation PR #69. The [release ExecPlan](execplans/stable-0.2.0-release.md) records exact-revision checks, signing/publication and four-target public-install evidence. Additional fresh-host provider/channel retesting remains unverified; baseline passes do not certify every integration.

The complete October 1 conversational catalog audit, exact aliases/pins and route-specific retirement handling are documented in [model compatibility](providers/model-compatibility.md). October 2026 model recommendations and verification are tracked in the [model recommendation ExecPlan](execplans/model-recommendations-2026-10.md). Opus 5.5 is the Anthropic recommendation; Sonnet 5.5 is the cheaper alternative with adaptive thinking support. Generic setup requires the model ID actually served by its backend.
