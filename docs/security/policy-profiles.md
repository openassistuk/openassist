# Policy Profiles

Source:

- `packages/core-types/src/policy.ts`
- `packages/core-runtime/src/policy-engine.ts`

## Profiles

- `restricted`
- `operator`
- `full-root`

## Action Model

Current policy behavior:

- `restricted`: OAuth flows only
- `operator`: adds controlled `exec.run`, `fs.read`, `fs.write`
- `full-root`: adds `fs.delete` and `pkg.install` with autonomous chat tool execution eligibility

Autonomous chat tool loop gate:

- `restricted` and `operator`: provider tool schemas are not exposed
- `full-root`: provider tool schemas are exposed and tool calls are executed automatically
- if provider responses include unsolicited tool calls while schemas are not exposed, runtime ignores those calls and does not execute tools
- chat diagnostic command `/status` is provider-independent and available regardless of profile (no autonomous tool execution)
- global profile-memory command `/profile` is provider-independent and available regardless of profile
- global profile updates require explicit force confirmation (`/profile force=true; ...`) because first-boot lock-in guard is enabled by default

## Scheduler Interaction

Scheduler does not define separate policy actions in current release.

- prompt tasks run through provider adapters
- skill tasks run through skill runtime
- scheduler actor identity is logged for every enqueue/run event

If scheduled shell or direct FS actions are introduced later, policy action contracts must be extended before release.

## Persistence and Audit

- profile assignment state lives in `policy_profiles`
- tool actions are auditable in `tool_invocations` (request/result payloads are redacted before persistence/retrieval)
- scheduler and clock events are auditable (`scheduler.*`, `clock.check`)

## Operational Guidance

- keep default session profile as `operator`
- use `restricted` where host-tool access is unnecessary
- use `full-root` as explicit, temporary elevation with traceability

Installed command examples:

```bash
openassist setup quickstart
openassist policy-set --session <channel>:<conversationKey> --profile operator
openassist policy-set --session <channel>:<conversationKey> --profile full-root
openassist policy-get --session <channel>:<conversationKey>
openassist tools status --session <channel>:<conversationKey>
openassist tools invocations --session <channel>:<conversationKey> --limit 20
```
