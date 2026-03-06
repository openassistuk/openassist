import fs from "node:fs";
import path from "node:path";

function stripQuotes(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith("\"") && trimmed.endsWith("\"")) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function needsQuotes(value: string): boolean {
  return /[\s#"'=]/.test(value);
}

function quoteValue(value: string): string {
  if (!needsQuotes(value)) {
    return value;
  }
  return JSON.stringify(value);
}

/* c8 ignore start -- Unix permission bits require Unix filesystem semantics */
function toModeText(mode: number): string {
  return `0o${(mode & 0o777).toString(8).padStart(3, "0")}`;
}

function supportsUnixPermissionChecks(): boolean {
  return path.sep !== "\\";
}

function assertUnixOwnerOnlyPath(targetPath: string, kind: "file" | "directory"): void {
  if (!supportsUnixPermissionChecks()) {
    return;
  }
  if (!fs.existsSync(targetPath)) {
    throw new Error(`Missing ${kind} path for permission check: ${targetPath}`);
  }

  const stat = fs.statSync(targetPath);
  if (kind === "file" && !stat.isFile()) {
    throw new Error(`Expected file path for permission check: ${targetPath}`);
  }
  if (kind === "directory" && !stat.isDirectory()) {
    throw new Error(`Expected directory path for permission check: ${targetPath}`);
  }

  const mode = stat.mode & 0o777;
  if ((mode & 0o077) !== 0) {
    throw new Error(
      `Insecure permissions on ${kind} '${targetPath}': ${toModeText(mode)}. ` +
        "Use owner-only permissions (no group/other access)."
    );
  }
}
/* c8 ignore stop */

export function enforceEnvFileSecurity(
  filePath: string,
  options: { allowMissing?: boolean } = {}
): void {
  if (!supportsUnixPermissionChecks()) {
    return;
  }

  /* c8 ignore start -- executed on Unix hosts */
  const dirPath = path.dirname(filePath);
  if (fs.existsSync(dirPath)) {
    assertUnixOwnerOnlyPath(dirPath, "directory");
  }

  if (!fs.existsSync(filePath)) {
    if (options.allowMissing) {
      return;
    }
    throw new Error(`Missing env file for permission check: ${filePath}`);
  }

  assertUnixOwnerOnlyPath(filePath, "file");
  /* c8 ignore stop */
}

export function parseEnvFileContent(content: string): Record<string, string> {
  const env: Record<string, string> = {};
  const lines = content.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith("#")) {
      continue;
    }
    const eq = line.indexOf("=");
    if (eq <= 0) {
      continue;
    }
    const key = line.slice(0, eq).trim();
    const value = stripQuotes(line.slice(eq + 1));
    if (!key) {
      continue;
    }
    env[key] = value;
  }
  return env;
}

export function loadEnvFile(filePath: string): Record<string, string> {
  if (!fs.existsSync(filePath)) {
    return {};
  }
  const content = fs.readFileSync(filePath, "utf8");
  return parseEnvFileContent(content);
}

export interface SaveEnvFileOptions {
  ensureMode600?: boolean;
}

export function saveEnvFile(filePath: string, env: Record<string, string>, options: SaveEnvFileOptions = {}): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
  /* c8 ignore start -- Unix-only permission hardening */
  if (supportsUnixPermissionChecks()) {
    fs.chmodSync(path.dirname(filePath), 0o700);
  }
  /* c8 ignore stop */
  const lines = Object.keys(env)
    .sort((a, b) => a.localeCompare(b))
    .map((key) => `${key}=${quoteValue(env[key])}`);
  fs.writeFileSync(filePath, `${lines.join("\n")}${lines.length > 0 ? "\n" : ""}`, "utf8");
  /* c8 ignore next -- Unix-only permission hardening */
  if (options.ensureMode600 !== false && supportsUnixPermissionChecks()) {
    fs.chmodSync(filePath, 0o600);
  }
  enforceEnvFileSecurity(filePath);
}

export function mergeEnv(
  current: Record<string, string>,
  updates: Record<string, string | undefined>
): Record<string, string> {
  const next = { ...current };
  for (const [key, value] of Object.entries(updates)) {
    if (value === undefined || value === "") {
      delete next[key];
      continue;
    }
    next[key] = value;
  }
  return next;
}

export function upsertEnvFile(
  filePath: string,
  updates: Record<string, string | undefined>,
  options: SaveEnvFileOptions = {}
): Record<string, string> {
  const current = loadEnvFile(filePath);
  const merged = mergeEnv(current, updates);
  saveEnvFile(filePath, merged, options);
  return merged;
}

export function writeEnvTemplateIfMissing(filePath: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });
  /* c8 ignore next -- Unix-only permission hardening */
  if (supportsUnixPermissionChecks()) {
    fs.chmodSync(path.dirname(filePath), 0o700);
  }
  const template = [
    "# OpenAssist runtime environment",
    "# Provider API keys:",
    "# OPENASSIST_PROVIDER_OPENAI_MAIN_API_KEY=replace-me",
    "# OPENASSIST_PROVIDER_ANTHROPIC_MAIN_API_KEY=replace-me",
    "# Optional Brave Search API key for native web.search:",
    "# OPENASSIST_TOOLS_WEB_BRAVE_API_KEY=replace-me",
    "# Optional secret key for encrypted OAuth token storage:",
    "# OPENASSIST_SECRET_KEY=base64:<32-byte-key-base64>",
    ""
  ].join("\n");
  let fd: number;
  try {
    fd = fs.openSync(
      filePath,
      fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL,
      0o600
    );
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code === "EEXIST") {
      return;
    }
    throw error;
  }

  try {
    fs.writeFileSync(fd, template, "utf8");
  } finally {
    fs.closeSync(fd);
  }
  /* c8 ignore start -- Unix-only permission hardening */
  if (supportsUnixPermissionChecks()) {
    fs.chmodSync(filePath, 0o600);
  }
  /* c8 ignore stop */
  enforceEnvFileSecurity(filePath);
}
