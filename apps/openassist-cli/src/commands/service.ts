import fs from "node:fs";
import path from "node:path";
import type { Command } from "commander";
import { input as inqInput, select as inqSelect } from "@inquirer/prompts";
import { loadConfig, resolveConfigOverlaysDir } from "@openassist/config";
import { SpawnCommandRunner } from "../lib/command-runner.js";
import { createServiceManager } from "../lib/service-manager.js";
import { checkHealth } from "../lib/health-check.js";
import {
  defaultConfigPath,
  defaultEnvFilePath,
  defaultInstallDir,
  detectDefaultDaemonBaseUrl
} from "../lib/runtime-context.js";
import { detectInstallStateFromRepo, loadInstallState, saveInstallState } from "../lib/install-state.js";
import type { ServiceManagerKind } from "../lib/install-state.js";
import { detectLegacyDefaultLayout } from "../lib/operator-layout.js";
import { writeEnvTemplateIfMissing } from "../lib/env-file.js";

export interface ServiceManagerLike {
  readonly kind: ServiceManagerKind;
  install(options: {
    installDir: string;
    configPath: string;
    envFilePath: string;
    repoRoot: string;
    dryRun?: boolean;
    systemdFilesystemAccess?: string;
  }): Promise<void>;
  uninstall(): Promise<void>;
  start(): Promise<void>;
  stop(): Promise<void>;
  restart(): Promise<void>;
  status(): Promise<void>;
  logs(lines: number, follow: boolean): Promise<void>;
  enable(): Promise<void>;
  disable(): Promise<void>;
  isInstalled(): Promise<boolean>;
}

export interface ServiceCommandDeps {
  createRunner(): unknown;
  createServiceManager(runner: unknown): ServiceManagerLike;
  checkHealth(baseUrl: string): Promise<{
    ok: boolean;
    status: number;
    bodyText: string;
  }>;
  loadConfig(options: {
    baseFile: string;
    overlaysDir: string;
  }): {
    config?: {
      service?: {
        systemdFilesystemAccess?: string;
      };
    };
  };
  resolveConfigOverlaysDir(configPath: string): string;
  defaultInstallDir(): string;
  defaultConfigPath(): string;
  defaultEnvFilePath(): string;
  detectDefaultDaemonBaseUrl(configPath?: string): string;
  loadInstallState():
    | {
        installDir?: string;
        configPath?: string;
        envFilePath?: string;
        serviceManager?: ServiceManagerKind;
        trackedRef?: string;
        repoUrl?: string;
        lastKnownGoodCommit?: string;
      }
    | undefined;
  saveInstallState(
    nextState: {
      installDir: string;
      configPath: string;
      envFilePath: string;
      serviceManager: ServiceManagerKind;
      repoUrl?: string;
      trackedRef?: string;
      lastKnownGoodCommit?: string;
    },
    filePath?: string,
      existingState?: {
        installDir?: string;
        configPath?: string;
        envFilePath?: string;
        serviceManager?: ServiceManagerKind;
        trackedRef?: string;
        repoUrl?: string;
        lastKnownGoodCommit?: string;
    }
  ): void;
  detectInstallStateFromRepo(installDir: string): {
    repoUrl?: string;
    trackedRef?: string;
    lastKnownGoodCommit?: string;
  };
  detectLegacyDefaultLayout(installDir: string): {
    status: string;
    legacy: {
      configPath: string;
    };
  };
  writeEnvTemplateIfMissing(envFilePath: string): void;
  existsSync(filePath: string): boolean;
  promptInput(options: {
    message: string;
    default?: string;
  }): Promise<string>;
  promptSelect(options: {
    message: string;
    pageSize?: number;
    choices: Array<{ name: string; value: string }>;
    default?: string;
  }): Promise<string>;
}

const defaultServiceCommandDeps: ServiceCommandDeps = {
  createRunner: () => new SpawnCommandRunner(),
  createServiceManager: (runner) => createServiceManager(runner as SpawnCommandRunner),
  checkHealth,
  loadConfig,
  resolveConfigOverlaysDir,
  defaultInstallDir,
  defaultConfigPath,
  defaultEnvFilePath,
  detectDefaultDaemonBaseUrl,
  loadInstallState,
  saveInstallState,
  detectInstallStateFromRepo,
  detectLegacyDefaultLayout,
  writeEnvTemplateIfMissing,
  existsSync: fs.existsSync,
  promptInput: (options) => inqInput(options),
  promptSelect: (options) => inqSelect(options)
};

function normalizeBaseUrl(baseUrl: string | undefined, deps: ServiceCommandDeps): string {
  if (baseUrl && baseUrl.length > 0) {
    return baseUrl.replace(/\/+$/, "");
  }
  return deps.detectDefaultDaemonBaseUrl();
}

async function runHealthProbe(baseUrl: string, deps: ServiceCommandDeps): Promise<void> {
  const result = await deps.checkHealth(baseUrl);
  if (result.ok) {
    console.log(`openassist health: ok (${baseUrl})`);
    return;
  }
  throw new Error(`openassist health failed (${baseUrl}) status=${result.status} body=${result.bodyText}`);
}

export function registerServiceCommands(program: Command, deps: ServiceCommandDeps = defaultServiceCommandDeps): void {
  const serviceCommand = program.command("service").description("Service lifecycle operations");

  serviceCommand
    .command("install")
    .description("Install and enable service")
    .option("--install-dir <path>", "Install directory", deps.defaultInstallDir())
    .option("--config <path>", "Path to openassist.toml")
    .option("--env-file <path>", "Environment file path", deps.defaultEnvFilePath())
    .option("--dry-run", "Preview install without writing files")
    .action(async (options) => {
      const installState = deps.loadInstallState();
      const installDir = path.resolve(String(options.installDir));
      const legacyLayout = deps.detectLegacyDefaultLayout(installDir);
      const configPath = options.config
        ? path.resolve(String(options.config))
        : installState?.configPath ??
          (!deps.existsSync(deps.defaultConfigPath()) && legacyLayout.status !== "none"
            ? legacyLayout.legacy.configPath
            : deps.defaultConfigPath());
      const envFilePath = path.resolve(String(options.envFile));

      try {
        deps.writeEnvTemplateIfMissing(envFilePath);
        const config = deps.existsSync(configPath)
          ? deps.loadConfig({
              baseFile: configPath,
              overlaysDir: deps.resolveConfigOverlaysDir(configPath)
            }).config
          : undefined;
        const runner = deps.createRunner();
        const service = deps.createServiceManager(runner);
        const existingState = installState;
        const repoMetadata = deps.detectInstallStateFromRepo(installDir);
        await service.install({
          installDir,
          configPath,
          envFilePath,
          repoRoot: installDir,
          dryRun: Boolean(options.dryRun),
          systemdFilesystemAccess: config?.service?.systemdFilesystemAccess
        });
        if (!options.dryRun) {
          deps.saveInstallState({
            installDir,
            configPath,
            envFilePath,
            ...(repoMetadata.repoUrl ? { repoUrl: repoMetadata.repoUrl } : {}),
            ...(repoMetadata.trackedRef ? { trackedRef: repoMetadata.trackedRef } : {}),
            serviceManager: service.kind,
            ...(repoMetadata.lastKnownGoodCommit
              ? { lastKnownGoodCommit: repoMetadata.lastKnownGoodCommit }
              : {})
          }, undefined, existingState);
        }
        console.log(
          options.dryRun
            ? "Service install dry-run complete."
            : `Installed ${service.kind} service for OpenAssist.`
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`Service install failed: ${message}`);
        process.exitCode = 1;
      }
    });

  serviceCommand
    .command("uninstall")
    .description("Uninstall service")
    .action(async () => {
      try {
        const service = deps.createServiceManager(deps.createRunner());
        await service.uninstall();
        console.log("Service uninstalled.");
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`Service uninstall failed: ${message}`);
        process.exitCode = 1;
      }
    });

  serviceCommand
    .command("start")
    .description("Start service")
    .action(async () => {
      try {
        const service = deps.createServiceManager(deps.createRunner());
        await service.start();
        console.log("Service started.");
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`Service start failed: ${message}`);
        process.exitCode = 1;
      }
    });

  serviceCommand
    .command("stop")
    .description("Stop service")
    .action(async () => {
      try {
        const service = deps.createServiceManager(deps.createRunner());
        await service.stop();
        console.log("Service stopped.");
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`Service stop failed: ${message}`);
        process.exitCode = 1;
      }
    });

  serviceCommand
    .command("restart")
    .description("Restart service")
    .action(async () => {
      try {
        const service = deps.createServiceManager(deps.createRunner());
        await service.restart();
        console.log("Service restarted.");
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`Service restart failed: ${message}`);
        process.exitCode = 1;
      }
    });

  serviceCommand
    .command("reload")
    .description("Reload config by restarting daemon service")
    .action(async () => {
      try {
        const service = deps.createServiceManager(deps.createRunner());
        await service.restart();
        console.log("Service config reload complete (restart finished).");
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`Service reload failed: ${message}`);
        process.exitCode = 1;
      }
    });

  serviceCommand
    .command("status")
    .description("Show service status")
    .action(async () => {
      try {
        const service = deps.createServiceManager(deps.createRunner());
        await service.status();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`Service status failed: ${message}`);
        process.exitCode = 1;
      }
    });

  serviceCommand
    .command("logs")
    .description("Show service logs")
    .option("--follow", "Follow logs")
    .option("--lines <n>", "Number of lines to show", "100")
    .action(async (options) => {
      const lines = Number.parseInt(String(options.lines ?? "100"), 10);
      try {
        const service = deps.createServiceManager(deps.createRunner());
        await service.logs(Number.isFinite(lines) ? lines : 100, Boolean(options.follow));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`Service logs failed: ${message}`);
        process.exitCode = 1;
      }
    });

  serviceCommand
    .command("enable")
    .description("Enable service at startup")
    .action(async () => {
      try {
        const service = deps.createServiceManager(deps.createRunner());
        await service.enable();
        console.log("Service enabled.");
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`Service enable failed: ${message}`);
        process.exitCode = 1;
      }
    });

  serviceCommand
    .command("disable")
    .description("Disable service at user startup")
    .action(async () => {
      try {
        const service = deps.createServiceManager(deps.createRunner());
        await service.disable();
        console.log("Service disabled.");
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`Service disable failed: ${message}`);
        process.exitCode = 1;
      }
    });

  serviceCommand
    .command("health")
    .description("Run daemon health check")
    .option("--base-url <url>", "Daemon API base URL")
    .action(async (options) => {
      const baseUrl = normalizeBaseUrl(options.baseUrl ? String(options.baseUrl) : undefined, deps);
      try {
        await runHealthProbe(baseUrl, deps);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`Health check failed: ${message}`);
        process.exitCode = 1;
      }
    });

  serviceCommand
    .command("console")
    .description("Interactive service control console")
    .option("--base-url <url>", "Daemon API base URL")
    .action(async (options) => {
      if (!process.stdin.isTTY || !process.stdout.isTTY) {
        console.error("Interactive service console requires TTY.");
        process.exitCode = 1;
        return;
      }

      const baseUrl = normalizeBaseUrl(options.baseUrl ? String(options.baseUrl) : undefined, deps);
      const service = deps.createServiceManager(deps.createRunner());
      console.log(`Service manager: ${service.kind}`);
      console.log(`Health endpoint: ${baseUrl}/v1/health`);

      while (true) {
        const action = await deps.promptSelect({
          message: "Service console action",
          pageSize: 12,
          choices: [
            { name: "Status", value: "status" },
            { name: "Health", value: "health" },
            { name: "Start", value: "start" },
            { name: "Stop", value: "stop" },
            { name: "Restart", value: "restart" },
            { name: "Reload config (restart)", value: "reload" },
            { name: "Logs (last N lines)", value: "logs" },
            { name: "Enable on boot", value: "enable" },
            { name: "Disable on boot", value: "disable" },
            { name: "Exit", value: "exit" }
          ],
          default: "status"
        });

        try {
          if (action === "exit") {
            return;
          }
          if (action === "status") {
            await service.status();
            continue;
          }
          if (action === "health") {
            await runHealthProbe(baseUrl, deps);
            continue;
          }
          if (action === "start") {
            await service.start();
            console.log("Service started.");
            continue;
          }
          if (action === "stop") {
            await service.stop();
            console.log("Service stopped.");
            continue;
          }
          if (action === "restart" || action === "reload") {
            await service.restart();
            console.log(action === "reload" ? "Service reloaded." : "Service restarted.");
            continue;
          }
          if (action === "logs") {
            const linesRaw = await deps.promptInput({
              message: "How many lines?",
              default: "200"
            });
            const lines = Number.parseInt(linesRaw, 10);
            await service.logs(Number.isFinite(lines) ? lines : 200, false);
            continue;
          }
          if (action === "enable") {
            await service.enable();
            console.log("Service enabled.");
            continue;
          }
          if (action === "disable") {
            await service.disable();
            console.log("Service disabled.");
            continue;
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          console.error(`Service console action failed: ${message}`);
        }
      }
    });
}
