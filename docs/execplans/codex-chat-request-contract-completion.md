# Codex Chat Request Contract Completion

## Summary

Finish the Codex linked-account chat transport alignment after live VPS diagnosis showed that auth, service, and Telegram were all healthy but the upstream Codex backend was still rejecting our `/responses` payload. This follow-up keeps the current auth and refresh model intact and fixes the remaining request-contract mismatch in the provider adapter, tests, docs, and governance surfaces.

## Progress

- [x] Reproduced the current live failure directly on the VPS and captured the upstream detail: `Store must be set to false.`
- [x] Compared the local Codex adapter payload with the current upstream Codex client contract and confirmed the adapter was still sending an OpenAI-style body instead of the upstream-aligned `/responses` request fields.
- [x] Updated the Codex adapter to send the remaining required fields (`tool_choice`, `parallel_tool_calls`, `store`, and `prompt_cache_key`) while removing unsupported OpenAI-style extras from the linked-account request body.
- [x] Expanded the Codex adapter tests so the request body is pinned more tightly and future drift is caught before merge.
- [x] Updated docs, `AGENTS.md`, `CHANGELOG.md`, and this ExecPlan in the same change.

## Surprises & Discoveries

- The previous fix that added top-level `instructions` and `session_id` was necessary but not sufficient. The live backend still enforced `store=false`, which exposed that our direct Codex transport was still carrying too much OpenAI Responses API baggage.
- The upstream Codex client’s request contract is stricter than the generic OpenAI linked-account request we started from: it expects explicit `tool_choice`, `parallel_tool_calls`, `store`, and `prompt_cache_key` semantics rather than silently tolerating a loosely shaped body.
- The live VPS remained useful even without additional operator actions: once auth was healthy and the daemon logs showed `Store must be set to false.`, the remaining mismatch could be narrowed down by comparing our payload shape against the upstream Codex client contract.

## Decision Log

- Decision: keep the current Codex auth persistence and refresh model unchanged in this PR.
  - Rationale: auth is healthy and chat-ready on the live VPS. The remaining failure is the request body contract, not auth lifecycle.
  - Date/Author: 2026-03-10 / Codex

- Decision: align the local Codex transport with the upstream `/responses` request fields instead of adding another one-off flag.
  - Rationale: the live issue proved the adapter was still too OpenAI-shaped overall. A field-by-field alignment is less fragile than chasing one missing field at a time.
  - Date/Author: 2026-03-10 / Codex

- Decision: remove Codex request extras that are not part of the upstream linked-account `/responses` contract (`temperature`, `max_output_tokens`, `metadata`) instead of trying to keep them opportunistically.
  - Rationale: correctness matters more than preserving unsupported optional knobs on a broken route, and the provider test suite now pins that discipline explicitly.
  - Date/Author: 2026-03-10 / Codex

## Outcomes & Retrospective

- Codex linked-account chat requests now use a fuller upstream-aligned `/responses` contract:
  - top-level `instructions`
  - `session_id`
  - `ChatGPT-Account-ID`
  - `tool_choice="auto"`
  - `parallel_tool_calls=true`
  - `store=false`
  - prompt-cache key derived from the canonical runtime session id
- The adapter no longer sends generic OpenAI-style extras that are outside the current Codex linked-account request contract.
- Provider tests now pin the request body more tightly so future drift shows up immediately in local verification.
- Evidence:
  - `pnpm exec vitest run tests/vitest/provider-codex-auth.test.ts`
  - `pnpm exec tsx --test tests/node/runtime-codex-auth.test.ts`
