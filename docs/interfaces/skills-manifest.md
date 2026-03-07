# Skills Manifest Interface

Source of truth:

- `packages/core-types/src/skills.ts`
- `packages/skills-engine/src/index.ts`
- `packages/core-runtime/src/runtime.ts`
- `packages/storage-sqlite/src/index.ts`
- `apps/openassistd/src/index.ts`
- `apps/openassist-cli/src/index.ts`

A skill is a versioned folder that exposes prompts, references, and optional scripts.

In the current release, skills are also a first-class managed growth surface. The runtime treats them as the preferred durable way to extend OpenAssist behavior without mutating tracked repo files.

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

Runtime growth alignment:

- installed skills live under `runtime.paths.skillsDir`
- runtime syncs installed skills into durable state on startup
- each installed skill is tracked in `managed_capabilities` with `kind="skill"` and `updateSafe=true`
- `openassist doctor`, `openassist upgrade --dry-run`, `/grow`, and `openassist growth status` use that managed-growth state to explain which extensions survive normal updates more predictably than direct repo edits

Operator surfaces:

- `openassist skills list [--json]`
- `openassist skills install --path <dir>`
- `GET /v1/skills`
- `POST /v1/skills/install`

Installing from a local directory copies the skill into the runtime-owned skills directory and refreshes the durable registry entry for that skill ID.

## Scheduler Skill Actions

Scheduler tasks can execute skills using action type `skill`.

Runtime passes scheduler context into script input under `_scheduler`, including task ID and scheduled timestamp.

## Security Boundary

Current trust boundary treats skill scripts as trusted local code.

Path traversal is blocked for entrypoint resolution, but there is no container/sandbox isolation in current release.

Managed-growth guidance:

- skills are the preferred durable growth path for new prompts, references, and helper scripts
- managed skills are more update-safe than editing tracked repo manifests directly
- this does not make skill code untrusted or sandboxed; operators should still review skill content before installation

## Example Skill

Reference package: `examples/skills/shell-audit/`.
