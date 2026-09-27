# Main, branch, PR and local testing

Source routes use Git, Node >=24.21.0 <25 and pnpm 12.5.1. Source code and dependency scripts execute as your user: an isolated instance is not a sandbox for untrusted code.

## Isolated instances

```bash
openassist dev test --ref main --name main-test
openassist dev test --ref feature/example --name branch-test
openassist dev test --pr 123 --name pr-test
openassist dev test --local "$PWD" --name local-test
openassist dev list --json
openassist dev remove <name> --dry-run
```

Each instance lives under `~/.local/share/openassist/dev/<name>` with separate config, env, database, logs, skills and helpers. It runs in the foreground on an available loopback port; `--port` requests an exact port and fails if occupied. Ctrl-C stops it. Reusing a name preserves its state. Local testing builds working-tree changes without changing branches, cleaning files or committing.

New instances disable channels and scheduled tasks and do not copy primary credentials or inherit OpenAssist credential variables. Configure dedicated test accounts; sharing a Telegram/Discord/WhatsApp account between instances can interfere with routing. The printed `OPENASSIST_STATE_ROOT` setup command addresses the test state. Isolated instances cannot manage the primary service. After a crash, verify the test process has exited before removing only its operation lock.

## Primary-install testing

```bash
openassist update --source --ref main --dry-run
openassist update --source --ref main --yes
openassist update --source --pr 123 --yes
openassist update --release --channel stable --dry-run
openassist update --release --channel stable --yes
```

Candidates build separately and record the exact commit. Primary testing uses real config, channels and conversations, with backup and compatibility checks. Dirty original checkouts are preserved and block migration. PR updates require an explicit target every time. Incompatible data/config versions block returning to an older application.

Update notices compare saved refs locally against GitHub's public refs catalogue. Branches, PR heads and lightweight/annotated tags remain supported; installed immutable commit tracks stay pinned. Missing or ambiguous refs report unavailable: use a fully qualified ref when a branch and tag share a name. Catalogue limits do not change the ability to explicitly build a source target; no check silently falls back to main. See [update discovery limits](upgrade-and-rollback.md) for privacy and failure handling.

Existing installer flags remain supported:

```bash
bash scripts/install/bootstrap.sh --source --ref main
bash scripts/install/bootstrap.sh --ref feature/example
bash scripts/install/bootstrap.sh --pr 123
```

Use `openassist update` for subsequent managed updates; `openassist upgrade` remains an alias. See [release maintenance](release-maintenance.md) and [common troubleshooting](common-troubleshooting.md).

The compatibility source bootstrap creates the initial checkout using the existing build flow. It refuses to overwrite a managed release/source installation; use staged `openassist update` for those installations. The first update imports a legacy checkout's config/service facts and retains that checkout for recovery. The printed setup command uses the instance's own CLI and runtime, so branch-specific configuration is edited with the matching build. For advanced edits, replace its `setup --skip-service` suffix with `setup wizard --skip-post-checks`; service installation is deliberately unavailable for isolated instances. The exact command is also saved in the instance's `instance.json`.
