import { CronExpressionParser } from "cron-parser";
import { DateTime } from "luxon";
import type {
  MisfirePolicy,
  RuntimeConfig,
  ScheduledTaskConfig
} from "@openassist/core-types";
import type { OpenAssistLogger } from "@openassist/observability";
import type { OpenAssistDatabase } from "@openassist/storage-sqlite";

export interface ScheduledEnqueuePayload {
  taskId: string;
  scheduledFor: string;
}

export interface SchedulerWorkerStatus {
  running: boolean;
  blockedReason?: string;
  lastTickAt?: string;
  lastHeartbeatAt?: string;
  enqueuedInLastTick: number;
}

export interface SchedulerTaskStatus {
  id: string;
  enabled: boolean;
  scheduleKind: "cron" | "interval";
  timezone: string;
  misfirePolicy: MisfirePolicy;
  nextRunAt?: string;
  lastRun?: {
    id: number;
    scheduledFor: string;
    startedAt: string;
    finishedAt?: string;
    status: "running" | "succeeded" | "failed";
  };
}

export interface SchedulerWorkerOptions {
  db: OpenAssistDatabase;
  logger: OpenAssistLogger;
  getConfig: () => RuntimeConfig;
  getEffectiveTimezone: () => string;
  isTimezoneConfirmed: () => boolean;
  enqueueScheduledExecution: (payload: ScheduledEnqueuePayload) => void;
}

const MAX_BACKFILL_PER_TICK = 100;

function isTimeAfterOrEqual(lhs: DateTime, rhs: DateTime): boolean {
  return lhs.toMillis() >= rhs.toMillis();
}

export class SchedulerWorker {
  private readonly db: OpenAssistDatabase;
  private readonly logger: OpenAssistLogger;
  private readonly getConfig: () => RuntimeConfig;
  private readonly getEffectiveTimezone: () => string;
  private readonly isTimezoneConfirmed: () => boolean;
  private readonly enqueueScheduledExecution: (payload: ScheduledEnqueuePayload) => void;
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private lastTickAt?: string;
  private lastHeartbeatAt?: string;
  private blockedReason?: string;
  private enqueuedInLastTick = 0;

  constructor(options: SchedulerWorkerOptions) {
    this.db = options.db;
    this.logger = options.logger;
    this.getConfig = options.getConfig;
    this.getEffectiveTimezone = options.getEffectiveTimezone;
    this.isTimezoneConfirmed = options.isTimezoneConfirmed;
    this.enqueueScheduledExecution = options.enqueueScheduledExecution;
  }

  start(): void {
    if (this.running) {
      return;
    }
    this.running = true;
    this.tick().catch((error) => {
      this.logger.error({ error }, "scheduler tick failed");
    });
  }

  stop(): void {
    this.running = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.db.updateModuleHealth("scheduler", "unhealthy", "stopped");
  }

  getStatus(): SchedulerWorkerStatus {
    return {
      running: this.running,
      blockedReason: this.blockedReason,
      lastTickAt: this.lastTickAt,
      lastHeartbeatAt: this.lastHeartbeatAt,
      enqueuedInLastTick: this.enqueuedInLastTick
    };
  }

  enqueueManualRun(taskId: string): boolean {
    const task = this.getConfig().scheduler.tasks.find((candidate) => candidate.id === taskId);
    if (!task || !task.enabled) {
      return false;
    }

    const scheduledFor = new Date().toISOString();
    if (!this.db.insertSchedulerIdempotencyKey(taskId, scheduledFor)) {
      return false;
    }

    this.enqueueScheduledExecution({ taskId, scheduledFor });
    return true;
  }

  listTaskStatuses(): SchedulerTaskStatus[] {
    const config = this.getConfig();
    return config.scheduler.tasks.map((task) => {
      const tz = this.resolveTaskTimezone(task);
      const nextRunAt = this.computeNextRun(task, tz);
      const lastRun = this.db.getLatestScheduledRuns(1, task.id)[0];
      return {
        id: task.id,
        enabled: task.enabled,
        scheduleKind: task.scheduleKind,
        timezone: tz,
        misfirePolicy: task.misfirePolicy ?? config.scheduler.defaultMisfirePolicy,
        nextRunAt,
        lastRun: lastRun
          ? {
              id: lastRun.id,
              scheduledFor: lastRun.scheduledFor,
              startedAt: lastRun.startedAt,
              finishedAt: lastRun.finishedAt,
              status: lastRun.status
            }
          : undefined
      };
    });
  }

  private scheduleNextTick(): void {
    if (!this.running) {
      return;
    }
    const delay = Math.max(100, this.getConfig().scheduler.tickIntervalMs);
    this.timer = setTimeout(() => {
      this.tick().catch((error) => {
        this.logger.error({ error }, "scheduler tick failed");
      });
    }, delay);
  }

  private async tick(): Promise<void> {
    if (!this.running) {
      return;
    }

    const config = this.getConfig();
    if (!config.scheduler.enabled) {
      this.blockedReason = "scheduler disabled in config";
      this.db.updateModuleHealth("scheduler", "degraded", this.blockedReason);
      this.lastTickAt = new Date().toISOString();
      this.enqueuedInLastTick = 0;
      this.scheduleNextTick();
      return;
    }

    if (config.time.requireTimezoneConfirmation && !this.isTimezoneConfirmed()) {
      this.blockedReason = "timezone confirmation required";
      this.db.updateModuleHealth("scheduler", "degraded", this.blockedReason);
      this.lastTickAt = new Date().toISOString();
      this.enqueuedInLastTick = 0;
      this.scheduleNextTick();
      return;
    }

    this.blockedReason = undefined;
    const nowUtc = DateTime.utc();
    let enqueuedCount = 0;

    for (const task of config.scheduler.tasks) {
      if (!task.enabled) {
        continue;
      }

      const cursor = this.db.getTaskCursor(task.id);
      const dueTimes = this.computeDueTimes(task, nowUtc, cursor?.lastEnqueuedFor);
      if (dueTimes.length === 0) {
        this.db.upsertTaskCursor(task.id, {
          lastPlannedFor: nowUtc.toISO() ?? new Date().toISOString()
        });
        continue;
      }

      const policy = task.misfirePolicy ?? config.scheduler.defaultMisfirePolicy;
      const selected = applyMisfirePolicy(policy, dueTimes);

      if (selected.length === 0) {
        const latestDue = dueTimes[dueTimes.length - 1];
        this.db.upsertTaskCursor(task.id, {
          lastPlannedFor: nowUtc.toISO() ?? new Date().toISOString(),
          lastEnqueuedFor: latestDue.toUTC().toISO() ?? latestDue.toJSDate().toISOString()
        });
        continue;
      }

      for (const due of selected) {
        const scheduledFor = due.toUTC().toISO() ?? due.toJSDate().toISOString();
        const accepted = this.db.insertSchedulerIdempotencyKey(task.id, scheduledFor);
        if (!accepted) {
          continue;
        }

        this.enqueueScheduledExecution({
          taskId: task.id,
          scheduledFor
        });
        enqueuedCount += 1;

        this.logger.info(
          {
            type: "scheduler.enqueue",
            taskId: task.id,
            scheduledFor,
            scheduleKind: task.scheduleKind,
            policy
          },
          "scheduled task enqueued"
        );
      }

      const latestSelected = selected[selected.length - 1];
      this.db.upsertTaskCursor(task.id, {
        lastPlannedFor: nowUtc.toISO() ?? new Date().toISOString(),
        lastEnqueuedFor: latestSelected.toUTC().toISO() ?? latestSelected.toJSDate().toISOString()
      });
    }

    this.enqueuedInLastTick = enqueuedCount;
    this.lastTickAt = nowUtc.toISO() ?? new Date().toISOString();

    const heartbeatEveryMs = config.scheduler.heartbeatIntervalSec * 1000;
    const heartbeatDue =
      !this.lastHeartbeatAt ||
      Date.now() - Date.parse(this.lastHeartbeatAt) >= Math.max(1000, heartbeatEveryMs);

    if (heartbeatDue) {
      const activeTasks = config.scheduler.tasks.filter((task) => task.enabled).length;
      const pendingJobs = this.db.countQueuedJobs();
      const message = `running activeTasks=${activeTasks} pendingJobs=${pendingJobs} enqueued=${enqueuedCount}`;
      this.db.updateModuleHealth("scheduler", "healthy", message);
      this.lastHeartbeatAt = new Date().toISOString();

      this.logger.info(
        {
          type: "scheduler.tick",
          activeTasks,
          pendingJobs,
          enqueuedInTick: enqueuedCount
        },
        "scheduler heartbeat"
      );
    }

    this.scheduleNextTick();
  }

  private resolveTaskTimezone(task: ScheduledTaskConfig): string {
    return task.timezone ?? this.getEffectiveTimezone();
  }

  private computeDueTimes(
    task: ScheduledTaskConfig,
    nowUtc: DateTime,
    lastEnqueuedFor?: string
  ): DateTime[] {
    if (task.scheduleKind === "interval") {
      const intervalSec = task.intervalSec ?? 0;
      if (intervalSec <= 0) {
        return [];
      }

      if (!lastEnqueuedFor) {
        return [nowUtc];
      }

      const last = DateTime.fromISO(lastEnqueuedFor, { zone: "utc" });
      if (!last.isValid) {
        return [nowUtc];
      }

      const dueTimes: DateTime[] = [];
      let next = last.plus({ seconds: intervalSec });
      while (isTimeAfterOrEqual(nowUtc, next) && dueTimes.length < MAX_BACKFILL_PER_TICK) {
        dueTimes.push(next);
        next = next.plus({ seconds: intervalSec });
      }
      return dueTimes;
    }

    const cron = task.cron;
    if (!cron) {
      return [];
    }

    const tz = this.resolveTaskTimezone(task);
    const baseUtc = lastEnqueuedFor
      ? DateTime.fromISO(lastEnqueuedFor, { zone: "utc" })
      : nowUtc.minus({ seconds: 1 });
    const base = baseUtc.isValid ? baseUtc : nowUtc.minus({ seconds: 1 });

    try {
      const expression = CronExpressionParser.parse(cron, {
        currentDate: base.toJSDate(),
        tz
      });

      const dueTimes: DateTime[] = [];
      for (let i = 0; i < MAX_BACKFILL_PER_TICK; i += 1) {
        const next = DateTime.fromJSDate(expression.next().toDate(), { zone: tz }).toUTC();
        if (next.toMillis() > nowUtc.toMillis()) {
          break;
        }
        dueTimes.push(next);
      }
      return dueTimes;
    } catch (error) {
      this.logger.warn(
        {
          taskId: task.id,
          cron,
          timezone: tz,
          error: error instanceof Error ? error.message : String(error)
        },
        "invalid cron expression for scheduled task"
      );
      return [];
    }
  }

  private computeNextRun(task: ScheduledTaskConfig, timezone: string): string | undefined {
    const nowUtc = DateTime.utc();
    if (!task.enabled) {
      return undefined;
    }

    if (task.scheduleKind === "interval") {
      const intervalSec = task.intervalSec ?? 0;
      if (intervalSec <= 0) {
        return undefined;
      }

      const cursor = this.db.getTaskCursor(task.id);
      return nextIntervalRun(cursor?.lastEnqueuedFor, intervalSec, nowUtc.toISO() ?? undefined);
    }

    if (!task.cron) {
      return undefined;
    }

    return nextCronRun(task.cron, nowUtc.toISO() ?? undefined, timezone);
  }
}

export function applyMisfirePolicy(
  policy: MisfirePolicy,
  dueTimes: DateTime[]
): DateTime[] {
  if (dueTimes.length === 0) {
    return [];
  }

  if (policy === "skip") {
    return [];
  }

  if (policy === "catch-up-once") {
    return [dueTimes[dueTimes.length - 1]];
  }

  return dueTimes.slice(0, MAX_BACKFILL_PER_TICK);
}

export function isValidTimezone(value: string): boolean {
  try {
    const dt = DateTime.now().setZone(value);
    return dt.isValid;
  } catch {
    return false;
  }
}

export function normalizeTimezone(value: string): string {
  return DateTime.now().setZone(value).zoneName ?? value;
}

export function nextCronRun(
  cronExpression: string,
  currentIso: string | undefined,
  timezone: string
): string | undefined {
  try {
    const current = currentIso ? DateTime.fromISO(currentIso, { zone: "utc" }) : DateTime.utc();
    if (!current.isValid) {
      return undefined;
    }
    const expression = CronExpressionParser.parse(cronExpression, {
      currentDate: current.toJSDate(),
      tz: timezone
    });
    return DateTime.fromJSDate(expression.next().toDate(), { zone: timezone }).toUTC().toISO() ?? undefined;
  } catch {
    return undefined;
  }
}

export function nextIntervalRun(
  lastEnqueuedFor: string | undefined,
  intervalSec: number,
  nowIso?: string
): string | undefined {
  if (intervalSec <= 0) {
    return undefined;
  }
  const now = nowIso ? DateTime.fromISO(nowIso, { zone: "utc" }) : DateTime.utc();
  if (!now.isValid) {
    return undefined;
  }

  if (!lastEnqueuedFor) {
    return now.toISO() ?? undefined;
  }

  const last = DateTime.fromISO(lastEnqueuedFor, { zone: "utc" });
  if (!last.isValid) {
    return now.toISO() ?? undefined;
  }
  return last.plus({ seconds: intervalSec }).toUTC().toISO() ?? undefined;
}
