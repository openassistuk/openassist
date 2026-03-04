import { spawn } from "node:child_process";
import { promisify } from "node:util";
import { execFile as execFileCb } from "node:child_process";
import type { PolicyEngine } from "@openassist/core-types";
import { redactSensitiveData, type OpenAssistLogger } from "@openassist/observability";

const execFileAsync = promisify(execFileCb);

interface PackageManagerDefinition {
  id: string;
  command: string;
  buildArgs: (request: PackageInstallRequest) => string[];
  requiresElevation: (request: PackageInstallRequest) => boolean;
}

export interface PackageInstallRequest {
  sessionId: string;
  actorId: string;
  packages: string[];
  manager?: string;
  global?: boolean;
  dev?: boolean;
  extraArgs?: string[];
  useSudo?: boolean;
}

export interface PackageInstallResult {
  manager: string;
  command: string;
  args: string[];
  usedSudo: boolean;
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
}

export interface PackageToolOptions {
  policyEngine: PolicyEngine;
  logger: OpenAssistLogger;
  enabled?: boolean;
  preferStructuredInstall?: boolean;
  allowExecFallback?: boolean;
  sudoNonInteractive?: boolean;
  allowedManagers?: string[];
}

const MANAGERS: PackageManagerDefinition[] = [
  {
    id: "apt",
    command: "apt",
    buildArgs: (request) => ["install", "-y", ...request.packages, ...(request.extraArgs ?? [])],
    requiresElevation: () => true
  },
  {
    id: "apt-get",
    command: "apt-get",
    buildArgs: (request) => ["install", "-y", ...request.packages, ...(request.extraArgs ?? [])],
    requiresElevation: () => true
  },
  {
    id: "dnf",
    command: "dnf",
    buildArgs: (request) => ["install", "-y", ...request.packages, ...(request.extraArgs ?? [])],
    requiresElevation: () => true
  },
  {
    id: "yum",
    command: "yum",
    buildArgs: (request) => ["install", "-y", ...request.packages, ...(request.extraArgs ?? [])],
    requiresElevation: () => true
  },
  {
    id: "pacman",
    command: "pacman",
    buildArgs: (request) => ["-S", "--noconfirm", ...request.packages, ...(request.extraArgs ?? [])],
    requiresElevation: () => true
  },
  {
    id: "zypper",
    command: "zypper",
    buildArgs: (request) => ["install", "-y", ...request.packages, ...(request.extraArgs ?? [])],
    requiresElevation: () => true
  },
  {
    id: "brew",
    command: "brew",
    buildArgs: (request) => ["install", ...request.packages, ...(request.extraArgs ?? [])],
    requiresElevation: () => false
  },
  {
    id: "npm",
    command: "npm",
    buildArgs: (request) => [
      "install",
      ...(request.global ? ["-g"] : []),
      ...(request.dev ? ["--save-dev"] : []),
      ...request.packages,
      ...(request.extraArgs ?? [])
    ],
    requiresElevation: (request) => request.global === true
  },
  {
    id: "pnpm",
    command: "pnpm",
    buildArgs: (request) => [
      "add",
      ...(request.global ? ["-g"] : []),
      ...(request.dev ? ["-D"] : []),
      ...request.packages,
      ...(request.extraArgs ?? [])
    ],
    requiresElevation: (request) => request.global === true
  },
  {
    id: "yarn",
    command: "yarn",
    buildArgs: (request) =>
      request.global
        ? ["global", "add", ...request.packages, ...(request.extraArgs ?? [])]
        : ["add", ...(request.dev ? ["-D"] : []), ...request.packages, ...(request.extraArgs ?? [])],
    requiresElevation: (request) => request.global === true
  },
  {
    id: "pip",
    command: "pip",
    buildArgs: (request) => ["install", ...request.packages, ...(request.extraArgs ?? [])],
    requiresElevation: (request) => request.global === true
  },
  {
    id: "pip3",
    command: "pip3",
    buildArgs: (request) => ["install", ...request.packages, ...(request.extraArgs ?? [])],
    requiresElevation: (request) => request.global === true
  },
  {
    id: "uv",
    command: "uv",
    buildArgs: (request) => ["pip", "install", ...request.packages, ...(request.extraArgs ?? [])],
    requiresElevation: (request) => request.global === true
  },
  {
    id: "cargo",
    command: "cargo",
    buildArgs: (request) => ["install", ...request.packages, ...(request.extraArgs ?? [])],
    requiresElevation: () => false
  },
  {
    id: "go",
    command: "go",
    buildArgs: (request) => ["install", ...request.packages, ...(request.extraArgs ?? [])],
    requiresElevation: () => false
  }
];

function isUnsafeToken(value: string): boolean {
  return /[;&|`]/.test(value);
}

async function commandExists(command: string): Promise<boolean> {
  const child = spawn(command, ["--version"], { stdio: "ignore" });
  return await new Promise<boolean>((resolve) => {
    child.on("error", () => resolve(false));
    child.on("close", (code) => resolve(code === 0 || code === 1));
  });
}

export class PackageInstallTool {
  private readonly policyEngine: PolicyEngine;
  private readonly logger: OpenAssistLogger;
  private readonly enabled: boolean;
  private readonly preferStructuredInstall: boolean;
  private readonly allowExecFallback: boolean;
  private readonly sudoNonInteractive: boolean;
  private readonly allowedManagers: string[];

  constructor(options: PackageToolOptions) {
    this.policyEngine = options.policyEngine;
    this.logger = options.logger;
    this.enabled = options.enabled ?? true;
    this.preferStructuredInstall = options.preferStructuredInstall ?? true;
    this.allowExecFallback = options.allowExecFallback ?? true;
    this.sudoNonInteractive = options.sudoNonInteractive ?? true;
    this.allowedManagers = (options.allowedManagers ?? []).map((item) => item.toLowerCase());
  }

  private managerAllowed(managerId: string): boolean {
    if (this.allowedManagers.length === 0) {
      return true;
    }
    return this.allowedManagers.includes(managerId.toLowerCase());
  }

  private async resolveManager(preferred?: string): Promise<PackageManagerDefinition | null> {
    if (preferred) {
      const match = MANAGERS.find((item) => item.id === preferred.toLowerCase());
      if (!match) {
        return null;
      }
      if (!this.managerAllowed(match.id)) {
        return null;
      }
      if (await commandExists(match.command)) {
        return match;
      }
      return null;
    }

    const candidates = MANAGERS.filter((item) => this.managerAllowed(item.id));
    for (const manager of candidates) {
      if (await commandExists(manager.command)) {
        return manager;
      }
    }
    return null;
  }

  async install(request: PackageInstallRequest): Promise<PackageInstallResult> {
    if (!this.enabled) {
      throw new Error("pkg.install tool is disabled");
    }

    if (request.packages.length === 0) {
      throw new Error("pkg.install requires at least one package");
    }

    for (const item of request.packages) {
      if (isUnsafeToken(item)) {
        throw new Error(`pkg.install blocked unsafe package token: ${item}`);
      }
    }

    const decision = await this.policyEngine.authorize("pkg.install", {
      sessionId: request.sessionId,
      actorId: request.actorId,
      command: `pkg.install:${request.manager ?? "auto"}`
    });
    if (!decision.allowed) {
      throw new Error(decision.reason ?? "pkg.install blocked by policy");
    }

    const manager = await this.resolveManager(request.manager);
    if (!manager) {
      const fallbackHint = this.allowExecFallback
        ? " Use exec.run fallback for unsupported installers."
        : "";
      throw new Error(`No supported package manager found for pkg.install.${fallbackHint}`);
    }

    const managerArgs = manager.buildArgs(request);
    const managerNeedsElevation = manager.requiresElevation(request);
    const useSudo =
      (request.useSudo ?? this.sudoNonInteractive) &&
      managerNeedsElevation &&
      process.platform !== "win32";

    const command = useSudo ? "sudo" : manager.command;
    const args = useSudo ? ["-n", manager.command, ...managerArgs] : managerArgs;
    const startedAt = Date.now();

    try {
      const result = await execFileAsync(command, args, {
        windowsHide: true,
        maxBuffer: 20 * 1024 * 1024
      });
      const durationMs = Date.now() - startedAt;
      this.logger.info(
        redactSensitiveData({
          type: "audit.pkg.install",
          sessionId: request.sessionId,
          actorId: request.actorId,
          manager: manager.id,
          command,
          args,
          usedSudo: useSudo,
          exitCode: 0,
          durationMs
        }),
        "package install completed"
      );
      return {
        manager: manager.id,
        command,
        args,
        usedSudo: useSudo,
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: 0,
        durationMs
      };
    } catch (error: unknown) {
      const durationMs = Date.now() - startedAt;
      const err = error as Error & {
        code?: number;
        stdout?: string;
        stderr?: string;
      };
      const exitCode = typeof err.code === "number" ? err.code : 1;
      this.logger.warn(
        redactSensitiveData({
          type: "audit.pkg.install",
          sessionId: request.sessionId,
          actorId: request.actorId,
          manager: manager.id,
          command,
          args,
          usedSudo: useSudo,
          exitCode,
          durationMs,
          error: err.message
        }),
        "package install failed"
      );
      return {
        manager: manager.id,
        command,
        args,
        usedSudo: useSudo,
        stdout: err.stdout ?? "",
        stderr: err.stderr ?? err.message,
        exitCode,
        durationMs
      };
    }
  }

  getStatus(): {
    enabled: boolean;
    preferStructuredInstall: boolean;
    allowExecFallback: boolean;
    sudoNonInteractive: boolean;
    allowedManagers: string[];
  } {
    return {
      enabled: this.enabled,
      preferStructuredInstall: this.preferStructuredInstall,
      allowExecFallback: this.allowExecFallback,
      sudoNonInteractive: this.sudoNonInteractive,
      allowedManagers: this.allowedManagers
    };
  }
}
