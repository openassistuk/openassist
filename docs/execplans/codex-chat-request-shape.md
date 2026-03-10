# Codex Chat Request-Shape Fix

## Summary

Fix the post-login Codex chat failure where `codex-main` is linked and chat-ready but the first real chat request fails upstream with `400 status code (no body)`. The current adapter sends a generic OpenAI-SDK request to the Codex backend without the upstream conversation header derived from the OpenAssist runtime session id.

## Progress

- [x] Reproduced the failure from live VPS diagnostics and confirmed auth, service, channel, and provider selection were healthy.
- [x] Audited the current Codex adapter and confirmed it did not send `session_id` on chat requests.
- [x] Replaced the generic Codex chat path with a direct Codex responses transport that sends the upstream conversation and account headers explicitly.
- [x] Added Codex adapter regression tests for the session header and blank-body upstream `400` failures.
- [x] Added a runtime regression test proving a chat-ready Codex auth handle is not misreported as an auth failure when the provider request itself is rejected.
- [ ] Run `pnpm verify:all`, open the PR, and address any CI or review feedback before marking the branch ready.

## Surprises & Discoveries

- The latest Codex auth/device-code work fixed login and refresh, but the chat path was still using a generic OpenAI-SDK request shape.
- Live diagnostics proved the failure had moved from auth into the actual Codex request contract: `auth status`, `/status`, `doctor`, `service health`, and `channel status` were all healthy while chat still failed.
- The current runtime session id (`<channelId>:<conversationKey>`) is already available on `ChatRequest`, so the missing upstream conversation header is a localized adapter bug, not a broader runtime-model gap.

## Decision Log

- Keep the existing Codex auth model and refresh behavior intact.
- Fix the issue in the Codex adapter transport rather than redesigning auth again.
- Use the Codex responses route directly and send `session_id` plus `ChatGPT-Account-ID` explicitly.
- Treat blank-body upstream `400` responses as provider request failures with safe request ids instead of generic runtime errors.

## Outcomes & Retrospective

- The Codex provider transport now matches the upstream conversation contract more closely and no longer relies on the generic OpenAI SDK fallback behavior for chats.
- Runtime diagnostics now distinguish healthy linked-auth state from upstream Codex request rejection more clearly.
- Docs now explain that Codex auth is stored as encrypted OAuth state in SQLite, refresh is automatic when possible, and a chat-ready auth handle plus a failing request should be debugged as a provider request issue rather than a missing-auth issue.
