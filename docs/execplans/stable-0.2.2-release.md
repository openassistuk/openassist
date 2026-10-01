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
- [ ] Obtain required PR review and merge the checked preparation; verify normal main-branch CI and full CodeQL on that exact merge commit.
- [ ] Create immutable `v0.2.2` at reviewed, checked main; authorize only that tag in the release environment while retaining reviewer protection; dispatch stable protected publication.
- [ ] Record approval, signing and all four public-install results; independently verify production signatures and all public asset digests, then update availability through a reviewed documentation change.

## Surprises & Discoveries


GitHub main uses the active `Protect main` ruleset with one required approving review and required status checks. PR #75 reports `REVIEW_REQUIRED`/`BLOCKED` despite all applicable checks passing; there are no reviews. Admin bypass permission exists but is not used. The release environment permits only exact v0.2.0, v0.2.0-rc.1 and v0.2.1 tags and requires maintainer approval. Release-task authorization does not remove those enforced review gates.

README's current-release pin example still selected 0.2.0 although its availability notice correctly selected published 0.2.1. Preparation corrects that example to the actual published patch; it must switch to 0.2.2 only after independent public verification.

The source-upgrade integration fixture clones committed HEAD while invoking the working-tree CLI. Commit the reviewed version changes before running the full gate so candidate and fixture versions agree; do not weaken its version assertion.

## Decision Log


Decision (2026-10-01): extend the existing unmerged model PR with release preparation rather than create a dependent second PR. The maintainer asked to roll this work into stable, and a single review covers the final catalog and candidate versions. Preserve main and release-environment review protection; do not move published tags or reuse prior-release certification.

Decision (2026-10-01): use 0.2.2 because 0.2.1 is the latest published stable and no next tag exists. This is a compatible patch line with explicit repair for retired upstream IDs and no database migration. Keep previous signatures, assets and evidence immutable.

Decision (2026-10-01): retain 0.2.1 public availability until 0.2.2 protected publication and all public installs pass. Current source/PR checks cannot establish public availability or paid provider performance.

## Outcomes & Retrospective


Preparation and full local verification are complete at source commit `7c1d85cb1cf0e3426640a907c21d5e9953c52009`; the candidate checkpoint at `ce6541a` passed all applicable hosted checks. Final reconciliation-head checks are recorded separately for the actual pushed head in PR #75's validation section. Reviewed merge and protected publication are outstanding: GitHub still reports `REVIEW_REQUIRED`/`BLOCKED` with zero reviews. The existing 0.2.1 publication stays available. No tag, release asset, environment policy or private signing material has been changed during preparation. Retain exact-head hosted evidence in PR #75 rather than triggering repeated evidence-only runs.

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


Initial observed evidence on 2026-10-01: latest stable v0.2.1, PR #74 merged at `f5e811b39fe9d092b6ac9e32ce1c97a757e7049d`, PR #75 head `d8a02d6438c7c808faea2235e08ac97e2c49a3a6` with 13 successful applicable checks, zero open scanner alerts and zero unresolved review threads. PR #75 still requires an approving review. These prior checks do not certify the version-preparation revision.

Candidate local log: `coverage/release-0.2.2-verify.log` (ignored). All 72 Vitest suites, version/executable/docs-truth assertions, source-upgrade version checks and both zero-finding dependency audits passed. Supplementary `pnpm exec tsx --test --test-name-pattern='keeps public' tests/node/install-bootstrap-idempotence.test.ts` passed two installer cases with Git Bash available. Final candidate-head hosted run IDs and conclusions are retained in PR #75's validation section; no earlier head or parent result certifies that revision.

## Interfaces and Dependencies


No additional production dependency, schema migration, provider auth change or endpoint rewrite is introduced by release preparation. Preserve the existing shared catalog and adapter contracts; generic backend IDs and Azure deployment/auth boundaries remain explicit. Keep Axios 1.20.0, Undici 6.28.1 and brace-expansion 5.0.12 advisory floors, Node 24.21.0, pnpm 12.5.1 and mandatory production signature checks unchanged.

Revision note (2026-10-01): initialized stable 0.2.2 preparation from actual publication/PR/protection evidence and maintainer rollout authorization. Review, candidate checks and protected publication remain distinct gates.

Revision note (2026-10-01 local validation): recorded complete candidate verification, actual executable versions, supplemental Bash checks and merged-parent CI/CodeQL evidence. This evidence-only revision requires separate hosted checks and does not establish merged-main or publication success.

Revision note (2026-10-01 hosted checkpoint): recorded actual successful candidate runs, zero audits on all three platforms and separate scanner/review-thread queries. The remaining enforced review/merge and protected-publication gates are explicit; final documentation-head checks are maintained in the PR body before merge.
