# Access Mode Opt-In and Beginner Copy Pass

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document must be maintained in accordance with `.agents/PLANS.md`.

## Purpose / Big Picture

After this change, OpenAssist setup will offer two clear access modes in plain language: a standard mode that keeps the current safer default posture, and a full-access mode that can be enabled only for explicitly approved operator accounts. A beginner should be able to install OpenAssist on Linux or macOS, understand what each setup choice means, discover the exact sender/session identifiers they need, and safely switch their own chat session between standard and full access when they are an approved operator.

The visible proof is straightforward. `openassist setup quickstart` will default to standard mode and ask whether full access should be enabled for approved operators. `openassist setup wizard` will show the same access concept instead of raw policy jargon. In chat, `/status` will explain the current sender ID, session ID, and effective access, and `/access` will let an approved operator switch their own current chat between standard and full access. `openassist doctor`, bootstrap, and upgrade output will use plainer operator language throughout.

## Progress

- [x] (2026-03-06 20:05Z) Audited the current quickstart, wizard, policy engine, runtime, tool-status API, channel adapters, docs, and AGENTS constraints before implementation.
- [x] (2026-03-06 20:14Z) Confirmed the two architectural blockers that must be fixed in this PR: policy resolution is session-only today, and inbound messages currently expose channel type but not configured channel ID.
- [x] (2026-03-06 21:18Z) Implemented actor-aware policy and channel-identity changes across config, core types, runtime, storage, and CLI/API surfaces.
  Evidence: `runtime.operatorAccessProfile`, `channels[*].settings.operatorUserIds`, and `InboundEnvelope.channelId` now exist in the shared contracts; `packages/storage-sqlite/src/index.ts` now persists sender-scoped overrides in `actor_policy_profiles`; `packages/core-runtime/src/runtime.ts` resolves actor-specific access for `/status`, `/access`, tool-schema exposure, provider requests, and tool authorization; `apps/openassist-cli/src/index.ts` and `apps/openassistd/src/index.ts` now accept sender-aware status/policy lookups.
- [x] (2026-03-06 21:46Z) Updated quickstart, setup wizard, lifecycle output, and beginner-facing copy to expose the new access mode cleanly.
  Evidence: `apps/openassist-cli/src/lib/setup-quickstart.ts` now asks `Enable full access for approved operators? [y/N]` and blocks incomplete full-access setup with a clear fallback to standard mode; `apps/openassist-cli/src/lib/setup-wizard.ts` now presents `Standard mode (recommended)`, `Full access for approved operators`, and `Custom advanced access settings`; `scripts/install/bootstrap.sh`, `apps/openassist-cli/src/index.ts`, `apps/openassist-cli/src/lib/setup-summary.ts`, and `apps/openassist-cli/src/commands/upgrade.ts` all use beginner-oriented lifecycle wording.
- [x] (2026-03-06 22:12Z) Refreshed docs, AGENTS guidance, and changelog, then ran `pnpm verify:all`.
  Evidence: updated docs include `README.md`, `docs/README.md`, `docs/interfaces/channel-adapter.md`, `docs/interfaces/provider-adapter.md`, `docs/interfaces/tool-calling.md`, `docs/operations/quickstart-linux-macos.md`, `docs/operations/install-linux.md`, `docs/operations/install-macos.md`, `docs/operations/setup-wizard.md`, `docs/operations/upgrade-and-rollback.md`, `docs/operations/restart-recovery.md`, `docs/operations/e2e-autonomy-validation.md`, `docs/security/policy-profiles.md`, `docs/security/threat-model.md`, `docs/architecture/overview.md`, `docs/architecture/runtime-and-modules.md`, `docs/testing/chaos-and-soak.md`, `CHANGELOG.md`, and `AGENTS.md`. `pnpm verify:all` passed locally on 2026-03-06 after build, lint, typecheck, Vitest, Node tests, and both coverage gates completed successfully.
- [x] (2026-03-06 22:16Z) Cleared the post-push GitHub Advanced Security review note in quickstart and reran `pnpm verify:all` before updating the PR branch.
  Evidence: `apps/openassist-cli/src/lib/setup-quickstart.ts` no longer carries the dead `allowEmpty` branch in `promptOperatorIdsForChannel(...)`, and the full local verification gate passed again after the cleanup.
- [x] (2026-03-06 22:25Z) Addressed the follow-up Copilot review notes and reran `pnpm verify:all`.
  Evidence: `packages/config/src/schema.ts` now rejects reserved delimiters in channel IDs, `apps/openassist-cli/src/index.ts` restored plain `policy-get` output by default with optional `--json` for source detail, `packages/storage-sqlite/src/index.ts` now indexes `messages(session_id, id DESC)` for recent-message replay, and the full local verification gate passed again after those fixes.

## Surprises & Discoveries

- Observation: per-channel operator IDs are impossible to enforce correctly with the current inbound contract because the runtime only receives `channel` as a transport type (`telegram`, `discord`, `whatsapp-md`) and then routes replies by “first configured channel of that type”.
  Evidence: `packages/core-types/src/channel.ts` lacks `channelId`, and `packages/core-runtime/src/runtime.ts` uses `findChannelForType(...)` during inbound handling.

- Observation: actor-aware access in shared chats cannot be implemented safely by tweaking setup copy alone because the current policy engine persists only one profile per session.
  Evidence: `packages/core-types/src/policy.ts` exposes `currentProfile(sessionId)` / `setProfile(sessionId, profile)` and `packages/storage-sqlite/src/index.ts` stores only `policy_profiles(session_id PRIMARY KEY, profile, updated_at)`.

- Observation: `session_bootstrap` already stores a snapshot-like system profile that is rewritten when profile or awareness changes, so this PR does not need a second actor-specific bootstrap table.
  Evidence: `packages/core-runtime/src/runtime.ts` rewrites `session_bootstrap.systemProfile` inside `ensureSessionBootstrap(...)` whenever the computed awareness differs.

- Observation: existing runtime/test fixtures do not always populate the new `operatorAccessProfile` field yet, so the runtime must tolerate pre-change config objects during mixed test setup.
  Evidence: several Node tests construct minimal config objects inline; the runtime now defensively falls back to `"operator"` when `config.operatorAccessProfile` is absent during policy-engine construction.

## Decision Log

- Decision: keep approved operator identities inside per-channel `settings.operatorUserIds` instead of creating a new top-level config block.
  Rationale: channel settings already hold channel-specific allowlists and secrets, and the implementation needs the channel instance to decide whether a sender is an approved operator.
  Date/Author: 2026-03-06 / Codex

- Decision: add `runtime.operatorAccessProfile` rather than repurposing `defaultPolicyProfile`.
  Rationale: beginners need a simple access-mode abstraction while the runtime still needs a baseline default profile for non-operators. Keeping both avoids breaking existing custom policy setups.
  Date/Author: 2026-03-06 / Codex

- Decision: preserve the session-wide policy override path and add a sender-scoped override path with higher precedence.
  Rationale: existing CLI and docs already rely on whole-session overrides. The new sender-specific behavior must coexist with that legacy surface for upgraded installs.
  Date/Author: 2026-03-06 / Codex

- Decision: treat `session_bootstrap` as a last-seen chat snapshot, not as a permanent authority for actor-specific access state.
  Rationale: the runtime can recompute actor-specific awareness on demand for `/status` and provider requests without multiplying durable bootstrap state.
  Date/Author: 2026-03-06 / Codex

- Decision: keep legacy session-wide overrides and add compatibility lookup for old `<channelType>:<conversationKey>` session IDs when the channel mapping is unambiguous.
  Rationale: upgraded installs may already have persisted session-wide policy rows keyed by channel type, and this PR must not strand those operators while moving new writes and docs to `<channelId>:<conversationKey>`.
  Date/Author: 2026-03-06 / Codex

- Decision: keep `policy-get` shell-friendly by default and expose richer resolution detail through an explicit `--json` flag.
  Rationale: the PR needed actor-aware truthfulness, but changing the default output from a single profile string to JSON would silently break existing shell usage. The explicit flag preserves compatibility without losing the new `source` detail.
  Date/Author: 2026-03-06 / Codex

## Outcomes & Retrospective

This work completed the planned behavior end to end. OpenAssist setup now has a beginner-facing access-mode choice that keeps the safe path as the default while still supporting explicit full access for approved operators. Quickstart stays minimal unless the operator opts into full access, and it now blocks incomplete operator setup with a clear return path to standard mode instead of surfacing schema-like failures. Setup wizard exposes the same access concept, but still keeps raw advanced profile editing available when an installation is already custom.

The runtime now resolves access per sender in shared chats without breaking the existing session-wide override path. Canonical session IDs use `<channelId>:<conversationKey>`, inbound envelopes carry `channelId`, and actor-aware access now flows through `/status`, `/access`, `openassist policy-set/get`, `openassist tools status`, `GET /v1/tools/status`, provider request awareness, and tool authorization. This means an approved operator in a shared room can have `full-root` while another sender in the same conversation remains standard.

The documentation and release surfaces are now aligned with that behavior. Beginner-facing lifecycle text was simplified across bootstrap, quickstart, wizard, doctor, and update paths, and the required security/interface/operations docs were updated in the same change. Final local verification succeeded with `pnpm verify:all` on 2026-03-06, so the build, lint, typecheck, test, and coverage gates all passed with the new actor-aware access model in place.

## Context and Orientation

OpenAssist has two operator setup surfaces in `apps/openassist-cli`: `setup quickstart` for the first working install and `setup wizard` for advanced edits. Today quickstart intentionally avoids advanced policy and tool configuration. The runtime policy engine in `packages/core-runtime` gates autonomous tools by policy profile, and only `full-root` sessions can expose tool schemas to the model. The current problem is that shared chats and beginner-friendly access selection are not represented cleanly in the runtime.

The key files for this work are:

- `packages/core-types/src/channel.ts`, `packages/core-types/src/policy.ts`, and `packages/core-types/src/runtime.ts` for public runtime and policy contracts.
- `packages/storage-sqlite/src/index.ts` for policy persistence and any migration needed for sender-scoped overrides.
- `packages/core-runtime/src/runtime.ts` and `packages/core-runtime/src/policy-engine.ts` for inbound handling, profile resolution, `/status`, and tool exposure.
- `apps/openassist-cli/src/lib/setup-quickstart.ts`, `apps/openassist-cli/src/lib/setup-wizard.ts`, `apps/openassist-cli/src/index.ts`, and `scripts/install/bootstrap.sh` for lifecycle UX and wording.
- `apps/openassistd/src/index.ts` for daemon API query parameters.

In this repository, a “session” is the durable chat identity used for history and policy lookups. Before this change it was derived from `<channel-type>:<conversationKey>`. A “sender” is the human or account that sent an inbound message inside that chat. This PR makes access decisions per sender inside a shared chat while preserving the existing whole-session override path.

## Plan of Work

First, add the new config and contract fields: `runtime.operatorAccessProfile`, per-channel `operatorUserIds`, and `channelId` in inbound envelopes. Update the runtime to build canonical session IDs from `<channelId>:<conversationKey>`, add compatibility lookup for older type-based session IDs, and route replies using the actual configured channel adapter that emitted the message.

Next, extend durable policy storage to support sender-scoped overrides and teach the policy engine to resolve the effective profile in this exact order: actor override, session override, channel operator default, runtime default. Feed that effective result into tool authorization, tool-schema exposure, provider request construction, runtime awareness, `/status`, and `tools status`.

Then, add the `/access` chat command and extend CLI/API surfaces with optional sender selectors so operators can inspect and set the same actor-aware access model outside chat. Update quickstart and wizard to expose access mode in beginner language, only collecting operator IDs when the operator opts into full access, and block the full-access path until the chosen channel has approved operator IDs configured.

Finally, rewrite lifecycle copy in bootstrap, doctor, upgrade, setup summaries, and docs so the wording is beginner-friendly and consistent. Update `AGENTS.md`, the required security/interface docs, `CHANGELOG.md`, and the test suite, then run the full verification command and record the result.

## Concrete Steps

From `c:\Users\dange\Coding\openassist`, implement the changes in this order:

1. Update the shared types and config schema, then the SQLite policy persistence layer.
2. Update runtime inbound handling, policy resolution, `/status`, `/access`, and tool-status behavior.
3. Update CLI and daemon API parameter handling.
4. Update quickstart, wizard, bootstrap, doctor, and upgrade wording and behavior.
5. Refresh docs, changelog, and AGENTS guidance.
6. Run `pnpm verify:all`.

Expected verification command:

    pnpm verify:all

Expected end state:

    All checks pass locally, and the new runtime/setup tests for actor-aware access and access-mode copy are green.

## Validation and Acceptance

Acceptance is behavior-based:

1. A standard quickstart run leaves non-operator chats in `operator` mode, keeps filesystem tools workspace-only, and does not ask for operator IDs.
2. A full-access quickstart run asks for approved operator IDs for the chosen channel, saves `operatorAccessProfile=full-root`, disables workspace-only mode, and explains that only approved operators receive full access.
3. In a shared chat, `/status` from an approved operator and `/status` from an unapproved sender show different effective access and different callable tools.
4. In chat, `/access full` works only for an approved operator on the current chat and `/access standard` switches them back.
5. `openassist tools status --session <channelId:conversationKey> --sender-id <sender>` matches the same access boundary shown by `/status`.
6. Bootstrap, doctor, and upgrade output use plainer “access mode” and beginner-friendly lifecycle wording.

## Idempotence and Recovery

This plan is designed to be safe to retry. Schema and runtime changes are additive. Session-wide policy overrides remain intact. Sender-scoped overrides will be introduced without removing existing session overrides, so an upgraded install can continue using the old CLI path while new actor-aware behavior is added. If a test or verification step fails, fix the specific layer and rerun the same command; there is no destructive migration in this plan.

## Artifacts and Notes

The most important artifacts to capture before completion are:

- a quickstart transcript showing the new full-access opt-in prompt,
- `/status` output proving the sender/session IDs and effective access source are visible,
- `/access` output for approved and unapproved senders,
- the final `pnpm verify:all` result.

## Interfaces and Dependencies

At completion, the following interfaces must exist:

- `RuntimeConfig["operatorAccessProfile"]` in the config layer with values `"operator"` or `"full-root"`.
- `InboundEnvelope["channelId"]` alongside the existing transport `channel`.
- policy-resolution and storage methods that can read/write both session-wide and sender-scoped overrides.
- `OpenAssistRuntime.getToolsStatus(sessionId?: string, senderId?: string)` or an equivalent actor-aware signature.
- CLI `policy-set`, `policy-get`, and `tools status` options that accept `--sender-id` without breaking current session-only usage.

Revision note (2026-03-06): Created the initial living ExecPlan after a full repository audit so the implementation can proceed with the architectural blockers and public acceptance criteria documented up front.
