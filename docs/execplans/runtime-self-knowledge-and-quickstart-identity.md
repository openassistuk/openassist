# Runtime Self-Knowledge and Quickstart Identity Restoration

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document must be maintained in accordance with `.agents/PLANS.md`.

## Purpose / Big Picture

After this change, OpenAssist should be much better at explaining what it is, what host and install it is running on, what it can do in the current session, which local docs define that behavior, and what kinds of self-maintenance are safe or unsafe. The first-run setup flow should also ask for the assistant's name, persona, and ongoing objectives again so operators shape the main agent before the first real chat.

The proof should be visible in four places: `/status` becomes much more informative, provider requests receive a richer bounded self-knowledge system pack, quickstart writes assistant identity and disables the later first-contact identity prompt by default, and the refreshed docs/tests describe and verify the new behavior.

## Progress

- [x] (2026-03-07 16:25Z) Audited the current runtime awareness, `/status`, `/profile`, quickstart, wizard, daemon startup, install-state flow, and relevant docs/tests before implementation.
- [x] (2026-03-07 17:40Z) Implemented richer bounded self-knowledge contracts in `packages/core-types/src/runtime.ts`, added the curated manifest in `packages/core-runtime/src/self-knowledge.ts`, and rewrote `packages/core-runtime/src/awareness.ts` plus `packages/core-runtime/src/runtime.ts` so provider turns and `/status` use the same self-knowledge pack.
- [x] (2026-03-07 18:05Z) Fed install/update context into runtime awareness from daemon startup through `apps/openassistd/src/install-context.ts` and `apps/openassistd/src/index.ts`, including install directory, config/env paths, tracked ref, and last-known-good commit when available.
- [x] (2026-03-07 18:30Z) Restored assistant identity capture to quickstart, changed quickstart-created installs to disable first-contact prompting by default, and updated wizard wording to describe the same fields as the global main-agent identity.
- [x] (2026-03-07 19:05Z) Updated AGENTS, lifecycle/security/runtime docs, install docs, restart/recovery, testing matrix, and changelog in the same change so the public story matches the runtime behavior.
- [x] (2026-03-07 22:46Z) Added/updated coverage for self-knowledge and quickstart identity, fixed stale runtime/native-web test fixtures uncovered during the post-crash rerun, and passed `pnpm verify:all` locally.
- [x] (2026-03-07 22:50Z) Opened PR `#7`, monitored GitHub CI/code scanning/review surfaces, and reached a fully green bot-check state with no open review comments or code-scanning alerts.

## Surprises & Discoveries

- Observation: The current runtime already persists awareness safely in `session_bootstrap.systemProfile.awareness`, but the snapshot is still mostly a thin status summary rather than a useful self-model.
  Evidence: `packages/core-runtime/src/awareness.ts` only renders software/host/runtime/policy/web status plus a small limitations list.

- Observation: Quickstart intentionally removed assistant identity capture and left it to the wizard plus optional first-contact prompting later in chat.
  Evidence: `apps/openassist-cli/src/lib/setup-quickstart.ts` jumps from runtime defaults directly to provider/channel flow, while `apps/openassist-cli/src/lib/setup-wizard.ts` still owns assistant name/persona/preferences prompts.

- Observation: The runtime needs one curated self-knowledge manifest shared by both provider grounding and `/status`; duplicating summaries in two places would drift quickly.
  Evidence: The new implementation now centralizes docs, protected paths, and safe-maintenance rules in `packages/core-runtime/src/self-knowledge.ts`, while `packages/core-runtime/src/awareness.ts` and `packages/core-runtime/src/runtime.ts` only render from that source.

- Observation: Install-state alone is not enough to explain the active repo-backed update model; the runtime also needs best-effort `.git` discovery and current commit/ref lookup when install-state is incomplete.
  Evidence: `apps/openassistd/src/install-context.ts` now merges install-state with repo discovery and `git rev-parse` output before passing context into the runtime.

- Observation: The implementation itself was sound, but the post-crash full verification rerun exposed two stale runtime expectations and one stale scripted quickstart answer queue in the node integration suite.
  Evidence: `tests/node/runtime.test.ts` still expected the old `/status` install-context fixture and older profile copy, and `tests/node/cli-setup-web-coverage.test.ts` was missing answers for the restored Assistant Identity stage. Updating those fixtures restored a clean full gate.

## Decision Log

- Decision: keep self-knowledge bounded and curated rather than teaching the runtime to crawl arbitrary local docs on each turn.
  Rationale: The user wants stronger self-understanding, but the repo already treats bounded context growth as a non-negotiable invariant. A curated manifest gives the model concrete local references without uncontrolled prompt growth or secret leakage risk.
  Date/Author: 2026-03-07 / Codex

- Decision: pass install/update facts into the runtime through daemon startup dependencies instead of extending the persistent config schema.
  Rationale: Install-state is lifecycle metadata, not user config. Keeping it outside `openassist.toml` avoids schema churn and preserves the current repo-backed install/update model cleanly.
  Date/Author: 2026-03-07 / Codex

- Decision: restore assistant identity prompts to quickstart but keep advanced runtime/security/tool tuning in wizard.
  Rationale: The user explicitly wants name/persona/objectives back in first-run onboarding, but the earlier lifecycle refactor correctly removed many advanced settings from quickstart. Restoring identity capture should not re-bloat the rest of the flow.
  Date/Author: 2026-03-07 / Codex

- Decision: keep the self-maintenance contract advisory for `operator` and `restricted`, and only describe bounded local edits for `full-root` when callable tools actually make those changes possible.
  Rationale: The user wants the assistant to understand how it can improve itself, but the repo's security rules still forbid implicit privilege escalation and tool-schema exposure outside `full-root`. The runtime should be explicit about what is blocked now, not optimistic about hypothetical abilities.
  Date/Author: 2026-03-07 / Codex

- Decision: quickstart should turn off the later first-contact identity reminder after it captures assistant name/persona/preferences, while wizard keeps the control to re-enable it.
  Rationale: Re-asking for identity immediately after onboarding makes the product feel confused about its own primary setup path. Capturing identity once during quickstart and exposing `/profile` plus wizard for later edits is clearer and still fully reversible.
  Date/Author: 2026-03-07 / Codex

## Outcomes & Retrospective

The implementation now covers the intended behavior end to end in code and docs. OpenAssist carries a richer bounded self-knowledge pack on provider turns, `/status` explains identity/host/install/capability/doc facts in operator language, daemon startup feeds repo-backed install context into runtime awareness, and quickstart once again captures assistant identity before the first chat while disabling the redundant later first-contact reminder by default.

The implementation is complete and merge-ready. No schema migration or new durable table was required because the richer awareness snapshot still fits inside the existing `session_bootstrap.systemProfile.awareness` payload. PR `#7` now carries the change, `pnpm verify:all` passed locally after the post-crash rerun, GitHub CI is green across Linux/macOS/Windows plus CodeQL, and the PR has no open review comments or open code-scanning alerts. The only remaining step is human review and merge.

## Context and Orientation

The core runtime lives in `packages/core-runtime/src/runtime.ts`. It builds provider requests, handles inbound channel messages, owns `/status`, `/profile`, `/access`, and persists per-session bootstrap state. The current awareness builder is `packages/core-runtime/src/awareness.ts`, and the persisted awareness snapshot is stored in the existing `session_bootstrap.systemProfile.awareness` payload through `packages/storage-sqlite/src/index.ts`.

The daemon entrypoint is `apps/openassistd/src/index.ts`. It loads config, resolves providers/channels, starts the runtime, and exposes the HTTP control API. It is the safest place to pass repo-backed install/update facts into runtime construction.

Interactive onboarding lives in `apps/openassist-cli/src/lib/setup-quickstart.ts` and `apps/openassist-cli/src/lib/setup-wizard.ts`. Quickstart currently targets a minimal first-reply flow, while the wizard still owns assistant identity prompts.

The docs that must stay in sync are the root `README.md`, `docs/README.md`, `docs/architecture/runtime-and-modules.md`, `docs/interfaces/tool-calling.md`, `docs/security/policy-profiles.md`, `docs/security/threat-model.md`, `docs/operations/quickstart-linux-macos.md`, `docs/operations/setup-wizard.md`, `docs/operations/upgrade-and-rollback.md`, and `CHANGELOG.md`.

## Plan of Work

First, extend the shared runtime-awareness contract in `packages/core-types/src/runtime.ts` with explicit documentation references, capabilities, and maintenance/install facts. Then add a new runtime-owned self-knowledge manifest module in `packages/core-runtime/src/` so the awareness builder can reference a bounded curated set of local docs and safe-maintenance rules.

Next, update `packages/core-runtime/src/awareness.ts` and `packages/core-runtime/src/runtime.ts` so provider requests and `/status` use a richer grounding pack. Keep persistence in the existing bootstrap payload, but refresh it when assistant profile, install context, or effective access changes.

Then, add a daemon-side helper in `apps/openassistd/src/` that gathers install-state and repo metadata without reaching across app/package boundaries. Pass that into `OpenAssistRuntime` through optional runtime dependencies.

After the runtime layer is in place, restore assistant identity prompts to `setup quickstart`, disable `promptOnFirstContact` for quickstart-created configs, and update wizard wording so the same fields read clearly as the global main-agent identity.

Finally, refresh tests and operator docs together, run the full local verification gate, open the PR, and resolve any CI or review findings before calling the branch ready.

## Concrete Steps

From the repository root:

    pnpm verify:all

Before that full gate, targeted slices should be used while iterating:

    pnpm exec vitest run tests/vitest/setup-quickstart-flow.test.ts tests/vitest/setup-quickstart-branches.test.ts
    pnpm exec tsx --test tests/node/runtime.test.ts tests/node/cli-setup-quickstart-runtime.test.ts

The final PR workflow also requires GitHub checks and review findings to be clean after push.

## Validation and Acceptance

Acceptance is behavioral:

1. A normal chat turn provider request contains a richer self-knowledge system message that names OpenAssist, the current host/runtime facts, current access/tool reality, local docs/config/install pointers, and safe-maintenance rules.
2. `/status` reports assistant identity, host/install/runtime context, access/capability level, and clear local doc/config/update pointers.
3. A quickstart-created config persists assistant name/persona/preferences and sets `runtime.assistant.promptOnFirstContact = false`.
4. A quickstart-created install no longer emits the first-contact profile prompt on `/start` by default, while `/profile` still reports and updates the same global assistant profile memory.
5. `pnpm verify:all` passes locally, then GitHub CI, CodeQL, and actionable review findings are clean on the PR.

## Idempotence and Recovery

The plan is additive and safe to retry. Awareness remains derived from live runtime/config/install state and rewritten into the same bootstrap row, so rerunning a failed implementation step should refresh the same payload rather than creating duplicate durable state. Quickstart continues to write the same config/env files and backup path behavior remains unchanged.

If a runtime or docs-manifest test fails mid-implementation, fix the specific builder or manifest entry and rerun the targeted test slice before rerunning `pnpm verify:all`.

## Artifacts and Notes

The most important implementation evidence to capture later in this document is:

- a `/status` transcript showing the richer identity/capability/doc/install output
- a provider-request test assertion proving the richer grounding pack is present
- a quickstart-created config excerpt showing `promptOnFirstContact = false`
- the final `pnpm verify:all` success note and PR/CI status summary

Current evidence captured during implementation:

- `/status` expectations live in `tests/node/runtime.test.ts`, including app identity, local docs/config map, and repo-backed install facts when install context is present.
- Provider grounding assertions live in `tests/node/runtime.test.ts` and `tests/vitest/runtime-self-knowledge.test.ts`, proving the runtime self-knowledge pack includes doc refs and maintenance facts.
- Quickstart persistence expectations live in `tests/node/cli-setup-quickstart-runtime.test.ts` and `tests/vitest/setup-quickstart-flow.test.ts`, including `promptOnFirstContact = false`.
- Local merge gate evidence: `pnpm verify:all` passed on 2026-03-07 after the post-crash rerun and stale test-fixture fixes.
- PR evidence: GitHub PR `#7` (`feat: strengthen runtime self-knowledge and quickstart identity`) is open with all checks green and no open review comments or code-scanning alerts as of 2026-03-07.

## Interfaces and Dependencies

The implementation should end with these interface-level additions:

- `packages/core-types/src/runtime.ts`
  - `RuntimeDocRef`
  - expanded `RuntimeAwarenessSnapshot` with bounded `capabilities`, `documentation`, and `maintenance` sections

- `packages/core-runtime/src/runtime.ts`
  - optional runtime dependency carrying install/update context
  - richer provider/system grounding and `/status` rendering

- `apps/openassistd/src/`
  - helper(s) to detect repo-backed install/update context for runtime startup

- `apps/openassist-cli/src/lib/setup-quickstart.ts`
  - restored assistant identity stage and quickstart default `promptOnFirstContact = false`

Revision (2026-03-07 16:25Z): Initial ExecPlan created after repo audit to capture the implementation path before code changes begin.
Revision (2026-03-07 19:05Z): Updated the living sections after implementing the self-knowledge contract, daemon install-context flow, quickstart identity restoration, and the related docs/test synchronization; remaining work is full verification and PR monitoring.
Revision (2026-03-07 22:46Z): Recorded the successful full local gate, plus the stale runtime/native-web test-fixture fixes that surfaced during the post-crash rerun, so the remaining work is only PR creation and review monitoring.
Revision (2026-03-07 22:50Z): Recorded PR `#7`, the fully green GitHub check state, and the absence of bot review/code-scanning findings so the plan reflects the actual merge-ready status.
