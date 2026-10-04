import fs from "node:fs";
import path from "node:path";

// String-valued flags in actionlint 1.7.11, the pinned Docker fallback.
const valueFlags = new Set(["ignore", "shellcheck", "pyflakes", "format", "config-file", "stdin-filename"]);

export function workflowTargetPatterns(args) {
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === "--") return args.slice(index + 1);
    // Go's flag parser stops at the first positional argument.
    if (arg === "-" || !arg.startsWith("-")) return args.slice(index);
    const name = arg.replace(/^--?/, "").split("=")[0];
    if (valueFlags.has(name) && !arg.includes("=")) {
      if (index + 1 === args.length) throw new Error(`Missing value for actionlint option: ${arg}`);
      index++;
    }
  }
  return [];
}

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
