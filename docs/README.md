# OpenAssist Documentation Index

Use this page as the operator starting point. Links are grouped by real operational tasks.

## Install and First Run

- Fastest Linux/macOS path (operator + end-user): `docs/operations/quickstart-linux-macos.md`
- Linux install runbook: `docs/operations/install-linux.md`
- macOS install runbook: `docs/operations/install-macos.md`
- Strict onboarding quickstart + advanced wizard: `docs/operations/setup-wizard.md`
- Global assistant profile memory (`/profile`) + restart persistence notes: `docs/operations/restart-recovery.md`
- Root quick start and command reference: `README.md`

## Configure Providers and Auth

- Provider contract: `docs/interfaces/provider-adapter.md`
- OAuth and API-key operational commands: `README.md`
- OpenClaw migration mapping: `docs/migration/openclaw-import.md`

## Connect Channels

- Channel contract: `docs/interfaces/channel-adapter.md`
- Runtime channel behavior: `docs/architecture/runtime-and-modules.md`
- Operational channel commands: `README.md`

## Scheduling and Time Reliability

- Scheduler/time contract: `docs/interfaces/scheduler-and-time.md`
- Config patterns and rollout safety: `docs/operations/config-rollout-and-rollback.md`
- Restart/replay behavior: `docs/operations/restart-recovery.md`
- Stress scenarios: `docs/testing/chaos-and-soak.md`

## Service Lifecycle and Upgrades

- Service install/start/restart/logs: `docs/operations/install-linux.md`, `docs/operations/install-macos.md`
- Upgrade and automatic rollback: `docs/operations/upgrade-and-rollback.md`
- Recovery behavior after restarts: `docs/operations/restart-recovery.md`

## Security and Policy

- Threat model: `docs/security/threat-model.md`
- Policy profiles: `docs/security/policy-profiles.md`
- Tool-calling contract and audit model: `docs/interfaces/tool-calling.md`
- Secret-hardening execution plan: `docs/execplans/open-source-secrets-hardening.md`

## Skills and Extensibility

- Skills contract: `docs/interfaces/skills-manifest.md`
- Example skill package: `examples/skills/shell-audit/SKILL.md`

## Architecture Deep Dive

- System overview: `docs/architecture/overview.md`
- Runtime module details: `docs/architecture/runtime-and-modules.md`
- Context engine details: `docs/architecture/context-engine.md`

## Testing and Release Readiness

- Test matrix and quality gates: `docs/testing/test-matrix.md`
- Chaos and soak scenarios: `docs/testing/chaos-and-soak.md`
- End-to-end autonomy validation runbook: `docs/operations/e2e-autonomy-validation.md`
- Service smoke cadence note: lifecycle smoke runs on manual dispatch and schedule (Mon/Thu 06:00 UTC), not on every push/PR

## Planning and Change History

- Living ExecPlan: `docs/execplans/openassist-v1.md`
- Security hardening ExecPlan: `docs/execplans/open-source-secrets-hardening.md`
- ExecPlan process rules: `.agents/PLANS.md`
- Changelog: `CHANGELOG.md`

## Community and Governance

- Security policy and disclosure process: `SECURITY.md`
- Contribution guide: `CONTRIBUTING.md`
- Community standards: `CODE_OF_CONDUCT.md`
