# Add explicit context compaction controls


This living ExecPlan follows `.agents/PLANS.md` and extends the release preparation in `docs/execplans/stable-0.2.5-release.md`. Maintain Progress, Surprises & Discoveries, Decision Log and Outcomes & Retrospective. The original scope authorized implementation, documentation, regression tests and local/hosted checks on branch `codex/release-0.2.5` and PR #89. That PR is now merged. The maintainer's subsequent release authorization is tracked separately in the release plan; private settings, live-provider and test-host work remain outside scope. Work as one agent.

## Purpose / Big Picture


Let a chat participant explicitly compact older completed history with `/compact`, even below the normal trigger or when automatic compaction is disabled. Add `[runtime.context].autoCompact`, defaulting to true, and expose it in setup wizard and diagnostics. Turning it off must stop automatic summary creation in admission, overflow repair and background/restarted maintenance while preserving token/byte admission, stored checkpoints, original audit rows and complete current input.

Manual compaction is a bounded, tool-free provider summary for this canonical chat, not a host tool or permanent-memory extraction. It uses existing transactional revision/range/digest checks. One invocation attempts one bounded source chunk; it reports actual checkpoint progress, no eligible history or failure. It does not silently schedule background continuation. Further catch-up requires another explicit command if automatic compaction is off.

## Progress


- [x] (2026-10-18 baseline) Confirm clean existing release branch at `0da17e74fdf81a81f6f7a1c3569ae8ad4768b955`, matching PR #89. Inspect context admission/repair/maintenance, command routing, config contracts, wizard, diagnostics and existing tests.
- [x] (2026-10-18) Implement the default-on switch, bounded explicit command and truthful live diagnostics without changing provider capacities, tools, durability or database compatibility.
- [x] (2026-10-18) Add regressions for disabled automatic paths, explicit below-trigger/off-mode progress, boundaries, failures/cancellation/reopen, command scope/idempotency and wizard/config validation.
- [x] (2026-10-18) Synchronize README, AGENTS, changelog, release notes, docs index and affected context/config/provider/channel/interface/security/lifecycle/testing guidance; reconcile the changed PR scope.
- [x] (2026-10-18 focused checks) Workspace build passes. Latest context/quickstart focused run passes 108 tests; expanded context/lifecycle run passes 96 tests; Node runtime-memory/docs truth passes 23 tests. Quickstart saves/reloads explicit false, wizard covers both choices, manual hydration/reopen keeps raw digests, and rendered command assertions include all channel chunks. Final implementation diff/credential-marker review and whitespace checks pass.
- [x] (2026-10-18 full gate) Commit implementation as `ba8ac12` before clone-based checks and pass `pnpm verify:all`: workflow lint, build/lint/typecheck, 690 Vitest passes/one existing skip, 252 Node passes/six existing skips, unchanged coverage gates and zero production/full dependency findings. Scoped Node coverage passes 126 tests/five existing skips.
- [x] (2026-10-18 handoff preparation) Review the final diff/credentials, retain the existing branch/PR and prepare its updated scope/validation record. Final actual-head hosted CI, PR/full-branch CodeQL, native/signing/live-macOS, separate alert refs and review-comment results are reconciled in [PR #89](https://github.com/openassistuk/openassist/pull/89) at delivery; they are not inferred from earlier metadata checks.
- [x] (2026-10-18 final merge reconciliation) Final reviewed head `45fb88873a21a7c8087dee66d7ba7201c8b20ded` passes CI `39155211970`, PR CodeQL `39155211957`, full-branch CodeQL `39155209839`, native/signing `39155211977` and live macOS `39155211971`, all attempt 1. All thirteen applicable checks pass; three publication-only jobs are expected skips. A final single read-only reviewer finds no actionable issues. Default/branch/PR scanning refs, Dependabot and review threads are empty. PR #89 merges at 19:12:31 UTC as `190727fd21040724ab17e49fd950d6856cafda4f`, with the identical reviewed tree. Exact-main and release certification are recorded separately in the release plan.

## Surprises & Discoveries


Automatic compaction has three paths: foreground budget recovery, provider-overflow repair and durable maintenance. The flag must gate all three, including already queued jobs and an asynchronous summary whose config changes before adoption. Disabling permanent memory is independent and must not disable explicit compaction or admission.

`handleInbound` durably records a command before runtime dispatch; retaining that latest command as the protected current turn lets explicit compaction summarize earlier completed turns without consuming the command as normal inference. Existing occurrence-based reconciliation, source bounds and transactional adoption remain authoritative. Concurrent attempts are resolved by existing checkpoint revision checks rather than overwriting another summary. A per-chat active-turn counter prevents explicit compaction from selecting an unfinished foreground turn; local diagnostics stay available and other chats remain independent. The counter is released in finally blocks.

## Decision Log


Decision (2026-10-18): use optional public contract field `autoCompact`, default true in parsed config and the common default policy. This preserves older programmatic configs and installed settings. Wizard changes the installation-level setting; chat `/compact` does not rewrite configuration or grant permission to other chats.

Decision (2026-10-18): make `/compact` an explicit one-chunk operation available wherever normal channel chat is allowed, with no tool schemas or host actions. Accept no arguments; malformed invocations return usage without provider calls. Preserve canonical chat scope, durable inbound idempotency and shared outbound rendering. The current turn remains protected; a tiny/nonshrinking history may yield no progress or an actionable failure rather than a fabricated success.

Decision (2026-10-18): auto-off prevents new automatic checkpoint adoption and queueing, but keeps bounded tool-result projections, existing checkpoint reuse and admission limits. Oversized requests fail with `/compact`/narrow-input guidance instead of being sent or silently clipped. Manual failures do not enqueue automatic summaries.

## Outcomes & Retrospective


The implementation is merged through PR #89 after its fresh final-head checks and read-only review. Its feature branch is removed locally/remotely after verifying ancestry and the identical merge tree. Publication and availability follow-up now proceed under the maintainer's separate release request and the release plan; the original delivery evidence below is retained.

The separate release continuation is now verified: signed stable v0.2.5 at PR #89/main/tag `190727f` passes exact-main checks, protected publication `39160662895`, independent signatures/digests and all four public-install targets. The [release plan](stable-0.2.5-release.md) records main Windows's initial timing timeout and unchanged-code retry, publication's first-attempt success and the separate availability-docs review. Original implementation evidence below remains historical; live provider/account/channel testing stays unverified.

Implementation, affected docs and regression cases are in place. The workspace build passes after preserving an explicitly present default field in the exported defaults while keeping the public config contract optional. The final focused context/quickstart run passes 108 tests, expanded context/lifecycle passes 96 and runtime-memory/docs truth passes 23, including newline arguments, busy-turn protection, quickstart saved-false persistence and manual raw-bound/hydration cases. Full local `pnpm verify:all` passes on implementation `ba8ac12`: 690 Vitest tests/one existing skip, 252 Node tests/six existing skips, Vitest coverage 84.63% statements / 76.40% branches / 87.27% functions / 85.57% lines and Node product-code coverage 79.93% statements/lines / 73.73% branches / 85.60% functions, with zero production/full dependency findings. Final evidence/restart wording changes are documentation-only and receive focused docs revalidation. The PR Validation record is the final actual-head hosted/scanner/review evidence at handoff, separate from this committed local record. Earlier PR #89 metadata-only checks certify only its previous head. This extension changes runtime/config/command behavior and requires fresh regression and full local/hosted evidence. Public stable was v0.2.4 at that delivery; the separate release reconciliation above records the later verified v0.2.5 publication.

## Context and Orientation


`packages/core-types/src/runtime.ts` contains config/status contracts. `packages/config/src/schema.ts` validates defaults and `context-limits.ts` supplies defaults for programmatic configs. `packages/core-runtime/src/context-manager.ts` owns projection, admission, summarization, repair and maintenance. `runtime.ts` records inbound commands and renders responses through the shared channel path. SQLite context operations already provide compare-and-swap adoption, meaning only the expected prior revision and exact original source digest can be replaced.

`apps/openassist-cli/src/lib/setup-wizard.ts` edits advanced settings and `lifecycle-readiness.ts` renders doctor/lifecycle context diagnostics. Extend existing `tests/vitest/model-context.test.ts` and `tests/node/runtime-memory.test.ts`, avoiding a new test inventory entry. Existing configuration/status/awareness tests cover adjacent contracts.

## Plan of Work


First add the config/status fields and wizard confirmation. Gate foreground and overflow compaction, scheduling, queued maintenance and late adoption on the effective flag. Expose a manual session method that reads bounded history, retains the latest input if hydration is incomplete, reuses reconciliation/projection and calls the same private compactor with an explicit manual mode. Evict stale occupancy after checkpoint progress and surface current auto mode even after config reload.

Then route `/compact` before normal inference; report bounded progress or no eligible history, keep provider exceptions sanitized through the existing operational-error handler and add help/capability/status wording. The command does not change permanent memory, access, host actions or other sessions. Update all affected documentation and release scope, preserving earlier dated evidence and publication limits.

## Concrete Steps


Work in `C:\Users\dange\Coding\openassist` using Node 24.21.0 and pnpm 12.5.1 on the existing branch. Run focused builds and tests, then commit the reviewed implementation before clone-based full verification:

    pnpm build
    pnpm exec vitest run tests/vitest/model-context.test.ts
    pnpm exec tsx --test tests/node/runtime-memory.test.ts tests/node/cli-docs-truth.test.ts
    git diff --check
    pnpm verify:all

Push only the existing branch and update PR #89's description for its final runtime scope. Dispatch full branch `codeql.yml` in addition to automatic PR checks. Record exact-head hosted evidence in the PR validation record so evidence-only commits do not invalidate their own checked head.

## Validation and Acceptance


Omitted `autoCompact` preserves automatic behavior; explicit false is retained by config/wizard and shown in `/status`, `/memory`, health and doctor. With false, normal fitting requests still send; oversized requests block without a summary, overflow repair cannot create a checkpoint and queued/restarted maintenance cannot call a provider. `/compact` can advance a checkpoint below the automatic threshold and with permanent extraction/auto-compaction disabled; duplicate commands, failures, stale digest/revision and cancellation never fabricate progress or alter raw rows. Its source is limited to this chat and one bounded chunk, and it supplies no host tools.

All existing regressions, unchanged coverage thresholds and production/full audits must pass. Recheck actual final-head CI on all three platforms, full/PR CodeQL, native packages, signing contracts and macOS smoke, plus code-scanning refs and unresolved review comments separately. Later main, production/public-install and live-provider checks remain independent.

## Idempotence and Recovery


Use existing durable inbound keys and transactional compaction intent. Preserve original history, audit rows, actor extraction cursors and old checkpoints after failure. Auto-off jobs may settle as deliberate skips rather than retrying forbidden work. A hard process stop can leave pending intent; on restart existing bounded maintenance may resume only when the global automatic switch is on. Ordinary manual failures mark their intent failed and do not queue continuation. A manual command can be retried explicitly after repair; it must not silently repeat completed host actions. Leave private configs, credentials, services, SSH hosts, release assets and signing settings untouched.

## Interfaces and Dependencies


No new production dependency, provider capability, tool privilege or storage schema version is needed. Additive optional config/status fields preserve older programmatic consumers. Keep normal inference and summarization on the common admitted provider-call path, including output/thinking ceilings and immutable prepared-payload accounting.

Revision note (2026-10-18): initialize the authorized manual/automatic-control extension on existing PR #89; distinguish it from the previously verified metadata-only release preparation.

Revision note (2026-10-18, validated delivery): record passing focused/full local gates, shared-chat busy protection, manual hydration/reopen, saved-false quickstart behavior and unchanged audits/coverage. Reconcile final actual-head hosted/scanner/review evidence in PR #89; keep publication and live-provider testing separate.
