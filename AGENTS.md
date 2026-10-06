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

Model compatibility lives in `packages/config/src/provider-models.ts`, with contracts in core-types. Setup, validation, request mapping, and status must use these definitions. Preserve saved model IDs and require explicit repair for retired Codex selections. Do not infer optional capabilities from model-name substrings or Azure deployment names. Preserve manual budget semantics on compatible Anthropic models and verified aliases, and reject unsupported/conflicting tuning. Quickstart must offer an explicit reset or another model when saved thinking settings conflict with a model change; compatible settings must remain intact.

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

## Lifecycle UX Rules (V1.10)

OpenAssist now has one primary setup entrypoint and two stable subpaths:

- `openassist setup`: primary interactive lifecycle hub for beginner and repair flows
- `openassist setup quickstart`: strict first-reply onboarding path
- `openassist setup wizard`: advanced section editor

When changing installer/setup/service behavior:

1. preserve automation compatibility (bootstrap may auto-enter interactive mode on TTY, but non-TTY behavior must remain non-interactive, and bare `openassist setup` must refuse non-TTY mutation while printing scriptable guidance)
2. keep strict quickstart validation blocking by default
3. keep explicit override semantics (`--allow-incomplete`)
4. keep setup-wizard post-save operational checks (service restart + health/time/scheduler) enabled by default, with explicit opt-out only
5. keep `openassist setup` as the primary beginner lifecycle hub and keep quickstart/wizard available and documented as stable scripted subpaths
6. preserve recovery-first operator UX (retry/skip/abort troubleshooting flows) instead of hard exits on recoverable install/setup check failures
7. preserve strict prompt-level validation in quickstart/wizard (invalid numeric/timezone/identifier/bind-address input must re-prompt, not silently coerce)
8. preserve guided timezone onboarding (`country/region -> city`) in setup flows; do not regress to ambiguous free-text timezone entry
9. preserve local health probe fallback behavior (wildcard bind addresses must resolve to loopback probes for setup/service checks)
10. preserve Linux service-manager auto-selection semantics (non-root -> `systemd --user`, root -> system-level `systemd`)
11. preserve provider-route onboarding semantics:
   - operator-facing setup and docs must present five first-class provider routes:
     - `openai` for OpenAI API-key auth
     - `codex` for the separate Codex/OpenAI account-login route
     - `anthropic`
     - `azure-foundry` for Azure resource-style `/openai/v1/` endpoints with API-key or Entra host-credential auth
     - `openai-compatible`
   - OpenAI remains the public API-key route in setup/docs
   - Codex remains the public account-login route in setup/docs
   - Azure Foundry remains the Azure resource-style Responses-only route in setup/docs
   - Codex must be described truthfully as Codex-only in V1, not as generic ChatGPT API auth for arbitrary OpenAI models
   - legacy `openai + oauth` configs may remain readable for compatibility, but new account-login guidance must steer operators to `codex`
   - quickstart must expose the beginner-facing reasoning-effort choice for `openai` and `codex`
   - OpenAI and Codex reasoning-effort choices come from the shared model catalog and include `none` and `max` only where supported; Default omits the parameter
   - wizard remains the full provider-tuning surface:
     - `openai.reasoningEffort`
     - `codex.reasoningEffort`
     - `azure-foundry.reasoningEffort`
     - `anthropic.thinkingMode` and `anthropic.thinkingEffort`
     - `anthropic.thinkingBudgetTokens` for cataloged manual-thinking models
   - Azure Foundry quickstart and wizard must ask for the Azure resource name, endpoint flavor, deployment name, auth mode, and optional underlying model hint
   - Azure Foundry Entra auth uses host credentials via `DefaultAzureCredential`; it must not reuse linked-account storage or `openassist auth start/complete`
   - `openassist auth status` must be able to surface `Entra ID` as the active auth kind for Azure Foundry providers
   - lifecycle and status output must surface the active primary provider route, model, and reasoning/thinking state
   - normal operator setup paths must not prompt for a custom Codex base URL
   - Codex account-link guidance must stay headless-friendly:
     - device code is the recommended Codex login path for VPS and remote hosts
     - default redirect uses `http://localhost:1455/auth/callback`
     - `openassist auth start --provider <provider-id> --device-code` must remain supported as the recommended headless/device login path
     - operators on remote hosts must be able to copy the full callback URL from the browser and paste it back into setup or `openassist auth complete`
     - additive CLI completion with `--callback-url` must remain supported alongside the older `--state` plus `--code` path
     - browser callback/manual paste remains supported as a fallback path
     - provider or daemon completion failures must surface as sanitized account-link errors, not generic service-failure or bare `500` wording
   - a fresh quickstart that selects `codex`, `anthropic`, `azure-foundry`, or `openai-compatible` must not persist the seeded `openai-main` placeholder provider from the default config skeleton
   - Codex account linking only counts as complete when OpenAssist has a chat-ready Codex/ChatGPT token auth handle; an exchanged OpenAI API key is optional auxiliary metadata, not the definition of success
   - `openassist auth status` must stay redacted but still surface meaningful readiness signals for linked-account routes, including route, linked-account presence, active auth kind, token expiry when known, and whether the auth is chat-ready
   - successful quickstart/wizard saves and reachable `openassist doctor` checks must not keep `provider.default_codex_account_link_pending` once the default Codex provider is linked and chat-ready; unreachable-daemon validation may stay conservative
   - Codex chat transport must preserve the upstream request contract for linked-account sessions:
     - top-level `instructions` built from the vendored Codex baseline plus bounded OpenAssist runtime guidance
     - per-turn `session_id` conversation header
     - `ChatGPT-Account-ID` when available
     - lifted Codex `system` guidance must not remain duplicated in the normal input message array
     - upstream-aligned responses fields, including `tool_choice = "auto"`, `parallel_tool_calls = true`, `store = false`, `stream = true`, and a prompt-cache key derived from the canonical runtime session id
     - Codex response handling must continue to consume the upstream event stream and fold it back into the normal non-streaming OpenAssist chat contract
   - upstream Codex request rejections must remain distinguishable from auth failures
12. preserve Telegram default UX semantics (inline chat memory + inline responses by default; threaded mode only when explicitly configured)
13. preserve access-mode onboarding semantics:
   - quickstart and wizard use beginner-facing `access mode` wording on operator paths
   - standard mode remains the default recommendation
   - full access remains explicit opt-in only
   - Linux setup paths must explain that systemd filesystem access is a separate service-level boundary from OpenAssist access mode
   - default Linux service behavior stays `service.systemdFilesystemAccess = "hardened"`
   - `/status`, `/access`, `/capabilities`, `openassist tools status`, bootstrap summaries, wizard post-save checks, `openassist doctor`, and `openassist upgrade --dry-run` must surface the configured and effective service boundary truthfully
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
17. preserve default operator-state layout semantics:
   - fresh installs default to writable operator state outside the repo checkout
   - canonical defaults stay:
     - `~/.config/openassist/openassist.toml`
     - `~/.config/openassist/config.d`
     - `~/.config/openassist/openassistd.env`
     - `~/.config/openassist/install-state.json`
     - `~/.local/share/openassist/data`
     - `~/.local/share/openassist/logs`
     - `~/.local/share/openassist/skills`
     - `~/.local/share/openassist/data/helper-tools`
   - repo-local config/runtime state is legacy behavior unless the operator explicitly asked for custom paths
18. preserve recognized legacy-layout migration semantics:
   - only the old default repo-local layout may auto-migrate (`<installDir>/openassist.toml`, `<installDir>/config.d`, `<installDir>/.openassist`)
   - automatic migration must create a timestamped backup bundle first
   - automatic migration must stop cleanly on conflicting target files instead of merging blindly
   - old repo-local writable artifacts may only be removed after successful verification
19. preserve shared lifecycle output semantics:
   - bootstrap summaries, quickstart summaries, wizard post-save checks, `openassist doctor`, and `openassist upgrade --dry-run` must all render the same human-visible sections:
     - `Ready now`
     - `Needs action`
     - `Next command`
   - machine-readable lifecycle output may stay stage-aware underneath, but human wording must remain centralized and consistent
20. preserve troubleshooting spine semantics:
   - lifecycle docs must keep one central troubleshooting runbook under `docs/operations/common-troubleshooting.md`
   - root `README.md`, `docs/README.md`, and the main lifecycle runbooks must link to that troubleshooting runbook
   - repair guidance in docs must stay aligned with `openassist setup`, `openassist doctor`, `openassist service ...`, and `openassist upgrade --dry-run`
21. preserve branch/PR install-track semantics:
   - branch and PR install tracks are advanced developer workflows, not beginner lifecycle features
   - `install.sh`, `scripts/install/bootstrap.sh`, and `openassist upgrade` may expose branch/PR track flags
   - setup hub, quickstart, and wizard must not advertise branch/PR install tracks as normal operator choices
   - PR installs must keep later upgrades explicit (`--pr` or `--ref`) instead of silently falling back to `main`
   - lifecycle output and docs must label branch and PR update tracks clearly so operators can distinguish standard packaged releases from advanced `main`/branch/PR source test installs
22. preserve Linux/macOS first-class operator platform semantics:
   - shared operator docs and lifecycle messaging must treat Linux and macOS as first-class supported operator paths
   - Linux-only service-manager and filesystem-boundary behavior must stay explicitly Linux-specific
   - Windows may keep CI coverage, but lifecycle/service parity stays out of scope unless an explicit approved plan changes it

## Autonomous Tool Loop Rules (V1.6)

When touching chat/runtime/provider/tool code:

1. keep autonomous execution profile-gated (`full-root` only)
2. do not expose tool schemas to `restricted` or `operator` sessions
3. keep tool execution bounded (no unbounded provider-tool loops)
   - `runtime.toolLoop.maxRoundsPerTurn` remains the loop-budget surface with default `12` and bounds `1..24`
   - limit-hit replies must stay operator-actionable and explain that completed tool work is already in conversation history so a narrower follow-up can continue safely
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
   - `/status` should stay renderer-friendly with grouped sections and flat bullets rather than collapsing back into one wall of text
   - provider/auth/runtime failures during chat must emit channel-visible operational diagnostics (sanitized, no secret leakage)
8. preserve the bounded runtime-awareness snapshot on every turn:
   - it must truthfully identify OpenAssist, the local host/runtime context, the active/effective access profile, the access source, and the currently callable tools
   - it must surface the active max tool rounds per turn alongside the other live policy boundaries
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
   - the same self-knowledge contract must stay aligned across provider grounding, `/start`, `/help`, `/capabilities`, `/grow`, `/status`, and persisted bootstrap awareness
   - runtime self-knowledge must keep OpenAssist positioned as the broader assistant for the machine, not only a repo-maintenance bot, while still staying truthful about the active provider/channel/tool boundary
   - runtime self-knowledge must surface install/config/env/update facts when known, plus stable local doc paths for identity, lifecycle, interface, and security behavior
   - safe self-maintenance rules must be explicit: only `full-root` sessions with callable tools may self-edit config/docs/code, and protected lifecycle paths remain off-limits to ad-hoc edits
13. preserve controlled-growth discipline:
   - runtime capability messaging must be derived from live access, provider, channel, tool, scheduler, install, and managed-growth state
   - durable capability growth defaults to runtime-owned skills and helper-tools directories outside repo-tracked manifests
   - `managed_capabilities` remains the durable registry for managed skills and helper tools surfaced through chat, CLI, daemon API, and lifecycle output
   - direct repo/config/code mutation in `full-root` stays an advanced or developer path and must not be presented as the default durable growth mechanism

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
8. preserve outbound delivery boundaries:
   - same-chat artifact replies may return requested files through the active chat when the session can truthfully call the runtime delivery tool
   - proactive or redirected sends must stay bounded to specific approved operator IDs, never broad channel lists or broadcasts
   - Discord proactive direct delivery still requires `allowedDmUserIds` overlap in addition to `operatorUserIds`
   - `/status`, `/capabilities`, and `openassist tools status` must explain when outbound files or targeted notify are unavailable
9. preserve secure file handling:
   - runtime-owned persisted attachments live under `runtime.paths.dataDir`
   - Unix owner-only permissions remain required where the host supports them

## Security Rules

- Keep update discovery on fixed public catalogue routes; compare saved versions/refs locally rather than placing them in request URLs. Validate source selectors before preparation. Test catalogue bounds, old pins, missing/ambiguous refs, annotated tags and every download redirect against the approved destinations. Discovery is advisory; release preparation still requires a signed manifest. Check open code-scanning alerts and unresolved review threads separately from CI conclusions; do not substitute a suppression or dismissal for removing an unwanted data flow.

- Persist only the versioned `UpdateCheckCache` status contract for notices. Do not cache server-supplied version/commit strings or raw catalogue responses; explicit checks may return those transient details. Keep cache validation and status/notice rendering synchronized.

- Keep loopback bind default unless an approved plan changes it.
- Keep `full-root` activation explicit and auditable.
- Do not introduce scheduled shell actions without threat-model and policy updates.
- Do not bypass policy engine checks for tool execution paths.
- Keep `pkg.install` elevation behavior explicit (`sudo -n` semantics where applicable).
- Preserve env-reference secret handling (`env:VAR_NAME`) and env-file permissions guidance.
- Preserve redaction behavior when touching auth/config/logging.
- Runtime instance IDs fingerprint only resolved config paths; they are not credentials or authentication tokens. Preserve existing fingerprint values and keep credential contents out of that path. Test directory factories should use fixed non-secret prefixes instead of accepting credential/account-link labels. For existing CodeQL alerts, inspect the full reported trace and verify with a full branch analysis; a green PR diff analysis alone does not prove closure of a baseline alert.

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
  - durable rolling session summaries for long chats without marker-only transcript writes
  - actor-scoped permanent memory uses `<channelId>:<senderId>` boundaries, remains conservative, and stays inspectable through provider-independent `/memory` plus host-side status surfaces
  - automatic permanent-memory extraction for normal chats stays bounded and runtime-managed; only `full-root` may receive explicit `memory.save` / `memory.search` tool schemas
  - provider-independent `/profile` command behavior with explicit force semantics for updates (`/profile force=true; ...`)
  - first-boot global-profile lock guard remains enabled unless an explicit planned change says otherwise
  - optional first-contact profile prompt controlled by config

## Documentation Sync Rules

Every behavior change must update docs in the same change.

Update primary field lists, setup choice descriptions and examples alongside any compatibility appendix. Model controls must be checked against `packages/config/src/provider-models.ts` per route, not generalized from a vendor/model name. Structural docs-truth checks do not replace manual review of prose and command flags. Preserve dated changelog/ExecPlan evidence and add explicit final merge/check reconciliations; never infer live certification from a merged PR.

Docs truth-source checks are required before claiming doc completeness:

- root `README.md` is a mandatory updated surface for operator-facing lifecycle or public-product changes
- root `AGENTS.md` is a mandatory updated surface for contributor discipline, workflow, or docs-sync changes
- command examples must be validated against CLI registry files:
  - `apps/openassist-cli/src/main.ts`
  - `apps/openassist-cli/src/commands/setup.ts`
  - `apps/openassist-cli/src/commands/service.ts`
  - `apps/openassist-cli/src/commands/upgrade.ts`
- workflow behavior docs must be validated against:
  - `.github/workflows/ci.yml`
  - `.github/workflows/codeql.yml`
  - `.github/workflows/macos-live-launchd.yml`
  - `.github/workflows/service-smoke.yml`
  - `.github/workflows/lifecycle-e2e-smoke.yml`
- coverage-threshold and coverage-scope docs must be validated against:
  - `vitest.config.ts`
  - `package.json`
- testing inventory docs must be validated against:
  - `tests/node/*.test.ts`
  - `tests/vitest/*.test.ts`

Minimum affected surfaces:

- root `README.md`
- root `AGENTS.md`
- `docs/README.md`
- relevant files under:
  - `docs/channels/`
  - `docs/providers/`
  - `docs/configuration/`
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

When provider-route or auth-path behavior changes, always update:

- `docs/providers/openai.md`
- `docs/providers/codex.md`
- `docs/providers/anthropic.md`
- `docs/providers/azure-foundry.md`
- `docs/providers/openai-compatible.md`
- `docs/interfaces/provider-adapter.md`
- `docs/operations/quickstart-linux-macos.md`
- `docs/operations/setup-wizard.md`
- `docs/operations/common-troubleshooting.md`
- `docs/migration/openclaw-import.md`

When channel integration behavior changes, always update:

- `docs/channels/telegram.md`
- `docs/channels/discord.md`
- `docs/channels/whatsapp-md.md`
- `docs/interfaces/channel-adapter.md`
- `docs/operations/quickstart-linux-macos.md`
- `docs/operations/setup-wizard.md`
- `docs/operations/common-troubleshooting.md`

When config schema, config layout, or operator config editing behavior changes, always update:

- `docs/configuration/config-file-guide.md`
- `docs/configuration/config-reference.md`
- `docs/operations/config-rollout-and-rollback.md`
- `docs/operations/quickstart-linux-macos.md`
- `docs/operations/setup-wizard.md`

When lifecycle UX changes, always update:

- `docs/operations/common-troubleshooting.md`
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
- Keep `pnpm-workspace.yaml` build-script allowlist (`allowBuilds`) aligned with actual postinstall requirements so bootstrap/install remains non-blocking.

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
- Keep Node coverage totals limited to product code by excluding `tests/**` from the reported coverage scope.
- Keep Vitest coverage scope explicit and targeted in `vitest.config.ts`; do not describe it as full-repo source coverage unless the config actually changes to that model.
- Keep repo-wide docs-truth validation in the normal test gate so README/AGENTS/workflow/test-matrix drift fails early.

CI expectations:

- quality workflow green on Linux/macOS/Windows
- workflow lint gate green
- CodeQL workflow green for the public repository context, and docs must describe the tracked `CodeQL preflight` plus `analyze (javascript-typescript)` automation from `.github/workflows/codeql.yml`
- `launchd-live-smoke (macos-latest)` green on PRs to `main` as the required hosted live macOS LaunchAgent gate from `.github/workflows/macos-live-launchd.yml`
- service smoke workflow remains runnable for Linux/macOS dry-run lifecycle checks
- lifecycle E2E smoke workflow remains runnable for Linux/macOS bootstrap/home-state lifecycle checks
- service smoke trigger model is scheduled/manual (`workflow_dispatch` + schedule), not a per-push/PR required gate; docs must state this explicitly
- lifecycle E2E smoke trigger model is scheduled/manual (`workflow_dispatch` + schedule), not a per-push/PR required gate; docs must state this explicitly

When adding commands or setup/service logic, add/maintain:

- unit tests for transform/validation logic
- node integration tests for CLI command paths
- contract tests for installer script behavior

## Public Release Checklist

1. README reflects current command surfaces and defaults.
2. AGENTS reflects current contributor, docs-truth, and workflow discipline.
3. Install/setup/service/upgrade docs match implementation.
4. `docs/operations/quickstart-linux-macos.md` matches current install/setup/first-reply flow.
5. `docs/operations/common-troubleshooting.md` matches current lifecycle repair paths.
6. Security docs match runtime behavior.
7. Test matrix reflects actual suites and thresholds.
8. `CHANGELOG.md` includes the release-facing behavior deltas.
9. ExecPlan updates include evidence and final outcomes.

## Definition of Done

A change is done only when all are true:

1. behavior is implemented end-to-end
2. tests and quality gates pass locally
3. CI workflows are aligned and expected to pass
4. docs are current and specific
5. security and reliability impacts are explicit
6. ExecPlan is updated for non-trivial scope

## Node runtime discipline

Keep `@types/node` on 24.x; Dependabot must ignore its major version updates while allowing minor/patch updates. Setup readiness must reject invalid bind addresses before network availability probes; test this without relying on host DNS timing.

Support Node >=24.21.0 <25 only. Keep entrypoint guards, bootstrap checks, CI and service guidance synchronized. CLI command registration lives in `apps/openassist-cli/src/main.ts`; `src/index.ts` is the early runtime guard and dynamic launcher. Daemon startup uses the same separation. Reject unsupported runtimes before loading provider or storage modules.

Dependency maintenance uses pnpm 12.5.1 with `allowBuilds` and narrowly scoped security overrides in `pnpm-workspace.yaml`. `pnpm verify:all` includes `pnpm audit:dependencies`: production and full reports are retained under `coverage/audit`, high/critical findings fail verification, and registry failures never count as success. Weekly Dependabot updates group minor/patch releases while keeping major migrations separate.

The October 6 development-tooling audit repair requires `source-map-js >=1.2.2` on the existing Vite/PostCSS and coverage-v8/magicast paths for GHSA-68fv-2mgg-jv7q. Keep the affected-version override and resolved-version regression floor aligned; do not suppress the advisory or weaken audit/coverage gates. This source tooling repair does not alter production dependencies or immutable published packages.

The 2026-09-30 dependency remediation requires Undici 6.x >=6.28.1, brace-expansion >=5.0.12 and Axios >=1.20.0 on the existing override paths. Keep the resolved-version regression checks aligned with advisory floors; advancing dependencies must not suppress audit findings or weaken the gate. Record source/build fixes separately from already published artifact contents: signed v0.2.1 delivers the Axios repair, while immutable v0.2.0 and rc.1 packages remain affected. Every later signed release requires separate reviewed version/preparation and publication evidence.

pnpm 12.5.1 ships a native executable. Bootstrap and CI install it through npm with `--allow-scripts=pnpm`; Corepack is no longer used. Workspace build permissions remain explicitly listed in `pnpm-workspace.yaml` under `allowBuilds`. Dependency audits invoke the package-manager executable directly on Linux, macOS and Windows and retain both complete JSON reports under `coverage/audit`.

Source lifecycle command launches and prerequisite probes must keep `shell: false` and preserve literal argument boundaries. On Windows, resolve pnpm's native executable or a known npm/Corepack shim entrypoint on the selected PATH and invoke it directly; compatibility with an existing developer shim does not change the pinned CI/bootstrap installation route. Missing PATH tools and unsupported first shims must remain unavailable: return an explicit resolution error and never restart executable lookup through a bare command. Test actual captured/streaming launches, metacharacters and readiness failure with a later runnable executable; do not suppress DEP0190 to make verification appear clean.

Workflow lint must use the bundled actionlint library through `pnpm lint:workflows` with Node's built-in globbing. The version-scoped `@tktco/node-actionlint@1.6.0>fast-glob` removal excludes an unused upstream standalone-CLI dependency and unpatched `braces` advisory GHSA-vfj7-8cjw-p6xm. Do not invoke that upstream CLI or restore its dependency without revalidating the advisory and used library paths. Missing targets must fail, and syntax lint/action-version policy must inspect the same selected files. Native/Docker option operands must remain literal arguments, never workflow targets; options alone must still select the default workflows. Docs-truth must compare the documented Vitest coverage list exactly against `vitest.config.ts`, rejecting additional as well as missing entries.

## Model and authentication maintenance

Current model maintenance must audit the full official conversational catalog, verified aliases/snapshots and lifecycle notices for each route independently. Keep dated retirement metadata separate from schema parsing: preserve saved IDs/settings, block retired provider requests/readiness and warn about announced deprecations. Do not apply API retirement schedules to Azure deployments or mistake an earliest-retirement commitment for a scheduled retirement. Original GPT-5 API/Azure supports minimal; newer models and Codex do not. GPT-6 API/Azure reasoningMode is separate from effort; do not copy it to Codex account-login. Fresh recommendations are GPT-6.1 Sol with xhigh for OpenAI/Codex and Opus 5.5 for Anthropic; preserve saved IDs and omitted effort. Generic endpoints must use their backend model IDs, not an assumed OpenAI default. The Azure GPT-6 table permits Astra and GPT-6.1 Sol none while OpenAI does not: preserve the explicit route distinction and source date. Claude Opus 5.5/Fable 5.1/Mythos 5.1 require adaptive thinking. Sonnet 5.5 is supported with adaptive thinking only; all four use prefix-binding controls during replay. Keep internal stream folding, empty signed blocks, output budgets, setup/status and request tests synchronized. Never enable raw thinking display or vendor beta tools implicitly.

Responses replay metadata must stay provider/model-scoped, bounded to 1 MiB and 256 items per record, and deduplicated against tool audit rows. Never expose opaque reasoning in visible output or infer new tool privileges. Anthropic workspace selection must round-trip through schema, setup and daemon wiring; explicit credentials must not inherit the other SDK credential type from the environment. OAuth retry must compare the failed credential with current state before refreshing again.

## Managed lifecycle discipline

Keep README installation commands explicit about actual release availability. Operators never provision release-signing keys. Distinguish published previews from stable releases, and document existing-install migration separately from fresh bootstrap. Record publication and public-installer verification independently of PR artifact checks.

Use `release.yml` with `verify_published=true` to validate existing public assets without republishing them. This mode must skip build/sign/publish jobs, receive no signing credentials, preserve download verification and report failures truthfully.

Release publication uses reviewed notes at `docs/releases/<tag>.md`. Candidate root/CLI/daemon versions must agree, and source CLI version output must follow its workspace manifest when no immutable build identity exists. Never commit private signing material or machine-specific maintainer notes. Restrict publication to approved tags plus explicit maintainer review.

The release `publication-checks` job must require the latest matching main-branch CI and CodeQL runs for the exact tagged commit, including workflow lint, all three quality jobs and actual JavaScript/TypeScript analysis. Missing, pending, failed or skipped evidence blocks production signing/publication; an older green run or PR-only analysis is insufficient. Recheck in the protected publish job before signing. Keep these prerequisite checks read-only and out of PR artifact and `verify_published` runs. In simulated setup health-URL tests, isolate bind availability without weakening real occupied-port validation/recovery tests or production readiness.

Stable preparation must collect the included changes under the matching changelog version and synchronize release notes, migration commands and package versions. Keep availability notices on the actually published release until protected publication and public-install verification succeed. Record fresh-host testing gaps explicitly; neither the version bump nor previous PR checks certify the stable candidate. See [v0.2.0 preparation](docs/execplans/stable-0.2.0-release.md).

The [v0.2.1 security patch evidence](docs/execplans/stable-0.2.1-release.md) records reviewed PR #72/main, the exact immutable tag, protected production signing, four-target public installation and independent signature/digest verification. Preserve that separation for later releases and keep exact-version update guidance explicit; source checks do not update installed packages or certify fresh provider/channel sessions.

The [v0.2.2 release evidence](docs/execplans/stable-0.2.2-release.md) records PR #75's reviewed main/tag `2f8b2dc`, successful exact-main CI/full CodeQL, protected publication, independent signatures/digests and four-target public installation. Root/CLI/daemon versions are `0.2.2`. Retain the initial Apple Silicon download timeout separately from successful verification-only run 36878438133; do not replace immutable signed assets or confuse source checks with live provider certification. Availability/evidence documentation requires its own reviewed PR and exact-head checks; repository and exact-tag protections remain intact.

Validate daemon installation facts against the executing application during activation and rollback, before install-state commit. Isolated env-file credentials belong only to the daemon environment, never builds; preserve forced instance routing and private-runtime variables. Packaged bootstrap owns only the exact shell PATH blocks it inserts, and uninstall must preserve surrounding text, edited blocks and unknown profiles. Archive admission must resolve complete link chains before interpreting parent traversal; test forward references, cycles and ordinary internal package links before extraction.

Packaged stable releases are the normal installer route; explicit main/branch/PR/local source workflows remain supported. Maintain install-state version 2, lifecycle JSON version 4, signed release manifests, private runtime paths, and expected-build health checks together. Do not reintroduce in-place builds or network-dependent managed rollback. Rollback never automatically restores operator databases; incompatible schemas require explicit recovery.

The release signing contract must exercise real artifacts with ephemeral test keys and demonstrate that the production trust anchor rejects those signatures. Preserve the scheduled/manual service and lifecycle workflows' source and release smoke coverage. Setup and doctor must report unverified activation truthfully, including after initial installation; health confirmation requires the expected build and instance.

Keep `release-public.pem` public-only and fail closed while unprovisioned. Production signing secrets belong only in the protected release environment, never PR jobs or fixtures. The Release Artifacts workflow covers Linux glibc/macOS x64/arm64; keep its workflow, platform tests, published assets and release-maintenance docs synchronized. The actionlint WASM adapter honors explicitly configured additional runner labels without suppressing other diagnostics.

Isolated developer instances use OPENASSIST_STATE_ROOT, dedicated state and ports, and no inherited primary credentials or service management. Source code is not sandboxed. Uninstall must prove ownership/containment; default removal preserves operator data, purge is explicit, and unknown custom/shared paths remain untouched. Always update the release-maintenance, developer-testing and uninstall guides alongside lifecycle changes. Record local checks, hosted results and actual publication as separate evidence in the living ExecPlan.

## Native reminder and live-test discipline

Managed one-shot reminders use additive SQLite tables at database compatibility version 1. Keep creation/idempotency atomic, prompt results durable before delivery, and transport receipts durable. Never resend a recorded success or retry an ambiguous transport outcome automatically. Only explicit transport rejection permits a bounded delivery retry. Cancellation during dispatch must suppress remaining parts without claiming the in-flight send was retracted.

Keep scheduler.create/list/cancel restricted to approved full-root actors and the current chat. Recheck policy and channel availability before generation and dispatch. Anchor delays to persisted inbound receivedAt, never tool execution time. Scheduled prompts retain tools: []; no shell/at/system-cron fallback. Preserve 8000-character actions, 32 active tasks per actor, 256 installation-wide, 50-entry listings and bounded tick work. Managed rollback must reject candidates without managed-one-shots-v1 while work is nonterminal.

The release artifact gate must exercise private-runtime onboarding without Git/npm/pnpm/system Node and matching build/instance activation. The Linux lifecycle smoke must use the actual signed rc.1 application and its updater to upgrade to the candidate, preserve operator state, and exercise the rollback guard. Keep the skipped live second-account test explicitly unverified. See [resolution evidence](docs/testing/ubuntu-live-test-resolution.md).
