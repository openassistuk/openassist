# AGENTS.md

This file defines engineering and release discipline for OpenAssist contributors.

OpenAssist is intended for public release. Treat every change as operator-facing production code, even when the implementation is local-first.

## Mission

Keep OpenAssist:

- modular across providers, channels, tools, skills, and lifecycle surfaces
- restart-safe through durable replay and idempotency
- policy-gated for host-impacting actions
- explicit and auditable in all privileged paths
- documented and test-covered at the same time as behavior changes

## Non-Negotiable Invariants

1. No secret leakage in logs, tests, docs, or error text.
2. No implicit privilege escalation.
3. No replay/idempotency regressions without explicit migration notes.
4. No unbounded context growth paths.
5. No undocumented operator-facing behavior changes.

## ExecPlan Discipline

For non-trivial changes, follow `.agents/PLANS.md`.

- Keep active plans in `docs/execplans/`.
- Maintain living sections continuously:
  - `Progress`
  - `Surprises & Discoveries`
  - `Decision Log`
  - `Outcomes & Retrospective`
- Record concrete evidence before marking milestones complete.

## Module Boundaries

- `packages/core-types`: contracts only
- `packages/core-runtime`: orchestration, scheduler/time, policy
- `packages/storage-sqlite`: schema and durable data operations
- `packages/recovery`: replay worker
- `packages/providers-*`: provider adapters
- `packages/channels-*`: channel adapters
- `packages/tools-*`: host tools
- `packages/skills-engine`: skill runtime
- `apps/openassistd`: daemon API/entrypoint
- `apps/openassist-cli`: operator lifecycle commands

Do not bypass boundaries with cross-package shortcuts.

## Lifecycle UX Rules (V1.4)

OpenAssist now has two setup paths:

- `openassist setup quickstart`: strict onboarding path (default recommendation)
- `openassist setup wizard`: advanced section editor

When changing installer/setup/service behavior:

1. preserve automation compatibility (bootstrap may auto-enter interactive mode on TTY, but non-TTY behavior must remain non-interactive)
2. keep strict quickstart validation blocking by default
3. keep explicit override semantics (`--allow-incomplete`)
4. keep setup-wizard post-save operational checks (service restart + health/time/scheduler) enabled by default, with explicit opt-out only
5. keep advanced wizard available and documented
6. preserve recovery-first operator UX (retry/skip/abort troubleshooting flows) instead of hard exits on recoverable install/setup check failures
7. preserve strict prompt-level validation in quickstart/wizard (invalid numeric/timezone/identifier/bind-address input must re-prompt, not silently coerce)
8. preserve guided timezone onboarding (`country/region -> city`) in setup flows; do not regress to ambiguous free-text timezone entry
9. preserve local health probe fallback behavior (wildcard bind addresses must resolve to loopback probes for setup/service checks)
10. preserve Linux service-manager auto-selection semantics (non-root -> `systemd --user`, root -> system-level `systemd`)
11. preserve setup auth guidance semantics (API-key-first path plus explicit OAuth account-link instructions for configured OpenAI/Anthropic providers)
12. preserve Telegram default UX semantics (inline chat memory + inline responses by default; threaded mode only when explicitly configured)

## Autonomous Tool Loop Rules (V1.4)

When touching chat/runtime/provider/tool code:

1. keep autonomous execution profile-gated (`full-root` only)
2. do not expose tool schemas to `restricted` or `operator` sessions
3. keep tool execution bounded (no unbounded provider-tool loops)
4. preserve durable audit rows for every tool invocation lifecycle state
5. preserve guardrail behavior for clearly catastrophic command patterns
6. keep tool-call contracts synchronized across:
   - `packages/core-types/src/common.ts`
   - `packages/core-types/src/provider.ts`
   - provider adapters in `packages/providers-*`
   - runtime tool loop in `packages/core-runtime/src/runtime.ts`
   - tool routing in `packages/core-runtime/src/tool-router.ts`
7. preserve runtime chat diagnostics path:
   - `/status` in channel chat must return local diagnostics without provider dependency
   - provider/auth/runtime failures during chat must emit channel-visible operational diagnostics (sanitized, no secret leakage)

## Security Rules

- Keep loopback bind default unless an approved plan changes it.
- Keep `full-root` activation explicit and auditable.
- Do not introduce scheduled shell actions without threat-model and policy updates.
- Do not bypass policy engine checks for tool execution paths.
- Keep `pkg.install` elevation behavior explicit (`sudo -n` semantics where applicable).
- Preserve env-reference secret handling (`env:VAR_NAME`) and env-file permissions guidance.
- Preserve redaction behavior when touching auth/config/logging.

## Reliability Rules

- Persist intent before side effects whenever possible.
- Keep external side effects idempotent through durable keys.
- Keep retries in durable queue paths, not in-memory loops.
- Preserve deterministic scheduler replay behavior.
- Preserve timezone confirmation gate behavior when configured.
- Preserve application-wide non-blocking channel startup behavior (connector initialization must not block daemon health/control surfaces).
- Preserve deterministic sequential tool-call execution per model turn.
- Preserve max tool-round cut-off behavior and operator-visible failure messaging.
- Preserve assistant memory behavior:
  - global permanent assistant identity/persona/preferences for the main agent
  - per-session host/profile context persistence for runtime grounding
  - provider-independent `/profile` command behavior with explicit force semantics for updates (`/profile force=true; ...`)
  - first-boot global-profile lock guard remains enabled unless an explicit planned change says otherwise
  - optional first-contact profile prompt controlled by config

## Documentation Sync Rules

Every behavior change must update docs in the same change.

Docs truth-source checks are required before claiming doc completeness:

- command examples must be validated against CLI registry files:
  - `apps/openassist-cli/src/index.ts`
  - `apps/openassist-cli/src/commands/setup.ts`
  - `apps/openassist-cli/src/commands/service.ts`
  - `apps/openassist-cli/src/commands/upgrade.ts`
- workflow behavior docs must be validated against:
  - `.github/workflows/ci.yml`
  - `.github/workflows/service-smoke.yml`

Minimum affected surfaces:

- root `README.md`
- `docs/README.md`
- relevant files under:
  - `docs/architecture/`
  - `docs/interfaces/`
  - `docs/operations/`
  - `docs/security/`
  - `docs/migration/`
  - `docs/testing/`

When tool-loop behavior changes, always update:

- `docs/interfaces/provider-adapter.md`
- `docs/interfaces/tool-calling.md`
- `docs/security/threat-model.md`
- `docs/security/policy-profiles.md`
- `docs/operations/e2e-autonomy-validation.md`

When lifecycle UX changes, always update:

- `docs/operations/quickstart-linux-macos.md`
- `docs/operations/install-linux.md`
- `docs/operations/install-macos.md`
- `docs/operations/setup-wizard.md`
- `docs/operations/upgrade-and-rollback.md`
- `docs/operations/restart-recovery.md`

Command style policy:

- Operator docs use installed commands (`openassist`, `openassistd`) first.
- Source-development `pnpm --filter ...` commands are optional secondary guidance.

Release-notes policy:

- Any operator-facing change must update `CHANGELOG.md` in the same PR.
- Changelog entries must be concrete (behavioral impact + affected surfaces), not placeholder text.
- If behavior is security-sensitive, include explicit risk/control language in changelog notes.
- Keep `pnpm-workspace.yaml` build-script allowlist (`onlyBuiltDependencies`) aligned with actual postinstall requirements so bootstrap/install remains non-blocking.

## Testing and CI Rules

Local minimum before merge:

```bash
pnpm verify:all
```

Coverage gates are mandatory:

- Vitest: lines/statements/functions >= 81, branches >= 71
- Node integration: lines/statements >= 79, functions >= 80, branches >= 70

Coverage policy discipline:

- Do not lower coverage thresholds to get a green run.
- Prefer targeted branch/contract tests to recover red gates.

CI expectations:

- required quality workflow green on Linux/macOS/Windows
- workflow lint gate green
- service smoke workflow remains runnable for Linux/macOS dry-run lifecycle checks
- service smoke trigger model is scheduled/manual (`workflow_dispatch` + schedule), not a per-push/PR required gate; docs must state this explicitly

When adding commands or setup/service logic, add/maintain:

- unit tests for transform/validation logic
- node integration tests for CLI command paths
- contract tests for installer script behavior

## Public Release Checklist

1. README reflects current command surfaces and defaults.
2. Install/setup/service/upgrade docs match implementation.
3. `docs/operations/quickstart-linux-macos.md` matches current install/setup/first-reply flow.
4. Security docs match runtime behavior.
5. Test matrix reflects actual suites and thresholds.
6. `CHANGELOG.md` includes the release-facing behavior deltas.
7. ExecPlan updates include evidence and final outcomes.

## Definition of Done

A change is done only when all are true:

1. behavior is implemented end-to-end
2. tests and quality gates pass locally
3. CI workflows are aligned and expected to pass
4. docs are current and specific
5. security and reliability impacts are explicit
6. ExecPlan is updated for non-trivial scope
