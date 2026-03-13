# GitHub landing page and beginner docs expansion

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document must be maintained in accordance with [`.agents/PLANS.md`](../../.agents/PLANS.md).

## Purpose / Big Picture

OpenAssist already has deep lifecycle documentation, but the root `README.md` and the docs index still ask new operators to absorb too much detail before they can answer simple questions such as “which provider should I choose?”, “how does Telegram differ from Discord?”, or “where do I actually put my config?”. After this change, a first-time GitHub visitor should be able to land on `README.md`, understand the product shape quickly, choose the right provider and channel docs, and find a schema-backed configuration guide without reading the entire lifecycle narrative first.

The user-visible result is a GitHub-first landing page plus dedicated beginner docs for every first-class provider and channel. The change remains documentation-only: no runtime behavior, config schema, command surface, or contract types change.

## Progress

- [x] (2026-03-13 15:52Z) Confirmed the current docs surface, command surface, schema-backed config fields, and docs-truth test expectations.
- [x] (2026-03-13 15:53Z) Created branch `docs/github-landing-and-beginner-guides`.
- [x] (2026-03-13 16:02Z) Drafted the new provider, channel, and configuration docs.
- [x] (2026-03-13 16:06Z) Restructured `README.md` and `docs/README.md` around the new landing/documentation flow.
- [x] (2026-03-13 16:07Z) Synced supporting docs, sample config comments, `CHANGELOG.md`, and `AGENTS.md`.
- [x] (2026-03-13 16:08Z) Ran `pnpm exec tsx --test tests/node/cli-docs-truth.test.ts`.
- [x] (2026-03-13 16:08Z) Ran `pnpm verify:all`.
- [x] (2026-03-13 16:19Z) Addressed review feedback on OAuth docs, WhatsApp config wording, and sample-config comments.
- [x] (2026-03-13 16:19Z) Re-ran `pnpm exec tsx --test tests/node/cli-docs-truth.test.ts` and `pnpm verify:all` after the review-driven doc edits.
- [x] (2026-03-13 16:20Z) Committed the docs work, pushed branch `docs/github-landing-and-beginner-guides`, and opened PR `#43`.
- [x] (2026-03-13 16:22Z) Replied to the automated review comments and recorded the no-op explanation for the markdown-table false positive.
- [x] (2026-03-13 16:28Z) Resolved all eight PR review threads after the follow-up doc changes landed.
- [x] (2026-03-13 16:30Z) Confirmed PR-applicable checks are green: `CI` (`workflow-lint`, `quality-and-coverage` on ubuntu/macos/windows) and `CodeQL` (`CodeQL preflight`, `analyze (javascript-typescript)`).
- [ ] Wait for the required non-author human approval before merge.

## Surprises & Discoveries

- Observation: The repo already enforces docs truth strictly enough that this docs-only change behaves like an interface change.
  Evidence: `tests/node/cli-docs-truth.test.ts` validates live doc links, anchors, docs-index completeness, workflow wording, and documented CLI commands.
- Observation: The public config surface is split between the top-level schema and adapter-level channel/provider settings.
  Evidence: `packages/config/src/schema.ts` defines the top-level TOML shape, while `packages/channels-*` and `packages/providers-*` define required per-route settings such as Telegram `botToken`, Discord `allowedDmUserIds`, and WhatsApp `sessionDir`.
- Observation: The docs-only rewrite can still pass the full repo gate cleanly without code changes when the workflow wording and command examples stay exact.
  Evidence: `pnpm verify:all` passed after the README and docs index were restructured.
- Observation: Review feedback was mostly about documentation precision rather than missing coverage.
  Evidence: the follow-up edits were limited to clarifying required OAuth fields, distinguishing guidance from schema validation, and correcting sample-comment formatting.
- Observation: The repo branch protection still requires a non-author approval even after all review threads are resolved and all checks are green.
  Evidence: PR `#43` currently reports `reviewDecision: REVIEW_REQUIRED` and `mergeStateStatus: BLOCKED` after the successful `CI` and `CodeQL` runs completed on 2026-03-13.

## Decision Log

- Decision: Treat the new `docs/channels/`, `docs/providers/`, and `docs/configuration/` directories as canonical public doc surfaces.
  Rationale: The user asked for searchable beginner docs by specific provider/channel and for dedicated configuration documentation; those surfaces should therefore be preserved by future docs-sync rules rather than treated as one-off additions.
  Date/Author: 2026-03-13 / Codex
- Decision: Keep the root `README.md` concise and link-driven instead of repeating the full lifecycle narrative already documented elsewhere.
  Rationale: The README now needs to work as a GitHub landing page first; deep setup and troubleshooting detail belongs in dedicated docs pages where it is easier to scan and maintain.
  Date/Author: 2026-03-13 / Codex

## Outcomes & Retrospective

The documentation work is complete locally. The repo now has a GitHub-first landing `README.md`, a rebuilt docs index, dedicated beginner docs for each first-class provider and channel, and a practical plus schema-backed configuration section. Existing lifecycle docs now point into those pages instead of forcing beginners to extract route-specific detail from long mixed-purpose runbooks.

The release workflow is complete up to the repository approval gate. The branch is pushed as `docs/github-landing-and-beginner-guides`, PR `#43` is open, all PR-applicable checks are green, and all automated review threads are resolved.

After PR creation, an automated review highlighted a few precision issues in the new docs. Those were corrected in a follow-up commit, the full local validation gate still passed on the revised content, and the refreshed PR checks also passed.

The remaining blocker is outside the authored content: GitHub still reports `REVIEW_REQUIRED`, so a non-author human approval is needed before the PR becomes mergeable.

## Context and Orientation

The current high-level entrypoints are `README.md` and `docs/README.md`. The lifecycle runbooks live under `docs/operations/`, the architecture and interface docs live under `docs/architecture/` and `docs/interfaces/`, and contributor documentation policy lives in `AGENTS.md`.

The command-line surface is implemented in `apps/openassist-cli/src/index.ts` together with `apps/openassist-cli/src/commands/setup.ts`, `apps/openassist-cli/src/commands/service.ts`, and `apps/openassist-cli/src/commands/upgrade.ts`. Documentation command examples must stay aligned with those files because `tests/node/cli-docs-truth.test.ts` parses the docs and rejects unsupported command examples.

The config reference must stay grounded in `packages/config/src/schema.ts` for the top-level TOML structure, `packages/core-types/src/runtime.ts`, `packages/core-types/src/provider.ts`, and `packages/core-types/src/channel.ts` for the public runtime contracts, and the adapter schemas in `packages/channels-telegram/src/index.ts`, `packages/channels-discord/src/index.ts`, `packages/channels-whatsapp-md/src/index.ts`, `packages/providers-openai/src/index.ts`, `packages/providers-codex/src/index.ts`, `packages/providers-anthropic/src/index.ts`, and `packages/providers-openai-compatible/src/index.ts` for required provider/channel-specific settings.

## Plan of Work

Create dedicated beginner docs under `docs/providers/`, `docs/channels/`, and `docs/configuration/`. Each provider page will explain when to pick the route, how auth works, which config fields matter, and how to verify that route. Each channel page will explain supported chat scope, required settings, setup flow, first-message verification, and channel-specific operational notes. The config guide will explain file locations, overlays, env-file usage, and operator commands, while the config reference will stay schema-backed and organized by top-level sections and route-specific settings.

Replace the root `README.md` with a GitHub-first landing page that keeps the public product framing, quick start, safety model, automation statements, and docs map but links out to the new detailed docs instead of embedding every lifecycle detail inline. Rebuild `docs/README.md` as a complete index that preserves the workflow wording required by the docs-truth test while adding explicit `Providers`, `Channels`, and `Configuration` sections.

Finally, update the existing lifecycle docs to link into the new pages where beginners need deeper guidance, update `openassist.toml` comments to point at the new config/provider/channel docs, add an entry to `CHANGELOG.md`, and extend `AGENTS.md` so future behavior changes keep the new canonical docs in sync.

## Concrete Steps

From the repository root:

    git checkout -b docs/github-landing-and-beginner-guides

Add the new docs and rewrite the landing/index docs with `apply_patch`, then run:

    pnpm exec tsx --test tests/node/cli-docs-truth.test.ts
    pnpm verify:all

After local verification passes, prepare the branch/PR workflow:

    git status --short
    git add README.md AGENTS.md CHANGELOG.md openassist.toml docs
    git commit -m "docs: expand beginner provider and channel guides"
    git push -u origin docs/github-landing-and-beginner-guides
    gh pr create --fill

## Validation and Acceptance

Acceptance is met when:

1. `README.md` reads as a GitHub landing page instead of a full operations manual.
2. `docs/README.md` indexes every live non-ExecPlan doc, including the new provider, channel, and configuration pages.
3. Each first-class provider and channel has its own beginner-facing page with accurate commands and config references.
4. The config guide and config reference describe the real schema-backed TOML/env surface without inventing unsupported fields.
5. `pnpm exec tsx --test tests/node/cli-docs-truth.test.ts` passes.
6. `pnpm verify:all` passes.

## Idempotence and Recovery

The work is documentation-only, so edits are safe to re-run and refine. If the docs-truth test fails, correct the broken links, anchors, or command examples and rerun the same validation commands. If the new docs structure turns out to be too shallow or too repetitive, consolidate wording without changing the command truth or schema-backed references.

## Artifacts and Notes

Expected validation commands:

    pnpm exec tsx --test tests/node/cli-docs-truth.test.ts
    pnpm verify:all

Important repo invariants for this change:

    - Do not change runtime behavior, config schema, or CLI surface.
    - Keep workflow wording aligned with .github/workflows/*.yml.
    - Keep coverage-threshold wording aligned with vitest.config.ts and package.json.

Validation evidence:

    pnpm exec tsx --test tests/node/cli-docs-truth.test.ts
    # pass: 7, fail: 0

    pnpm verify:all
    # completed successfully

    pnpm exec tsx --test tests/node/cli-docs-truth.test.ts
    # pass: 7, fail: 0 (after review-driven edits)

    pnpm verify:all
    # completed successfully (after review-driven edits)

## Interfaces and Dependencies

This change adds documentation surfaces only:

- `docs/providers/openai.md`
- `docs/providers/codex.md`
- `docs/providers/anthropic.md`
- `docs/providers/openai-compatible.md`
- `docs/channels/telegram.md`
- `docs/channels/discord.md`
- `docs/channels/whatsapp-md.md`
- `docs/configuration/config-file-guide.md`
- `docs/configuration/config-reference.md`

The docs must continue to reference the existing public interfaces and commands rather than creating new ones.

Revision note (2026-03-13): updated after implementation to record the completed docs surfaces, the successful local validation runs, and the later review-driven follow-up edits.

Revision note (2026-03-13, later): updated after PR creation to record the follow-up review fixes, resolved review threads, green PR checks, and the remaining human-approval gate.
