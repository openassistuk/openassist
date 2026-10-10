# Repair WhatsApp media dependency audits


This living ExecPlan follows `.agents/PLANS.md`. Keep Progress, Surprises & Discoveries, Decision Log and Outcomes & Retrospective current as work proceeds.

## Purpose / Big Picture


Restore scheduled Linux/macOS/Windows quality checks by removing the affected WhatsApp media dependency versions. The unchanged main commit `0d76fd869004afbd4b02783fbf03c40ef431f9b7` passed on October 6, but later registry advisory updates cause its dependency audits to fail. Successful verification must retain normal image thumbnails, audio metadata parsing, channel attachment behavior, all previous security floors and unchanged audit/coverage gates. The user authorizes a new branch and PR, not merging or publishing a release.

## Progress


- [x] (2026-10-10 investigation) Inspect scheduled failures from October 7–10, reproduce the current production audit, check security alerts separately and trace the affected Baileys callers.
- [x] (2026-10-10 preparation) Create `codex/fix-whatsapp-media-audit-2026-10-10` from current main. Read project and security-fix guidance; perform the investigation and later candidate review as separate single-agent passes under the user's delegation restriction.
- [x] (2026-10-10 local dependency validation) Demonstrate the new dependency-floor regression fails on the old lockfile, advance the affected dependency resolutions and verify frozen installation.
- [x] (2026-10-10 focused verification) Validate actual native SVG-library patch level, normal Baileys media operations and bounded rejection of malformed media; synchronize security/testing/maintenance documentation.
- [x] (2026-10-10 full local verification) Complete `pnpm verify:all` and review the final candidate for bypasses, accidental edits, secrets and unnecessary changes.
- [x] (2026-10-10 hosted verification) Open PR #81 and reconcile implementation-head hosted checks, alerts and review threads. Recheck the evidence-only final revision and retain its exact-head results in the PR description.

## Surprises & Discoveries


All three quality jobs in CI run `38045888514` complete build, lint, types, tests and coverage, then report one high and five moderate production/full audit findings. Workflow lint passes. October 7–8 audits report the high finding alone; October 9–10 add the five moderate reports. The main commit is unchanged, so these failures reflect updated advisory data rather than newly committed application behavior.

Both affected packages are transitive dependencies, meaning OpenAssist receives them through `@whiskeysockets/baileys 6.7.24` rather than a direct application import. `sharp 0.35.4` is affected by GHSA-wq5f-xc86-pv6w in bundled librsvg SVG decoding; the patched floor is `0.35.5`, providing librsvg `2.63.2`. `music-metadata 11.12.3` has five moderate audit reports: GHSA-f94x-6692-553q, GHSA-53v6-4h7p-p4gj, GHSA-jjpr-9cvf-cq55, GHSA-5gfj-9q3v-qfp3 and GHSA-8j4c-6x6g-rq3j. Version `11.16.0` covers all current reported ranges. Some advisory version prose differs from registry ranges, including an MP4 report described as an unreleased regression; do not claim every report is a proven exploit of the installed application.

OpenAssist's WhatsApp adapter sends an image's local path through Baileys. Baileys `Utils/messages.js` calls `generateThumbnail`, which calls `extractImageThumb` and the installed Sharp decoder. Its `getAudioDuration` helper uses music-metadata's shared buffer/file/stream parser entry points. OpenAssist currently sends images and documents rather than a dedicated audio payload, so the dependency audit is a confirmed vulnerable-version control failure while actual audio-exploit reachability is not asserted. Inbound attachment download limits and runtime policy remain intact.

## Decision Log


Decision: Advance the existing affected-version Sharp override to `0.35.5` and add an affected-range music-metadata override for `>=11.0.0 <11.16.0` to `11.16.0`.
Rationale: Both consumers stay on compatible existing dependency families. This removes affected resolutions uniformly without a Baileys major migration, an application workaround or weakened audits. Keep all existing overrides and build permissions.
Date/Author: 2026-10-10 / Codex.

Decision: Extend the existing resolved-version security regression and add real media compatibility/security-boundary checks where they provide meaningful evidence.
Rationale: Lockfile checks prevent reintroduction of affected packages, while actual native-library and parser behavior verify the installed implementation and ordinary media workflows. Do not execute an SVG code-execution exploit or contact live WhatsApp services.
Date/Author: 2026-10-10 / Codex.

## Outcomes & Retrospective


Dependency repair, frozen installation, focused checks, documentation, full local verification and hosted verification of implementation head `e6c3ba54394870aa265d1bc1b12e9d97b50c5d5e` are complete in [PR #81](https://github.com/openassistuk/openassist/pull/81). Earlier green PR/main checks certify their historical heads only. Published `v0.2.2` packages are immutable and will not receive this source repair until a separately authorized release and operator upgrade.

The raised lockfile floor fails before repair with `music-metadata@11.12.3 is below patched floor 11.16.0`, then all three security-policy checks pass. The bounded malformed-APE regression also fails against the retained old parser: a 134-byte fixture reaches a declared one-MiB allocation, intercepted before allocation by the worker's guard. The patched parser rejects it without that allocation. This is evidence of the parser defect and remediation, not a demonstrated live OpenAssist attack.

Seven focused Node tests pass (three dependency controls, three real media checks and persisted Signal compatibility). Twenty existing Vitest channel-send/attachment-rendering tests pass. Actual Sharp reports librsvg `2.63.2`; benign SVG and PNG preserve expected original and JPEG thumbnail dimensions. Valid WAV duration remains one second through buffer, file and byte-stream paths. Both malformed APEv2 classes reject in buffer/file/sized-stream/unknown-size-stream paths under guarded allocations and a ten-second child timeout. Production audit reports zero findings in every severity. The initial test used an object-mode stream, which the byte tokenizer does not support in either old or new strtok3; correcting the fixture to a byte stream matches Baileys' real media stream construction.

Separate candidate review traced all three parser entry points and verified that unknown stream sizes use bounded 64-KiB chunk reads before full-value allocation. Overrides replace the shared implementations across callers, rather than only shielding one application call. The lockfile changes only Sharp/native packages, music-metadata and the latter's required content-type/media-typer/file-type/strtok3 updates. No build permissions, application APIs, privileges, credentials or coverage/audit thresholds change.

`pnpm verify:all` exits zero on Windows with Node `24.21.0` and pnpm `12.5.1`: workflow lint, build, lint, typecheck, docs-truth checks, Vitest (577 passed / one skipped), Node integration (239 passed / six skipped), both coverage gates and both audits pass. Vitest statements/branches/functions/lines are `83.24 / 74.35 / 85.85 / 84.22%`; Node coverage is `80.15 / 73.67 / 86.07 / 80.15%` (126 passed / five platform skips). Production and full audit counts are zero at every severity. Existing Windows platform skips remain visible; hosted Linux/macOS checks must cover their supported paths. `git diff --check` passes. Separate open code-scanning and Dependabot queries return zero alerts.

Hosted attempt 1 confirms that exact implementation SHA in all four workflows: [CI 38057307430](https://github.com/openassistuk/openassist/actions/runs/38057307430), [CodeQL 38057307375](https://github.com/openassistuk/openassist/actions/runs/38057307375), [macOS Live Launchd 38057307463](https://github.com/openassistuk/openassist/actions/runs/38057307463) and [Release Artifacts 38057307416](https://github.com/openassistuk/openassist/actions/runs/38057307416) all succeed. The check rollup has thirteen successes and three expected production-publication skips. Linux/macOS/Windows logs each confirm passing native SVG/parser regressions and zero production/full findings at every severity. Four artifact targets and signing-contract validation pass; no production publication is launched. Separate code-scanning and Dependabot queries each return zero alerts; the PR has zero review threads and still requires human approval.

Final merge/check reconciliation: main remains `0d76fd869004afbd4b02783fbf03c40ef431f9b7`, with its October 10 scheduled audit failure still historical evidence. No repaired PR has been merged or release published. This final evidence revision changes only this plan; rerun docs-truth validation and inspect its own refreshed hosted checks before handoff. The PR description records the final exact head and actual terminal outcomes separately. A green PR analysis cannot certify a future merged-main commit, which needs its own CI/full branch CodeQL and alert reconciliation after merge.

## Context and Orientation


`pnpm-workspace.yaml` owns affected-version overrides and the allowed install scripts. `pnpm-lock.yaml` records every resolved package and the native Sharp platform packages. `tests/node/dependency-security-overrides.test.ts` checks patched floors across all locked versions. `packages/channels-whatsapp-md/src/index.ts` owns channel ingress and outbound attachment mapping; this repair should not change its API or behavior. Existing channel send and runtime attachment suites cover those boundaries. README, contributor rules, changelog, docs index, threat model and test matrix must describe the updated source controls without claiming already published packages changed.

## Plan of Work


The first milestone raises the two regression floors and runs the focused test against the old lockfile to demonstrate failure. Update only the affected override ranges, resolve the lockfile and perform frozen installation. Review the lockfile diff for unrelated dependency changes. The observable result is that all locked Sharp versions are at least `0.35.5` and all music-metadata versions are at least `11.16.0` while installation permissions stay unchanged.

The second milestone exercises the actual dependencies resolved from Baileys, including the native librsvg version and normal image/audio handling. Keep malformed parser fixtures small and bounded; use a child process with a timeout if instrumentation or synchronous parser behavior needs isolation. Verify normal channel attachment mapping and persisted Signal sessions through existing tests. Update documentation and the test inventory together. A zero-finding production and full audit is required; version declarations alone are insufficient evidence.

The final milestone performs a separate candidate review for remaining affected package copies, alternative media entry points, normal-input regressions, secrets, debug code and unrelated changes. Run the repository's mandatory `pnpm verify:all` without reducing thresholds. Commit and push the new branch, create and attach a PR, then inspect hosted platform, CodeQL, live macOS LaunchAgent and artifact/signing checks on the exact head. Record alert and unresolved-review-thread checks separately. Preserve required human review and stop before merge or production publication.

## Concrete Steps


Run from `C:\Users\dange\Coding\openassist` with Node `24.21.0` and pnpm `12.5.1`:

    pnpm exec tsx --test tests/node/dependency-security-overrides.test.ts
    pnpm install --lockfile-only
    pnpm install --frozen-lockfile
    pnpm exec tsx --test tests/node/dependency-security-overrides.test.ts tests/node/whatsapp-signal-compatibility.test.ts
    pnpm exec tsx --test tests/node/whatsapp-media-compatibility.test.ts
    pnpm exec vitest run tests/vitest/channel-adapter-send.test.ts tests/vitest/runtime-attachments-rendering.test.ts
    pnpm verify:all
    git diff origin/main --check

The first focused invocation must fail before the lockfile repair and pass afterward. Add the concrete media test command and observed results as it is implemented. Diagnostic security helper output belongs in plugin-managed temporary/persistent storage; ordinary source/configuration edits, required repository-generated coverage and PR request bodies follow the normal repository workflow.

## Validation and Acceptance


Accept only a minimal dependency repair with meaningful regressions and synchronized documentation. Frozen installation, real native/media checks, existing channel contracts, both runners and both coverage gates must pass. Production and full audits must report no findings, rather than silently treating registry failure as success. Hosted checks must succeed on the published PR head. Automated tests do not certify a live second WhatsApp account, glibc exploit execution, paid providers or already published assets.

## Idempotence and Recovery


No operator credentials, databases, services, access policy or published release assets are modified. Re-running frozen installation and tests is safe. If resolution unexpectedly changes unrelated packages, inspect and narrow the lockfile update rather than accepting broad churn. Failed validation stays visible and blocks readiness. Git branch protections and required review remain active.

## Artifacts and Notes


Baseline: `0d76fd869004afbd4b02783fbf03c40ef431f9b7`. Latest observed failure: CI run `38045888514`, with matching production/full counts of one high and five moderate findings on all three platforms. Current local production audit reproduces those counts. Upstream Sharp `0.35.5` requires Node `>=20.9.0`; music-metadata `11.16.0` requires Node `>=18`, both compatible with supported Node 24. Record actual fixed-run evidence here when available.

## Interfaces and Dependencies


Keep Baileys `6.7.24`, the existing OpenAssist channel contract, current Node/pnpm versions and install-script allowlist. No new application dependency family, configuration field, tool schema or public API is required. Patch the shared upstream parser/native implementations through dependency resolution, rather than duplicating validation in one caller.

Revision note (2026-10-10): create the plan after confirming daily audit failures, inspecting advisory ranges and actual media callers, and creating the authorized branch. Preserve the distinction between audit evidence, application reachability, local tests, hosted certification and future release delivery.

Revision note (2026-10-10 handoff): record before/after parser evidence, unchanged local gates, all three hosted zero-finding audits, exact implementation-head workflow conclusions and separate alert/review checks. Reconcile this evidence-only revision through targeted docs-truth validation and the PR's latest-head check record before handoff.
