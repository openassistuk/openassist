#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { spawn } from "node:child_process";
import { Command } from "commander";
import { loadConfig, parseConfig, writeDefaultConfig } from "@openassist/config";
import { migrateOpenClawConfig, writeMigratedConfig } from "@openassist/migration-openclaw";
import { createLogger } from "@openassist/observability";
import { registerSetupCommands } from "./commands/setup.js";
import { registerServiceCommands } from "./commands/service.js";
import { registerUpgradeCommand } from "./commands/upgrade.js";
import { SpawnCommandRunner } from "./lib/command-runner.js";
import { detectInstallStateFromRepo, loadInstallState } from "./lib/install-state.js";
import { createServiceManager, detectServiceManagerKind } from "./lib/service-manager.js";

const logger = createLogger({ service: "openassist-cli" });
const workspaceCwd = process.env.INIT_CWD ? path.resolve(process.env.INIT_CWD) : process.cwd();

function resolveFromWorkspace(target: string): string {
  if (path.isAbsolute(target)) {
    return target;
  }
  return path.resolve(workspaceCwd, target);
}

function resolveDbPath(dbPath?: string): string {
  if (dbPath) {
    return resolveFromWorkspace(dbPath);
  }
  return resolveFromWorkspace(".openassist/data/openassist.db");
}

function defaultInstallDir(): string {
  return path.join(os.homedir(), "openassist");
}

function detectDefaultDaemonBaseUrl(configPath = "openassist.toml"): string {
  try {
    const resolvedConfigPath = resolveFromWorkspace(configPath);
    const configDir = path.dirname(resolvedConfigPath);
    const { config } = loadConfig({
      baseFile: resolvedConfigPath,
      overlaysDir: path.join(configDir, "config.d")
    });
    return `http://${config.runtime.bindAddress}:${config.runtime.bindPort}`;
  } catch {
    return "http://127.0.0.1:3344";
  }
}

function defaultEnvFilePath(): string {
  return path.join(os.homedir(), ".config", "openassist", "openassistd.env");
}

function normalizeBrowserUrl(candidate: string): string {
  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new Error("Authorization URL is invalid");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Authorization URL must use http or https");
  }
  if (parsed.username || parsed.password) {
    throw new Error("Authorization URL must not contain credentials");
  }
  return parsed.toString();
}

async function requestJson(
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

function openUrlInBrowser(url: string): void {
  const safeUrl = normalizeBrowserUrl(url);
  if (process.platform === "win32") {
    spawn("explorer.exe", [safeUrl], { detached: true, stdio: "ignore", shell: false }).unref();
    return;
  }
  if (process.platform === "darwin") {
    spawn("open", [safeUrl], { detached: true, stdio: "ignore", shell: false }).unref();
    return;
  }
  spawn("xdg-open", [safeUrl], { detached: true, stdio: "ignore", shell: false }).unref();
}

function defaultInstallStatePath(): string {
  return path.join(os.homedir(), ".config", "openassist", "install-state.json");
}

function commandAvailable(command: string): boolean {
  const result = spawnSync(command, ["--version"], {
    encoding: "utf8",
    stdio: ["ignore", "ignore", "ignore"]
  });
  return result.status === 0;
}

const program = new Command();
program.name("openassist").description("OpenAssist CLI").version("0.1.0");
registerSetupCommands(program);
registerServiceCommands(program);
registerUpgradeCommand(program);

program
  .command("doctor")
  .description("Check install, setup, and upgrade readiness")
  .action(async () => {
    console.log("OpenAssist lifecycle doctor");
    const detectedTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const installStatePath = defaultInstallStatePath();
    const installState = loadInstallState();
    const installDir = installState?.installDir ?? defaultInstallDir();
    const configPath = installState?.configPath ?? resolveFromWorkspace("openassist.toml");
    const envFilePath = installState?.envFilePath ?? defaultEnvFilePath();
    const repoMetadata = detectInstallStateFromRepo(installDir);
    const trackedRef = installState?.trackedRef ?? repoMetadata.trackedRef ?? "main";
    const repoUrl = installState?.repoUrl ?? repoMetadata.repoUrl ?? "(not recorded)";
    const currentCommit = repoMetadata.lastKnownGoodCommit ?? installState?.lastKnownGoodCommit ?? "(unknown)";
    const daemonBaseUrl = detectDefaultDaemonBaseUrl(configPath);
    const hasGit = commandAvailable("git");
    const hasPnpm = commandAvailable("pnpm");
    const repoBacked = fs.existsSync(path.join(installDir, ".git"));
    const checks = [
      {
        name: "Node version",
        ok: Number(process.versions.node.split(".")[0]) >= 22,
        detail: process.version,
        required: true
      },
      {
        name: "Install record",
        ok: Boolean(installState),
        detail: installState ? installStatePath : `${installStatePath} (missing)`,
        required: false
      },
      {
        name: "Repo-backed install",
        ok: repoBacked,
        detail: installDir,
        required: true
      },
      {
        name: "Config file",
        ok: fs.existsSync(configPath),
        detail: configPath,
        required: true
      },
      {
        name: "Env file",
        ok: fs.existsSync(envFilePath),
        detail: envFilePath,
        required: false
      },
      {
        name: "Tracked ref",
        ok: trackedRef.length > 0,
        detail: trackedRef,
        required: false
      },
      {
        name: "Repo URL",
        ok: repoUrl !== "(not recorded)",
        detail: repoUrl,
        required: false
      },
      {
        name: "Current commit",
        ok: currentCommit !== "(unknown)",
        detail: currentCommit,
        required: false
      },
      {
        name: "Detected timezone",
        ok: typeof detectedTimezone === "string" && detectedTimezone.length > 0,
        detail: detectedTimezone || "unknown",
        required: false
      },
      {
        name: "Upgrade prerequisites",
        ok: hasGit && hasPnpm,
        detail: `git=${hasGit ? "ok" : "missing"}, pnpm=${hasPnpm ? "ok" : "missing"}`,
        required: true
      }
    ];

    try {
      const serviceKind = detectServiceManagerKind();
      let installedDetail: string = serviceKind;
      let installedOk = false;
      try {
        const service = createServiceManager(new SpawnCommandRunner());
        installedOk = await service.isInstalled();
        installedDetail = `${serviceKind} / installed=${installedOk ? "yes" : "no"}`;
      } catch {
        installedDetail = `${serviceKind} / install state unavailable`;
      }
      checks.push({
        name: "Service manager",
        ok: true,
        detail: installedDetail,
        required: false
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      checks.push({
        name: "Service manager",
        ok: false,
        detail: message,
        required: false
      });
    }

    try {
      const result = await requestJson("GET", `${daemonBaseUrl}/v1/time/status`);
      if (result.status < 400) {
        const data = result.data as {
          time?: { timezone?: string; timezoneConfirmed?: boolean; clockHealth?: string };
        };
        checks.push({
          name: "Time status API",
          ok: true,
          detail: `${data.time?.timezone ?? "unknown"} / confirmed=${String(
            data.time?.timezoneConfirmed ?? false
          )} / clock=${data.time?.clockHealth ?? "unknown"}`,
          required: false
        });
      } else {
        checks.push({
          name: "Time status API",
          ok: false,
          detail: `daemon responded ${result.status}`,
          required: false
        });
      }
    } catch {
      checks.push({
        name: "Time status API",
        ok: false,
        detail: `daemon not reachable at ${daemonBaseUrl}`,
        required: false
      });
    }

    const upgradeReady =
      checks.find((check) => check.name === "Node version")?.ok === true &&
      checks.find((check) => check.name === "Repo-backed install")?.ok === true &&
      checks.find((check) => check.name === "Config file")?.ok === true &&
      checks.find((check) => check.name === "Upgrade prerequisites")?.ok === true;

    checks.push({
      name: "Upgrade readiness",
      ok: upgradeReady,
      detail: upgradeReady
        ? `run openassist upgrade --dry-run --install-dir "${installDir}"`
        : "fix the failed checks above before upgrading",
      required: false
    });

    for (const check of checks) {
      const prefix = check.ok ? "PASS" : check.required ? "FAIL" : "WARN";
      console.log(`${prefix}  ${check.name} (${check.detail})`);
    }

    console.log("Next step:");
    if (!fs.existsSync(configPath)) {
      console.log(`- Run setup quickstart: openassist setup quickstart --install-dir "${installDir}" --config "${configPath}" --env-file "${envFilePath}"`);
    } else if (!upgradeReady) {
      console.log("- Repair the failed lifecycle checks, then rerun: openassist doctor");
    } else {
      console.log(`- Validate the next update safely: openassist upgrade --dry-run --install-dir "${installDir}"`);
    }

    const failures = checks.filter((check) => check.required && !check.ok);
    if (failures.length > 0) {
      process.exitCode = 1;
    }
  });

program
  .command("init")
  .description("Create default openassist.toml if missing")
  .option("--config <path>", "Config output path", "openassist.toml")
  .action((options) => {
    const target = resolveFromWorkspace(options.config);
    if (fs.existsSync(target)) {
      console.log(`Config already exists: ${target}`);
      return;
    }

    writeDefaultConfig(target);
    console.log(`Wrote ${target}`);

    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (process.stdout.isTTY && process.stdin.isTTY && timezone) {
      console.log("");
      console.log("Next step after starting daemon:");
      console.log(`  openassist time confirm --timezone ${timezone}`);
      console.log("Source checkout alternative:");
      console.log(
        `  pnpm --filter @openassist/openassist-cli dev -- time confirm --timezone ${timezone}`
      );
    } else {
      console.log("After daemon start, confirm timezone with:");
      console.log("  openassist time confirm --timezone <IANA-Timezone>");
      console.log("Source checkout alternative:");
      console.log(
        "  pnpm --filter @openassist/openassist-cli dev -- time confirm --timezone <IANA-Timezone>"
      );
    }
  });

const configCommand = program.command("config").description("Config operations");
configCommand
  .command("validate")
  .description("Validate OpenAssist config")
  .option("--config <path>", "Path to openassist.toml", "openassist.toml")
  .action((options) => {
    const configPath = resolveFromWorkspace(options.config);
    const configDir = path.dirname(configPath);

    try {
      const { config, loadedFiles } = loadConfig({
        baseFile: configPath,
        overlaysDir: path.join(configDir, "config.d")
      });
      parseConfig(config);
      console.log("Config is valid.");
      for (const file of loadedFiles) {
        console.log(` - ${file}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Config validation failed: ${message}`);
      process.exitCode = 1;
    }
  });

const migrateCommand = program.command("migrate").description("Migration operations");
migrateCommand
  .command("openclaw")
  .description("Migrate OpenClaw config to OpenAssist")
  .requiredOption("--input <path>", "OpenClaw root path")
  .option("--output <path>", "Output openassist.toml path", "openassist.toml")
  .action((options) => {
    try {
      const inputPath = resolveFromWorkspace(options.input);
      const outputPath = resolveFromWorkspace(options.output);

      const result = migrateOpenClawConfig(inputPath);
      writeMigratedConfig(outputPath, result.config);

      console.log(`Migration written to ${outputPath}`);
      for (const file of result.sourceFiles) {
        console.log(` - source: ${file}`);
      }

      if (result.warnings.length > 0) {
        console.log("Warnings:");
        for (const warning of result.warnings) {
          console.log(` - ${warning}`);
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Migration failed: ${message}`);
      process.exitCode = 1;
    }
  });

const authCommand = program.command("auth").description("OAuth account management");
authCommand
  .command("start")
  .description("Start OAuth login flow for a provider")
  .requiredOption("--provider <id>", "Provider ID")
  .option("--account <id>", "Account ID", "default")
  .option("--scope <scope>", "OAuth scope", (value, previous: string[]) => [...previous, value], [])
  .option("--redirect-uri <uri>", "Redirect URI override")
  .option("--base-url <url>", "Daemon API base URL", detectDefaultDaemonBaseUrl())
  .option("--open-browser", "Open login URL in your default browser")
  .action(async (options) => {
    try {
      const providerId = String(options.provider);
      const accountId = String(options.account);
      const baseUrl = String(options.baseUrl).replace(/\/+$/, "");
      const body: Record<string, unknown> = {
        accountId,
        scopes: options.scope as string[]
      };
      if (typeof options.redirectUri === "string" && options.redirectUri.length > 0) {
        body.redirectUri = options.redirectUri;
      }

      const result = await requestJson("POST", `${baseUrl}/v1/oauth/${providerId}/start`, body);
      if (result.status >= 400) {
        throw new Error(`Request failed with status ${result.status}`);
      }

      const response = result.data as {
        authorizationUrl: string;
        state: string;
        expiresAt?: string;
        accountId: string;
      };

      console.log(`Provider: ${providerId}`);
      console.log(`Account: ${response.accountId}`);
      console.log(`State: ${response.state}`);
      if (response.expiresAt) {
        console.log(`Expires: ${response.expiresAt}`);
      }
      console.log(`Authorization URL:\n${response.authorizationUrl}`);

      if (options.openBrowser) {
        openUrlInBrowser(response.authorizationUrl);
        console.log("Opened authorization URL in browser.");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`OAuth start failed: ${message}`);
      process.exitCode = 1;
    }
  });

authCommand
  .command("complete")
  .description("Complete OAuth login flow manually with code and state")
  .requiredOption("--provider <id>", "Provider ID")
  .requiredOption("--state <state>", "OAuth state")
  .requiredOption("--code <code>", "OAuth authorization code")
  .option("--base-url <url>", "Daemon API base URL", detectDefaultDaemonBaseUrl())
  .action(async (options) => {
    try {
      const providerId = String(options.provider);
      const baseUrl = String(options.baseUrl).replace(/\/+$/, "");

      const result = await requestJson(
        "POST",
        `${baseUrl}/v1/oauth/${providerId}/complete`,
        {
          state: String(options.state),
          code: String(options.code)
        }
      );

      if (result.status >= 400) {
        throw new Error(`Request failed with status ${result.status}`);
      }

      const response = result.data as { accountId: string; expiresAt?: string };
      console.log(`OAuth linked for provider ${providerId}, account ${response.accountId}`);
      if (response.expiresAt) {
        console.log(`Token expires at: ${response.expiresAt}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`OAuth complete failed: ${message}`);
      process.exitCode = 1;
    }
  });

authCommand
  .command("status")
  .description("Check OAuth/API-key status endpoint with redacted operator output")
  .option("--provider <id>", "Provider ID filter")
  .option("--config <path>", "Path to openassist.toml", "openassist.toml")
  .option("--env-file <path>", "Environment file path", defaultEnvFilePath())
  .option("--base-url <url>", "Daemon API base URL", detectDefaultDaemonBaseUrl())
  .action(async (options) => {
    try {
      const baseUrl = String(options.baseUrl).replace(/\/+$/, "");
      const providerId = options.provider ? String(options.provider) : undefined;
      const url = providerId
        ? `${baseUrl}/v1/oauth/${providerId}/status`
        : `${baseUrl}/v1/oauth/status`;

      const result = await requestJson("GET", url);
      if (result.status >= 400) {
        throw new Error(`Request failed with status ${result.status}`);
      }

      console.log("OAuth status request succeeded.");
      console.log("API-key status details are intentionally redacted from CLI output.");
      console.log("OAuth account details are intentionally redacted from CLI output.");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`OAuth status failed: ${message}`);
      process.exitCode = 1;
    }
  });

authCommand
  .command("disconnect")
  .description("Disconnect OAuth account from provider")
  .requiredOption("--provider <id>", "Provider ID")
  .requiredOption("--account <id>", "Account ID")
  .option("--base-url <url>", "Daemon API base URL", detectDefaultDaemonBaseUrl())
  .action(async (options) => {
    try {
      const baseUrl = String(options.baseUrl).replace(/\/+$/, "");
      const providerId = String(options.provider);
      const accountId = String(options.account);

      const result = await requestJson(
        "DELETE",
        `${baseUrl}/v1/oauth/${providerId}/account/${encodeURIComponent(accountId)}/disconnect`
      );
      if (result.status >= 400) {
        throw new Error(`Request failed with status ${result.status}`);
      }
      console.log(`Disconnected account ${accountId} from provider ${providerId}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`OAuth disconnect failed: ${message}`);
      process.exitCode = 1;
    }
  });

const channelCommand = program.command("channel").description("Channel operational commands");
channelCommand
  .command("status")
  .description("Show channel health status")
  .option("--id <channelId>", "Specific channel ID")
  .option("--base-url <url>", "Daemon API base URL", detectDefaultDaemonBaseUrl())
  .action(async (options) => {
    try {
      const baseUrl = String(options.baseUrl).replace(/\/+$/, "");
      const result = options.id
        ? await requestJson(
            "GET",
            `${baseUrl}/v1/channels/${encodeURIComponent(String(options.id))}/status`
          )
        : await requestJson("GET", `${baseUrl}/v1/channels/status`);

      if (result.status >= 400) {
        throw new Error(`Request failed with status ${result.status}`);
      }

      console.log(JSON.stringify(result.data, null, 2));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Channel status failed: ${message}`);
      process.exitCode = 1;
    }
  });

const timeCommand = program.command("time").description("Time synchronization and timezone operations");
timeCommand
  .command("status")
  .description("Show daemon clock and timezone status")
  .option("--base-url <url>", "Daemon API base URL", detectDefaultDaemonBaseUrl())
  .action(async (options) => {
    try {
      const baseUrl = String(options.baseUrl).replace(/\/+$/, "");
      const result = await requestJson("GET", `${baseUrl}/v1/time/status`);
      if (result.status >= 400) {
        throw new Error(`Request failed with status ${result.status}`);
      }
      console.log(JSON.stringify(result.data, null, 2));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Time status failed: ${message}`);
      process.exitCode = 1;
    }
  });

timeCommand
  .command("confirm")
  .description("Confirm timezone for scheduler activation")
  .requiredOption("--timezone <iana>", "IANA timezone (e.g. America/New_York)")
  .option("--base-url <url>", "Daemon API base URL", detectDefaultDaemonBaseUrl())
  .action(async (options) => {
    try {
      const baseUrl = String(options.baseUrl).replace(/\/+$/, "");
      const result = await requestJson("POST", `${baseUrl}/v1/time/timezone/confirm`, {
        timezone: String(options.timezone)
      });
      if (result.status >= 400) {
        throw new Error(`Request failed with status ${result.status}`);
      }
      console.log(JSON.stringify(result.data, null, 2));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Timezone confirm failed: ${message}`);
      process.exitCode = 1;
    }
  });

const schedulerCommand = program.command("scheduler").description("Scheduler operations");
schedulerCommand
  .command("status")
  .description("Show scheduler worker status")
  .option("--base-url <url>", "Daemon API base URL", detectDefaultDaemonBaseUrl())
  .action(async (options) => {
    try {
      const baseUrl = String(options.baseUrl).replace(/\/+$/, "");
      const result = await requestJson("GET", `${baseUrl}/v1/scheduler/status`);
      if (result.status >= 400) {
        throw new Error(`Request failed with status ${result.status}`);
      }
      console.log(JSON.stringify(result.data, null, 2));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Scheduler status failed: ${message}`);
      process.exitCode = 1;
    }
  });

const toolsCommand = program.command("tools").description("Tool execution and autonomy operations");
toolsCommand
  .command("status")
  .description("Show autonomous tool execution status")
  .option("--base-url <url>", "Daemon API base URL", detectDefaultDaemonBaseUrl())
  .option("--session <id>", "Session ID for profile-specific status (<channel>:<conversationKey>)")
  .action(async (options) => {
    try {
      const baseUrl = String(options.baseUrl).replace(/\/+$/, "");
      const query = options.session
        ? `?sessionId=${encodeURIComponent(String(options.session))}`
        : "";
      const result = await requestJson("GET", `${baseUrl}/v1/tools/status${query}`);
      if (result.status >= 400) {
        throw new Error(`Request failed with status ${result.status}`);
      }
      console.log(JSON.stringify(result.data, null, 2));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Tools status failed: ${message}`);
      process.exitCode = 1;
    }
  });

toolsCommand
  .command("invocations")
  .description("List recent tool invocation audit records")
  .option("--session <id>", "Session ID filter (<channel>:<conversationKey>)")
  .option("--limit <n>", "Max rows", "50")
  .option("--base-url <url>", "Daemon API base URL", detectDefaultDaemonBaseUrl())
  .action(async (options) => {
    try {
      const baseUrl = String(options.baseUrl).replace(/\/+$/, "");
      const limit = Number.parseInt(String(options.limit ?? "50"), 10);
      const params = new URLSearchParams();
      params.set("limit", String(Number.isFinite(limit) ? limit : 50));
      if (options.session) {
        params.set("sessionId", String(options.session));
      }

      const result = await requestJson("GET", `${baseUrl}/v1/tools/invocations?${params.toString()}`);
      if (result.status >= 400) {
        throw new Error(`Request failed with status ${result.status}`);
      }
      console.log(JSON.stringify(result.data, null, 2));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Tools invocations failed: ${message}`);
      process.exitCode = 1;
    }
  });

schedulerCommand
  .command("tasks")
  .description("List scheduler tasks with next/last run details")
  .option("--base-url <url>", "Daemon API base URL", detectDefaultDaemonBaseUrl())
  .action(async (options) => {
    try {
      const baseUrl = String(options.baseUrl).replace(/\/+$/, "");
      const result = await requestJson("GET", `${baseUrl}/v1/scheduler/tasks`);
      if (result.status >= 400) {
        throw new Error(`Request failed with status ${result.status}`);
      }
      console.log(JSON.stringify(result.data, null, 2));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Scheduler task list failed: ${message}`);
      process.exitCode = 1;
    }
  });

schedulerCommand
  .command("run")
  .description("Trigger immediate run for one scheduler task")
  .requiredOption("--id <taskId>", "Task ID")
  .option("--base-url <url>", "Daemon API base URL", detectDefaultDaemonBaseUrl())
  .action(async (options) => {
    try {
      const baseUrl = String(options.baseUrl).replace(/\/+$/, "");
      const taskId = encodeURIComponent(String(options.id));
      const result = await requestJson("POST", `${baseUrl}/v1/scheduler/tasks/${taskId}/run`);
      if (result.status >= 400) {
        throw new Error(`Request failed with status ${result.status}`);
      }
      console.log(JSON.stringify(result.data, null, 2));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Scheduler manual run failed: ${message}`);
      process.exitCode = 1;
    }
  });

channelCommand
  .command("qr")
  .description("Show latest WhatsApp MD QR payload for a channel")
  .requiredOption("--id <channelId>", "Channel ID")
  .option("--base-url <url>", "Daemon API base URL", detectDefaultDaemonBaseUrl())
  .action(async (options) => {
    try {
      const baseUrl = String(options.baseUrl).replace(/\/+$/, "");
      const channelId = String(options.id);
      const result = await requestJson(
        "GET",
        `${baseUrl}/v1/channels/${encodeURIComponent(channelId)}/qr`
      );

      if (result.status >= 400) {
        throw new Error(`Request failed with status ${result.status}`);
      }

      console.log(JSON.stringify(result.data, null, 2));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Channel QR failed: ${message}`);
      process.exitCode = 1;
    }
  });

program
  .command("policy-set")
  .description("Set policy profile for a session")
  .requiredOption("--session <id>", "Session ID (<channel>:<conversationKey>)")
  .requiredOption("--profile <profile>", "restricted|operator|full-root")
  .option("--db <path>", "Path to SQLite DB")
  .action(async (options) => {
    const [{ OpenAssistDatabase }, { DatabasePolicyEngine }] = await Promise.all([
      import("@openassist/storage-sqlite"),
      import("@openassist/core-runtime")
    ]);

    const dbPath = resolveDbPath(options.db);
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });

    const db = new OpenAssistDatabase({ dbPath, logger });
    const policy = new DatabasePolicyEngine({ db, defaultProfile: "operator" });
    await policy.setProfile(options.session, options.profile);
    console.log(`Session ${options.session} profile set to ${options.profile}`);
    db.close();
  });

program
  .command("policy-get")
  .description("Get policy profile for a session")
  .requiredOption("--session <id>", "Session ID (<channel>:<conversationKey>)")
  .option("--db <path>", "Path to SQLite DB")
  .action(async (options) => {
    const [{ OpenAssistDatabase }, { DatabasePolicyEngine }] = await Promise.all([
      import("@openassist/storage-sqlite"),
      import("@openassist/core-runtime")
    ]);

    const dbPath = resolveDbPath(options.db);
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });

    const db = new OpenAssistDatabase({ dbPath, logger });
    const policy = new DatabasePolicyEngine({ db, defaultProfile: "operator" });
    const profile = await policy.currentProfile(options.session);
    console.log(profile);
    db.close();
  });

await program.parseAsync(process.argv);

