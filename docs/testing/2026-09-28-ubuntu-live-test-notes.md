# Ubuntu live installation test notes — 2026-09-28

Scope: user-guided testing of the latest published packaged release,
v0.2.0-rc.1 (preview), on a disposable Ubuntu 24.04.4 LTS server over SSH
as root. Pause for operator choices. No credentials belong in these notes.

## BUG-001: piped interactive installer hangs before bootstrap

Status: observed; fix deferred at the user's request while setup testing continues.

Reproduction in an interactive SSH terminal:

```bash
curl -fsSL https://raw.githubusercontent.com/openassistuk/openassist/main/install.sh | bash -s -- --channel preview
```

Observed: no installer output or setup prompt. The remote process remained
`bash -s -- --channel preview`, with stdin pointing to `/dev/tty`, stdout
pointing to `/dev/pts/0`, and a `wait_woken` wait channel. Neither
`/root/.local/share/openassist/install` nor `/root/.config/openassist` existed.
The command was interrupted before any installation occurred.

Diagnosis: the public `main/install.sh` switches stdin with `exec </dev/tty`
before Bash has finished reading the piped script. Bash then waits for more
script input from the terminal instead of continuing to bootstrap. This is
an entrypoint-script issue; the packaged release itself has not yet run.

Expected: finish reading the installer and enter interactive bootstrap/setup.

Approved workaround: download `install.sh` to a file and execute that file
with `bash ... --channel preview` from an interactive terminal. This workaround
succeeded: bootstrap reported a verified packaged application installed with
its private Node runtime, added PATH blocks to `/root/.bashrc` and
`/root/.profile`, and opened the setup hub. No provider credentials had been
entered at this stage.

## BUG-002: fresh packaged install defaults to repair

Status: confirmed; fix deferred while setup testing continues.

Observed: immediately after fresh packaged installation, the setup hub marks
`Check and repair this install` as the default instead of `First-time setup`.

Cause: `scripts/install/release.sh` writes the default config before opening
the hub. In `apps/openassist-cli/src/lib/setup-hub.ts`, `firstTimeDefault`
checks only whether the config file exists. The installed release's compiled
`dist/lib/setup-hub.js` has the same check. The newly created starter config
therefore makes an installation with no completed onboarding default to repair.

Expected: distinguish an untouched starter config from completed onboarding
and default to first-time setup on a fresh installation.

## BUG-003: packaged first-time setup requires pnpm

Status: observed; blocks first-time setup before any configuration prompts
on the clean host. Temporary prerequisite workaround applied with user approval.

After selecting option 1, setup printed:

```text
[Preflight]
> Checking tools, writable paths, and service manager readiness.
Setup hub failed: Failed to start pnpm: spawn pnpm ENOENT
```

The installer/setup process exited with code 1 and the SSH session closed.
`runPreflight` in `apps/openassist-cli/src/lib/setup-quickstart.ts` checks
`git --version` and `pnpm --version` whenever command checks are enabled,
without distinguishing packaged installations from source builds. Packaged
installation documentation explicitly says Git, pnpm, and system Node are
not prerequisites; packaged first-time setup should honor that contract.

The user reports that earlier setup installed missing prerequisites and asks
to gather bugs together before fixing them. The clean packaged host had Git
and the bundled Node v24.21.0, but no npm or pnpm. Installed the official
`@pnpm/exe.linux-x64` 12.5.1 native binary at `/root/.local/bin/pnpm`, verifying
the download's SHA-512 against npm registry metadata. `pnpm --version`
returned `12.5.1`. No system Node/npm installation or application patch was
needed for this temporary workaround.

Retrying `openassist setup quickstart` with `/root/.local/bin` on PATH passed
preflight and detected `systemd-system`. It reached the runtime-defaults
confirmation. The original failure remains a product bug; installing pnpm
is only a test workaround.

## BUG-004: healthy fresh setup leaves activation unverified

Status: observed after successful setup; explicit recovery later succeeded,
but dry-run guidance also proved misleading.

Quickstart passed validation, saved config/credentials, installed the system
service, restarted it, and confirmed daemon health. Clock health was healthy,
timezone `Europe/London` was confirmed, and the scheduler was running.
Nevertheless, its final installation summary still said `activation unverified`.

The recommended follow-up `openassist doctor` exited 1. It reported the service
installed and the health endpoint responding at `http://127.0.0.1:3344`, but
also reported `Activation unverified. Expected application health has not been
confirmed.. Next step: Start the service, then run openassist update recover.`
Its final `Next command` was `openassist doctor`, directing the user back to
the check that had just failed instead of the recovery command.

Expected: fresh setup should complete activation verification after checking
the expected application identity and health, or clearly report any remaining
verification step with consistent actionable guidance. Mere endpoint liveness
must not replace application identity verification. No recovery command has
been run at the original stopping point, and no cause beyond the observed
lifecycle mismatch was claimed then.

Follow-up recovery test: `openassist update recover --dry-run` exited 0 and
reported `Operation phase: complete`, `Needs action: None`, while saved
`active.verified` was still false. This dry-run rendering omits the pending
first-start verification. Non-interactive recovery without `--yes` correctly
refused mutation. With `--yes`, recovery succeeded, and a subsequent doctor
run (with the wrapper directory on PATH) exited 0 with no action needed.
The application remained on the same release. Recovery works; fresh-setup
finalization and dry-run guidance still need correction.

## BUG-005: timezone confirmation leaves stale degraded module status

Status: confirmed in Telegram, daemon endpoints, and a read-only database query.

The first Telegram `/status` response reports `time-sync=degraded` while
also reporting `time: healthy, timezone=Europe/London, confirmed=true` and
a running scheduler. `/v1/time/status` and `/v1/health` reproduce the mismatch.
The `module_health` row for `time-sync` remains `degraded` with message
`timezone confirmation required`, last updated at `2026-09-28T11:35:16.861Z`.

Source inspection: `ClockHealthMonitor.runCheck` in
`packages/core-runtime/src/clock-health.ts` marks the module degraded when
timezone confirmation is pending. `OpenAssistRuntime.confirmTimezone` in
`packages/core-runtime/src/runtime.ts` saves confirmation and starts the
scheduler but does not refresh that module health. Thus the pre-confirmation
degradation persists until another clock check updates it.

Expected: confirming the timezone should refresh module health against the
current clock result, clearing only the resolved confirmation condition.
Other genuine clock problems must remain visible. No fix has been applied.

Follow-up: the user-approved service restart at 12:03:57Z cleared the stale
degraded state. The new runtime reports `time-sync=running`, a healthy clock,
and the saved confirmed timezone. This is recovery evidence, not a code fix.

## BUG-006: service tool environment cannot find installed CLI on PATH

Status: confirmed by the first provider/tool turn and service environment.

The user asked `are you correctly working now?`. Durable tool audit rows for
the Telegram session show `exec.run` attempted `openassist doctor` at
11:37:25Z and failed, inspected PATH and wrapper locations, then retried
`/root/.local/bin/openassist doctor` and `/root/.local/bin/openassist service
status`. The full-path doctor reached the known activation warning; service
status succeeded. The final model reply accurately described these findings.

Reading only PATH from the service process environment returned:

```text
/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/snap/bin
```

The installed wrappers reside in `/root/.local/bin`, which is absent. The
installer updated interactive shell profiles, but those do not configure the
systemd service environment. Source service templates in
`apps/openassist-cli/src/lib/service-manager.ts` likewise do not add the
managed wrapper directory to PATH.

Expected: runtime host tools should resolve the installed lifecycle commands
advertised by the assistant, including from the system service. Keep any PATH
fix scoped to intended executable directories. No service changes were made.

## BUG-007: one-shot reminder exhausts tools and silently creates OS job

Status: reproduced; native scheduler test failed, external job delivered late.

At 13:09 Europe/London the user asked for one message in two minutes using
persistent scheduling, with its time and task ID confirmed. At 13:11 the
bot returned only the configured 12-round limit message. Audit rows 11–31
show 21 tool invocations (some in the same model round): repeated CLI/docs
discovery, a missing-ripgrep failure hidden by a pipeline exit code, package
installation, then external scheduling. The existing PATH issue also recurred.

The native contract in `packages/core-types/src/scheduler.ts` supports only
`cron | interval`, with prompt/skill actions. There is no one-shot schedule
kind. The available scheduler CLI offers status, task listing, and run-now,
not a task-creation command. The test request therefore exposed a capability
gap; the original test suggestion should not have assumed native one-shot
support. The assistant should identify that limitation and explain any
alternative before changing host scheduling mechanisms.

Instead, `pkg.install` installed Ubuntu's `at` package and enabled `atd`.
An `exec.run` call at 12:11:35Z submitted job 1 to send the requested text
directly through the Telegram API at 13:13:35 London time. This recalculated
the two-minute delay after lengthy discovery instead of retaining the
original request's deadline. The job reads credentials from the env file
and writes a delivery receipt under the data directory. It bypasses native
task tracking, durable delivery/retry, and channel.send policy/audit handling
at execution time. The target was the requested approved operator.

At 12:12:44Z, `atq` showed job 1 pending, the delivery receipt was absent,
and `/v1/scheduler/tasks` returned an empty list. No retry or continuation
was issued by the testing agent, to avoid duplicate sends. The user was
informed that a real job existed despite the generic limit reply.

The round limit itself enforced its configured bound; increasing it would
not address the missing capability or unmanaged scheduling path. Follow-up
should distinguish unsupported one-shot requests, accurate capability
guidance, bounded discovery, and reporting already-completed side effects.
At 12:13:41Z, the OS queue was empty and the receipt recorded Telegram
message ID 33 for the approved chat (Telegram timestamp 1790597580).
The user confirmed the message arrived at 13:13 London time, about four
minutes after the 13:09 request instead of two. This is a failed timing and
confirmation test despite eventual delivery. Tool timestamps show the bot
reset the two-minute delay at job creation (12:11:35Z), after discovery and
package installation, rather than preserving the original request deadline.
The job command reported a 12:13:35Z target, while the Telegram receipt's
timestamp is 12:13:00Z; exact second-level at scheduling is not certified.
The installed at/atd remain
on the host. No production code fix or cleanup has been performed.

## BUG-008: skip misfire policy suppresses ordinary scheduled runs

Status: confirmed by a configured native interval task and source inspection.

For the native recurring test, added `native-recurring-smoke-20260928` with
a 60-second interval, prompt action, output to the approved Telegram chat,
and `misfirePolicy = "skip"`. Backed up the original config first and passed
the installed CLI's config validation. After startup at 12:17:33Z, no task
runs occurred. At 12:18:46Z, durable run history was still empty while the
cursor had advanced `lastEnqueuedFor` to 12:18:33.298Z.

In `packages/core-runtime/src/scheduler.ts`, `tick` passes every due-time
list to `applyMisfirePolicy`, and `applyMisfirePolicy("skip", ...)` always
returns an empty list. Thus normal due times are discarded along with missed
runs, and the cursor advances without enqueuing anything.

Expected: skip missed executions while still allowing ordinary timely runs.
Changing the test task to the configured default `catch-up-once` is a test
workaround, not a fix. With that policy, two native runs succeeded, scheduled
at 12:19:33.298Z and 12:20:33.298Z. Telegram transport message IDs were 34 and
35; completion times were 12:19:37.135Z and 12:20:36.217Z. This isolates the
skip-policy failure from normal provider execution and native output delivery.
No production code was changed.

## Current stopping point

The user accepted runtime defaults: listen address `127.0.0.1`, port `3344`,
Standard access mode, and data/logs/skills directories under
`/root/.local/share/openassist`.

The user kept `OpenAssist` as the assistant name and accepted the default
persona: `Pragmatic, concise, and execution-focused local AI assistant.`
The user left ongoing objectives/preferences blank. Selected `OpenAI (API
Key)` to match the user's supplied credential. The user kept the provider
display name `openai-main`; setup also assigned internal ID `openai-main`.
The user selected `gpt-6-sol` and Extra high reasoning (`xhigh`). Kept the
default OpenAI endpoint. Entered the supplied API key through the masked
prompt; the selected credential variable is
`OPENASSIST_PROVIDER_OPENAI_MAIN_API_KEY`. The key is excluded from these
notes and the reusable settings. Configuration save and the live provider
reply were subsequently verified as recorded below.

The user selected Telegram and kept `telegram-main` as the channel name;
the generated system channel ID is also `telegram-main`. Entered the supplied
bot token through the masked prompt; it is excluded from notes and reusable
settings. The user left allowed Telegram chat IDs blank, explicitly allowing
all chats the bot can access. The user enabled full access for approved
operators and supplied Telegram user ID `100000001`, which was entered.
The user chose unrestricted Linux systemd filesystem access; selected that
option and accepted its explicit host-write/package-install confirmation.
The user chose `Europe/London`; selected Europe then London and confirmed
the timezone. Setup reports DST awareness and keeps scheduler defaults
`enabled=true`, `NTP policy=warn-degrade`.

The user approved Save. Configuration and credentials were written to the
canonical config/env files and a starter-config backup was created. Quickstart
exited 0 after successful service, health, time, and scheduler checks.
The subsequent doctor check exited 1 with BUG-004. The user supplied Telegram
`/start` and `/status` responses, confirming inbound commands and outbound
rendered/chunked replies. The status confirms sender `100000001`, session
`telegram-main:100000001`, provider `openai-main`, model `gpt-6-sol`, reasoning
`xhigh`, approved-operator `full-root` access, and configured/effective
unrestricted service access. Recovery and scheduler are running and the
Telegram channel is healthy. The time-sync inconsistency is BUG-005.

The user's subsequent normal chat message produced a live model reply with
host diagnostics. Durable tool rows confirm actual `exec.run` calls, including
successful full-path service status, rather than merely claimed tool use.
This verifies a basic OpenAI-to-tools-to-Telegram conversational round trip;
it also exposed BUG-006.

At 12:56 Europe/London, the user asked the bot to create a small text file
containing `OpenAssist file delivery test` and send it back. Telegram delivered
`openassist-file-delivery-test.txt` with caption `Here's the text file.`,
followed by `Sent the text file here.` The user confirmed the test worked.
Record file creation and outbound file delivery as passed based on the user's
live result. Exact file bytes have not been independently inspected. The extra
confirmation message is an observation, not a classified bug.

At 12:58 Europe/London, the user uploaded `test.txt` and asked what was in it.
The bot quoted the document's Git maintenance request and explicitly stated
it had not run those commands. The user confirmed the result passed. Record
inbound text-document reading as passed, including correct handling of this
document's embedded instructions as content. This single example does not
establish general prompt-injection resistance.

At 12:59 Europe/London, the user uploaded `Derek_Trotter.jpg` and asked what
it was. The bot identified the character and described a checked flat cap,
tan coat, and blue turtleneck. The user confirmed the response passed. Record
inbound image handling as user-confirmed; the image and provider payload were
not independently inspected in this test. The descriptive filename means
the character identification alone would not prove visual inspection.

At 13:01 Europe/London, the user asked for a web search for official Ubuntu
24.04 release notes followed by opening the result. Tool audit records confirm
successful `web.search` at 12:01:14Z using the `duckduckgo-html` fallback
backend and successful `web.fetch` at 12:01:17Z with HTTP 200. The fetched
URL and title match the bot's reply. Record native web search and fetching as
passed without a configured Brave API key; no new bug observed in this test.

At 13:02 Europe/London, the user asked to permanently remember the test
project codename `Copper Lantern`. A successful `memory.save` audit row at
12:02:34Z records the fact, keywords, and salience 7. The subsequent
provider-independent `/memory` response shows one visible permanent memory
with the correct fact under actor scope `telegram-main:100000001`.
Record explicit permanent-memory save and inspection as passed. `/memory`
also shows a substantive rolling summary compacted through message ID 24;
long-session behavior has not been stress-tested.

The user approved a service restart. `openassist service restart` exited 0,
and the new runtime started at 12:03:59Z. The daemon health endpoint responds,
systemd reports active/running, recovery and scheduler are running, and
`/v1/channels/status` reports Telegram healthy. The daemon's memory status
endpoint still returns the active Copper Lantern fact under the same actor
scope, retaining its original creation timestamp, plus the rolling session
summary. Record service restart, connector health, and durable memory
persistence as passed. At 13:05 Europe/London, the user asked for the test
project's codename and received `Copper Lantern`, confirming provider replies
and Telegram delivery after restart. This was the same conversation, so the
reply alone does not distinguish permanent-memory recall from retained chat
history. Recall in a fresh context has not been tested.

At 13:06 Europe/London, the user sent `/access standard`. The local response
reported `operator` access from a sender-specific override for this chat,
while keeping the separate systemd boundary unrestricted. File replies and
operator notifications became blocked. The user then requested `pwd` using
the command tool, and the bot correctly refused because no command tool was
callable. A read-only audit query found zero tool invocations from 12:06Z
onward; the most recent invocation remained the earlier memory save.
Record the Standard-mode command denial as passed. This does not yet test
unapproved senders, other chats, or every tool family. The current sender's
access was Standard until the following restoration test.

At 13:07 Europe/London, the user restored `/access full`; the response reported
`full-root` from the sender-specific override and made outbound file replies
and operator notifications available again. The subsequent `pwd` request
produced a successful `exec.run` audit row at 12:07:54Z with exit code 0,
empty stderr, and stdout matching the reported managed release directory.
Record full-access restoration and command execution as passed. The current
sender is back in Full access for this chat.

The one-shot scheduling test failed as recorded in BUG-007. The user confirmed
the OS job's message arrived about four minutes after the two-minute request;
this does not establish native scheduler success.

The user authorized activation recovery and native recurring scheduling tests,
and explicitly skipped the second-account access test due to time constraints.
Recovery passed as described under BUG-004. Native interval testing exposed
BUG-008; switched the test policy to `catch-up-once`, validated config, and
restarted. Two scheduled runs succeeded with separate Telegram delivery IDs.
The bounded observation helper then disabled the task, revalidated config,
and restarted the service. Final daemon health and channel health are good,
the task is disabled, activation is verified, and the OS at queue is empty.
The user confirmed both native messages arrived at 13:19 and 13:20 London
time, with task ID and scheduled timestamps matching the durable run records.
This test explicitly authorized messages to the user's approved Telegram chat.
The bot's earlier interrupted turn has not been continued.

Sanitized final evidence is preserved locally in
`docs/testing/2026-09-28-ubuntu-live-test-evidence.json`: selected build and
activation state, health/time/channel/scheduler responses, native run history,
tool audit counts, the test memory, service PATH, env-file permissions (0600),
and the empty OS queue. It contains no credential values, full environment,
raw database, or unfiltered logs. The original scheduler config backup remains
on the server as `openassist.toml.before-native-scheduler-test`. Temporary pnpm
and at/atd remain installed; the disposable host has not been wiped.

The selected live test session is complete. Eight issues are recorded for the
fixing phase; no production fixes have been applied. The user can retire the
disposable host after preserving these local artifacts. Unapproved-sender
isolation was explicitly skipped, and no broader platform/provider/channel
certification is implied by this single Ubuntu/OpenAI/Telegram run.

Confirmed reusable choices are saved in `docs/testing/default-test-settings.json`
at the user's request. This is a credential-free test answer profile for future
guided runs, not a native CLI import file. Update it as choices are confirmed;
null values remain undecided. Keep temporary workarounds distinct from desired
product defaults so future regression tests do not silently bypass these bugs.
