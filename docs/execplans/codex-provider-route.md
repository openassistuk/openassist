# Separate Codex Provider Route

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document must be maintained in accordance with `.agents/PLANS.md`.

## Purpose / Big Picture

After this change, OpenAssist should stop treating OpenAI API-key auth and OpenAI account-login auth as one muddled provider story. New operator-facing setup and docs should present four clear first-class provider routes:

- `openai`
- `codex`
- `anthropic`
- `openai-compatible`

The public split is deliberate:

- `openai` is the API-key route
- `codex` is the separate Codex/OpenAI account-login route
- `codex` is Codex-only in this release, not a generic ChatGPT API auth replacement for arbitrary OpenAI models

The operator-visible proof should be simple. Quickstart and wizard should show the four routes clearly, account-linking guidance should point new account-login installs to `codex`, and the root docs plus sample config should stop implying that generic OpenAI OAuth is the public path.

## Progress

- [x] (2026-03-08 17:40Z) Re-audited the current branch state and confirmed the runtime implementation has already introduced a separate `codex` provider route with its own adapter package, PKCE login flow, refresh path, and Codex-model validation.
- [x] (2026-03-08 17:55Z) Confirmed the setup surfaces now present four provider choices in code, with OpenAI labeled as API-key auth and Codex labeled as OpenAI account login.
- [x] (2026-03-08 18:15Z) Updated root `README.md` and root `AGENTS.md` so the public GitHub story and contributor discipline now describe the split-route provider model truthfully.
- [x] (2026-03-08 18:28Z) Updated provider/lifecycle/migration/security docs plus the sample `openassist.toml` so the repo no longer presents new account-login setups as mixed `openai + oauth`.
- [x] (2026-03-08 18:34Z) Added this living ExecPlan and updated `CHANGELOG.md` with the operator-facing impact of the separate Codex route.
- [x] (2026-03-08 20:24Z) Added Codex-route coverage across schema, quickstart, wizard, runtime restart/refresh behavior, CLI API-surface coverage, and provider tool-loop contracts; local `pnpm verify:all` passed after the final test-matrix sync.
- [x] (2026-03-08 20:32Z) Opened PR `#18` from branch `feat/codex-provider-route` and verified the branch head is `46637a5669ed97d6a65934ac2ee5403573ceadfa`.
- [x] (2026-03-08 20:33Z) GitHub CI is green on PR `#18`: `workflow-lint`, `quality-and-coverage` on Ubuntu/macOS/Windows, `CodeQL preflight`, `analyze (javascript-typescript)`, and `CodeQL` all passed.
- [x] (2026-03-08 20:33Z) Review and code-scanning follow-up is clear on PR `#18`: no PR review comments, no open PR-head code-scanning alerts, and no actionable Copilot findings were left unresolved.

## Surprises & Discoveries

- Observation: the repo had already accumulated several documents that implied OpenAI account-linking was part of the normal `openai` route, even though the current branch code now treats `codex` as the separate public account-login path.
  Evidence: `README.md`, `docs/operations/quickstart-linux-macos.md`, `docs/operations/setup-wizard.md`, and `openassist.toml` all still framed OpenAI auth around API-key-first plus generic OAuth guidance before this docs pass.

- Observation: the migration docs had silently drifted from the implementation.
  Evidence: `docs/migration/openclaw-import.md` still said all non-Anthropic/non-OpenAI names map to `openai-compatible`, but the branch implementation now maps provider names containing `codex` to type `codex`.

- Observation: the correct public boundary for Codex needed to stay narrower than a generic “ChatGPT login” story.
  Evidence: the branch adapter implementation validates `gpt-5.4` and Codex-family models only, and the route uses a dedicated Codex/OpenAI account-login flow rather than acting like a broad replacement for the OpenAI API-key route.

## Decision Log

- Decision: document `codex` as a separate first-class provider route instead of treating it as a sub-mode of `openai`.
  Rationale: that matches the branch implementation and avoids the old auth-collision story where API-key and account-login semantics blurred together.
  Date/Author: 2026-03-08 / Codex

- Decision: keep OpenAI API-key auth and Codex account login distinct in operator-facing setup/docs.
  Rationale: beginners should be able to tell which route needs an API key and which route needs a linked account without inferring hidden behavior from adapter internals.
  Date/Author: 2026-03-08 / Codex

- Decision: describe Codex as Codex-only in V1, not as generic ChatGPT API auth for arbitrary OpenAI models.
  Rationale: the current branch code validates a narrower model boundary, and the docs should not overclaim beyond what the route is designed to support safely.
  Date/Author: 2026-03-08 / Codex

- Decision: preserve legacy `openai + oauth` readability in docs as compatibility-only, not as the recommended public path.
  Rationale: operators may already have mixed configs, but new account-login installs should be steered toward `codex`.
  Date/Author: 2026-03-08 / Codex

## Outcomes & Retrospective

The docs/governance/sample-config slice is now aligned with the intended branch architecture. The root docs, setup runbooks, provider interface docs, migration notes, and changelog now tell one consistent story: `openai` is the API-key route, `codex` is the separate OpenAI account-login route, and new account-login setups should use `codex` rather than a mixed OpenAI provider entry.

The implementation side is now also aligned with that story. OpenAssist has a dedicated `codex` provider type plus adapter package, deterministic provider-instance auth behavior, restart-safe linked-account loading, refresh-capable Codex auth, quickstart and wizard provider selection for four first-class routes, validation/migration guidance for legacy `openai + oauth`, and regression coverage that proves Codex account auth does not collide with the normal OpenAI API-key route.

Final branch-owner verification evidence:

- local verification: `pnpm verify:all` passed on branch `feat/codex-provider-route`
- PR: `#18` (`feat: add separate codex provider route`)
- branch head verified on PR: `46637a5669ed97d6a65934ac2ee5403573ceadfa`
- GitHub CI: green
- CodeQL: green
- PR-head code-scanning alerts: none
- review findings: none left open

The docs-testing sync risk that existed mid-implementation was closed before the final local gate. `docs/testing/test-matrix.md` and the docs-truth assertions were updated to include the Codex-route suites before the successful `pnpm verify:all` run.

## Context and Orientation

The main operator-facing truth sources for this change are:

- `README.md`
- `AGENTS.md`
- `docs/README.md`
- `docs/interfaces/provider-adapter.md`
- `docs/operations/quickstart-linux-macos.md`
- `docs/operations/setup-wizard.md`
- `docs/operations/common-troubleshooting.md`
- `docs/migration/openclaw-import.md`
- `openassist.toml`
- `CHANGELOG.md`

The current branch implementation this plan is aligned to introduces the new provider route in the shared provider config/schema layer, the setup flows, the runtime OAuth persistence/refresh path, and a dedicated Codex adapter package. This plan intentionally records the operator/documentation contract for that code rather than re-specifying low-level adapter details.

## Plan of Work

1. Keep the root docs truthful first: `README.md` and `AGENTS.md`.
2. Update the provider contract docs and lifecycle runbooks so quickstart/wizard/operator repair flows all describe the same four-route model.
3. Update the sample config and migration docs so older mixed-auth language does not remain as the default public guidance.
4. Record the branch truth and follow-up verification evidence in this ExecPlan as the implementation proceeds.

## Validation and Acceptance

Docs/governance acceptance for this slice is met when:

1. root `README.md` clearly presents the four provider routes and the Codex-only boundary
2. root `AGENTS.md` preserves contributor discipline for the split-route auth story
3. provider/lifecycle docs stop presenting new OpenAI account-login installs as mixed `openai + oauth`
4. the sample `openassist.toml` includes a truthful Codex example and compatibility note
5. `CHANGELOG.md` explains the operator-facing impact concretely

## Idempotence and Recovery

These edits are documentation-only and additive. If the implementation shifts before merge, re-run the docs audit against the current branch code and adjust the wording rather than preserving stale route claims. Do not silently broaden the Codex docs story beyond the actual validated route boundary.

Revision note (2026-03-08 18:34Z): Created this ExecPlan during the docs/governance pass for the separate Codex provider route so the branch has a living plan file before PR/CI/review closure evidence is added.
