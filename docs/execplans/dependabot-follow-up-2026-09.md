# Complete the post-modernization dependency updates

This living ExecPlan follows `.agents/PLANS.md`. Maintain Progress, Surprises & Discoveries, Decision Log, and Outcomes & Retrospective as work proceeds.

## Purpose / Big Picture

After modernization PR #55 merged, Dependabot opened PRs #56–59. Keep provider SDKs and GitHub Actions current while preserving the supported Node 24 runtime. Operators should receive an immediate invalid-bind-address diagnostic instead of waiting for hostname resolution during setup validation.

## Progress

- [x] (2026-09-27) Inspected all four diffs, upstream release notes, and hosted failures; confirmed zero open dependency vulnerability alerts after #55 merged.
- [x] (2026-09-27) Added the invalid-address probe guard, a regression test, and a major-update ignore rule for Node types.
- [x] (2026-09-27) Closed #57 unmerged. Full local `pnpm verify:all` passed: 380 Vitest tests, 185 Node tests with 3 expected skips, all coverage gates, and zero findings in both audits.
- [ ] Publish and merge the prerequisite fix after hosted checks and required review.
- [ ] Update #56, #58, and #59 against the fix; require green hosted checks and manual lifecycle smoke evidence before merging.

## Surprises & Discoveries

The same macOS test timed out in PRs #56, #58, and #59: `tests/vitest/setup-quickstart-validation.test.ts`, “flags invalid bind addresses and blocked runtime paths after schema validation”, exceeded 5000ms. `validateSetupReadiness` records an invalid-address error but still calls `net.Server.listen` with that address. This needlessly depends on host name-resolution timing. The PRs change independent dependencies, while the affected code is shared base code.

## Decision Log

Decision (2026-09-27): skip network probing only for syntactically invalid addresses, retaining valid-address and busy-port checks. Do not increase test timeouts or weaken coverage. Close #57 because Node 26 definitions conflict with the Node 24-only support contract. Keep the SDK and Actions upgrades in their separately reviewable Dependabot PRs. The user authorized managing all four PRs after reviewing these recommendations, including merges after verification.

## Context and Orientation

`apps/openassist-cli/src/lib/setup-validation.ts` produces setup readiness diagnostics. Its bind check must not perform network work for an invalid address. `tests/vitest/setup-quickstart-validation.test.ts` verifies this with a network-server spy that throws if called. `.github/dependabot.yml` controls routine version updates; ignoring major updates for `@types/node` preserves automatic 24.x fixes. No runtime dependencies, authentication, or operator-state layout change.

## Plan of Work

First merge a small prerequisite PR containing the validation repair, test, dependency policy, and affected lifecycle documentation. Close #57 without merging its Node 26 types. Bring the approved SDK PR #56 and Actions PRs #58/#59 up to date with main, inspect all hosted checks, dispatch Service Smoke and Lifecycle E2E Smoke for the workflow upgrades, and merge only verified revisions without bypassing branch protection.

## Concrete Steps

From the repository root, use Node 24.21.0 and pnpm 12.5.1. Run `pnpm exec vitest run tests/vitest/setup-quickstart-validation.test.ts`, then `pnpm verify:all`. Publish the prerequisite branch and use `gh pr checks <number>` for hosted verification. Use `gh pr update-branch <number>` to incorporate main and `gh workflow run service-smoke.yml --ref <branch>` plus `gh workflow run lifecycle-e2e-smoke.yml --ref <branch>` for manual smoke checks. Recheck each head before merge and record the outcomes here.

## Validation and Acceptance

The new invalid-address test must pass without creating a network server; existing busy-port tests still exercise real loopback binds. Local full verification and hosted quality checks must pass without reduced gates. PR #57 must close unmerged, the three compatible updates must merge only after verification, and Node types must remain 24.x. Complete audit reports remain visible in the normal quality workflow.

## Idempotence and Recovery

No production operations or live provider calls are needed. Each change is a normal Git commit and can be reverted independently. Inspect current PR state before retrying a merge or close. Do not force-push, dismiss security alerts, or bypass required checks.

## Artifacts and Notes

PRs: https://github.com/openassistuk/openassist/pull/56 (SDKs), /57 (Node types), /58 (setup-node), /59 (checkout). Prior failing macOS jobs include 108650029220 and 108650113590. Verification evidence will be added below.

## Interfaces and Dependencies

No public interface changes. Preserve `runtime.bind_address_invalid` and `runtime.port_unavailable`; emit the latter only after probing a valid address. Retain Node >=24.21.0 <25, pnpm 12.5.1, and the existing build-script permissions and security overrides.

## Outcomes & Retrospective

Local implementation and verification are complete; log: `%TEMP%/oa-dependabot-verify.log`. Node types PR #57 is closed unmerged. Hosted checks and merging remain pending. The main branch ruleset requires an approving review and an up-to-date branch with seven required checks; repository auto-merge is disabled. Preserve these controls.

Revision note (2026-09-27): Created from the approved four-PR management request, with the common macOS failure isolated before updating dependencies.
