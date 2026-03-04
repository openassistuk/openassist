# OpenAssist V1 ExecPlan: Lean, Modular, Restart-Safe AI Gateway

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

`/.agents/PLANS.md` is present in this repository and this plan is maintained in accordance with it.

## Purpose / Big Picture

OpenAssist V1 now targets two operator-visible outcomes:

1. robust local conversational gateway behavior (providers/channels/tools/policies),
2. robust local time-aware automation behavior (heartbeat, scheduler, clock health, timezone confirmation).
3. robust chat-driven autonomous tool behavior (provider tool calls -> local tools -> audited final channel output).

After this plan, a novice operator can install the daemon, link providers/channels, confirm timezone, run recurring scheduled prompt/skill tasks, and recover safely across restarts without duplicate scheduled windows.

## Progress

- [x] (2026-02-23 16:05Z) Monorepo scaffolding created.
- [x] (2026-02-23 16:12Z) Core shared contracts implemented.
- [x] (2026-02-23 16:18Z) Config loader/schema pipeline implemented.
- [x] (2026-02-23 16:24Z) Durable SQLite storage baseline implemented.
- [x] (2026-02-23 16:30Z) Recovery queue worker implemented.
- [x] (2026-02-23 16:45Z) Runtime + provider + channel + CLI/daemon baseline implemented.
- [x] (2026-02-23 17:10Z) OAuth lifecycle + WhatsApp hardening + service packaging completed.
- [x] (2026-02-23 17:40Z) Documentation baseline and validation evidence completed.
- [x] (2026-02-23 17:49Z) Time reliability and scheduler subsystem implemented:
  - `runtime.time` and `runtime.scheduler` config model
  - scheduler/time contracts in `core-types`
  - storage tables/methods (`system_settings`, `scheduled_task_cursors`, `scheduled_task_runs`, `clock_checks`)
  - `ClockHealthMonitor` and `SchedulerWorker`
  - `scheduled_task_execute` recovery handler
  - daemon time/scheduler endpoints
  - CLI time/scheduler commands
- [x] (2026-02-23 17:49Z) New scheduler/time test suites added and passing.
- [x] (2026-02-23 17:49Z) Docs updated across architecture/interfaces/operations/security/testing plus root docs.
- [x] (2026-02-23 18:34Z) Repo-wide documentation audit and detail expansion completed:
  - expanded `README.md` with scheduler semantics, defaults, and API payload examples
  - expanded `AGENTS.md` with documentation sync matrix for future contributors
  - expanded interface/operations/testing docs with concrete scheduler/time contracts and runbooks
- [x] (2026-02-23 18:42Z) Added dedicated operator docs index:
  - created `docs/README.md` with task-based navigation (install, auth, scheduling, recovery, migration, security, testing)
  - linked operator docs index from root `README.md`
- [x] (2026-02-23 18:55Z) V1.2 lifecycle implementation completed:
  - added guided setup commands (`setup wizard`, `setup show`, `setup env`)
  - added unified service commands (`service install/uninstall/start/stop/restart/status/logs/enable/disable/health`)
  - added upgrade command with health-gated rollback (`upgrade`)
  - added install-state persistence and bootstrap installer (`scripts/install/bootstrap.sh`)
  - added channel `env:VAR_NAME` resolution for secret indirection
- [x] (2026-02-23 18:55Z) V1.2 tests/docs completed:
  - added new vitest and node lifecycle test files
  - updated install/operations/security/testing docs and root README for lifecycle workflows
- [x] (2026-02-23 19:55Z) Coverage and quality gates hardened:
  - added CI coverage workflows for Linux/macOS quality gates and live service smoke runs
  - added explicit coverage scripts (`test:coverage:vitest`, `test:coverage:node`, `ci:strict`)
  - expanded unit/integration tests for command runner, install state, runtime context, scheduler worker, clock health monitor, service manager adapters, and setup wizard paths
- [x] (2026-02-23 20:00Z) Documentation/version-label consistency pass completed:
  - removed stale version labels from non-historical docs
  - kept historical milestone references only in this ExecPlan revision history/context
- [x] (2026-02-23 21:35Z) Stricter release-bar coverage thresholds implemented and verified:
  - vitest gate raised to lines/statements/functions >= 80 and branches >= 70
  - node integration gate raised to lines/statements >= 78, functions >= 80, and branches >= 67 (later tightened further)
  - added targeted tests for `setup-wizard.ts`, `clock-health.ts`, and `scheduler.ts` plus expanded CLI root command integration coverage
- [x] (2026-02-23 21:35Z) Root public-facing docs refreshed:
  - rewrote `README.md` to fully reflect V1.2 lifecycle, reliability, and quality gates
  - rewrote root `AGENTS.md` with contributor-grade invariants, workflow, and release criteria
- [x] (2026-02-23 21:55Z) CI/CD reliability tightening completed:
  - added workflow lint gate (`actionlint`) to required CI
  - added workflow concurrency cancellation, least-privilege permissions, and job timeouts
  - changed service-smoke workflow to manual dispatch only with hosted macOS dry-run + self-hosted Linux live systemd smoke
  - synced root/docs CI/CD documentation to match actual workflows
- [x] (2026-02-23 22:20Z) CI/CD live-debug follow-up completed with authenticated GitHub inspection:
  - resolved workflow-lint setup failure by pinning `rhysd/actionlint` to a real published tag
  - made `ci:strict` deterministic on clean runners by building workspace before lint/typecheck/test gates
  - reduced service-smoke workflow to hosted macOS dry-run path while stabilizing startup-failure behavior in GitHub-hosted environment
  - synced README/AGENTS/testing docs to reflect current smoke workflow shape
- [x] (2026-02-23 23:40Z) Installed command-surface normalization completed:
  - bootstrap now creates direct wrappers `~/.local/bin/openassist` and `~/.local/bin/openassistd`
  - CLI init guidance now prints installed-command path first with source alternative
  - service runtime launch templates now execute daemon via `node .../apps/openassistd/dist/index.js` (no runtime pnpm dependency in service start command)
- [x] (2026-02-23 23:40Z) Repository-wide documentation refresh completed:
  - rewrote root `README.md` with installed-first operator flow and explicit source-dev alternatives
  - refreshed all docs under `docs/` for command consistency, lifecycle clarity, and current CI/test model
  - expanded root `AGENTS.md` with command-style policy, stronger documentation rules, and release expectations
- [x] (2026-02-23 23:40Z) CI/test thoroughness expansion completed:
  - `ci:strict` now enforces workflow lint in addition to build/lint/typecheck/tests/coverage
  - CI quality matrix expanded to Linux/macOS/Windows
  - service-smoke workflow expanded to Linux+macOS dry-run matrix and scheduled execution
  - added workflow-lint integration test coverage (`tests/node/workflow-lint-script.test.ts`)
- [x] (2026-02-23 23:58Z) V1.3 onboarding and installer UX completed:
  - added strict onboarding command `setup quickstart` with staged flow, strict validation gate, and optional service+health step
  - retained `setup wizard` as advanced section editor path
  - implemented hybrid bootstrap installer mode via `--interactive` and adaptive default behavior (interactive on TTY, non-interactive on non-TTY)
  - added `--allow-incomplete` pass-through for explicit override behavior in interactive path
- [x] (2026-02-23 23:58Z) V1.3 test and documentation completion:
  - added quickstart validation/flow unit coverage and CLI/bootstrap integration contract tests
  - refreshed root/docs operations/testing/security/architecture guidance for quickstart-first operator onboarding
  - updated root `README.md` and `AGENTS.md` for public-repo lifecycle clarity and installed-command-first usage
- [x] (2026-02-24 13:12Z) V1.3 polish pass completed:
  - aligned wording/tone across root docs and operations runbooks
  - switched bootstrap default behavior to adaptive mode (interactive on TTY, non-interactive on non-TTY)
  - updated installer contract tests and revalidated strict quality gates
- [x] (2026-02-24 13:30Z) GitHub curl-install path completed:
  - added top-level `install.sh` GitHub entrypoint for direct `curl`-driven installs
  - updated bootstrap for piped-install TTY reattachment to preserve interactive onboarding in terminal usage
  - refreshed README/install runbooks with direct GitHub install commands and mode semantics
- [x] (2026-02-24 14:47Z) Repo-wide docs sync sweep completed:
  - corrected root command examples to match current CLI command groups (`auth`, `channel`, `service`, `setup`)
  - documented service-smoke trigger semantics as manual/scheduled supplemental signal (not push/PR gate)
  - synchronized root/docs/AGENTS wording with current coverage thresholds and workflow behavior
  - revalidated docs via strict verification and drift grep checks
- [x] (2026-02-24 16:05Z) V1.4 autonomous tool loop implementation completed:
  - provider tool-call support added for OpenAI, Anthropic, and OpenAI-compatible adapters
  - runtime now executes bounded multi-round tool loops with policy-gated schema exposure (`full-root` only)
  - added `pkg.install` tool package and `fs.delete` support in tool router/runtime contracts
  - added durable `tool_invocations` audit table and runtime audit event coverage
  - added daemon/CLI tool observability surfaces (`/v1/tools/*`, `openassist tools *`)
- [x] (2026-02-24 16:20Z) V1.4 tests and docs completed:
  - added unit tests for tool routing, provider tool mapping contracts, guardrails, package installs, and config wiring
  - added node integration tests for runtime tool loop, policy gating, audit persistence, provider contracts, and pkg install behavior
  - added new interface and operations docs for tool calling and end-to-end autonomy validation
  - updated root README and AGENTS for V1.4 public operator/contributor guidance
- [x] (2026-02-25 13:55Z) V1.4 post-commit hardening verification completed:
  - added explicit runtime gate to ignore unsolicited provider tool calls when session autonomy is disabled
  - added node regression test to enforce no tool execution for non-`full-root` sessions even if provider returns tool calls
- [x] (2026-02-25 14:20Z) Quickstart and public-doc packaging refresh completed:
  - added dedicated Linux/macOS quickstart runbook for operator and end-user paths
  - rewrote root README with quickstart-first public layout and clearer ops flow
  - added and linked root `CHANGELOG.md` with release-facing milestone notes
  - synchronized AGENTS documentation rules to include quickstart/changelog discipline
- [x] (2026-02-25 15:05Z) Installer/wizard operational reliability follow-up completed:
  - bootstrap now writes shell profile PATH snippets for `~/.local/bin` automatically
  - setup wizard now runs post-save service restart + health/time/scheduler checks by default
  - wizard now prompts to install service when missing before post-save checks
  - docs and changelog updated for wrapper availability and post-save validation behavior
- [x] (2026-02-25 16:25Z) Installer/setup recoverability hardening completed:
  - bootstrap prerequisite flow now includes retry/manual-fix recovery loop with platform-specific troubleshooting commands
  - setup quickstart service checks now support retry/abort (strict) and retry/skip/abort (`--allow-incomplete`)
  - setup wizard post-save checks now support retry/skip/abort instead of hard-throwing on first failure
  - tests/docs/changelog updated to lock recovery behavior and operator guidance
- [x] (2026-02-25 16:55Z) Setup/install/runtime diagnostics reliability follow-up completed:
  - quickstart/wizard now enforce strict prompt-level validation with re-prompts (numeric/timezone/identifier/bind-address)
  - setup health checks now use loopback fallback probes for wildcard bind addresses and show periodic retry progress
  - runtime now sends channel-visible operational diagnostics on provider/auth/runtime failures and supports in-chat `/status` diagnostics without provider dependency
  - bootstrap build-script policy now pre-approves required postinstall dependencies (`esbuild`, `protobufjs`) and Debian/Ubuntu Node install adds `npm+n` fallback when NodeSource leaves `<22`
- [x] (2026-02-25 17:40Z) Setup UX and service reliability hardening follow-up completed:
  - quickstart/wizard provider prompts now include explicit OAuth account-link guidance for OpenAI/Anthropic paths
  - quickstart channel scope prompts now validate Telegram/Discord numeric IDs and re-prompt on invalid values
  - quickstart service failure path now prints service manager diagnostics (status/log snippets) before retry/skip/abort
  - service lifecycle now auto-selects root-safe Linux backend (`systemd-system`) and service templates pin to the current Node binary (`process.execPath`)
- [x] (2026-02-25 19:20Z) Application-wide startup reliability hardening completed:
  - runtime channel startup is now non-blocking across all adapters (connector startup no longer blocks daemon readiness/health surface)
  - startup race protection added via runtime startup epoch guards to avoid stale async channel-start health writes after stop/restart
  - Telegram adapter start lifecycle updated to launch polling without blocking runtime startup
  - added node integration regression coverage for hanging channel-start behavior (`tests/node/runtime.test.ts`)
  - synchronized architecture/operations/testing docs and changelog notes to reflect the runtime startup contract
- [x] (2026-02-25 20:55Z) Timezone onboarding UX hardening completed:
  - quickstart/wizard timezone prompts now use guided picker flow (`country/region -> city`) instead of free-text city matching
  - setup prompt helpers retain compatibility handling for scripted/non-select adapters while enforcing Country/City IANA outputs
  - prompt-validation coverage expanded for optional picker paths
  - root/docs/changelog wording synchronized to the guided-picker model
- [x] (2026-02-25 21:35Z) CI stability + documentation tightening completed:
  - diagnosed GitHub Actions run `22415069454` failure root cause (`test:coverage:node` lines/statements 77.98 vs required 78 on macOS)
  - confirmed follow-up run `22415646014` fully green across workflow-lint + Linux/macOS/Windows quality jobs
  - added targeted node coverage suite for setup/timezone prompt branches (`tests/node/cli-prompt-validation-coverage.test.ts`)
  - tightened node integration branch coverage gate from `>=67` to `>=68`
  - refreshed root public docs (`README` command matrix, `AGENTS` coverage policy discipline, `CHANGELOG` release notes) and synchronized `docs/testing/test-matrix.md`
- [x] (2026-02-25 22:20Z) Additional quality-gate tightening completed:
  - raised node integration branch coverage gate from `>=68` to `>=69`
  - revalidated strict local pipeline (`pnpm verify:all`) after threshold change
  - synchronized root/docs references (`README.md`, `AGENTS.md`, `CHANGELOG.md`, `docs/testing/test-matrix.md`)
- [x] (2026-02-25 23:40Z) Installer auth recovery + session memory bootstrap + Telegram inline defaults completed:
  - bootstrap git update/clone paths now support interactive auth recovery (`retry`, `clear cached GitHub credentials`, `abort`) instead of immediate hard-exit on bad cached GitHub HTTPS credentials
  - runtime now persists global assistant profile memory (`system_settings` / `assistant.globalProfile`) and per-session host bootstrap context (`session_bootstrap`), with in-chat `/profile` read/update controls
  - first-contact profile prompt now supported for `/start` and `/new` when enabled (`runtime.assistant.promptOnFirstContact=true`)
  - Telegram channel now defaults to inline behavior with configurable conversation/response modes (`chat` vs `chat-thread`, `inline` vs `reply-threaded`)
  - quickstart/wizard/docs/changelog updated to expose new behavior
- [x] (2026-02-25 23:58Z) Global main-agent profile model finalized:
  - assistant name/persona/preferences now resolve from one durable global profile across chats
  - `/profile` updates global main-agent memory (not per-session assistant identity)
  - session bootstrap persistence now focuses on host/system context and first-contact prompt state
  - runtime/docs/tests synchronized to enforce global-profile semantics
- [x] (2026-02-25 23:59Z) First-boot profile lock guard completed:
  - global profile updates are blocked by default via durable lock metadata (`assistant.globalProfileLock`)
  - in-chat global profile updates now require explicit force confirmation (`/profile force=true; ...`)
  - forced updates persist auditable lock metadata (`lastForcedUpdateAt`) and keep lock guard enabled
  - tests/docs/README/AGENTS/changelog synchronized to lock-guard behavior
- [ ] Live-provider/channel certification in real environments (OpenAI/Anthropic OAuth apps; Telegram/Discord/WhatsApp accounts).

## Surprises & Discoveries

- Observation: Native addon friction reinforced using builtin `node:sqlite` for predictable setup.
  Evidence: build script restrictions blocked prior native binding path.

- Observation: `cron-parser` v5 API uses `CronExpressionParser.parse` (not legacy helpers).
  Evidence: type definitions in installed package required parser class path.

- Observation: Vitest module resolution needed root-level availability for scheduler libs when tests import workspace source files directly.
  Evidence: initial Vitest failures resolving `luxon` from source-imported module graph.

- Observation: timezone confirmation gating is operationally safer when scheduler remains blocked by default rather than auto-starting on detected timezone.
  Evidence: integration test `scheduler-runtime.test.ts` verifies explicit confirm transition.

- Observation: operator docs needed concrete payload examples and runbook queries to avoid ambiguity during incidents.
  Evidence: scheduler/time behavior is contract-heavy and spans runtime, API, CLI, and DB, making prose-only summaries insufficient for rapid troubleshooting.

- Observation: public-facing documentation is easier to navigate when task-oriented entry points exist in addition to domain folders.
  Evidence: existing docs were complete but discoverability required scanning multiple directories without a single operator-centric start page.

- Observation: service lifecycle logic is substantially easier to test when command rendering/planning is extracted into pure helpers.
  Evidence: new `service-manager` render tests and `upgrade` planning tests run cross-platform without requiring systemd/launchd availability.

- Observation: node coverage for spawned CLI commands on Windows is sensitive to shell/argument handling and path spaces.
  Evidence: initial `cli-command-integration` runs failed with `MODULE_NOT_FOUND` and `spawn EINVAL` until runner path execution switched to direct `node <tsx-cli.mjs> <src/index.ts>`.

- Observation: raising node coverage to >=70 lines/statements required covering many CLI root command branches, not only command helper modules.
  Evidence: node coverage moved from ~61% to ~71% after adding `cli-root-commands` integration scenarios across auth/channel/time/scheduler/migration/utility commands.

- Observation: deterministic merge gates are easier to keep green when live service-manager checks are separated from required PR checks.
  Evidence: `pnpm ci:strict` is stable locally while previous `service-smoke` workflow mixed hosted live launchd operations with PR-triggered runs.

- Observation: early GitHub run `startup_failure` states can hide the first actionable errors until platform-side constraints clear.
  Evidence: after billing recovery and rerun, GitHub surfaced explicit failures (`rhysd/actionlint@v1` tag resolution and clean-runner lint ordering), which were not visible in initial startup-failure-only runs.

- Observation: local green `pnpm ci:strict` can mask clean-runner ordering defects when dist artifacts already exist.
  Evidence: GitHub runner failed in `pnpm lint` with `TS2307` for `@openassist/core-types`; local clean pass restored after forcing build ahead of strict checks.

- Observation: the Node-based actionlint wrapper package accepts a single target argument, not an arbitrary argument list.
  Evidence: initial script invocation only linted one workflow file until target handling was normalized to a wildcard target for default behavior.

- Observation: strict onboarding validation is operationally safer as a separate linear flow from advanced editing.
  Evidence: quickstart requires blocking gates and staged summaries, while wizard must remain flexible for targeted edits and iterative operator changes.

- Observation: Service Smoke badge recency was misinterpreted as a push/PR freshness signal.
  Evidence: workflow is triggered by `workflow_dispatch` and schedule only, so docs needed explicit trigger semantics near badge and CI sections.
- Observation: Vitest is not suitable for tests that import runtime paths relying on `node:sqlite`.
  Evidence: initial V1.4 runtime-heavy Vitest files failed with module resolution for `sqlite`; moving runtime-loop assertions to node integration tests resolved this deterministically.
- Observation: provider adapter contract tests are more stable when driven by local HTTP protocol fixtures than SDK constructor mocks.
  Evidence: SDK-level module mocks allowed real network calls in early attempts; local server-backed tests produced deterministic, provider-shaped request/response assertions.
- Observation: provider responses cannot be trusted to always honor absence of tool schemas.
  Evidence: post-commit audit identified a path where unsolicited tool calls could still be returned; runtime now blocks execution when autonomy is not enabled.
- Observation: onboarding quality improves when docs separate operator actions from end-user chat actions.
  Evidence: prior README mixed contributor/operator details but lacked a clear first-reply path for non-operators.
- Observation: creating wrappers alone is insufficient for first-run usability when operators never modify shell profiles.
  Evidence: direct wrapper files existed but command discovery still failed in current shell sessions until PATH profile automation was added.
- Observation: strict validation alone is not enough if operational checks fail after save without a guided recovery path.
  Evidence: service/health failures previously exited setup paths abruptly; retry/skip/abort flows now reduce stalled onboarding outcomes.
- Observation: wildcard bind addresses (`0.0.0.0`/`::`) can make local setup health checks appear down even when daemon is healthy.
  Evidence: quickstart health probe originally targeted configured bind host directly, producing `fetch failed` on local probes; loopback fallback probes fixed this class.
- Observation: setup prompt coercion created silent invalid-input acceptance under pasted text conditions.
  Evidence: integer fields previously used fallback coercion (`parseInt` + default) without re-prompt; strict prompt validation now blocks and retries invalid input.
- Observation: provider/auth failures in chat were previously opaque to end users.
  Evidence: runtime threw errors without guaranteed user-facing diagnostics; in-channel diagnostic replies and `/status` command now provide operator-actionable feedback without provider dependency.
- Observation: daemon startup checks can fail even when restart succeeds if service unit resolves a different Node binary than setup/bootstrap.
  Evidence: `ExecStart=/usr/bin/env node` was vulnerable to PATH/version drift (for example Node 18 in service environment vs Node 22 in setup shell), causing repeated health probe failures after successful restart commands.
- Observation: Linux root onboarding needs system-level `systemd` lifecycle support instead of forcing `systemd --user`.
  Evidence: root-operated VPS setup paths produced successful command execution but unhealthy daemon state until manager-mode detection and diagnostics were hardened.
- Observation: connector startup must never gate daemon health/availability because some SDK start calls are effectively long-running loops.
  Evidence: Telegram startup awaited a long-running polling call, preventing HTTP health endpoint availability even when process/service state was `active`.
- Observation: free-text timezone entry creates avoidable operator ambiguity even with strict validation.
  Evidence: onboarding feedback consistently focused on confusion around `Country/City` syntax and city-name matching behavior.
- Observation: macOS CI can fail close to threshold even when Linux/Windows pass, so branch-level targeted tests provide safer tightening than threshold-only changes.
  Evidence: run `22415069454` failed only on macOS at 77.98 lines/statements for node coverage gate while other matrix jobs passed.
- Observation: private-repo bootstrap failures are often credential-state failures, not install-state failures.
  Evidence: stale/incorrect GitHub HTTPS credentials during `git fetch/pull` on private HTTPS remotes caused immediate bootstrap termination despite valid local install state; recovery prompts and credential-cache reset option removed this dead-end path.
- Observation: assistant identity memory must be global for a single main/master agent to avoid persona drift across channel sessions.
  Evidence: moving identity/persona/preferences to global durable settings while keeping host context per session preserves consistency without transcript bloat.
- Observation: global memory updates need accidental-change protection because chat commands are easy to mistype in live channels.
  Evidence: one-line `/profile ...` edits can unintentionally overwrite main-agent identity without a confirmation guard.

## Decision Log

- Decision: Keep scheduler actions limited to prompt and skill execution in this phase.
  Rationale: deliver useful automation while avoiding immediate scheduled-shell security expansion.
  Date/Author: 2026-02-23 / User + Codex.

- Decision: Default NTP behavior is `warn-degrade`.
  Rationale: preserve daemon availability while surfacing time-risk diagnostics.
  Date/Author: 2026-02-23 / User + Codex.

- Decision: Use global timezone with per-task override.
  Rationale: operational simplicity with optional task-specific precision.
  Date/Author: 2026-02-23 / User + Codex.

- Decision: Require explicit timezone confirmation by default before scheduler start.
  Rationale: avoid accidental schedule drift from unconfirmed environment timezone.
  Date/Author: 2026-02-23 / User + Codex.

- Decision: Misfire policy is configurable per task with default `catch-up-once`.
  Rationale: predictable backlog behavior while preserving operator flexibility.
  Date/Author: 2026-02-23 / User + Codex.

- Decision: Treat scheduler/time documentation as contract-level artifacts with examples, not only conceptual summaries.
  Rationale: improves public-readiness and lowers operator error rate during rollout/recovery tasks.
  Date/Author: 2026-02-23 / Codex.

- Decision: bootstrap git operations must provide interactive auth recovery for private HTTPS remotes.
  Rationale: incorrect cached GitHub HTTPS credentials are a recoverable operator error and should not force full bootstrap restart without guidance.
  Date/Author: 2026-02-25 / User + Codex.

- Decision: Telegram default channel behavior is inline (`conversationMode=chat`, `responseMode=inline`) with explicit threaded opt-in.
  Rationale: inline behavior matches end-user expectation for a single chat stream and avoids accidental per-message thread-like UX.
  Date/Author: 2026-02-25 / User + Codex.

- Decision: persist global main-agent profile memory (`assistant identity/persona/preferences`) in durable settings, and keep session bootstrap for host/profile context only; `/profile` controls global memory.
  Rationale: maintains one consistent assistant identity across chats while preserving per-session runtime grounding and restart-safe behavior.
  Date/Author: 2026-02-25 / User + Codex.

- Decision: enforce first-boot lock-in for global profile updates and require explicit force confirmation in chat (`/profile force=true; ...`).
  Rationale: prevents accidental main-agent identity changes while preserving an intentional operator override path.
  Date/Author: 2026-02-25 / User + Codex.

- Decision: Add a dedicated docs landing page (`docs/README.md`) organized by operator task.
  Rationale: reduces navigation friction and makes support workflows faster for new operators and contributors.
  Date/Author: 2026-02-23 / User + Codex.

- Decision: implement user-local lifecycle defaults (`$HOME/openassist`, user services) for V1.2.
  Rationale: avoids root requirement and improves install/upgrade safety for single-operator local deployments.
  Date/Author: 2026-02-23 / User + Codex.

- Decision: split enforced coverage by test layer (vitest unit coverage + node integration coverage) with explicit thresholds per layer.
  Rationale: keeps gates strict while avoiding false negatives from OS-specific interactive command paths that are validated by separate smoke tests.
  Date/Author: 2026-02-23 / Codex.

- Decision: raise strict quality bars to production-facing levels in this phase (vitest >=80 lines/statements/functions and >=70 branches; node >=78 lines/statements, >=80 functions, >=67 branches, later tightened).
  Rationale: aligns with public-repo readiness while keeping integration-gate scope realistic for CLI+service lifecycle behavior.
  Date/Author: 2026-02-23 / User + Codex.

- Decision: keep required CI deterministic and move live service-manager smoke to explicit/manual execution.
  Rationale: avoids false negatives from host-environment constraints while preserving real lifecycle validation paths.
  Date/Author: 2026-02-23 / Codex.

- Decision: pin workflow-lint action to an explicit published tag (`rhysd/actionlint@v1.7.11`).
  Rationale: major-tag shorthand was not resolvable in GitHub Actions for this run; explicit pin prevents startup failures.
  Date/Author: 2026-02-23 / Codex.

- Decision: make `ci:strict` self-sufficient on fresh checkouts by starting with `pnpm -r build`.
  Rationale: avoids type-resolution drift between warm local workspaces and clean CI environments.
  Date/Author: 2026-02-23 / Codex.

- Decision: keep service-smoke hosted-only (macOS dry-run) while stabilizing GitHub startup behavior.
  Rationale: maintains manual lifecycle coverage without introducing non-deterministic self-hosted path failures in current environment.
  Date/Author: 2026-02-23 / Codex.

- Decision: make installed direct commands (`openassist`, `openassistd`) first-class by creating wrappers in bootstrap.
  Rationale: operator docs and lifecycle UX should not require `pnpm --filter` command knowledge after install.
  Date/Author: 2026-02-23 / User + Codex.

- Decision: standardize workflow lint to repository-local command execution (`pnpm lint:workflows`) in CI.
  Rationale: removes reliance on external action runtime behavior and keeps local/CI lint behavior identical.
  Date/Author: 2026-02-23 / Codex.

- Decision: expand required quality CI matrix to include Windows while keeping service smoke Linux/macOS.
  Rationale: increases cross-platform confidence for shared CLI/runtime logic without over-promising Windows service-manager support.
  Date/Author: 2026-02-23 / User + Codex.

- Decision: use adaptive bootstrap default (interactive on TTY, non-interactive on non-TTY) with explicit mode flags.
  Rationale: improves first-run UX for most operators while preserving deterministic automation behavior.
  Date/Author: 2026-02-23 / User + Codex.

- Decision: provide first-class GitHub curl installer entrypoint (`install.sh`) with bootstrap handoff.
  Rationale: enables OpenClaw-style one-command remote install while keeping bootstrap as the authoritative installer logic.
  Date/Author: 2026-02-24 / User + Codex.

- Decision: keep dual setup surfaces (`setup quickstart` strict, `setup wizard` advanced).
  Rationale: avoids conflating onboarding guardrails with post-install power-edit workflows.
  Date/Author: 2026-02-23 / User + Codex.

- Decision: keep Service Smoke badge and add explicit trigger semantics in docs instead of removing it.
  Rationale: preserves lifecycle visibility while setting correct expectations for manual/scheduled cadence and non-gating behavior.
  Date/Author: 2026-02-24 / User + Codex.
- Decision: autonomous chat tool execution is profile-gated to `full-root` only.
  Rationale: preserves strong host-action control boundaries while still enabling true autonomous execution where explicitly authorized.
  Date/Author: 2026-02-24 / User + Codex.
- Decision: runtime tool loop executes sequentially with hard round cap (`8`) and explicit operator-visible failure at limit.
  Rationale: deterministic auditability and runaway-loop prevention outweigh parallel execution throughput in V1.4.
  Date/Author: 2026-02-24 / Codex.
- Decision: implement structured `pkg.install` tool plus `exec.run` fallback posture rather than direct scheduled shell expansion.
  Rationale: package-manager-aware behavior with explicit policy action is safer and easier to audit than generic shell-first install patterns.
  Date/Author: 2026-02-24 / User + Codex.
- Decision: keep scheduler prompt actions on `tools: []` for V1.4.
  Rationale: separates time-based automation semantics from autonomous chat tool loop semantics and avoids accidental scheduled host-action escalation.
  Date/Author: 2026-02-24 / Codex.
- Decision: enforce runtime-side rejection of unsolicited tool calls whenever autonomous schemas are not exposed.
  Rationale: profile gating must be authoritative at runtime boundary, independent of provider behavior.
  Date/Author: 2026-02-25 / Codex.
- Decision: establish a dedicated Linux/macOS quickstart runbook and keep root README quickstart-first.
  Rationale: improves first-run success rate and reduces confusion between installation, operations, and contributor workflows.
  Date/Author: 2026-02-25 / User + Codex.
- Decision: require changelog updates for operator-facing behavior changes.
  Rationale: public release posture needs explicit release-note discipline and visible delta tracking.
  Date/Author: 2026-02-25 / User + Codex.
- Decision: keep setup-wizard post-save operational checks enabled by default and allow explicit opt-out only.
  Rationale: configuration edits should be validated against real daemon/service health immediately to reduce silent misconfiguration risk.
  Date/Author: 2026-02-25 / User + Codex.
- Decision: preserve strict quickstart posture while adding explicit recovery controls after save.
  Rationale: strict defaults remain intact, but operators need deterministic retry/manual fallback paths instead of hard exits during service/health failures.
  Date/Author: 2026-02-25 / User + Codex.
- Decision: enforce strict prompt-level validation in quickstart/wizard with re-prompt loops for malformed interactive input.
  Rationale: silent coercion of pasted text is unsafe for operator onboarding and can produce hard-to-diagnose config/service failures.
  Date/Author: 2026-02-25 / User + Codex.
- Decision: normalize setup health probes to loopback fallbacks when bind host is wildcard.
  Rationale: wildcard bind addresses are valid for daemon listen, but not reliable for local HTTP probe targeting.
  Date/Author: 2026-02-25 / Codex.
- Decision: add provider-independent in-channel diagnostics (`/status`) and channel-visible runtime error replies.
  Rationale: operators and end users need actionable feedback even when provider path is unavailable.
  Date/Author: 2026-02-25 / User + Codex.
- Decision: auto-select Linux service backend by privilege (`systemd --user` for non-root, system-level `systemd` for root).
  Rationale: avoids fragile root-on-user-manager behavior and improves first-run daemon reliability on VPS installations.
  Date/Author: 2026-02-25 / User + Codex.
- Decision: pin service launch templates to the active setup Node binary (`process.execPath`) instead of `/usr/bin/env node`.
  Rationale: prevents daemon failures caused by PATH/version mismatch between interactive setup shell and service manager execution environment.
  Date/Author: 2026-02-25 / Codex.
- Decision: keep API-key onboarding as default but print explicit OAuth account-link instructions during provider setup.
  Rationale: preserves strict first-run readiness while making subscription/account OAuth flows discoverable in interactive onboarding.
  Date/Author: 2026-02-25 / User + Codex.
- Decision: enforce application-wide non-blocking channel startup in runtime orchestration.
  Rationale: daemon/service readiness and `/v1/health` must not depend on connector handshake timing or long-running adapter startup loops.
  Date/Author: 2026-02-25 / User + Codex.
- Decision: standardize setup timezone selection to a guided two-step picker (`country/region -> city`) for quickstart and wizard.
  Rationale: reduces input ambiguity for non-technical operators while preserving explicit DST-aware Country/City timezone control.
  Date/Author: 2026-02-25 / User + Codex.
- Decision: keep node lines/statements gate at `>=78` and tighten node branch gate to `>=69` after adding targeted branch tests.
  Rationale: preserves strictness while reducing platform-flake risk from threshold jumps without coverage evidence.
  Date/Author: 2026-02-25 / User + Codex.

## Outcomes & Retrospective

Implemented outcomes:

1. Time reliability model exists end-to-end (clock checks, timezone confirmation, status reporting).
2. Scheduler model exists end-to-end (cron/interval, misfire policies, durable cursor/run state, manual trigger).
3. Scheduled actions survive restart and avoid duplicate scheduled-window execution through idempotency keys.
4. Operator workflows are exposed in both daemon API and CLI.
5. Test coverage expanded to unit and integration paths for new scheduler/time behavior.
6. Documentation now includes explicit scheduler/time payload contracts and operations runbook detail.
7. Documentation now has a task-oriented index entry point for faster operator navigation.
8. Lifecycle UX now includes bootstrap install, interactive setup, service management, and upgrade rollback paths.
9. Coverage gates and CI now enforce measurable quality checks with expanded test depth for lifecycle/time modules.
10. Strict release-bar coverage thresholds now pass with expanded targeted tests and CLI root command integration coverage.
11. Root public-facing docs now match V1.2 behavior and contributor expectations.
12. CI/CD now has clearer separation between required deterministic quality gates and manual live service smoke validation.
13. GitHub-authenticated CI diagnostics are now integrated into maintenance flow, with fixes validated against live run logs.
14. Installed operator flow now exposes direct `openassist` and `openassistd` commands through bootstrap-managed wrappers.
15. Repository docs now consistently present installed-command usage as the primary operator path.
16. CI gates now include workflow lint inside strict gate execution and broader OS coverage for required quality checks.
17. Operators now have a strict first-run onboarding path with explicit validation blocking and override semantics.
18. Installer UX now supports guided onboarding without breaking non-interactive automation behavior.
19. Documentation now explicitly separates required CI gates from supplemental scheduled/manual smoke signals, reducing operator and contributor confusion.
20. Runtime now supports true multi-round provider tool-call execution with deterministic sequencing and bounded rounds.
21. Tool actions now persist durable invocation audit lifecycles and operator query surfaces.
22. Autonomous behavior now has explicit policy gating with strong default posture (`operator` remains non-autonomous).
23. Provider adapters now share a consistent tool-call contract across OpenAI, Anthropic, and OpenAI-compatible protocols.
24. New end-to-end autonomy validation runbook exists for real-host verification.
25. Runtime autonomy gate now rejects unsolicited provider tool calls in non-`full-root` sessions, with regression coverage to prevent policy bypass regressions.
26. New Linux/macOS quickstart runbook now covers operator and end-user first-reply paths.
27. Root README now presents a quickstart-first public layout with clearer operational progression.
28. Changelog discipline is now explicit in repo policy and public docs.
29. Bootstrap now handles PATH profile wiring for direct commands instead of requiring manual profile editing in common shells.
30. Setup wizard now validates saved changes against live service and daemon status by default, improving post-edit confidence.
31. Installer prerequisite failures now provide guided retry/manual-recovery options with concrete platform commands.
32. Setup quickstart/wizard post-save checks now support explicit retry/skip/abort recovery behavior, reducing failed-onboarding dead ends.
33. Quickstart/wizard prompts now reject malformed pasted input and re-prompt until valid values are provided.
34. Setup health checks now probe loopback fallback URLs for wildcard bind addresses, reducing false setup failures.
35. Runtime now emits channel-visible operational diagnostics for provider/auth/runtime failures.
36. In-channel `/status` now provides local diagnostics without provider dependency, improving triage speed.
37. Linux service lifecycle now supports root-safe systemd mode and avoids fragile root-on-user-manager installs.
38. Service templates now launch with a pinned Node binary, reducing daemon startup drift from environment PATH differences.
39. Provider/channel setup prompts now provide clearer OAuth guidance and stricter ID validation in onboarding flows.
40. Daemon startup is now resilient to slow/hung channel initialization, keeping health and operator control surfaces available while connector health degrades independently.
41. Timezone onboarding now uses guided `country/region -> city` selection, reducing input mistakes while keeping DST-aware IANA output guarantees.
42. CI stability recovered by targeted node coverage expansion, with stricter node branch threshold and green multi-OS quality matrix confirmation.
43. Root public repo docs now include a clearer operator command matrix and stricter contributor coverage policy language.
44. Bootstrap private-repo auth failures now have interactive recovery actions instead of immediate hard-stop behavior on first bad credential attempt.
45. Runtime now persists global main-agent profile memory (`assistant.globalProfile`) and reuses it deterministically across chats and restarts.
46. In-chat `/profile` now allows provider-independent global memory read/update for assistant name/persona/preferences.
47. Telegram channel defaults now preserve inline chat behavior by default, with explicit threaded mode opt-ins.
48. Setup/onboarding docs now describe global assistant profile memory plus per-session host-context bootstrap semantics for `/start` and `/new`.
49. Global profile changes are now protected by first-boot lock guard and require explicit force confirmation path for intentional updates.

Remaining major risk area is real-world credential/channel certification and long-duration soak.

## Context and Orientation

Key files introduced/expanded for the time reliability milestone:

- contracts: `packages/core-types/src/scheduler.ts`, `packages/core-types/src/runtime.ts`
- schema/config: `packages/config/src/schema.ts`, `packages/config/src/loader.ts`, `openassist.toml`
- durability: `packages/storage-sqlite/src/index.ts`
- runtime modules: `packages/core-runtime/src/clock-health.ts`, `packages/core-runtime/src/scheduler.ts`, `packages/core-runtime/src/runtime.ts`
- operator surfaces: `apps/openassistd/src/index.ts`, `apps/openassist-cli/src/index.ts`
- tests: `tests/vitest/*scheduler*`, `tests/vitest/time-validation.test.ts`, `tests/vitest/clock-health-eval.test.ts`, `tests/node/scheduler-runtime.test.ts`, `tests/node/manual-run.test.ts`

## Plan of Work

Execution order used:

1. extend contracts and config schema,
2. extend durable storage,
3. implement time and scheduler workers,
4. wire runtime job handler and status APIs,
5. wire daemon + CLI commands,
6. add tests,
7. update docs and rerun full validation.

## Concrete Steps

Repository-root commands used:

    pnpm add --filter @openassist/core-runtime cron-parser luxon
    pnpm add --filter @openassist/core-runtime -D @types/luxon
    pnpm add -Dw luxon cron-parser @types/luxon
    pnpm -r build
    pnpm test

Operational checks:

    pnpm --filter @openassist/openassist-cli dev -- time status
    pnpm --filter @openassist/openassist-cli dev -- time confirm --timezone <IANA>
    pnpm --filter @openassist/openassist-cli dev -- scheduler status
    pnpm --filter @openassist/openassist-cli dev -- scheduler tasks
    pnpm --filter @openassist/openassist-cli dev -- scheduler run --id <task-id>

## Validation and Acceptance

Validated in this pass:

- `pnpm -r build` passes.
- `pnpm test` passes.
- New vitest scheduler/time tests pass.
- New node integration scheduler/time tests pass.

Pending manual/real-env acceptance:

- live OAuth provider app verification,
- live channel transport verification,
- long-duration scheduler soak across day-boundary and DST windows.

## Idempotence and Recovery

- scheduler dedup key format: `scheduler:<taskId>:<scheduledFor>`.
- scheduled run state is durable in `scheduled_task_runs`.
- scheduler cursor state is durable in `scheduled_task_cursors`.
- clock checks and timezone confirmation are durable (`clock_checks`, `system_settings`).
- startup is repeatable; scheduler blocks until timezone confirmation when configured.

## Artifacts and Notes

Primary time reliability files:

- `packages/core-runtime/src/clock-health.ts`
- `packages/core-runtime/src/scheduler.ts`
- `packages/core-runtime/src/runtime.ts`
- `packages/storage-sqlite/src/index.ts`
- `apps/openassistd/src/index.ts`
- `apps/openassist-cli/src/index.ts`
- `packages/config/src/schema.ts`
- `packages/core-types/src/scheduler.ts`

## Interfaces and Dependencies

New runtime dependencies:

- `cron-parser`
- `luxon`
- `@types/luxon`

Stable interface references:

- scheduler/time contracts: `packages/core-types/src/scheduler.ts`
- runtime config with scheduler/time: `packages/core-types/src/runtime.ts`

## Revision Note

Revision (2026-02-23 17:49Z): Added and validated the time reliability and scheduling subsystem, updated docs and tests accordingly, and recorded implementation evidence.
Revision (2026-02-23 18:34Z): Completed repo-wide documentation detail pass to improve public-readiness and operator runbook clarity for scheduler/time behavior.
Revision (2026-02-23 18:42Z): Added `docs/README.md` as an operator task index and linked it from root `README.md`.
Revision (2026-02-23 18:55Z): Implemented V1.2 lifecycle features (bootstrap install, interactive setup, service management, upgrade rollback), added lifecycle tests, and updated operations/security/testing docs.
Revision (2026-02-23 20:00Z): Closed coverage/documentation consistency gaps by adding enforced coverage gates, expanding targeted tests, fixing cross-platform CLI integration coverage execution, and harmonizing version labeling in docs.
Revision (2026-02-23 21:35Z): Raised enforced coverage thresholds to stricter release bars, added targeted test suites for low-covered modules, expanded CLI root command integration coverage, and performed a full root README/AGENTS refresh for public-repo readiness.
Revision (2026-02-23 21:55Z): Hardened CI/CD reliability by adding workflow lint and concurrency/timeouts, moving fragile live service checks out of automatic PR/push gating, and synchronizing CI/CD docs with workflow behavior.
Revision (2026-02-23 22:20Z): Performed authenticated GitHub live-run debugging, fixed explicit CI failures (action tag resolution and clean-runner strict-ordering), simplified smoke workflow to hosted macOS dry-run path, and synced docs to current behavior.
Revision (2026-02-23 23:40Z): Added installed CLI wrappers in bootstrap, switched service launch templates to direct node daemon entrypoint, expanded CI matrices/schedules and strict workflow lint integration, and completed repository-wide document refresh with installed-command-first guidance.
Revision (2026-02-23 23:58Z): Implemented V1.3 hybrid installer + strict onboarding quickstart, added validation/contract tests for quickstart/bootstrap paths, and refreshed root/operations/testing/security documentation to match the new lifecycle.
Revision (2026-02-24 13:12Z): Completed wording/tone polish pass, changed bootstrap default to adaptive interactive behavior for TTY users, and revalidated all strict build/test/coverage gates.
Revision (2026-02-24 13:30Z): Added direct GitHub curl installer entrypoint (`install.sh`), updated bootstrap TTY handling for piped installs, and rewrote root README + install runbooks for OpenClaw-style remote installation guidance.
Revision (2026-02-24 13:35Z): Finalized public-facing README overhaul (badges, operator-first install/ops guidance, command map), then re-ran `pnpm verify:all` to confirm no regressions.
Revision (2026-02-24 13:48Z): Added bootstrap prerequisite auto-install flow (git/node>=22/pnpm>=10) with interactive confirmation and non-interactive default behavior, updated install runbooks, and expanded installer contract tests.
Revision (2026-02-24 14:02Z): Investigated failing GitHub CI runs, confirmed Linux/macOS node coverage gate failures (<70%), added targeted node coverage suite (`tests/node/cli-lib-coverage.test.ts`), and raised node coverage to 75.43% with strict gates passing locally.
Revision (2026-02-24 14:22Z): Tightened node integration coverage gate to lines/statements >=78 and branches >=67, added targeted coverage suites (`tests/node/cli-setup-validation-coverage.test.ts`, `tests/vitest/clock-health-branches.test.ts`, `tests/vitest/scheduler-branches.test.ts`), and revalidated full strict pipeline (`pnpm ci:strict`).
Revision (2026-02-24 14:47Z): Completed documentation synchronization sweep across root/docs/AGENTS, corrected CLI command references, documented Service Smoke trigger semantics, and re-ran strict verification and drift checks.
Revision (2026-02-24 16:05Z): Implemented V1.4 autonomous tool loop, provider tool-call interoperability, package-install tooling, durable tool invocation audit, and daemon/CLI tool observability surfaces.
Revision (2026-02-24 16:20Z): Added V1.4 unit/integration test suites plus repo-wide docs updates (`README`, `AGENTS`, interfaces/security/operations/testing) including new tool-calling and e2e autonomy validation docs.
Revision (2026-02-25 13:55Z): Completed post-commit V1.4 hardening audit, added explicit non-`full-root` tool-call ignore gate in runtime, added regression test, and re-ran full strict verification.
Revision (2026-02-25 14:20Z): Added dedicated Linux/macOS quickstart guide (operator + end-user), rewrote root README to quickstart-first format, added root changelog, and updated AGENTS/doc index for changelog + quickstart sync discipline.
Revision (2026-02-25 15:05Z): Added automatic PATH profile integration in bootstrap and default post-save service/health/time/scheduler checks in setup wizard, then synchronized install/setup docs and changelog entries.
Revision (2026-02-25 16:25Z): Hardened installer/setup recoverability with prerequisite retry/manual-fix guidance, quickstart/wizard post-save retry/skip/abort flows, and synchronized tests/docs/changelog updates.
Revision (2026-02-25 16:55Z): Fixed strict setup validation gaps and service-health false negatives (wildcard bind probe fallback), added provider-independent in-channel diagnostics (`/status`) plus runtime failure diagnostic replies, and synchronized tests/docs/changelog for this reliability pass.
Revision (2026-02-25 17:40Z): Hardened setup UX and daemon startup reliability by adding OAuth guidance in onboarding, stricter channel ID validation, root-aware Linux service manager selection, pinned Node service launch paths, and automatic service diagnostic output on quickstart health failures.
Revision (2026-02-25 19:20Z): Implemented application-wide non-blocking channel startup with startup-race guards, updated Telegram startup behavior, added runtime hanging-channel regression coverage, and synchronized architecture/operations/testing/changelog docs.
Revision (2026-02-25 20:55Z): Replaced free-text timezone setup entry with guided two-step country/region->city picker, expanded prompt-level tests for picker behavior, and synchronized README/operations/changelog language to the new onboarding flow.
Revision (2026-02-25 21:35Z): Diagnosed/fixed CI run `22415069454` node coverage miss with targeted node prompt-validation coverage tests, confirmed follow-up run `22415646014` green, tightened node branch coverage gate to `>=68`, and synchronized root/testing docs.
Revision (2026-02-25 22:20Z): Tightened node branch gate again to `>=69`, reran full strict local verification (`pnpm verify:all`), and synchronized root/docs threshold references.
Revision (2026-02-25 23:40Z): Added bootstrap private-auth recovery controls, implemented initial session profile-memory bootstrap with `/profile` command support (later finalized to global main-agent profile memory), introduced Telegram inline/thread mode controls with inline defaults, and synchronized tests/docs/changelog updates.
Revision (2026-02-25 23:58Z): Finalized global main-agent profile memory model (`assistant.globalProfile`) with per-session host-context bootstrap, updated `/profile` semantics, and synchronized runtime/tests/docs to the global-memory contract.
Revision (2026-02-25 23:59Z): Added first-boot global-profile lock guard (`assistant.globalProfileLock`) and explicit force update path (`/profile force=true; ...`), with runtime/test/docs synchronization.
