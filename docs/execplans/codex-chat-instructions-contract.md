# Codex Chat Instructions Contract Fix

## Summary

Align the Codex chat transport with the current upstream backend contract now that auth is healthy. The remaining live VPS failure is not login or refresh; it is the Codex backend rejecting our `/responses` payload because it requires a top-level `instructions` field. This plan adds the missing instructions contract, keeps auth and refresh behavior intact, improves upstream error surfacing, and updates docs/tests/governance in the same PR.

## Progress

- [x] Audited the current Codex adapter and confirmed it sends `Authorization`, `ChatGPT-Account-ID`, and `session_id` but not top-level `instructions`.
- [x] Reproduced the live VPS failure directly against the stored Codex auth handle and captured the upstream response body: `400 {"detail":"Instructions are required"}`.
- [x] Added a vendored Codex baseline instructions asset plus adapter logic that lifts system messages into top-level `instructions` and removes them from the normal `input` array.
- [x] Expanded Codex upstream error parsing to surface `detail`-based failures with safe request ids while preserving HTTP status.
- [x] Updated root docs, provider docs, troubleshooting docs, `AGENTS.md`, and `CHANGELOG.md` to match the new Codex transport truth.
- [x] Ran the full local merge gate (`pnpm verify:all`) after the adapter/test/doc changes and got a clean pass on the branch.

## Surprises & Discoveries

- Live Codex auth is healthy on the VPS: linked account count, chat-ready auth state, service health, and channel health all reported cleanly before the chat failure.
- The upstream Codex backend returns a structured JSON error with `detail`, but the old adapter only looked at `message` or `error`, which hid the real cause behind a generic runtime failure.
- The missing `instructions` field is independent of the previously fixed `session_id` header issue. Both are required for the current backend contract.
- The existing runtime regression test that checks “healthy auth but provider request failed” remained useful and only needed the newer Codex request-failure wording.

## Decision Log

- Decision: keep the current Codex auth persistence and refresh model unchanged in this PR.
  - Rationale: auth is healthy and refresh-capable on the live VPS; the current blocker is the chat payload contract, not the auth lifecycle.
  - Date/Author: 2026-03-10 / Codex

- Decision: vendor an OpenAssist-authored Codex baseline instructions asset instead of fetching upstream prompt content dynamically at runtime.
  - Rationale: the provider request must be deterministic, offline-safe, and bounded; the runtime should not depend on external prompt fetches.
  - Date/Author: 2026-03-10 / Codex

- Decision: lift all `system` messages into top-level Codex `instructions` and keep only non-system messages in the normal `input` array.
  - Rationale: this keeps the request coherent and avoids duplicating system intent between `instructions` and standard message input.
  - Date/Author: 2026-03-10 / Codex

- Decision: preserve HTTP status on Codex request failures while surfacing `detail`, `message`, or `error` text when available.
  - Rationale: runtime refresh/auth classification still needs the real status code, but operator-facing errors need the upstream detail to be actionable.
  - Date/Author: 2026-03-10 / Codex

## Outcomes & Retrospective

- `packages/providers-codex` now sends top-level `instructions` on every Codex `/responses` request by combining the vendored Codex baseline with the bounded OpenAssist runtime guidance already present in system messages.
- Codex `system` role messages are now lifted into `instructions` and removed from the normal `input` array, so system intent is not duplicated across two payload surfaces.
- Codex upstream error parsing now reads `detail`, `message`, or `error` fields and preserves safe request ids plus the real HTTP status for runtime auth/refresh classification.
- Targeted adapter and runtime suites now cover the new instructions contract, header preservation, `detail`-based error surfacing, and the existing “healthy auth but provider request failed” operator-diagnostic path.
- Evidence:
  - Local targeted tests:
    - `pnpm exec vitest run tests/vitest/provider-codex-auth.test.ts`
    - `pnpm exec tsx --test tests/node/runtime-codex-auth.test.ts`
  - Full local gate:
    - `pnpm verify:all`
