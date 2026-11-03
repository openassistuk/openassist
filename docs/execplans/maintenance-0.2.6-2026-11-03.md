# Repair CI and prepare the 0.2.6 maintenance release

This living ExecPlan follows `.agents/PLANS.md`. Keep Progress, Surprises & Discoveries, Decision Log and Outcomes & Retrospective current.

## Purpose / Big Picture

Restore trustworthy maintenance checks and prepare the next patch release without weakening audit, coverage, signing or review controls. Operators receive dependency security fixes through a future signed 0.2.6 package; existing immutable 0.2.5 assets remain unchanged until an explicit update. The observable local outcome is a clean frozen install and `pnpm verify:all`, synchronized candidate notes and versions, and regression tests that reject the affected dependency resolutions.

## Progress

- [x] (2026-11-03) Inspect clean main `58d23f0`, recent Actions failures, open PR #92 and local audit reports. Create `codex/maintenance-0.2.6`.
- [x] (2026-11-03) Confirm daily CI failures beginning October 21 and PR #92 fail at dependency audits after passing tests/coverage. Confirm October 31 lifecycle HTTP 403 and November 3 macOS hosted-runner acquisition failure separately.
- [x] (2026-11-03) Check default and PR #92 scanning refs, secret/Dependabot alerts, issues and review threads: no open entries. This does not supersede failing registry audits.
- [x] (2026-11-03) Apply PR #92's reviewed package delta locally, advance Azure Identity to 4.14.1 and narrow transitive overrides. Frozen installation passes; production/full audits each report zero findings. New floor assertion fails against main's lock at MSAL Node 6.0.1 and passes against the repaired graph.
- [x] (2026-11-03) Repair signed rollback-fixture loading and the startup test. Twelve dependency/audit/signature checks and the isolated hanging-channel case pass; syntax and build pass. Six provider/lifecycle suites pass 123 tests with one existing skip.
- [x] (2026-11-03) Align 0.2.6 candidate versions, notes/changelog and affected docs. Nineteen docs/version/fixture checks pass, including executable versions and full live-doc index/test inventory.
- [x] (2026-11-03) Commit the initial candidate as `273119c` for clone-based tests. The first full gate passes build/lint/typecheck, 690 Vitest tests (one skip), 255 Node tests (six skips) and Vitest coverage before being interrupted during Node coverage after the user authorizes decoder migration; this incomplete run is not a full pass.
- [x] (2026-11-03) Complete explicitly authorized optional decoder migration with pinned alias, exact-version Baileys patch, scoped peer rule and no build-permission expansion. Eight focused security/media cases pass; zero production/full audits and frozen installation pass without the deprecated package. Production deployment relocated outside the repo passes waveform and all four lazy codec/WASM initializations.
- [ ] Commit the decoder extension, run the complete final quality/coverage/audit gate, and inspect the final diff.
- [ ] Obtain authorization for external branch/PR writes; reconcile actual-head hosted checks, full branch CodeQL and open alerts/reviews before release approval. Publication and protected-environment changes require separate explicit authorization.

## Surprises & Discoveries

The latest main CI run `41633271523` passes tests and both coverage suites on Linux/macOS/Windows but reports production moderate=2/high=8 and full low=1/moderate=8/high=9. Local `pnpm audit:dependencies` reproduces those totals. Registry reports identify follow-redirects, Zod, MSAL Node, Undici and Vite high findings, plus glob/minimatch moderate findings. A zero GitHub alert listing therefore is not evidence of a clean dependency graph.

The October 31 lifecycle run `41205475393` fails in `lifecycle-smoke.mjs` while discovering the fixed historical rc.1 fixture through GitHub's public release catalogue (HTTP 403). The November 3 run `41658129894` passes Linux; macOS has no steps and its annotation says the hosted runner was not acquired, with arm64 capacity notices. Do not claim either is a production lifecycle regression or hide failed history.

The 0.2.5 release plan documents a Windows startup assertion of 742 ms against a 500 ms wall-clock threshold, followed by a 30-minute timeout because cleanup followed the failing assertion. The hanging-channel test must assert nonblocking behavior with unconditional cleanup and an explicit bounded test deadline instead of a machine-speed assertion.

An initial use of a per-test `after` hook exposed that the global `afterEach` directory removal executes first on this Node test path, producing Windows EPERM while SQLite was still open. Cleanup now runs in `finally` before global removal, including when the explicit startup deadline rejects. The focused case passes afterward. No runtime production code changed.

Initial frozen installation retained an upstream deprecation warning for Baileys 6.7.24's optional audio-decode 2.2.3. The user subsequently explicitly authorized migration. @audio/decode 4.2.0 returns `{channelData, sampleRate}` rather than the older AudioBuffer method `getChannelData()`, despite the rename notice describing the same API. An alias alone therefore breaks Baileys' waveform generation. A one-line version-scoped patch reads `channelData[0]`; the channel declares an exact optional alias and a peer rule permits only the tested 6.7.24/4.2.0 pair. pnpm overrides do not replace this auto-installed optional peer, and package extensions only add missing peer metadata, so neither is retained as an ineffective repair.

Complete daily-run inspection also found an Ubuntu unit-test timeout in `40306744658` on October 26: lifecycle-engine's source-staging case exceeded its unchanged five-second deadline while copying the real Node executable inside an otherwise mocked process test. Substitute a tiny fixture only at that copy boundary and assert the actual executable source/private destination; hosted native lifecycle checks retain real copying/activation. All fourteen failing daily runs October 21–November 3 contain audit failures; this one has the additional timeout.

## Decision Log

Decision (2026-11-03): user authorization covers investigation, safe local repairs and maintenance-release preparation, not publication, protected environment changes, PR merges or paid provider tests. Work singly and ask only after a concrete locally verified candidate exists for external writes.

Decision (2026-11-03): incorporate the seven package updates proposed in open PR #92 locally, advance Azure Identity to the patched 4.14.1 parent and keep Vitest/coverage-v8 paired. Use narrowly scoped overrides where parent ranges cannot select patched dependencies. Do not migrate Baileys, Node majors or provider contracts.

Decision (2026-11-03): remove public catalogue discovery only from the fixed historical release test fixture. Download the known rc.1 signed manifest/signature through the existing restricted transport, verify the production trust anchor and exact version/channel, then preserve normal size/digest/archive/old-updater checks. No credential or changed production discovery route is needed.

Decision (2026-11-03, supersedes initial deferral): the user explicitly requests including and validating the decoder migration. Replace the optional package with pinned @audio/decode 4.2.0, retain the existing import name, and patch only Baileys 6.7.24's raw-channel consumption. Keep the peer compatibility rule exact, not a broad ignore. Preserve optionality and build permissions. Validate synthetic waveform bytes, file/stream handling, bounded malformed input and codec assets; add the same deployed-graph check to native portable smoke. Do not enable new chat capabilities or claim every codec was certified.

## Outcomes & Retrospective

Investigation, dependency repair, candidate metadata and authorized decoder migration are complete. Frozen installation/build, zero audits, focused provider/signature/coverage/media tests, isolated production decoder deployment and documentation/version contracts pass. A read-only check of actual public rc.1 assets verifies the production signature, expected preview/version and four artifacts through the new fixed fixture loader. The final complete local gate and diff review remain; the earlier interrupted full run does not certify the decoder extension. Actual published stable remains v0.2.5. No remote write, old tag/asset replacement, alert dismissal, policy relaxation or live provider call has occurred.

## Context and Orientation

`pnpm-workspace.yaml` owns security overrides and explicit build permissions. Workspace manifests and `pnpm-lock.yaml` define the installed graph. `tests/node/dependency-security-overrides.test.ts` rejects affected locked versions; `scripts/dev/audit-dependencies.mjs` retains production/full registry reports in `coverage/audit` and fails high/critical findings or registry errors. `scripts/release/lifecycle-smoke.mjs` runs only on disposable root-owned Linux Actions hosts and upgrades the real signed 0.2.0-rc.1 application with its own updater. `tests/node/runtime.test.ts` tests channel initialization without blocking runtime control surfaces.

The three product version manifests are `package.json`, `apps/openassist-cli/package.json` and `apps/openassistd/package.json`. Candidate notes belong in `docs/releases/v0.2.6.md`; installed availability remains 0.2.5 until protected publication and all four public-install targets pass. `tests/node/cli-docs-truth.test.ts` checks documentation/version contracts and suite inventory. CI requires workflow lint and quality/coverage on Linux, macOS and Windows; macOS live launchd and native packaging/signing are separate hosted gates.

## Plan of Work

First update dependency manifests, narrow override floors and existing regression assertions. Prefer the compatible patched Azure Identity parent over forcing a different MSAL major under an old parent. Verify c8's test-exclude CommonJS glob/minimatch calls remain compatible with the patched versions and preserve source-only coverage scope.

Then extract a small fixed rollback-fixture loader under `scripts/release/`, exercise its signatures/identity/failure behavior with local fixtures, and use it in the existing lifecycle smoke. Replace the startup wall-clock assertion with a bounded test of completion while the channel is still pending, and register unconditional runtime/database cleanup before starting.

The authorized decoder extension adds `scripts/release/audio-smoke.mjs` for synthetic waveform and lazy codec/WASM checks, shared by source tests and native portable smoke. `patches/@whiskeysockets__baileys@6.7.24.patch` adapts only the existing waveform consumer. `packages/channels-whatsapp-md/package.json` declares the exact optional alias; `pnpm-workspace.yaml` records the patch and tested peer pair. Keep all three synchronized and check production deployment outside the repo so source node_modules cannot mask missing assets.

Finally prepare 0.2.6 metadata and dated source-remediation evidence across README, AGENTS, docs index, WhatsApp channel, release-maintenance, testing and threat-model surfaces. Validate command examples against the CLI registry and workflow claims against actual YAML. Retain historical release evidence. Commit before the complete gate so clone-based tests see the candidate. Ask for external-write approval with exact scope and validation results only when ready.

## Concrete Steps

Work in `C:\Users\dange\Coding\openassist`, using Node >=24.21.0 <25 and pnpm 12.5.1.

    pnpm install --frozen-lockfile
    pnpm audit:dependencies
    pnpm build
    pnpm exec tsx --test tests/node/dependency-security-overrides.test.ts tests/node/dependency-audit.test.ts
    pnpm exec tsx --test tests/node/release-published-fixture.test.ts
    pnpm exec tsx --test tests/node/whatsapp-media-compatibility.test.ts
    pnpm exec tsx --test --test-name-pattern="does not block runtime start" tests/node/runtime.test.ts
    pnpm exec tsx --test tests/node/cli-docs-truth.test.ts tests/node/runtime-version.test.ts
    git diff --check
    pnpm verify:all

Expected outcome: zero production/full findings, no decreased coverage thresholds, both executable versions 0.2.6, and passing documentation/release contracts. Keep logs under `.git/maintenance-2026-11-03` and generated coverage under its ignored directory.

## Validation and Acceptance

Confirm new dependency floor assertions fail against the original lock and pass after resolution. Exercise the actual c8 coverage path to verify glob/minimatch compatibility. Verify signed-fixture loading uses only fixed approved asset URLs, rejects bad signatures and wrong version/channel, and does not retry or substitute failures. The startup test must complete while the connector is still pending and release resources even when assertions fail. Full local checks and audits are required; native Linux/macOS artifacts and runner acquisition need hosted checks after authorization. Do not claim public availability or live provider certification from local tests.

## Idempotence and Recovery

All local edits are on the maintenance branch; preserve existing release tags/assets and operator state. Dependency installation uses the lockfile and existing explicit build permissions. Test keys are ephemeral and never written as production material. The live lifecycle script remains hosted-only and data-preserving. Restore a failed edit selectively from the clean baseline rather than resetting unrelated work. Retain original CI failures and distinguish any unchanged-code retries.

## Artifacts and Notes

Baseline main: `58d23f0480ace750720a5cb785c38969a862224f`. Current release: v0.2.5. Pending grouped dependency PR: #92, head `8e4858fccad58c72b6e42ec032f1a34a9b84d92f`. First failing daily audit: `39577221449`; latest: `41633271523`. No dependency warning suppression or threshold change is authorized.

## Interfaces and Dependencies

Preserve public runtime/provider/config contracts. Keep `DefaultAzureCredential` host authentication, explicit provider credentials and model catalogs unchanged. The test-only fixture loader receives the existing release utility module, returns `{manifest, baseUrl}`, and uses its restricted download/signature-verification functions. The explicitly authorized optional decoder replacement adds its codec dependency graph; no additional native build permission is introduced. `verifyAudioDecoder(baileysEntry)` checks the actual resolved optional alias, expected waveform and initialization/freeing of MP3/FLAC/Opus/Vorbis codecs. Retain existing runtime attachment limits rather than expanding accepted input/capabilities.

Revision note (2026-11-03): initial executable plan records actual failure evidence, minimal repair scope and authorization boundary before implementation.

Revision note (2026-11-03): record repaired graph, failing baseline/passing patched regression evidence, focused validation, Node cleanup ordering and the separate optional upstream decoder warning before the full gate.

Revision note (2026-11-03): extend historical failure reconciliation through all fourteen daily failures, fix the additional source-staging fixture I/O timeout without raising its deadline (29 focused lifecycle cases pass), and disclose the optional decoder warning before committing the full candidate gate.

Revision note (2026-11-03): incorporate the user's explicit decoder-migration decision, document its actual API change and narrow patch/peer wiring, preserve the interrupted first gate as incomplete, and record focused/isolated-deployment evidence before the final full gate.
