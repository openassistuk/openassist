# Outbound Channel Delivery: Files and Bounded Operator Notifications

This ExecPlan is a living document and follows `.agents/PLANS.md`.

## Purpose / Big Picture

Add two linked capabilities:

1. same-chat artifact delivery so Telegram, Discord, and WhatsApp can return generated files through the active chat instead of only naming a local path
2. bounded proactive notify so OpenAssist may send a relevant targeted message or file only to specific approved operator IDs

The product truth must stay explicit: same-chat file replies depend on the active session plus truthful channel outbound-file support, while proactive notify adds recipient allow-list checks on top.

## Progress

- [x] 2026-03-11 15:36+00:00 Audited the existing outbound path, runtime tool loop, channel adapter contract, recovery queue, and status surfaces. Confirmed that outbound delivery was text-only and that proactive sends had no bounded runtime-owned recipient model.
- [x] Implemented the shared outbound attachment contract, runtime staging path, and recovery cleanup hook for terminal send failure.
- [x] Added the runtime-owned `channel.send` tool contract, policy wiring, tool router path, and bounded reply-vs-notify runtime handling.
- [x] Updated Telegram, Discord, and WhatsApp adapters to send outbound attachments and support bounded direct-recipient delivery where configured.
- [x] Updated runtime awareness, `/status`, `/capabilities`, and tools-status reporting so delivery boundaries are surfaced alongside the existing service boundary.
- [x] Updated the required operator and contributor docs plus the changelog for the outbound delivery model.
- [x] 2026-03-11 17:22+00:00 Rebuilt the workspace and reran the full local code-test slice: `pnpm -r build`, `pnpm test:vitest`, and `pnpm test:node` all passed after the notify audit/session fix and runtime status assertion updates.
- [x] 2026-03-11 17:37+00:00 Reran the full local repository gate on the final tree: `pnpm verify:all` passed after cleaning the stray test-debug artifacts from the worktree.
- [ ] Open/update the PR and follow CI plus review through merge.

## Surprises & Discoveries

- Observation: same-chat file replies and proactive direct-recipient sends need different authorization checks even though they share one runtime-owned delivery tool.
  Evidence: same-chat artifact return only needs a callable full-access delivery path plus truthful outbound-file support, while notify additionally needs an approved operator sender, a listed recipient, and on Discord an `allowedDmUserIds` overlap.
- Observation: outbound attachment cleanup needed to exist in both the immediate send path and the exhausted-retry path.
  Evidence: without a per-job permanent-failure hook in the recovery worker, staged outbound files could survive after dead-lettering.
- Observation: the shared renderer must keep direct-recipient routing on every chunk even when attachments and reply references are first-chunk-only.
  Evidence: chunked notify delivery would otherwise lose its target recipient after chunk one.
- Observation: bounded notify delivery needs a durable target-session row before outbound audit events are inserted.
  Evidence: the first notify integration pass hit a SQLite foreign-key failure during `recordOutbound` because the notify target conversation had no session row yet; fixing `recordOutbound()` to `ensureSession()` first resolved the issue and kept notify audit durable.

## Decision Log

- Decision: keep one runtime-owned `channel.send` tool with `mode="reply"` and `mode="notify"`.
  Rationale: the staging, retry, audit, and channel-routing logic is shared, while the runtime can still enforce mode-specific authorization rules.
- Decision: reuse `channels[*].settings.operatorUserIds` as the only proactive recipient allow-list.
  Rationale: the repo already treats these IDs as the explicit approved-operator identity surface; a second recipient list would create drift and more operator confusion.
- Decision: allow same-chat file replies when the current session can call the runtime delivery path, but require an approved operator sender plus a listed recipient for proactive notify.
  Rationale: returning a requested artifact in the current chat is the normal completion path, while cross-chat or proactive delivery is the higher-risk action that must stay tightly bounded.

## Outcomes & Retrospective

Implementation is in place across core types, runtime delivery, recovery, awareness, docs, and the three channel adapters. The local build plus full vitest and node integration suites are now green after the latest fixes, and the critical behaviors are covered directly:
- same-chat file reply succeeds and returns a staged attachment
- notify mode is rejected for non-approved senders
- notify mode succeeds only for an approved sender targeting a listed recipient

The remaining work is now purely release follow-through: open/update the PR, clear CI, and resolve review threads to merge. The local repo gate is complete and green on the final tree.
