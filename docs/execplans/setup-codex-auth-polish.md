# Setup Codex Auth Polish

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document must be maintained in accordance with [.agents/PLANS.md](../../.agents/PLANS.md).

## Purpose / Big Picture

After this change, beginner and intermediate operators can run the installer and setup hub without jarring Node warnings, confusing Codex-only prompts, or a broken Codex login flow. The first-run provider list should read consistently, OpenAI and Codex reasoning controls should expose the currently supported effort levels, and the Codex account-login route should use a redirect pattern that works with the real OpenAI authorization surface instead of failing in the browser before the operator can complete login.

The visible proof is straightforward. Run `openassist setup` on a fresh install, choose Codex, and observe that no SQLite experimental warning appears before the menu, no base-URL prompt appears for Codex, the provider menu labels are harmonized, the reasoning selector includes `xhigh`, and the authorization instructions clearly explain how to paste the callback URL or code after browser login. Run the Codex auth command directly and observe that it prints a working authorization URL and graceful browser-launch fallback text instead of sending the operator to an unsupported redirect.

## Progress

- [x] (2026-03-09 18:05Z) Audited the current setup/Codex implementation and reproduced the main code paths responsible for the reported issues.
- [x] (2026-03-09 18:14Z) Confirmed the setup-start SQLite warning comes from the CLI's top-level import of `@openassist/storage-sqlite` through `apps/openassist-cli/src/lib/growth-status.ts`.
- [x] (2026-03-09 18:23Z) Confirmed Codex currently inherits the generic base-URL prompt in both quickstart and wizard, and provider labels/reasoning choices are still inconsistent with operator expectations.
- [x] (2026-03-09 18:34Z) Confirmed the Codex auth flow currently uses the daemon callback URL by default, which does not match the public Codex login redirect shape used by OpenAI's own Codex flow.
- [x] (2026-03-09 19:06Z) Implemented the CLI/provider/daemon fixes: lazy SQLite loading on non-growth CLI paths, harmonized provider labels, removed Codex base-URL prompts from normal setup flows, added `xhigh` reasoning support, and switched Codex OAuth starts to the localhost callback flow with clearer paste-back guidance.
- [x] (2026-03-09 19:17Z) Updated targeted tests for prompt behavior, reasoning enums, Codex redirect defaults, auth instructions, and the absence of the SQLite warning on `openassist setup` and `openassist auth start`.
- [x] (2026-03-09 19:31Z) Updated root docs, lifecycle docs, provider-interface docs, migration notes, `AGENTS.md`, and `CHANGELOG.md` so the operator story matches the new Codex setup/auth flow.
- [x] (2026-03-09 19:57Z) Fixed the stale docs-truth and wording assertions flushed out by the full merge gate, then reran `pnpm verify:all` successfully.
- [ ] Open the PR, monitor CI/reviews, fix findings, and record the final outcome.

## Surprises & Discoveries

- Observation: the SQLite warning at bare `openassist setup` startup is not caused by the setup hub itself; it is triggered by the CLI importing `apps/openassist-cli/src/lib/growth-status.ts` at process start, and that file imports `@openassist/storage-sqlite` eagerly.
  Evidence: `apps/openassist-cli/src/index.ts` imports `inspectLocalGrowthState` at top level; `apps/openassist-cli/src/lib/growth-status.ts` imports `OpenAssistDatabase` from `@openassist/storage-sqlite`.

- Observation: Codex auth is using `http://127.0.0.1:3344/v1/oauth/<provider>/callback` as the default redirect, but the public OpenAI Codex login flow uses the standard localhost callback shape instead.
  Evidence: the current adapter and daemon code set `redirect_uri` to the daemon callback route, while upstream OpenAI Codex references use `http://localhost:1455/auth/callback`.

- Observation: the problematic SQLite warning on setup startup can be removed without touching daemon/runtime storage behavior at all; it was only a CLI import-shape issue.
  Evidence: after converting `inspectLocalGrowthState()` to a lazy dynamic import, the dedicated CLI regression tests no longer see the `node:sqlite` warning on `openassist setup` or `openassist auth start`, while database-backed growth-state inspection still works in its own tests.

- Observation: the previous Codex OAuth scope list was likely overreaching for the public account-login flow.
  Evidence: the public browser failure reproduced against the old flow, while the standard identity/offline-access scopes align with the public Codex login shape and avoid the unsupported redirect-plus-scope combination.

## Decision Log

- Decision: fix the SQLite-warning issue by removing the eager CLI dependency on `@openassist/storage-sqlite` rather than globally suppressing Node warnings.
  Rationale: the user-visible problem appears before setup interaction begins, and the warning is avoidable on this path by lazy-loading the database code only when growth-state inspection is actually requested.
  Date/Author: 2026-03-09 / Codex

- Decision: keep Codex `baseUrl` support in the underlying provider config for compatibility, but remove it from quickstart and wizard prompts.
  Rationale: Codex should not look like a generic operator-tunable endpoint in the normal setup UX, but removing the property entirely would be a broader compatibility change than this fix requires.
  Date/Author: 2026-03-09 / Codex

- Decision: change the default Codex redirect URI to the standard localhost callback flow and improve the manual paste-back instructions instead of relying on the daemon callback route.
  Rationale: the current browser-side `unknown_error` indicates the redirect is not accepted by the authorization surface, and the localhost callback pattern is the one the public Codex flow uses. Operators on remote VPS hosts can still complete the flow by copying the redirected URL from the browser back into the CLI.
  Date/Author: 2026-03-09 / Codex

- Decision: keep the SQLite fix surgical by lazy-loading storage-backed growth inspection in the CLI instead of suppressing experimental warnings globally.
  Rationale: setup/auth/operator flows should stay quiet by default, but global suppression would hide legitimate warnings in real storage-backed debugging contexts.
  Date/Author: 2026-03-09 / Codex

- Decision: extend OpenAI/Codex reasoning support to `xhigh` everywhere the public operator story exposes the setting.
  Rationale: operator setup/docs must match the actual supported provider parameter set, and the previous `high` ceiling had already become stale relative to the current OpenAI/Codex model behavior.
  Date/Author: 2026-03-09 / Codex

## Outcomes & Retrospective

The implementation now passes the full local merge gate. The branch removes the jarring SQLite warning from the beginner lifecycle hub, fixes the misleading Codex base-URL prompt, harmonizes provider labels, exposes `xhigh` reasoning for OpenAI/Codex, and shifts Codex login to the supported localhost callback flow with explicit headless copy/paste guidance. The last-mile fixes were mostly truth-sync work: one stale lifecycle-route expectation, one stale quickstart summary assertion, and one missing `oauth-redirect.test.ts` entry in `docs/testing/test-matrix.md`. The key lesson is that most of the user-visible friction was not deep runtime complexity; it came from small but high-impact mismatches between the public setup story and the actual low-level defaults/imports in CLI/auth code.

## Context and Orientation

The relevant operator-facing setup behavior lives mostly in `apps/openassist-cli`. The bare lifecycle hub is implemented in `apps/openassist-cli/src/lib/setup-hub.ts`, quickstart in `apps/openassist-cli/src/lib/setup-quickstart.ts`, and the advanced editor in `apps/openassist-cli/src/lib/setup-wizard.ts`. Provider display strings and lifecycle summaries live in `apps/openassist-cli/src/lib/provider-display.ts`, `apps/openassist-cli/src/lib/lifecycle-readiness.ts`, and `apps/openassist-cli/src/lib/setup-summary.ts`.

Provider contracts are defined in `packages/core-types/src/provider.ts`, schema parsing in `packages/config/src/schema.ts`, and route-specific transport logic in `packages/providers-codex/src/index.ts` and `packages/providers-openai/src/index.ts`. The daemon API route that starts and completes OAuth login lives in `apps/openassistd/src/index.ts`, while durable auth flow storage and replay live in `packages/core-runtime/src/runtime.ts` and `packages/storage-sqlite/src/index.ts`.

The SQLite warning issue matters because `node:sqlite` is experimental in Node 22, and importing `@openassist/storage-sqlite` causes Node to print a warning to stderr. That warning is acceptable in a narrow development context but looks broken when it appears right inside the beginner-facing setup menu.

The Codex auth issue matters because the current flow prints an authorization URL, asks the operator to authorize, and then expects the callback URL or code to be pasted back. If the authorization step itself fails in the browser due to an unsupported redirect URI, the rest of the setup flow cannot succeed even though the CLI prompt wording suggests that it should.

## Plan of Work

First, remove the eager SQLite import from the normal CLI startup path. `apps/openassist-cli/src/lib/growth-status.ts` should switch to a lazy `import("@openassist/storage-sqlite")` inside the helper that actually needs the database. This preserves the existing growth-status behavior while preventing bare setup hub startup and other non-growth commands from importing `node:sqlite` at process start.

Next, tighten provider setup UX. In both `apps/openassist-cli/src/lib/setup-quickstart.ts` and `apps/openassist-cli/src/lib/setup-wizard.ts`, Codex should no longer prompt for a base URL. The provider-choice labels should become `OpenAI (API Key)`, `Codex (OpenAI account login)`, `Anthropic (API Key)`, and `OpenAI-compatible`. The shared reasoning-effort type in `packages/core-types/src/provider.ts`, `packages/config/src/schema.ts`, `packages/providers-openai/src/index.ts`, `packages/providers-codex/src/index.ts`, and the wizard prompt helper should add `xhigh` while keeping the default unset behavior intact.

Then, repair the Codex auth route. The default redirect URI for Codex should change from the daemon callback path to the standard localhost callback shape. The cleanest place to do this is the daemon OAuth start route in `apps/openassistd/src/index.ts`, because that keeps CLI quickstart flows and direct `openassist auth start` consistent. Quickstart’s post-start account-link guidance should explain that the browser may land on a localhost callback URL and that the operator should paste that full URL or the code back into the prompt. The direct CLI auth command output should keep graceful browser-open fallback behavior and avoid implying that `--base-url` is the relevant piece of auth state for Codex.

Finally, update lifecycle docs and contributor rules. Root `README.md`, root `AGENTS.md`, `docs/README.md`, `docs/interfaces/provider-adapter.md`, `docs/operations/quickstart-linux-macos.md`, `docs/operations/setup-wizard.md`, `docs/operations/common-troubleshooting.md`, and `CHANGELOG.md` must all describe the adjusted Codex setup/auth flow, the harmonized provider labels, the new `xhigh` option, and the absence of the stray SQLite warning on setup startup.

## Concrete Steps

Work from the repository root `c:\Users\dange\Coding\openassist`.

1. Edit the CLI growth-status helper to lazy-load SQLite-backed storage only when growth status is actually inspected.
2. Edit quickstart and wizard provider prompts to remove the Codex base-URL question, harmonize provider labels, and extend reasoning-effort choices to include `xhigh`.
3. Edit provider contracts/schema/adapters so `reasoningEffort` supports `xhigh` for both OpenAI and Codex, and keep omission-on-unsupported-model behavior intact.
4. Edit the daemon OAuth start route and setup/account-link guidance so Codex uses the supported localhost callback redirect and clearer paste-back instructions.
5. Add or refresh tests under `tests/vitest/` and `tests/node/` for the new prompt behavior, redirect defaults, and reasoning enum values.
6. Update the required docs and this ExecPlan as progress is made.
7. Run `pnpm verify:all`.

Expected verification transcript after the implementation:

    PS C:\Users\dange\Coding\openassist> pnpm verify:all
    ...
    Test Files  ... passed
    ...
    Done in ...

## Validation and Acceptance

Acceptance requires both automated proof and operator-visible proof.

Automated proof means:

- `pnpm verify:all` passes.
- New or updated tests demonstrate that quickstart and wizard do not prompt for a Codex base URL.
- New or updated tests demonstrate that OpenAI and Codex accept `xhigh` in config and transport mapping.
- New or updated tests demonstrate that Codex OAuth start defaults to the supported localhost callback URI and that setup/auth instructions mention pasting the returned callback URL or code.
- New or updated tests demonstrate that the growth-status helper still works when invoked but no longer forces bare setup hub startup to import SQLite eagerly.

Operator-visible proof means:

- Running `openassist setup` shows the numbered setup hub without the SQLite experimental warning being printed into the prompt.
- Choosing Codex in quickstart shows no base-URL prompt.
- The provider menu text reads consistently, including `Anthropic (API Key)`.
- The reasoning-effort picker for OpenAI and Codex includes `xhigh`.
- Starting Codex account login prints an authorization URL that uses the localhost callback shape and clear instructions for pasting the callback URL or code back into the CLI.

## Idempotence and Recovery

These edits are safe to apply incrementally. If a test fails partway through, rerun `pnpm verify:all` after each fix; no schema migration or destructive storage change is planned. The Codex auth redirect change is additive in the sense that it affects new login starts, not existing stored linked accounts. If a partially edited setup flow becomes inconsistent during development, discard only the current branch changes with normal Git editing discipline; do not mutate operator state outside the repository.

## Artifacts and Notes

The user-reported failure that drives the OAuth redirect fix:

    Authorization URL:
    https://auth.openai.com/oauth/authorize?...&redirect_uri=http%3A%2F%2F127.0.0.1%3A3344%2Fv1%2Foauth%2Fcodex-main%2Fcallback...

    Authentication Error
    An error occurred during authentication (unknown_error).

The key contrast is that the current flow uses the daemon callback URL, while the public Codex login flow uses the standard localhost callback path.

Revision note (2026-03-09): created the initial plan after auditing the current setup/Codex code paths and identifying the likely root causes for the SQLite warning, Codex prompt regressions, and unsupported auth redirect.
