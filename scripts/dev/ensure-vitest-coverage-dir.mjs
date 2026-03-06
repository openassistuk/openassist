import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..", "..");
const coverageTmpDir = path.join(repoRoot, "coverage", "vitest", ".tmp");

fs.mkdirSync(coverageTmpDir, { recursive: true });
