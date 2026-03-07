# Runtime Self-Knowledge Review Follow-Ups

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document must be maintained in accordance with `.agents/PLANS.md`.

## Purpose / Big Picture

After this change, the runtime self-knowledge pass from PR `#7` should be safer and cleaner in three specific places. In-channel `/status` should keep high-level diagnostics available to any sender without leaking full filesystem and install paths to unapproved chat participants. The runtime maintenance contract should distinguish actual protected filesystem paths from descriptive protected lifecycle surfaces. Daemon startup should gather git-based install context with a bounded timeout so a slow or broken repo cannot stall health and status surfaces indefinitely.

The proof should be visible in three places: `/status` should redact full lifecycle paths for unapproved senders while still showing operators the detailed view, the awareness snapshot and provider grounding should expose distinct `protectedPaths` and `protectedSurfaces` entries, and daemon install-context tests should prove git probing times out cleanly and logs a warning instead of hanging.

## Progress

- [x] (2026-03-07 15:07Z) Synced local `main` to merged PR `#7`, re-read the Copilot review comments on the merged PR head, and created follow-up branch `fix/runtime-self-knowledge-review-followups`.
- [x] (2026-03-07 15:14Z) Audited the exact runtime, self-knowledge, install-context, and test surfaces that implement the three flagged behaviors.
- [x] (2026-03-07 15:21Z) Implemented the code fixes for `/status` path redaction, protected maintenance contract cleanup, and bounded git install-context probing.
- [x] (2026-03-07 15:22Z) Updated docs and changelog so the follow-up behavior is documented in the same PR.
- [x] (2026-03-07 15:15Z) Added regression coverage for redacted `/status`, approved-operator detail, protected path/surface separation, and install-context git timeout behavior.
- [x] (2026-03-07 15:16Z) Passed targeted runtime/self-knowledge/install-context suites after correcting the Windows-specific test harness approach.
- [x] (2026-03-07 15:16Z) Passed the full local gate with `pnpm verify:all`.
- [ ] Open the follow-up PR, monitor GitHub checks/review until clean, and link the fixes back to the three original review comments.

## Surprises & Discoveries

- Observation: PR `#7` already computed `canManageAccess` inside `/status`, so the redaction fix can reuse existing actor-aware access resolution instead of introducing new policy logic.
  Evidence: `packages/core-runtime/src/runtime.ts` already calls `this.policyEngine.isApprovedOperator(sessionId, senderId)` before formatting the chat-visible status response.

- Observation: The install-context helper currently runs two synchronous git probes (`trackedRef` and `HEAD`) during daemon startup, so simply adding a timeout still leaves room for two sequential stalls unless the second probe is skipped after the first failure.
  Evidence: `apps/openassistd/src/install-context.ts` calls the helper twice in the same `loadRuntimeInstallContext()` path.

- Observation: A Windows PATH-prepended `git.cmd` test double does not reliably shadow a real `git.exe` for `spawnSync("git", ...)`, so the install-context regression had to use a module-level mock instead of a process-level fake binary.
  Evidence: the first node-test attempt finished in ~560ms with zero warnings and the real repository `HEAD` value, which proved the real `git.exe` still won the Windows resolution path.

## Decision Log

- Decision: Gate detailed `/status` lifecycle paths on approved-operator status instead of only on the effective access profile.
  Rationale: A whole-chat session override could still expose those paths to unapproved senders in a shared room. Approved-operator gating is the safer invariant for chat-visible filesystem disclosure.
  Date/Author: 2026-03-07 / Codex

- Decision: Split the maintenance contract into `protectedPaths` and `protectedSurfaces` instead of normalizing everything into one placeholder-only list.
  Rationale: The current contract already wants both concepts. Separating them keeps the path list machine-friendly while preserving operator-readable lifecycle guardrails.
  Date/Author: 2026-03-07 / Codex

- Decision: Stop repeated git probing after the first timeout/error during daemon startup.
  Rationale: Install-context metadata is best-effort. Once git probing is known to be unhealthy, retrying immediately only increases startup delay without improving user-visible behavior.
  Date/Author: 2026-03-07 / Codex

## Outcomes & Retrospective

The implementation is complete locally. `/status` now keeps host filesystem and install-path detail out of unapproved chat views while preserving the trusted operator view, the awareness contract now separates machine-friendly protected paths from descriptive protected lifecycle surfaces, and daemon startup git probing is bounded and logged instead of potentially stalling twice. The new vitest install-context regression uses a module mock rather than a fake `git` binary so the test stays deterministic on Windows, Linux, and macOS.

Local verification is done: targeted suites passed first, then `pnpm verify:all` passed on 2026-03-07. The only remaining work is the GitHub side: open the follow-up PR, monitor Actions/CodeQL/Copilot, and then reference that PR back on the three original PR `#7` review threads.

## Context and Orientation

The chat-visible `/status` reply is assembled in `packages/core-runtime/src/runtime.ts`. It uses the shared awareness snapshot built in `packages/core-runtime/src/awareness.ts`, which in turn reads the runtime self-knowledge manifest and maintenance rules from `packages/core-runtime/src/self-knowledge.ts`. The public awareness contract lives in `packages/core-types/src/runtime.ts`.

Daemon startup runs from `apps/openassistd/src/index.ts`. The install/update metadata shown in runtime awareness is built by `apps/openassistd/src/install-context.ts`, which currently discovers repo state and calls `git rev-parse` synchronously at startup.

The existing regression coverage for these surfaces is split between `tests/node/runtime.test.ts`, `tests/node/runtime-access-mode.test.ts`, and `tests/vitest/runtime-self-knowledge.test.ts`. This follow-up adds `tests/vitest/install-context.test.ts` because module-level mocking is the most stable cross-platform way to simulate timed-out git probing.

## Plan of Work

First, update the self-knowledge contract. `packages/core-types/src/runtime.ts` should gain a separate `protectedSurfaces` field inside `RuntimeAwarenessMaintenance`. `packages/core-runtime/src/self-knowledge.ts` should normalize `protectedPaths` to placeholder-style filesystem paths and move the descriptive service/wrapper entries into a new `RUNTIME_PROTECTED_SURFACES` list. `packages/core-runtime/src/awareness.ts` should render both lists in the system message and maintenance snapshot.

Next, tighten chat-visible `/status`. `packages/core-runtime/src/runtime.ts` should keep the current high-level diagnostics for everyone, but detailed config/env/install path lines and the protected path/surface lists should only appear when the current sender is an approved operator. Everyone else should get a plain-language note explaining that full lifecycle paths are hidden in chat for that sender and are available through host-side commands such as `openassist doctor`.

Then, harden daemon startup in `apps/openassistd/src/install-context.ts`. The helper should use a conservative timeout for synchronous git probes, log a warning when git probing errors or times out, and stop probing again after the first such failure. `apps/openassistd/src/index.ts` should pass the daemon logger into that helper.

Finally, update the docs and tests together, run the full local verification gate, open the follow-up PR, and monitor GitHub CI and review surfaces until the branch is clean enough to merge.

## Concrete Steps

From the repository root:

    pnpm exec tsx --test tests/node/runtime.test.ts tests/node/runtime-access-mode.test.ts
    pnpm exec vitest run tests/vitest/runtime-self-knowledge.test.ts tests/vitest/install-context.test.ts
    pnpm verify:all

After the local gate passes, push the branch, open the PR, and verify GitHub Actions plus CodeQL are green before asking for merge.

## Validation and Acceptance

Acceptance is behavioral:

1. `/status` from an unapproved sender still reports identity, access, and high-level lifecycle state but does not reveal full config/env/install paths.
2. `/status` from an approved operator still includes the detailed lifecycle/install path view needed for trusted operators.
3. The runtime self-knowledge snapshot and system message keep `protectedPaths` path-like and move descriptive service/template guardrails into `protectedSurfaces`.
4. `loadRuntimeInstallContext()` times out git probing, logs a warning, and returns best-effort install context instead of blocking indefinitely.
5. `pnpm verify:all` passes locally, then the follow-up PR reaches green GitHub checks with no remaining actionable review findings.

## Idempotence and Recovery

This follow-up is additive and safe to retry. The redaction change only changes how `/status` renders existing awareness data. The contract cleanup adds one field without removing durable snapshot storage. The install-context timeout is best-effort metadata gathering; if git probing fails, the daemon still falls back to stored install-state or known config paths.

If a new install-context test fails on one platform, rerun that targeted node test first before rerunning the full gate. If GitHub review surfaces find another issue, apply the minimal fix on the same branch and rerun `pnpm verify:all` before pushing again.

## Artifacts and Notes

The most important evidence to capture later in this document is:

- a redacted `/status` transcript for an unapproved sender
- a detailed `/status` transcript for an approved operator
- a self-knowledge snapshot assertion showing `protectedPaths` and `protectedSurfaces` separately
- the install-context timeout regression test result
- the final `pnpm verify:all` result and follow-up PR status

## Interfaces and Dependencies

The change should end with these concrete interface results:

- `packages/core-types/src/runtime.ts`
  - `RuntimeAwarenessMaintenance.protectedSurfaces: string[]`

- `packages/core-runtime/src/self-knowledge.ts`
  - `RUNTIME_PROTECTED_PATHS` contains placeholder-style paths only
  - `RUNTIME_PROTECTED_SURFACES` contains descriptive lifecycle surfaces

- `apps/openassistd/src/install-context.ts`
  - bounded git probing with a timeout constant and optional warning logger

- `tests/vitest/install-context.test.ts`
  - a new regression test for timed-out git probing during install-context discovery

Revision (2026-03-07 15:14Z): Initial follow-up ExecPlan created after re-auditing the merged PR `#7` Copilot review comments and the affected runtime/install-context surfaces.
Revision (2026-03-07 15:22Z): Updated the living sections after implementation, docs sync, the Windows-safe install-context test rewrite, and the successful `pnpm verify:all` run; remaining work is PR creation plus GitHub review/check monitoring.
