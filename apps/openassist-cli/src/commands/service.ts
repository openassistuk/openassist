import path from "node:path";
import type { Command } from "commander";
import { input as inqInput, select as inqSelect } from "@inquirer/prompts";
import { SpawnCommandRunner } from "../lib/command-runner.js";
import { createServiceManager } from "../lib/service-manager.js";
import { checkHealth } from "../lib/health-check.js";
import { defaultEnvFilePath, defaultInstallDir, detectDefaultDaemonBaseUrl } from "../lib/runtime-context.js";
import { saveInstallState } from "../lib/install-state.js";
import { writeEnvTemplateIfMissing } from "../lib/env-file.js";

function normalizeBaseUrl(baseUrl?: string): string {
  if (baseUrl && baseUrl.length > 0) {
    return baseUrl.replace(/\/+$/, "");
  }
  return detectDefaultDaemonBaseUrl();
}

async function runHealthProbe(baseUrl: string): Promise<void> {
  const result = await checkHealth(baseUrl);
  if (result.ok) {
    console.log(`openassist health: ok (${baseUrl})`);
    return;
  }
  throw new Error(`openassist health failed (${baseUrl}) status=${result.status} body=${result.bodyText}`);
}

export function registerServiceCommands(program: Command): void {
  const serviceCommand = program.command("service").description("Service lifecycle operations");

  serviceCommand
    .command("install")
    .description("Install and enable service")
    .option("--install-dir <path>", "Install directory", defaultInstallDir())
    .option("--config <path>", "Path to openassist.toml")
    .option("--env-file <path>", "Environment file path", defaultEnvFilePath())
    .option("--dry-run", "Preview install without writing files")
    .action(async (options) => {
      const installDir = path.resolve(String(options.installDir));
      const configPath = options.config
        ? path.resolve(String(options.config))
        : path.join(installDir, "openassist.toml");
      const envFilePath = path.resolve(String(options.envFile));

      try {
        writeEnvTemplateIfMissing(envFilePath);
        const runner = new SpawnCommandRunner();
        const service = createServiceManager(runner);
        await service.install({
          installDir,
          configPath,
          envFilePath,
          repoRoot: installDir,
          dryRun: Boolean(options.dryRun)
        });
        if (!options.dryRun) {
          saveInstallState({
            installDir,
            configPath,
            envFilePath,
            repoUrl: "",
            trackedRef: "main",
            serviceManager: service.kind,
            lastKnownGoodCommit: ""
          });
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
        const service = createServiceManager(new SpawnCommandRunner());
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
        const service = createServiceManager(new SpawnCommandRunner());
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
        const service = createServiceManager(new SpawnCommandRunner());
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
        const service = createServiceManager(new SpawnCommandRunner());
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
        const service = createServiceManager(new SpawnCommandRunner());
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
        const service = createServiceManager(new SpawnCommandRunner());
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
        const service = createServiceManager(new SpawnCommandRunner());
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
        const service = createServiceManager(new SpawnCommandRunner());
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
        const service = createServiceManager(new SpawnCommandRunner());
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
      const baseUrl = normalizeBaseUrl(options.baseUrl ? String(options.baseUrl) : undefined);
      try {
        await runHealthProbe(baseUrl);
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

      const baseUrl = normalizeBaseUrl(options.baseUrl ? String(options.baseUrl) : undefined);
      const service = createServiceManager(new SpawnCommandRunner());
      console.log(`Service manager: ${service.kind}`);
      console.log(`Health endpoint: ${baseUrl}/v1/health`);

      while (true) {
        const action = await inqSelect({
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
            await runHealthProbe(baseUrl);
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
            const linesRaw = await inqInput({
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
