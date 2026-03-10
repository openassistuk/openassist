# Codex Chat Request Contract Completion

## Summary

Finish the Codex linked-account chat transport alignment after live VPS diagnosis showed that auth, service, and Telegram were all healthy but the upstream Codex backend was still rejecting our `/responses` payload. This follow-up keeps the current auth and refresh model intact and fixes the remaining request-contract mismatch in the provider adapter, tests, docs, and governance surfaces.

## Progress

- [x] Reproduced the current live failure directly on the VPS and captured the upstream detail: `Store must be set to false.`
- [x] Compared the local Codex adapter payload with the current upstream Codex client contract and confirmed the adapter was still sending an OpenAI-style body instead of the upstream-aligned `/responses` request fields.
- [x] Updated the Codex adapter to send the remaining required fields (`tool_choice`, `parallel_tool_calls`, `store`, and `prompt_cache_key`) while removing unsupported OpenAI-style extras from the linked-account request body.
- [x] Expanded the Codex adapter tests so the request body and returned event-stream parsing are pinned more tightly and future drift is caught before merge.
- [x] Re-ran the branch directly on the live VPS and confirmed a real runtime smoke request now returns `codex smoke ok` through the normal outbound envelope path.
- [x] Updated docs, `AGENTS.md`, `CHANGELOG.md`, and this ExecPlan in the same change.

## Surprises & Discoveries

- The previous fix that added top-level `instructions` and `session_id` was necessary but not sufficient. The live backend still enforced `store=false`, which exposed that our direct Codex transport was still carrying too much OpenAI Responses API baggage.
- The upstream Codex client’s request contract is stricter than the generic OpenAI linked-account request we started from: it expects explicit `tool_choice`, `parallel_tool_calls`, `store`, and `prompt_cache_key` semantics rather than silently tolerating a loosely shaped body.
- The live VPS remained useful even without additional operator actions: once auth was healthy and the daemon logs showed `Store must be set to false.`, the remaining mismatch could be narrowed down by comparing our payload shape against the upstream Codex client contract.
- After aligning those request fields, the live backend immediately exposed the next contract requirement: `stream` must remain `true`, and the adapter must consume the upstream SSE event stream instead of assuming a plain JSON response body.

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

- Decision: keep `stream=true` for Codex and add a local SSE-to-ChatResponse fold instead of forcing a non-streaming HTTP response shape.
  - Rationale: the live backend accepts the fully aligned request with `stream=true` and returns a standard Codex event stream; consuming that stream locally is the simplest way to stay aligned with the real contract while keeping OpenAssist's channel/runtime contract unchanged.
  - Date/Author: 2026-03-10 / Codex

## Outcomes & Retrospective

- Codex linked-account chat requests now use a fuller upstream-aligned `/responses` contract:
  - top-level `instructions`
  - `session_id`
  - `ChatGPT-Account-ID`
  - `tool_choice="auto"`
  - `parallel_tool_calls=true`
  - `store=false`
  - `stream=true`
  - prompt-cache key derived from the canonical runtime session id
- The adapter no longer sends generic OpenAI-style extras that are outside the current Codex linked-account request contract, and it now folds the returned Codex event stream back into the normal bounded OpenAssist `ChatResponse`.
- Provider tests now pin both the request body and SSE response handling so future drift shows up immediately in local verification.
- Evidence:
  - `pnpm exec vitest run tests/vitest/provider-codex-auth.test.ts`
  - `pnpm exec tsx --test tests/node/runtime-codex-auth.test.ts`
  - `pnpm verify:all`
  - Live VPS runtime smoke on `165.232.109.178` after updating to branch `fix/codex-chat-request-contract`, returning a fake-channel outbound reply of `codex smoke ok`
