# Codex Fresh-Setup and Auth-Readiness Fix

## Summary

Fix the fresh Codex quickstart path so it does not persist an unused seeded `openai-main` provider, and tighten Codex account linking so it only succeeds when OpenAssist has a chat-ready Codex/OpenAI auth handle.

## Progress

- Identified the fresh-setup provider leak:
  - the default config skeleton still seeds `openai-main`
  - quickstart was layering `codex-main` on top instead of replacing that placeholder on a true first-run path
- Added untouched-default-config detection in the CLI config helpers and reused it from operator-layout compatibility checks.
- Updated quickstart so a first-run selection of `codex`, `anthropic`, or `openai-compatible` replaces the seeded singleton provider instead of persisting it.
- Added a second guard so replacement only happens while the provider list still contains the singleton seeded `openai-main`, avoiding accidental provider loss on customized configs.
- Tightened the Codex adapter:
  - removed raw OAuth access-token fallback for chat use
  - require the exchanged OpenAI API key for chat-ready Codex auth
  - keep failures sanitized and operator-actionable
- Expanded runtime and daemon auth-status surfaces so redacted status output now shows linked-account presence, active auth kind, expiry when known, and chat-readiness.
- Added regression coverage across quickstart flow, quickstart OAuth flow, Codex provider auth, CLI auth status, and daemon status payloads.

## Surprises & Discoveries

- The fresh-provider leak was not caused by Codex-specific setup logic. It came from quickstart starting with the generic default config skeleton and never replacing the seeded `openai-main` provider when another route was chosen.
- A simple `startedFromUntouchedDefaultConfig` boolean was not enough by itself. Tests showed that a config could start untouched and then be deliberately customized before provider selection, so the replacement rule also needed to verify that the live provider list still matched the singleton seeded placeholder.
- The existing Codex status path could report a linked account row even when the stored auth would predictably fail chat. That made account-link success look better than it really was.

## Decision Log

- Kept the low-level default config skeleton OpenAI-seeded for compatibility, but changed quickstart so that skeleton no longer leaks into saved first-run Codex/Anthropic/OpenAI-compatible configs.
- Chose not to accept raw OAuth access tokens as a successful Codex chat auth path. If the upstream exchange does not yield the exchanged OpenAI API key, account linking now fails instead of persisting a linked-but-unusable auth state.
- Kept `openassist auth status` redacted, but made it meaningfully diagnostic so operators can tell whether a Codex account is actually chat-ready without exposing secrets.

## Outcomes & Retrospective

- Fresh Codex quickstart now saves only the selected provider route on the untouched first-run path.
- Codex account linking now aligns success criteria with real chat readiness instead of merely storing an OAuth account record.
- CLI and docs now give operators a supported redacted diagnostic path for Codex auth readiness.
- Targeted quickstart/provider/auth tests caught one overly broad replacement rule before the full verification gate, which justified the narrower singleton-placeholder check.
