# Prepare and publish stable 0.2.2


This living ExecPlan follows `.agents/PLANS.md`. Maintain Progress, Surprises & Discoveries, Decision Log and Outcomes & Retrospective as evidence arrives.

## Purpose / Big Picture


Deliver the complete provider model refresh to packaged installations as signed stable 0.2.2. Fresh setup recommends GPT-6.1 Sol with xhigh for OpenAI/Codex and Opus 5.5 for Anthropic, while saved settings remain operator-controlled. Include the exact-commit CI/CodeQL publication safeguards already merged in PR #74. After publication, an explicit stable update and `openassist --version` must select/report 0.2.2 without losing operator state.

## Progress


- [x] (2026-10-01 13:40Z) Confirmed current latest stable is immutable `v0.2.1`; no `v0.2.2` tag exists. Root/CLI/daemon were 0.2.1. PR #75 is open on `codex/current-model-recommendations`, with all 13 applicable checks successful at `d8a02d6438c7c808faea2235e08ac97e2c49a3a6`.
- [x] Confirmed the maintainer requested stable 0.2.2 rollout. Inspected release workflow, publication prerequisites, current environment protection and main ruleset; publication credentials are provisioned without inspecting secret values.
- [x] Reconciled root/CLI/daemon candidate versions, versioned changelog, release notes, README/AGENTS, docs index, install/update guides and test matrix; retained current 0.2.1 availability.
- [x] (2026-10-01 13:51Z) Candidate `pnpm verify:all` passed on `7c1d85cb1cf0e3426640a907c21d5e9953c52009`: workflow lint, build/lint/types, 577 Vitest passes/one skipped, 229 Node passes/six skipped, 126 Node coverage passes/five skipped, unchanged coverage gates and zero production/full audit findings. Vitest lines 84.22%, statements 83.24%, functions 85.85%, branches 74.35%; Node lines/statements 80.15%, functions 86.07%, branches 73.67%. Both executables report 0.2.2. Two Bash-unavailable installer cases separately passed with Git Bash on the invocation PATH; remaining skips are platform exclusions. Final diff/whitespace inspection passed; no signing or operator-state changes.
- [x] Reconciled actual PR #74 merge and main checks: `f5e811b39fe9d092b6ac9e32ce1c97a757e7049d`, CI 36853073983 (workflow lint and all three quality jobs), full CodeQL 36798890562 (preflight and actual analysis), and Service Smoke 36860087242 all succeeded. This is parent evidence only; the future 0.2.2 merge needs its own exact-main checks.
- [x] (2026-10-01 14:00Z) Updated PR #75 to stable preparation and recorded the successful candidate checkpoint at `ce6541a53b402fa58562a2ad35e405e47c2b39f1`: [CI 36872132169](https://github.com/openassistuk/openassist/actions/runs/36872132169), [full CodeQL 36872132146](https://github.com/openassistuk/openassist/actions/runs/36872132146), [live macOS 36872132254](https://github.com/openassistuk/openassist/actions/runs/36872132254) and [native packages/signing 36872132290](https://github.com/openassistuk/openassist/actions/runs/36872132290). All 13 applicable checks succeeded, all three quality platforms report zero production/full audits, and separate queries found zero open scanner alerts and zero unresolved review threads. This evidence-only reconciliation gets its own final-head checks, recorded in PR #75's validation section before any merge.
- [x] (2026-10-01) Final PR head `2f60af1eaaba2ba28e20a73674f8e5cae232c7b8` passed all 13 applicable checks: CI 36873247374 (attempt 2), full CodeQL 36873247324, live macOS 36873247385 and native packages/signing 36873247593. Retain the initial Linux five-second source-staging timeout; its unchanged failed-job retry passed. No assertion, timeout or quality threshold was altered. All three quality platforms report zero audits; scanner/review-thread queries were clear.
- [x] (2026-10-01 14:20Z merge) Maintainer merged PR #75 at `2f8b2dced95ea6a8b7770d7a7fb7d16308fab61a` and removed its remote branch. Actual main [CI 36875513053](https://github.com/openassistuk/openassist/actions/runs/36875513053) passed workflow lint/all three quality jobs; [full CodeQL 36875513121](https://github.com/openassistuk/openassist/actions/runs/36875513121) passed preflight/analysis. All three platforms report zero production/full audits; the live read-only publication checker accepted both exact-commit runs. Separate scanner/review-thread queries were clear.
- [x] Fast-forwarded clean local main to that merge, deleted merged local `codex/current-model-recommendations`, pruned its tracking ref, and deleted remote `codex/fix-ci-391-dependency-audit` only after verifying its tip `3ca7fdb3fe4a4a32c477a59061ab22aa029e42dd` is an ancestor of main and PR #68 is merged.
- [x] Created immutable annotated `v0.2.2` at the checked `2f8b2dc` merge, added only that exact tag to the release environment while preserving its maintainer reviewer, and dispatched [stable publication 36876557261](https://github.com/openassistuk/openassist/actions/runs/36876557261) from that tag. The maintainer's stable-rollout request and follow-up after merge authorize this publication; no main-review bypass was performed.
- [x] (2026-10-01 14:36:26Z publication) Approved only matching protected deployment 6786997744 after publication-checks, all four native packages, Linux candidate verification and signing-contract succeeded. The publish job rechecked exact-main CI/full CodeQL, signed with the production key and published all 16 assets. GitHub latest stable selects v0.2.2. Environment reviewer protection and all older signed assets remain unchanged.
- [x] Independently verified both production RSA/SHA-256 signatures against `release-public.pem`, exact version/commit/channel, database/feature compatibility and all 16 GitHub asset digests against downloaded metadata or signed indexes/manifests. Ignored evidence: `coverage/check-v0.2.2-release.mjs`, `coverage/release-0.2.2-public-assets.json` and signed metadata under `coverage/current-public-release-check/v0.2.2`.
- [x] (2026-10-01 14:48Z verification) Initial publication public checks passed Linux x64/arm64 and Intel Mac. Apple Silicon passed channel install/uninstall but exact-version download timed out connecting to GitHub (curl 28 after 75 seconds); diagnostics also showed exhausted public API quota. [Verification-only 36878438133](https://github.com/openassistuk/openassist/actions/runs/36878438133) subsequently passed all four stable-channel/exact-version public installations, update planning and data-preserving uninstalls against the unchanged assets. It skipped builds, signing and publication and received no production signing credential. Initial run 36876557261 retains its failure conclusion; the successful retry is separate evidence.
- [x] Reconciled README/AGENTS, changelog, release notes/index, platform/quickstart/update guides, test matrix and both model/release ExecPlans with actual publication/verification. Older immutable releases and historical evidence remain intact; fresh provider/channel and second-account live-testing gaps remain explicit.
- [ ] Run the documentation PR's local verification, record exact-head hosted results and merge after required review. This follow-up does not alter the immutable tag or published assets.

## Surprises & Discoveries


The preparation checkpoint found GitHub main's active `Protect main` ruleset required one approving review: PR #75 reported `REVIEW_REQUIRED`/`BLOCKED` despite successful checks. The maintainer subsequently merged it. No agent-side main-review bypass was used. Release environment reviewer protection remains intact; the new exact v0.2.2 tag authorization is separate from the previous approved tags and never permits arbitrary refs.

Final PR CI initially exceeded the existing source-staging test's five-second deadline (7.746 seconds). The unchanged Linux retry passed the full gate, with that test completing in 1.622 seconds and 0.751 seconds under coverage. The actual main CI then passed on its first attempt. Retain this transient failure as evidence; no timeout, assertion or audit/coverage threshold was relaxed.

The first public Apple Silicon job completed stable-channel installation/uninstall, then its exact-version asset download could not connect to github.com:443 for 75 seconds. Diagnostic raw entrypoints were HTTP 200; the public API returned HTTP 403 with zero remaining quota and reset at 2026-10-01 14:49:20Z. The fatal failure was curl 28; the quota response alone is not proof of that download's cause. Retry only public verification on fresh runners, retaining the failed run and unchanged asset hashes.

README's current-release pin example still selected 0.2.0 although its availability notice correctly selected published 0.2.1. Preparation corrects that example to the actual published patch; it must switch to 0.2.2 only after independent public verification.

The source-upgrade integration fixture clones committed HEAD while invoking the working-tree CLI. Commit the reviewed version changes before running the full gate so candidate and fixture versions agree; do not weaken its version assertion.

## Decision Log


Decision (2026-10-01): extend the existing unmerged model PR with release preparation rather than create a dependent second PR. The maintainer asked to roll this work into stable, and a single review covers the final catalog and candidate versions. Preserve main and release-environment review protection; do not move published tags or reuse prior-release certification.

Decision (2026-10-01): use 0.2.2 because 0.2.1 is the latest published stable and no next tag exists. This is a compatible patch line with explicit repair for retired upstream IDs and no database migration. Keep previous signatures, assets and evidence immutable.

Decision (2026-10-01): retain 0.2.1 public availability until 0.2.2 protected publication and all public installs pass. Current source/PR checks cannot establish public availability or paid provider performance.

Decision (2026-10-01 publication): the maintainer's stable 0.2.2 request, reviewed preparation merge and follow-up to keep releases on track authorize tagging and the resulting protected publication. Preserve exact-main checks and environment reviewers; approve only this matching tagged publish job after all candidate/signing prerequisites succeed. Reconcile public availability through a separate documentation PR after public verification, without rebuilding or changing the immutable tag/assets.

## Outcomes & Retrospective


Signed stable v0.2.2 is published from reviewed PR #75/main `2f8b2dced95ea6a8b7770d7a7fb7d16308fab61a` and is GitHub latest stable. Local/final PR checks, actual main CI/full CodeQL, all native artifacts, Linux candidate quality/audits, signing contracts and protected production signing passed. Both production signatures and all 16 asset digests independently verified. Initial Apple Silicon public verification failed on network connection; successful verification-only run 36878438133 then validated all four supported targets against unchanged assets. The first run's failed overall conclusion is retained, not relabeled as green.

Local main was fast-forwarded and stale merged branches were removed with ancestry/PR proof. Availability/evidence documentation is prepared on `codex/published-0.2.2-evidence` for its separate local/hosted checks and required review. Source checks do not establish live provider/channel performance; fresh-host and second-account sessions remain unverified. No local signing key or operator state is changed.

## Context and Orientation


`packages/config/src/provider-models.ts` defines exact per-route model controls and lifecycle dates used by setup, validation, adapters and status. PR #75 contains its complete catalog refresh plus provider/setup/import regressions and synchronized public documentation. `package.json`, `apps/openassist-cli/package.json` and `apps/openassistd/package.json` set the candidate version; existing `tests/node/cli-docs-truth.test.ts` checks all three, executable output and current notes links.

`docs/releases/v0.2.2.md` is the reviewed GitHub release body. `CHANGELOG.md` collects included changes under 0.2.2. `.github/workflows/release.yml` builds Linux x64/arm64 and macOS x64/arm64 packages, tests signatures with ephemeral keys and signs only inside the protected `release` environment. A public-install job downloads actual signed assets through the normal installer. `scripts/release/check-publication-checks.mjs` requires the latest matching normal main-branch CI and actual JavaScript/TypeScript CodeQL jobs for the exact tagged commit, both before approval and before signing.

Operator config/data/log/skills directories live outside the checkout. No paid provider call, service restart or operator-state mutation is needed for release preparation. The public RSA key in `release-public.pem` remains the trust anchor; private signing secrets stay in the protected environment.

## Plan of Work


The first milestone aligns candidate versions and notes. Leave published availability at 0.2.1, link the 0.2.2 candidate and record explicit post-publication update commands. Validate with the existing docs-truth/version contracts and full local gate. Review the final patch for secrets, unrelated changes and backward-compatible saved settings before pushing PR #75.

The second milestone reconciles the candidate PR's actual head. Wait for workflow lint, all three quality/coverage platforms, full CodeQL, live macOS, all four native artifacts and signing contracts. Query open scanner alerts and unresolved review threads separately. Record exact successful runs in the PR body to avoid repeated evidence commits invalidating the head. Obtain the required PR review before merging; do not use admin bypass.

The third milestone signs the reviewed main commit. Wait for its own main-branch CI and full CodeQL before tagging. Confirm package version and release notes, create a new annotated v0.2.2 tag without moving an existing tag, add only that exact tag to the environment allowlist and preserve all reviewer settings. Dispatch the workflow from that tag with stable explicitly selected. Obtain protected publish approval and wait for all four public-install checks. Independently verify release.json/release-index signatures and every asset digest using the pinned production key. Only then update README, notes, docs index, platform/quickstart guides and this evidence through a reviewed follow-up PR.

## Concrete Steps


Run in `C:/Users/dange/Coding/openassist` with Node 24.21.0 and pnpm 12.5.1. Commit candidate versions before the full source-clone integration gate; retain logs under ignored `coverage/`.

    pnpm verify:all
    git diff --check
    gh pr checks 75
    gh api repos/openassistuk/openassist/code-scanning/alerts?state=open

After required review/merge, fetch clean main, obtain the exact merge SHA and inspect main-branch `ci.yml` and `codeql.yml` runs for that SHA. With those checks successful, create the tag and dispatch:

    git tag -a v0.2.2 <reviewed-main-sha> -m "OpenAssist 0.2.2 stable"
    git push origin v0.2.2
    gh workflow run release.yml --ref v0.2.2 -f tag=v0.2.2 -f channel=stable -f publish=true

Add only the new exact tag to the release environment's deployment-tag policies after the checked merge, retaining required reviewers. The workflow must report successful publication-checks, four packages, signing-contract, approved publish and four public-install jobs. If public verification alone needs retry, dispatch `release.yml` with `tag=v0.2.2`, `channel=stable`, `verify_published=true`; never republish immutable assets.

## Validation and Acceptance


Local `pnpm verify:all` must pass unchanged workflow lint, build/lint/types, Vitest/Node tests, coverage and production/full audits. CLI and daemon must both report 0.2.2. Docs-truth must find matching manifests, notes, changelog and executable flags. Existing model/setup/transport regressions prove route controls, saved settings and retired-ID repair behavior; no trivial version-only test is added.

Candidate PR checks must be successful at its actual final head, with scanner/review threads independently reconciled. Main CI/CodeQL must pass at the exact tagged commit, not merely a parent or PR head. After signed publication, stable discovery and exact-version installs must report 0.2.2 on all four targets; uninstall must retain config/env files and signatures/digests must verify independently. Hosted installer tests do not establish live provider/channel performance; fresh-host and second-account testing remain unverified.

## Idempotence and Recovery


Preparation edits are reversible and stay on the existing branch. Never move existing tags, replace published signed assets, expose signing keys, lower audit/coverage gates or bypass required review. A failed candidate is repaired through reviewed commits. Missing/pending exact-main checks require completion before publication; a failed tagged candidate requires a reviewed replacement rather than signing another commit under that tag. A public-install failure leaves the published release visible for investigation; retry only verification and retain the failure in evidence. Preserve operator credentials/databases throughout.

## Artifacts and Notes


Initial observed evidence on 2026-10-01: latest stable v0.2.1, PR #74 merged at `f5e811b39fe9d092b6ac9e32ce1c97a757e7049d`, PR #75 head `d8a02d6438c7c808faea2235e08ac97e2c49a3a6` with 13 successful applicable checks, zero open scanner alerts and zero unresolved review threads. PR #75 still required an approving review at that checkpoint. These dated results do not certify later revisions; the final merge/publication evidence is recorded above.

Candidate local log: `coverage/release-0.2.2-verify.log` (ignored). All 72 Vitest suites, version/executable/docs-truth assertions, source-upgrade version checks and both zero-finding dependency audits passed. Supplementary `pnpm exec tsx --test --test-name-pattern='keeps public' tests/node/install-bootstrap-idempotence.test.ts` passed two installer cases with Git Bash available. Final candidate-head hosted run IDs and conclusions are retained in PR #75's validation section; no earlier head or parent result certifies that revision.

Exact-tag Linux publication verification passed 575 Vitest tests/three platform skips, 234 Node tests/one skip and 130 Node coverage tests/one skip, all unchanged coverage gates and zero production/full audits. Node lines/statements were 80.83%, functions 86.46% and branches 73.61%. Logs are retained under ignored `.tmp/`: main quality, original publication/candidate quality, Apple Silicon failure and successful verification-only matrix. Independent verification source/public metadata live under ignored `coverage/`; no private signing material is retained there.

## Interfaces and Dependencies


No additional production dependency, schema migration, provider auth change or endpoint rewrite is introduced by release preparation. Preserve the existing shared catalog and adapter contracts; generic backend IDs and Azure deployment/auth boundaries remain explicit. Keep Axios 1.20.0, Undici 6.28.1 and brace-expansion 5.0.12 advisory floors, Node 24.21.0, pnpm 12.5.1 and mandatory production signature checks unchanged.

Revision note (2026-10-01): initialized stable 0.2.2 preparation from actual publication/PR/protection evidence and maintainer rollout authorization. Review, candidate checks and protected publication remain distinct gates.

Revision note (2026-10-01 local validation): recorded complete candidate verification, actual executable versions, supplemental Bash checks and merged-parent CI/CodeQL evidence. This evidence-only revision requires separate hosted checks and does not establish merged-main or publication success.

Revision note (2026-10-01 hosted checkpoint): recorded actual successful candidate runs, zero audits on all three platforms and separate scanner/review-thread queries. The remaining enforced review/merge and protected-publication gates are explicit; final documentation-head checks are maintained in the PR body before merge.

Revision note (2026-10-01 reviewed-main publication start): reconciled the maintainer's PR #75 merge, final PR timeout/retry history, exact-main successful CI/full CodeQL, safe stale-branch cleanup, immutable tag and protected stable dispatch. Public availability remains unchanged while publication and independent public verification are pending.

Revision note (2026-10-01 publication and public retry): recorded protected production publication, latest-stable selection, independent signature/digest verification and the initial Apple Silicon network/quota diagnostics. Verification-only mode checks unchanged public assets; no successful four-platform claim is made while Mac checks remain pending.

Revision note (2026-10-01 public verification completion): all four verification-only targets passed on unchanged assets. Reconciled current availability and actual exact-tag candidate counts while preserving the failed original run and outstanding separate documentation review/live provider checks.
