# Upgrade and rollback

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

Packaged apps include private Node. Source builds need the pinned development toolchain. Until the production key and first signed release exist, release selection fails closed. See [release maintenance](release-maintenance.md).

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

Checks send only the selected public version/ref to OpenAssist's GitHub endpoints. Malformed saved source refs return unavailable without making a request; source preparation also rejects them before running Git. Repair the recorded track with an explicit valid `--source --ref <ref>` update. Credentials and configuration contents are not included in update requests; custom remotes require an explicit source update dry-run.

## Node 24 runtime migration

Source installs require Node >=24.21.0 <25 and pnpm 12.5.1. Update shell and service runtimes before using the new source CLI. Back up the service definition, checkout, config, credentials and database. Entrypoint guards reject unsupported Node before provider/storage imports. Packaged releases carry the tested runtime and retain it for rollback.

After migration check `openassist service health`, `openassist doctor`, existing conversations and channel sessions. Local tests are distinct from live Linux/macOS certification. See [developer testing](developer-testing.md), [uninstall](uninstall.md), and [common troubleshooting](common-troubleshooting.md).
