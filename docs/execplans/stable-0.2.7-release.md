# Publish and verify the 0.2.7 maintenance release

This living ExecPlan follows `.agents/PLANS.md`. Keep Progress, Surprises & Discoveries, Decision Log and Outcomes & Retrospective current. The maintainer explicitly confirmed merging PR #100 and authorized closing superseded PRs #98/#99 and completing the 0.2.7 release. Preserve existing review/protection rules, immutable older releases and separate source/publication/live-provider evidence.

## Purpose / Big Picture

Deliver the reviewed dependency/tooling and Node 24.22.3 security maintenance in signed stable v0.2.7. Operators can install it publicly or explicitly update existing packaged installations while retaining configuration, credentials and conversation state. Signed v0.2.7 is now the public stable target after protected publication and successful installation on all four targets; v0.2.6 remains immutable.

## Progress

- [x] (2026-11-20) Verify PR #100 merged at 17:40:26 UTC as `b6ef8a7d2cb24d638424db522c66f6941a0eebb1`; fetch and fast-forward clean local main to that exact commit.
- [x] (2026-11-20) Confirm the merged dependency updates and close #98/#99 as superseded with links to the merged preparation. No open PRs remain at this checkpoint.
- [x] (2026-11-20) Snapshot the existing release environment, all eight older exact tag policies and immutable v0.2.6 release/tag/assets. Confirm no v0.2.7 tag exists; root/CLI/daemon versions and reviewed notes agree on 0.2.7. Current default-branch security listings are empty.
- [x] (2026-11-20) Exact-main CI 44785542154 and full CodeQL 44785542181 pass attempt 1 with every required job. All three platform production/full audits are zero; analysis 2216515489 has zero results/errors. PR #100 has no unresolved review threads; current security listings are empty.
- [x] (2026-11-20) Create/push annotated v0.2.7 object `6fd576b858cff4fe97b3e0d0c0a1e963a7cd795d` pointing only to b6ef8a7. Read-only publication preflight passes. Add only exact v0.2.7; snapshot comparison confirms all eight older policies and complete reviewer/protection rules are unchanged.
- [x] (2026-11-20) Dispatch [stable publication 44787107926](https://github.com/openassistuk/openassist/actions/runs/44787107926) from the exact tag, with stable/publish inputs explicitly selected. Create local availability branch from the immutable release merge; availability claims remain unchanged pending public verification.
- [x] (2026-11-20) Publication 44787107926 passes all four native packages, Linux full candidate quality/live lifecycle/zero audits and ephemeral signing. Recheck exact-main preflight, approve the existing protected deployment using its unchanged reviewer rule, and require the publish job's own exact-main recheck. No signing key is retrieved locally.
- [x] (2026-11-20 17:55:38 UTC) Protected publication succeeds with sixteen assets, release ID 453013165 and GitHub latest stable selecting v0.2.7. Independently verify both RSA/SHA-256 signatures, signed format agreement, all sixteen GitHub sizes/digests and exact stable b6ef8a7/private Node 24.22.3 identity. Previous v0.2.6 tag/release/asset identities/digests are unchanged. Final environment snapshots retain every reviewer/protection rule and all eight older policies, with only exact v0.2.7 added.
- [x] (2026-11-20) All four public-install targets pass stable-channel and exact-version installation, CLI/daemon versions, update planning and data-preserving uninstall. Publication run 44787107926 completes successfully on attempt 1, with no retry or asset replacement.
- [x] (2026-11-20) Reconcile root/operator/contributor/testing/security/channel availability, exact update pins, changelog and both living plans on `codex/release-0.2.7-availability`. All eleven docs-truth contracts pass, including links/anchors/index, executable versions, command flags, workflow claims, coverage scope/thresholds and test inventory. Review the installed update help and documentation-only diff; preserve all historical repair entries and immutable tags/assets.
- [ ] Deliver the documentation follow-up through its required reviewed PR and reconcile final actual-head checks there. The release tag remains on original verified main b6ef8a7.

## Surprises & Discoveries

The preparation PR's final head `987578c0610e096bd5e7f46d5466de57b8411c35` passed all seven preparation workflows and thirteen applicable PR checks. Its exact-head final record is in PR #100 Validation. The initial normal merge attempt was refused by the main ruleset's required approving review; the agent did not bypass it. The maintainer subsequently confirmed the merge above. PR success does not certify the new merge commit, and its publication checks/public-install jobs were intentionally skipped in PR mode.

Preparation retained withdrawn picomatch advisory GHSA-fc5q-39xc-vjpf and historical unassigned macOS runners as separate evidence. It additionally found bundled Node 24.21.0 outside npm audits and advanced both packaged/CI runtime and source minimum to security release 24.22.3. Source operators must update shell/service runtimes; older immutable packages retain their shipped runtime.

## Decision Log

Decision (2026-11-20): release only 0.2.7 from the maintainer-merged b6ef8a7 commit, after fresh exact-main checks. The user's explicit release instruction covers the exact tag, normal protected approval and publication; preserve every existing reviewer/protection rule and keep signing secrets exclusively in the protected runner.

Decision (2026-11-20): retain this publication evidence locally until the immutable target is established, then include it in the separate availability follow-up. Public release metadata may be reconciled after verification; never replace signed assets or move the tag to an evidence commit. Live provider/account testing remains separately unverified.

## Outcomes & Retrospective

PR #100 is merged and both superseded dependency PRs are closed. Exact-main CI/full CodeQL pass attempt 1, all platform audits and main analysis are zero, and preflight passes. Annotated v0.2.7 targets only b6ef8a7. Exact-tag authorization preserves every older policy and reviewer rule. Publication 44787107926 succeeds on attempt 1, including native packages, Linux full candidate/live lifecycle/zero audits, ephemeral signing, normal protected approval/production signing and all four public-install targets. Stable v0.2.7 was published at 17:55:38 UTC with sixteen assets, and latest stable selects it. Both production signatures/all sixteen digests and unchanged v0.2.6 independently verify. Final environment comparison preserves reviewers, all eight older policies and the exact v0.2.7 addition. Availability documentation is prepared on its separate branch and all eleven focused docs-truth contracts pass. Mandatory full quality, normal reviewed delivery and final actual-head checks remain pending. Live provider/account/channel and replacement-host certification remain separate and unverified.

## Context and Orientation

`package.json`, `apps/openassist-cli/package.json` and `apps/openassistd/package.json` define 0.2.7. `docs/releases/v0.2.7.md` and the versioned changelog contain the reviewed scope. The [maintenance plan](maintenance-0.2.7-2026-11-20.md) records source changes and local verification: 690 Vitest passes/one existing skip, 267 Node passes/six existing platform skips, unchanged coverage gates and zero audits. Anthropic SDK 1.6.0 retains explicit API version 2023-06-01, credential/workspace isolation, disabled tracing/logging and bounded replay. No schema, privilege, model-default or channel capability expansion is included.

`.github/workflows/release.yml` builds Linux glibc/macOS x64/arm64 with private Node 24.22.3. `scripts/release/check-publication-checks.mjs` requires the latest successful CI/full CodeQL for the exact main commit before publication and again after protected approval. Four packages, live Linux lifecycle, Linux full quality/audits and ephemeral signing contracts remain mandatory. The protected publish job alone receives production signing material.

The sixteen release assets are four application archives, four compressed bootstrap runtimes, four standalone verifiers, JSON manifest/signature and text index/signature. Public-install jobs use unauthenticated public assets on all four operator targets and verify stable/exact-version installation and data-preserving uninstall.

## Plan of Work

Wait for exact-main CI/full CodeQL and inspect actual jobs, analysis results, audit counts and open scanning/review state. Tag only b6ef8a7 after success, execute the repository's read-only publication preflight, authorize only exact v0.2.7 in the existing release environment and compare snapshots. Dispatch publication from that tag with stable channel explicitly selected. Require all native/candidate/signing gates, then use the existing normal protected approval without changing its reviewer rules or retrieving secrets.

After publication, independently verify signed metadata and GitHub asset digests, exact build/runtime identity and unchanged v0.2.6. Complete all public-install jobs before updating availability claims. Create the documentation follow-up from actual main, maintain concise README pointers, preserve historical evidence and recheck documentation/quality/workflow claims against source. Record final actual-head PR checks in its Validation section to avoid an endless evidence-only commit loop.

## Concrete Steps

Work in `C:\Users\dange\Coding\openassist`; use Node >=24.22.3 <25 and pnpm 12.21.0. Ignored raw evidence is under `.git/maintenance-2026-11-20`.

    gh run view 44785542154
    gh run view 44785542181
    git tag -a v0.2.7 b6ef8a7d2cb24d638424db522c66f6941a0eebb1 -m "OpenAssist v0.2.7 maintenance release"
    git push origin refs/tags/v0.2.7
    gh workflow run release.yml --ref v0.2.7 -f tag=v0.2.7 -f channel=stable -f publish=true -f verify_published=false

Before dispatch, run `scripts/release/check-publication-checks.mjs` with exact tag/commit/repository and a child-only GitHub token environment; never print or persist the token. After publication, `.git/maintenance-2026-11-20/verify-publication.mjs` checks both signatures, signed format agreement, sixteen asset sizes/digests, exact commit/runtime and unchanged previous release. Follow-up documentation uses `pnpm exec tsx --test tests/node/cli-docs-truth.test.ts`, `git diff --check` and the mandatory quality gate.

## Validation and Acceptance

Success requires the latest matching exact-main CI/full CodeQL, zero audits/analysis results, native packages/live lifecycle/ephemeral signing, normal protected production publication, two verified signatures/all sixteen digests, and four successful public-install targets. A pending, skipped, failed or unrelated-commit check is not success. Preserve infrastructure failures and justified unchanged-code retries separately. No live provider/account/channel certification is inferred.

## Idempotence and Recovery

Do not recreate or force-move an existing tag. Preserve older environment policies/reviewers and all older signed assets. Failed public verification uses `verify_published=true` against unchanged published assets, never rebuilding or replacing them. Keep operator state and signing material untouched locally. Documentation follow-up cannot change the immutable release target.

## Artifacts and Notes

Current exact main: b6ef8a7d2cb24d638424db522c66f6941a0eebb1. Main CI: 44785542154; full CodeQL: 44785542181. Earlier immutable stable v0.2.6 identity/assets and prepublication environment/policy snapshots are retained under ignored Git evidence storage. PR #100 records the final preparation-head workflow IDs and local coverage totals independently.

## Interfaces and Dependencies

No additional runtime dependency or product change is required for publication. Retain the pinned public key, schema/config/database compatibility 1, managed-one-shots-v1 feature, existing tool/access policy and exact codec patch/alias/peer wiring. Availability updates are documentation/release-metadata changes only.

Revision note (2026-11-20): record explicit publication authorization, actual merge/superseded-PR closure and the remaining exact-main/protected-publication/public-verification gates before tagging.

Revision note (2026-11-20): record exact-main job/audit/analysis success, immutable tag identity, unchanged environment protections and stable publication dispatch before production signing.

Revision note (2026-11-20): record normal protected approval, successful production publication and all four public-install targets on attempt 1, both independent signatures/all sixteen digests and unchanged older release/protections. Reconcile public availability only after those observations; deliver docs through their separate reviewed PR.

Revision note (2026-11-20): record the verified availability/evidence documentation follow-up and successful focused truth-source checks before committing its full quality/hosted review gate. Final metadata-head reconciliation belongs in that PR Validation rather than an endless series of evidence-only commits.
