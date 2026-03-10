## Summary

Realign the `codex` provider with the current upstream Codex/OpenAI account-login model. Codex login should succeed with a usable ChatGPT/Codex token auth handle, support device-code login for headless installs, keep browser callback/manual paste as a fallback, and stop consuming OAuth flow state before completion actually succeeds.

## Progress

- [x] Audited the current Codex provider/runtime/auth flow against the current upstream Codex account-login model and confirmed the old exchanged-API-key-first assumption was wrong for current upstream behavior.
- [x] Realigned the Codex provider/runtime auth model around chat-ready ChatGPT/Codex bearer-token auth, with exchanged API keys reduced to optional auxiliary metadata.
- [x] Added device-code login as the recommended headless/VPS Codex auth path while keeping browser callback/manual paste completion available as a fallback.
- [x] Changed runtime OAuth flow handling so provider completion failures no longer consume the stored flow state before a successful auth handle is persisted.
- [x] Updated CLI, quickstart, daemon routes, docs, README, AGENTS, changelog, and test coverage together on the same branch.
- [ ] Run the full local merge gate (`pnpm verify:all`), then open the PR and fix any CI or review feedback before calling the branch ready.

## Surprises & Discoveries

- The current upstream Codex login story is broader than our previous localhost-only browser flow: device code is the natural headless/VPS path, while browser callback/manual paste remains a valid fallback for remote hosts.
- Runtime was destructively consuming OAuth flow state before provider completion succeeded, which made one upstream completion failure impossible to retry with the same callback URL/code.
- The Codex provider and the runtime `auth status` diagnostics both needed to redefine “chat-ready” away from “exchanged OpenAI API key exists” and toward “usable Codex/ChatGPT token auth is loaded”.
- The quickstart browser/manual fallback tests were one prompt behind the new flow because browser callback mode now includes an explicit “I have opened or copied the authorization URL” confirmation before the pasted callback URL/code.

## Decision Log

- Keep `type = "codex"` as the dedicated account-login provider route.
- Make ChatGPT/Codex bearer-token auth the primary successful Codex auth state.
- Add device-code login as the recommended headless/VPS Codex path.
- Keep localhost callback/manual paste as a supported fallback path.
- Keep provider/account secrets redacted in logs, status output, docs, and tests.
- Keep `openassist auth complete --callback-url ...` and `--state ... --code ...` both supported so browser/manual fallback stays backward-compatible and scriptable.
- Keep the OpenAI API-key route unchanged; this realignment is Codex-only and does not broaden device-code or account-login behavior for other providers.

## Outcomes & Retrospective

- `packages/providers-codex` now treats code exchange, refresh, and device-code completion as successful when they produce a usable Codex/ChatGPT bearer-token auth handle, without requiring an exchanged OpenAI API key.
- `packages/core-runtime` now looks up OAuth flow state non-destructively first and marks it consumed only after provider completion succeeds and the auth handle is persisted.
- `apps/openassistd` exposes additive Codex-only device-code start/complete routes, and `apps/openassist-cli` exposes `openassist auth start --device-code` with headless-friendly instructions plus redacted auth readiness reporting.
- Quickstart now offers Codex device code first on headless/remote installs, keeps browser callback/manual paste as fallback, and routes Codex auth failures through account-link-specific recovery instead of generic service-failure wording.
- Targeted Codex auth and quickstart suites now cover:
  - callback completion into token-first auth
  - device-code start/complete
  - OAuth state reuse after failed completion
  - redacted auth readiness/status output
  - quickstart device-code-first and browser/manual fallback behavior
