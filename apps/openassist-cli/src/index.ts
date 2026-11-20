#!/usr/bin/env node
// Check before importing SDKs or opening operator state.
const [major, minor, patch] = process.versions.node.split(".").map(Number);
if (major !== 24 || minor! < 22 || (minor === 22 && patch! < 3)) {
  console.error(`OpenAssist requires Node.js >=24.22.3 <25 (found ${process.version}). Install Node 24.22.3 or newer Node 24, verify the service uses it, then rerun this command.`);
  process.exitCode = 1;
} else {
  await import("./main.js");
}
export {};
