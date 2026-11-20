# Remove durable I/O from the malformed-selector test matrix

This living ExecPlan follows `.agents/PLANS.md`. Keep Progress, Surprises & Discoveries, Decision Log and Outcomes & Retrospective current. The maintainer requested fixing the timing-sensitive Windows lifecycle test without increasing its timeout.

## Purpose / Big Picture

Make malformed saved-source-selector rejection independent of repeated disk-flush latency while preserving all fourteen selector/record combinations, real validation, the prohibition on network requests and sanitized cache persistence. Keep production durability, the five-second test deadline, coverage thresholds and published 0.2.7 assets unchanged.

## Progress

- [x] (2026-11-20) Inspect the failed main CI 44791488825 attempt 1, existing lifecycle fixtures, update-notification/discovery code and atomic writer. Ordinary Vitest passed; coverage hit five seconds in the malformed-selector matrix. Its unchanged Windows retry passed, without establishing the underlying host cause.
- [x] (2026-11-20) Measure the original focused test with a temporary fsync spy: fourteen combinations perform twenty-eight synchronous disk flushes inside one test body. Retain the probe result under ignored `.git/windows-lifecycle-test-2026-11-20`; remove instrumentation from the final patch.
- [x] (2026-11-20) Replace repeated fixture persistence with scoped install-state boundary spies for all fourteen combinations. Assert each unavailable result, exact sanitized cache payload and no fetch; retain both real saved-record shapes in a separate persistence case with raw cache and record-preservation checks.
- [x] (2026-11-20) Temporary probes measure zero matrix-body disk flushes and four in the separate real-file case. A negative control bypassing validateSourceRef fails on fetch being called; restore production bytes exactly. All forty-four targeted lifecycle/discovery cases pass after restoration, and all probe code is removed.
- [ ] Pass targeted lifecycle/discovery checks, the unchanged full quality/coverage/audit gate and actual-head hosted Windows coverage; review final changes.

## Surprises & Discoveries

The matrix did not just validate seven strings. Each string was tested through both active-source and legacy tracked-ref records, with one durable installation-record write and one durable unavailable-cache write per combination. A temporary spy measured twenty-eight fsync calls. Production validation itself runs before the network request; the bulk of the test's filesystem work is unnecessary for this matrix.

JSON persistence omits an undefined active record. The real-file assertion therefore compares the complete normalized record before and after the check, rather than requiring an absent JSON property to exist with value undefined. This preserves both saved formats and verifies that checking updates does not rewrite the selector.

## Decision Log

Decision (2026-11-20): mock only install-state loading and cache persistence for the combinatorial rejection test, preserving real checkForUpdate/discoverSource/validateSourceRef behavior and the fetch prohibition. Retain a separate real-file case for both active and legacy records, asserting status-only cache contents and unchanged saved selectors. This removes the I/O multiplier instead of increasing time budgets, adding retries or disabling coverage.

## Outcomes & Retrospective

The matrix's repeated disk flushes are eliminated, with real persistence retained separately. All forty-four targeted lifecycle/discovery cases pass. The bypassed-validation negative control fails on the expected network-request assertion, and restored production code passes. Testing guidance and the Unreleased changelog describe this source-only test repair. Full quality/coverage/audit and hosted Windows verification remain pending. No production code, dependency, workflow, timeout or release asset change is made.

## Context and Orientation

`tests/vitest/lifecycle-engine.test.ts` uses a disposable operator home and real installation-state/cache files for lifecycle integration. `apps/openassist-cli/src/lib/update-notifications.ts` loads saved state, calls real source discovery, catches invalid selections and persists a versioned status-only cache. `apps/openassist-cli/src/lib/install-state.ts` atomically writes JSON with fsync and rename. `apps/openassist-cli/src/lib/update-discovery.ts` validates a selector before transport. Existing afterEach cleanup restores every spy and removes the disposable home.

## Plan of Work

Keep the existing fourteen-input matrix in the lifecycle test, replacing its repeated installation-record writes with a loadInstallState spy and capturing atomicWriteJson calls. Assert unavailable results, the exact sanitized cache contract and no fetch for each combination. Add one real-file case covering both saved-record shapes with a representative malformed selector, actual cache reading and original-record preservation. Update the existing testing guide and Unreleased changelog; do not alter operator behavior or release availability.

## Concrete Steps

Work in `C:\Users\dange\Coding\openassist` with Node >=24.22.3 <25 and pnpm 12.21.0. Logs and temporary probes belong under `.git/windows-lifecycle-test-2026-11-20`.

    pnpm exec vitest run tests/vitest/lifecycle-engine.test.ts tests/vitest/update-discovery.test.ts
    pnpm exec tsx --test tests/node/cli-docs-truth.test.ts
    git diff --check
    pnpm verify:all

Use a temporary fsync probe to demonstrate zero disk flushes in the matrix body and four in the separate real-file test, then remove the probe. Temporarily bypass source-selector validation to prove the fetch assertion fails; restore production code immediately. Require actual Windows quality/coverage on the final PR head without retries before claiming hosted stability evidence.

## Validation and Acceptance

All seven malformed selectors must still exercise both active-source and fallback tracked-ref paths through the real validation functions. Every matrix result must be unavailable and every cache write status-only, with no fetch. The real-file case must load both record shapes and inspect the actual sanitized cache while preserving the original selector. The existing five-second timeout and all quality/coverage/audit gates remain unchanged. Negative controls must fail and the restored complete checks must pass.

## Idempotence and Recovery

Work on `codex/windows-lifecycle-test-io` from clean main 83783b2. Keep spies local to the existing test cleanup and retain real durability tests. Restore temporary probes/mutations exactly, preserving unrelated work. Do not rebuild, retag or replace signed v0.2.7 assets; this is a source test-maintenance change.

## Artifacts and Notes

Original failure: Windows job 136480008137 in main CI 44791488825 attempt 1, coverage phase at 18:23:11 UTC, existing five-second test deadline. The original focused fsync count is twenty-eight. Earlier unchanged retry/local success is historical evidence, not proof of the proposed repair.

## Interfaces and Dependencies

No production API or dependency change. Use existing Vitest vi.spyOn boundaries and existing real disk fixtures; production atomicWriteJson/fsync behavior remains untouched.

Revision note (2026-11-20): record measured I/O, the authorized targeted repair and explicit security/durability/timeout acceptance criteria before validation.

Revision note (2026-11-20): record zero/four-flush measurements, real saved-record/cache coverage, the failing validation-bypass control and forty-four passing targeted cases before the full quality gate.
