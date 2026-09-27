# Complete the post-modernization dependency updates

This living ExecPlan follows `.agents/PLANS.md`. Maintain Progress, Surprises & Discoveries, Decision Log, and Outcomes & Retrospective as work proceeds.

## Purpose / Big Picture

After modernization PR #55 merged, Dependabot opened PRs #56–59. Keep provider SDKs and GitHub Actions current while preserving the supported Node 24 runtime. Operators should receive an immediate invalid-bind-address diagnostic instead of waiting for hostname resolution during setup validation.

## Progress

- [x] (2026-09-27) Inspected all four diffs, upstream release notes, and hosted failures; confirmed zero open dependency vulnerability alerts after #55 merged.
- [x] (2026-09-27) Added the invalid-address probe guard, a regression test, and a major-update ignore rule for Node types.
- [x] (2026-09-27) Closed #57 unmerged. Full local `pnpm verify:all` passed: 380 Vitest tests, 185 Node tests with 3 expected skips, all coverage gates, and zero findings in both audits.
- [x] (2026-09-27) Published prerequisite PR #60. All required hosted checks plus both manual smoke workflows passed for implementation commit `ded579c`.
- [x] (2026-09-27) Incorporated the prerequisite into #56 (`463b9e4`), #58 (`24d49e8`), and #59 (`7ef3643`); all required hosted checks and Linux/macOS smoke workflows passed on each revision.
- [ ] Obtain the required approving review for #60, merge it, then update and merge #56, #58, and #59 sequentially with all required checks and reviews satisfied.

## Surprises & Discoveries

The same macOS test timed out in PRs #56, #58, and #59: `tests/vitest/setup-quickstart-validation.test.ts`, “flags invalid bind addresses and blocked runtime paths after schema validation”, exceeded 5000ms. `validateSetupReadiness` records an invalid-address error but still calls `net.Server.listen` with that address. This needlessly depends on host name-resolution timing. The PRs change independent dependencies, while the affected code is shared base code.

## Decision Log

Decision (2026-09-27): skip network probing only for syntactically invalid addresses, retaining valid-address and busy-port checks. Do not increase test timeouts or weaken coverage. Close #57 because Node 26 definitions conflict with the Node 24-only support contract. Keep the SDK and Actions upgrades in their separately reviewable Dependabot PRs. The user authorized managing all four PRs after reviewing these recommendations, including merges after verification.

Decision (2026-09-27): merge the prerequisite commit into each retained dependency branch before #60 merges, so verification can proceed while the required review is pending. These were normal merge commits, without force pushes. Once #60 lands, the dependency diffs exclude the shared fix. Do not use a dependency PR as a route around the prerequisite's required review.

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

Hosted evidence (all successful on 2026-09-27): #60 CI run 36330533090, CodeQL 36330533031, live LaunchAgent 36330533143, Service Smoke 36330550261, Lifecycle E2E Smoke 36330551809. #56 CI 36330586851, CodeQL 36330586848, live LaunchAgent 36330586866, Service Smoke 36330603412, Lifecycle E2E Smoke 36330606874. #58 CI 36330592285, CodeQL 36330592490, live LaunchAgent 36330592297, Service Smoke 36330610004, Lifecycle E2E Smoke 36330612939. #59 CI 36330597025, CodeQL 36330596870, live LaunchAgent 36330596892, Service Smoke 36330615920, Lifecycle E2E Smoke 36330618746. Each CI run includes Linux/macOS/Windows quality, coverage, and both dependency audits. Workflow runs are available at `https://github.com/openassistuk/openassist/actions/runs/<run-id>`.

## Interfaces and Dependencies

No public interface changes. Preserve `runtime.bind_address_invalid` and `runtime.port_unavailable`; emit the latter only after probing a valid address. Retain Node >=24.21.0 <25, pnpm 12.5.1, and the existing build-script permissions and security overrides.

## Outcomes & Retrospective

Local implementation and hosted verification are complete; log: `%TEMP%/oa-dependabot-verify.log`. Node types PR #57 is closed unmerged. All three retained updates pass their complete checks and both manual smoke workflows. Merging is pending the required review of prerequisite PR #60. The main branch ruleset requires an approving review and an up-to-date branch with seven required checks; repository auto-merge is disabled. The signed-in account authored #60 and cannot approve itself. An asynchronous request to arrange the required review was presented to the user. Preserve these controls and check current PR heads before continuing; new main commits require branch updates and fresh checks.

Revision note (2026-09-27): Created from the approved four-PR management request, with the common macOS failure isolated before updating dependencies.

Revision note (2026-09-27, hosted verification): Recorded successful checks for all four prepared PRs, closure of #57, and the exact independent-review blocker. This evidence-only follow-up does not change the verified implementation.
