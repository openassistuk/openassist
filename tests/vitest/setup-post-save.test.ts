import { describe, expect, it } from "vitest";
import type { RunCommandResult, RunCommandOptions } from "../../apps/openassist-cli/src/lib/command-runner.js";
import type { ServiceManagerKind } from "../../apps/openassist-cli/src/lib/install-state.js";
import type { ServiceInstallOptions, ServiceManagerAdapter } from "../../apps/openassist-cli/src/lib/service-manager.js";
import type { PromptAdapter, PromptChoice } from "../../apps/openassist-cli/src/lib/setup-wizard.js";
import { runSetupWizardPostSaveChecks } from "../../apps/openassist-cli/src/lib/setup-post-save.js";

class PromptStub implements PromptAdapter {
  private readonly confirmQueue: boolean[];
  private readonly selectQueue: string[];

  constructor(confirmAnswers: boolean[], selectAnswers: string[] = []) {
    this.confirmQueue = [...confirmAnswers];
    this.selectQueue = [...selectAnswers];
  }

  async input(): Promise<string> {
    return "";
  }

  async password(): Promise<string> {
    return "";
  }

  async confirm(): Promise<boolean> {
    if (this.confirmQueue.length === 0) {
      throw new Error("No confirm answers queued");
    }
    return this.confirmQueue.shift() ?? false;
  }

  async select<T extends string>(_message: string, _choices: PromptChoice<T>[], _initial?: T): Promise<T> {
    if (this.selectQueue.length === 0) {
      throw new Error("No select answers queued");
    }
    return this.selectQueue.shift() as T;
  }
}

class FakeServiceManager implements ServiceManagerAdapter {
  readonly kind: ServiceManagerKind = "systemd-user";
  installed: boolean;
  installCalls = 0;
  restartCalls = 0;
  lastInstallOptions?: ServiceInstallOptions;

  constructor(installed: boolean) {
    this.installed = installed;
  }

  async install(options: ServiceInstallOptions): Promise<void> {
    this.installed = true;
    this.installCalls += 1;
    this.lastInstallOptions = options;
  }

  async uninstall(): Promise<void> {}

  async start(): Promise<void> {}

  async stop(): Promise<void> {}

  async restart(): Promise<void> {
    this.restartCalls += 1;
  }

  async status(): Promise<void> {}

  async logs(_lines: number, _follow: boolean): Promise<void> {}

  async enable(): Promise<void> {}

  async disable(): Promise<void> {}

  async isInstalled(): Promise<boolean> {
    return this.installed;
  }
}

class RunnerStub {
  async run(_command: string, _args?: string[], _options?: RunCommandOptions): Promise<RunCommandResult> {
    return {
      code: 0,
      stdout: "",
      stderr: ""
    };
  }

  async runStreaming(_command: string, _args?: string[], _options?: RunCommandOptions): Promise<number> {
    return 0;
  }
}

describe("setup wizard post-save checks", () => {
  it("installs missing service and runs health/time/scheduler checks", async () => {
    const service = new FakeServiceManager(false);
    const prompts = new PromptStub([true]);
    const requests: string[] = [];

    const result = await runSetupWizardPostSaveChecks(
      {
        installDir: "/tmp/openassist",
        configPath: "/tmp/openassist/openassist.toml",
        envFilePath: "/tmp/openassistd.env",
        baseUrl: "http://127.0.0.1:3344",
        systemdFilesystemAccess: "unrestricted"
      },
      prompts,
      {
        runner: new RunnerStub(),
        createServiceManagerFn: () => service,
        waitForHealthyFn: async () => ({
          ok: true,
          status: 200,
          bodyText: "{\"status\":\"ok\"}"
        }),
        requestJsonFn: async (method, url) => {
          requests.push(`${method} ${url}`);
          return {
            status: 200,
            data: {
              ok: true
            }
          };
        }
      }
    );

    expect(result.completed).toBe(true);
    expect(result.serviceInstalled).toBe(true);
    expect(result.serviceRestarted).toBe(true);
    expect(service.installCalls).toBe(1);
    expect(service.restartCalls).toBe(1);
    expect(service.lastInstallOptions?.systemdFilesystemAccess).toBe("unrestricted");
    expect(requests).toContain("GET http://127.0.0.1:3344/v1/time/status");
    expect(requests).toContain("GET http://127.0.0.1:3344/v1/scheduler/status");
  });

  it("returns skipped outcome when service install is declined", async () => {
    const service = new FakeServiceManager(false);
    const prompts = new PromptStub([false]);

    const result = await runSetupWizardPostSaveChecks(
      {
        installDir: "/tmp/openassist",
        configPath: "/tmp/openassist/openassist.toml",
        envFilePath: "/tmp/openassistd.env",
        baseUrl: "http://127.0.0.1:3344"
      },
      prompts,
      {
        runner: new RunnerStub(),
        createServiceManagerFn: () => service
      }
    );

    expect(result.completed).toBe(false);
    expect(result.reason).toBe("service-not-installed");
    expect(result.serviceInstalled).toBe(false);
    expect(service.installCalls).toBe(0);
    expect(service.restartCalls).toBe(0);
  });

  it("supports retry and then succeeds after transient health failure", async () => {
    const service = new FakeServiceManager(true);
    const prompts = new PromptStub([], ["retry"]);
    let healthChecks = 0;

    const result = await runSetupWizardPostSaveChecks(
      {
        installDir: "/tmp/openassist",
        configPath: "/tmp/openassist/openassist.toml",
        envFilePath: "/tmp/openassistd.env",
        baseUrl: "http://127.0.0.1:3344"
      },
      prompts,
      {
        runner: new RunnerStub(),
        createServiceManagerFn: () => service,
        waitForHealthyFn: async () => {
          healthChecks += 1;
          if (healthChecks === 1) {
            return {
              ok: false,
              status: 503,
              bodyText: "service unavailable"
            };
          }
          return {
            ok: true,
            status: 200,
            bodyText: "{\"status\":\"ok\"}"
          };
        },
        requestJsonFn: async () => ({
          status: 200,
          data: { ok: true }
        })
      }
    );

    expect(result.completed).toBe(true);
    expect(result.postCheckAttempts).toBe(2);
    expect(service.installCalls).toBe(1);
    expect(service.restartCalls).toBe(2);
  });

  it("returns skipped outcome when post-save checks fail and operator skips", async () => {
    const service = new FakeServiceManager(true);
    const prompts = new PromptStub([], ["skip"]);

    const result = await runSetupWizardPostSaveChecks(
      {
        installDir: "/tmp/openassist",
        configPath: "/tmp/openassist/openassist.toml",
        envFilePath: "/tmp/openassistd.env",
        baseUrl: "http://127.0.0.1:3344"
      },
      prompts,
      {
        runner: new RunnerStub(),
        createServiceManagerFn: () => service,
        waitForHealthyFn: async () => ({
          ok: false,
          status: 503,
          bodyText: "service unavailable"
        })
      }
    );

    expect(result.completed).toBe(false);
    expect(result.reason).toBe("post-checks-skipped");
    expect(result.lastError).toMatch(/daemon health check failed/i);
  });

  it("returns aborted outcome when post-save checks fail and operator aborts", async () => {
    const service = new FakeServiceManager(true);
    const prompts = new PromptStub([], ["abort"]);

    const result = await runSetupWizardPostSaveChecks(
      {
        installDir: "/tmp/openassist",
        configPath: "/tmp/openassist/openassist.toml",
        envFilePath: "/tmp/openassistd.env",
        baseUrl: "http://127.0.0.1:3344"
      },
      prompts,
      {
        runner: new RunnerStub(),
        createServiceManagerFn: () => service,
        waitForHealthyFn: async () => ({
          ok: false,
          status: 503,
          bodyText: "service unavailable"
        })
      }
    );

    expect(result.completed).toBe(false);
    expect(result.reason).toBe("post-checks-aborted");
    expect(result.lastError).toMatch(/daemon health check failed/i);
  });

  it("returns skipped outcome when service manager is unsupported", async () => {
    const prompts = new PromptStub([]);

    const result = await runSetupWizardPostSaveChecks(
      {
        installDir: "/tmp/openassist",
        configPath: "/tmp/openassist/openassist.toml",
        envFilePath: "/tmp/openassistd.env",
        baseUrl: "http://127.0.0.1:3344"
      },
      prompts,
      {
        runner: new RunnerStub(),
        createServiceManagerFn: () => {
          throw new Error("Unsupported platform for service management: win32");
        }
      }
    );

    expect(result.completed).toBe(false);
    expect(result.reason).toBe("service-manager-unsupported");
    expect(result.serviceInstalled).toBe(false);
    expect(result.serviceRestarted).toBe(false);
  });
});
