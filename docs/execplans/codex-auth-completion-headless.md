# Codex Auth Completion and Headless UX Fix

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document must be maintained in accordance with `.agents/PLANS.md`.

## Purpose / Big Picture

After this change, Codex account login works reliably on headless or VPS installs without adding a new OAuth grant type. Operators can approve the OpenAI/Codex login in any browser, copy the resulting `http://localhost:1455/auth/callback?...` URL or raw code back into OpenAssist, and complete account linking successfully. When login still fails, OpenAssist should report a clear account-linking problem instead of a generic `status=500` or a misleading service-health failure.

## Progress

- [x] (2026-03-10 12:18Z) Reproduced the current failure path in code review: quickstart and `openassist auth complete` still rely on a narrow callback parser and generic HTTP error handling, while the Codex provider still requires `id_token` too early.
- [x] (2026-03-10 12:24Z) Added the shared callback/code parser and the additive `openassist auth complete --callback-url ...` path in the CLI, quickstart, and integration coverage.
- [x] (2026-03-10 12:26Z) Relaxed Codex token completion and refresh handling so usable access-token responses can still complete safely when `id_token` or exchanged API-key fields are missing.
- [x] (2026-03-10 12:27Z) Replaced generic daemon `500` OAuth failures with sanitized, operator-facing auth error classification and propagated those messages through CLI auth and quickstart.
- [x] (2026-03-10 12:43Z) Updated quickstart/manual auth UX copy plus the required README, AGENTS, provider, troubleshooting, migration, and changelog docs to describe the supported localhost/manual-completion path precisely.
- [x] (2026-03-10 12:46Z) Ran the full local gate with `pnpm verify:all` successfully after the CLI typing fix for the shared callback parser.

## Surprises & Discoveries

- Observation: the current setup quickstart already tells operators to paste the full localhost callback URL, but the underlying parser is local to quickstart and only strips outer whitespace.
  Evidence: `apps/openassist-cli/src/lib/setup-quickstart.ts` defines a local `parseOAuthCompletionInput()` that does `rawInput.trim()` and then directly passes the result to `new URL(...)`.

- Observation: daemon OAuth completion still hides the real provider error by converting most failures into a generic `500`.
  Evidence: `apps/openassistd/src/index.ts` currently uses `classifyHttpErrorStatus(message)` and returns either `{ error: "invalid oauth request" }` or `{ error: "internal server error" }`.

- Observation: the current Codex adapter still hard-fails unless code exchange returns both `id_token` and `refresh_token`, which is stricter than the observed live flow and stricter than the official Codex browser-login behavior.
  Evidence: `packages/providers-codex/src/index.ts` currently throws `"Codex login did not return the required id_token and refresh_token"` before it considers whether the upstream response already contains a usable `access_token`.

- Observation: once the shared parser moved into its own file, quickstart still failed the full TypeScript build because `requestJson()` accepted `Record<string, unknown>` and the parsed completion object did not satisfy that type directly.
  Evidence: the first `pnpm verify:all` run failed in `apps/openassist-cli build` with `TS2345` on `setup-quickstart.ts(1130,9)`.

## Decision Log

- Decision: keep the current localhost callback model and add manual callback-URL completion instead of introducing a hosted redirect or device-code flow.
  Rationale: the user explicitly requested that this PR stay within the current Codex/OpenAI localhost callback model. The immediate bug is completion robustness and headless usability, not the OAuth grant type itself.
  Date/Author: 2026-03-10 / Codex

- Decision: make `openassist auth complete --callback-url "<full localhost callback URL>"` an additive interface while preserving `--state` plus `--code`.
  Rationale: operators on remote machines naturally copy the full callback URL from another browser. Scripting and older docs can keep using explicit state/code flags without a breaking change.
  Date/Author: 2026-03-10 / Codex

- Decision: treat a usable OAuth `access_token` as sufficient to complete Codex login when API-key token exchange or `id_token` presence fails.
  Rationale: the current live failure strongly suggests our success criteria are too narrow. OpenAssist should preserve refresh-token handling when available, but it should not fail the entire account-link flow if upstream already returned a usable bearer token.
  Date/Author: 2026-03-10 / Codex

- Decision: keep `ParsedOAuthCompletionInput` assignable to the CLI request body shape instead of widening `requestJson()` globally.
  Rationale: the body-shape issue only belongs to the new shared auth helper. Making the parsed completion type a `Record<string, unknown>` intersection fixes the build without loosening the rest of the CLI request surface.
  Date/Author: 2026-03-10 / Codex

## Outcomes & Retrospective

Implemented and locally verified.

Concrete outcomes:

- Quickstart and `openassist auth complete` now share one parser for full localhost callback URLs and raw codes.
- Codex account completion now accepts wrapped or multiline pasted callback URLs and additive `--callback-url` CLI completion.
- Codex token completion and refresh now tolerate the current live token response shapes when a usable access token is present.
- Daemon and CLI auth failures now surface sanitized account-linking detail instead of a bare `status=500`.
- Quickstart now keeps Codex account-linking failures framed as auth-only problems when the daemon is already healthy.
- Root docs, troubleshooting, migration docs, provider docs, and `AGENTS.md` now all describe the localhost/manual-completion flow consistently.

Verification evidence:

- Targeted auth suites passed:
  - `pnpm exec vitest run tests/vitest/provider-codex-auth.test.ts tests/vitest/setup-quickstart-oauth.test.ts`
  - `pnpm exec tsx --test tests/node/cli-api-surface-coverage.test.ts tests/node/cli-root-commands.test.ts`
- Full local gate passed:
  - `pnpm verify:all`

## Context and Orientation

Codex account login touches three layers in this repository.

The operator-facing setup flow lives in `apps/openassist-cli/src/lib/setup-quickstart.ts` and the CLI auth commands live in `apps/openassist-cli/src/index.ts`. Those files print the authorization URL, read the pasted callback URL or code, and call the daemon HTTP API.

The daemon HTTP API lives in `apps/openassistd/src/index.ts`. It exposes `/v1/oauth/:provider/start`, `/v1/oauth/:provider/complete`, and `/v1/oauth/:provider/status`, and it currently collapses many provider-side failures into generic `400` or `500` responses.

The actual Codex/OpenAI account-login adapter lives in `packages/providers-codex/src/index.ts`. It owns PKCE authorization URL generation, code exchange, token refresh, and the conversion from OAuth tokens into a `ProviderAuthHandle` that the runtime persists and reuses.

In this repository, “manual completion” means the operator approves login in a browser, copies either the full callback URL or the raw authorization code, and pastes it back into OpenAssist. “Headless-friendly” means this flow must work even when the browser is on another machine and nothing useful is listening on `localhost:1455` on the VPS itself.

## Plan of Work

First, extract the callback/code parsing rules into a shared CLI helper so quickstart and `openassist auth complete` behave identically. The helper must accept wrapped callback URLs, embedded newlines, extra whitespace, and raw code strings, and it must return a normalized code/state pair plus the reconstructed callback URL when present.

Second, update the CLI auth surface in `apps/openassist-cli/src/index.ts`. `auth complete` must accept either `--callback-url` or the older `--state` plus `--code` path. The command must surface daemon-provided error text instead of turning every non-2xx response into `Request failed with status X`. `auth start` should print a callback-URL completion example for Codex localhost redirects so the manual flow is obvious on remote hosts.

Third, harden the daemon and provider layers together. `packages/providers-codex/src/index.ts` must stop failing immediately when the live token response is sparser than our original assumption. It should classify upstream token-exchange failures into operator-safe categories, expose safe request IDs when available, and allow fallback to a usable OAuth access token instead of requiring an API-key exchange up front. `apps/openassistd/src/index.ts` must preserve those safe auth errors as sanitized `400` or `502` responses rather than rewriting them to a generic `500`.

Fourth, update quickstart UX and the docs. `apps/openassist-cli/src/lib/setup-quickstart.ts` should make the paste target more obvious, use the shared parser, show the callback-URL completion command, and keep account-link failures framed as auth problems rather than service failures. The required docs in `README.md`, `AGENTS.md`, `docs/README.md`, `docs/interfaces/provider-adapter.md`, `docs/operations/quickstart-linux-macos.md`, `docs/operations/setup-wizard.md`, `docs/operations/common-troubleshooting.md`, `docs/migration/openclaw-import.md`, and `CHANGELOG.md` must describe the exact supported localhost/manual-completion path and not claim a hosted or device-code flow.

## Concrete Steps

From the repository root `c:\Users\dange\Coding\openassist`:

1. Add the shared callback parsing helper and update the CLI/quickstart callers.
2. Patch the Codex provider and daemon OAuth error path together so the operator-facing API becomes truthful before tests are updated.
3. Update tests for provider auth, quickstart OAuth flows, and CLI auth completion.
4. Update docs and this ExecPlan in the same branch.
5. Run:

   `pnpm verify:all`

6. Push the branch and open the PR:

   `git push -u origin fix/codex-auth-completion-headless`

7. Monitor GitHub CI, CodeQL, and review threads until only normal human review remains.

## Validation and Acceptance

Acceptance is behavioral:

- Quickstart with a Codex default provider accepts a pasted full `http://localhost:1455/auth/callback?...` URL and completes account linking without a generic `status=500`.
- `openassist auth complete --provider codex-main --callback-url "<full localhost callback URL>" --base-url ...` succeeds when the daemon returns a valid completion response.
- If upstream token exchange fails, CLI output reports a sanitized auth problem such as invalid or expired code, redirect mismatch, or upstream token-exchange failure instead of generic `internal server error`.
- Quickstart retry output explicitly says the daemon is healthy and the remaining problem is account-link completion.
- `pnpm verify:all` passes.

The new or updated tests must cover:

- Codex provider completion with alternate token shapes
- Codex refresh behavior with sparser refresh responses
- callback-URL parsing with wrapped/multiline input
- CLI callback-URL completion
- sanitized daemon and CLI auth failure output

## Idempotence and Recovery

These edits are safe to apply incrementally on the feature branch. If the provider-side changes initially break auth tests, rerun the targeted auth suites first and then rerun the full `pnpm verify:all` gate after the CLI, daemon, and docs are aligned. No destructive migration is required for this PR because the persisted OAuth account schema already stores access tokens, refresh tokens, token type, and expiry.

## Artifacts and Notes

Expected operator-facing flow after the change:

    Authorization URL:
    https://auth.openai.com/oauth/authorize?...
    Codex login returns to http://localhost:1455/auth/callback after approval.
    If that localhost page cannot load on this host, copy the full URL from the browser address bar and paste it below.
    Manual completion fallback: openassist auth complete --provider codex-main --callback-url "<full callback URL>" --base-url http://127.0.0.1:3344

Expected failure style after the change:

    Account linking still needs attention: Codex account login code is invalid or expired. Start login again. Request ID: req_123

## Interfaces and Dependencies

At the end of this work, these repository interfaces must exist and stay aligned:

- `apps/openassist-cli/src/lib/oauth-completion.ts`
  - shared callback/code parsing and normalization for quickstart and CLI auth completion
- `apps/openassist-cli/src/index.ts`
  - `openassist auth complete` supports `--callback-url`
  - non-2xx OAuth responses surface safe daemon error text
- `apps/openassist-cli/src/lib/setup-quickstart.ts`
  - uses the shared parser
  - presents a clear manual Codex completion prompt and fallback commands
- `apps/openassistd/src/index.ts`
  - preserves sanitized provider OAuth failures as actionable HTTP responses
- `packages/providers-codex/src/index.ts`
  - accepts current live token response shapes safely
  - preserves refresh handling when available
  - keeps secrets and raw token bodies out of thrown operator messages

Revision note: This ExecPlan was created before the implementation patches landed and will be updated alongside the code, tests, docs, and review follow-ups until the PR is merge-ready.
