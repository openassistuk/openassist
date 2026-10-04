import fs from "node:fs";
import path from "node:path";

// Syntax lint and action-version policy must inspect the same requested files.
export function resolveWorkflowTargets(patterns, cwd = process.cwd()) {
  const targets = new Set();
  for (const pattern of patterns) {
    const matches = fs.globSync(pattern, { cwd })
      .map(file => path.resolve(cwd, file))
      .filter(file => fs.statSync(file).isFile());
    if (matches.length === 0) {
      throw new Error(`No workflow files matched: ${pattern}`);
    }
    for (const file of matches) targets.add(file);
  }
  if (targets.size === 0) throw new Error("No workflow files matched: no targets supplied");
  return [...targets].sort();
}
