# Branch and PR Install Tracks for Developer Testing

## Summary

This ExecPlan tracks the developer-only branch/PR install-track feature. The goal is to let OpenAssist install and update directly from a branch or PR so real host testing can happen before code lands on `main`, while keeping the beginner lifecycle hub unchanged.

## Progress

- [x] Added `--pr <number>` parsing to `install.sh`, `scripts/install/bootstrap.sh`, and `openassist upgrade`, with `--ref`/`--pr` mutual exclusion.
  - Evidence: `install.sh`, `scripts/install/bootstrap.sh`, and `apps/openassist-cli/src/commands/upgrade.ts`
- [x] Added a shared update-track classifier for branch, PR, raw-ref, and detached state.
  - Evidence: `apps/openassist-cli/src/lib/update-track.ts`
- [x] Refactored bootstrap fresh-clone/update flows to fetch and check out explicit branch/PR targets instead of relying on `git clone --branch` for non-default tracks.
  - Evidence: `scripts/install/bootstrap.sh` now clones normally, then uses `checkout_requested_track`, `checkout_remote_branch`, and explicit PR fetches
- [x] Updated lifecycle reporting and upgrade planning so branch installs keep following their branch while PR installs require an explicit later `--pr` or `--ref`.
  - Evidence: `apps/openassist-cli/src/lib/upgrade.ts`, `apps/openassist-cli/src/lib/lifecycle-readiness.ts`, `apps/openassist-cli/src/index.ts`, and `apps/openassist-cli/src/commands/upgrade.ts`
- [x] Added and refreshed installer, lifecycle, and CLI tests for branch/PR track behavior.
  - Evidence: `tests/node/install-curl-entrypoint-contract.test.ts`, `tests/node/install-bootstrap-idempotence.test.ts`, `tests/node/cli-command-integration.test.ts`, `tests/node/cli-root-commands.test.ts`, `tests/vitest/update-track.test.ts`, `tests/vitest/lifecycle-readiness.test.ts`, `tests/vitest/upgrade-state-machine.test.ts`
- [x] Updated root docs, lifecycle runbooks, changelog, and `AGENTS.md` to document the feature as an advanced developer workflow.
  - Evidence: `README.md`, `AGENTS.md`, `docs/README.md`, `docs/operations/install-linux.md`, `docs/operations/install-macos.md`, `docs/operations/upgrade-and-rollback.md`, `docs/operations/common-troubleshooting.md`, `docs/testing/test-matrix.md`, `CHANGELOG.md`
- [x] Ran the full local verification gate successfully.
  - Evidence: `pnpm verify:all` passed on 2026-03-09 after the branch/PR install-track docs and tests were in place

## Surprises & Discoveries

- `raw.githubusercontent.com` accepts PR bootstrap fetches via `refs/pull/<n>/head`, which makes end-to-end installer testing from PRs viable without a separate hosting path.
- The original `install.sh` mutual-exclusion logic had a subtle bug: `--ref main --pr <n>` could slip through because `main` was also the default bootstrap ref. The final implementation tracks whether `--ref` was set explicitly.
- `openassist upgrade --dry-run` initially built the detached-PR plan correctly but failed to pass `currentBranch` into the shared lifecycle report, which hid the explicit-PR blocker until it was fixed and covered by integration tests.
- The node integration fixture for a clean built source checkout behaves differently locally and in GitHub Actions: local clones preserve the current branch name, while Actions clones originate from a detached checkout. The final assertion accepts either truthful update-track shape instead of hard-coding the branch label.

## Decision Log

- Decision: keep branch/PR install tracks command-line only.
  - Rationale: this is a developer-testing workflow, not a beginner lifecycle path.
- Decision: branch installs follow their branch normally, but PR installs require an explicit next target.
  - Rationale: a detached PR checkout should not silently drift back to `main` or another ref on the next upgrade.
- Decision: `install.sh` must fetch the matching bootstrap script for the chosen branch/PR.
  - Rationale: installer changes themselves need to be testable end to end before merge.
- Decision: lifecycle output should show labeled update tracks (`branch`, `PR #n`, raw ref, detached) instead of raw ref strings alone.
  - Rationale: developers need to see immediately whether they are on a standard install, a branch test install, or a PR test install.

## Outcomes & Retrospective

- Outcome: OpenAssist now supports advanced developer installs from branches and PRs without exposing that workflow in the beginner setup hub.
- Outcome: upgrade behavior is now deterministic for detached PR installs, with explicit guidance instead of hidden fallback.
- Outcome: docs and tests now describe and enforce the distinction between standard `main` installs, branch installs, PR installs, and explicit reversion back to `main`.
- Retrospective: the most important implementation catches were that detached PR handling had to be enforced both in the human upgrade plan and in the shared lifecycle report, and that the CLI dry-run integration test needed to tolerate both local branch clones and detached CI clones. The combined integration coverage caught both issues before merge.
