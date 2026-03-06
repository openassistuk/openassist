import path from "node:path";
import type { Command } from "commander";
import { loadConfig } from "@openassist/config";
import {
  createInquirerPromptAdapter,
  loadSetupWizardState,
  runSetupWizard
} from "../lib/setup-wizard.js";
import { loadSetupQuickstartState, runSetupQuickstart } from "../lib/setup-quickstart.js";
import { runSetupWizardPostSaveChecks } from "../lib/setup-post-save.js";
import {
  defaultEnvFilePath,
  defaultInstallDir,
  detectDefaultDaemonBaseUrl,
  resolveFromWorkspace
} from "../lib/runtime-context.js";
import { loadEnvFile, saveEnvFile } from "../lib/env-file.js";

export function registerSetupCommands(program: Command): void {
  const setupCommand = program
    .command("setup")
    .description("First-run onboarding and advanced configuration commands");

  setupCommand
    .command("wizard")
    .description("Run advanced setup editor")
    .option("--config <path>", "Path to openassist.toml", "openassist.toml")
    .option("--env-file <path>", "Environment file path", defaultEnvFilePath())
    .option("--install-dir <path>", "OpenAssist install directory (used for service operations)")
    .option("--base-url <url>", "Daemon API base URL for post-save checks")
    .option("--skip-post-checks", "Skip post-save service and health checks")
    .action(async (options) => {
      try {
        const configPath = resolveFromWorkspace(String(options.config));
        const envFilePath = path.resolve(String(options.envFile));
        const installDir = options.installDir
          ? path.resolve(String(options.installDir))
          : path.dirname(configPath);
        const baseUrl = options.baseUrl
          ? String(options.baseUrl)
          : detectDefaultDaemonBaseUrl(configPath);
        const state = loadSetupWizardState(configPath, envFilePath);
        const prompts = createInquirerPromptAdapter();
        const result = await runSetupWizard(state, prompts);
        if (!result.saved) {
          console.log("Setup wizard exited without saving.");
          return;
        }
        console.log(`Saved advanced configuration to ${configPath}`);
        if (result.backupPath) {
          console.log(`Backup created: ${result.backupPath}`);
        }

        if (Boolean(options.skipPostChecks)) {
          console.log("Skipped post-save service and health checks (--skip-post-checks).");
          return;
        }

        console.log("Running advanced post-save service restart and health checks...");
        try {
          const postSave = await runSetupWizardPostSaveChecks(
            {
              installDir,
              configPath,
              envFilePath,
              baseUrl
            },
            prompts
          );

          if (!postSave.completed && postSave.reason === "service-not-installed") {
            console.log("Post-save checks skipped because service is not installed.");
            console.log(
              `Install it with: openassist service install --install-dir "${installDir}" --config "${configPath}" --env-file "${envFilePath}"`
            );
            return;
          }

          if (!postSave.completed && postSave.reason === "service-manager-unsupported") {
            console.log(
              "Post-save checks skipped because service lifecycle is unsupported on this platform."
            );
            return;
          }

          if (!postSave.completed && postSave.reason === "post-checks-skipped") {
            console.log("Post-save checks were skipped by operator choice.");
            if (postSave.lastError) {
              console.log(`Last check error: ${postSave.lastError}`);
            }
            return;
          }

          if (!postSave.completed && postSave.reason === "post-checks-aborted") {
            console.error("Post-save checks were aborted.");
            if (postSave.lastError) {
              console.error(`Last check error: ${postSave.lastError}`);
            }
            process.exitCode = 1;
            return;
          }

          console.log(`Service manager: ${postSave.serviceManager}`);
          console.log(`Daemon health: ok (${baseUrl.replace(/\/+$/, "")})`);
          console.log(`Time status: ${JSON.stringify(postSave.timeStatus)}`);
          console.log(`Scheduler status: ${JSON.stringify(postSave.schedulerStatus)}`);
        } catch (postSaveError) {
          const message = postSaveError instanceof Error ? postSaveError.message : String(postSaveError);
          console.error(`Setup wizard saved config but post-save checks failed: ${message}`);
          process.exitCode = 1;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`Setup wizard failed: ${message}`);
        process.exitCode = 1;
      }
    });

  setupCommand
    .command("quickstart")
    .description("Run minimal first-reply onboarding")
    .option("--config <path>", "Path to openassist.toml", "openassist.toml")
    .option("--env-file <path>", "Environment file path", defaultEnvFilePath())
    .option("--install-dir <path>", "OpenAssist install directory", defaultInstallDir())
    .option("--allow-incomplete", "Allow saving with validation errors after explicit confirmation")
    .option("--skip-service", "Skip service install/restart and health checks")
    .action(async (options) => {
      try {
        const configPath = resolveFromWorkspace(String(options.config));
        const envFilePath = path.resolve(String(options.envFile));
        const installDir = path.resolve(String(options.installDir));
        const state = loadSetupQuickstartState(configPath, envFilePath, installDir);
        const result = await runSetupQuickstart(
          state,
          {
            configPath,
            envFilePath,
            installDir,
            allowIncomplete: Boolean(options.allowIncomplete),
            skipService: Boolean(options.skipService)
          },
          createInquirerPromptAdapter()
        );

        if (!result.saved) {
          console.error("Quickstart exited before saving.");
          process.exitCode = 1;
          return;
        }

        for (const line of result.summary) {
          console.log(line);
        }
        if (result.postSaveAborted) {
          console.error("Quickstart saved configuration, but service/health checks were aborted.");
          process.exitCode = 1;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`Setup quickstart failed: ${message}`);
        process.exitCode = 1;
      }
    });

  setupCommand
    .command("show")
    .description("Show effective parsed config")
    .option("--config <path>", "Path to openassist.toml", "openassist.toml")
    .action((options) => {
      try {
        const configPath = resolveFromWorkspace(String(options.config));
        const configDir = path.dirname(configPath);
        const loaded = loadConfig({
          baseFile: configPath,
          overlaysDir: path.join(configDir, "config.d")
        });
        console.log(JSON.stringify(loaded.config, null, 2));
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`Setup show failed: ${message}`);
        process.exitCode = 1;
      }
    });

  setupCommand
    .command("env")
    .description("Interactively edit env secrets file")
    .option("--env-file <path>", "Environment file path", defaultEnvFilePath())
    .action(async (options) => {
      if (!process.stdin.isTTY || !process.stdout.isTTY) {
        console.error("Interactive env editor requires TTY.");
        process.exitCode = 1;
        return;
      }

      const envFilePath = path.resolve(String(options.envFile));
      const prompts = createInquirerPromptAdapter();
      let env = loadEnvFile(envFilePath);

      while (true) {
        const action = await prompts.select(
          `Env editor (${envFilePath})`,
          [
            { name: "Set key", value: "set" },
            { name: "Remove key", value: "remove" },
            { name: "List keys", value: "list" },
            { name: "Save and exit", value: "save" },
            { name: "Exit without saving", value: "exit" }
          ],
          "save"
        );

        if (action === "exit") {
          console.log("Env editor exited without saving.");
          return;
        }

        if (action === "list") {
          const keys = Object.keys(env).sort();
          if (keys.length === 0) {
            console.log("(no keys)");
          } else {
            for (const key of keys) {
              console.log(`- ${key}`);
            }
          }
          continue;
        }

        if (action === "set") {
          const key = await prompts.input("Key name");
          if (!key) {
            continue;
          }
          const value = await prompts.password("Value");
          env[key] = value;
          continue;
        }

        if (action === "remove") {
          const keys = Object.keys(env);
          if (keys.length === 0) {
            console.log("No keys to remove.");
            continue;
          }
          const key = await prompts.select(
            "Select key to remove",
            keys.sort().map((item) => ({ name: item, value: item }))
          );
          delete env[key];
          continue;
        }

        saveEnvFile(envFilePath, env, { ensureMode600: true });
        console.log(`Saved env file: ${envFilePath}`);
        return;
      }
    });
}
