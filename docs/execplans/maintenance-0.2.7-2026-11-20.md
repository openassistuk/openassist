# Repair maintenance warnings and publish 0.2.7

This living ExecPlan follows `.agents/PLANS.md`. Keep Progress, Surprises & Discoveries, Decision Log and Outcomes & Retrospective current. The maintainer authorized fixing repository warnings and rolling a maintenance release. Preserve required review, protected signing, immutable previous releases and the distinction between source checks and public availability.

## Purpose / Big Picture

Deliver a signed, publicly installable maintenance release with reviewed dependency updates and clean quality, audit and security checks. Existing packaged operators receive changes only through an explicit update. Signed v0.2.7 is now the published stable release after protected publication and all four public installation checks; older v0.2.6 remains immutable.

## Progress

- [x] (2026-11-20) Inspect clean main `8667c6cb00d086f000ec67bf4a23ffcfd00c313c`, repository instructions, release discipline, pending PRs #98/#99, security alert listings and failed scheduled jobs.
- [x] (2026-11-20) Frozen baseline installation succeeds; production/full audits both report zero vulnerabilities. Default and both pending PR code-scanning alert listings are empty; Dependabot and secret-scanning listings are empty.
- [x] (2026-11-20) Diagnose November 18 audit failure from retained coverage artifact: development picomatch 4.0.7, GHSA-fc5q-39xc-vjpf, withdrawn 2026-11-18 15:38:56 UTC. Diagnose November 17 lifecycle failure as macOS hosted runner acquisition failure with no executed steps; Linux passes.
- [x] (2026-11-20) Apply PR #99 routine updates and exact Anthropic SDK 1.6.0, remove its obsolete age exception, pair Vitest/coverage-v8 5.1.0 and advance pnpm 12.21.0. Synchronize bootstrap/workflows/current docs and 0.2.7 versions/notes. Hosted npm installs omit unnecessary --force.
- [x] (2026-11-20) Initial full local verification passes before the runtime-security follow-up: 690 Vitest passes/one skip, all Node tests and coverage gates, zero production/full audits. Full logs remain separate from subsequent Node 24.22.3 verification.
- [x] (2026-11-20) Advance bundled/CI/source Node minimum to security release 24.22.3; synchronize entry/preflight/bootstrap guards and current guidance. On checksum-verified 24.22.3, frozen install/build and 32 focused runtime/bootstrap/docs cases pass (three existing platform skips). Initial focused run exposed one stale escaped-version assertion, corrected before the successful rerun.
- [x] (2026-11-20) Final full local gate on checksum-verified Node 24.22.3 passes at bfd1475: 690 Vitest passes/one skip; 267 Node passes/six skips; unchanged coverage thresholds and zero production/full audits. No actionable compiler/dependency/deprecation warnings.
- [x] (2026-11-20) Runtime head bfd1475 passes four native packages/signing contracts (44762189393), PR/full-branch CodeQL (44762189370/44762191512, analysis 2215427776, zero results), live macOS (44762189411) and Linux/macOS lifecycle E2E (44762203555). Intermediate CI 44762189391 and service 44762196856 were cancelled when superseded by final preparation-head verification; their partial results do not certify the final head.
- [x] (2026-11-20) Final preparation head 987578c passes all seven workflows and thirteen applicable PR checks, reconciled in PR #100 Validation. Preserve the initial unassigned Apple Silicon queue delay; attempt 1 acquired a runner and passed without a retry.
- [x] (2026-11-20) Maintainer confirms merging PR #100 at 17:40:26 UTC as b6ef8a7. The earlier normal agent merge was refused by the review rule; no agent bypass/protection change occurred. Verify actual main and close #98/#99 as superseded under explicit authorization.
- [x] (2026-11-20) Exact-main CI 44785542154/full CodeQL 44785542181 pass attempt 1 with zero audits/results. Annotated v0.2.7 targets b6ef8a7; preflight passes and only exact v0.2.7 is added to the unchanged protected environment.
- [x] (2026-11-20) Protected publication 44787107926 and all four public-install targets pass attempt 1. Signed v0.2.7 is published at 17:55:38 UTC from exact main/tag b6ef8a7 with sixteen assets; see the [release plan](stable-0.2.7-release.md).
- [x] (2026-11-20) Independently verify both signatures, all sixteen GitHub asset sizes/digests, signed stable/private Node 24.22.3 identity and unchanged v0.2.6 tag/assets. Final environment comparison preserves all older policies/reviewers and adds only exact v0.2.7.
- [x] (2026-11-20) Deliver availability/evidence docs through [PR #101](https://github.com/openassistuk/openassist/pull/101), merged as `83783b2b13d9b313e1a5b2951b599f1e9bb13bf0`. Its final documentation head a865ac8 passes full local verification, eleven docs-truth contracts and all thirteen applicable hosted checks; final merge verification is recorded in PR Validation and the release plan.
- [x] (2026-11-20) Merge the Windows lifecycle-test repair through [PR #102](https://github.com/openassistuk/openassist/pull/102) as `34230364b20ca9ca36c68181ea1dcb7b25c17aef`. [Post-merge CI 44800330198](https://github.com/openassistuk/openassist/actions/runs/44800330198) and [CodeQL 44800330076](https://github.com/openassistuk/openassist/actions/runs/44800330076) pass attempt 1, including Windows ordinary tests and coverage without a retry or timeout increase.
- [x] (2026-11-20) Complete fresh exact-main verification of all four scheduled workflows on 3423036: CI, CodeQL, Service Smoke and Lifecycle E2E Smoke. All ten jobs pass on attempt 1 without retries; final links and audit/analysis evidence are recorded below. Release maintenance and availability delivery are complete.

## Surprises & Discoveries

At the initial inspection, the official Node distribution index identified 24.22.3 as the newest Node 24 release and marked it security-related. Its release notes list HTTP/TLS/parser/buffer-lifetime security fixes that npm dependency audits do not inspect. Maintenance advanced the previous bundled/CI Node 24.21.0 pin and source minimum together to 24.22.3. A local official Windows archive was checksum-verified against Node SHASUMS and extracted only under ignored Git evidence storage.

The historical high advisory is withdrawn, rather than fixed by a source change. Current audits correctly return zero without suppression. Historical CI failures remain evidence, not current vulnerabilities. The macOS failure annotation says the job was not acquired by a hosted runner; no product fix can certify that execution.

The SDK 1.6.0 client defaults to API version 2026-10-21, but the adapter already pins 2023-06-01. Existing regressions were extended to assert both token-count and inference headers and conflicting ambient-header isolation for API-key/OAuth auth; no production adapter change was needed. The reviewed SDK version is pinned exactly, avoiding an unintended 1.10.0 resolution from its caret range.

Main is protected by an active ruleset requiring an approving review and seven checks, rather than the legacy branch-protection endpoint. Those rules were preserved. The initial baseline installation advertised a newer pnpm; the reviewed 12.21.0 update was adopted and synchronized across the toolchain.

The later Windows coverage timeout and the macOS rerun were separate follow-ups. [The Windows repair](windows-lifecycle-test-2026-11-20.md) removes repeated disk flushes from the rejection matrix while preserving real persistence coverage and the five-second deadline. Attempt 3 of the November 17 lifecycle run retained its old Node 24.21.0 workflow while cloning current main; a fresh main run uses 24.22.3 and passes both platforms. Neither historical failure is hidden by the final green runs.

## Decision Log

Decision (2026-11-20): include Node 24.22.3 security maintenance in the authorized warning/release scope. Reject old patch levels rather than shipping a repaired package with permissive vulnerable source guards. Revalidate all native artifacts on the new exact head; earlier successful checks do not certify this follow-up.

Decision (2026-11-20): work on `codex/maintenance-0.2.7` from clean current main, incorporate reviewed pending dependency changes, and preserve existing policy, auth, replay, model and codec contracts. Do not dismiss alerts or weaken quality/coverage/security checks.

Decision (2026-11-20): the user's release request authorizes the normal branch/PR/tag/release workflow. Existing independent review and environment approval requirements remain effective; do not bypass them or retrieve signing secrets.

Decision (2026-11-20): at the maintainer's explicit request, consolidate completed merge and fresh scheduled-workflow evidence in these tracked plans. Distinguish the immutable release commit b6ef8a7 from final verified source main 3423036, preserve historical failures and keep live provider/account/channel and replacement-host certification limits explicit.

## Outcomes & Retrospective

The maintenance implementation and metadata, including Node 24.22.3 security maintenance, are released. Frozen installation and build succeed without dependency/compiler/deprecation warnings. Twenty-six focused Node contracts (docs, audits, dependency floors and deployed audio/media) pass; 77 focused provider/bootstrap cases pass, followed by 50 Anthropic cases after API-version assertions. Initial full verification passes (690 Vitest passes/one skip; 257 Node passes/six skips; Vitest statements 84.64%, branches 76.41%, functions 87.32%, lines 85.57%; Node statements/lines 79.93%, branches 73.73%, functions 85.60%; zero audits). Full verification on Node 24.22.3 also passes: 690 Vitest passes/one skip, 267 Node passes/six skips, Vitest branches 76.42% (other totals unchanged), unchanged Node coverage and zero audits. Final preparation-head workflows all pass, and the maintainer merged #100 as b6ef8a7. Fresh exact-main CI/full CodeQL also pass with zero audits/results; exact v0.2.7 is tagged/authorized and publication 44787107926 succeeds on attempt 1, including protected signing and all four public-install targets. Signed v0.2.7 is public stable with sixteen assets; both signatures/digests, unchanged v0.2.6 and preserved environment rules independently verify.

Availability/evidence documentation is merged through #101, and the Windows test repair is merged through #102. Final source main 3423036 passes all four fresh scheduled workflows and all ten jobs on attempt 1, including Windows ordinary tests and coverage, with zero audits and CodeQL results. All release-scope milestones are complete. Live provider/account/channel and replacement-host certification remain separately unverified.

## Context and Orientation

`pnpm-workspace.yaml` owns narrow security overrides, explicit build permissions and the exact Baileys codec patch. `pnpm-lock.yaml` records resolutions. The release incorporates the routine updates proposed in #99 and the Anthropic SDK 1.6.0 update proposed in #98 after explicit API-version compatibility review; both PRs are closed as superseded by #100. Provider request mapping lives under `packages/providers-*`; configuration/model catalogs remain authoritative.

`package.json`, `apps/openassist-cli/package.json` and `apps/openassistd/package.json` must agree on 0.2.7. Reviewed notes belong at `docs/releases/v0.2.7.md`. `.github/workflows/release.yml` builds Linux glibc/macOS x64/arm64, exercises deployed media/private Node/lifecycle, verifies ephemeral signing, then uses the existing protected release environment. Publication requires current exact-main CI and full CodeQL through `scripts/release/check-publication-checks.mjs`. Public-install jobs verify stable and exact-version downloads and data-preserving uninstall.

## Plan of Work

Upstream release changes were reviewed against the APIs actually used. Compatible dependency updates and pinned tooling changes were synchronized across bootstrap, workflows, current contributor/operator docs and existing contracts, preserving historical release evidence. Installation/build warnings were inspected, targeted repairs completed, and the versioned changelog, release notes and existing README navigation updated with explicit testing limits.

The candidate was committed before clone-based lifecycle tests and delivered through reviewed #100 after full local and hosted verification. Unresolved review threads and main/branch/PR scanning refs were checked independently of workflow success. Fresh exact-main checks preceded tagging and protected publication. Availability claims changed through reviewed #101 after public verification, without moving the release tag; #102 and the final fresh scheduled runs completed the later test-repair and source-verification follow-ups.

## Concrete Steps

Work in `C:\Users\dange\Coding\openassist` with Node >=24.22.3 <25 and pinned pnpm 12.21.0. Keep local logs/snapshots in ignored `.git/maintenance-2026-11-20`.

    pnpm install --frozen-lockfile
    pnpm build
    pnpm exec tsx --test tests/node/dependency-security-overrides.test.ts tests/node/dependency-audit.test.ts tests/node/cli-docs-truth.test.ts
    git diff --check
    pnpm verify:all

The preparation, reviewed merge, exact-main checks and protected publication sequence is complete. Publication used exact `v0.2.7` with `tag=v0.2.7`, `channel=stable`, `publish=true`; do not redispatch publication or move its tag. Final read-only verification commands and run links are in the [release plan](stable-0.2.7-release.md#artifacts-and-notes).

## Validation and Acceptance

Installation/build must have no actionable dependency/compiler/deprecation warnings. Preserve paired Vitest/coverage, source coverage scope, mandatory thresholds, production/full audits and explicit build permissions. Native artifact checks must exercise the deployed codec graph. SDK updates must preserve configured credentials/endpoints, disabled SDK telemetry/logging, bounded replay, model settings and existing tool policy. Public acceptance requires verified signatures/digests and passing installation on all four supported targets; source success alone is insufficient. Paid/live provider/account testing remains separate.

## Idempotence and Recovery

Preserve original tags/assets and operator state. Never force-push main or bypass review. Keep signed assets immutable; failed public verification uses `verify_published=true`, not republishing. Retain historical infrastructure failures separately from unchanged-code retries. Add only the exact new environment tag policy while comparing snapshots to preserve every older policy and reviewer rule.

## Artifacts and Notes

[Preparation PR #100](https://github.com/openassistuk/openassist/pull/100) is maintainer-merged as b6ef8a7, with its final 987578c head fully checked in PR Validation. Initial pre-runtime head e897acc passes PR CodeQL 44761306712, full branch CodeQL 44761302449, native/signing 44761307012, live macOS 44761306883 and lifecycle E2E 44761312980. These do not certify the subsequent runtime update. Initial service smoke 44761307497 was cancelled and superseded by final preparation-head verification. Baseline CI success: 44743558561. Historical audit failure: 44312004808; lifecycle runner failure and later old-workflow rerun: 44129234025. Current published stable is verified v0.2.7; v0.2.6 remains immutable.

Final source verification is for exact main `34230364b20ca9ca36c68181ea1dcb7b25c17aef`: [CI 44813750458](https://github.com/openassistuk/openassist/actions/runs/44813750458), [CodeQL 44813754620](https://github.com/openassistuk/openassist/actions/runs/44813754620), [Service Smoke 44813759166](https://github.com/openassistuk/openassist/actions/runs/44813759166) and [Lifecycle E2E Smoke 44810028531](https://github.com/openassistuk/openassist/actions/runs/44810028531). All four are fresh workflow-dispatch runs on main, with run attempt 1 and all ten jobs successful without retries. All six platform production/full audits are zero; exact-main CodeQL analysis 2217758524 has zero results/errors. At closure, open CodeQL, Dependabot and secret-scanning listings are empty. Raw evidence remains ignored under `.git/scheduled-workflows-2026-11-20` and `.git/macos-e2e-2026-11-20`; the linked runs are the public evidence.

## Interfaces and Dependencies

No new runtime privilege, configuration/database compatibility version, provider model or channel capability is planned. Retain existing SDK/tool/lifecycle contracts and codec alias/patch/peer wiring. Toolchain upgrades must retain shell-free literal process arguments and native pnpm installation with explicit script permissions.

Revision note (2026-11-20): record the authorized scope, actual baseline evidence, historical failure diagnosis and release acceptance gates before implementation.

Revision note (2026-11-20): record reviewed dependency/tooling implementation, explicit SDK-version compatibility and successful focused checks before the committed full gate.

Revision note (2026-11-20): record initial complete gate and the independently discovered Node runtime security gap; extend scope within the authorized maintenance release and require fresh runtime/native verification.

Revision note (2026-11-20): record exact initial hosted successes and patched-runtime focused validation; final checks must target the upcoming runtime-security commit.

Revision note (2026-11-20): record completed final patched-runtime full verification, actual native/security/lifecycle results and the separate remaining hosted review/publication gates. Final metadata-head reconciliation belongs in PR #100 Validation, avoiding an endless sequence of evidence-only commits.

Revision note (2026-11-20): reconcile the final PR head, actual maintainer merge, superseded dependency closure and fresh exact-main/tag evidence; retain production publication/public verification as separate pending gates.

Revision note (2026-11-20): close production/public-verification milestones with exact run/time/signature/digest evidence and preserve the separate availability-documentation review gate.

Revision note (2026-11-20): close the completed #101 documentation delivery and #102 Windows repair, replace intermediate queued/running snapshots with their final cancelled states, and record all four final green scheduled runs on exact main 3423036. Preserve immutable release identity, historical failures and unverified live-testing limits.
