# Repair scheduled CI audits and workflow target validation

This ExecPlan is maintained in accordance with `.agents/PLANS.md`. Keep Progress, Surprises & Discoveries, Decision Log, and Outcomes & Retrospective current.

## Purpose / Big Picture


Restore the repository's three-platform quality gate after a newly reviewed development dependency advisory, and ensure workflow lint cannot report success without checking the requested files. Contributors should be able to run `pnpm verify:all` with clean production/full audits and see missing workflow targets fail clearly. The user authorized a new branch and PR for CI failures and other reproducible repository errors; publication and merge are outside this task.

## Progress


- [x] (2026-10-04) Inspect clean main `1f1b840`, authenticate gh, create `codex/fix-ci-audit-repo-errors`, and inspect recent failed runs.
- [x] (2026-10-04) Reproduce the audit failure locally; identify the sole vulnerable dependency path and verify the absence of a published patch.
- [x] (2026-10-04) Query open CodeQL and Dependabot alerts separately; both return empty. Confirm September 30 macOS port-race failure was already repaired by merged PR #74.
- [x] (2026-10-04) Three regressions fail before repair; after the scoped dependency removal and target fixes, all 11 focused tests pass and both audits report zero findings.
- [x] (2026-10-04) Reproduce an extra Azure Foundry entry in the documented Vitest coverage scope; strengthen the existing docs-truth assertion and correct the list without altering coverage configuration.
- [x] (2026-10-05) Synchronize README/AGENTS, docs index, threat model, test matrix and changelog; all 28 focused checks pass. Correct the stale docs-check inventory description alongside the excess coverage claim.
- [x] (2026-10-05) `pnpm verify:all` passes: workflow lint, build, lint, typecheck, 577 Vitest passes/1 skip, 234 Node passes/6 skips, both unchanged coverage gates and both clean audits. `git diff --check` passes.
- [x] (2026-10-05) Review the diff, commit implementation `5f3676b07d3a41e2584446c168bc9c165c4ec23a`, push the new branch, and open/attach [PR #77](https://github.com/openassistuk/openassist/pull/77).
- [x] (2026-10-05) All 13 hosted checks pass on implementation `5f3676b`; three production-publication jobs skip as expected. Separate scanner queries return zero open CodeQL/Dependabot alerts and PR review threads are empty. Record the final evidence revision's recheck in PR #77's validation section.

## Surprises & Discoveries


Scheduled CI runs 37114809510 (October 3) and 37196152345 (October 4) fail only in the final full dependency audit on Linux/macOS/Windows; builds, tests and coverage pass. Baseline audits show zero production findings and one high development finding: `GHSA-vfj7-8cjw-p6xm`, stack-exhaustion denial of service in `braces <=3.0.3`. The registry and GitHub advisory both report no published patch. The path is `@tktco/node-actionlint@1.6.0 -> fast-glob -> micromatch -> braces`.

The linter's CommonJS library exports `runLint` and `getLintLog` without importing its standalone CLI's glob module. `scripts/dev/lint-workflows-node.mjs` already uses Node 24 `fs.globSync`; removing the unused CLI dependency preserves the actually used library. The wrapper currently filters wildcard targets out of action-version policy validation, falling back to tracked workflows, and the adapter reports success for zero glob matches.

The existing coverage docs-truth assertion only required configured entries to be present. The test matrix additionally claimed the Azure Foundry adapter was measured, although it is absent from `vitest.config.ts`. Exact list equality reproduces that mismatch; correction removes only the extra documentation claim.

## Decision Log


Decision: Remove only `@tktco/node-actionlint@1.6.0>fast-glob` with a scoped pnpm removal override. Rationale: the upstream CLI-only dependency is unused by our wrapper and has no patched release; neither advisory suppression nor a broader dependency migration is necessary. Direct invocation of the upstream standalone CLI is not the supported repository lint entrypoint. Date/author: 2026-10-04, Codex.

Decision: Resolve the same explicit workflow targets for syntax lint and action-version policy, and reject unmatched patterns. Rationale: these are reproducible false-success defects adjacent to the failing tooling. Preserve native/Docker fallback for unsupported flags, runner-label handling and action version floors. Date/author: 2026-10-04, Codex.

Decision: Preserve package versions, production dependencies and published release evidence. Rationale: this is a source development-tooling repair; immutable signed packages and live provider/channel certification are separate concerns. Date/author: 2026-10-04, Codex.

Decision: Correct the excess documented Azure coverage entry and strengthen exact-list comparison rather than expand the coverage configuration. Rationale: the observed defect is a false documentation claim; provider behavior and existing coverage scope/thresholds remain intact. Date/author: 2026-10-05, Codex.

## Outcomes & Retrospective


Implementation, documentation and local/hosted validation are complete in [PR #77](https://github.com/openassistuk/openassist/pull/77). Frozen installation prunes only the unused development glob subtree, all 28 focused dependency/workflow/audit/docs checks pass, and `pnpm verify:all` passes with both audits at zero findings. All 13 checks on implementation `5f3676b` pass, including three-platform quality/coverage/audits, full JavaScript/TypeScript analysis, live macOS LaunchAgent, four native artifact jobs and ephemeral signing. Three publication-related jobs skip intentionally. Final evidence-only revision results are maintained in the PR's validation section and must be checked separately; this source evidence does not certify a later head automatically. Review approval is required and no merge has been performed. No new live provider/channel certification or release publication is claimed.

## Context and Orientation


`pnpm-workspace.yaml` holds dependency policy; `pnpm-lock.yaml` records exact installed dependencies. `scripts/dev/lint-workflows.mjs` selects native actionlint, the bundled WebAssembly library (a compiled linter that Node runs), or Docker, and applies action-version policy. `scripts/dev/lint-workflows-node.mjs` feeds file text into that library and honors explicit additional runner labels. `scripts/dev/audit-dependencies.mjs` retains registry reports and rejects high/critical findings or incomplete responses. `tests/node/dependency-security-overrides.test.ts` and `tests/node/workflow-lint-script.test.ts` provide regression coverage. `tests/node/cli-docs-truth.test.ts` validates documentation against real commands, workflows and coverage configuration.

## Plan of Work


Milestone 1 adds a resolved-tree absence regression and executable workflow cases for missing targets and an outdated action in a file selected by a glob outside the tracked workflow directory. Run them against baseline and observe failures. Add the scoped dependency removal, regenerate the lockfile with pnpm 12.5.1, and install frozen dependencies. Remove only the now-unreachable glob dependency subtree.

Milestone 2 fixes target matching in the adapter and policy checker, keeping actual actionlint diagnostics and custom runner labels intact. Validate real invalid workflow syntax and unknown runner labels alongside accepted configured labels. Support multiple plain file/glob targets through the existing library if target handling requires it; unsupported flags retain fallback behavior. Update README, AGENTS, docs index, test matrix, threat model and Unreleased changelog with the dependency boundary and validation behavior.

Milestone 3 runs focused regressions and the full local gate, reviews accidental edits and security/reliability boundaries, and creates the requested PR. Inspect all actual final-head hosted jobs, scanner alerts and review threads independently. Record passing, failed and skipped checks accurately; never treat publication skips as publication evidence.

## Concrete Steps


Run in `C:/Users/dange/Coding/openassist` with Node 24.21.0 and pnpm 12.5.1:

    pnpm exec tsx --test tests/node/dependency-security-overrides.test.ts tests/node/workflow-lint-script.test.ts
    pnpm install --lockfile-only
    pnpm install --frozen-lockfile
    pnpm exec tsx --test tests/node/dependency-security-overrides.test.ts tests/node/workflow-lint-script.test.ts tests/node/dependency-audit.test.ts tests/node/cli-docs-truth.test.ts
    pnpm verify:all
    git diff --check

Generated logs and baseline audit JSON stay under ignored `coverage/ci-repair/`. After local success, commit/push the branch, create a PR against main using `gh pr create --body-file`, attach its URL, and inspect checks with `gh pr checks`.

## Validation and Acceptance


The dependency regression must fail against the original vulnerable lockfile, then pass with no resolved fast-glob/micromatch/braces subtree. Workflow lint must continue to check real syntax, reject missing files and unmatched globs, enforce outdated action floors on actual glob-selected targets, accept configured custom runner labels and reject unrelated unknown labels. Full verification must pass with unchanged Vitest 81/71 and Node 79/80/70 coverage thresholds and both audits clean. Hosted Linux/macOS/Windows quality, CodeQL, live macOS service and native artifacts remain separate evidence from local Windows validation.

## Idempotence and Recovery


Installs/checks may be repeated safely. Restore only this branch's changes if needed; do not delete unrelated files, alter operator state, lower gates, suppress advisories, move tags or publish signed assets. Reuse the new branch/PR for follow-ups.

## Artifacts and Notes


Baseline evidence is retained in `coverage/ci-repair/baseline-all.json`, `baseline-production.json` and run logs. The reproduced full audit exits 1 with `{high:1, critical:0}` while production exits clean. The advisory is https://github.com/advisories/GHSA-vfj7-8cjw-p6xm; the removal mechanism is documented in pnpm's dependency-resolution settings.

Full local verification is retained in `coverage/ci-repair/verify-all.log`. Vitest coverage is statements 83.24%, branches 74.35%, functions 85.85%, lines 84.22%. Node coverage is statements/lines 80.15%, branches 73.67%, functions 86.07%. These exceed unchanged thresholds. Windows skips six Unix-only Node cases in the full suite and five in the narrower coverage suite; one pre-existing Vitest case is skipped. Frozen installation reports the changed linter dependency instance and 18 removed packages; the lockfile diff only adds the removal override and prunes unreachable development packages, without advancing versions.

Hosted implementation evidence at full commit `5f3676b07d3a41e2584446c168bc9c165c4ec23a`: [CI 37242380375](https://github.com/openassistuk/openassist/actions/runs/37242380375), [CodeQL 37242380308](https://github.com/openassistuk/openassist/actions/runs/37242380308), [macOS Live Launchd 37242380405](https://github.com/openassistuk/openassist/actions/runs/37242380405) and [Release Artifacts 37242380309](https://github.com/openassistuk/openassist/actions/runs/37242380309) all succeed. CI logs confirm both audits at zero findings on each OS. Separate final scanner queries return zero open alerts; PR #77 has no review threads. Publication prerequisites, production signing/publish and public installation skip on the PR; ephemeral signing succeeds. Hosted artifacts are test evidence, not new published packages.

## Interfaces and Dependencies


Keep `@tktco/node-actionlint` 1.6.0 and its CommonJS `runLint`/`getLintLog` API, Node built-in `fs.globSync`, and pnpm's scoped removal override. Add no production dependencies. Preserve full raw audit reports and existing failure semantics.

Revision note (2026-10-04): Initial plan records observed failures, existing repairs, scope and acceptance before implementation.

Revision note (2026-10-04): Record three baseline failures, repaired focused checks and clean audits; include the reproduced excess coverage claim and exact-list docs-truth correction.

Revision note (2026-10-05): Record all 28 focused checks, completed documentation synchronization and ongoing full verification.

Revision note (2026-10-05): Record successful full local verification, exact test/coverage/audit results and remaining PR/hosted evidence.

Revision note (2026-10-05): Record the actual implementation commit and attached PR #77; keep hosted completion pending until every relevant job concludes.

Revision note (2026-10-05): Reconcile 13 successful implementation checks, expected publication skips, clean three-platform audits and independent scanner/review results. Final evidence-only commits require a separate current-head recheck recorded in the PR body; leave review/merge and publication to their authorized workflows.
