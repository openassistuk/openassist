import path from "node:path";
import { loadInstallState } from "./install-state.js";

/** Only associate setup with a record that describes the config and application being edited. */
export function installationSummary(installDir: string, configPath: string) {
  const record = loadInstallState();
  const state = record && path.resolve(record.installDir) === path.resolve(installDir) &&
    path.resolve(record.configPath) === path.resolve(configPath) ? record : undefined;
  return {
    installStatePresent: Boolean(state),
    installationMethod: state?.active?.method,
    installedVersion: state?.active?.build.version,
    activationVerified: state?.active?.verified,
    isolated: Boolean(process.env.OPENASSIST_STATE_ROOT),
    trackedRef: state?.active?.pinnedVersion ?? state?.active?.ref ?? state?.trackedRef
  };
}

export function installationSummaryText(installDir: string, configPath: string): string {
  const info = installationSummary(installDir, configPath);
  return `${info.isolated ? "isolated " : ""}${info.installationMethod ?? "source"}${info.installedVersion ? ` ${info.installedVersion}` : ""}${info.activationVerified === false ? " (activation unverified; run openassist update recover after starting the service)" : ""}`;
}
