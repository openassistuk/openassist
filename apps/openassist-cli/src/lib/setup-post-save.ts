import type { CommandRunner } from "./command-runner.js";
import { SpawnCommandRunner } from "./command-runner.js";
import {
  deriveHealthProbeBaseUrls,
  type HealthResult,
  waitForHealthy
} from "./health-check.js";
import type { ServiceManagerKind } from "./install-state.js";
import { serviceHealthRecoveryLines } from "./lifecycle-readiness.js";
import { requestJson } from "./runtime-context.js";
import { createServiceManager, type ServiceManagerAdapter } from "./service-manager.js";
import type { PromptAdapter } from "./setup-wizard.js";

export interface SetupWizardPostSaveOptions {
  installDir: string;
  configPath: string;
  envFilePath: string;
  baseUrl: string;
}

export interface SetupWizardPostSaveOutcome {
  completed: boolean;
  reason?:
    | "service-not-installed"
    | "service-manager-unsupported"
    | "post-checks-skipped"
    | "post-checks-aborted";
  serviceManager?: ServiceManagerKind;
  serviceInstalled: boolean;
  serviceRestarted: boolean;
  health: HealthResult;
  timeStatus?: unknown;
  schedulerStatus?: unknown;
  postCheckAttempts?: number;
  lastError?: string;
}

export interface SetupWizardPostSaveDependencies {
  runner?: CommandRunner;
  createServiceManagerFn?: (runner: CommandRunner) => ServiceManagerAdapter;
  waitForHealthyFn?: typeof waitForHealthy;
  requestJsonFn?: typeof requestJson;
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

export async function runSetupWizardPostSaveChecks(
  options: SetupWizardPostSaveOptions,
  prompts: PromptAdapter,
  dependencies: SetupWizardPostSaveDependencies = {}
): Promise<SetupWizardPostSaveOutcome> {
  const runner = dependencies.runner ?? new SpawnCommandRunner();
  const serviceFactory = dependencies.createServiceManagerFn ?? createServiceManager;
  const waitForHealthyFn = dependencies.waitForHealthyFn ?? waitForHealthy;
  const requestJsonFn = dependencies.requestJsonFn ?? requestJson;
  let service: ServiceManagerAdapter;
  try {
    service = serviceFactory(runner);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("Unsupported platform for service management")) {
      return {
        completed: false,
        reason: "service-manager-unsupported",
        serviceInstalled: false,
        serviceRestarted: false,
        health: {
          ok: false,
          status: 0,
          bodyText: ""
        }
      };
    }
    throw error;
  }

  const normalizedBaseUrl = normalizeBaseUrl(options.baseUrl);
  const healthProbeUrls = deriveHealthProbeBaseUrls(normalizedBaseUrl);
  let serviceInstalled = await service.isInstalled();
  let serviceRestarted = false;

  if (!serviceInstalled) {
    const shouldInstall = await prompts.confirm(
      `OpenAssist service (${service.kind}) is not installed. Install now?`,
      true
    );
    if (!shouldInstall) {
      return {
        completed: false,
        reason: "service-not-installed",
        serviceManager: service.kind,
        serviceInstalled: false,
        serviceRestarted: false,
        health: {
          ok: false,
          status: 0,
          bodyText: ""
        }
      };
    }

    await service.install({
      installDir: options.installDir,
      configPath: options.configPath,
      envFilePath: options.envFilePath,
      repoRoot: options.installDir
    });
    serviceInstalled = true;
  }

  const troubleshootingLines = serviceHealthRecoveryLines(normalizedBaseUrl);

  let attempts = 0;
  while (true) {
    attempts += 1;
    try {
      await service.restart();
      serviceRestarted = true;

      console.log(`Waiting for daemon health (up to 60s) via: ${healthProbeUrls.join(", ")}`);
      let lastProgressLog = 0;
      const health = await waitForHealthyFn(healthProbeUrls, 60_000, 2_000, (_result, attempt) => {
        if (attempt - lastProgressLog >= 5) {
          lastProgressLog = attempt;
          console.log(`Health check retry ${attempt}...`);
        }
      });
      if (!health.ok) {
        throw new Error(
          `Service restart finished but daemon health check failed (baseUrl=${health.baseUrl ?? normalizedBaseUrl}, status=${health.status}, body=${health.bodyText}).`
        );
      }

      const timeStatus = await requestJsonFn("GET", `${normalizedBaseUrl}/v1/time/status`);
      if (timeStatus.status >= 400) {
        throw new Error(`Time status check failed after setup save (status=${timeStatus.status}).`);
      }

      const schedulerStatus = await requestJsonFn("GET", `${normalizedBaseUrl}/v1/scheduler/status`);
      if (schedulerStatus.status >= 400) {
        throw new Error(`Scheduler status check failed after setup save (status=${schedulerStatus.status}).`);
      }

      return {
        completed: true,
        serviceManager: service.kind,
        serviceInstalled,
        serviceRestarted,
        health,
        timeStatus: timeStatus.data,
        schedulerStatus: schedulerStatus.data,
        postCheckAttempts: attempts
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Post-save checks failed (attempt ${attempts}): ${message}`);
      for (const line of troubleshootingLines) {
        console.error(`- ${line}`);
      }

      const action = await prompts.select<"retry" | "skip" | "abort">(
        "Post-save checks failed. Choose next step",
        [
          { name: "Retry checks", value: "retry" },
          { name: "Continue without passing post-save checks", value: "skip" },
          { name: "Abort checks", value: "abort" }
        ],
        "retry"
      );
      if (action === "retry") {
        continue;
      }
      if (action === "skip") {
        return {
          completed: false,
          reason: "post-checks-skipped",
          serviceManager: service.kind,
          serviceInstalled,
          serviceRestarted,
          health: {
            ok: false,
            status: 0,
            bodyText: ""
          },
          postCheckAttempts: attempts,
          lastError: message
        };
      }
      return {
        completed: false,
        reason: "post-checks-aborted",
        serviceManager: service.kind,
        serviceInstalled,
        serviceRestarted,
        health: {
          ok: false,
          status: 0,
          bodyText: ""
        },
        postCheckAttempts: attempts,
        lastError: message
      };
    }
  }
}
