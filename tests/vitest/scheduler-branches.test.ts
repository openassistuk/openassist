import { describe, expect, it, vi } from "vitest";
import type { RuntimeConfig, ScheduledTaskConfig } from "@openassist/core-types";
import { DateTime } from "luxon";
import {
  SchedulerWorker,
  applyMisfirePolicy,
  isValidTimezone,
  nextCronRun,
  nextIntervalRun,
  normalizeTimezone
} from "../../packages/core-runtime/src/scheduler.js";
import type { OpenAssistDatabase } from "@openassist/storage-sqlite";

interface TaskCursor {
  taskId: string;
  lastPlannedFor?: string;
  lastEnqueuedFor?: string;
  updatedAt: string;
}

function baseConfig(tasks: ScheduledTaskConfig[]): RuntimeConfig {
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
      requireTimezoneConfirmation: false
    },
    scheduler: {
      enabled: true,
      tickIntervalMs: 1_000,
      heartbeatIntervalSec: 30,
      defaultMisfirePolicy: "catch-up-once",
      tasks
    }
  };
}

function dbMock(cursor?: TaskCursor) {
  let localCursor = cursor;
  return {
    getTaskCursor: vi.fn((taskId: string) => {
      if (!localCursor || localCursor.taskId !== taskId) {
        return undefined;
      }
      return localCursor;
    }),
    upsertTaskCursor: vi.fn((taskId: string, values: { lastPlannedFor?: string; lastEnqueuedFor?: string }) => {
      localCursor = {
        taskId,
        lastPlannedFor: values.lastPlannedFor ?? localCursor?.lastPlannedFor,
        lastEnqueuedFor: values.lastEnqueuedFor ?? localCursor?.lastEnqueuedFor,
        updatedAt: new Date().toISOString()
      };
    }),
    insertSchedulerIdempotencyKey: vi.fn(() => true),
    updateModuleHealth: vi.fn(),
    countQueuedJobs: vi.fn(() => 0),
    getLatestScheduledRuns: vi.fn(() => [])
  };
}

describe("scheduler branch helpers", () => {
  it("covers timezone and next-run helper branches", () => {
    expect(isValidTimezone("UTC")).toBe(true);
    expect(isValidTimezone("Not/A_Timezone")).toBe(false);
    expect(normalizeTimezone("UTC")).toBe("UTC");

    const nextCron = nextCronRun("*/5 * * * * *", "2026-02-24T14:00:00.000Z", "UTC");
    expect(typeof nextCron).toBe("string");
    expect(nextCronRun("invalid", "2026-02-24T14:00:00.000Z", "UTC")).toBeUndefined();
    expect(nextCronRun("*/5 * * * * *", "not-iso", "UTC")).toBeUndefined();

    expect(nextIntervalRun(undefined, 30, "2026-02-24T14:00:00.000Z")).toBe("2026-02-24T14:00:00.000Z");
    expect(nextIntervalRun("2026-02-24T14:00:00.000Z", 30, "bad-now-iso")).toBeUndefined();
    expect(nextIntervalRun("bad-last-iso", 30, "2026-02-24T14:00:00.000Z")).toBe("2026-02-24T14:00:00.000Z");
    expect(applyMisfirePolicy("skip", [])).toEqual([]);

    const due = [
      DateTime.fromISO("2026-02-24T14:00:00.000Z"),
      DateTime.fromISO("2026-02-24T14:01:00.000Z")
    ];
    expect(applyMisfirePolicy("catch-up-once", due)).toHaveLength(1);
    expect(applyMisfirePolicy("backfill", due)).toHaveLength(2);
  });

  it("enqueues immediate interval run when cursor is missing and blocks manual run for disabled task", async () => {
    const enabledTask: ScheduledTaskConfig = {
      id: "interval-task",
      enabled: true,
      scheduleKind: "interval",
      intervalSec: 60,
      action: {
        type: "prompt",
        promptTemplate: "noop"
      }
    };
    const disabledTask: ScheduledTaskConfig = {
      id: "disabled-task",
      enabled: false,
      scheduleKind: "interval",
      intervalSec: 60,
      action: {
        type: "prompt",
        promptTemplate: "noop"
      }
    };
    const config = baseConfig([enabledTask, disabledTask]);
    const db = dbMock();
    const enqueued: Array<{ taskId: string; scheduledFor: string }> = [];
    const worker = new SchedulerWorker({
      db: db as unknown as OpenAssistDatabase,
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as any,
      getConfig: () => config,
      getEffectiveTimezone: () => "UTC",
      isTimezoneConfirmed: () => true,
      enqueueScheduledExecution: (payload) => enqueued.push(payload)
    });

    worker.start();
    await new Promise((resolve) => setTimeout(resolve, 35));
    worker.stop();

    expect(enqueued.some((item) => item.taskId === "interval-task")).toBe(true);
    expect(worker.enqueueManualRun("disabled-task")).toBe(false);
  });

  it("covers due-time empty branch for invalid interval and cron timezone warning branch", async () => {
    const invalidIntervalTask: ScheduledTaskConfig = {
      id: "invalid-interval",
      enabled: true,
      scheduleKind: "interval",
      intervalSec: 0,
      action: {
        type: "prompt",
        promptTemplate: "noop"
      }
    };
    const invalidTimezoneCronTask: ScheduledTaskConfig = {
      id: "invalid-cron-tz",
      enabled: true,
      scheduleKind: "cron",
      cron: "*/10 * * * * *",
      timezone: "Not/A_Timezone",
      action: {
        type: "prompt",
        promptTemplate: "noop"
      }
    };

    const config = baseConfig([invalidIntervalTask, invalidTimezoneCronTask]);
    const db = dbMock({
      taskId: "invalid-cron-tz",
      lastEnqueuedFor: new Date(Date.now() - 60_000).toISOString(),
      lastPlannedFor: new Date(Date.now() - 60_000).toISOString(),
      updatedAt: new Date().toISOString()
    });
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const worker = new SchedulerWorker({
      db: db as unknown as OpenAssistDatabase,
      logger: logger as any,
      getConfig: () => config,
      getEffectiveTimezone: () => "UTC",
      isTimezoneConfirmed: () => true,
      enqueueScheduledExecution: vi.fn()
    });

    worker.start();
    await new Promise((resolve) => setTimeout(resolve, 40));
    worker.stop();

    expect(db.upsertTaskCursor).toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalled();
  });
});
