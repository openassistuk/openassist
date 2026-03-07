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
- `packages/core-runtime`: orchestration, scheduler/time, policy, runtime awareness
- `packages/storage-sqlite`: schema and durable data operations
- `packages/recovery`: replay worker
- `packages/providers-*`: provider adapters
- `packages/channels-*`: channel adapters
- `packages/tools-*`: runtime-owned tools (host + web/network)
- `packages/skills-engine`: skill runtime
- `apps/openassistd`: daemon API/entrypoint
- `apps/openassist-cli`: operator lifecycle commands

Do not bypass boundaries with cross-package shortcuts.

## Lifecycle UX Rules (V1.5)

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
13. preserve access-mode onboarding semantics:
   - quickstart and wizard use beginner-facing `access mode` wording on operator paths
   - standard mode remains the default recommendation
   - full access remains explicit opt-in only
14. preserve full-access setup safety:
   - quickstart must not require operator IDs unless the operator opts into full access
   - quickstart must offer a clear recovery path back to standard mode when full access is selected before operator IDs are ready
15. preserve operator identity semantics:
   - approved operator accounts are configured per channel in `channels[*].settings.operatorUserIds`
   - channel allowlists and approved operator IDs must stay distinct in setup/docs/output
   - `/status` must surface the exact sender ID and canonical session ID needed for later operator configuration
16. preserve assistant identity onboarding semantics:
   - quickstart must ask for the main assistant name, persona, and ongoing objectives/preferences
   - quickstart-created configs disable the later first-chat identity reminder by default
   - wizard remains the advanced path for editing the same global assistant identity fields and re-enabling the reminder

## Autonomous Tool Loop Rules (V1.5)

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
8. preserve the bounded runtime-awareness snapshot on every turn:
   - it must truthfully identify OpenAssist, the local host/runtime context, the active/effective access profile, the access source, and the currently callable tools
   - it must state negative capability explicitly when autonomy or native web tooling is unavailable/not callable
   - it must not introduce unbounded prompt/context growth
9. keep native web tooling runtime-owned, profile-gated, and bounded:
   - `tools.web` remains callable only in `full-root`
   - search/fetch behavior must stay bounded by configured redirects/bytes/results/pages
   - do not add browser automation or JS-rendered web execution without an explicit approved plan and docs/security updates
10. preserve shared-chat access resolution and identity rules:
   - canonical session IDs use `<channelId>:<conversationKey>`
   - runtime must resolve effective access in this order:
     1. sender override for this chat
     2. session override for the whole chat
     3. configured approved-operator default for this sender on this channel
     4. `runtime.defaultPolicyProfile`
   - runtime must use the configured `channelId` end to end for routing, access resolution, and diagnostics
   - runtime must use the raw emitted sender ID for operator matching; do not invent prettier IDs
11. preserve chat-side access controls:
   - `/access` only changes the current sender's access for the current chat
   - `/access` must stay unavailable for unlisted senders
   - no in-chat path may escalate an unapproved sender
   - `full-root` means OpenAssist's highest tool profile, not Unix root privileges
12. preserve runtime self-knowledge discipline:
   - provider turns must carry a bounded curated self-knowledge pack, not a generic or drifting host dump
   - the same self-knowledge contract must stay aligned across provider grounding, `/status`, and persisted bootstrap awareness
   - runtime self-knowledge must surface install/config/env/update facts when known, plus stable local doc paths for identity, lifecycle, interface, and security behavior
   - safe self-maintenance rules must be explicit: only `full-root` sessions with callable tools may self-edit config/docs/code, and protected lifecycle paths remain off-limits to ad-hoc edits

## Channel Integration Rules (V1.6)

When touching channel/runtime/provider attachment behavior:

1. preserve first-class channel scope:
   - Telegram: private chats, groups, forum topics
   - Discord: guild text channels, threads, DMs
   - WhatsApp MD: private chats, groups
2. preserve bounded attachment ingest:
   - runtime-owned attachment policy must enforce `runtime.attachments`
   - no unbounded file-count, image-size, document-size, or extracted-text growth
3. preserve durable attachment persistence:
   - normalized attachment metadata must survive recent-message replay
   - raw inbound event payloads still remain available for audit
4. preserve provider capability gating for images:
   - only providers that explicitly declare `supportsImageInputs=true` may receive image binaries
   - text-only providers must stay explicit about image limitations; never imply that an image was inspected when it was not
5. preserve text-context discipline:
   - `NormalizedMessage.content` remains the bounded text transcript/caption/extracted-text surface
   - binary/image payloads must not be injected into text context
6. preserve operator-visible degradation paths:
   - unsupported or oversized attachments must produce clear notes instead of silent drops
7. preserve channel-safe outbound presentation:
   - replies, `/status`, and diagnostics must pass through the shared channel rendering/chunking path
   - do not send wall-of-text output when the renderer can preserve headings, lists, code fences, and links safely for that channel
8. preserve secure file handling:
   - runtime-owned persisted attachments live under `runtime.paths.dataDir`
   - Unix owner-only permissions remain required where the host supports them

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
