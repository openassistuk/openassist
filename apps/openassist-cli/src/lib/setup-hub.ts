import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { resolveOperatorPaths } from "@openassist/config";
import { defaultConfigPath, defaultEnvFilePath, defaultInstallDir, detectDefaultDaemonBaseUrl } from "./runtime-context.js";
import { type PromptAdapter, createInquirerPromptAdapter, loadSetupWizardState, runSetupWizard } from "./setup-wizard.js";
import { autoMigrateLegacyDefaultLayoutIfNeeded } from "./operator-layout.js";
import { loadSetupQuickstartState, runSetupQuickstart } from "./setup-quickstart.js";
import { runSetupWizardPostSaveChecks } from "./setup-post-save.js";

export interface SetupHubOptions {
  installDir: string;
  configPath: string;
  envFilePath: string;
  allowIncomplete?: boolean;
  skipService?: boolean;
}

function currentCliEntrypoint(): string {
  return process.argv[1] ?? path.join(process.cwd(), "apps", "openassist-cli", "dist", "index.js");
}

async function runCurrentCli(args: string[]): Promise<number> {
  return await new Promise<number>((resolve, reject) => {
    const child = spawn(process.execPath, [currentCliEntrypoint(), ...args], {
      stdio: "inherit"
    });
    child.once("error", reject);
    child.once("exit", (code) => resolve(code ?? 0));
  });
}

function fileLocationLines(options: SetupHubOptions): string[] {
  const operatorPaths = resolveOperatorPaths({ installDir: options.installDir });
  return [
    "Current lifecycle files",
    `- Install directory: ${options.installDir}`,
    `- Config path: ${options.configPath}`,
    `- Env file: ${options.envFilePath}`,
    `- Install state: ${operatorPaths.installStatePath}`,
    `- Runtime data: ${operatorPaths.dataDir}`,
    `- Runtime logs: ${operatorPaths.logsDir}`,
    `- Managed skills: ${operatorPaths.skillsDir}`,
    `- Managed helper tools: ${operatorPaths.helperToolsDir}`
  ];
}

export async function runSetupHub(
  rawOptions: Partial<SetupHubOptions>,
  prompts: PromptAdapter = createInquirerPromptAdapter()
): Promise<void> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    console.error("Interactive lifecycle hub requires TTY.");
    console.error("Use one of the scriptable setup subcommands instead:");
    console.error(`- openassist setup quickstart --install-dir "${defaultInstallDir()}" --config "${defaultConfigPath()}" --env-file "${defaultEnvFilePath()}"`);
    console.error(`- openassist setup wizard --install-dir "${defaultInstallDir()}" --config "${defaultConfigPath()}" --env-file "${defaultEnvFilePath()}"`);
    process.exitCode = 1;
    return;
  }

  const installDir = path.resolve(rawOptions.installDir ?? defaultInstallDir());
  let configPath = path.resolve(rawOptions.configPath ?? defaultConfigPath());
  let envFilePath = path.resolve(rawOptions.envFilePath ?? defaultEnvFilePath());

  const migration = await autoMigrateLegacyDefaultLayoutIfNeeded({
    installDir,
    configPath,
    envFilePath
  });
  if (migration.blockedReason) {
    console.error(`Legacy repo-local layout detected but automatic migration stopped: ${migration.blockedReason}`);
    console.error(`Use the new home-state defaults or pass an explicit legacy path if you need manual migration work.`);
  } else if (migration.migrated && migration.message) {
    console.log(migration.message);
  }
  configPath = migration.configPath;
  envFilePath = migration.envFilePath;

  while (true) {
    const firstTimeDefault = !fs.existsSync(configPath) ? "first-time" : "repair";
    const action = await prompts.select<
      "first-time" | "repair" | "advanced" | "service" | "upgrade" | "status" | "exit"
    >(
      "OpenAssist setup",
      [
        { name: "First-time setup", value: "first-time" },
        { name: "Check and repair this install", value: "repair" },
        { name: "Advanced configuration", value: "advanced" },
        { name: "Service and health actions", value: "service" },
        { name: "Safe update planning", value: "upgrade" },
        { name: "Show file locations and lifecycle status", value: "status" },
        { name: "Exit", value: "exit" }
      ],
      firstTimeDefault
    );

    if (action === "exit") {
      return;
    }

    if (action === "status") {
      for (const line of fileLocationLines({ installDir, configPath, envFilePath })) {
        console.log(line);
      }
      await runCurrentCli(["doctor"]);
      continue;
    }

    if (action === "repair") {
      await runCurrentCli(["doctor"]);
      continue;
    }

    if (action === "service") {
      await runCurrentCli(["service", "console"]);
      continue;
    }

    if (action === "upgrade") {
      await runCurrentCli(["upgrade", "--dry-run", "--install-dir", installDir]);
      continue;
    }

    if (action === "first-time") {
      const state = loadSetupQuickstartState(configPath, envFilePath, installDir);
      const result = await runSetupQuickstart(
        state,
        {
          configPath,
          envFilePath,
          installDir,
          allowIncomplete: Boolean(rawOptions.allowIncomplete),
          skipService: Boolean(rawOptions.skipService)
        },
        prompts
      );
      for (const line of result.summary) {
        console.log(line);
      }
      return;
    }

    const state = loadSetupWizardState(configPath, envFilePath);
    const result = await runSetupWizard(state, prompts);
    if (!result.saved) {
      console.log("Setup wizard exited without saving.");
      continue;
    }
    console.log(`Saved advanced configuration to ${configPath}`);
    if (result.backupPath) {
      console.log(`Backup created: ${result.backupPath}`);
    }
    const postSave = await runSetupWizardPostSaveChecks(
      {
        installDir,
        configPath,
        envFilePath,
        baseUrl: detectDefaultDaemonBaseUrl(configPath)
      },
      prompts
    );
    if (!postSave.completed && postSave.lastError) {
      console.log(`Needs action: ${postSave.lastError}`);
    }
    return;
  }
}
