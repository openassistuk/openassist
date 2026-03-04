import { afterEach, describe, expect, it, vi } from "vitest";
import type { RuntimeConfig } from "@openassist/core-types";
import type { OpenAssistDatabase } from "@openassist/storage-sqlite";

interface ClockHealthModule {
  evaluateClockHealth: (
    policy: RuntimeConfig["time"]["ntpPolicy"],
    ntpHttpSources: string[],
    ntpMaxSkewMs: number
  ) => Promise<{
    status: "healthy" | "degraded" | "unhealthy";
    source?: string;
    offsetMs?: number;
    details?: Record<string, unknown>;
  }>;
  ClockHealthMonitor: new (options: {
    db: OpenAssistDatabase;
    logger: { info: (...args: unknown[]) => void; warn: (...args: unknown[]) => void; error: (...args: unknown[]) => void };
    getConfig: () => RuntimeConfig;
    getEffectiveTimezone: () => string;
    isTimezoneConfirmed: () => boolean;
  }) => {
    start(): Promise<void>;
    stop(): void;
  };
}

function runtimeConfig(policy: RuntimeConfig["time"]["ntpPolicy"]): RuntimeConfig {
  return {
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
      defaultTimezone: "UTC",
      ntpPolicy: policy,
      ntpCheckIntervalSec: 300,
      ntpMaxSkewMs: 10_000,
      ntpHttpSources: ["https://example.invalid"],
      requireTimezoneConfirmation: false
    },
    scheduler: {
      enabled: true,
      tickIntervalMs: 1_000,
      heartbeatIntervalSec: 30,
      defaultMisfirePolicy: "catch-up-once",
      tasks: []
    }
  };
}

async function importClockHealth(execFileMock: (...args: any[]) => void): Promise<ClockHealthModule> {
  vi.resetModules();
  vi.doMock("node:child_process", () => ({
    execFile: execFileMock
  }));
  return import("../../packages/core-runtime/src/clock-health.js") as Promise<ClockHealthModule>;
}

describe("clock-health branches", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("falls back to linux os check when HTTP sources fail", async () => {
    vi.spyOn(process, "platform", "get").mockReturnValue("linux");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      })
    );

    const module = await importClockHealth((file: string, args: string[], callback: (error: Error | null, result?: { stdout: string; stderr: string }) => void) => {
      expect(file).toBe("timedatectl");
      expect(args).toEqual(["show", "-p", "NTPSynchronized", "--value"]);
      callback(null, { stdout: "yes\n", stderr: "" });
    });

    const result = await module.evaluateClockHealth("warn-degrade", ["https://example.invalid"], 10_000);
    expect(result.status).toBe("healthy");
    expect(result.source).toBe("timedatectl");
  });

  it("returns unhealthy when darwin os check reports network time off", async () => {
    vi.spyOn(process, "platform", "get").mockReturnValue("darwin");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      })
    );

    const module = await importClockHealth((file: string, args: string[], callback: (error: Error | null, result?: { stdout: string; stderr: string }) => void) => {
      expect(file).toBe("systemsetup");
      expect(args).toEqual(["-getusingnetworktime"]);
      callback(null, { stdout: "Network Time: Off\n", stderr: "" });
    });

    const result = await module.evaluateClockHealth("warn-degrade", ["https://example.invalid"], 10_000);
    expect(result.status).toBe("unhealthy");
    expect(result.source).toBe("systemsetup");
  });

  it("skips immediate re-check when latest clock check is fresh", async () => {
    const insertClockCheck = vi.fn();
    const db = {
      getLatestClockCheck: vi.fn(() => ({
        id: 42,
        checkedAt: new Date().toISOString(),
        status: "healthy" as const,
        source: "disabled",
        offsetMs: 0
      })),
      insertClockCheck,
      updateModuleHealth: vi.fn()
    };
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

    const module = await importClockHealth((_file: string, _args: string[], callback: (error: Error | null, result?: { stdout: string; stderr: string }) => void) => {
      callback(null, { stdout: "yes\n", stderr: "" });
    });

    const monitor = new module.ClockHealthMonitor({
      db: db as unknown as OpenAssistDatabase,
      logger,
      getConfig: () => runtimeConfig("off"),
      getEffectiveTimezone: () => "UTC",
      isTimezoneConfirmed: () => true
    });

    await monitor.start();
    monitor.stop();

    expect(insertClockCheck).not.toHaveBeenCalled();
  });
});
