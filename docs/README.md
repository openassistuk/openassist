# OpenAssist Documentation

Use this index by lifecycle stage.

## Canonical Operator Flow

1. Install from GitHub or a local checkout.
2. Run `openassist setup quickstart` until you have a first real reply.
3. Use `openassist setup wizard` for advanced changes.
4. Use `openassist upgrade --dry-run` before every update.

OpenAssist remains a repo-backed install and update model. Bootstrap, `openassist doctor`, `openassist service install`, and `openassist upgrade` all work from the same persisted install record so operators can see the install directory, tracked ref, config path, env path, service manager, and last known good commit in one place.

Quickstart now also owns the beginner-facing access choice:

- `Standard mode (recommended)` keeps the first install safe and workspace-scoped
- `Full access for approved operators` is explicit opt-in and requires per-channel approved operator IDs
- `/status` shows the exact sender ID and canonical session ID you need for actor-specific access inspection later

Primary runbooks:

- Fastest operator path: `docs/operations/quickstart-linux-macos.md`
- Linux platform details: `docs/operations/install-linux.md`
- macOS platform details: `docs/operations/install-macos.md`
- Quickstart versus wizard responsibilities: `docs/operations/setup-wizard.md`
- Upgrade, rollback, and rerun-bootstrap guidance: `docs/operations/upgrade-and-rollback.md`
- Restart and recovery guarantees: `docs/operations/restart-recovery.md`

## Lifecycle Commands

- `openassist doctor`: lifecycle readiness report for install, setup, and upgrade
- `openassist setup quickstart`: minimal first-reply onboarding
- `openassist setup wizard`: advanced section editor
- `openassist service install`: explicit service install or reinstall
- `openassist upgrade --dry-run`: resolved update plan without mutation

Use `install.sh` or `scripts/install/bootstrap.sh` again when the checkout is no longer trustworthy, `.git` is missing, or build output is missing and you want the installer to rebuild a clean repo-backed install.

## Architecture and Interfaces

- System overview: `docs/architecture/overview.md`
- Runtime modules: `docs/architecture/runtime-and-modules.md`
- Provider contract: `docs/interfaces/provider-adapter.md`
- Channel contract: `docs/interfaces/channel-adapter.md`
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

- Current lifecycle ExecPlan: `docs/execplans/access-mode-opt-in-and-beginner-copy.md`
- ExecPlan process: `.agents/PLANS.md`
