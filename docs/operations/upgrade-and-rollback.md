# Upgrade and rollback

Activation and rollback derive daemon identity from the executing application's build metadata. The successful install record is still committed only after verification; the daemon refreshes its update track from that matching record. Archive preparation resolves complete link chains before extraction and rejects links that escape the installation, including traversal hidden behind another link.

`openassist update` prepares a replacement separately before activation. `openassist upgrade` is its compatible alias. Normal installs follow signed stable releases; existing source installations keep their source track until explicitly migrated.

```bash
openassist update check
openassist update --dry-run
openassist update
openassist doctor
```

Output keeps `Ready now`, `Needs action`, and `Next command`. Lifecycle mutations support `--dry-run` and `--json`. Availability is not an error; failed updates exit nonzero. Interactive installation-method changes require confirmation; unattended changes require explicit selectors and `--yes`.

## Release tracks and source migration

```bash
openassist update --release --channel stable --yes
openassist update --release --channel preview --yes
openassist update --version <version> --yes
openassist update --source --ref main --yes
openassist update --source --pr 123 --yes
```

Exact versions remain pinned until changed. Release/source selectors cannot be combined. `--ref` and `--pr` keep their source meanings through the `upgrade` alias. PR tracks require an explicit target each time. Source builds record the resolved commit; dirty original checkouts are preserved and block migration.

Packaged apps include private Node. Source builds need the pinned development toolchain. Signed `v0.2.1` is the current stable publication; [v0.2.2](../releases/v0.2.2.md) prepares the model refresh and remains pending its separate publication gates. After it is published, select stable explicitly or use `openassist update --version 0.2.2 --dry-run` followed by `openassist update --version 0.2.2` for an exact pin. Updating preserves saved model IDs and tuning; use `openassist setup wizard` to adopt new recommendations or repair retired selections. Release selection fails closed when an asset, signature or prerequisite is unavailable. See [release maintenance](release-maintenance.md).

## Activation and health

The updater locks the installation, prepares and validates the candidate, stops the owned service, backs up consistent config/state, normalizes relative operator paths and switches the managed application. A previously running service is restarted and checked against expected build/instance identity. Channel connection failures remain separate from core readiness.

Preparation failure leaves the service untouched. Activation failure attempts compatible rollback using retained application/runtime files without downloads or rebuilds. Stop manually running daemons before activation. `--skip-restart` leaves the service stopped and candidate unverified:

```bash
openassist service start
openassist update recover --dry-run
openassist update recover --yes
```

## Rollback and interrupted operations

```bash
openassist rollback --dry-run
openassist rollback --yes
openassist update recover --dry-run
openassist update recover --yes
```

The journal records preparation, stop, backup, activation and health. Recovery confirms an unverified candidate or restores the compatible previous application. A lock is never cleared from a PID alone: preserve `owner.json`, verify no lifecycle operation remains, then remove only that lock directory and retry. Do not remove journal-referenced releases/backups.

Application rollback preserves current conversations and audit rows. Config/database compatibility is checked before activation; destructive migrations and downgrades are not automatic. For manual state recovery, stop the daemon, preserve newer state separately, restore a consistent database including required WAL state and matching configuration/credentials, and review queued external actions before replay. An old backup can lack records of already-delivered actions.

First migration retains the original source checkout. Recognized old repo-local state still uses setup migration: timestamped backup, conflict checks and verification before cleanup. Unknown custom layouts require explicit repair.

## Update notices

Interactive setup/doctor checks cache availability for 24 hours. No updates, scheduled shell jobs or restarts happen automatically. Explicit `openassist update check` bypasses cache. Set `openassist update notifications <mode>` to `on` or `off`. Network failures leave the working app untouched.

The versioned cache stores only a local timestamp, availability status and whether an explicit PR target is required. Server-provided versions, commits and response text are not persisted. Cached status/notices therefore report availability without a target version; explicit `openassist update check` fetches fresh metadata and displays target details. Older unversioned caches are ignored and replaced on the next allowed check; disabling notifications still prevents opportunistic requests.

Checks fetch public catalogues from fixed OpenAssist GitHub endpoints and select the saved target locally. Saved version/ref text, credentials and configuration contents are not included in discovery requests. Latest stable follows GitHub's latest-release designation; preview and exact pins are selected from release pages. Source checks use the complete public refs catalogue, including PR heads; annotated tags use the tags catalogue to obtain a commit. Already-installed immutable commit tracks remain pinned. Checks report advisory availability; dry-run/preparation verifies the selected signed release manifest and compatibility before service stop.

Discovery is limited to ten seconds overall, ten pages of 100 release/tag entries at 2 MiB per page, and a complete refs response of at most 4 MiB/10,000 entries. Missing, malformed, ambiguous, rate-limited or over-limit results report unavailable and leave the application unchanged. Exact pins never silently fall back to latest. Retry an unavailable check later; for ambiguous branch/tag names choose a fully qualified ref such as `--source --ref refs/heads/main`. Malformed saved refs require an explicit valid source target. Custom remotes still require explicit source update guidance. Installed-client downloads reject unapproved hosts/routes and redirects; do not disable this control to work around a network error.

## Node 24 runtime migration

Source installs require Node >=24.21.0 <25 and pnpm 12.5.1. Update shell and service runtimes before using the new source CLI. Back up the service definition, checkout, config, credentials and database. Entrypoint guards reject unsupported Node before provider/storage imports. Packaged releases carry the tested runtime and retain it for rollback.

After migration check `openassist service health`, `openassist doctor`, existing conversations and channel sessions. Local tests are distinct from live Linux/macOS certification. See [developer testing](developer-testing.md), [uninstall](uninstall.md), and [common troubleshooting](common-troubleshooting.md).

## Ubuntu regression candidate

Managed one-shot tables are additive at database version 1. A candidate lacking managed-one-shots-v1 cannot be selected for managed rollback while reminders are pending, executing, ready or delivering. Complete or cancel tasks and wait for in-flight work; do not downgrade or delete state to bypass the guard.

See the [native reminder contract](../interfaces/scheduler-and-time.md#managed-one-shot-reminders) and [resolution matrix](../testing/ubuntu-live-test-resolution.md).

Model recommendations: fresh OpenAI/Codex setup suggests GPT-6.1 Sol with xhigh; Anthropic suggests Opus 5.5. Updates and restarts preserve saved model IDs and tuning. Review [route-specific compatibility](../providers/model-compatibility.md) before explicitly changing models in `openassist setup wizard`; verify with `openassist doctor` and a real reply.

Model lifecycle checks preserve saved IDs while warning for announced deprecations and blocking retired cataloged models during readiness and requests. Choose a replacement explicitly through `openassist setup wizard`; service restart or credential relinking does not restore a retired model. Check the [route-specific model matrix](../providers/model-compatibility.md#other-endpoints-and-migration), including Codex GPT-5.5 on October 14 and Claude Sonnet 4.5 on November 30.
