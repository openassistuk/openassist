# OpenAssist

[![CI](https://github.com/openassistuk/openassist/actions/workflows/ci.yml/badge.svg)](https://github.com/openassistuk/openassist/actions/workflows/ci.yml)
[![Service Smoke](https://github.com/openassistuk/openassist/actions/workflows/service-smoke.yml/badge.svg)](https://github.com/openassistuk/openassist/actions/workflows/service-smoke.yml)

OpenAssist is a lightweight, local-first LLM-to-chat gateway.

It runs as a single daemon (`openassistd`) with a CLI control plane (`openassist`) so you can:

- connect LLM providers to real chat channels
- run scheduled AI tasks with durable replay
- gate host-impacting actions behind explicit policy profiles
- operate and debug everything from terminal and chat diagnostics

`Service Smoke` is a supplemental lifecycle workflow (manual + schedule at Mon/Thu 06:00 UTC), not a required push/PR gate.

## Why OpenAssist

- Lightweight runtime: one daemon, one CLI, no required web dashboard.
- Chat-native operations: built for Telegram, Discord, and WhatsApp MD workflows.
- Provider flexibility: OpenAI, Anthropic, and OpenAI-compatible adapters.
- Safer automation: autonomy is profile-gated (`full-root`) and audited.
- Restart-safe behavior: durable queue replay + idempotent scheduler execution.
- Practical onboarding: strict `setup quickstart` path plus advanced `setup wizard`.
- Operator diagnostics by default: `/status` works from chat even when provider auth fails.

## Supported Today

| Surface | Status |
| --- | --- |
| Linux | Primary release target |
| macOS | Supported operational path |
| Windows | CI/test coverage; service-manager parity deferred |
| Providers | `openai`, `anthropic`, `openai-compatible` |
| Channels | `telegram`, `discord`, `whatsapp-md` (experimental) |
| Runtime requirements | Node `>=22`, pnpm `>=10` |

## Quickstart (Linux + macOS)

Full runbook: [`docs/operations/quickstart-linux-macos.md`](docs/operations/quickstart-linux-macos.md)

### 1) Install

Interactive install from GitHub:

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/openassistuk/openassist/main/install.sh)"
```

Automation/non-interactive install:

```bash
curl -fsSL https://raw.githubusercontent.com/openassistuk/openassist/main/install.sh | bash -s -- --non-interactive --skip-service
```

Bootstrap defaults:

- interactive on TTY
- non-interactive on non-TTY
- auto prerequisite install enabled unless `--no-auto-install-prereqs`

### 2) Verify wrappers

```bash
openassist --help
openassistd --help
```

If your current shell does not see wrappers yet:

```bash
export PATH="$HOME/.local/bin:$PATH"
$HOME/.local/bin/openassist --help
```

### 3) Run strict onboarding (if installer did not already run it)

```bash
openassist setup quickstart \
  --install-dir "$HOME/openassist" \
  --config "$HOME/openassist/openassist.toml" \
  --env-file "$HOME/.config/openassist/openassistd.env"
```

Key behavior:

- strict validation blocks invalid/unsafe config by default
- `--allow-incomplete` allows explicit degraded continuation
- service + health checks are recoverable (retry/abort, plus skip when `--allow-incomplete`)
- guided timezone onboarding uses `country/region -> city`
- health probes fall back to loopback when bind address is wildcard (`0.0.0.0` / `::`)
- Linux service manager auto-selection: non-root -> `systemd --user`, root -> system-level `systemd`

### 4) Verify daemon and runtime health

```bash
openassist service status
openassist service health
openassist channel status
openassist time status
```

### 5) Connect provider auth and channels

```bash
openassist auth start --provider openai-main --account default --open-browser
openassist auth status
openassist channel status
```

`openassist auth status` confirms endpoint reachability; OAuth/API-key detail output is intentionally redacted in CLI output.

WhatsApp MD only:

```bash
openassist channel qr --id whatsapp-main
```

### 6) Validate first end-user reply

1. Send a simple message in your configured Telegram/Discord/WhatsApp conversation.
2. Confirm bot reply.
3. Send `/status` in chat for local diagnostics (no provider dependency).

If chat is not responding:

```bash
openassist service logs --lines 200 --follow
openassist channel status
openassist auth status
```

## Install Modes

### Direct from GitHub

```bash
bash -c "$(curl -fsSL https://raw.githubusercontent.com/openassistuk/openassist/main/install.sh)"
```

### From local checkout

```bash
bash scripts/install/bootstrap.sh
```

Common bootstrap flags:

- `--interactive` or `--non-interactive`
- `--allow-incomplete` (interactive onboarding path)
- `--skip-service`
- `--no-auto-install-prereqs`
- `--install-dir <path>`
- `--ref <git-ref>`

## Setup Modes

OpenAssist has two interactive setup paths:

- `openassist setup quickstart`: strict onboarding (recommended)
- `openassist setup wizard`: advanced section editor

Wizard behavior:

- saves config + backup
- runs post-save service restart + health/time/scheduler checks by default
- supports recovery flow (`retry`, `skip`, `abort`) on post-check failure
- `--skip-post-checks` is explicit opt-out

## Command Reference

### Core lifecycle

```bash
openassist doctor
openassist init --config openassist.toml
openassist config validate --config openassist.toml
openassist upgrade --dry-run
openassist upgrade --ref main
```

### Setup and secrets

```bash
openassist setup quickstart
openassist setup wizard
openassist setup show --config openassist.toml
openassist setup env --env-file ~/.config/openassist/openassistd.env
```

### Service operations

```bash
openassist service install --install-dir "$HOME/openassist" --config "$HOME/openassist/openassist.toml" --env-file "$HOME/.config/openassist/openassistd.env"
openassist service status
openassist service restart
openassist service logs --lines 200 --follow
openassist service console
openassist service health
```

### Auth and channels

```bash
openassist auth start --provider <provider-id> --account default --open-browser
openassist auth status
openassist auth disconnect --provider <provider-id> --account <account-id>
openassist channel status
openassist channel qr --id <channel-id>
```

`openassist auth status` output is intentionally redacted in CLI output.

### Time and scheduler

```bash
openassist time status
openassist time confirm --timezone Europe/London
openassist scheduler status
openassist scheduler tasks
openassist scheduler run --id <task-id>
```

### Policy and autonomous tools

```bash
openassist policy-get --session <channel>:<conversationKey>
openassist policy-set --session <channel>:<conversationKey> --profile full-root
openassist tools status --session <channel>:<conversationKey>
openassist tools invocations --session <channel>:<conversationKey> --limit 20
```

## In-Chat Diagnostics and Profile Memory

- `/status`: returns local runtime diagnostics without provider dependency.
- `/profile`: shows persisted global assistant profile memory.
- `/profile force=true; name=<name>; persona=<style>; prefs=<preferences>`: updates global profile memory with explicit force semantics.

## Autonomy and Safety Model

Default profile is `operator`.

- `restricted` and `operator`: no autonomous tool loop
- `full-root`: autonomous tool execution enabled for that session

Safety defaults include:

- bounded tool-call rounds per model turn
- guardrails for catastrophic command patterns
- durable audit rows for every tool invocation lifecycle state
- redacted tool request/result payload storage

## Security and Reliability Defaults

- Loopback bind default (`127.0.0.1:3344`)
- Secrets via env references (`env:VAR_NAME`) for secret-like fields
- `security.secretsBackend = "encrypted-file"` only
- Owner-only Unix permission checks for secret-bearing paths
- Timezone confirmation gate support before scheduler execution
- Deterministic sequential tool-call execution per model turn
- Channel startup is non-blocking: daemon health can be OK while one connector is degraded

## Architecture (High-Level)

- `apps/openassistd`: daemon process + HTTP API
- `apps/openassist-cli`: operator lifecycle and diagnostics CLI
- `packages/core-runtime`: orchestration, policy engine, scheduler/time, tool loop
- `packages/storage-sqlite`: durable runtime state and audit persistence
- `packages/providers-*`: provider adapters
- `packages/channels-*`: channel adapters
- `packages/tools-*`: host tool surfaces
- `packages/skills-engine`: skill runtime

## CI and Quality Gates

Local gate before merge:

```bash
pnpm verify:all
```

Coverage thresholds:

- Vitest: lines/statements/functions `>= 81`, branches `>= 71`
- Node integration: lines/statements `>= 79`, functions `>= 80`, branches `>= 70`

Workflows:

- `.github/workflows/ci.yml`: required quality/build/test/coverage (Linux/macOS/Windows)
- `.github/workflows/service-smoke.yml`: supplemental Linux/macOS lifecycle dry-run smoke (manual + scheduled), not required on every push/PR

## Documentation

- Documentation index: [`docs/README.md`](docs/README.md)
- Quickstart runbook: [`docs/operations/quickstart-linux-macos.md`](docs/operations/quickstart-linux-macos.md)
- Linux install: [`docs/operations/install-linux.md`](docs/operations/install-linux.md)
- macOS install: [`docs/operations/install-macos.md`](docs/operations/install-macos.md)
- Setup quickstart + wizard: [`docs/operations/setup-wizard.md`](docs/operations/setup-wizard.md)
- Upgrade and rollback: [`docs/operations/upgrade-and-rollback.md`](docs/operations/upgrade-and-rollback.md)
- Restart recovery: [`docs/operations/restart-recovery.md`](docs/operations/restart-recovery.md)
- Tool-calling contract: [`docs/interfaces/tool-calling.md`](docs/interfaces/tool-calling.md)
- Provider adapter contract: [`docs/interfaces/provider-adapter.md`](docs/interfaces/provider-adapter.md)
- Security threat model: [`docs/security/threat-model.md`](docs/security/threat-model.md)
- Policy profiles: [`docs/security/policy-profiles.md`](docs/security/policy-profiles.md)

## Development from Source

```bash
pnpm install
pnpm -r build
pnpm test
pnpm verify:all
```

Run daemon and CLI from source checkout:

```bash
pnpm --filter @openassist/openassistd dev -- run --config openassist.toml
pnpm --filter @openassist/openassist-cli dev -- setup quickstart --config openassist.toml --env-file ~/.config/openassist/openassistd.env --skip-service
```

## Contributing

1. Read `AGENTS.md`.
2. For non-trivial scope, follow `.agents/PLANS.md`.
3. Keep behavior, docs, and tests in the same change.
4. Run `pnpm verify:all` before merge.

## Security and Community

- Security policy and private vulnerability reporting: [`SECURITY.md`](SECURITY.md)
- Contribution workflow and quality expectations: [`CONTRIBUTING.md`](CONTRIBUTING.md)
- Community standards: [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md)
