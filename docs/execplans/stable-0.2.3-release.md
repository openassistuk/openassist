# Prepare and publish stable 0.2.3


This living ExecPlan follows `.agents/PLANS.md`. Maintain Progress, Surprises & Discoveries, Decision Log and Outcomes & Retrospective as evidence arrives.

## Purpose / Big Picture


Deliver the merged media-security, dependency and CI repairs to packaged installations as signed stable `0.2.3`. A release is an immutable versioned package; merging source fixes alone does not update installed packages. After verified publication, an explicit stable update and `openassist --version` must select/report `0.2.3` while retaining operator configuration and data. The user authorizes preparation, reviewed merging, exact tagging, protected publication and public verification; required GitHub approvals remain in place.

## Progress


- [x] (2026-10-10 preparation) Confirm latest public stable is immutable `v0.2.2`, no `v0.2.3` tag/release exists and main is `ad2146255867260d7835c9248590011baf824b32`. Its CI `38073813356` and full CodeQL `38073813376` pass, with zero production/full audit findings on all three quality platforms. Separate code-scanning/Dependabot queries return zero alerts.
- [x] (2026-10-10 branch) Create `codex/release-0.2.3` from current clean main. Inspect project/release instructions, existing notes, executable-version contracts, publication workflow and actual main/environment protections. Work as a single agent.
- [x] (2026-10-10 candidate edits) Align root/CLI/daemon versions, versioned changelog, release notes and affected docs; retain `v0.2.2` public availability.
- [ ] Commit candidate metadata before source-clone tests, verify frozen installation and complete `pnpm verify:all`, executable-version checks and final diff review.
- [ ] Open/attach the preparation PR, inspect all exact-head hosted checks and separately reconcile scanner alerts/review threads. Obtain the required approving review and merge without an admin bypass.
- [ ] Verify the actual merged-main commit, authorize only its new exact tag, preserve environment reviewers and dispatch protected stable publication from that tag.
- [ ] Verify production signatures/digests and four public-install targets. Reconcile actual availability/evidence through a separately reviewed documentation PR; sync main and remove stale merged branches.

## Surprises & Discoveries


The conventional main branch-protection endpoint returns 404, but the active `Protect main` ruleset requires one approving review, resolved threads and seven named status checks. Auto-merge is disabled. Do not mistake the old endpoint for an unprotected branch or bypass the ruleset. The `release` environment requires one reviewer and permits only exact existing tags `v0.2.0-rc.1`, `v0.2.0`, `v0.2.1` and `v0.2.2` at the initial inspection. Authorizing the new exact tag must not relax those review requirements.

The source-update integration fixture clones committed HEAD while using the working-tree CLI. Commit the candidate version changes before the full gate so both versions agree. Existing version/docs contracts cover this metadata change; new implementation-mirroring tests are unnecessary.

## Decision Log


Decision (2026-10-10): prepare `0.2.3` as the next stable patch, using the existing release workflow and the user's explicit request to proceed through publication. This collects already reviewed compatible fixes without introducing another preview/version line or new runtime behavior. Retain the disclosed separate live-testing gaps.

Decision (2026-10-10): leave current public availability and normal installed/pinned commands at `v0.2.2` during preparation. Candidate notes clearly label post-publication `0.2.3` commands. Source checks, PR checks, actual merged-main checks and public verification certify distinct states.

Decision (2026-10-10): preserve all main/environment review rules, dependency floors, build permissions, coverage/audit gates and signatures. Complete the concrete candidate before requesting any missing required GitHub review. The user's rollout authorization covers ordinary branch/PR/tag/environment/workflow writes for this exact patch, but does not authorize bypassing required review.

## Outcomes & Retrospective


Baseline main is healthy and candidate metadata/docs are prepared on the isolated release branch. Local/hosted verification, required review/merge and publication remain in progress. No `0.2.3` tag, release or current-public-availability claim exists. Earlier releases remain immutable; fresh replacement-host and second-account provider/channel sessions are still unverified.

## Context and Orientation


`package.json`, `apps/openassist-cli/package.json` and `apps/openassistd/package.json` own candidate versions. `tests/node/cli-docs-truth.test.ts` checks all three manifests, built executable output, the versioned changelog and current notes links. `docs/releases/v0.2.3.md` becomes the reviewed GitHub release body. README, AGENTS, docs index, platform/quickstart/update guides, threat model and test matrix distinguish prepared source from public availability.

Merged PRs #77, #79, #80 and #81 supply workflow-lint/development dependency repairs, routine SDK/logging/test-tool updates and Sharp `0.35.5`/music-metadata `11.16.0` production media repairs. Their detailed source controls stay intact. Existing version/dependency/media/provider/logger suites validate the prepared graph; no provider API, access, configuration, schema or channel behavior changes are added here.

`.github/workflows/release.yml` builds Linux glibc and macOS packages on x64/arm64, tests real artifacts with ephemeral signing keys, and signs production metadata only in the protected environment. `scripts/release/check-publication-checks.mjs` requires latest matching main CI and actual full CodeQL for the exact tagged commit before and after protected approval. The RSA public key in `release-public.pem` is the fixed trust anchor; private signing material stays in the environment.

## Plan of Work


The first milestone aligns candidate versions and notes. Move merged Unreleased entries under `0.2.3`, add exact-version/stable update guidance that applies after publication, and link the candidate in all required documentation while retaining current `0.2.2` availability. Commit the candidate, perform frozen installation, run the mandatory full gate and executable versions, and inspect the final diff for accidental edits or secrets. Success is a coherent candidate whose existing version/docs/security tests and unchanged audits pass.

The second milestone publishes a reviewable preparation PR. Check workflow lint, Linux/macOS/Windows quality/coverage, full CodeQL, live macOS LaunchAgent, four native packages and signing contracts on its exact current head. Query open security alerts and unresolved review threads separately. Record exact-head results in the PR description to avoid repeated evidence-only pushes. Obtain the enforced approval before merging; do not use admin bypass or fabricate another review.

The third milestone publishes the exact reviewed main commit. Wait for its own main CI and full CodeQL, then create a new annotated `v0.2.3` tag without moving existing tags. Add only that exact tag to the release environment allowlist while preserving reviewers. Dispatch `release.yml` from `v0.2.3` with matching tag input, explicit stable channel and publication enabled. Inspect all prerequisites before the protected publish approval. Verify both production signatures, metadata version/commit/channel and every asset digest against the pinned key and signed metadata. Require successful public stable/exact installation and data-preserving uninstall on all four targets. If a public network check fails, retain the failure and retry verification-only against unchanged signed assets.

The final milestone reconciles public availability through a separate documentation PR after actual public verification. Update README, notes, docs index, lifecycle guides, changelog, AGENTS, security/testing records and this plan with exact outcomes, retaining historical failures and live-testing limitations. Run appropriate checks on that documentation revision, obtain its required review and merge, then sync local main and remove only proven merged branches.

## Concrete Steps


Run in `C:/Users/dange/Coding/openassist` with Node `24.21.0` and pnpm `12.5.1`. Keep generated logs under ignored `coverage/` and never print signing credentials.

    pnpm install --frozen-lockfile
    pnpm verify:all
    node apps/openassist-cli/dist/index.js --version
    node apps/openassistd/dist/index.js --version
    git diff origin/main --check

After approved preparation merge and exact-main verification, create/push the new annotated tag and authorize only that tag in the protected environment. Dispatch:

    gh workflow run release.yml --ref v0.2.3 -f tag=v0.2.3 -f channel=stable -F publish=true

If an already published public-install check needs an authorized network retry, use verification-only mode and retain the original failed run:

    gh workflow run release.yml --ref main -f tag=v0.2.3 -f channel=stable -F verify_published=true

Record actual branch, PR, tag, run IDs, attempts, heads and conclusions here or in the current PR validation record as milestones complete. Do not substitute an older green run or a PR analysis for the actual release commit.

## Validation and Acceptance


The candidate passes unchanged full quality, coverage and dependency audits; CLI/daemon report `0.2.3`. Required PR/main checks and reviews pass for their own actual heads. Signed release metadata names the exact reviewed tagged commit and stable channel. Both signatures and every asset digest verify independently against the production public key. Public installs and data-preserving uninstall succeed on Linux/macOS x64/arm64, with stable/latest selection and exact pins truthful. Published availability is updated only after those outcomes. No automated result claims fresh live provider/channel or exploit execution.

## Idempotence and Recovery


Preparation changes only source metadata/docs; operator credentials, databases and services remain untouched. Frozen install and verification are repeatable. Never force-update or replace published tags/assets, relax protections or bypass signature failure. A publication failure leaves actual state visible; inspect whether publication occurred before any retry. Verification-only retries do not rebuild, sign or overwrite assets. Application rollback does not restore operator databases.

## Artifacts and Notes


Initial base: `ad2146255867260d7835c9248590011baf824b32`, merged PR #81. Exact baseline [CI 38073813356](https://github.com/openassistuk/openassist/actions/runs/38073813356) and [CodeQL 38073813376](https://github.com/openassistuk/openassist/actions/runs/38073813376) are successful. Latest public stable is `v0.2.2`, published October 1 with sixteen assets. These historical facts do not certify the new preparation head, its future merge or `0.2.3` publication. Add concrete candidate evidence as it arrives.

## Interfaces and Dependencies


No new dependency, runtime API, schema migration or provider/channel configuration is introduced. Preserve existing media/security floors, paired test tooling, Node/pnpm requirements, owner-only secret handling, shared catalog and application boundaries. Release preparation uses the existing version and publication contracts rather than new flags or bypass routes.

Revision note (2026-10-10): initialize stable 0.2.3 from actual merged-main health, public-release state and active ruleset/environment protection. Record the user's end-to-end rollout authorization while retaining required GitHub review and separate source/public verification.
