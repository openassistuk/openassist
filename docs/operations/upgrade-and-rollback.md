# Upgrade and Rollback

`openassist upgrade` is the supported in-place update path for an installed OpenAssist checkout.

OpenAssist upgrades stay repo-backed. The command updates a Git checkout, rebuilds it, restarts the service unless you skip restart, and rolls back automatically when a live upgrade fails after the previous commit has been captured.

Runtime `/status` and the provider self-knowledge pack now surface the same repo-backed update facts when they are known: install directory, config path, env-file path, tracked ref, and last known good commit. Treat the lifecycle commands in this runbook as the supported way to mutate that state instead of editing install-state or generated wrappers directly.

The install record keeps a tracked ref for operator visibility, but target selection still follows the currently checked-out branch unless you pass `--ref`. Detached installs should usually use an explicit `--ref`.

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

`openassist upgrade --dry-run` uses the same readiness model as `openassist doctor`, so the grouped blockers and the recommended next command should agree across both commands.

Detached checkout note:

- if dry-run shows `Current branch: HEAD`, the repo is detached
- without `--ref`, the upgrade path resolves a default target ref instead of following a named branch
- for public operator use, prefer `openassist upgrade --dry-run --ref <branch-or-tag> --install-dir "$HOME/openassist"` before the live run

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
