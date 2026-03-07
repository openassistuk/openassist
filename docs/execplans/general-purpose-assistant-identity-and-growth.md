# General-Purpose Assistant Identity and Controlled Growth

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document must be maintained in accordance with [.agents/PLANS.md](c:/Users/dange/Coding/openassist/.agents/PLANS.md).

## Purpose / Big Picture

After this change, OpenAssist should introduce itself as a broader machine assistant instead of a narrow repo-maintenance bot. In chat, `/start` and `/help` should explain that OpenAssist can help with local system tasks, files and supported attachments, web work, recurring automations, lifecycle commands, and controlled capability growth, while still being truthful about the exact provider, channel, access mode, and callable tools active in the current session.

The same change should also expose durable growth surfaces that survive updates more cleanly than ad-hoc repo mutation. Full-root sessions should be able to inspect installed skills, install new skills from a directory, register helper tools, and see an explicit growth policy that prefers managed extensions and helper tooling under runtime-owned paths over direct repo edits.

## Progress

- [x] (2026-03-07 18:31Z) Audited the current runtime awareness, runtime-owned chat commands, skill runtime, daemon API, CLI command registry, lifecycle reporting, and storage patterns before implementation.
- [x] (2026-03-07 18:58Z) Added awareness v3 contracts, expanded channel capabilities, managed-growth persistence, and the runtime capability-domain/growth builders in `packages/core-types`, `packages/core-runtime`, `packages/channels-*`, and `packages/storage-sqlite`.
- [x] (2026-03-07 19:06Z) Implemented runtime-owned `/start`, `/help`, `/capabilities`, and `/grow`, refreshed `/status`, and broadened provider grounding so runtime identity and growth policy come from the same bounded awareness source.
- [x] (2026-03-07 19:18Z) Exposed managed skills and helper-tool growth through daemon API and CLI, then surfaced managed growth state in `openassist doctor` and `openassist upgrade --dry-run`.
- [x] (2026-03-07 19:33Z) Updated `AGENTS.md`, README/reference/security/operations docs, and `CHANGELOG.md` to match the broader assistant positioning and extensions-first growth model.
- [x] (2026-03-07 19:55Z) Refreshed runtime, storage, CLI/API, and lifecycle coverage and ran `pnpm verify:all` successfully from the repo root.

## Surprises & Discoveries

- Observation: the current self-knowledge work already centralized docs, protected paths, and safe-maintenance rules in `packages/core-runtime/src/self-knowledge.ts`, which means the broader assistant positioning can be implemented by widening the existing bounded manifest instead of inventing a second parallel grounding path.
  Evidence: `packages/core-runtime/src/awareness.ts` already builds both the stored awareness snapshot and the provider system message from the same self-knowledge module.

- Observation: the repo already has a real file-based skill runtime and a database skill registry, but they are not exposed as operator-facing lifecycle surfaces.
  Evidence: `packages/skills-engine/src/index.ts` provides `listInstalled()` and `installFromPath()`, while `packages/storage-sqlite/src/index.ts` already has `registerSkill()` and `listRegisteredSkills()`.

- Observation: the existing chat runtime already had a clean provider-bypass path for `/status`, `/profile`, and `/access`, which made it straightforward to add `/start`, `/help`, `/capabilities`, and `/grow` as truthful runtime-owned command surfaces without leaking provider failures into the general assistant intro.
  Evidence: `packages/core-runtime/src/runtime.ts` routes provider-independent chat commands before provider dispatch and already persisted bounded bootstrap awareness per chat.

## Decision Log

- Decision: keep OpenAssist-first branding while broadening the runtime welcome and grounding away from repo-maintenance-only messaging.
  Rationale: the user wants OpenAssist to feel like the main assistant for the machine, but still clearly identify itself as OpenAssist rather than a generic shell bot.
  Date/Author: 2026-03-07 / Codex

- Decision: use an extensions-first growth model backed by runtime-owned skill and helper-tool directories, while still allowing direct repo/config/code edits in `full-root` as an advanced path.
  Rationale: managed extensions and helper tooling are more update-safe than relying on direct repo mutation, but the advanced path still needs to remain truthful and available.
  Date/Author: 2026-03-07 / Codex

## Outcomes & Retrospective

Implemented and verified.

Key outcomes:

- OpenAssist now introduces itself as the broader assistant for the machine through runtime-owned `/start` and `/help`, while `/status` stays the operational diagnostic surface.
- Runtime awareness snapshot version `3` now carries capability domains, managed growth state, broader machine-assistant grounding, and channel/provider-aware truth about what this session can actually do.
- Managed growth is now a first-class concept with durable `managed_capabilities` storage, runtime-owned skill/helper inspection, daemon API routes, CLI commands, and lifecycle output in `doctor` and `upgrade --dry-run`.
- Docs, governance, and release notes were updated in the same change so the public repo story matches the runtime behavior.

Verification evidence:

- `pnpm verify:all` passed locally on 2026-03-07.
- Targeted behavior coverage was also refreshed for:
  - `tests/node/runtime.test.ts`
  - `tests/node/storage.test.ts`
  - `tests/node/cli-api-surface-coverage.test.ts`
  - `tests/vitest/runtime-self-knowledge.test.ts`
  - `tests/vitest/lifecycle-readiness.test.ts`

## Context and Orientation

The runtime behavior lives in `packages/core-runtime/src/runtime.ts`. That file owns inbound chat handling, provider request construction, runtime-owned chat commands such as `/status`, and the session bootstrap state that persists bounded runtime awareness across restarts. The current awareness snapshot and system-message builder live in `packages/core-runtime/src/awareness.ts`, and the curated local-docs manifest plus safe-maintenance rules live in `packages/core-runtime/src/self-knowledge.ts`.

The public contracts that describe runtime awareness, provider capability metadata, channel capability metadata, and skill manifests live in `packages/core-types/src/runtime.ts`, `packages/core-types/src/provider.ts`, `packages/core-types/src/channel.ts`, and `packages/core-types/src/skills.ts`. Any public behavior change in those areas must remain additive and restart-safe because the awareness snapshot is persisted in the existing `session_bootstrap.systemProfile.awareness` payload.

The SQLite-backed durable state lives in `packages/storage-sqlite/src/index.ts`. That module already stores sessions, recent messages, tool invocations, session bootstrap state, and a simple skill registry. It is the correct place to add durable helper-tool tracking because the runtime and CLI/daemon already depend on it. The daemon HTTP API entrypoint is `apps/openassistd/src/index.ts`, and the operator CLI registry is `apps/openassist-cli/src/index.ts`.

The lifecycle surfaces that must stay aligned are `openassist doctor`, `openassist upgrade --dry-run`, and the onboarding docs under `docs/operations/`. The engineering policy and release discipline live in `AGENTS.md`, which must be updated in the same change to lock the new assistant-positioning and growth invariants.

## Plan of Work

First, extend the public contracts in `packages/core-types` so runtime awareness can describe capability domains and managed growth, and channel adapters can declare whether they support formatted output and inbound image/document attachments. Add a durable managed-capability record type for skills and helper tools. Then update every channel adapter and test double so the stricter capability contract remains truthful.

Second, rework the bounded runtime awareness builder in `packages/core-runtime/src/awareness.ts` and `packages/core-runtime/src/self-knowledge.ts`. The new awareness version must describe OpenAssist as a broader machine assistant, add a live capability-domain inventory, add managed growth status, and keep explicit negative capability language where the current provider/channel/tool stack falls short. The provider grounding message, `/status`, and persisted bootstrap awareness must all continue to derive from the same bounded source of truth.

Third, add runtime-owned chat surfaces in `packages/core-runtime/src/runtime.ts` for `/start`, `/help`, `/capabilities`, and `/grow`. `/start` and `/help` become the general welcome and capability primer. `/status` remains the operational diagnostic surface. `/grow` should explain the extensions-first policy, enumerate installed skills and registered helper tools, and show safe next actions without pretending that arbitrary repo edits are durable.

Fourth, expose managed growth through durable storage, daemon APIs, and CLI commands. Add a `managed_capabilities` table plus the needed list/upsert/sync helpers in `packages/storage-sqlite/src/index.ts`. Add runtime methods to list skills, install a skill from a source directory, list managed growth state, and register helper tools. Then wire those methods into `apps/openassistd/src/index.ts` and `apps/openassist-cli/src/index.ts` as the new `skills` and `growth` operator surfaces.

Fifth, feed managed growth state into lifecycle UX. `openassist doctor` and `openassist upgrade --dry-run` should show how many managed skills and helper tools are present, where they live, and why those assets are more update-safe than dirty repo code changes. The wording should stay beginner-readable and aligned with the existing lifecycle report model.

Finally, update `AGENTS.md`, the required README/interface/security/operations docs, and `CHANGELOG.md`, then add or refresh the runtime, storage, CLI/API, and lifecycle tests so `pnpm verify:all` proves the behavior end to end.

## Concrete Steps

From the repository root `c:\Users\dange\Coding\openassist`, create or update the runtime contracts, runtime builders, storage methods, daemon routes, CLI commands, docs, and tests described above. After code changes are in place, run:

    pnpm verify:all

If targeted failures need quicker iteration before the full gate, run focused suites first from the same working directory, then rerun `pnpm verify:all` before claiming completion.

## Validation and Acceptance

Acceptance for this change is behavior-based:

1. In chat, `/start` and `/help` return runtime-owned capability-first welcome text that describes OpenAssist as the main assistant for the machine, not just the repo/runtime maintainer.
2. In chat, `/capabilities` reports a truthful capability inventory derived from the active access level, provider, channel, tools, scheduler state, and install context.
3. In chat, `/grow` reports the extensions-first growth policy, skill/helper counts, growth directories, and safe next actions.
4. `openassist skills list`, `openassist skills install --path <dir>`, `openassist growth status`, and `openassist growth helper add ...` work against the daemon API and reflect durable state.
5. `openassist doctor` and `openassist upgrade --dry-run` report managed growth state and clearly distinguish update-safe extension/helper paths from dirty repo code changes.
6. `pnpm verify:all` passes locally with the new runtime, storage, CLI/API, and lifecycle coverage in place.

## Idempotence and Recovery

The storage additions must be additive and safe to rerun. The runtime should create or reuse helper-tool and skill directories without breaking existing installs. Reinstalling a skill from the same source path should overwrite the managed skill copy in place and refresh the stored manifest/registry entry. Re-registering a helper tool with the same id should update its metadata in place rather than duplicating it.

If a daemon or CLI step fails mid-way, the safe retry path is to rerun the same command after fixing the reported input problem. The work must not require destructive resets or manual SQLite surgery.

## Artifacts and Notes

Expected evidence before completion includes:

    pnpm verify:all
    ...
    <full local verification passes>

and short transcripts for:

    openassist growth status
    openassist skills list
    /start
    /grow

showing the broader assistant identity and managed growth state.

## Interfaces and Dependencies

In `packages/core-types/src/runtime.ts`, define additive public types for runtime capability domains, managed growth status, and awareness version `3`. In `packages/core-types/src/channel.ts`, extend `ChannelCapabilities` with formatted-text and inbound-attachment support booleans. In `packages/core-types/src/runtime.ts` or another core-types module, define a managed capability record with fields for `kind`, `id`, `installRoot`, `installer`, `summary`, `updateSafe`, and timestamps.

In `packages/storage-sqlite/src/index.ts`, add durable methods to upsert and list managed capabilities. In `packages/core-runtime/src/runtime.ts`, add runtime methods that expose installed skills and managed growth state without bypassing the storage package. In `apps/openassistd/src/index.ts`, expose HTTP routes for listing and installing skills plus growth status. In `apps/openassist-cli/src/index.ts`, add the matching operator commands and keep their output consistent with the existing lifecycle/operator language.

Revision note: created this ExecPlan at the start of implementation so the broader assistant identity and growth work can be tracked as a living document from the first code change onward.
