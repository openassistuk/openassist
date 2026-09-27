import { Command } from "commander";
import { confirm } from "@inquirer/prompts";
import { executeUpdate, recoverUpdate, resolveUpdateMethod, type UpdateOptions } from "../lib/lifecycle-engine.js";
import { loadInstallState } from "../lib/install-state.js";
import { uninstallApplication } from "../lib/lifecycle-uninstall.js";
import { checkForUpdate, setUpdateNotifications, showUpdateNotice } from "../lib/update-notifications.js";
import { sourceUpdatePlan } from "../lib/source-update-plan.js";
import { renderOperationSummary } from "../lib/lifecycle-readiness.js";

function options(command: Command): Command {
  return command.option("--dry-run", "Preview without changing the installation")
    .option("--json", "Print a machine-readable result")
    .option("--yes", "Confirm this explicitly selected operation non-interactively");
}

export async function confirmLifecycle(required: boolean, yes: boolean, dryRun: boolean, message: string): Promise<void> {
  if (!required || yes || dryRun) return;
  if (!process.stdin.isTTY) throw new Error(`${message} Review --dry-run first, then pass --yes for non-interactive execution.`);
  if (!await confirm({message, default: false})) throw new Error("Operation cancelled; no installation changes made.");
}

export async function lifecycleAction(opts: {json?: boolean}, action: () => Promise<Record<string, unknown>>): Promise<void> {
  try {
    const result = await action();
    if (opts.json) console.log(JSON.stringify({version:4,ok: true, ...result}));
    else if (Array.isArray(result.lines)) console.log(result.lines.join("\n"));
    else {
      console.log(renderOperationSummary(result).join("\n"));
    }
    if (result.ok === false) process.exitCode = 1;
    if(!opts.json && !result.checkedAt) await showUpdateNotice();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (opts.json) console.log(JSON.stringify({version:4,ok: false, error: message}));
    else console.error(`Lifecycle operation failed: ${message}`);
    process.exitCode = 1;
  }
}

export function registerLifecycleCommands(program: Command): void {
  const update = options(program.command("update").alias("upgrade").description("Prepare, activate and recover release or source updates"))
    .option("--source", "Explicitly select source installation")
    .option("--release", "Explicitly select packaged releases")
    .option("--channel <channel>", "Release channel: stable or preview")
    .option("--version <version>", "Pin an exact published release")
    .option("--ref <git-ref>", "Source branch, tag or commit")
    .option("--pr <number>", "Source GitHub pull request")
    .option("--install-dir <path>", "Verify the recorded installation path")
    .option("--skip-restart", "Leave service stopped and activation unverified")
    .action(async (opts: UpdateOptions) => lifecycleAction(opts, async () => {
      const state = loadInstallState();
      const method = resolveUpdateMethod(opts,state);
      if (opts.dryRun && method === "source" && state?.active?.method !== "release") return sourceUpdatePlan(opts);
      await confirmLifecycle(Boolean(state && method !== (state.active?.method ?? "source")), Boolean(opts.yes), Boolean(opts.dryRun), `Switch the primary installation to ${method}?`);
      return executeUpdate(opts);
    }));
  options(update.command("check").description("Check availability without installing"))
    .action(async (_opts, command: Command) => lifecycleAction(command.optsWithGlobals(), () => checkForUpdate(true)));
  options(update.command("recover").description("Inspect or recover an interrupted operation"))
    .action(async (_opts, command: Command) => { const opts=command.optsWithGlobals(); return lifecycleAction(opts, async () => {
      await confirmLifecycle(true,opts.yes,opts.dryRun,"Recover the interrupted installation operation?");
      return recoverUpdate(opts.dryRun);
    }); });
  options(update.command("notifications <mode>").description("Enable or disable update notices (on/off)"))
    .action(async (mode,_opts,command: Command) => { const opts=command.optsWithGlobals(); return lifecycleAction(opts, async () => {
      if (!["on","off"].includes(mode)) throw new Error("Choose on or off.");
      if (!opts.dryRun) setUpdateNotifications(mode === "on");
      return {notifications: mode};
    }); });
  options(program.command("rollback").description("Restore the previous compatible application"))
    .action(async opts => lifecycleAction(opts, async () => {
      await confirmLifecycle(true,opts.yes,opts.dryRun,"Activate the retained previous application?");
      return executeUpdate(opts,true);
    }));
  options(program.command("uninstall").description("Remove the managed application; preserve operator data by default"))
    .option("--purge", "Also remove canonical operator configuration and data; retain backups")
    .action(async opts => lifecycleAction(opts, async () => {
      const preview = await uninstallApplication({...opts,dryRun:true});
      if (!opts.dryRun && !opts.json) console.log(JSON.stringify(preview,null,2));
      await confirmLifecycle(true,opts.yes,opts.dryRun,opts.purge ? "Permanently delete the listed operator data and uninstall?" : "Uninstall the application and service, keeping operator data?");
      return uninstallApplication(opts);
    }));
}
