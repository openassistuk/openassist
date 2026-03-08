import os from "node:os";
import path from "node:path";

export interface OpenAssistOperatorPaths {
  installDir: string;
  configDir: string;
  configPath: string;
  overlaysDir: string;
  envFilePath: string;
  installStatePath: string;
  shareDir: string;
  dataDir: string;
  logsDir: string;
  skillsDir: string;
  helperToolsDir: string;
  migrationBackupsDir: string;
  dbPath: string;
}

export function defaultInstallDir(homeDir = os.homedir()): string {
  return path.join(homeDir, "openassist");
}

export function defaultConfigDir(homeDir = os.homedir()): string {
  return path.join(homeDir, ".config", "openassist");
}

export function defaultConfigPath(homeDir = os.homedir()): string {
  return path.join(defaultConfigDir(homeDir), "openassist.toml");
}

export function defaultConfigOverlaysDir(homeDir = os.homedir()): string {
  return path.join(defaultConfigDir(homeDir), "config.d");
}

export function resolveConfigOverlaysDir(configPath: string, homeDir = os.homedir()): string {
  const resolvedConfigPath = path.resolve(configPath);
  if (resolvedConfigPath === path.resolve(defaultConfigPath(homeDir))) {
    return defaultConfigOverlaysDir(homeDir);
  }
  return path.join(path.dirname(resolvedConfigPath), "config.d");
}

export function defaultEnvFilePath(homeDir = os.homedir()): string {
  return path.join(defaultConfigDir(homeDir), "openassistd.env");
}

export function defaultInstallStatePath(homeDir = os.homedir()): string {
  return path.join(defaultConfigDir(homeDir), "install-state.json");
}

export function defaultShareDir(homeDir = os.homedir()): string {
  return path.join(homeDir, ".local", "share", "openassist");
}

export function defaultDataDir(homeDir = os.homedir()): string {
  return path.join(defaultShareDir(homeDir), "data");
}

export function defaultLogsDir(homeDir = os.homedir()): string {
  return path.join(defaultShareDir(homeDir), "logs");
}

export function defaultSkillsDir(homeDir = os.homedir()): string {
  return path.join(defaultShareDir(homeDir), "skills");
}

export function defaultHelperToolsDir(homeDir = os.homedir()): string {
  return path.join(defaultDataDir(homeDir), "helper-tools");
}

export function defaultMigrationBackupsDir(homeDir = os.homedir()): string {
  return path.join(defaultShareDir(homeDir), "migration-backups");
}

export function resolveOperatorPaths(
  options: { homeDir?: string; installDir?: string } = {}
): OpenAssistOperatorPaths {
  const homeDir = options.homeDir ?? os.homedir();
  const installDir = options.installDir ?? defaultInstallDir(homeDir);
  const configDir = defaultConfigDir(homeDir);
  const shareDir = defaultShareDir(homeDir);
  const dataDir = defaultDataDir(homeDir);
  return {
    installDir,
    configDir,
    configPath: defaultConfigPath(homeDir),
    overlaysDir: defaultConfigOverlaysDir(homeDir),
    envFilePath: defaultEnvFilePath(homeDir),
    installStatePath: defaultInstallStatePath(homeDir),
    shareDir,
    dataDir,
    logsDir: defaultLogsDir(homeDir),
    skillsDir: defaultSkillsDir(homeDir),
    helperToolsDir: defaultHelperToolsDir(homeDir),
    migrationBackupsDir: defaultMigrationBackupsDir(homeDir),
    dbPath: path.join(dataDir, "openassist.db")
  };
}
