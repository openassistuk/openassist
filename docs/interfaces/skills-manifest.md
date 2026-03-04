# Skills Manifest Interface

Source of truth:

- `packages/core-types/src/skills.ts`
- `packages/skills-engine/src/index.ts`

A skill is a versioned folder that exposes prompts, references, and optional scripts.

## Required Manifest

Manifest file name: `openassist.skill.json`

Required fields:

- `id`
- `version`
- `description`
- `triggers`
- `requiredCapabilities`
- `resources.promptFiles`
- `resources.referenceFiles`
- `resources.scriptEntrypoints`

## Runtime Contract

Skill runtime interface provides:

- `listInstalled()`
- `installFromPath(path)`
- `resolveForIntent(intent)`
- `executeScript(skillId, entrypoint, input)`

## Scheduler Skill Actions

Scheduler tasks can execute skills using action type `skill`.

Runtime passes scheduler context into script input under `_scheduler`, including task ID and scheduled timestamp.

## Security Boundary

Current trust boundary treats skill scripts as trusted local code.

Path traversal is blocked for entrypoint resolution, but there is no container/sandbox isolation in current release.

## Example Skill

Reference package: `examples/skills/shell-audit/`.
