# Repair October 6 CI dependency audits


This is a living ExecPlan maintained under `.agents/PLANS.md`. Keep Progress, Surprises & Discoveries, Decision Log and Outcomes & Retrospective current.

## Purpose / Big Picture


Restore Linux, macOS and Windows quality checks by removing the vulnerable development-tooling resolution of `source-map-js`. Contributors should be able to run `pnpm verify:all` with the same audit and coverage gates. This work also checks current repository errors through the full local gate, recent workflow evidence, security alerts and open review threads.

## Progress


- [x] (2026-10-06 12:28Z) Inspect clean main `b95f04b`, create `codex/fix-ci-audit-2026-10-06`, and identify the three failures in scheduled CI run 37456157419.
- [x] (2026-10-06 12:28Z) Reproduce one high development-only advisory locally; inspect the hosted Ubuntu audit artifact and current security/review state.
- [x] (2026-10-06 12:31Z) Demonstrate the patched-floor regression failing before repair; update only source-map-js to `1.2.2`, complete frozen installation and synchronize documentation.
- [x] (2026-10-06 12:34Z) Pass all 14 focused dependency/docs-truth checks and review the dependency, regression and documentation diff.
- [x] (2026-10-06 12:35Z) Pass `pnpm verify:all`, both unchanged coverage gates and zero-finding production/full audits; no additional concrete repository errors found.
- [x] (2026-10-06 12:46Z) Publish [PR #79](https://github.com/openassistuk/openassist/pull/79); implementation `9ee87b9` passes all 13 hosted checks after the artifact rerun. Track the later evidence-only head separately in the PR validation notes.

## Surprises & Discoveries


Scheduled CI run [37456157419](https://github.com/openassistuk/openassist/actions/runs/37456157419) fails only at full dependency audit on all three platforms. Workflow lint, build, lint, typecheck, test runners and coverage gates succeeded. Production audit reports zero findings; the full audit reports one high finding. The October 5 run 37304664077 passed on the same main revision, so this is a newly reported registry advisory rather than a new source regression.

Local `pnpm audit --json` reports [GHSA-68fv-2mgg-jv7q](https://github.com/advisories/GHSA-68fv-2mgg-jv7q): `source-map-js@1.2.1` through Vite/PostCSS and coverage-v8/magicast. The advisory describes synchronous event-loop denial of service from indexed source-map section offsets. Affected versions are `>=1.0.0 <1.2.2`; the patched floor is `1.2.2`. This is a contributor/test-tooling dependency path, not evidence of an OpenAssist runtime exploit.

The new floor fails on the original lockfile with `source-map-js@1.2.1 is below patched floor 1.2.2` (one failure, two passes). pnpm's lockfile regeneration changes only the new override, source-map-js package integrity/version, and its magicast/PostCSS references. Frozen installation succeeds with the pinned Node/pnpm toolchain.

Separate queries on October 6 found zero open CodeQL alerts, zero open Dependabot alerts, zero open issues and no review threads on the one open dependency PR #78. Its previous green checks predate this audit finding and do not certify the current registry state. Recent main CodeQL and service smoke runs passed; historical failures already repaired by PR #77 remain historical evidence.

PR #79's first Intel macOS artifact attempt failed before repository code at `npm install`: `getaddrinfo ENOTFOUND registry.npmjs.org`. Rerunning the failed workflow succeeds on the unchanged implementation head, including all four artifact targets and the signing-contract check. Retain the initial infrastructure failure separately from attempt 2; no workflow retry loop or audit bypass was added.

## Decision Log


- Decision: Use a version-scoped `source-map-js@>=1.0.0 <1.2.2` override to `1.2.2` and add the floor to the existing regression test.
  Rationale: Follow the existing transitive patched-floor policy without updating unrelated direct dependencies or incorporating the separate routine dependency PR. Preserve audit failures, coverage thresholds, workflows and published packages.
  Date/Author: 2026-10-06 / Codex.

The user's request authorizes fixes and a new PR. Work as one agent; the previous review delegation does not authorize delegation for this task.

- Decision: Rerun the failed hosted artifact workflow without changing source or adding retries.
  Rationale: The failure was DNS lookup during pnpm installation, and the unchanged-head rerun passed. A registry outage is not a source-code defect.
  Date/Author: 2026-10-06 / Codex.

## Outcomes & Retrospective


Diagnosis, implementation and local validation are complete: all 14 focused checks and `pnpm verify:all` pass. The before-repair regression confirms the defect and the dependency diff remains scoped to one patched development package. The full Windows run passes 577 Vitest tests (one skip), 235 Node tests (six skips), and the Node coverage subset with 126 passes (five skips). Platform-specific Unix/Bash cases remain unverified locally and require hosted Unix checks. Production and full audits both report zero findings.

Vitest statements/branches/functions/lines are 83.24/74.35/85.85/84.22 percent. Node coverage is 80.15/73.67/86.07/80.15 percent. All existing thresholds remain intact. Build, lint, types, docs-truth, test inventory, workflow lint and dependency checks reveal no additional actionable repository failures. Published packages are unchanged.

[PR #79](https://github.com/openassistuk/openassist/pull/79) implementation `9ee87b9a1c7cc9de909d4d1173c1fa27a3678fe2` passes all 13 hosted checks: [CI](https://github.com/openassistuk/openassist/actions/runs/37464530918), [CodeQL](https://github.com/openassistuk/openassist/actions/runs/37464530887), [live macOS LaunchAgent](https://github.com/openassistuk/openassist/actions/runs/37464531053) and [release artifacts/signing contract, attempt 2](https://github.com/openassistuk/openassist/actions/runs/37464530961/attempts/2). Both audits report zero findings on every quality-matrix platform. The three production-publication jobs skip as expected for a PR. Separate post-analysis queries find zero open security alerts and no unresolved PR review threads.

This reconciliation adds documentation after the tested implementation. Its own exact-head checks are maintained in PR #79's validation notes; the implementation results above do not certify that later revision. No merge, production signing/publication or live provider/channel certification is performed by this repair.

## Context and Orientation


`pnpm-workspace.yaml` holds workspace package selection, allowed build scripts and security overrides. `pnpm-lock.yaml` records the exact resolved dependency graph. The existing `resolvedVersions` helper in `tests/node/dependency-security-overrides.test.ts` extracts every locked version of a named dependency and rejects versions below its patched floor. `scripts/dev/audit-dependencies.mjs` retains production/full reports under `coverage/audit` and fails on high/critical findings or registry errors. `.github/workflows/ci.yml` runs the full gate on Linux, macOS and Windows and uploads those reports even on failure.

## Plan of Work


First add `source-map-js: 1.2.2` to the existing regression floor map and demonstrate failure on the current lockfile. Then add the affected-version override and regenerate the lockfile with pnpm 12.5.1. Review the dependency diff for unrelated resolutions, install from the frozen lockfile, and run the focused regression/docs checks. Synchronize README, AGENTS, changelog, docs index, test matrix and security guidance with the development-only path, advisory and unchanged gates.

The second milestone runs the complete local merge gate and inspects any failures for additional actionable repository errors. The final milestone commits the reviewed source changes, opens a PR against main, and waits for checks on the exact pushed revision. Record hosted reconciliation in the PR body so evidence edits do not repeatedly create unvalidated heads.

## Concrete Steps


Run from the repository root with Node 24.21.0 and pnpm 12.5.1:

    pnpm exec tsx --test tests/node/dependency-security-overrides.test.ts
    pnpm install --lockfile-only
    pnpm install --frozen-lockfile
    pnpm exec tsx --test tests/node/dependency-security-overrides.test.ts tests/node/cli-docs-truth.test.ts
    pnpm verify:all
    git diff --check

Before repair the regression must identify `source-map-js@1.2.1` as below `1.2.2`. After repair, both audits should contain zero high/critical findings, and all local gates should pass without lowered thresholds. Keep diagnostic logs and downloaded coverage reports under ignored `coverage/ci-repair-2026-10-06/`.

## Validation and Acceptance


Accept only a narrow lockfile change resolving every affected source-map dependency to `1.2.2`, a demonstrated before/after regression, passing docs-truth and complete local verification, and green current-head hosted checks. Inspect CodeQL/Dependabot alerts and unresolved reviews independently of workflow success. Any unavailable or skipped platform/release check must be identified accurately; PR artifacts do not certify production publication or live provider/channel sessions.

## Idempotence and Recovery


The override and frozen installation can be repeated. No operator state, services, credentials or production assets change. Reverting this source commit restores the previous resolution and the failing audit; do not suppress the advisory to recover a green result.

## Artifacts and Notes


Main/base: `b95f04b3a02c54242f46bec52b37324ad3a4f6da`. Failed hosted run: 37456157419. Local pre-repair audit: `coverage/ci-repair-2026-10-06/audit-before.json`. Hosted audit: `coverage/ci-repair-2026-10-06/ubuntu-before/audit/all.json`. Before-repair regression log: `regression-before.log`; passing 14-check log: `focused.log`; passing complete gate: `verify-all.log`; source CI's zero-finding audits: `source-ci.log`; initial DNS failure: `artifacts-failed.log`, all in the same ignored evidence directory. Final review found no accidental source edits, new dependencies, secrets, debug code or gate changes.

## Interfaces and Dependencies


No runtime interfaces or new production dependencies are introduced. Keep the existing pnpm patched-floor mechanism, Node regression helper and audit entrypoint.

Revision note (2026-10-06): create the plan from actual scheduled failure, local audit, advisory and independent repository-state evidence before repair; then record the failing regression, scoped dependency diff, frozen installation, 14 passing focused checks and complete local verification/coverage/audit results. Reconcile PR #79's exact implementation checks, retain the initial artifact DNS failure and successful rerun separately, and require separate validation for this evidence-only revision.
