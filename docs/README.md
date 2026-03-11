# OpenAssist Documentation

Use this index by lifecycle stage.

## Canonical Operator Flow

1. Install from GitHub or a local checkout.
2. Run bare `openassist setup` and choose `First-time setup` until you have a first real reply.
3. Use `openassist setup wizard` only for advanced changes.
4. Use `openassist upgrade --dry-run` before every update.

Advanced developer note:

- branch and PR install tracks are supported through command-line flags only
- use `install.sh --ref <branch>` or `install.sh --pr <number>` when you need to test non-`main` code on a real host
- beginner lifecycle surfaces do not advertise those tracks
- PR installs require an explicit `openassist upgrade --pr <number>` or `--ref <target>` on later updates

OpenAssist remains a repo-backed install and update model. Bootstrap, `openassist doctor`, `openassist service install`, and `openassist upgrade` all work from the same persisted install record so operators can see the install directory, tracked ref, config path, env path, service manager, and last known good commit in one place.

Fresh installs now keep writable operator state outside the repo checkout by default:

- config: `~/.config/openassist/openassist.toml`
- overlays: `~/.config/openassist/config.d`
- env: `~/.config/openassist/openassistd.env`
- install state: `~/.config/openassist/install-state.json`
- runtime data: `~/.local/share/openassist/data`
- runtime logs: `~/.local/share/openassist/logs`
- managed skills: `~/.local/share/openassist/skills`
- managed helper tools: `~/.local/share/openassist/data/helper-tools`

Lifecycle surfaces now share one readiness model instead of each inventing their own wording. Human-readable lifecycle output is always rendered as:

- `Ready now`
- `Needs action`
- `Next command`

`openassist doctor --json` keeps the grouped lifecycle report for automation and is now `version: 3` with per-item `stage` metadata plus shared service-boundary context.

Recognized older installs that still use repo-local operator state (`openassist.toml`, `config.d`, and `.openassist` inside the install directory) are migrated into the home-state layout automatically when a setup flow runs and the target home paths are empty or compatible. The migration routine writes a timestamped backup bundle under `~/.local/share/openassist/migration-backups/` before it changes anything. `openassist doctor` and `openassist upgrade --dry-run` detect the same legacy layout and route the operator back to setup instead of migrating it in place.

Quickstart now also owns the beginner-facing access choice:

- `Standard mode (recommended)` keeps the first install safe and workspace-scoped
- `Full access for approved operators` is explicit opt-in and requires per-channel approved operator IDs
- on Linux, quickstart and wizard also expose a separate `systemd filesystem access` choice for the daemon service: `Hardened systemd sandbox` by default, or `Unrestricted systemd filesystem access` after an extra warning
- if you add approved operator IDs later in `openassist setup wizard` while the install is still in standard mode, the wizard now prompts to enable the matching full-access preset and then asks for the Linux systemd service mode when applicable
- `/status` shows the exact sender ID and canonical session ID you need for actor-specific access inspection later
- `/status`, `/access`, `/capabilities`, `openassist tools status`, and `openassist doctor` now expose the Linux service boundary separately from the chat access mode

Quickstart also restores the main assistant identity prompts:

- assistant name
- assistant persona/character
- ongoing objectives or preferences

Successful quickstart saves those into the same global profile memory that `/profile` edits later and disables the later first-chat identity reminder by default.

Built-in provider routes now split cleanly in operator-facing docs and setup:

- OpenAI: API-key route for the standard OpenAI API
- Codex: separate OpenAI account-login route for Codex use in OpenAssist
- Anthropic: API-key route, with optional account-linking where configured
- OpenAI-compatible: API-compatible route for compatible backends

Codex is intentionally documented as Codex-only in this release. It is not the generic "ChatGPT API auth" path for arbitrary OpenAI models.

Provider reasoning controls now follow the actual operator path:

- quickstart exposes `reasoningEffort` for OpenAI and Codex with a beginner-facing `Default / Low / Medium / High / XHigh` choice
- wizard remains the full provider-tuning surface
- OpenAI providers can set `reasoningEffort` for supported Responses API model families
- Codex providers can also set `reasoningEffort` for supported Codex Responses-model families
- Anthropic providers can set `thinkingBudgetTokens` for supported thinking-capable Claude families
- OpenAI-compatible providers stay unchanged in this release
- leaving the setting unset is the safe default and sends no provider-specific reasoning parameter

Codex setup/auth notes now follow the real supported flow:

- normal setup paths do not ask for a custom Codex base URL
- `openassist auth start --provider <provider-id> --device-code` is the recommended Codex login path for VPS and remote hosts
- the default Codex login redirect is `http://localhost:1455/auth/callback`
- on a headless VPS or remote host, operators can complete the login in another browser and paste the full callback URL or the code back into quickstart or `openassist auth complete`
- the additive host-side completion path is `openassist auth complete --provider <provider-id> --callback-url "<full callback URL>" --base-url http://127.0.0.1:3344`
- browser callback/manual paste remains supported as the fallback path
- Codex login success now depends on a usable Codex/ChatGPT token auth handle, not on exchanging into a separate OpenAI API key
- Codex chat requests now preserve the upstream conversation contract by sending the runtime session id, account header, a top-level instructions payload that combines the vendored Codex baseline with bounded OpenAssist runtime guidance, and the upstream-aligned `/responses` fields such as `store=false`, `stream=true`, and a prompt-cache key derived from the runtime session; OpenAssist then folds the upstream event stream back into the normal chat contract, and a chat-ready auth handle plus a failing chat request should still be diagnosed as a provider request issue rather than as missing auth
- Codex completion failures should now surface as sanitized account-link errors with safe upstream detail when available, not a generic `status=500`
- a fresh quickstart that chooses Codex now saves only the selected Codex provider instead of also leaving the default `openai-main` placeholder behind
- `openassist auth status` remains redacted, but it now exposes linked-account presence, active auth kind or method, expiry when known, and chat-readiness signals for account-login routes so operators can tell whether Codex auth is actually usable
- account-login state is stored as encrypted OAuth material in SQLite, and the runtime attempts automatic refresh before expiry and again on auth-style provider failures when a refresh token is available

Lifecycle and status surfaces now also show the current primary provider route, default model, and reasoning/thinking state so operators do not need to reopen wizard just to confirm what is active.

Runtime turns and `/status` now carry a bounded self-knowledge contract so OpenAssist can cite its own local docs, config path, env path, install directory, update track, and safe-maintenance limits without pretending it has permissions it does not have. In chat, the full config/env/install path view is reserved for approved operators; other senders still get the high-level lifecycle summary and host-side command guidance.

Runtime-owned chat surfaces now split the general assistant intro from the operational diagnostics:

- `/start` and `/help`: general OpenAssist welcome plus a truthful summary of what this session can help with
- `/capabilities`: live capability inventory derived from access, provider, channel, tools, scheduler state, and install context
- `/grow`: managed skill/helper inventory, update-safety note, and safe next actions
- `/status`: operational diagnostic surface with sender/session IDs, access source, and lifecycle context

Controlled growth now defaults to `extensions-first`:

- managed skills live under the runtime-owned skills directory
- managed helper tools live under the runtime-owned helper-tools directory
- those assets are tracked durably and surfaced through `/grow`, `openassist growth status`, `openassist doctor`, and `openassist upgrade --dry-run`
- direct repo mutation remains possible in `full-root`, but it is advanced work rather than the default durable growth path

First-class channel scope:

- Telegram: private chats, groups, forum topics
- Discord: guild text channels, threads, DMs
- WhatsApp MD: private chats, groups

Inbound images and supported text-like documents now flow through the runtime as durable attachment metadata. OpenAI, Codex, and Anthropic can inspect inbound images; OpenAI-compatible providers stay text-only and surface an explicit note when image understanding is unavailable.
Generated files can also be returned back through the active Telegram, Discord, or WhatsApp chat when the current session can call `channel.send`. Targeted operator notifications stay bounded to `channels[*].settings.operatorUserIds`, with Discord additionally requiring `allowedDmUserIds` overlap for DM delivery.

Primary runbooks:

- Fastest operator path: [`docs/operations/quickstart-linux-macos.md`](operations/quickstart-linux-macos.md)
- Common troubleshooting: [`docs/operations/common-troubleshooting.md`](operations/common-troubleshooting.md)
- Linux platform details: [`docs/operations/install-linux.md`](operations/install-linux.md)
- macOS platform details: [`docs/operations/install-macos.md`](operations/install-macos.md)
- Quickstart versus wizard responsibilities: [`docs/operations/setup-wizard.md`](operations/setup-wizard.md)
- Upgrade, rollback, and rerun-bootstrap guidance: [`docs/operations/upgrade-and-rollback.md`](operations/upgrade-and-rollback.md)
- Restart and recovery guarantees: [`docs/operations/restart-recovery.md`](operations/restart-recovery.md)

## Lifecycle Commands

- `openassist doctor`: lifecycle readiness report for install, setup, and upgrade
- `openassist doctor --json`: machine-readable form of the same grouped lifecycle report
- `openassist setup`: interactive lifecycle hub for first-time setup, repair, service actions, and update planning
- `openassist setup quickstart`: minimal first-reply onboarding
- `openassist setup wizard`: advanced section editor
- `openassist service install`: explicit service install or reinstall
- `openassist upgrade --dry-run`: resolved update plan without mutation
- `install.sh --ref <branch>` / `install.sh --pr <number>`: advanced developer install tracks for non-`main` testing
- `openassist skills list`: list managed skills known to the runtime
- `openassist skills install --path <dir>`: install a managed skill from a local directory
- `openassist growth status`: show managed growth policy, directories, and installed assets
- `openassist growth helper add --name <id> --root <path> --installer <kind> --summary <text>`: register a managed helper tool

Use `install.sh` or `scripts/install/bootstrap.sh` again when the checkout is no longer trustworthy, `.git` is missing, or build output is missing and you want the installer to rebuild a clean repo-backed install.

## Architecture and Interfaces

- System overview: [`docs/architecture/overview.md`](architecture/overview.md)
- Runtime modules: [`docs/architecture/runtime-and-modules.md`](architecture/runtime-and-modules.md)
- Provider contract: [`docs/interfaces/provider-adapter.md`](interfaces/provider-adapter.md)
- Channel contract: [`docs/interfaces/channel-adapter.md`](interfaces/channel-adapter.md)
- Skills manifest and managed growth contract: [`docs/interfaces/skills-manifest.md`](interfaces/skills-manifest.md)
- Tool-calling contract: [`docs/interfaces/tool-calling.md`](interfaces/tool-calling.md)
- Scheduler and time contract: [`docs/interfaces/scheduler-and-time.md`](interfaces/scheduler-and-time.md)

## Security and Policy

- Threat model: [`docs/security/threat-model.md`](security/threat-model.md)
- Policy profiles: [`docs/security/policy-profiles.md`](security/policy-profiles.md)
- End-to-end autonomy validation: [`docs/operations/e2e-autonomy-validation.md`](operations/e2e-autonomy-validation.md)

## Testing and Release Readiness

- Test matrix and quality gates: [`docs/testing/test-matrix.md`](testing/test-matrix.md)
- Chaos and soak scenarios: [`docs/testing/chaos-and-soak.md`](testing/chaos-and-soak.md)
- Changelog: [`CHANGELOG.md`](../CHANGELOG.md)

The test matrix is now expected to match the on-disk suite inventory exactly, and the normal Node test gate validates that README, docs index, workflow statements, and command examples stay in sync with the real repo.

Supplemental smoke notes:

- `.github/workflows/service-smoke.yml` runs on `workflow_dispatch` and schedule (`Mon`/`Thu` at `06:00 UTC`)
- it is a supplemental lifecycle check, not a required per-push or per-PR gate
- `.github/workflows/lifecycle-e2e-smoke.yml` runs on `workflow_dispatch` and schedule (`Tue`/`Sat` at `07:00 UTC`)
- it is a stronger bootstrap/home-state lifecycle smoke, also supplemental and not a required per-push or per-PR gate

## Planning

- Current lifecycle ExecPlans:
  - [`docs/execplans/access-mode-opt-in-and-beginner-copy.md`](execplans/access-mode-opt-in-and-beginner-copy.md)
  - [`docs/execplans/channel-first-class-integrations.md`](execplans/channel-first-class-integrations.md)
  - [`docs/execplans/codex-provider-route.md`](execplans/codex-provider-route.md)
  - [`docs/execplans/codex-chat-instructions-contract.md`](execplans/codex-chat-instructions-contract.md)
  - [`docs/execplans/general-purpose-assistant-identity-and-growth.md`](execplans/general-purpose-assistant-identity-and-growth.md)
  - [`docs/execplans/repo-wide-docs-test-hardening.md`](execplans/repo-wide-docs-test-hardening.md)
  - [`docs/execplans/provider-reasoning-controls.md`](execplans/provider-reasoning-controls.md)
  - [`docs/execplans/branch-pr-install-tracks.md`](execplans/branch-pr-install-tracks.md)
- ExecPlan process: [`.agents/PLANS.md`](../.agents/PLANS.md)
