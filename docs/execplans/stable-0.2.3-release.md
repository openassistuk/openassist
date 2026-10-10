# Prepare and publish stable 0.2.3


This living ExecPlan follows `.agents/PLANS.md`. Maintain Progress, Surprises & Discoveries, Decision Log and Outcomes & Retrospective as evidence arrives.

## Purpose / Big Picture


Deliver the merged media-security, dependency and CI repairs to packaged installations as signed stable `0.2.3`. A release is an immutable versioned package; merging source fixes alone does not update installed packages. After verified publication, an explicit stable update and `openassist --version` must select/report `0.2.3` while retaining operator configuration and data. The user authorizes preparation, reviewed merging, exact tagging, protected publication and public verification; required GitHub approvals remain in place.

## Progress


- [x] (2026-10-10 preparation) Confirm latest public stable is immutable `v0.2.2`, no `v0.2.3` tag/release exists and main is `ad2146255867260d7835c9248590011baf824b32`. Its CI `38073813356` and full CodeQL `38073813376` pass, with zero production/full audit findings on all three quality platforms. Separate code-scanning/Dependabot queries return zero alerts.
- [x] (2026-10-10 branch) Create `codex/release-0.2.3` from current clean main. Inspect project/release instructions, existing notes, executable-version contracts, publication workflow and actual main/environment protections. Work as a single agent.
- [x] (2026-10-10 candidate edits) Align root/CLI/daemon versions, versioned changelog, release notes and affected docs; retain `v0.2.2` public availability.
- [x] (2026-10-10 local validation) Commit candidate metadata before source-clone tests, verify frozen installation and complete `pnpm verify:all`, executable-version checks and final diff review.
- [x] (2026-10-10 preparation PR) Open and attach [PR #82](https://github.com/openassistuk/openassist/pull/82), `codex/release-0.2.3`, with candidate changes and concrete local validation evidence.
- [x] (2026-10-10 preparation merge) PR #82 merged at 18:35:11 UTC as `cc29135a8cddf45e032dd235a86cf8f854a6f124`. Its final head `67d8605e6d139e8d592aaef4c56faf27add677b5` passed all thirteen checks, including four packages and signing contracts; independent scanner/review-thread queries were clear. Local main is synchronized and the merged preparation branch is removed.
- [x] (2026-10-10 exact-main verification) CI `38076375804` and full CodeQL `38076375795`, both attempt 1, pass for `cc29135a8cddf45e032dd235a86cf8f854a6f124`. All three platform logs report zero production/full dependency findings. The read-only publication prerequisite validates latest runs and every required job; the merge tree equals the final preparation head.
- [x] (2026-10-10 exact tag and dispatch) Create annotated `v0.2.3` at `cc29135a8cddf45e032dd235a86cf8f854a6f124` (tag object `32635aa8dec9d17ed714d0808112663ff4daba99`). Add only exact `v0.2.3` to the release environment's tag policies, verify reviewer protections unchanged, and dispatch stable publication `38076780488` from that tag.
- [x] (2026-10-10 publication prerequisites and approval) Run `38076780488` passes exact-commit prerequisites, all four native packages, portable smoke, Linux live lifecycle/full candidate quality and signing contracts. Linux candidate production/full audits are zero. Revalidate current main checks and approve the waiting protected publish job through its existing reviewer gate (deployment `6985282222`).
- [x] (2026-10-10 publication) Protected production signing/publication succeeds in `38076780488`. GitHub publishes stable `v0.2.3` at 18:45:52 UTC with all sixteen assets; latest stable selects it.
- [x] (2026-10-10 independent cryptographic checks) Verify both downloaded metadata signatures against pinned `release-public.pem`, exact manifest version/channel/commit, and all sixteen GitHub asset digests against downloaded metadata or signed index/manifest entries.
- [x] (2026-10-10 public verification) Publication `38076780488`, attempt 1, finishes successfully. Linux/macOS x64/arm64 all pass public stable-channel and exact-version installation, CLI/daemon versions, update planning and data-preserving uninstall. No retry, skipped public target or asset replacement is needed.
- [x] (2026-10-10 availability edits) Update README, contributor rules, docs index, release notes, platform/quickstart/update guides, changelog and security/testing records on `codex/release-0.2.3-availability`, only after all public checks pass. Keep earlier immutable releases and fresh-host/live-testing gaps explicit.
- [ ] Validate and open/attach the availability documentation PR, reconcile its exact-head checks and required review, then merge, sync main and remove its merged branch.
- [ ] Update only the GitHub release body from the reviewed published notes after the documentation merge; retain every signed asset and the release tag unchanged.

## Surprises & Discoveries


The conventional main branch-protection endpoint returns 404, but the active `Protect main` ruleset requires one approving review, resolved threads and seven named status checks. Auto-merge is disabled. Do not mistake the old endpoint for an unprotected branch or bypass the ruleset. The `release` environment requires one reviewer and permits only exact existing tags `v0.2.0-rc.1`, `v0.2.0`, `v0.2.1` and `v0.2.2` at the initial inspection. Authorizing the new exact tag must not relax those review requirements.

The source-update integration fixture clones committed HEAD while using the working-tree CLI. Commit the candidate version changes before the full gate so both versions agree. Existing version/docs contracts cover this metadata change; new implementation-mirroring tests are unnecessary.

## Decision Log


Decision (2026-10-10): prepare `0.2.3` as the next stable patch, using the existing release workflow and the user's explicit request to proceed through publication. This collects already reviewed compatible fixes without introducing another preview/version line or new runtime behavior. Retain the disclosed separate live-testing gaps.

Decision (2026-10-10): leave current public availability and normal installed/pinned commands at `v0.2.2` during preparation. Candidate notes clearly label post-publication `0.2.3` commands. Source checks, PR checks, actual merged-main checks and public verification certify distinct states.

Decision (2026-10-10): preserve all main/environment review rules, dependency floors, build permissions, coverage/audit gates and signatures. Complete the concrete candidate before requesting any missing required GitHub review. The user's rollout authorization covers ordinary branch/PR/tag/environment/workflow writes for this exact patch, but does not authorize bypassing required review.

## Outcomes & Retrospective


Candidate `eccbd0d577f591dbd4514d73cbc4ed5b0b06df3d` passes frozen installation and `pnpm verify:all` on Windows with Node `24.21.0` and pnpm `12.5.1`: workflow lint, build/lint/typecheck, docs truth, 577 Vitest passes/one skip, 239 Node passes/six skips and both unchanged coverage gates. Vitest statements/branches/functions/lines are `83.24 / 74.35 / 85.85 / 84.22%`; Node coverage is `80.15 / 73.67 / 86.07 / 80.15%` with 126 passes/five platform skips. Production and full audit counts are zero at every severity. CLI and daemon both report `0.2.3`. Full verification output is retained under ignored `coverage/release-0.2.3-preparation-verify.log`.

Final candidate review confirms that only version metadata and required docs change; the lockfile, production implementation, dependency floors, build permissions, signatures and workflow gates remain unchanged. Manual review clarifies that GitHub's latest stable selection changes at publication, while public verification and documentation reconciliation are later gates. Final notes and evidence at `947ec6bba7649085feef824f810decc22fdd15d9` pass all eleven docs-truth checks and diff validation. Preparation [PR #82](https://github.com/openassistuk/openassist/pull/82) records all thirteen successful final-head checks and zero security alerts/unresolved review threads. It merged as `cc29135a8cddf45e032dd235a86cf8f854a6f124`. Its own [main CI](https://github.com/openassistuk/openassist/actions/runs/38076375804) and [full CodeQL](https://github.com/openassistuk/openassist/actions/runs/38076375795) pass, including zero production/full audit findings on Linux/macOS/Windows.

Annotated `v0.2.3` resolves to that verified preparation merge. Only its exact tag was added to the protected environment; existing policies and reviewer rules remain unchanged. [Stable publication 38076780488](https://github.com/openassistuk/openassist/actions/runs/38076780488) runs from the tag with explicit stable channel. Its exact-commit prerequisite, four native builds, portable smoke, live Linux lifecycle/full candidate quality and ephemeral signing contracts pass; candidate production/full audits are zero. The existing protected publish gate is approved after these prerequisites and another read-only main-check verification. Production signing/publication succeeds: GitHub publishes sixteen assets at 2026-10-10 18:45:52 UTC and latest stable selects `v0.2.3`.

Independent verification downloads the signed JSON/index and their signatures, validates both RSA/SHA-256 signatures against pinned `release-public.pem`, and confirms stable `0.2.3`, exact commit `cc29135a8cddf45e032dd235a86cf8f854a6f124`, private Node `24.21.0`, database version 1 and `managed-one-shots-v1`. All sixteen GitHub asset digests match downloaded metadata or signed index/manifest entries. Publication run `38076780488`, attempt 1, finishes successfully: all four public-install targets pass both stable-channel/exact-version selection, installed CLI/daemon versions, update planning and data-preserving uninstall. There are no failed/skipped public targets and no retry or asset replacement. Separate final scanner queries return zero code-scanning and Dependabot alerts.

Availability documentation is reconciled on `codex/release-0.2.3-availability` after these actual results. Its own local validation, exact-head hosted checks, required review/merge and subsequent GitHub release-body update remain outstanding. The published tag/assets remain immutable while later documentation changes progress. Fresh replacement-host/second-account provider/channel sessions are still unverified.

## Context and Orientation


`package.json`, `apps/openassist-cli/package.json` and `apps/openassistd/package.json` own candidate versions. `tests/node/cli-docs-truth.test.ts` checks all three manifests, built executable output, the versioned changelog and current notes links. `docs/releases/v0.2.3.md` becomes the reviewed GitHub release body. README, AGENTS, docs index, platform/quickstart/update guides, threat model and test matrix distinguish prepared source from public availability.

Merged PRs #77, #79, #80 and #81 supply workflow-lint/development dependency repairs, routine SDK/logging/test-tool updates and Sharp `0.35.5`/music-metadata `11.16.0` production media repairs. Their detailed source controls stay intact. Existing version/dependency/media/provider/logger suites validate the prepared graph; no provider API, access, configuration, schema or channel behavior changes are added here.

`.github/workflows/release.yml` builds Linux glibc and macOS packages on x64/arm64, tests real artifacts with ephemeral signing keys, and signs production metadata only in the protected environment. `scripts/release/check-publication-checks.mjs` requires latest matching main CI and actual full CodeQL for the exact tagged commit before and after protected approval. The RSA public key in `release-public.pem` is the fixed trust anchor; private signing material stays in the environment.

## Plan of Work


The first milestone aligns candidate versions and notes. Move merged Unreleased entries under `0.2.3`, add exact-version/stable update guidance that applies after publication, and link the candidate in all required documentation while retaining current `0.2.2` availability. Commit the candidate, perform frozen installation, run the mandatory full gate and executable versions, and inspect the final diff for accidental edits or secrets. Success is a coherent candidate whose existing version/docs/security tests and unchanged audits pass.

The second milestone publishes a reviewable preparation PR. Check workflow lint, Linux/macOS/Windows quality/coverage, full CodeQL, live macOS LaunchAgent, four native packages and signing contracts on its exact current head. Query open security alerts and unresolved review threads separately. Record exact-head results in the PR description to avoid repeated evidence-only pushes. Obtain the enforced approval before merging; do not use admin bypass or fabricate another review.

The third milestone publishes the exact reviewed main commit. Wait for its own main CI and full CodeQL, then create a new annotated `v0.2.3` tag without moving existing tags. Add only that exact tag to the release environment allowlist while preserving reviewers. Dispatch `release.yml` from `v0.2.3` with matching tag input, explicit stable channel and publication enabled. Inspect all prerequisites before the protected publish approval. Verify both production signatures, metadata version/commit/channel and every asset digest against the pinned key and signed metadata. Require successful public stable/exact installation and data-preserving uninstall on all four targets. If a public network check fails, retain the failure and retry verification-only against unchanged signed assets.

The final milestone reconciles public availability through a separate documentation PR after actual public verification. Update README, notes, docs index, lifecycle guides, changelog, AGENTS, security/testing records and this plan with exact outcomes, retaining historical failures and live-testing limitations. Run appropriate checks on that documentation revision, obtain its required review and merge, then update only the GitHub release body from the reviewed published notes without touching signed assets. Sync local main and remove only proven merged branches.

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


Initial base: `ad2146255867260d7835c9248590011baf824b32`, merged PR #81. Exact baseline [CI 38073813356](https://github.com/openassistuk/openassist/actions/runs/38073813356) and [CodeQL 38073813376](https://github.com/openassistuk/openassist/actions/runs/38073813376) are successful. At preparation, public stable was `v0.2.2`, published October 1 with sixteen assets. These historical facts do not certify `0.2.3`.

PR #82 merges as `cc29135a8cddf45e032dd235a86cf8f854a6f124`; its own [CI 38076375804](https://github.com/openassistuk/openassist/actions/runs/38076375804) and [full CodeQL 38076375795](https://github.com/openassistuk/openassist/actions/runs/38076375795), attempt 1, succeed. Annotated tag `v0.2.3` points to this commit. [Publication 38076780488](https://github.com/openassistuk/openassist/actions/runs/38076780488), attempt 1, succeeds across every build, prerequisite, signing and public-install job. Actual publication time is 2026-10-10 18:45:52 UTC, with sixteen uploaded stable assets and latest-stable selection. Independent checker output: `v0.2.3: stable, exact reviewed commit; both production signatures valid; all 16 GitHub asset digests match downloaded metadata or signed indexes/manifests`. Generated helpers, logs and downloaded signed metadata stay under ignored `coverage/`.

## Interfaces and Dependencies


No new dependency, runtime API, schema migration or provider/channel configuration is introduced. Preserve existing media/security floors, paired test tooling, Node/pnpm requirements, owner-only secret handling, shared catalog and application boundaries. Release preparation uses the existing version and publication contracts rather than new flags or bypass routes.

Revision note (2026-10-10): initialize stable 0.2.3 from actual merged-main health, public-release state and active ruleset/environment protection. Record the user's end-to-end rollout authorization while retaining required GitHub review and separate source/public verification.

Revision note (2026-10-10 local verification): record complete candidate quality/coverage/audits and actual executable versions. Clarify stable-catalog timing and preserve independent publication/public-verification gates. This evidence/docs revision requires its own docs-truth and hosted checks before review/merge.

Revision note (2026-10-10 PR creation): record attached preparation PR #82 and passing final docs-truth checks. Keep current-head hosted conclusions in the PR validation record so evidence updates do not repeatedly invalidate reviews and checks. The enforced approving review remains outstanding.

Revision note (2026-10-10 preparation merge): record the user's confirmed PR #82 merge, independently resolved merge SHA and successful final PR checks. Synchronize local main and retire the merged branch. Continue release evidence on `codex/release-0.2.3-availability`; tag only the verified immutable preparation merge, never a later documentation commit.

Revision note (2026-10-10 release dispatch): record successful exact-main CI/full CodeQL and zero audits, immutable annotated tag, narrowly added environment authorization with unchanged reviewers, and stable publication run 38076780488. Keep published availability pending until actual signing and public verification.

Revision note (2026-10-10 protected approval): record successful native/candidate/signing prerequisites and zero Linux candidate audits. Recheck latest exact-main runs, then exercise the existing protected approval gate under the user's release authorization; signing and downstream public checks still require actual results.

Revision note (2026-10-10 publication): record actual protected publication time, sixteen uploaded assets, latest-stable selection and independently valid production signatures/digests. Keep four-target public verification separate and wait for it before availability reconciliation.

Revision note (2026-10-10 public verification and availability): record successful terminal publication with all four public targets, no retry/replacement and zero separate security alerts. Reconcile actual public availability across the required docs on a new branch; retain its own validation/review/merge and reviewed release-body update as unfinished work.
