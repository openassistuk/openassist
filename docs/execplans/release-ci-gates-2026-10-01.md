# Make the health-URL test deterministic and enforce publication prerequisites

This living ExecPlan follows `.agents/PLANS.md`. Keep Progress, Surprises & Discoveries, Decision Log and Outcomes & Retrospective current.

## Purpose / Big Picture

Release publication must automatically reject incomplete or unsuccessful CI and CodeQL evidence for the actual release commit. A setup test about wildcard health URLs must not fail because an unrelated host port becomes occupied. Both changes preserve production readiness and the existing protected signing boundary. Published v0.2.1 assets remain immutable.

## Progress

- [x] (2026-10-01 00:18Z) Diagnose main CI 36793298463: macOS coverage reports `EADDRINUSE` before an unexpected scripted confirmation; normal Vitest in that same job passed. Verify the exact v0.2.1 release commit and publication runs succeeded.
- [x] (2026-10-01 00:18Z) Isolate only the bind probe in the simulated health-URL case; retain real socket recovery/validation cases.
- [x] (2026-10-01 00:18Z) Implement read-only exact-commit/latest-run/current-attempt publication verification and wire initial plus pre-sign checks.
- [x] (2026-10-01 00:26Z) Targeted setup suites: 34 passed. Release prerequisite and docs-truth contracts: 33 passed. All six workflows pass lint.
- [x] (2026-10-01 00:26Z) `pnpm verify:all` passed: 526 Vitest passed/1 skipped, 228 Node passed/6 skipped, 125 Node coverage passed/5 skipped. Unchanged coverage thresholds pass; both dependency audits report zero findings. Windows cannot run the skipped Bash/Unix host cases; hosted gates remain separate.
- [x] (2026-10-01 00:26Z) Read-only live API checks accept v0.2.1 commit `a30ebc1` with CI 36787999719 and CodeQL 36787999708, and correctly block main `62c0cb2` because CI 36793298463 failed. Open code-scanning alerts queried separately: none.
- [x] (2026-10-01 00:33Z) Review the complete diff and open [PR #74](https://github.com/openassistuk/openassist/pull/74) on `codex/release-ci-gates`. Implementation commit `9beb3e1` passed all 13 checks: CI [36796334771](https://github.com/openassistuk/openassist/actions/runs/36796334771), CodeQL [36796334759](https://github.com/openassistuk/openassist/actions/runs/36796334759), live macOS [36796334737](https://github.com/openassistuk/openassist/actions/runs/36796334737) and native/signing [36796334726](https://github.com/openassistuk/openassist/actions/runs/36796334726). Publication-only jobs were correctly skipped. This documentation-only reconciliation triggers separate final PR checks, whose results are recorded in the PR body.

## Surprises & Discoveries

The previous port helper listened on loopback with port zero, closed its socket, then returned the port. The wildcard URL test later checked all-interface availability. The log confirms the selected port became unavailable, but does not identify its owner. The production readiness code correctly offered recovery; the scripted test had no answer left. This test already replaces the service manager and HTTP responses with simulations.

GitHub's actual CodeQL job name includes the matrix suffix: `analyze (javascript-typescript) (javascript-typescript)`. The checker must require that analysis job, not just the green preflight/workflow. Attempt-specific job routes prevent a previous successful attempt from supplying evidence for the current one.

## Decision Log

Use a test-scoped readiness spy with the existing `skipBindAvailabilityCheck` option and restore it in `finally`. This keeps every other readiness check real and avoids adding production test seams. Real occupied-port validation and quickstart repair remain unchanged. Decision recorded 2026-10-01.

Select the newest main-branch push/schedule/manual CI and CodeQL run for the exact tag commit, without filtering for success first. Require the workflow and each named job to succeed on the latest attempt. Bound read-only API pagination to three pages of 100 items and fail on missing, invalid, incomplete or excess evidence. Restrict requests to GitHub's API, reject redirects and never print credentials or remote error bodies. Decision recorded 2026-10-01.

Check before protected publication is eligible and again immediately before production signing, since builds and approval can take time. Leave PR artifacts and verification of existing publications independent. Require dispatch from the release tag, matching the checked-out commit and tag, as the maintainer runbook already specifies. Decision recorded 2026-10-01.

## Outcomes & Retrospective

Both authorized changes are implemented and pass targeted plus full local validation and the hosted checks at implementation commit `9beb3e1`. The live read-only checker accepts known successful exact-commit evidence and rejects the actual failed main run. The health-URL case no longer depends on a released host port, while real occupied-port recovery remains covered. Future publication dispatches from tags containing this workflow must pass the automated prerequisite twice. No production readiness behavior, existing tag or published asset was changed, and no new protected signing/publication dispatch was performed. The PR supplies the final reviewed revision and follow-up check results; merging it remains a maintainer action.

## Context and Orientation

`tests/vitest/setup-quickstart-branches.test.ts` tests guided setup branches, including simulated service/health calls and real busy-port recovery. `apps/openassist-cli/src/lib/setup-validation.ts` implements the real bind probe and its existing optional skip. `.github/workflows/release.yml` builds four native archives, tests ephemeral signing, waits for protected production signing approval and checks public installation. `ci.yml` supplies workflow lint and Linux/macOS/Windows quality jobs. `codeql.yml` supplies preflight and JavaScript/TypeScript analysis, with main-branch analysis separate from PR analysis.

## Plan of Work

The URL case uses a fixed port and a scoped spy that invokes real readiness with only bind availability skipped. Add `scripts/release/check-publication-checks.mjs`, an importable Node module and CLI that validates tag/dispatch identity and reads GitHub Actions runs/jobs. Add offline contract tests in `tests/node/release-publication-checks.test.ts` and extend the existing release workflow docs-truth contract. Keep root README/AGENTS, docs index, changelog, release maintenance and test matrix synchronized.

## Concrete Steps

Work from the repository root with Node 24.21.0 and pnpm 12.5.1 on branch `codex/release-ci-gates`. Run:

    pnpm exec vitest run tests/vitest/setup-quickstart-branches.test.ts tests/vitest/setup-quickstart-validation.test.ts
    pnpm exec tsx --test tests/node/release-publication-checks.test.ts tests/node/cli-docs-truth.test.ts
    pnpm lint:workflows
    pnpm verify:all

Inspect `git diff --check` and the full final diff, commit the reviewed change, push its branch and open a PR against main. Record actual local and hosted results here.

## Validation and Acceptance

The simulated URL test must still assert loopback health/status URLs; the real busy-port test must still fail validation, guide port repair and save afterward. Offline publication cases must accept complete success and reject unrelated commits/branches/PR analysis, older-green fallback, pending or skipped jobs, previous attempts and malformed/error responses. The workflow must require the prerequisite before protected production signing, repeat it before signing, and skip it for PRs and `verify_published`. The full local gate retains existing audit and coverage thresholds.

## Idempotence and Recovery

The checker performs GET requests only and never reruns workflows, moves tags, uploads assets or changes repository state. Missing/pending checks block publication until proper evidence exists. Changes are reviewed through a normal branch PR; existing signed releases are unchanged. No new package dependency is needed.

## Interfaces and Dependencies

The module exports `checkPublicationChecks({ repository, commit, request })` for deterministic API fixtures, `githubRequest(token, fetchFn)` for authenticated bounded GET requests and `checkedOutReleaseCommit({ tag, dispatchCommit, resolveCommit })` for tag identity. The CLI uses the existing Git tool plus `GH_TOKEN`, `GITHUB_REPOSITORY`, `GITHUB_SHA` and `RELEASE_TAG`. Only built-in Node modules are added.

Revision note: created on 2026-10-01 for the two authorized repairs; updated with targeted/full local, live read-only API and exact implementation-commit hosted validation evidence.
