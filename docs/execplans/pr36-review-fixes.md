# PR 36 Review Fixes

This ExecPlan captures the follow-up work for the ignored review findings on merged PR `#36`.

## Purpose / Big Picture

Bring the merged outbound-delivery change back into line with the repo's review and release discipline by fixing the concrete review findings, adding regression coverage, and publishing the follow-up as a new PR instead of leaving the review comments unresolved.

## Progress

- [x] 2026-03-11 18:05+00:00 Pulled the exact PR `#36` review threads from GitHub and confirmed eight actionable findings across runtime gating, adapter fallback behavior, and recovery logging.
- [x] Patched runtime tool-call allowlisting so unadvertised tools are blocked and audited before execution, and added reply-mode defense-in-depth for `channel.send`.
- [x] Patched Discord and WhatsApp outbound send paths so missing staged files degrade to explicit notes, and WhatsApp caption overflow spills into follow-up text.
- [x] Patched recovery-worker terminal-failure logging so final-attempt failures no longer emit the misleading `job retry scheduled` message.
- [x] Added regression coverage for the review findings in runtime policy-gate, tool-audit, and channel-adapter tests.
- [x] 2026-03-11 19:14+00:00 Ran the full local repository gate on the follow-up branch: `pnpm verify:all` passed after the review-fix patches and doc updates landed.
- [ ] Open the follow-up PR and clear CI plus review.

## Surprises & Discoveries

- Observation: the non-approved notify regression test started hanging only because its expectation went stale after the unadvertised-tool fix, which caused the runtime cleanup path to be skipped on assertion failure.
  Evidence: the isolated TAP log showed the suite itself was green once the expected status changed from `failed` to `blocked`.
- Observation: the merged docs were already mostly truthful; the follow-up doc work only needed to tighten the specific guarantees that the review comments exposed.
  Evidence: existing docs already described bounded notify and explicit outbound notes, but did not say clearly that unadvertised tool calls are blocked and audited.

## Decision Log

- Decision: ship the review fixes as a new follow-up PR from `main` instead of trying to edit the already merged PR state.
  Rationale: the original PR is merged and immutable for code changes; the clean repair path is a new branch plus a new PR.
- Decision: treat unadvertised provider tool calls as blocked-and-audited rather than silently ignored.
  Rationale: this preserves audit truth, gives the provider a tool-result message to continue the turn safely, and prevents hidden tool execution.

## Outcomes & Retrospective

The follow-up closes the concrete review gaps left behind in PR `#36`: hidden tool calls no longer execute, reply-mode delivery now enforces the same boundary the runtime advertises, adapter fallback behavior matches the documented explicit-note contract, and recovery logs no longer imply a retry after terminal failure. The full local repo gate is green again on the final follow-up branch.
