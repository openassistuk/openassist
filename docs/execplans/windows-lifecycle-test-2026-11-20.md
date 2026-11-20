# Remove durable I/O from the malformed-selector test matrix

This living ExecPlan follows `.agents/PLANS.md`. Keep Progress, Surprises & Discoveries, Decision Log and Outcomes & Retrospective current. The maintainer requested fixing the timing-sensitive Windows lifecycle test without increasing its timeout.

## Purpose / Big Picture

Make malformed saved-source-selector rejection independent of repeated disk-flush latency while preserving all fourteen selector/record combinations, real validation, the prohibition on network requests and sanitized cache persistence. Keep production durability, the five-second test deadline, coverage thresholds and published 0.2.7 assets unchanged.

## Progress

- [x] (2026-11-20) Inspect the failed main CI 44791488825 attempt 1, existing lifecycle fixtures, update-notification/discovery code and atomic writer. Ordinary Vitest passed; coverage hit five seconds in the malformed-selector matrix. Its unchanged Windows retry passed, without establishing the underlying host cause.
- [x] (2026-11-20) Measure the original focused test with a temporary fsync spy: fourteen combinations perform twenty-eight synchronous disk flushes inside one test body. Retain the probe result under ignored `.git/windows-lifecycle-test-2026-11-20`; remove instrumentation from the final patch.
- [x] (2026-11-20) Replace repeated fixture persistence with scoped install-state boundary spies for all fourteen combinations. Assert each unavailable result, exact sanitized cache payload and no fetch; retain both real saved-record shapes in a separate persistence case with raw cache and record-preservation checks.
- [x] (2026-11-20) Temporary probes measure zero matrix-body disk flushes and four in the separate real-file case. A negative control bypassing validateSourceRef fails on fetch being called; restore production bytes exactly. All forty-four targeted lifecycle/discovery cases pass after restoration, and all probe code is removed.
- [x] (2026-11-20) All forty-four targeted lifecycle/discovery cases and eleven docs-truth contracts pass. Complete pnpm verify:all passes on implementation commit 9ee7f5a: 691 Vitest passes/one existing skip, 267 Node passes/six existing platform skips, unchanged coverage thresholds and zero production/full audits.
- [x] (2026-11-20) Final [PR #102](https://github.com/openassistuk/openassist/pull/102) head f80d344 passes [CI 44797402143](https://github.com/openassistuk/openassist/actions/runs/44797402143), [CodeQL 44797401984](https://github.com/openassistuk/openassist/actions/runs/44797401984), [native/signing 44797401988](https://github.com/openassistuk/openassist/actions/runs/44797401988) and [live macOS 44797402064](https://github.com/openassistuk/openassist/actions/runs/44797402064) on attempt 1. All thirteen applicable PR checks pass, including Windows quality/coverage without a retry; PR analysis 2217041700 has zero results/errors.
- [x] (2026-11-20) Maintainer merges #102 at 19:14:40 UTC as `34230364b20ca9ca36c68181ea1dcb7b25c17aef`. [Post-merge CI 44800330198](https://github.com/openassistuk/openassist/actions/runs/44800330198) and [CodeQL 44800330076](https://github.com/openassistuk/openassist/actions/runs/44800330076) pass attempt 1; Windows passes ordinary/coverage runs, and exact-main analysis 2217170564 has zero results/errors.
- [x] (2026-11-20) Fresh exact-main [CI 44813750458](https://github.com/openassistuk/openassist/actions/runs/44813750458) again passes all jobs on attempt 1, including all thirty Windows lifecycle cases in ordinary and coverage runs. Final release acceptance includes all four fresh scheduled workflows and all ten jobs without retries, linked in the [release plan](stable-0.2.7-release.md#artifacts-and-notes).

## Surprises & Discoveries

The matrix did not just validate seven strings. Each string was tested through both active-source and legacy tracked-ref records, with one durable installation-record write and one durable unavailable-cache write per combination. A temporary spy measured twenty-eight fsync calls. Production validation itself runs before the network request; the bulk of the test's filesystem work is unnecessary for this matrix.

JSON persistence omits an undefined active record. The real-file assertion therefore compares the complete normalized record before and after the check, rather than requiring an absent JSON property to exist with value undefined. This preserves both saved formats and verifies that checking updates does not rewrite the selector.

## Decision Log

Decision (2026-11-20): mock only install-state loading and cache persistence for the combinatorial rejection test, preserving real checkForUpdate/discoverSource/validateSourceRef behavior and the fetch prohibition. Retain a separate real-file case for both active and legacy records, asserting status-only cache contents and unchanged saved selectors. This removes the I/O multiplier instead of increasing time budgets, adding retries or disabling coverage.

## Outcomes & Retrospective

The matrix's repeated disk flushes are eliminated, with real persistence retained separately. All forty-four targeted lifecycle/discovery cases pass. The bypassed-validation negative control fails on the expected network-request assertion, and restored production code passes. Testing guidance and the Unreleased changelog describe this source-only test repair. The full local quality/coverage/audit gate passes on 9ee7f5a: Vitest statements/branches/functions/lines 84.64/76.42/87.32/85.57%; Node 79.93/73.73/85.60/79.93%; zero audits. Final PR-head checks, reviewed merge delivery, post-merge CI/full CodeQL and the later fresh scheduled CI all pass on attempt 1. Windows ordinary/coverage runs each pass 691 tests with one existing skip, including all thirty lifecycle cases. All repair milestones are complete. No production code, dependency, workflow, timeout or release asset change was made.

## Context and Orientation

`tests/vitest/lifecycle-engine.test.ts` uses a disposable operator home and real installation-state/cache files for lifecycle integration. `apps/openassist-cli/src/lib/update-notifications.ts` loads saved state, calls real source discovery, catches invalid selections and persists a versioned status-only cache. `apps/openassist-cli/src/lib/install-state.ts` atomically writes JSON with fsync and rename. `apps/openassist-cli/src/lib/update-discovery.ts` validates a selector before transport. Existing afterEach cleanup restores every spy and removes the disposable home.

## Plan of Work

The existing fourteen-input matrix was retained, replacing its repeated installation-record writes with a loadInstallState spy and capturing atomicWriteJson calls. Each combination asserts unavailable results, the exact sanitized cache contract and no fetch. A separate real-file case covers both saved-record shapes with a representative malformed selector, actual cache reading and original-record preservation. The existing testing guide and Unreleased changelog were updated without changing operator behavior or release availability.

## Milestones

The first milestone measured the old matrix's twenty-eight flushes. The second removed those flushes while retaining all selector/record combinations and real-file integration, demonstrated by zero/four-flush probes and the failing validation-bypass control. The third passed the complete local gate and actual-head hosted Windows coverage on the first attempt, followed by reviewed merge delivery and two successful first-attempt main CI runs. All three milestones are complete. Final remote results were recorded in PR #102 Validation and are consolidated here at the maintainer's request.

## Concrete Steps

Work in `C:\Users\dange\Coding\openassist` with Node >=24.22.3 <25 and pnpm 12.21.0. Logs and temporary probes belong under `.git/windows-lifecycle-test-2026-11-20`.

    pnpm exec vitest run tests/vitest/lifecycle-engine.test.ts tests/vitest/update-discovery.test.ts
    pnpm exec tsx --test tests/node/cli-docs-truth.test.ts
    git diff --check
    pnpm verify:all

Temporary fsync probes demonstrated zero disk flushes in the matrix body and four in the separate real-file test, then were removed. Temporarily bypassing source-selector validation proved the fetch assertion fails; production code was restored immediately. Actual Windows quality/coverage passed on the final PR head and both subsequent main runs without retries, satisfying hosted acceptance.

## Validation and Acceptance

All seven malformed selectors must still exercise both active-source and fallback tracked-ref paths through the real validation functions. Every matrix result must be unavailable and every cache write status-only, with no fetch. The real-file case must load both record shapes and inspect the actual sanitized cache while preserving the original selector. The existing five-second timeout and all quality/coverage/audit gates remain unchanged. Negative controls must fail and the restored complete checks must pass.

## Idempotence and Recovery

The repair was implemented on `codex/windows-lifecycle-test-io` from clean main 83783b2 and merged through #102 as 3423036. Keep spies local to the existing test cleanup and retain real durability tests. All temporary probes/mutations were restored exactly. Do not rebuild, retag or replace signed v0.2.7 assets; this is a source test-maintenance change.

## Artifacts and Notes

Original failure: Windows job 136480008137 in main CI 44791488825 attempt 1, coverage phase at 18:23:11 UTC, existing five-second test deadline. The original focused fsync count is twenty-eight. Earlier unchanged retry/local success is historical evidence, not proof of the proposed repair.

Final reviewed PR head: `f80d3441f9dcd208169fc961832b8fd817cc3f3e`; merge commit: `34230364b20ca9ca36c68181ea1dcb7b25c17aef`. [PR CI](https://github.com/openassistuk/openassist/actions/runs/44797402143), [post-merge CI](https://github.com/openassistuk/openassist/actions/runs/44800330198) and [fresh main CI](https://github.com/openassistuk/openassist/actions/runs/44813750458) all pass Windows ordinary tests and coverage on attempt 1 without retries or a timeout increase. Finished main logs confirm all thirty lifecycle cases pass in both modes and both dependency audits are zero. These exact-commit runs establish completed hosted acceptance separately from the original unchanged retry and immutable v0.2.7 publication.

## Interfaces and Dependencies

No production API or dependency change. Use existing Vitest vi.spyOn boundaries and existing real disk fixtures; production atomicWriteJson/fsync behavior remains untouched.

Revision note (2026-11-20): record measured I/O, the authorized targeted repair and explicit security/durability/timeout acceptance criteria before validation.

Revision note (2026-11-20): record zero/four-flush measurements, real saved-record/cache coverage, the failing validation-bypass control and forty-four passing targeted cases before the full quality gate.

Revision note (2026-11-20): record complete local verification/coverage/audit evidence and the remaining first-attempt hosted Windows gate before publishing the final reviewable head.

Revision note (2026-11-20): close the completed PR-head, reviewed merge and first-attempt main verification milestones with final green links. Retain the original timeout and unchanged retry as historical evidence and link the completed release-wide scheduled acceptance.
