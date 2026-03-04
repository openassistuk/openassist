import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { RunCommandOptions, RunCommandResult } from "../../apps/openassist-cli/src/lib/command-runner.js";
import type { ServiceManagerAdapter } from "../../apps/openassist-cli/src/lib/service-manager.js";
import type { PromptAdapter, PromptChoice } from "../../apps/openassist-cli/src/lib/setup-wizard.js";
import { runSetupWizardPostSaveChecks } from "../../apps/openassist-cli/src/lib/setup-post-save.js";

const noopAsync = async (..._args: unknown[]): Promise<void> => {
  // no-op for stubs
};

const runnerStub = {
  async run(_command: string, _args?: string[], _options?: RunCommandOptions): Promise<RunCommandResult> {
    return {
      code: 0,
      stdout: "",
      stderr: ""
    };
  },
  async runStreaming(_command: string, _args?: string[], _options?: RunCommandOptions): Promise<number> {
    return 0;
  }
};

function createPromptStub(confirmAnswers: boolean[], selectAnswers: string[] = []): PromptAdapter {
  const confirmQueue = [...confirmAnswers];
  const selectQueue = [...selectAnswers];
  return {
    input: async () => "",
    password: async () => "",
    async confirm(): Promise<boolean> {
      if (confirmQueue.length === 0) {
        throw new Error("No confirm answers queued");
      }
      return confirmQueue.shift() ?? false;
    },
    async select<T extends string>(_message: string, _choices: PromptChoice<T>[], _initial?: T): Promise<T> {
      if (selectQueue.length === 0) {
        throw new Error("No select answers queued");
      }
      return selectQueue.shift() as T;
    }
  };
}

function createServiceStub(initialInstalled: boolean, counters?: { installCalls: number; restartCalls: number }): ServiceManagerAdapter {
  let installed = initialInstalled;
  return {
    kind: "systemd-user",
    async install(): Promise<void> {
      installed = true;
      if (counters) {
        counters.installCalls += 1;
      }
    },
    uninstall: noopAsync as ServiceManagerAdapter["uninstall"],
    start: noopAsync as ServiceManagerAdapter["start"],
    stop: noopAsync as ServiceManagerAdapter["stop"],
    async restart(): Promise<void> {
      if (counters) {
        counters.restartCalls += 1;
      }
    },
    status: noopAsync as ServiceManagerAdapter["status"],
    logs: noopAsync as ServiceManagerAdapter["logs"],
    enable: noopAsync as ServiceManagerAdapter["enable"],
    disable: noopAsync as ServiceManagerAdapter["disable"],
    async isInstalled(): Promise<boolean> {
      return installed;
    }
  };
}

describe("cli setup post-save recovery coverage", () => {
  it("installs missing service and completes checks", async () => {
    const counters = { installCalls: 0, restartCalls: 0 };
    const service = createServiceStub(false, counters);
    const prompts = createPromptStub([true]);
    const result = await runSetupWizardPostSaveChecks(
      {
        installDir: "/tmp/openassist",
        configPath: "/tmp/openassist/openassist.toml",
        envFilePath: "/tmp/openassistd.env",
        baseUrl: "http://127.0.0.1:3344"
      },
      prompts,
      {
        runner: runnerStub,
        createServiceManagerFn: () => service,
        waitForHealthyFn: async () => ({
          ok: true,
          status: 200,
          bodyText: "{\"status\":\"ok\"}"
        }),
        requestJsonFn: async () => ({
          status: 200,
          data: { ok: true }
        })
      }
    );

    assert.equal(result.completed, true);
    assert.equal(result.serviceInstalled, true);
    assert.equal(result.serviceRestarted, true);
    assert.equal(result.postCheckAttempts, 1);
    assert.equal(counters.installCalls, 1);
    assert.equal(counters.restartCalls, 1);
  });

  it("returns service-not-installed when install is declined", async () => {
    const service = createServiceStub(false);
    const prompts = createPromptStub([false]);
    const result = await runSetupWizardPostSaveChecks(
      {
        installDir: "/tmp/openassist",
        configPath: "/tmp/openassist/openassist.toml",
        envFilePath: "/tmp/openassistd.env",
        baseUrl: "http://127.0.0.1:3344"
      },
      prompts,
      {
        runner: runnerStub,
        createServiceManagerFn: () => service
      }
    );

    assert.equal(result.completed, false);
    assert.equal(result.reason, "service-not-installed");
    assert.equal(result.serviceInstalled, false);
  });

  it("supports skip and abort recovery branches after failed checks", async () => {
    const service = createServiceStub(true);
    const skipResult = await runSetupWizardPostSaveChecks(
      {
        installDir: "/tmp/openassist",
        configPath: "/tmp/openassist/openassist.toml",
        envFilePath: "/tmp/openassistd.env",
        baseUrl: "http://127.0.0.1:3344"
      },
      createPromptStub([], ["skip"]),
      {
        runner: runnerStub,
        createServiceManagerFn: () => service,
        waitForHealthyFn: async () => ({
          ok: false,
          status: 503,
          bodyText: "service unavailable"
        })
      }
    );
    assert.equal(skipResult.completed, false);
    assert.equal(skipResult.reason, "post-checks-skipped");
    assert.match(skipResult.lastError ?? "", /daemon health check failed/i);

    const abortResult = await runSetupWizardPostSaveChecks(
      {
        installDir: "/tmp/openassist",
        configPath: "/tmp/openassist/openassist.toml",
        envFilePath: "/tmp/openassistd.env",
        baseUrl: "http://127.0.0.1:3344"
      },
      createPromptStub([], ["abort"]),
      {
        runner: runnerStub,
        createServiceManagerFn: () => service,
        waitForHealthyFn: async () => ({
          ok: false,
          status: 503,
          bodyText: "service unavailable"
        })
      }
    );
    assert.equal(abortResult.completed, false);
    assert.equal(abortResult.reason, "post-checks-aborted");
    assert.match(abortResult.lastError ?? "", /daemon health check failed/i);
  });

  it("returns unsupported-platform outcome from service manager factory", async () => {
    const result = await runSetupWizardPostSaveChecks(
      {
        installDir: "/tmp/openassist",
        configPath: "/tmp/openassist/openassist.toml",
        envFilePath: "/tmp/openassistd.env",
        baseUrl: "http://127.0.0.1:3344"
      },
      createPromptStub([]),
      {
        runner: runnerStub,
        createServiceManagerFn: () => {
          throw new Error("Unsupported platform for service management: win32");
        }
      }
    );

    assert.equal(result.completed, false);
    assert.equal(result.reason, "service-manager-unsupported");
  });

  it("covers stub helper branches", async () => {
    const prompt = createPromptStub([true], ["retry"]);
    assert.equal(await prompt.confirm(), true);
    assert.equal(await prompt.select("pick", [{ name: "retry", value: "retry" }]), "retry");

    const service = createServiceStub(true);
    await service.uninstall();
    await service.start();
    await service.stop();
    await service.status();
    await service.logs(10, false);
    await service.enable();
    await service.disable();
    assert.equal(await service.isInstalled(), true);
  });
});
