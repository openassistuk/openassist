# Policy Profiles

Source:

- `packages/core-types/src/policy.ts`
- `packages/core-runtime/src/policy-engine.ts`

## Profiles

- `restricted`
- `operator`
- `full-root`

Beginner-facing setup language now uses `access mode`:

- `Standard mode (recommended)` keeps the default chat access at `operator`
- `Full access for approved operators` keeps the default chat access at `operator`, but lets explicitly approved sender IDs default to `full-root`
- approved operator IDs are configured per channel in `channels[*].settings.operatorUserIds`
- Linux systemd filesystem access is a separate service-level setting under `[service].systemdFilesystemAccess`; the default is `hardened`

## Action Model

Current policy behavior:

- `restricted`: OAuth flows only
- `operator`: adds controlled `exec.run`, `fs.read`, `fs.write`
- `full-root`: adds `fs.delete`, `pkg.install`, `web.search`, `web.fetch`, `web.run`, and runtime-owned `channel.send` with autonomous chat tool execution eligibility
- Linux systemd service hardening can still narrow the live host-write boundary even when the effective profile is `full-root`; choose `unrestricted` service mode only when that broader host impact is intentional

Autonomous chat tool loop gate:

- `restricted` and `operator`: provider tool schemas are not exposed
- `full-root`: provider tool schemas are exposed and tool calls are executed automatically
- same-chat file replies through `channel.send` still require truthful outbound-file support on the active channel
- targeted operator notify through `channel.send` additionally requires an approved operator sender plus a listed recipient in `channels[*].settings.operatorUserIds`, and Discord also requires `allowedDmUserIds` overlap
- if provider responses include unsolicited tool calls while schemas are not exposed, runtime ignores those calls and does not execute tools
- provider-independent runtime commands `/start`, `/help`, `/capabilities`, `/grow`, `/status`, and `/profile` remain available regardless of profile, but they only describe the truthful capability boundary for the current session
- chat diagnostic command `/status` stays operational and provider-independent (no autonomous tool execution) and now reports awareness summary, callable tools, configured tool families, native web backend state, and managed growth context
- chat access command `/access` is provider-independent and available only to approved operators for their own current chat
- global profile-memory command `/profile` is provider-independent and available regardless of profile
- global profile updates require explicit force confirmation (`/profile force=true; ...`) because first-boot lock-in guard is enabled by default

Self-maintenance implications:

- `restricted` and `operator` may explain local docs/config/update behavior, but they stay advisory-only for self-maintenance
- `full-root` may use callable runtime tools for bounded local config/docs/code changes when the runtime self-knowledge pack says those surfaces are in scope
- `full-root` is also the only profile that can make managed growth actions available now; even then, durable growth should prefer runtime-owned skills and helper-tool directories over tracked repo edits
- updater-owned or generated paths remain protected even in `full-root`; use lifecycle commands for install/service/update recovery instead of editing those files directly

Native web tools default to enabled in config, but that does not change the autonomy gate:

- `restricted` and `operator`: native web tools are not callable from chat
- `full-root`: native web tools become callable if `tools.web.enabled=true`
- `tools.web.searchMode=api-only` requires `OPENASSIST_TOOLS_WEB_BRAVE_API_KEY`
- `tools.web.searchMode=hybrid` uses Brave Search API when configured and DuckDuckGo HTML fallback otherwise

## Scheduler Interaction

Scheduler does not define separate policy actions in current release.

- prompt tasks run through provider adapters
- skill tasks run through skill runtime
- scheduler actor identity is logged for every enqueue/run event

If scheduled shell or direct FS actions are introduced later, policy action contracts must be extended before release.

## Persistence and Audit

- profile assignment state lives in `policy_profiles`
- sender-specific access overrides live in `actor_policy_profiles`
- tool actions are auditable in `tool_invocations` (request/result payloads are redacted before persistence/retrieval)
- scheduler and clock events are auditable (`scheduler.*`, `clock.check`)
- `/status` and `openassist tools status` expose the same capability boundary the model sees, including the Linux service boundary, which helps operators confirm whether `web.*` tools are callable and whether the daemon is still sandboxed before granting `full-root`
- `/grow` and `openassist growth status` expose the same managed-growth boundary the model sees, which helps operators confirm whether durable growth actions are available before asking for extension work

## Shared-Chat Resolution

Canonical session IDs use `<channelId>:<conversationKey>`.

Effective access resolves in this order:

1. sender override for this chat
2. session override for the whole chat
3. configured approved-operator default for this sender on this channel
4. `runtime.defaultPolicyProfile`

`/access full` and `/access standard` only change the current sender's access for the current chat. They do not change other senders in the same room.

## Operational Guidance

- keep default chat access at `operator`
- use `restricted` where host-tool access is unnecessary
- use `full-root` as explicit, temporary elevation with traceability

Installed command examples:

```bash
openassist setup
openassist setup quickstart
openassist policy-set --session <channelId>:<conversationKey> --profile operator
openassist policy-set --session <channelId>:<conversationKey> --profile full-root
openassist policy-set --session <channelId>:<conversationKey> --sender-id <sender-id> --profile full-root
openassist policy-get --session <channelId>:<conversationKey> --sender-id <sender-id>
openassist policy-get --session <channelId>:<conversationKey> --sender-id <sender-id> --json
openassist tools status --session <channelId>:<conversationKey> --sender-id <sender-id>
openassist growth status --session <channelId>:<conversationKey> --sender-id <sender-id>
openassist skills list
openassist tools invocations --session <channelId>:<conversationKey> --limit 20
```
