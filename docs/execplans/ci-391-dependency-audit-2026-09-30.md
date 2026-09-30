# Fix CI #391 dependency audit failures

This living ExecPlan follows `.agents/PLANS.md`. Keep Progress, Surprises & Discoveries, Decision Log, and Outcomes & Retrospective current.

## Purpose / Big Picture


Restore the required Linux, macOS and Windows quality gates after scheduled CI #391 detected newly catalogued high-severity denial-of-service advisories. Operators receive patched transitive dependencies through the next build; the existing signed preview is not rebuilt or republished by this change. The result is observable through passing dependency audits and unchanged test/coverage gates.

## Progress


- [x] (2026-09-30) Inspected run `36703493461`, confirmed all three platforms fail only at dependency audits, and reproduced production high=1/full high=3 locally.
- [x] (2026-09-30) Created `codex/fix-ci-391-dependency-audit` from main `9004841df1038bff77daa1763dfd00312c2509be`; verified Node 24.21.0 and pnpm 12.5.1.
- [x] (2026-09-30) Verified upstream advisories and registry availability of Undici 6.28.1 and brace-expansion 5.0.11; both support Node 24.
- [x] (2026-09-30) Strengthened checks failed against the original lockfile for brace-expansion 5.0.9 and Undici 6.28.0; regenerated only those two package versions and their references, then installed with the frozen lockfile.
- [x] (2026-09-30) Updated contributor, security, testing, product and changelog documentation; all 18 targeted dependency/audit/docs-truth tests passed. Production audit is zero findings; full audit has one moderate finding and zero high/critical findings.
- [x] (2026-09-30) Initial full verification passed with brace-expansion 5.0.11; traced the remaining moderate finding to `GHSA-q2hr-2g5m-vwhr` and verified compatible patch 5.0.12 is available.
- [x] (2026-09-30) Applied brace-expansion 5.0.12, repeated all 18 focused tests successfully, and confirmed both retained audits have zero findings at every severity.
- [x] (2026-09-30) Final `pnpm verify:all` passed on Windows with Node 24.21.0/pnpm 12.5.1: Vitest 513 passed/1 skipped; Node 204 passed/6 skipped; both coverage gates passed and both audits have zero findings.
- [x] (2026-09-30) Reviewed and committed the scoped fix as `07a78857b9347502b70d7309996cad55241c5727`, published the branch, and opened/attached PR #68 against main. No unresolved review threads were present; GitHub reports `REVIEW_REQUIRED`.
- [x] (2026-09-30) Reconciled local evidence and PR creation separately from hosted results. Workflow lint and CodeQL preflight passed on the implementation head; quality, CodeQL analysis, native packaging and live macOS jobs were still running at PR handoff. Final hosted results are recorded on the PR's current head rather than inferred here.

## Surprises & Discoveries


The failure is advisory-driven rather than a failing product test. The original logs report production dependencies high=1 and all dependencies high=3 after successful tests and coverage. All three advisory entries were added to GitHub's advisory database on 2026-09-29. The existing overrides pin Undici 6.28.0 and brace-expansion 5.0.9, so resolving unchanged constraints cannot repair the failure.

Undici `GHSA-rfgv-xxqx-mfg5` affects the OpenAI-family SDK and Discord dependency paths. A malicious or compromised WebSocket server can trigger an uncaught exception through an unrequested subprotocol; the patched 6.x floor is 6.28.1. Coverage tooling `c8 > test-exclude > minimatch > brace-expansion` has two recursion/stack-exhaustion advisories, `GHSA-qhr7-859c-m2p7` and `GHSA-6j4f-fj2g-mc7p`. Version 5.0.11 covers both; 5.0.10 covers only the latter.

The initial patched audit still reports one moderate brace-expansion CPU-exhaustion advisory, `GHSA-q2hr-2g5m-vwhr`, fixed in 5.0.12. The final selected floor is therefore 5.0.12. This remains the same transitive package and major line; no additional dependency is changed.

## Decision Log


Decision (2026-09-30, Codex): raise the existing Undici 6.x override to 6.28.1 and the existing brace-expansion override to 5.0.11, expanding their vulnerable selectors to those floors. This preserves the established dependency structure and avoids unrelated SDK or major-version upgrades. Keep all other overrides, supply-chain checks, build permissions, runtime bounds, audit failure rules and coverage thresholds intact.

Decision (2026-09-30, Codex): extend the existing lockfile regression test with the new floors rather than introducing production code or dependencies. Document the new source/build dependency state without claiming the already published preview is patched or that a successful automated gate certifies live provider accounts.

Decision (2026-09-30, Codex): supersede the initial brace-expansion 5.0.11 floor with 5.0.12 after identifying the remaining moderate advisory on the same package. Repeat final verification because the dependency changed, even though the initial gate passed. The final dependency requirements are Undici 6.28.1 and brace-expansion 5.0.12.

## Outcomes & Retrospective


The final implementation resolves Undici 6.28.1 and brace-expansion 5.0.12. Both old-lockfile regression checks failed before the dependency change, all 18 targeted tests pass, full local verification passes and both audits have zero findings at every severity. [PR #68](https://github.com/openassistuk/openassist/pull/68) is open against main; its current-head checks and reviews are the authoritative hosted handoff. At creation, workflow lint and CodeQL preflight passed while the remaining hosted jobs were running. Review is required; the PR is not merged and no release artifacts were published. The existing main CodeQL alert #42 is separately recorded and remains outside this dependency change.

The lesson from CI #391 is that a previously verified dependency floor can become vulnerable when new advisories are catalogued. Keeping the audits active caught this drift; updating only the affected patch versions restored the gate without suppressions or weaker policy.

## Context and Orientation


`pnpm-workspace.yaml` contains version-selective overrides, which tell the package manager to replace affected transitive dependencies (packages required by direct dependencies). `pnpm-lock.yaml` records their exact resolved versions and integrity hashes. `tests/node/dependency-security-overrides.test.ts` checks all resolved copies against patched floors and rejects old vulnerable versions. `scripts/dev/audit-dependencies.mjs` invokes both production and full registry audits, retains JSON reports under ignored `coverage/audit/`, and fails on high/critical counts or invalid registry responses. `package.json` includes that audit in `pnpm verify:all`; `.github/workflows/ci.yml` runs the same gate on all three platforms. No runtime API, configuration, privilege, replay or lifecycle behavior is changed.

## Plan of Work


First raise the regression floors for Undici and brace-expansion and run that test against the old lockfile to demonstrate failure. Edit only their existing override entries in `pnpm-workspace.yaml`, then run `pnpm install --lockfile-only` and inspect the diff for unrelated upgrades. Install with `pnpm install --frozen-lockfile`. Synchronize `README.md`, `AGENTS.md`, `docs/README.md`, `docs/testing/test-matrix.md`, `docs/security/threat-model.md` and `CHANGELOG.md` with the new floors, scope and advisory control. Run the focused dependency/audit/docs checks and the full verification gate, then review, commit, push and open a PR against main. Record actual check outcomes without inferring success from earlier runs or merging the PR.

## Milestones


The first milestone proves the cause and removes the vulnerable resolutions. The existing dependency test must fail before the override changes and pass afterwards, and both retained audit reports must have zero high/critical findings. The second milestone produces a reviewed, documented PR after full local verification. Hosted platform, CodeQL and release/lifecycle results must be reported as observed, with pending jobs distinguished from success.

## Concrete Steps


From the repository root `C:\Users\dange\Coding\openassist`, using Node 24.21.0 and pnpm 12.5.1:

    pnpm exec tsx --test tests/node/dependency-security-overrides.test.ts
    pnpm install --lockfile-only
    git diff -- pnpm-workspace.yaml pnpm-lock.yaml
    pnpm install --frozen-lockfile
    pnpm exec tsx --test tests/node/dependency-security-overrides.test.ts tests/node/dependency-audit.test.ts tests/node/cli-docs-truth.test.ts
    pnpm verify:all
    git diff --check

After a reviewed commit, push `codex/fix-ci-391-dependency-audit` and use `gh pr create --base main --head codex/fix-ci-391-dependency-audit --body-file <temporary-body-file>`. Inspect the created PR with `gh pr checks <number>` and separately inspect unresolved review threads and open code-scanning alerts.

## Validation and Acceptance


Before the override changes, the strengthened test must reject brace-expansion 5.0.9 or Undici 6.28.0. Afterwards, the tests must pass and lockfile resolutions must contain Undici 6.28.1 and brace-expansion 5.0.12 without the affected older copies. `pnpm verify:all` must exit zero with the existing builds, lint, types, tests, coverage thresholds and audit rules. Both final audits should have zero findings at every severity; any new registry finding must be reported honestly. The final PR must contain no unrelated dependency updates or generated audit reports.

## Idempotence and Recovery


Installs and audits can be repeated safely; reports are local ignored artifacts. If a registry request fails, retain the failure and retry without weakening policies. Review the lockfile after regeneration, reverting only task-owned changes if unrelated versions move. The changes are normal Git commits and can be reverted as a unit. Do not force-push, merge, dismiss security findings or modify published artifacts.

## Artifacts and Notes


Failing run: https://github.com/openassistuk/openassist/actions/runs/36703493461. Local reproduction uses `pnpm audit:dependencies` and retains `coverage/audit/production.json` and `coverage/audit/all.json`. Upstream references are https://github.com/advisories/GHSA-rfgv-xxqx-mfg5, https://github.com/advisories/GHSA-qhr7-859c-m2p7, https://github.com/advisories/GHSA-6j4f-fj2g-mc7p and https://github.com/advisories/GHSA-q2hr-2g5m-vwhr.

Initial focused verification: 18 tests passed. Before the change both dependency tests failed, explicitly identifying brace-expansion 5.0.9 below floor 5.0.11 and the remaining Undici 6.28.0 entry. With the initial 5.0.11 installation, production audit counts were all zero and full audit counts were moderate=1, high=0, critical=0. The separate GitHub alert inspection found no open Dependabot alerts and one pre-existing main code-scanning alert, #42 (`js/insufficient-password-hash`) at `packages/config/src/build-identity.ts:36`, created 2026-09-28; it has not been suppressed or dismissed and is outside this dependency-only change.

Final focused verification with brace-expansion 5.0.12: all 18 tests passed and both production/full audit counts are info=0, low=0, moderate=0, high=0, critical=0. The lockfile diff still changes only Undici, brace-expansion and their dependent references.

Final `pnpm verify:all` exited zero on Windows using Node 24.21.0 and pnpm 12.5.1. Vitest: 72 files, 513 passed/1 skipped. Node: 210 tests, 204 passed/6 skipped. Node coverage suite: 128 tests, 123 passed/5 skipped. Vitest coverage: statements 83.08%, branches 74.09%, functions 85.82%, lines 84.08%. Node coverage: statements/lines 80.06%, branches 73.38%, functions 86.52%. Both audits are zero at every severity. Local Windows skips include Bash/platform-dependent paths; hosted Linux/macOS checks provide their own evidence. The complete local transcript is retained at `%TEMP%/openassist-ci-391-verify-final.log`.

PR handoff: https://github.com/openassistuk/openassist/pull/68, implementation commit `07a78857b9347502b70d7309996cad55241c5727`. Initial hosted runs: CI `36722772998`, CodeQL `36722772839`, macOS Live Launchd `36722773006`, Release Artifacts `36722772874`. These runs belong to the implementation head; later documentation reconciliation may cause new current-head runs, so consult the PR checks rather than treating an earlier green run as final certification. The review-thread query returned no threads and review decision `REVIEW_REQUIRED`. A successful CodeQL workflow must not be confused with closure of the separately open main alert #42.

## Interfaces and Dependencies


No new production dependency or public interface is introduced. Preserve the Undici 6.x line used by the existing SDKs and Discord and the brace-expansion 5.x line already used by coverage tools. Node support remains `>=24.21.0 <25`, pnpm remains 12.5.1, and audit execution continues to invoke the native package-manager executable without a shell.

Revision note (2026-09-30): Created after identifying the common audit failure, with the patched floors and evidence needed to reproduce the repair.

Revision note (2026-09-30, focused verification): Recorded failing-before/passing-after regression evidence, scoped lockfile changes and audit counts; full verification and PR checks remain pending.

Revision note (2026-09-30, related advisory): Selected brace-expansion 5.0.12 to cover the remaining moderate advisory on the same package and scheduled final verification after the initial full gate passed.

Revision note (2026-09-30, final focused checks): Recorded the final two-package dependency state, repeated targeted tests and zero findings in both audits before completing the final full gate.

Revision note (2026-09-30, final local verification): Recorded successful full verification, actual test/coverage counts and platform limitations before committing and opening the PR.

Revision note (2026-09-30, PR handoff): Reconciled actual PR creation, initial hosted checks, required review and the separate open scanner alert. Final hosted outcomes remain attached to the PR's current revision; no merge or publication is claimed.
