import type { RuntimeSystemdFilesystemAccess } from "@openassist/core-types";

export interface ServiceAccessPromptChoice<T extends string = string> {
  name: string;
  value: T;
}

export interface ServiceAccessPromptAdapter {
  confirm(message: string, initial?: boolean): Promise<boolean>;
  select<T extends string>(
    message: string,
    choices: ServiceAccessPromptChoice<T>[],
    initial?: T
  ): Promise<T>;
}

export function isLinuxSystemdFilesystemAccessConfigurable(
  platform: NodeJS.Platform = process.platform
): boolean {
  return platform === "linux";
}

export function describeSystemdFilesystemAccess(
  mode: RuntimeSystemdFilesystemAccess
): string {
  return mode === "unrestricted"
    ? "Unrestricted systemd filesystem access"
    : "Hardened systemd sandbox";
}

export function systemdFilesystemAccessGuidance(): string[] {
  return [
    "Hardened systemd sandbox keeps the Linux service protection enabled and may still block package installs or wider host writes.",
    "Unrestricted systemd filesystem access removes OpenAssist-added Linux systemd filesystem sandboxing for the daemon service.",
    "This only affects Linux systemd services. It does not fix broken hosts, read-only mounts, or missing passwordless sudo."
  ];
}

export async function promptSystemdFilesystemAccess(
  prompts: ServiceAccessPromptAdapter,
  current: RuntimeSystemdFilesystemAccess,
  options: {
    message?: string;
    emitLine?: (line: string) => void;
  } = {}
): Promise<RuntimeSystemdFilesystemAccess> {
  const emitLine = options.emitLine ?? (() => undefined);
  for (const line of systemdFilesystemAccessGuidance()) {
    emitLine(`- ${line}`);
  }

  const selected = await prompts.select<RuntimeSystemdFilesystemAccess>(
    options.message ?? "Linux systemd filesystem access",
    [
      { name: "Hardened systemd sandbox (recommended)", value: "hardened" },
      { name: "Unrestricted systemd filesystem access (advanced)", value: "unrestricted" }
    ],
    current
  );

  if (selected !== "unrestricted" || current === "unrestricted") {
    return selected;
  }

  const confirmed = await prompts.confirm(
    "Unrestricted Linux systemd filesystem access removes OpenAssist's service-level filesystem sandbox and can allow real host-wide writes and package installs from full access sessions. Continue?",
    false
  );
  if (!confirmed) {
    emitLine("- Keeping hardened Linux systemd filesystem access.");
    return current;
  }

  return selected;
}
