import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { loadConfig } from "@openassist/config";
import { preferredLocalHealthBaseUrl } from "./health-check.js";

export const workspaceCwd = process.env.INIT_CWD ? path.resolve(process.env.INIT_CWD) : process.cwd();

export function resolveFromWorkspace(target: string): string {
  if (path.isAbsolute(target)) {
    return target;
  }
  return path.resolve(workspaceCwd, target);
}

export function resolveDbPath(dbPath?: string): string {
  if (dbPath) {
    return resolveFromWorkspace(dbPath);
  }
  return resolveFromWorkspace(".openassist/data/openassist.db");
}

export function defaultInstallDir(): string {
  return path.join(os.homedir(), "openassist");
}

export function defaultEnvFilePath(): string {
  return path.join(os.homedir(), ".config", "openassist", "openassistd.env");
}

export function defaultInstallStatePath(): string {
  return path.join(os.homedir(), ".config", "openassist", "install-state.json");
}

export function detectDefaultDaemonBaseUrl(configPath = "openassist.toml"): string {
  try {
    const resolvedConfigPath = resolveFromWorkspace(configPath);
    const configDir = path.dirname(resolvedConfigPath);
    const { config } = loadConfig({
      baseFile: resolvedConfigPath,
      overlaysDir: path.join(configDir, "config.d")
    });
    return preferredLocalHealthBaseUrl(config.runtime.bindAddress, config.runtime.bindPort);
  } catch {
    return "http://127.0.0.1:3344";
  }
}

export async function requestJson(
  method: string,
  url: string,
  body?: Record<string, unknown>
): Promise<{ status: number; data: unknown }> {
  const response = await fetch(url, {
    method,
    headers: {
      "content-type": "application/json",
      accept: "application/json"
    },
    body: body ? JSON.stringify(body) : undefined
  });

  const text = await response.text();
  const data = text.length > 0 ? JSON.parse(text) : {};
  return {
    status: response.status,
    data
  };
}

export function openUrlInBrowser(url: string): void {
  if (process.platform === "win32") {
    spawn("cmd", ["/c", "start", "", url], { detached: true, stdio: "ignore" }).unref();
    return;
  }
  if (process.platform === "darwin") {
    spawn("open", [url], { detached: true, stdio: "ignore" }).unref();
    return;
  }
  spawn("xdg-open", [url], { detached: true, stdio: "ignore" }).unref();
}

function findRepoRootFrom(startDir: string): string | undefined {
  let current = path.resolve(startDir);
  while (true) {
    const packageJsonPath = path.join(current, "package.json");
    const workspacePath = path.join(current, "pnpm-workspace.yaml");
    if (fs.existsSync(packageJsonPath) && fs.existsSync(workspacePath)) {
      try {
        const raw = JSON.parse(fs.readFileSync(packageJsonPath, "utf8")) as { name?: string };
        if (raw.name === "openassist") {
          return current;
        }
      } catch {
        // Ignore parse errors and continue searching parent directories.
      }
    }
    const parent = path.dirname(current);
    if (parent === current) {
      return undefined;
    }
    current = parent;
  }
}

export function detectRepoRoot(): string {
  const fromWorkspace = findRepoRootFrom(workspaceCwd);
  if (fromWorkspace) {
    return fromWorkspace;
  }

  const thisFile = fileURLToPath(import.meta.url);
  const fromModule = findRepoRootFrom(path.dirname(thisFile));
  if (fromModule) {
    return fromModule;
  }

  return workspaceCwd;
}
