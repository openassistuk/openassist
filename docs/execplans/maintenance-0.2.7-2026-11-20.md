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
- [x] (2026-11-20) Runtime head bfd1475 passes four native packages/signing contracts (44762189393), PR/full-branch CodeQL (44762189370/44762191512, analysis 2215427776, zero results), live macOS (44762189411) and Linux/macOS lifecycle E2E (44762203555). CI 44762189391 has Linux/macOS/workflow lint passing with Windows running; service 44762196856 has Linux passing and macOS unassigned.
- [x] (2026-11-20) Final preparation head 987578c passes all seven workflows and thirteen applicable PR checks, reconciled in PR #100 Validation. Preserve the initial unassigned Apple Silicon queue delay; attempt 1 acquired a runner and passed without a retry.
- [x] (2026-11-20) Maintainer confirms merging PR #100 at 17:40:26 UTC as b6ef8a7. The earlier normal agent merge was refused by the review rule; no agent bypass/protection change occurred. Verify actual main and close #98/#99 as superseded under explicit authorization.
- [x] (2026-11-20) Exact-main CI 44785542154/full CodeQL 44785542181 pass attempt 1 with zero audits/results. Annotated v0.2.7 targets b6ef8a7; preflight passes and only exact v0.2.7 is added to the unchanged protected environment.
- [x] (2026-11-20) Protected publication 44787107926 and all four public-install targets pass attempt 1. Signed v0.2.7 is published at 17:55:38 UTC from exact main/tag b6ef8a7 with sixteen assets; see the [release plan](stable-0.2.7-release.md).
- [x] (2026-11-20) Independently verify both signatures, all sixteen GitHub asset sizes/digests, signed stable/private Node 24.22.3 identity and unchanged v0.2.6 tag/assets. Final environment comparison preserves all older policies/reviewers and adds only exact v0.2.7.
- [ ] Deliver reconciled availability/evidence docs through the separate reviewed follow-up and record its actual final-head checks.

## Surprises & Discoveries

The official Node distribution index identifies 24.22.3 as the newest Node 24 release and marks it security-related. Its release notes list HTTP/TLS/parser/buffer-lifetime security fixes that npm dependency audits do not inspect. The repository still pins bundled/CI Node 24.21.0; advance runtime and minimum together, retain historical records and validate the exact shipped runtime. A local official Windows archive is checksum-verified against Node SHASUMS and extracted only under ignored Git evidence storage.

The historical high advisory is withdrawn, rather than fixed by a source change. Current audits correctly return zero without suppression. Historical CI failures remain evidence, not current vulnerabilities. The macOS failure annotation says the job was not acquired by a hosted runner; no product fix can certify that execution.

The SDK 1.6.0 client defaults to API version 2026-10-21, but the adapter already pins 2023-06-01. Extend existing regressions to assert both token-count and inference headers and conflicting ambient-header isolation for API-key/OAuth auth; no production adapter change is needed. Pin the reviewed SDK version exactly rather than inadvertently resolving 1.10.0 from its caret range.

Main is protected by an active ruleset requiring an approving review and seven checks, rather than the legacy branch-protection endpoint. Preserve those rules. The baseline installation also advertises a newer pnpm; review the compatible minor upgrade and synchronize the pinned toolchain if adopted.

## Decision Log

Decision (2026-11-20): include Node 24.22.3 security maintenance in the authorized warning/release scope. Reject old patch levels rather than shipping a repaired package with permissive vulnerable source guards. Revalidate all native artifacts on the new exact head; earlier successful checks do not certify this follow-up.

Decision (2026-11-20): work on `codex/maintenance-0.2.7` from clean current main, incorporate reviewed pending dependency changes, and preserve existing policy, auth, replay, model and codec contracts. Do not dismiss alerts or weaken quality/coverage/security checks.

Decision (2026-11-20): the user's release request authorizes the normal branch/PR/tag/release workflow. Existing independent review and environment approval requirements remain effective; do not bypass them or retrieve signing secrets.

## Outcomes & Retrospective

Candidate implementation and metadata, including Node 24.22.3 security maintenance, are prepared. Frozen installation and build succeed without dependency/compiler/deprecation warnings. Twenty-six focused Node contracts (docs, audits, dependency floors and deployed audio/media) pass; 77 focused provider/bootstrap cases pass, followed by 50 Anthropic cases after API-version assertions. Initial full verification passes (690 Vitest passes/one skip; 257 Node passes/six skips; Vitest statements 84.64%, branches 76.41%, functions 87.32%, lines 85.57%; Node statements/lines 79.93%, branches 73.73%, functions 85.60%; zero audits). Full verification on Node 24.22.3 also passes: 690 Vitest passes/one skip, 267 Node passes/six skips, Vitest branches 76.42% (other totals unchanged), unchanged Node coverage and zero audits. Final preparation-head workflows all pass, and the maintainer merged #100 as b6ef8a7. Fresh exact-main CI/full CodeQL also pass with zero audits/results; exact v0.2.7 is tagged/authorized and publication 44787107926 succeeds on attempt 1, including protected signing and all four public-install targets. Signed v0.2.7 is public stable with sixteen assets; both signatures/digests, unchanged v0.2.6 and preserved environment rules independently verify. Availability/evidence docs are prepared for their separate reviewed follow-up, with all eleven focused docs-truth checks passing. Live provider/account/channel certification remains unverified.

## Context and Orientation

`pnpm-workspace.yaml` owns narrow security overrides, explicit build permissions and the exact Baileys codec patch. `pnpm-lock.yaml` records resolutions. PR #99 proposes eight routine updates; PR #98 proposes Anthropic SDK 1.6.0, whose major API-version change requires explicit compatibility review. Provider request mapping lives under `packages/providers-*`; configuration/model catalogs remain authoritative.

`package.json`, `apps/openassist-cli/package.json` and `apps/openassistd/package.json` must agree on 0.2.7. Reviewed notes belong at `docs/releases/v0.2.7.md`. `.github/workflows/release.yml` builds Linux glibc/macOS x64/arm64, exercises deployed media/private Node/lifecycle, verifies ephemeral signing, then uses the existing protected release environment. Publication requires current exact-main CI and full CodeQL through `scripts/release/check-publication-checks.mjs`. Public-install jobs verify stable and exact-version downloads and data-preserving uninstall.

## Plan of Work

Review upstream release changes against the APIs actually used. Apply compatible dependency updates and synchronize any pinned tooling change in bootstrap, workflows, current contributor/operator docs and existing contracts, preserving historical release evidence. Run installation/build and inspect warnings before completing targeted repairs. Prepare versioned changelog and notes, update existing README navigation without adding a release diary, and document risks/testing limits.

Commit the reviewable candidate before clone-based lifecycle tests. Run full local verification, then publish the branch and normal PR with concrete results. Check unresolved review threads and both main and branch/PR scanning refs independently of workflow success. Once reviewed and merged, require fresh checks on the exact main commit before tagging and protected publication. Only after public verification update availability claims, without moving the release tag.

## Concrete Steps

Work in `C:\Users\dange\Coding\openassist` with Node >=24.22.3 <25 and pinned pnpm 12.21.0. Keep local logs/snapshots in ignored `.git/maintenance-2026-11-20`.

    pnpm install --frozen-lockfile
    pnpm build
    pnpm exec tsx --test tests/node/dependency-security-overrides.test.ts tests/node/dependency-audit.test.ts tests/node/cli-docs-truth.test.ts
    git diff --check
    pnpm verify:all

Then inspect actual PR checks, dispatch the existing service/lifecycle/full-branch CodeQL workflows as needed, merge normally after review, and verify exact-main CI/CodeQL. Dispatch `release.yml` from exact `v0.2.7` with `tag=v0.2.7`, `channel=stable`, `publish=true`, preserving protected approval. Record actual run IDs and outcomes as work completes.

## Validation and Acceptance

Installation/build must have no actionable dependency/compiler/deprecation warnings. Preserve paired Vitest/coverage, source coverage scope, mandatory thresholds, production/full audits and explicit build permissions. Native artifact checks must exercise the deployed codec graph. SDK updates must preserve configured credentials/endpoints, disabled SDK telemetry/logging, bounded replay, model settings and existing tool policy. Public acceptance requires verified signatures/digests and passing installation on all four supported targets; source success alone is insufficient. Paid/live provider/account testing remains separate.

## Idempotence and Recovery

Preserve original tags/assets and operator state. Never force-push main or bypass review. Keep signed assets immutable; failed public verification uses `verify_published=true`, not republishing. Retain historical infrastructure failures separately from unchanged-code retries. Add only the exact new environment tag policy while comparing snapshots to preserve every older policy and reviewer rule.

## Artifacts and Notes

[Preparation PR #100](https://github.com/openassistuk/openassist/pull/100) is maintainer-merged as b6ef8a7, with its final 987578c head fully checked in PR Validation. Initial pre-runtime head e897acc passes PR CodeQL 44761306712, full branch CodeQL 44761302449, native/signing 44761307012, live macOS 44761306883 and lifecycle E2E 44761312980. These do not certify the subsequent runtime update. Initial service smoke 44761307497 remained queued and may be superseded deliberately. Baseline CI latest success: 44743558561. Historical audit failure: 44312004808; lifecycle runner failure: 44129234025. Current published stable is verified v0.2.7; v0.2.6 remains immutable. Initial branch/PR scanning and all audit/security listings are clean. Full raw evidence remains ignored under the Git directory.

## Interfaces and Dependencies

No new runtime privilege, configuration/database compatibility version, provider model or channel capability is planned. Retain existing SDK/tool/lifecycle contracts and codec alias/patch/peer wiring. Toolchain upgrades must retain shell-free literal process arguments and native pnpm installation with explicit script permissions.

Revision note (2026-11-20): record the authorized scope, actual baseline evidence, historical failure diagnosis and release acceptance gates before implementation.

Revision note (2026-11-20): record reviewed dependency/tooling implementation, explicit SDK-version compatibility and successful focused checks before the committed full gate.

Revision note (2026-11-20): record initial complete gate and the independently discovered Node runtime security gap; extend scope within the authorized maintenance release and require fresh runtime/native verification.

Revision note (2026-11-20): record exact initial hosted successes and patched-runtime focused validation; final checks must target the upcoming runtime-security commit.

Revision note (2026-11-20): record completed final patched-runtime full verification, actual native/security/lifecycle results and the separate remaining hosted review/publication gates. Final metadata-head reconciliation belongs in PR #100 Validation, avoiding an endless sequence of evidence-only commits.

Revision note (2026-11-20): reconcile the final PR head, actual maintainer merge, superseded dependency closure and fresh exact-main/tag evidence; retain production publication/public verification as separate pending gates.

Revision note (2026-11-20): close production/public-verification milestones with exact run/time/signature/digest evidence and preserve the separate availability-documentation review gate.
