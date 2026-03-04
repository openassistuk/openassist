import { afterEach, describe, expect, it, vi } from "vitest";
import type { RuntimeConfig } from "@openassist/core-types";
import {
  ClockHealthMonitor,
  detectSystemTimezoneCandidate,
  evaluateClockHealth,
  validateTimezone
} from "../../packages/core-runtime/src/clock-health.js";
import type { OpenAssistDatabase } from "@openassist/storage-sqlite";

function buildRuntimeConfig(): RuntimeConfig {
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
      ntpPolicy: "off",
      ntpCheckIntervalSec: 300,
      ntpMaxSkewMs: 10_000,
      ntpHttpSources: [],
      requireTimezoneConfirmation: true
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

function createDbMock() {
  let latest:
    | {
        id: number;
        checkedAt: string;
        status: "healthy" | "degraded" | "unhealthy";
        source?: string;
        offsetMs?: number;
      }
    | undefined;
  const healthUpdates: Array<{ module: string; status: string; message?: string }> = [];

  return {
    getLatestClockCheck: vi.fn(() => latest),
    insertClockCheck: vi.fn((status: "healthy" | "degraded" | "unhealthy", source?: string, offsetMs?: number) => {
      latest = {
        id: 1,
        checkedAt: new Date().toISOString(),
        status,
        source,
        offsetMs
      };
    }),
    updateModuleHealth: vi.fn((module: string, status: string, message?: string) => {
      healthUpdates.push({ module, status, message });
    }),
    healthUpdates
  };
}

describe("clock-health", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("returns healthy when policy is off", async () => {
    const result = await evaluateClockHealth("off", [], 10_000);
    expect(result.status).toBe("healthy");
    expect(result.source).toBe("disabled");
  });

  it("uses http-date median when available", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      return new Response("", {
        status: 200,
        headers: {
          date: new Date(Date.now() + 250).toUTCString()
        }
      });
    }));

    const result = await evaluateClockHealth("warn-degrade", ["https://example.invalid"], 10_000);
    expect(result.status).toBe("healthy");
    expect(result.source).toBe("http-date-median");
    expect(typeof result.offsetMs).toBe("number");
  });

  it("returns degraded when median skew exceeds threshold", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      return new Response("", {
        status: 200,
        headers: {
          date: new Date(Date.now() + 60_000).toUTCString()
        }
      });
    }));

    const result = await evaluateClockHealth("warn-degrade", ["https://example.invalid"], 10);
    expect(result.status).toBe("degraded");
    expect(result.source).toBe("http-date-median");
  });

  it("returns unhealthy when no trustworthy source exists", async () => {
    vi.spyOn(process, "platform", "get").mockReturnValue("win32");
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("network down");
    }));

    const result = await evaluateClockHealth("warn-degrade", ["https://example.invalid"], 10_000);
    expect(result.status).toBe("unhealthy");
  });

  it("tracks latest status and timezone confirmation in monitor", async () => {
    const db = createDbMock();
    const config = buildRuntimeConfig();
    const monitor = new ClockHealthMonitor({
      db: db as unknown as OpenAssistDatabase,
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as any,
      getConfig: () => config,
      getEffectiveTimezone: () => "UTC",
      isTimezoneConfirmed: () => false
    });

    const result = await monitor.ensureStartupCheck();
    const status = monitor.getTimeStatus();

    expect(result.status).toBe("healthy");
    expect(status.timezone).toBe("UTC");
    expect(status.timezoneConfirmed).toBe(false);
    expect(status.clockHealth).toBe("healthy");
    expect(db.updateModuleHealth).toHaveBeenCalledWith(
      "time-sync",
      "degraded",
      "timezone confirmation required"
    );
  });

  it("starts/stops monitor timer and updates status when timezone is confirmed", async () => {
    const db = createDbMock();
    const config = buildRuntimeConfig();
    const monitor = new ClockHealthMonitor({
      db: db as unknown as OpenAssistDatabase,
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as any,
      getConfig: () => ({
        ...config,
        time: {
          ...config.time,
          ntpCheckIntervalSec: 1
        }
      }),
      getEffectiveTimezone: () => "UTC",
      isTimezoneConfirmed: () => true
    });

    await monitor.start();
    const status = monitor.getTimeStatus();
    monitor.stop();

    expect(status.clockHealth).toBe("healthy");
    expect(db.updateModuleHealth).toHaveBeenCalledWith(
      "time-sync",
      "healthy",
      "clock check: disabled"
    );
  });

  it("validates timezone values", () => {
    expect(validateTimezone("UTC")).toBe(true);
    expect(validateTimezone("Not/A_Timezone")).toBe(false);
    expect(detectSystemTimezoneCandidate().length).toBeGreaterThan(0);
  });
});
