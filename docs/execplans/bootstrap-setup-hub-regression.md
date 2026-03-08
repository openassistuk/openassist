# Bootstrap Setup Hub and Codex OAuth UX Follow-Up

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document must be maintained in accordance with `.agents/PLANS.md`.

## Purpose / Big Picture

This follow-up fixes two operator-facing regressions found on a real VPS after the lifecycle-hub and Codex-route work had already merged:

1. the new bare `openassist setup` hub could render poorly in some terminals because the select UI repainted the root menu
2. the Codex account-link flow could be hard to use on a headless host because the authorization URL was easy to miss and `openassist auth start --open-browser` could crash when no browser launcher such as `xdg-open` existed

The goal is to make the setup hub readable in plain terminals, keep Codex linking usable on a VPS, and ensure account-link failures are described as account-link problems rather than misleading service failures.

## Progress

- [x] (2026-03-08 22:40Z) Replaced the root setup-hub select menu with a plain numbered prompt in `apps/openassist-cli/src/lib/setup-hub.ts`.
- [x] (2026-03-08 22:40Z) Split default-provider Codex link failures into an explicit `OAuthAccountLinkError` path in `apps/openassist-cli/src/lib/setup-quickstart.ts`.
- [x] (2026-03-08 22:40Z) Added an explicit pause after printing the authorization URL so headless operators can copy or open it before continuing.
- [x] (2026-03-08 22:40Z) Made `openassist auth start --open-browser` best-effort instead of crash-prone when local browser launchers are missing.
- [x] (2026-03-08 22:40Z) Added regression coverage for numeric hub input, Codex retry guidance, and headless browser-launch fallback.
- [x] (2026-03-08 22:48Z) Ran `pnpm verify:all` successfully after updating both the Vitest and node quickstart OAuth regressions to the new prompt flow.
- [ ] Push the branch, open the PR, and clear CI/review.

## Surprises & Discoveries

- Observation: the Codex quickstart problem was not a service failure at all; the daemon was healthy and only the account-link step still needed attention.
  Evidence: the captured VPS transcript showed `systemctl status` and `journalctl` output even though `/v1/health`, `/v1/time/status`, and `/v1/scheduler/status` had already succeeded.

- Observation: `openassist auth start --open-browser` could print `Opened authorization URL in browser.` and still crash immediately afterward because the spawned opener emitted an async `error` event.
  Evidence: the reported VPS trace showed `spawn xdg-open ENOENT` after the command had already printed the authorization URL and the browser-open message.

## Decision Log

- Decision: switch the setup-hub root prompt to a numbered plain-text input instead of trying to keep the fancier select UI.
  Rationale: the root lifecycle hub is a beginner-facing menu, so terminal readability is more important than a richer interactive selector.
  Date/Author: 2026-03-08 / Codex

- Decision: classify skipped default-provider Codex account linking as an account-link recovery state, not as a service-health failure.
  Rationale: the daemon is already healthy by the time this prompt is reached, so service logs are noise and push operators in the wrong direction.
  Date/Author: 2026-03-08 / Codex

- Decision: keep browser launch best-effort only and never fail the auth-start command just because a local browser opener is unavailable.
  Rationale: headless VPS installs still need the printed authorization URL, and that path should stay usable without desktop assumptions.
  Date/Author: 2026-03-08 / Codex

## Outcomes & Retrospective

The branch now aligns the live setup/auth experience with the product story in the docs. Bare `openassist setup` uses a stable numbered menu, Codex quickstart pauses after printing the authorization URL, and account-link problems no longer masquerade as service failures. The direct `auth start --open-browser` command also degrades cleanly on headless systems by keeping the printed authorization URL and warning the operator to open it manually.

The practical lesson from this follow-up is that real VPS transcripts are still the best lifecycle UX test. The CI and unit coverage were already good enough to catch logic errors, but they did not expose the terminal repaint problem or the missing `xdg-open` crash until the flow was exercised on a headless install.

The final verification evidence is straightforward: targeted Vitest and node OAuth/setup-hub suites passed locally, and the branch then cleared the full `pnpm verify:all` gate without lowering thresholds or weakening existing lifecycle checks.
