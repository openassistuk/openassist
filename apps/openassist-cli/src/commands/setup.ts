import path from "node:path";
import type { Command } from "commander";
import { loadConfig, resolveConfigOverlaysDir } from "@openassist/config";
import {
  createInquirerPromptAdapter,
  loadSetupWizardState,
  runSetupWizard
} from "../lib/setup-wizard.js";
import { loadSetupQuickstartState, runSetupQuickstart } from "../lib/setup-quickstart.js";
import { autoMigrateLegacyDefaultLayoutIfNeeded } from "../lib/operator-layout.js";
import { runSetupWizardPostSaveChecks } from "../lib/setup-post-save.js";
import { runSetupHub } from "../lib/setup-hub.js";
import {
  defaultEnvFilePath,
  defaultInstallDir,
  defaultConfigPath,
  detectDefaultDaemonBaseUrl,
  resolveFromWorkspace
} from "../lib/runtime-context.js";
import { loadEnvFile, saveEnvFile } from "../lib/env-file.js";

function readCommandOptions<T extends Record<string, unknown>>(options: T, command?: Command): T {
  if (!command?.parent || typeof command.parent.opts !== "function") {
    return options;
  }

  const parentCommand = command.parent;
  const mergedOptions = { ...options } as Record<string, unknown>;
  const parentOptions = parentCommand.opts() as Record<string, unknown>;
  for (const [key, parentValue] of Object.entries(parentOptions)) {
    if (parentValue === undefined) {
      continue;
    }
    const localSource = command.getOptionValueSource?.(key);
    const parentSource = parentCommand.getOptionValueSource?.(key);
    if ((localSource === "default" || localSource === undefined) && parentSource && parentSource !== "default") {
      mergedOptions[key] = parentValue;
    }
  }

  return mergedOptions as T;
}

export function registerSetupCommands(program: Command): void {
  const setupCommand = program
    .command("setup")
    .description("Lifecycle hub plus first-run onboarding and advanced configuration commands")
    .option("--config <path>", "Path to openassist.toml", defaultConfigPath())
    .option("--env-file <path>", "Environment file path", defaultEnvFilePath())
    .option("--install-dir <path>", "OpenAssist install directory", defaultInstallDir())
    .option("--allow-incomplete", "Allow saving with validation errors after explicit confirmation in first-time setup")
    .option("--skip-service", "Skip service install/restart and health checks in first-time setup")
    .action(async (options, command) => {
      const opts = readCommandOptions(options, command);
      try {
        await runSetupHub({
          installDir: path.resolve(String(opts.installDir)),
          configPath: resolveFromWorkspace(String(opts.config)),
          envFilePath: path.resolve(String(opts.envFile)),
          allowIncomplete: Boolean(opts.allowIncomplete),
          skipService: Boolean(opts.skipService)
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`Setup hub failed: ${message}`);
        process.exitCode = 1;
      }
    });

  setupCommand
    .command("wizard")
    .description("Run advanced setup editor")
    .option("--config <path>", "Path to openassist.toml", defaultConfigPath())
    .option("--env-file <path>", "Environment file path", defaultEnvFilePath())
    .option("--install-dir <path>", "OpenAssist install directory (used for service operations)")
    .option("--base-url <url>", "Daemon API base URL for post-save checks")
    .option("--skip-post-checks", "Skip post-save service and health checks")
    .action(async (options, command) => {
      const opts = readCommandOptions(options, command);
      try {
        let configPath = resolveFromWorkspace(String(opts.config));
        let envFilePath = path.resolve(String(opts.envFile));
        const installDir = opts.installDir
          ? path.resolve(String(opts.installDir))
          : defaultInstallDir();
        const migration = await autoMigrateLegacyDefaultLayoutIfNeeded({
          installDir,
          configPath,
          envFilePath
        });
        if (migration.blockedReason) {
          throw new Error(`Legacy repo-local layout needs manual attention before advanced configuration: ${migration.blockedReason}`);
        }
        if (migration.migrated && migration.message) {
          console.log(migration.message);
        }
        configPath = migration.configPath;
        envFilePath = migration.envFilePath;
        const baseUrl = opts.baseUrl
          ? String(opts.baseUrl)
          : detectDefaultDaemonBaseUrl(configPath);
        const state = loadSetupWizardState(configPath, envFilePath);
        const prompts = createInquirerPromptAdapter();
        const result = await runSetupWizard(state, prompts);
        if (!result.saved) {
          console.log("Setup wizard exited without saving.");
          return;
        }
        const readyNow = [`- Config saved: ${configPath}`];
        if (result.backupPath) {
          readyNow.push(`- Backup created: ${result.backupPath}`);
        }

        if (Boolean(opts.skipPostChecks)) {
          console.log("Ready now");
          for (const line of readyNow) {
            console.log(line);
          }
          console.log("Needs action");
          console.log("- Lifecycle checks were skipped after save (--skip-post-checks).");
          console.log("Next command");
          console.log("- openassist doctor");
          return;
        }
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
            console.log("Ready now");
            for (const line of readyNow) {
              console.log(line);
            }
            console.log("Needs action");
            console.log("- Service is not installed yet for this config.");
            console.log("Next command");
            console.log(`- openassist service install --install-dir "${installDir}" --config "${configPath}" --env-file "${envFilePath}"`);
            return;
          }

          if (!postSave.completed && postSave.reason === "service-manager-unsupported") {
            console.log("Ready now");
            for (const line of readyNow) {
              console.log(line);
            }
            console.log("Needs action");
            console.log("- Service lifecycle is unsupported on this platform for the current OpenAssist release.");
            console.log("Next command");
            console.log("- openassist doctor");
            return;
          }

          if (!postSave.completed && postSave.reason === "post-checks-skipped") {
            console.log("Ready now");
            for (const line of readyNow) {
              console.log(line);
            }
            console.log("Needs action");
            console.log("- Lifecycle checks were skipped by operator choice after save.");
            if (postSave.lastError) {
              console.log(`- Last check error: ${postSave.lastError}`);
            }
            console.log("Next command");
            console.log("- openassist doctor");
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

          console.log("Ready now");
          for (const line of readyNow) {
            console.log(line);
          }
          console.log(`- Service manager: ${postSave.serviceManager}`);
          console.log(`- Daemon health: ok (${baseUrl.replace(/\/+$/, "")})`);
          console.log(`- Time status: ${JSON.stringify(postSave.timeStatus)}`);
          console.log(`- Scheduler status: ${JSON.stringify(postSave.schedulerStatus)}`);
          console.log("Needs action");
          console.log("- None.");
          console.log("Next command");
          console.log("- openassist doctor");
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
    .option("--config <path>", "Path to openassist.toml", defaultConfigPath())
    .option("--env-file <path>", "Environment file path", defaultEnvFilePath())
    .option("--install-dir <path>", "OpenAssist install directory", defaultInstallDir())
    .option("--allow-incomplete", "Allow saving with validation errors after explicit confirmation")
    .option("--skip-service", "Skip service install/restart and health checks")
    .action(async (options, command) => {
      const opts = readCommandOptions(options, command);
      try {
        let configPath = resolveFromWorkspace(String(opts.config));
        let envFilePath = path.resolve(String(opts.envFile));
        const installDir = path.resolve(String(opts.installDir));
        const migration = await autoMigrateLegacyDefaultLayoutIfNeeded({
          installDir,
          configPath,
          envFilePath
        });
        if (migration.blockedReason) {
          throw new Error(`Legacy repo-local layout needs manual attention before quickstart can continue: ${migration.blockedReason}`);
        }
        if (migration.migrated && migration.message) {
          console.log(migration.message);
        }
        configPath = migration.configPath;
        envFilePath = migration.envFilePath;
        const state = loadSetupQuickstartState(configPath, envFilePath, installDir);
        const result = await runSetupQuickstart(
          state,
          {
            configPath,
            envFilePath,
            installDir,
            allowIncomplete: Boolean(opts.allowIncomplete),
            skipService: Boolean(opts.skipService)
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
    .option("--config <path>", "Path to openassist.toml", defaultConfigPath())
    .action((options, command) => {
      const opts = readCommandOptions(options, command);
      try {
        const configPath = resolveFromWorkspace(String(opts.config));
        const loaded = loadConfig({
          baseFile: configPath,
          overlaysDir: resolveConfigOverlaysDir(configPath)
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
    .action(async (options, command) => {
      const opts = readCommandOptions(options, command);
      if (!process.stdin.isTTY || !process.stdout.isTTY) {
        console.error("Interactive env editor requires TTY.");
        process.exitCode = 1;
        return;
      }

      const envFilePath = path.resolve(String(opts.envFile));
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
