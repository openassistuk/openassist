import fs from "node:fs";
import path from "node:path";
import net from "node:net";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { Command } from "commander";
import TOML from "@iarna/toml";
import { defaultDevInstancesDir, loadConfig, writeDefaultConfig } from "@openassist/config";
import { atomicWriteJson, atomicWriteText, saveInstallState } from "../lib/install-state.js";
import { acquireLifecycleLock, containedPath, removeManagedPath } from "../lib/lifecycle-files.js";
import { prepareSource, sourceRef, buildSource, resolveUpdateMethod } from "../lib/lifecycle-engine.js";
import { confirmLifecycle, lifecycleAction } from "./lifecycle.js";
import { enforceEnvFileSecurity, loadEnvFile } from "../lib/env-file.js";

export function instancePath(name: string): string {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(name)) throw new Error("Instance names must contain 1–64 letters, digits, underscores or hyphens.");
  return containedPath(defaultDevInstancesDir(), path.join(defaultDevInstancesDir(),name));
}

export function isolatedEnvironment(root: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const key of ["PATH","HOME","USERPROFILE","SystemRoot","TEMP","TMP","TMPDIR","LANG","LC_ALL","TERM"]) if (process.env[key]) env[key] = process.env[key];
  return {...env, OPENASSIST_STATE_ROOT: root, OPENASSIST_ENV_FILE: path.join(root,"config","openassistd.env"), OPENASSIST_SERVICE_MANAGER_KIND: "manual"};
}

export function isolatedDaemonEnvironment(root: string): NodeJS.ProcessEnv {
  const env = isolatedEnvironment(root);
  enforceEnvFileSecurity(env.OPENASSIST_ENV_FILE!);
  // Credentials belong to the daemon, never the build or its dependency scripts.
  // Dedicated configuration cannot redirect state, runtime loading or host paths.
  const dedicated = loadEnvFile(env.OPENASSIST_ENV_FILE!);
  for (const key of Object.keys(dedicated)) {
    if (["NODE_OPTIONS", "NODE_PATH", "LD_PRELOAD", "LD_LIBRARY_PATH", "INIT_CWD", "HOME", "USERPROFILE", "PATH", "SystemRoot", "TEMP", "TMP", "TMPDIR", "SHELL", "ZDOTDIR", "OPENASSIST_INSTALL_DIR", "OPENASSIST_SYSTEMD_FILESYSTEM_ACCESS"].includes(key) || key.startsWith("DYLD_")) delete dedicated[key];
  }
  return {...dedicated, ...env};
}

async function availablePort(requested?: string): Promise<number> {
  const port = requested === undefined ? 0 : Number(requested);
  if (!Number.isInteger(port) || port < 0 || port > 65535 || (requested !== undefined && port === 0)) throw new Error("Port must be an integer from 1 to 65535.");
  return new Promise((resolve,reject) => {
    const server = net.createServer();
    server.once("error",reject);
    server.listen(port,"127.0.0.1",() => { const selected = (server.address() as net.AddressInfo).port; server.close(error => error ? reject(error) : resolve(selected)); });
  });
}

export function registerDevCommands(program: Command): void {
  const dev = program.command("dev").description("Isolated developer instances (not a security sandbox)");
  dev.command("list").option("--json","Machine-readable output").action(async opts => lifecycleAction(opts,async () => {
    const root = defaultDevInstancesDir();
    return {instances: fs.existsSync(root) ? fs.readdirSync(root).filter(name => /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(name) && !fs.lstatSync(path.join(root,name)).isSymbolicLink()).map(name => ({name,path:path.join(root,name)})) : []};
  }));
  dev.command("remove <name>").option("--dry-run").option("--json").option("--yes").action(async (name,opts) => lifecycleAction(opts,async () => {
    const root = instancePath(name);
    if (fs.existsSync(path.join(root,"operation.lock"))) throw new Error("The instance has a running or interrupted operation. Stop it and inspect its lock first.");
    await confirmLifecycle(true,opts.yes,opts.dryRun,`Remove isolated instance ${name} and its data?`);
    if (!opts.dryRun && fs.existsSync(root)) {
      const unlock = acquireLifecycleLock(root);
      try {
        // Hold the instance lock until its directory is renamed out of the namespace.
        const retired = `${root}-removing-${process.pid}`;
        fs.renameSync(root, retired);
        removeManagedPath(defaultDevInstancesDir(), retired);
      } catch (error) { if (fs.existsSync(root)) unlock(); throw error; }
    }
    return {removed: root,dryRun:Boolean(opts.dryRun)};
  }));
  dev.command("test").option("--ref <ref>").option("--pr <number>").option("--local <path>")
    .option("--name <name>","Reusable instance name","test").option("--port <port>").option("--dry-run").option("--json")
    .action(async opts => lifecycleAction(opts,async () => {
      if ((opts.local && (opts.ref || opts.pr)) || (opts.ref && opts.pr)) throw new Error("Select one local checkout, ref, or PR.");
      resolveUpdateMethod(opts);
      const root = instancePath(opts.name);
      if (opts.dryRun) return {root,source: opts.local ?? sourceRef(opts),service: false,credentialsCopied:false};
      const release = acquireLifecycleLock(root);
      try {
        let application: string;
        let nodePath = process.execPath;
        if (opts.local) {
          application = path.resolve(opts.local);
          if (!fs.existsSync(path.join(application,"pnpm-workspace.yaml"))) throw new Error("Local path must be an OpenAssist workspace.");
          await buildSource(application,isolatedEnvironment(root));
        } else {
          const app = await prepareSource(root,sourceRef(opts),undefined,isolatedEnvironment(root));
          application = app.path; nodePath = app.nodePath;
        }
        const configPath = path.join(root,"config","openassist.toml");
        const port = await availablePort(opts.port);
        if (!fs.existsSync(configPath)) {
          fs.mkdirSync(path.dirname(configPath),{recursive:true,mode:0o700});
          const draft = path.join(root,`${randomUUID()}.toml`);
          writeDefaultConfig(draft);
          const {config} = loadConfig({baseFile:draft,overlaysDir:path.join(root,"config","config.d")});
          fs.unlinkSync(draft);
          config.runtime.bindAddress = "127.0.0.1";
          config.runtime.bindPort = port;
          config.runtime.channels = [];
          config.runtime.scheduler.enabled = false;
          config.runtime.paths = {dataDir:path.join(root,"share","data"),logsDir:path.join(root,"share","logs"),skillsDir:path.join(root,"share","skills")};
          fs.mkdirSync(path.dirname(configPath),{recursive:true,mode:0o700});
          atomicWriteText(configPath,TOML.stringify(config as unknown as TOML.JsonMap));
          fs.writeFileSync(path.join(root,"config","openassistd.env"),"# Dedicated test credentials only.\n",{mode:0o600,flag:"wx"});
        } else {
          const raw = TOML.parse(fs.readFileSync(configPath,"utf8")) as unknown as {runtime:{bindPort:number; bindAddress:string}};
          raw.runtime.bindPort = port;
          raw.runtime.bindAddress = "127.0.0.1";
          atomicWriteText(configPath,TOML.stringify(raw as unknown as TOML.JsonMap));
        }
        const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;
        const setupCommand = `OPENASSIST_STATE_ROOT=${quote(root)} ${quote(nodePath)} ${quote(path.join(application,"apps","openassist-cli","dist","index.js"))} setup --skip-service`;
        atomicWriteJson(path.join(root,"instance.json"),{name:opts.name,application,nodePath,configPath,port,setupCommand});
        saveInstallState({installDir:application,configPath,envFilePath:path.join(root,"config","openassistd.env"),trackedRef:opts.local ? "local" : sourceRef(opts)},path.join(root,"config","install-state.json"));
        const detail = {root,port,configPath,setupCommand,service:false};
        if (!opts.json) console.error(`Isolated ${opts.name}: http://127.0.0.1:${port}\nState: ${root}\n${detail.setupCommand}\nPress Ctrl-C to stop. This is not a sandbox for untrusted code.`);
        await new Promise<void>((resolve,reject) => {
          const child = spawn(nodePath,[path.join(application,"apps","openassistd","dist","index.js"),"run","--config",configPath],{cwd:root,env:isolatedDaemonEnvironment(root),stdio:opts.json ? ["ignore","ignore","inherit"] : "inherit"});
          const stop = () => child.kill("SIGTERM");
          process.once("SIGINT",stop); process.once("SIGTERM",stop);
          child.once("error",reject);
          child.once("exit",(code,signal) => {process.removeListener("SIGINT",stop);process.removeListener("SIGTERM",stop); if (code && !signal) reject(new Error(`Test daemon exited with status ${code}.`)); else resolve();});
        });
        return detail;
      } finally {release();}
    }));
}
