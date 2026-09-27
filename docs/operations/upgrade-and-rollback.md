# Upgrade and Rollback

`openassist upgrade` is the supported in-place update path for an installed OpenAssist checkout.

If dry-run or rollback output still feels unclear, use `docs/operations/common-troubleshooting.md` for the shared repair routes.

OpenAssist upgrades stay repo-backed. The command updates a Git checkout, rebuilds it, restarts the service unless you skip restart, and rolls back automatically when a live upgrade fails after the previous commit has been captured.

Fresh installs now keep normal operator config, env files, logs, data, skills, and helper tools outside the repo checkout. That means `upgrade --dry-run` is now focused on real repo code changes, damaged installs, or legacy repo-local operator layouts instead of warning about ordinary operator state that should never have lived in the checkout.

Runtime `/status` and the provider self-knowledge pack now surface the same repo-backed update facts when they are known: install directory, config path, env-file path, tracked ref, and last known good commit. Treat the lifecycle commands in this runbook as the supported way to mutate that state instead of editing install-state or generated wrappers directly.

The install record keeps a tracked ref for operator visibility, and the update rules now depend on the kind of track:

- normal installs with no explicit track stay on `main`
- branch installs continue following the checked-out branch normally
- PR installs record `refs/pull/<n>/head`, but later `openassist upgrade` requires an explicit `--pr <n>` or `--ref <target>`

That PR rule is deliberate. It keeps developer test installs predictable instead of silently drifting to a different target.

## Commands

Dry-run first:

```bash
openassist upgrade --dry-run --install-dir "$HOME/openassist"
```

Live upgrade:

```bash
openassist upgrade --install-dir "$HOME/openassist"
```

Pin an explicit ref:

```bash
openassist upgrade --install-dir "$HOME/openassist" --ref main
```

Follow a PR install explicitly:

```bash
openassist upgrade --dry-run --install-dir "$HOME/openassist" --pr 123
openassist upgrade --install-dir "$HOME/openassist" --pr 123
```

Skip restart only when you have a deliberate maintenance plan:

```bash
openassist upgrade --install-dir "$HOME/openassist" --skip-restart
```

## What Dry-Run Shows

Dry-run prints the resolved plan before any mutation:

- install directory
- current branch or detached state
- current commit
- tracked ref from install state or repo metadata
- target ref that will be used
- managed skill count and managed helper count
- managed growth directories
- update-safety note for managed extensions versus dirty repo edits
- execution mode:
  - pull on the current branch
  - checkout by ref
  - detached update when the current checkout is detached
- whether restart and health checks will run
- rollback target

It then tells you the exact live command and the next validation commands to run.

The dry-run classification is now explicit:

- `safe to continue`
- `fix before updating`
- `rerun bootstrap instead`

`openassist upgrade --dry-run` uses the same readiness model as `openassist doctor`, so the blockers and the recommended next command should agree across both commands. Human-readable lifecycle output now always uses:

- `Ready now`
- `Needs action`
- `Next command`

`openassist doctor --json` keeps the grouped machine-readable lifecycle structure for automation and uses report `version: 3` with per-item `stage` metadata plus shared service-boundary context.

Managed growth note:

- managed skills and registered helper tools are designed to survive normal upgrades
- `openassist upgrade --dry-run` makes that explicit so operators can distinguish update-safe extensions from dirty repo code changes
- direct edits to tracked repo files still make the working tree dirty and are not treated as managed growth in this release
- on Linux, the same readiness output also shows whether the daemon service is still using the hardened systemd sandbox before you rely on package-install or broader host-write behavior after upgrade

Detached checkout note:

- if dry-run shows `Current branch: HEAD`, the repo is detached
- for detached installs on a normal branch/tag path, prefer `openassist upgrade --dry-run --ref <branch-or-tag> --install-dir "$HOME/openassist"` before the live run
- for detached PR installs, expect `Needs action` until you pass `--pr <n>` or `--ref <target>` explicitly

Developer track note:

- branch installs remain a first-class developer workflow and keep following their branch normally
- PR installs are also supported, but every later upgrade must stay explicit with `--pr` or `--ref`
- moving a PR/branch test install back to the normal release track is explicit: `openassist upgrade --ref main`

## Use Upgrade When

`openassist upgrade` is the right tool when all of these are true:

- the install directory is still a repo-backed checkout
- the working tree is clean
- you want to stay on the current install directory
- you want the CLI to manage fetch, build, restart, health, and rollback

Check readiness first:

```bash
openassist doctor
openassist upgrade --dry-run --install-dir "$HOME/openassist"
```

## Re-Run Bootstrap Instead When

Use `install.sh` or `scripts/install/bootstrap.sh` again when:

- the install directory is missing `.git`
- the checkout is damaged or untrusted
- wrappers are missing or badly broken
- build output is missing under `apps/openassist-cli/dist` or `apps/openassistd/dist`
- you want to move a detached install back onto a known branch through the installer flow
- you want a fresh install directory
- the repo metadata is no longer coherent enough for a safe in-place update

If the install still uses the recognized old repo-local operator layout (`openassist.toml`, `config.d`, and `.openassist` inside the install directory), `doctor` and `upgrade --dry-run` will route you back to `openassist setup` first so the operator state can move into the canonical home-state layout before you trust upgrade output.

## Local Code Changes

Update now refuses to continue when the install directory has local code changes.

The operator guidance is explicit:

- commit or stash local changes first
- if the checkout is no longer trustworthy, rerun bootstrap in a fresh install directory

There is no dirty-tree override in the public lifecycle flow. The installer's `--allow-dirty` flag applies to bootstrap only and is not the supported in-place upgrade path.

## Live Upgrade Sequence

Live upgrade performs this sequence:

1. verify `git`, `pnpm`, and `node`
2. confirm the install is repo-backed
3. capture repo metadata and current commit
4. print the resolved plan
5. require a clean working tree
6. fetch the target ref
7. update the checkout
8. run `pnpm install --frozen-lockfile`
9. run `pnpm -r build`
10. restart the service unless `--skip-restart`
11. run the daemon health gate
12. persist the new known-good commit in install state

## Rollback Behavior

If the upgrade fails after the previous commit is known, OpenAssist:

1. checks out the rollback target
2. reinstalls dependencies
3. rebuilds the repo
4. restarts the service, unless restart was skipped
5. reruns the health gate

The command now always prints:

- what rollback restored
- whether service health was rechecked
- what to run next

## After a Successful Upgrade

Run the next checks that the command prints, or run them directly:

```bash
openassist service health
openassist channel status
openassist doctor
openassist growth status
```

If you skipped restart, restart explicitly before treating the upgrade as complete:

```bash
openassist service restart
openassist service health
```

## Source-Checkout Alternative

Installed commands are the primary operator path. For contributor workflows:

```bash
pnpm --filter @openassist/openassist-cli dev -- upgrade --dry-run --install-dir "$PWD"
```

Setup readiness rejects invalid bind addresses before network probing. If this blocks setup or repair, correct the address using the [invalid-bind-address guidance](common-troubleshooting.md#invalid-bind-address) and retry; valid addresses still receive normal port checks.

## Node 24 runtime migration

OpenAssist requires Node.js `>=24.21.0 <25`. Node 22, Node 25+, and earlier Node 24 versions are rejected before the CLI or daemon loads providers or opens operator state. Upgrade Node before upgrading OpenAssist. No database migration or automatic model replacement is included.

1. Schedule a maintenance window and run `openassist service stop`. Confirm it is stopped with `openassist service status` before copying SQLite files. Record the install directory, `git rev-parse HEAD` from that directory, the old Node executable and version, and the service definition. Preserve the previous checkout, including built output and its dependency installation, until recovery is proven.
2. Back up `~/.config/openassist` and `~/.local/share/openassist` (or every custom path configured in your installation). Include config overlays, env files, encrypted credentials, SQLite files, channel sessions, skills and helper tools. Keep owner-only permissions; the backup contains credentials. Back up the service unit or LaunchAgent plist and wrapper as well. A stopped default-layout installation can be copied with the following commands; choose an existing private backup location and substitute custom paths when applicable:

   ```bash
   umask 077
   backup_dir="$HOME/openassist-backup-$(date +%Y%m%d-%H%M%S)"
   mkdir -p "$backup_dir/config" "$backup_dir/share"
   cp -pR "$HOME/.config/openassist" "$backup_dir/config/"
   cp -pR "$HOME/.local/share/openassist" "$backup_dir/share/"
   ```

3. Install Node 24.21.0 or a newer 24.x release using your normal Node manager, NodeSource 24 on Linux, or Homebrew `node@24` on macOS. Retain the old executable for rollback. Confirm `node --version` and `command -v node`. Install the pinned package manager with `npm install --global --force --allow-scripts=pnpm pnpm@12.5.1`, then check `pnpm --version`. npm's permission is scoped to pnpm's installer; workspace dependency scripts remain restricted by `allowBuilds`.
4. Inspect the service's executable, which can differ from your shell. For Linux user services, use `systemctl --user cat openassistd.service`; for system services use `sudo systemctl cat openassistd.service`. Record and back up the unit path displayed, then run the absolute Node path from `ExecStart` with `--version`. For macOS, inspect `~/Library/LaunchAgents/ai.openassist.openassistd.plist` and `~/.config/openassist/openassistd-launchd-wrapper.sh`; run the absolute Node path in the wrapper's final `exec` line with `--version`. Back up both files with permissions intact. Do not paste env-file contents into logs or support requests.
5. If the service Node path changed, run the existing CLI under the new Node executable and regenerate its service definition, preserving your install, config and env paths. `openassist service install --dry-run --install-dir <install-dir> --config <config-path> --env-file <env-path>` previews the operation; repeat without `--dry-run` to apply it. Service generation records the CLI's actual Node executable. If the installed wrapper selects the old Node, invoke `/absolute/path/to/node24 <install-dir>/apps/openassist-cli/dist/index.js service install` with those same flags. Recheck the generated service path. Installation may start the service; keep traffic paused until health checks pass.
6. Run `openassist upgrade --dry-run`, resolve its blockers, then run `openassist upgrade` with the same install/track flags used by your installation. Verify `openassist service restart`, `openassist service health`, and `openassist doctor`. Check that previous conversations, credentials and channel sessions remain available before ending the maintenance window.

If migration or upgrade fails, stop the service, preserve the failed checkout and state for diagnosis, and restore the previous checkout plus its service definition and Node executable. Use the restored version's package manager and frozen lockfile if dependencies need rebuilding. Reload systemd or bootstrap the restored LaunchAgent through the previous CLI's `service install`, then start the service and verify health. Restore operator-state backups only if state changed and recovery requires it; preserve newer data separately first. Automatic application rollback does not roll back a separately installed Node runtime or manually changed service definition.

Local regression tests cover Node 22 rejection before state access, upgrade failure/rollback, and generated service paths. Live Linux/macOS Node migration remains a release certification check; the Windows quality matrix is not operator-platform certification.

When quickstart changes an Anthropic model, incompatible saved thinking settings now trigger an explicit reset-or-select-another-model prompt; compatible settings and saved Opus 4.5 aliases are preserved. See [quickstart](quickstart-linux-macos.md) for the guided repair flow.
