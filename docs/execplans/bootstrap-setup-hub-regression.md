## Summary

Fix the bootstrap regression that still called the stale `init` handoff before the lifecycle hub, clean up the installer note wording, and align the repo pnpm pin with the current tested version.

## Progress

- [x] Reproduced the regression from code inspection: interactive bootstrap still called `pnpm ... start -- init --config ...` before `openassist setup`.
- [x] Switched bootstrap so only non-interactive installs seed a default config, and they now do it through the direct `openassist init --config ...` path.
- [x] Reworded bootstrap/install notes to explain the pinned pnpm release and WhatsApp/media build-script approval in clearer operator language.
- [x] Aligned the repo pnpm pin across bootstrap, `package.json`, and GitHub workflows to `10.31.0`.
- [x] Ran `pnpm verify:all` after the bootstrap, docs, workflow, and test updates.

## Surprises & Discoveries

- The setup hub itself was not broken; the stale pre-hub config seed was. Interactive installs could have worked without any pre-created config because quickstart/wizard already load an in-memory default config when the file is missing.
- Non-interactive bootstrap still needs explicit config seeding before `service install`, so the fix could not simply remove config initialization entirely.
- PR review caught one more real edge case: the first non-interactive fix used the local `openassist` wrapper before bootstrap had written that wrapper on fresh installs. The final fix uses the direct Node CLI entrypoint instead.

## Decision Log

- Keep config seeding in bootstrap only for non-interactive installs. Interactive installs should enter the hub directly and let the operator’s first saved setup create the real config file.
- Bump the tested pnpm pin to `10.31.0` in the same change because the repo was pinned behind the current installer notice with no intentional documented reason to stay on `10.26.0`.

## Outcomes & Retrospective

- `pnpm verify:all` passed locally after the bootstrap fix, wording cleanup, workflow pin updates, and contract-test refresh.
- The real lesson here was that bootstrap still had one pre-hub legacy command path left over from older lifecycle flows. Tightening the shell-contract tests around that exact handoff is what closes the regression properly.
