import { describe, expect, it, vi } from "vitest";
import type { RuntimeConfig, ScheduledTaskConfig } from "@openassist/core-types";
import {
  SchedulerWorker,
  applyMisfirePolicy,
  nextCronRun,
  nextIntervalRun
} from "../../packages/core-runtime/src/scheduler.js";
import type { OpenAssistDatabase } from "@openassist/storage-sqlite";
import { DateTime } from "luxon";

interface TaskCursor {
  taskId: string;
  lastPlannedFor?: string;
  lastEnqueuedFor?: string;
  updatedAt: string;
}

function baseRuntimeConfig(task: ScheduledTaskConfig): RuntimeConfig {
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
      heartbeatIntervalSec: 1,
      defaultMisfirePolicy: "catch-up-once",
      tasks: [task]
    }
  };
}

function createDbMock(overrides: {
  taskCursor?: TaskCursor;
  latestRuns?: Array<{
    id: number;
    taskId: string;
    scheduledFor: string;
    startedAt: string;
    finishedAt?: string;
    status: "running" | "succeeded" | "failed";
  }>;
} = {}) {
  const keys = new Set<string>();
  let cursor = overrides.taskCursor;
  const moduleHealth: Array<{ module: string; status: string; message?: string }> = [];
  const runs = overrides.latestRuns ?? [];

  return {
    moduleHealth,
    getTaskCursor: vi.fn((taskId: string) => {
      if (!cursor || cursor.taskId !== taskId) {
        return undefined;
      }
      return cursor;
    }),
    upsertTaskCursor: vi.fn((taskId: string, values: { lastPlannedFor?: string; lastEnqueuedFor?: string }) => {
      cursor = {
        taskId,
        lastPlannedFor: values.lastPlannedFor ?? cursor?.lastPlannedFor,
        lastEnqueuedFor: values.lastEnqueuedFor ?? cursor?.lastEnqueuedFor,
        updatedAt: new Date().toISOString()
      };
    }),
    insertSchedulerIdempotencyKey: vi.fn((taskId: string, scheduledFor: string) => {
      const key = `${taskId}:${scheduledFor}`;
      if (keys.has(key)) {
        return false;
      }
      keys.add(key);
      return true;
    }),
    updateModuleHealth: vi.fn((module: string, status: string, message?: string) => {
      moduleHealth.push({ module, status, message });
    }),
    countQueuedJobs: vi.fn(() => 0),
    getLatestScheduledRuns: vi.fn((limit: number, taskId?: string) => {
      if (!taskId) {
        return runs.slice(0, limit);
      }
      return runs.filter((run) => run.taskId === taskId).slice(0, limit);
    })
  };
}

describe("scheduler-worker", () => {
  it("applies misfire policies predictably", () => {
    const due = [
      DateTime.fromISO("2026-02-23T10:00:00.000Z"),
      DateTime.fromISO("2026-02-23T10:05:00.000Z"),
      DateTime.fromISO("2026-02-23T10:10:00.000Z")
    ];
    expect(applyMisfirePolicy("skip", due)).toEqual([]);
    expect(applyMisfirePolicy("catch-up-once", due)).toHaveLength(1);
    expect(applyMisfirePolicy("backfill", due)).toHaveLength(3);
  });

  it("blocks when scheduler is disabled", async () => {
    const config = baseRuntimeConfig({
      id: "disabled-task",
      enabled: true,
      scheduleKind: "interval",
      intervalSec: 60,
      action: {
        type: "prompt",
        promptTemplate: "noop"
      }
    });
    config.scheduler.enabled = false;

    const db = createDbMock();
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
    await new Promise((resolve) => setTimeout(resolve, 30));
    worker.stop();

    expect(worker.getStatus().blockedReason).toBe("scheduler disabled in config");
    expect(enqueued).toHaveLength(0);
    expect(db.updateModuleHealth).toHaveBeenCalled();
  });

  it("blocks when timezone confirmation is required and missing", async () => {
    const config = baseRuntimeConfig({
      id: "tz-task",
      enabled: true,
      scheduleKind: "interval",
      intervalSec: 60,
      action: {
        type: "prompt",
        promptTemplate: "noop"
      }
    });
    config.time.requireTimezoneConfirmation = true;

    const db = createDbMock();
    const worker = new SchedulerWorker({
      db: db as unknown as OpenAssistDatabase,
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as any,
      getConfig: () => config,
      getEffectiveTimezone: () => "UTC",
      isTimezoneConfirmed: () => false,
      enqueueScheduledExecution: vi.fn()
    });

    worker.start();
    await new Promise((resolve) => setTimeout(resolve, 30));
    worker.stop();

    expect(worker.getStatus().blockedReason).toBe("timezone confirmation required");
  });

  it("enqueues due interval tasks and reports task statuses", async () => {
    const nowMinus = new Date(Date.now() - 10 * 60 * 1_000).toISOString();
    const task: ScheduledTaskConfig = {
      id: "ops-summary",
      enabled: true,
      scheduleKind: "interval",
      intervalSec: 60,
      action: {
        type: "prompt",
        promptTemplate: "Summarize ops."
      }
    };
    const config = baseRuntimeConfig(task);

    const db = createDbMock({
      taskCursor: {
        taskId: task.id,
        lastEnqueuedFor: nowMinus,
        lastPlannedFor: nowMinus,
        updatedAt: nowMinus
      },
      latestRuns: [
        {
          id: 7,
          taskId: task.id,
          scheduledFor: nowMinus,
          startedAt: nowMinus,
          status: "succeeded"
        }
      ]
    });
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
    await new Promise((resolve) => setTimeout(resolve, 30));
    worker.stop();

    expect(enqueued.length).toBeGreaterThan(0);
    const statuses = worker.listTaskStatuses();
    expect(statuses).toHaveLength(1);
    expect(statuses[0]?.lastRun?.id).toBe(7);
    expect(statuses[0]?.nextRunAt).toBeTruthy();
    expect(worker.enqueueManualRun("missing-task")).toBe(false);
  });

  it("handles invalid cron schedules without enqueueing", async () => {
    const task: ScheduledTaskConfig = {
      id: "invalid-cron-task",
      enabled: true,
      scheduleKind: "cron",
      cron: "this is invalid",
      action: {
        type: "prompt",
        promptTemplate: "noop"
      }
    };
    const config = baseRuntimeConfig(task);
    const db = createDbMock({
      taskCursor: {
        taskId: task.id,
        lastEnqueuedFor: new Date(Date.now() - 60_000).toISOString(),
        lastPlannedFor: new Date(Date.now() - 60_000).toISOString(),
        updatedAt: new Date().toISOString()
      }
    });
    const enqueued: Array<{ taskId: string; scheduledFor: string }> = [];
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const worker = new SchedulerWorker({
      db: db as unknown as OpenAssistDatabase,
      logger: logger as any,
      getConfig: () => config,
      getEffectiveTimezone: () => "UTC",
      isTimezoneConfirmed: () => true,
      enqueueScheduledExecution: (payload) => enqueued.push(payload)
    });

    worker.start();
    await new Promise((resolve) => setTimeout(resolve, 40));
    worker.stop();

    expect(enqueued).toHaveLength(0);
    expect(logger.warn).toHaveBeenCalled();
  });

  it("returns false for manual run when idempotency rejects duplicate", () => {
    const task: ScheduledTaskConfig = {
      id: "manual-task",
      enabled: true,
      scheduleKind: "interval",
      intervalSec: 60,
      action: {
        type: "prompt",
        promptTemplate: "noop"
      }
    };
    const config = baseRuntimeConfig(task);
    const db = createDbMock();
    db.insertSchedulerIdempotencyKey.mockReturnValue(false);

    const worker = new SchedulerWorker({
      db: db as unknown as OpenAssistDatabase,
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as any,
      getConfig: () => config,
      getEffectiveTimezone: () => "UTC",
      isTimezoneConfirmed: () => true,
      enqueueScheduledExecution: vi.fn()
    });

    expect(worker.enqueueManualRun("manual-task")).toBe(false);
  });

  it("covers helper edge cases for interval and cron", () => {
    expect(nextIntervalRun("2026-02-23T10:00:00.000Z", 0)).toBeUndefined();
    expect(nextIntervalRun("not-an-iso", 60, "2026-02-23T10:00:00.000Z")).toBe("2026-02-23T10:00:00.000Z");
    expect(nextCronRun("*/5 * * * * *", "not-an-iso", "UTC")).toBeUndefined();
  });

  it("respects skip misfire policy by not enqueueing missed windows", async () => {
    const nowMinus = new Date(Date.now() - 10 * 60 * 1_000).toISOString();
    const task: ScheduledTaskConfig = {
      id: "skip-task",
      enabled: true,
      scheduleKind: "interval",
      intervalSec: 60,
      misfirePolicy: "skip",
      action: {
        type: "prompt",
        promptTemplate: "noop"
      }
    };
    const config = baseRuntimeConfig(task);
    const db = createDbMock({
      taskCursor: {
        taskId: task.id,
        lastEnqueuedFor: nowMinus,
        lastPlannedFor: nowMinus,
        updatedAt: nowMinus
      }
    });
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

    expect(enqueued).toHaveLength(0);
    expect(db.upsertTaskCursor).toHaveBeenCalled();
  });
});
