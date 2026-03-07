# OpenAssist Documentation

Use this index by lifecycle stage.

## Canonical Operator Flow

1. Install from GitHub or a local checkout.
2. Run `openassist setup quickstart` until you have a first real reply.
3. Use `openassist setup wizard` for advanced changes.
4. Use `openassist upgrade --dry-run` before every update.

OpenAssist remains a repo-backed install and update model. Bootstrap, `openassist doctor`, `openassist service install`, and `openassist upgrade` all work from the same persisted install record so operators can see the install directory, tracked ref, config path, env path, service manager, and last known good commit in one place.

Lifecycle surfaces now share one grouped readiness model instead of each inventing their own wording. The same readiness questions now flow through bootstrap summaries, quickstart, wizard post-save checks, `openassist doctor`, and `openassist upgrade --dry-run`:

- what is ready now
- what still needs action before first reply
- what still needs action before full access
- what still needs action before upgrade
- which command to run next

Quickstart now also owns the beginner-facing access choice:

- `Standard mode (recommended)` keeps the first install safe and workspace-scoped
- `Full access for approved operators` is explicit opt-in and requires per-channel approved operator IDs
- `/status` shows the exact sender ID and canonical session ID you need for actor-specific access inspection later

Quickstart also restores the main assistant identity prompts:

- assistant name
- assistant persona/character
- ongoing objectives or preferences

Successful quickstart saves those into the same global profile memory that `/profile` edits later and disables the later first-chat identity reminder by default.

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

Inbound images and supported text-like documents now flow through the runtime as durable attachment metadata. OpenAI and Anthropic can inspect inbound images; OpenAI-compatible providers stay text-only and surface an explicit note when image understanding is unavailable.

Primary runbooks:

- Fastest operator path: `docs/operations/quickstart-linux-macos.md`
- Linux platform details: `docs/operations/install-linux.md`
- macOS platform details: `docs/operations/install-macos.md`
- Quickstart versus wizard responsibilities: `docs/operations/setup-wizard.md`
- Upgrade, rollback, and rerun-bootstrap guidance: `docs/operations/upgrade-and-rollback.md`
- Restart and recovery guarantees: `docs/operations/restart-recovery.md`

## Lifecycle Commands

- `openassist doctor`: lifecycle readiness report for install, setup, and upgrade
- `openassist doctor --json`: machine-readable form of the same grouped lifecycle report
- `openassist setup quickstart`: minimal first-reply onboarding
- `openassist setup wizard`: advanced section editor
- `openassist service install`: explicit service install or reinstall
- `openassist upgrade --dry-run`: resolved update plan without mutation
- `openassist skills list`: list managed skills known to the runtime
- `openassist skills install --path <dir>`: install a managed skill from a local directory
- `openassist growth status`: show managed growth policy, directories, and installed assets
- `openassist growth helper add --name <id> --root <path> --installer <kind> --summary <text>`: register a managed helper tool

Use `install.sh` or `scripts/install/bootstrap.sh` again when the checkout is no longer trustworthy, `.git` is missing, or build output is missing and you want the installer to rebuild a clean repo-backed install.

## Architecture and Interfaces

- System overview: `docs/architecture/overview.md`
- Runtime modules: `docs/architecture/runtime-and-modules.md`
- Provider contract: `docs/interfaces/provider-adapter.md`
- Channel contract: `docs/interfaces/channel-adapter.md`
- Skills manifest and managed growth contract: `docs/interfaces/skills-manifest.md`
- Tool-calling contract: `docs/interfaces/tool-calling.md`
- Scheduler and time contract: `docs/interfaces/scheduler-and-time.md`

## Security and Policy

- Threat model: `docs/security/threat-model.md`
- Policy profiles: `docs/security/policy-profiles.md`
- End-to-end autonomy validation: `docs/operations/e2e-autonomy-validation.md`

## Testing and Release Readiness

- Test matrix and quality gates: `docs/testing/test-matrix.md`
- Chaos and soak scenarios: `docs/testing/chaos-and-soak.md`
- Changelog: `CHANGELOG.md`

Service smoke note:

- `.github/workflows/service-smoke.yml` runs on `workflow_dispatch` and schedule (`Mon`/`Thu` at `06:00 UTC`)
- it is a supplemental lifecycle check, not a required per-push or per-PR gate

## Planning

- Current lifecycle ExecPlans:
  - `docs/execplans/access-mode-opt-in-and-beginner-copy.md`
  - `docs/execplans/channel-first-class-integrations.md`
  - `docs/execplans/general-purpose-assistant-identity-and-growth.md`
- ExecPlan process: `.agents/PLANS.md`
