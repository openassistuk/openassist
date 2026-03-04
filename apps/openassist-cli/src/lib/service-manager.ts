import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { CommandRunner, runOrThrow } from "./command-runner.js";
import { enforceEnvFileSecurity } from "./env-file.js";
import type { ServiceManagerKind } from "./install-state.js";

export interface ServiceInstallOptions {
  installDir: string;
  configPath: string;
  envFilePath: string;
  repoRoot: string;
  dryRun?: boolean;
}

export interface ServiceManagerAdapter {
  readonly kind: ServiceManagerKind;
  install(options: ServiceInstallOptions): Promise<void>;
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

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function toPosixPath(value: string): string {
  return value.replace(/\\/g, "/");
}

function loadTemplate(templatePath: string, fallback: string): string {
  if (!fs.existsSync(templatePath)) {
    return fallback;
  }
  return fs.readFileSync(templatePath, "utf8");
}

export function renderSystemdUnit(
  template: string,
  values: { installDir: string; configPath: string; envFilePath: string; nodeBin: string }
): string {
  return template
    .replaceAll("__OPENASSIST_INSTALL_DIR__", values.installDir)
    .replaceAll("__OPENASSIST_CONFIG_PATH__", values.configPath)
    .replaceAll("__OPENASSIST_ENV_FILE__", values.envFilePath)
    .replaceAll("__OPENASSIST_RW_CONFIG_DIR__", path.dirname(values.envFilePath))
    .replaceAll("__OPENASSIST_NODE_BIN__", values.nodeBin);
}

export function renderLaunchdWrapper(values: {
  installDir: string;
  configPath: string;
  envFilePath: string;
  nodeBin: string;
}): string {
  const daemonEntrypoint = path.posix.join(
    toPosixPath(values.installDir),
    "apps",
    "openassistd",
    "dist",
    "index.js"
  );
  return [
    "#!/usr/bin/env bash",
    "set -euo pipefail",
    `if [[ -f ${shellQuote(values.envFilePath)} ]]; then`,
    "  set -a",
    `  source ${shellQuote(values.envFilePath)}`,
    "  set +a",
    "fi",
    `export OPENASSIST_ENV_FILE=${shellQuote(values.envFilePath)}`,
    `cd ${shellQuote(values.installDir)}`,
    `exec ${shellQuote(values.nodeBin)} ${shellQuote(daemonEntrypoint)} run --config ${shellQuote(values.configPath)}`,
    ""
  ].join("\n");
}

export function renderLaunchdPlist(
  template: string,
  values: {
    installDir: string;
    wrapperPath: string;
    stdoutLogPath: string;
    stderrLogPath: string;
  }
): string {
  return template
    .replaceAll("__OPENASSIST_REPO__", values.installDir)
    .replaceAll("__OPENASSIST_WRAPPER__", values.wrapperPath)
    .replaceAll("__OPENASSIST_STDOUT__", values.stdoutLogPath)
    .replaceAll("__OPENASSIST_STDERR__", values.stderrLogPath);
}

class SystemdUserServiceManager implements ServiceManagerAdapter {
  readonly kind: ServiceManagerKind = "systemd-user";
  private readonly runner: CommandRunner;
  private readonly unitName = "openassistd.service";
  private readonly unitPath: string;

  constructor(runner: CommandRunner) {
    this.runner = runner;
    this.unitPath = path.join(os.homedir(), ".config", "systemd", "user", this.unitName);
  }

  async install(options: ServiceInstallOptions): Promise<void> {
    if (process.platform !== "linux") {
      throw new Error("systemd user service is only available on Linux");
    }

    const templatePath = path.join(options.repoRoot, "deploy", "systemd", "openassistd.service");
    const template = loadTemplate(
      templatePath,
      [
        "[Unit]",
        "Description=OpenAssist Daemon",
        "After=network.target",
        "Wants=network-online.target",
        "",
        "[Service]",
        "Type=simple",
        "WorkingDirectory=__OPENASSIST_INSTALL_DIR__",
        "EnvironmentFile=__OPENASSIST_ENV_FILE__",
        "Environment=OPENASSIST_ENV_FILE=__OPENASSIST_ENV_FILE__",
        "ExecStart=__OPENASSIST_NODE_BIN__ __OPENASSIST_INSTALL_DIR__/apps/openassistd/dist/index.js run --config __OPENASSIST_CONFIG_PATH__",
        "Restart=always",
        "RestartSec=5",
        "TimeoutStopSec=30",
        "",
        "NoNewPrivileges=true",
        "PrivateTmp=true",
        "ProtectSystem=strict",
        "ProtectHome=read-only",
        "ReadWritePaths=__OPENASSIST_INSTALL_DIR__ __OPENASSIST_RW_CONFIG_DIR__ %h/.local/state/openassist",
        "LockPersonality=true",
        "RestrictSUIDSGID=true",
        "",
        "[Install]",
        "WantedBy=default.target",
        ""
      ].join("\n")
    );

    const rendered = renderSystemdUnit(template, {
      installDir: options.installDir,
      configPath: options.configPath,
      envFilePath: options.envFilePath,
      nodeBin: process.execPath
    });

    if (options.dryRun) {
      return;
    }

    const userStateDir = path.join(os.homedir(), ".local", "state", "openassist");
    fs.mkdirSync(path.dirname(this.unitPath), { recursive: true });
    fs.mkdirSync(path.dirname(options.envFilePath), { recursive: true, mode: 0o700 });
    fs.chmodSync(path.dirname(options.envFilePath), 0o700);
    fs.mkdirSync(userStateDir, { recursive: true });
    enforceEnvFileSecurity(options.envFilePath, { allowMissing: true });
    fs.writeFileSync(this.unitPath, rendered, "utf8");

    await runOrThrow(this.runner, "systemctl", ["--user", "daemon-reload"]);
    await runOrThrow(this.runner, "systemctl", ["--user", "enable", "--now", this.unitName]);
  }

  async uninstall(): Promise<void> {
    await this.disable().catch(() => undefined);
    if (fs.existsSync(this.unitPath)) {
      fs.rmSync(this.unitPath, { force: true });
    }
    await runOrThrow(this.runner, "systemctl", ["--user", "daemon-reload"]);
  }

  async start(): Promise<void> {
    await runOrThrow(this.runner, "systemctl", ["--user", "start", this.unitName]);
  }

  async stop(): Promise<void> {
    await runOrThrow(this.runner, "systemctl", ["--user", "stop", this.unitName]);
  }

  async restart(): Promise<void> {
    await runOrThrow(this.runner, "systemctl", ["--user", "restart", this.unitName]);
  }

  async status(): Promise<void> {
    const status = await this.runner.run("systemctl", ["--user", "status", this.unitName, "--no-pager"]);
    process.stdout.write(status.stdout);
    process.stderr.write(status.stderr);
    if (status.code !== 0) {
      throw new Error(`systemctl status returned ${status.code}`);
    }
  }

  async logs(lines: number, follow: boolean): Promise<void> {
    const args = ["--user", "-u", this.unitName, "-n", String(lines), "--no-pager"];
    if (follow) {
      args.push("-f");
    }
    const result = await this.runner.runStreaming("journalctl", args);
    if (result !== 0) {
      throw new Error(`journalctl returned ${result}`);
    }
  }

  async enable(): Promise<void> {
    await runOrThrow(this.runner, "systemctl", ["--user", "enable", this.unitName]);
  }

  async disable(): Promise<void> {
    await runOrThrow(this.runner, "systemctl", ["--user", "disable", "--now", this.unitName]);
  }

  async isInstalled(): Promise<boolean> {
    return fs.existsSync(this.unitPath);
  }
}

class SystemdSystemServiceManager implements ServiceManagerAdapter {
  readonly kind: ServiceManagerKind = "systemd-system";
  private readonly runner: CommandRunner;
  private readonly unitName = "openassistd.service";
  private readonly unitPath = "/etc/systemd/system/openassistd.service";

  constructor(runner: CommandRunner) {
    this.runner = runner;
  }

  async install(options: ServiceInstallOptions): Promise<void> {
    if (process.platform !== "linux") {
      throw new Error("systemd system service is only available on Linux");
    }

    const template = [
      "[Unit]",
      "Description=OpenAssist Daemon",
      "After=network.target",
      "Wants=network-online.target",
      "",
      "[Service]",
      "Type=simple",
      "WorkingDirectory=__OPENASSIST_INSTALL_DIR__",
      "EnvironmentFile=__OPENASSIST_ENV_FILE__",
      "Environment=OPENASSIST_ENV_FILE=__OPENASSIST_ENV_FILE__",
      "ExecStart=__OPENASSIST_NODE_BIN__ __OPENASSIST_INSTALL_DIR__/apps/openassistd/dist/index.js run --config __OPENASSIST_CONFIG_PATH__",
      "Restart=always",
      "RestartSec=5",
      "TimeoutStopSec=30",
      "",
      "NoNewPrivileges=true",
      "PrivateTmp=true",
      "ProtectSystem=strict",
      "ProtectHome=false",
      "ReadWritePaths=__OPENASSIST_INSTALL_DIR__ __OPENASSIST_RW_CONFIG_DIR__ /var/lib/openassist /var/log/openassist",
      "LockPersonality=true",
      "RestrictSUIDSGID=true",
      "",
      "[Install]",
      "WantedBy=multi-user.target",
      ""
    ].join("\n");

    const rendered = renderSystemdUnit(template, {
      installDir: options.installDir,
      configPath: options.configPath,
      envFilePath: options.envFilePath,
      nodeBin: process.execPath
    });

    if (options.dryRun) {
      return;
    }

    fs.mkdirSync(path.dirname(options.envFilePath), { recursive: true, mode: 0o700 });
    fs.chmodSync(path.dirname(options.envFilePath), 0o700);
    fs.mkdirSync("/var/lib/openassist", { recursive: true });
    fs.mkdirSync("/var/log/openassist", { recursive: true });
    enforceEnvFileSecurity(options.envFilePath, { allowMissing: true });
    fs.writeFileSync(this.unitPath, rendered, "utf8");

    await runOrThrow(this.runner, "systemctl", ["daemon-reload"]);
    await runOrThrow(this.runner, "systemctl", ["enable", "--now", this.unitName]);
  }

  async uninstall(): Promise<void> {
    await this.disable().catch(() => undefined);
    if (fs.existsSync(this.unitPath)) {
      fs.rmSync(this.unitPath, { force: true });
    }
    await runOrThrow(this.runner, "systemctl", ["daemon-reload"]);
  }

  async start(): Promise<void> {
    await runOrThrow(this.runner, "systemctl", ["start", this.unitName]);
  }

  async stop(): Promise<void> {
    await runOrThrow(this.runner, "systemctl", ["stop", this.unitName]);
  }

  async restart(): Promise<void> {
    await runOrThrow(this.runner, "systemctl", ["restart", this.unitName]);
  }

  async status(): Promise<void> {
    const status = await this.runner.run("systemctl", ["status", this.unitName, "--no-pager"]);
    process.stdout.write(status.stdout);
    process.stderr.write(status.stderr);
    if (status.code !== 0) {
      throw new Error(`systemctl status returned ${status.code}`);
    }
  }

  async logs(lines: number, follow: boolean): Promise<void> {
    const args = ["-u", this.unitName, "-n", String(lines), "--no-pager"];
    if (follow) {
      args.push("-f");
    }
    const result = await this.runner.runStreaming("journalctl", args);
    if (result !== 0) {
      throw new Error(`journalctl returned ${result}`);
    }
  }

  async enable(): Promise<void> {
    await runOrThrow(this.runner, "systemctl", ["enable", this.unitName]);
  }

  async disable(): Promise<void> {
    await runOrThrow(this.runner, "systemctl", ["disable", "--now", this.unitName]);
  }

  async isInstalled(): Promise<boolean> {
    return fs.existsSync(this.unitPath);
  }
}

class LaunchdServiceManager implements ServiceManagerAdapter {
  readonly kind: ServiceManagerKind = "launchd";
  private readonly runner: CommandRunner;
  private readonly label = "ai.openassist.openassistd";
  private readonly plistPath: string;
  private readonly wrapperPath: string;
  private readonly stdoutLogPath: string;
  private readonly stderrLogPath: string;

  constructor(runner: CommandRunner) {
    this.runner = runner;
    this.plistPath = path.join(os.homedir(), "Library", "LaunchAgents", `${this.label}.plist`);
    this.wrapperPath = path.join(os.homedir(), ".config", "openassist", "openassistd-launchd-wrapper.sh");
    this.stdoutLogPath = path.join(os.homedir(), "Library", "Logs", "OpenAssist", "openassistd.out.log");
    this.stderrLogPath = path.join(os.homedir(), "Library", "Logs", "OpenAssist", "openassistd.err.log");
  }

  async install(options: ServiceInstallOptions): Promise<void> {
    if (process.platform !== "darwin") {
      throw new Error("launchd service is only available on macOS");
    }

    const templatePath = path.join(options.repoRoot, "deploy", "launchd", "ai.openassist.openassistd.plist");
    const template = loadTemplate(
      templatePath,
      [
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?>",
        "<!DOCTYPE plist PUBLIC \"-//Apple//DTD PLIST 1.0//EN\" \"http://www.apple.com/DTDs/PropertyList-1.0.dtd\">",
        "<plist version=\"1.0\">",
        "  <dict>",
        "    <key>Label</key>",
        "    <string>ai.openassist.openassistd</string>",
        "    <key>ProgramArguments</key>",
        "    <array>",
        "      <string>/bin/bash</string>",
        "      <string>__OPENASSIST_WRAPPER__</string>",
        "    </array>",
        "    <key>WorkingDirectory</key>",
        "    <string>__OPENASSIST_REPO__</string>",
        "    <key>RunAtLoad</key>",
        "    <true />",
        "    <key>KeepAlive</key>",
        "    <true />",
        "    <key>StandardOutPath</key>",
        "    <string>__OPENASSIST_STDOUT__</string>",
        "    <key>StandardErrorPath</key>",
        "    <string>__OPENASSIST_STDERR__</string>",
        "  </dict>",
        "</plist>",
        ""
      ].join("\n")
    );

    const wrapper = renderLaunchdWrapper({
      installDir: options.installDir,
      configPath: options.configPath,
      envFilePath: options.envFilePath,
      nodeBin: process.execPath
    });

    const rendered = renderLaunchdPlist(template, {
      installDir: options.installDir,
      wrapperPath: this.wrapperPath,
      stdoutLogPath: this.stdoutLogPath,
      stderrLogPath: this.stderrLogPath
    });

    if (options.dryRun) {
      return;
    }

    fs.mkdirSync(path.dirname(this.plistPath), { recursive: true });
    fs.mkdirSync(path.dirname(this.wrapperPath), { recursive: true });
    fs.mkdirSync(path.dirname(this.stdoutLogPath), { recursive: true });
    fs.chmodSync(path.dirname(this.wrapperPath), 0o700);
    enforceEnvFileSecurity(options.envFilePath, { allowMissing: true });
    fs.writeFileSync(this.wrapperPath, wrapper, "utf8");
    fs.chmodSync(this.wrapperPath, 0o755);
    fs.writeFileSync(this.plistPath, rendered, "utf8");

    await this.runner.run("launchctl", ["unload", this.plistPath]).catch(() => undefined);
    await runOrThrow(this.runner, "launchctl", ["load", this.plistPath]);
  }

  async uninstall(): Promise<void> {
    await this.runner.run("launchctl", ["unload", this.plistPath]).catch(() => undefined);
    if (fs.existsSync(this.plistPath)) {
      fs.rmSync(this.plistPath, { force: true });
    }
    if (fs.existsSync(this.wrapperPath)) {
      fs.rmSync(this.wrapperPath, { force: true });
    }
  }

  async start(): Promise<void> {
    const uid = String(process.getuid?.() ?? 0);
    await runOrThrow(this.runner, "launchctl", ["kickstart", "-k", `gui/${uid}/${this.label}`]);
  }

  async stop(): Promise<void> {
    const uid = String(process.getuid?.() ?? 0);
    await runOrThrow(this.runner, "launchctl", ["bootout", `gui/${uid}/${this.label}`]);
  }

  async restart(): Promise<void> {
    await this.stop().catch(() => undefined);
    await this.start();
  }

  async status(): Promise<void> {
    const uid = String(process.getuid?.() ?? 0);
    const result = await this.runner.run("launchctl", ["print", `gui/${uid}/${this.label}`]);
    process.stdout.write(result.stdout);
    process.stderr.write(result.stderr);
    if (result.code !== 0) {
      throw new Error(`launchctl print returned ${result.code}`);
    }
  }

  async logs(lines: number, follow: boolean): Promise<void> {
    const files = [this.stdoutLogPath, this.stderrLogPath].filter((target) => fs.existsSync(target));
    if (files.length === 0) {
      throw new Error("No launchd log files found for OpenAssist");
    }
    const args = ["-n", String(lines)];
    if (follow) {
      args.push("-f");
    }
    args.push(...files);
    const code = await this.runner.runStreaming("tail", args);
    if (code !== 0) {
      throw new Error(`tail returned ${code}`);
    }
  }

  async enable(): Promise<void> {
    await runOrThrow(this.runner, "launchctl", ["load", this.plistPath]);
  }

  async disable(): Promise<void> {
    await runOrThrow(this.runner, "launchctl", ["unload", this.plistPath]);
  }

  async isInstalled(): Promise<boolean> {
    return fs.existsSync(this.plistPath);
  }
}

/* c8 ignore start -- platform-specific routing is exercised on Linux/macOS CI */
export function detectServiceManagerKind(): ServiceManagerKind {
  if (process.platform === "darwin") {
    return "launchd";
  }
  if (process.platform === "linux") {
    return process.getuid?.() === 0 ? "systemd-system" : "systemd-user";
  }
  return "systemd-user";
}
/* c8 ignore stop */

export function createServiceManager(runner: CommandRunner): ServiceManagerAdapter {
  if (process.platform === "darwin") {
    return new LaunchdServiceManager(runner);
  }
  if (process.platform === "linux") {
    /* c8 ignore next -- root-only branch */
    if (process.getuid?.() === 0) {
      return new SystemdSystemServiceManager(runner);
    }
    return new SystemdUserServiceManager(runner);
  }
  throw new Error(`Unsupported platform for service management: ${process.platform}`);
}
