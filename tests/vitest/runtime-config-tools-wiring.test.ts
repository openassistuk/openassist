import { describe, expect, it } from "vitest";
import { parseConfig, toRuntimeConfig } from "../../packages/config/src/schema.js";

describe("runtime config tools wiring", () => {
  it("passes tools and security blocks into runtime config", () => {
    const parsed = parseConfig({
      runtime: {
        bindAddress: "127.0.0.1",
        bindPort: 3344,
        defaultProviderId: "openai-main",
        providers: [
          {
            id: "openai-main",
            type: "openai",
            defaultModel: "gpt-5.2"
          }
        ],
        channels: [],
        defaultPolicyProfile: "operator",
        paths: {
          dataDir: ".openassist/data",
          skillsDir: "examples/skills",
          logsDir: ".openassist/logs"
        },
        time: {
          ntpPolicy: "off",
          ntpCheckIntervalSec: 300,
          ntpMaxSkewMs: 10_000,
          ntpHttpSources: [],
          requireTimezoneConfirmation: false
        },
        scheduler: {
          enabled: false,
          tickIntervalMs: 1000,
          heartbeatIntervalSec: 30,
          defaultMisfirePolicy: "catch-up-once",
          tasks: []
        }
      },
      tools: {
        fs: {
          workspaceOnly: false,
          allowedReadPaths: ["/tmp"],
          allowedWritePaths: ["/tmp"]
        },
        exec: {
          defaultTimeoutMs: 45_000,
          guardrails: {
            mode: "strict",
            extraBlockedPatterns: ["dangerous"]
          }
        },
        pkg: {
          enabled: false,
          preferStructuredInstall: true,
          allowExecFallback: true,
          sudoNonInteractive: true,
          allowedManagers: ["npm"]
        }
      },
      security: {
        auditLogEnabled: true,
        secretsBackend: "encrypted-file"
      }
    });

    const runtimeConfig = toRuntimeConfig(parsed);
    expect(runtimeConfig.tools?.fs.workspaceOnly).toBe(false);
    expect(runtimeConfig.tools?.exec.defaultTimeoutMs).toBe(45_000);
    expect(runtimeConfig.tools?.exec.guardrails.mode).toBe("strict");
    expect(runtimeConfig.tools?.pkg.enabled).toBe(false);
    expect(runtimeConfig.security?.auditLogEnabled).toBe(true);
  });
});
