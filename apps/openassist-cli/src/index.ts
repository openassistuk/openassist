#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { spawn } from "node:child_process";
import { Command } from "commander";
import {
  defaultConfigPath as defaultOperatorConfigPath,
  defaultDataDir,
  defaultEnvFilePath as defaultOperatorEnvFilePath,
  defaultInstallDir as defaultOperatorInstallDir,
  loadConfig,
  parseConfig,
  resolveConfigOverlaysDir,
  writeDefaultConfig
} from "@openassist/config";
import { migrateOpenClawConfig, writeMigratedConfig } from "@openassist/migration-openclaw";
import { createLogger } from "@openassist/observability";
import { registerSetupCommands } from "./commands/setup.js";
import { registerServiceCommands } from "./commands/service.js";
import { registerUpgradeCommand } from "./commands/upgrade.js";
import { SpawnCommandRunner } from "./lib/command-runner.js";
import { loadEnvFile } from "./lib/env-file.js";
import { classifyGitDirtyState } from "./lib/git-dirty.js";
import { inspectLocalGrowthState } from "./lib/growth-status.js";
import { checkHealth } from "./lib/health-check.js";
import {
  detectCurrentBranchFromRepo,
  detectInstallStateFromRepo,
  loadInstallState
} from "./lib/install-state.js";
import { buildLifecycleReport, renderLifecycleReport } from "./lib/lifecycle-readiness.js";
import { detectLegacyDefaultLayout } from "./lib/operator-layout.js";
import { detectDefaultDaemonBaseUrl } from "./lib/runtime-context.js";
import { createServiceManager, detectServiceManagerKind } from "./lib/service-manager.js";
import { validateSetupReadiness, type SetupValidationIssue } from "./lib/setup-validation.js";

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
  return path.join(defaultDataDir(), "openassist.db");
}

function resolveConfigPath(configPath?: string): string {
  if (configPath) {
    return resolveFromWorkspace(configPath);
  }
  const installState = loadInstallState();
  return installState?.configPath ?? defaultOperatorConfigPath();
}

function loadCliRuntimeConfig(configPath?: string) {
  const resolvedConfigPath = resolveConfigPath(configPath);
  const loaded = loadConfig({
    baseFile: resolvedConfigPath,
    overlaysDir: resolveConfigOverlaysDir(resolvedConfigPath)
  });
  return {
    configPath: resolvedConfigPath,
    config: loaded.config
  };
}

function defaultInstallDir(): string {
  return defaultOperatorInstallDir();
}

function defaultEnvFilePath(): string {
  return defaultOperatorEnvFilePath();
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

async function openUrlInBrowser(url: string): Promise<{ opened: boolean; detail?: string }> {
  const safeUrl = normalizeBrowserUrl(url);
  const opener =
    process.platform === "win32"
      ? "explorer.exe"
      : process.platform === "darwin"
        ? "open"
        : "xdg-open";

  return await new Promise((resolve) => {
    const child = spawn(opener, [safeUrl], {
      detached: true,
      stdio: "ignore",
      shell: false
    });
    child.once("error", (error) => {
      resolve({
        opened: false,
        detail: error instanceof Error ? error.message : String(error)
      });
    });
    child.once("spawn", () => {
      child.unref();
      resolve({ opened: true });
    });
  });
}

function commandAvailable(command: string): boolean {
  if (process.platform === "win32") {
    const result = spawnSync("where.exe", [command], {
      encoding: "utf8",
      stdio: ["ignore", "ignore", "ignore"]
    });
    return result.status === 0;
  }
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
  .option("--json", "Output the grouped lifecycle report as JSON")
  .action(async (options) => {
    const detectedTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const installState = loadInstallState();
    const installDir = installState?.installDir ?? defaultInstallDir();
    const legacyLayout = detectLegacyDefaultLayout(installDir);
    const configPath =
      installState?.configPath ??
      (!fs.existsSync(defaultOperatorConfigPath()) && legacyLayout.status !== "none"
        ? legacyLayout.legacy.configPath
        : defaultOperatorConfigPath());
    const envFilePath = installState?.envFilePath ?? defaultEnvFilePath();
    const configExists = fs.existsSync(configPath);
    const envExists = fs.existsSync(envFilePath);
    const repoBacked = fs.existsSync(path.join(installDir, ".git"));
    const repoMetadata = detectInstallStateFromRepo(installDir);
    const currentBranch = repoBacked ? detectCurrentBranchFromRepo(installDir) : undefined;
    const trackedRef = installState?.trackedRef ?? repoMetadata.trackedRef ?? "main";
    const currentCommit = repoMetadata.lastKnownGoodCommit ?? installState?.lastKnownGoodCommit ?? "";
    const daemonBuildExists = fs.existsSync(path.join(installDir, "apps", "openassistd", "dist", "index.js"));
    const daemonBaseUrl = detectDefaultDaemonBaseUrl(configPath);
    const hasGit = commandAvailable("git");
    const hasPnpm = commandAvailable("pnpm");
    const hasNode = commandAvailable("node");
    const localWrapperAvailable = commandAvailable("openassist");
    const localWrapperCommand = path.join(os.homedir(), ".local", "bin", "openassist");
    const dirtyState = repoBacked ? classifyGitDirtyState(installDir) : undefined;
    const dirtyWorkingTree = dirtyState?.hasRealCodeChanges === true;

    let parsedConfig: Awaited<ReturnType<typeof loadCliRuntimeConfig>>["config"] | undefined;
    let validationErrors: SetupValidationIssue[] = [];
    let validationWarnings: SetupValidationIssue[] = [];
    let serviceManagerKind: ReturnType<typeof detectServiceManagerKind> | "unsupported" | undefined;
    let serviceInstalled: boolean | undefined;
    let serviceHealthOk = false;
    let serviceHealthDetail: string | undefined;
    let timezoneConfirmed = false;
    let timeStatusReachable = false;
    let growthState:
      | Awaited<ReturnType<typeof inspectLocalGrowthState>>
      | undefined;

    if (configExists) {
      try {
        parsedConfig = loadCliRuntimeConfig(configPath).config;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        validationErrors = [
          {
            code: "config.read_failed",
            message: `OpenAssist could not load the config file: ${message}`,
            hint: "Fix the config file, then rerun: openassist doctor"
          }
        ];
      }
    }

    try {
      serviceManagerKind = detectServiceManagerKind();
      try {
        const service = createServiceManager(new SpawnCommandRunner());
        serviceInstalled = await service.isInstalled();
      } catch {
        serviceInstalled = undefined;
      }
    } catch {
      serviceManagerKind = "unsupported";
    }

    try {
      const health = await checkHealth(daemonBaseUrl);
      serviceHealthOk = health.ok;
      serviceHealthDetail = health.ok
        ? `Health endpoint is responding at ${health.baseUrl ?? daemonBaseUrl}`
        : `Health endpoint returned status ${health.status} at ${health.baseUrl ?? daemonBaseUrl}`;
    } catch {
      serviceHealthDetail = `Daemon not reachable at ${daemonBaseUrl}`;
    }

    try {
      const result = await requestJson("GET", `${daemonBaseUrl}/v1/time/status`);
      if (result.status < 400) {
        const data = result.data as {
          time?: { timezone?: string; timezoneConfirmed?: boolean; clockHealth?: string };
        };
        timeStatusReachable = typeof data.time === "object" && data.time !== null;
        timezoneConfirmed = data.time?.timezoneConfirmed === true;
      }
    } catch {
      timeStatusReachable = false;
      timezoneConfirmed = false;
    }

    if (parsedConfig) {
      const validation = await validateSetupReadiness({
        config: parsedConfig,
        env: loadEnvFile(envFilePath),
        configPath,
        envFilePath,
        installDir,
        skipService: false,
        timezoneConfirmed,
        requireEnabledChannel: true,
        skipBindAvailabilityCheck: serviceHealthOk && timeStatusReachable
      });
      validationErrors = validation.errors;
      validationWarnings = validation.warnings;
      serviceManagerKind = validation.serviceManagerKind ?? serviceManagerKind;
      growthState = await inspectLocalGrowthState(configPath, parsedConfig, logger);
    }

    const report = buildLifecycleReport({
      installDir,
      configPath,
      envFilePath,
      installStatePresent: Boolean(installState),
      repoBacked,
      configExists,
      envExists,
      repoUrl: installState?.repoUrl ?? repoMetadata.repoUrl,
      trackedRef,
      currentBranch,
      currentCommit,
      detectedTimezone,
      config: parsedConfig,
      serviceManagerKind,
      serviceInstalled,
      serviceHealthOk,
      serviceHealthDetail,
      validationErrors,
      validationWarnings,
      hasGit,
      hasPnpm,
      hasNode,
      daemonBuildExists,
      dirtyWorkingTree,
      localWrapperAvailable,
      localWrapperCommand,
      growth: growthState
        ? {
            skillsDirectory: growthState.skillsDirectory,
            helperToolsDirectory: growthState.helperToolsDirectory,
            installedSkillCount: growthState.installedSkills.length,
            managedHelperCount: growthState.managedHelpers.length,
            installedSkillIds: growthState.installedSkills.map((item) => item.id),
            managedHelperIds: growthState.managedHelpers.map((item) => item.id),
            updateSafetyNote: growthState.updateSafetyNote
          }
        : undefined,
      legacyDefaultLayoutStatus:
        legacyLayout.status !== "none"
          ? legacyLayout.status
          : dirtyState?.hasLegacyOperatorState && !dirtyWorkingTree
            ? "ready"
            : undefined,
      legacyDefaultLayoutReason: legacyLayout.reason
    });

    if (Boolean(options.json)) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      for (const line of renderLifecycleReport(report)) {
        console.log(line);
      }
    }

    if (
      report.summary.installReadiness === "needs-action" ||
      report.summary.firstReplyReadiness === "needs-action" ||
      report.summary.upgradeReadiness !== "safe-to-continue"
    ) {
      process.exitCode = 1;
    }
  });

program
  .command("init")
  .description("Create default openassist.toml if missing")
  .option("--config <path>", "Config output path", defaultOperatorConfigPath())
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
  .option("--config <path>", "Path to openassist.toml", defaultOperatorConfigPath())
  .action((options) => {
    const configPath = resolveFromWorkspace(options.config);
    try {
      const { config, loadedFiles } = loadConfig({
        baseFile: configPath,
        overlaysDir: resolveConfigOverlaysDir(configPath)
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
  .option("--output <path>", "Output openassist.toml path", defaultOperatorConfigPath())
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
        redirectUri?: string;
      };

      console.log(`Provider: ${providerId}`);
      console.log(`Account: ${response.accountId}`);
      console.log(`State: ${response.state}`);
      if (response.expiresAt) {
        console.log(`Expires: ${response.expiresAt}`);
      }
      console.log(`Authorization URL:\n${response.authorizationUrl}`);
      if (
        typeof response.redirectUri === "string" &&
        response.redirectUri.startsWith("http://localhost:")
      ) {
        console.log(`After approval, the browser should redirect to: ${response.redirectUri}`);
        console.log("If that localhost page cannot load, copy the full callback URL from the browser address bar and use it to complete login.");
        console.log(`Manual completion example: openassist auth complete --provider ${providerId} --state ${response.state} --code <code> --base-url ${baseUrl}`);
      }

      if (options.openBrowser) {
        const launch = await openUrlInBrowser(response.authorizationUrl);
        if (launch.opened) {
          console.log("Opened authorization URL in browser.");
        } else {
          console.log("Could not open a browser automatically on this host.");
          if (launch.detail) {
            console.log(`Browser launch detail: ${launch.detail}`);
          }
          console.log("Open the authorization URL manually in a browser, then continue with the callback URL or code.");
        }
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
  .option("--config <path>", "Path to openassist.toml", defaultOperatorConfigPath())
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
  .option("--session <id>", "Session ID for profile-specific status (<channelId>:<conversationKey>)")
  .option("--sender-id <id>", "Sender ID for actor-specific shared-chat status")
  .action(async (options) => {
    try {
      const baseUrl = String(options.baseUrl).replace(/\/+$/, "");
      const params = new URLSearchParams();
      if (options.session) {
        params.set("sessionId", String(options.session));
      }
      if (options.senderId) {
        params.set("senderId", String(options.senderId));
      }
      const query = params.size > 0 ? `?${params.toString()}` : "";
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
  .option("--session <id>", "Session ID filter (<channelId>:<conversationKey>)")
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

const skillsCommand = program.command("skills").description("Managed skill operations");
skillsCommand
  .command("list")
  .description("List installed managed skills")
  .option("--json", "Print full JSON output")
  .option("--base-url <url>", "Daemon API base URL", detectDefaultDaemonBaseUrl())
  .action(async (options) => {
    try {
      const baseUrl = String(options.baseUrl).replace(/\/+$/, "");
      const result = await requestJson("GET", `${baseUrl}/v1/skills`);
      if (result.status >= 400) {
        throw new Error(`Request failed with status ${result.status}`);
      }
      if (Boolean(options.json)) {
        console.log(JSON.stringify(result.data, null, 2));
        return;
      }
      const skills = ((result.data as { skills?: Array<{ id: string; version: string; description: string }> })?.skills ?? []);
      console.log("Managed skills");
      if (skills.length === 0) {
        console.log("- None.");
        return;
      }
      for (const skill of skills) {
        console.log(`- ${skill.id}@${skill.version}: ${skill.description}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Skills list failed: ${message}`);
      process.exitCode = 1;
    }
  });

skillsCommand
  .command("install")
  .description("Install a managed skill from a local directory")
  .requiredOption("--path <dir>", "Local skill source directory")
  .option("--base-url <url>", "Daemon API base URL", detectDefaultDaemonBaseUrl())
  .action(async (options) => {
    try {
      const baseUrl = String(options.baseUrl).replace(/\/+$/, "");
      const sourcePath = path.resolve(String(options.path));
      const result = await requestJson("POST", `${baseUrl}/v1/skills/install`, {
        path: sourcePath
      });
      if (result.status >= 400) {
        throw new Error(`Request failed with status ${result.status}`);
      }
      const installed = ((result.data as { installed?: { id: string; version: string; description: string } }).installed);
      console.log(
        installed
          ? `Installed managed skill ${installed.id}@${installed.version}: ${installed.description}`
          : "Managed skill installed."
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Skills install failed: ${message}`);
      process.exitCode = 1;
    }
  });

const growthCommand = program.command("growth").description("Managed capability growth operations");
growthCommand
  .command("status")
  .description("Show managed growth policy, directories, and installed assets")
  .option("--json", "Print full JSON output")
  .option("--base-url <url>", "Daemon API base URL", detectDefaultDaemonBaseUrl())
  .option("--session <id>", "Session ID for actor-specific growth visibility")
  .option("--sender-id <id>", "Sender ID for actor-specific growth visibility")
  .action(async (options) => {
    try {
      const baseUrl = String(options.baseUrl).replace(/\/+$/, "");
      const params = new URLSearchParams();
      if (options.session) {
        params.set("sessionId", String(options.session));
      }
      if (options.senderId) {
        params.set("senderId", String(options.senderId));
      }
      const query = params.size > 0 ? `?${params.toString()}` : "";
      const result = await requestJson("GET", `${baseUrl}/v1/growth/status${query}`);
      if (result.status >= 400) {
        throw new Error(`Request failed with status ${result.status}`);
      }
      if (Boolean(options.json)) {
        console.log(JSON.stringify(result.data, null, 2));
        return;
      }
      const growth = (result.data as {
        growth?: {
          defaultMode: string;
          fullRootCanGrowNow: boolean;
          skillsDirectory: string;
          helperToolsDirectory: string;
          updateSafetyNote: string;
          installedSkills: Array<{ id: string; version: string }>;
          managedHelpers: Array<{ id: string; installer: string; updateSafe: boolean }>;
        };
      }).growth;
      if (!growth) {
        console.log("Growth status unavailable.");
        return;
      }
      console.log("OpenAssist growth status");
      console.log(`- Mode: ${growth.defaultMode}`);
      console.log(`- Growth actions available now: ${growth.fullRootCanGrowNow ? "yes" : "no"}`);
      console.log(`- Skills directory: ${growth.skillsDirectory}`);
      console.log(`- Helper tools directory: ${growth.helperToolsDirectory}`);
      console.log(
        `- Installed skills: ${growth.installedSkills.length > 0 ? growth.installedSkills.map((item) => `${item.id}@${item.version}`).join(", ") : "none"}`
      );
      console.log(
        `- Managed helpers: ${growth.managedHelpers.length > 0 ? growth.managedHelpers.map((item) => `${item.id} (${item.installer}${item.updateSafe ? ", update-safe" : ""})`).join(", ") : "none"}`
      );
      console.log(`- Update safety: ${growth.updateSafetyNote}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Growth status failed: ${message}`);
      process.exitCode = 1;
    }
  });

growthCommand
  .command("helper")
  .description("Managed helper-tool registry operations")
  .command("add")
  .description("Register a managed helper tool")
  .requiredOption("--name <id>", "Managed helper identifier")
  .requiredOption("--root <path>", "Installed helper root path")
  .requiredOption("--installer <kind>", "Helper installer kind")
  .requiredOption("--summary <text>", "Short helper summary")
  .option("--base-url <url>", "Daemon API base URL", detectDefaultDaemonBaseUrl())
  .action(async (options) => {
    try {
      const baseUrl = String(options.baseUrl).replace(/\/+$/, "");
      const result = await requestJson("POST", `${baseUrl}/v1/growth/helpers`, {
        id: String(options.name),
        root: path.resolve(String(options.root)),
        installer: String(options.installer),
        summary: String(options.summary)
      });
      if (result.status >= 400) {
        throw new Error(`Request failed with status ${result.status}`);
      }
      const helper = (result.data as { helper?: { id: string; installRoot: string; installer: string; updateSafe: boolean } }).helper;
      console.log(
        helper
          ? `Registered helper ${helper.id} at ${helper.installRoot} (${helper.installer}${helper.updateSafe ? ", update-safe" : ""})`
          : "Managed helper registered."
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Growth helper add failed: ${message}`);
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
  .description("Set policy profile for a chat or one sender inside a chat")
  .requiredOption("--session <id>", "Session ID (<channelId>:<conversationKey>)")
  .requiredOption("--profile <profile>", "restricted|operator|full-root")
  .option("--sender-id <id>", "Sender ID for a sender-scoped override in this chat")
  .option("--config <path>", "Path to openassist.toml")
  .option("--db <path>", "Path to SQLite DB")
  .action(async (options) => {
    const [{ OpenAssistDatabase }, { DatabasePolicyEngine }] = await Promise.all([
      import("@openassist/storage-sqlite"),
      import("@openassist/core-runtime")
    ]);

    const dbPath = resolveDbPath(options.db);
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    const { config } = loadCliRuntimeConfig(options.config);

    const db = new OpenAssistDatabase({ dbPath, logger });
    const policy = new DatabasePolicyEngine({
      db,
      defaultProfile: config.runtime.defaultPolicyProfile,
      operatorAccessProfile: config.runtime.operatorAccessProfile,
      channels: config.runtime.channels
    });
    await policy.setProfile(options.session, options.profile, options.senderId);
    console.log(
      options.senderId
        ? `Sender ${options.senderId} in ${options.session} set to ${options.profile}`
        : `Session ${options.session} set to ${options.profile}`
    );
    db.close();
  });

program
  .command("policy-get")
  .description("Get the effective policy profile for a chat or one sender inside a chat")
  .requiredOption("--session <id>", "Session ID (<channelId>:<conversationKey>)")
  .option("--sender-id <id>", "Sender ID for actor-specific access resolution")
  .option("--json", "Print full resolution JSON (profile + source)")
  .option("--config <path>", "Path to openassist.toml")
  .option("--db <path>", "Path to SQLite DB")
  .action(async (options) => {
    const [{ OpenAssistDatabase }, { DatabasePolicyEngine }] = await Promise.all([
      import("@openassist/storage-sqlite"),
      import("@openassist/core-runtime")
    ]);

    const dbPath = resolveDbPath(options.db);
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    const { config } = loadCliRuntimeConfig(options.config);

    const db = new OpenAssistDatabase({ dbPath, logger });
    const policy = new DatabasePolicyEngine({
      db,
      defaultProfile: config.runtime.defaultPolicyProfile,
      operatorAccessProfile: config.runtime.operatorAccessProfile,
      channels: config.runtime.channels
    });
    const resolution = await policy.resolveProfile({
      sessionId: options.session,
      actorId: options.senderId
    });
    if (options.json) {
      console.log(JSON.stringify(resolution, null, 2));
    } else {
      console.log(resolution.profile);
    }
    db.close();
  });

await program.parseAsync(process.argv);

