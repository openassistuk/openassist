import { execFile as execFileCb } from "node:child_process";
import os from "node:os";
import { promisify } from "node:util";
import type { NtpPolicy, RuntimeConfig, TimeStatus } from "@openassist/core-types";
import type { OpenAssistLogger } from "@openassist/observability";
import type { ClockCheckRecord, OpenAssistDatabase } from "@openassist/storage-sqlite";

const execFile = promisify(execFileCb);

function isValidIanaTimezone(value: string): boolean {
  try {
    Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export function detectSystemTimezoneCandidate(): string {
  const detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (detected && isValidIanaTimezone(detected)) {
    return detected;
  }
  return "UTC";
}

export interface ClockCheckResult {
  status: "healthy" | "degraded" | "unhealthy";
  source?: string;
  offsetMs?: number;
  details?: Record<string, unknown>;
}

async function checkLocalNtpSync(): Promise<{
  ok: boolean;
  source: string;
  details: Record<string, unknown>;
}> {
  const platform = process.platform;
  if (platform === "linux") {
    try {
      const { stdout } = await execFile("timedatectl", ["show", "-p", "NTPSynchronized", "--value"]);
      const synced = stdout.trim().toLowerCase() === "yes";
      return {
        ok: synced,
        source: "timedatectl",
        details: {
          os: platform,
          raw: stdout.trim()
        }
      };
    } catch (error) {
      return {
        ok: false,
        source: "timedatectl",
        details: {
          os: platform,
          error: error instanceof Error ? error.message : String(error)
        }
      };
    }
  }

  if (platform === "darwin") {
    try {
      const { stdout } = await execFile("systemsetup", ["-getusingnetworktime"]);
      const value = stdout.trim().toLowerCase();
      const synced = value.includes("on");
      return {
        ok: synced,
        source: "systemsetup",
        details: {
          os: platform,
          raw: stdout.trim()
        }
      };
    } catch (error) {
      return {
        ok: false,
        source: "systemsetup",
        details: {
          os: platform,
          error: error instanceof Error ? error.message : String(error)
        }
      };
    }
  }

  return {
    ok: false,
    source: "os-check-unsupported",
    details: {
      os: platform
    }
  };
}

async function checkHttpDateOffset(url: string): Promise<number> {
  const startedAt = Date.now();
  const response = await fetch(url, {
    method: "HEAD",
    redirect: "follow"
  });
  const endedAt = Date.now();

  const dateHeader = response.headers.get("date");
  if (!dateHeader) {
    throw new Error(`No Date header from ${url}`);
  }

  const remoteMs = Date.parse(dateHeader);
  if (Number.isNaN(remoteMs)) {
    throw new Error(`Invalid Date header from ${url}: ${dateHeader}`);
  }

  // Approximate local clock at response midpoint to reduce network-latency skew.
  const midpoint = Math.round((startedAt + endedAt) / 2);
  return remoteMs - midpoint;
}

function median(values: number[]): number | undefined {
  if (values.length === 0) {
    return undefined;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[mid];
  }
  return Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

export interface ClockHealthMonitorOptions {
  db: OpenAssistDatabase;
  logger: OpenAssistLogger;
  getConfig: () => RuntimeConfig;
  getEffectiveTimezone: () => string;
  isTimezoneConfirmed: () => boolean;
}

export class ClockHealthMonitor {
  private readonly db: OpenAssistDatabase;
  private readonly logger: OpenAssistLogger;
  private readonly getConfig: () => RuntimeConfig;
  private readonly getEffectiveTimezone: () => string;
  private readonly isTimezoneConfirmed: () => boolean;
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private latest?: ClockCheckRecord;

  constructor(options: ClockHealthMonitorOptions) {
    this.db = options.db;
    this.logger = options.logger;
    this.getConfig = options.getConfig;
    this.getEffectiveTimezone = options.getEffectiveTimezone;
    this.isTimezoneConfirmed = options.isTimezoneConfirmed;
    this.latest = this.db.getLatestClockCheck() ?? undefined;
  }

  async start(): Promise<void> {
    if (this.running) {
      return;
    }
    this.running = true;
    const latestAgeMs =
      this.latest?.checkedAt ? Date.now() - Date.parse(this.latest.checkedAt) : Number.POSITIVE_INFINITY;
    if (!Number.isFinite(latestAgeMs) || latestAgeMs > 1000) {
      await this.runCheck();
    }
    this.scheduleNext();
  }

  stop(): void {
    this.running = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  getLatestCheck(): ClockCheckRecord | undefined {
    return this.latest;
  }

  getTimeStatus(): TimeStatus {
    const config = this.getConfig();
    const latest = this.latest;
    return {
      timezone: this.getEffectiveTimezone(),
      timezoneConfirmed: this.isTimezoneConfirmed(),
      clockHealth: latest?.status ?? "degraded",
      lastClockCheckAt: latest?.checkedAt,
      lastClockOffsetMs: latest?.offsetMs,
      lastClockCheckSource: latest?.source,
      ntpPolicy: config.time.ntpPolicy
    };
  }

  async ensureStartupCheck(): Promise<ClockCheckResult> {
    return this.runCheck();
  }

  private scheduleNext(): void {
    if (!this.running) {
      return;
    }
    const seconds = this.getConfig().time.ntpCheckIntervalSec;
    this.timer = setTimeout(() => {
      this.runCheck()
        .catch((error) => {
          this.logger.error({ error }, "clock health check failed");
        })
        .finally(() => {
          this.scheduleNext();
        });
    }, Math.max(1, seconds) * 1000);
  }

  private async runCheck(): Promise<ClockCheckResult> {
    const config = this.getConfig();
    const result = await evaluateClockHealth(config.time.ntpPolicy, config.time.ntpHttpSources, config.time.ntpMaxSkewMs);

    this.db.insertClockCheck(result.status, result.source, result.offsetMs, result.details);
    this.latest = this.db.getLatestClockCheck() ?? undefined;

    const tzConfirmed = this.isTimezoneConfirmed();
    if (config.time.requireTimezoneConfirmation && !tzConfirmed) {
      this.db.updateModuleHealth("time-sync", "degraded", "timezone confirmation required");
    } else {
      this.db.updateModuleHealth(
        "time-sync",
        result.status === "healthy" ? "healthy" : result.status === "degraded" ? "degraded" : "unhealthy",
        result.source ? `clock check: ${result.source}` : "clock check"
      );
    }

    this.logger.info(
      {
        type: "clock.check",
        hostname: os.hostname(),
        status: result.status,
        source: result.source,
        offsetMs: result.offsetMs
      },
      "clock health checked"
    );

    return result;
  }
}

export async function evaluateClockHealth(
  policy: NtpPolicy,
  ntpHttpSources: string[],
  ntpMaxSkewMs: number
): Promise<ClockCheckResult> {
  if (policy === "off") {
    return {
      status: "healthy",
      source: "disabled",
      details: {
        policy
      }
    };
  }

  const osCheck = await checkLocalNtpSync();
  const offsets: number[] = [];
  const sourceFailures: Array<{ source: string; error: string }> = [];

  for (const source of ntpHttpSources) {
    try {
      const offset = await checkHttpDateOffset(source);
      offsets.push(offset);
    } catch (error) {
      sourceFailures.push({
        source,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  const medianOffset = median(offsets);

  if (typeof medianOffset === "number") {
    const absOffset = Math.abs(medianOffset);
    const within = absOffset <= ntpMaxSkewMs;
    return {
      status: within ? "healthy" : "degraded",
      source: "http-date-median",
      offsetMs: medianOffset,
      details: {
        osCheck,
        sourceFailures,
        successfulSources: offsets.length,
        ntpMaxSkewMs
      }
    };
  }

  if (osCheck.ok) {
    return {
      status: "healthy",
      source: osCheck.source,
      details: {
        osCheck,
        sourceFailures
      }
    };
  }

  return {
    status: "unhealthy",
    source: osCheck.source,
    details: {
      osCheck,
      sourceFailures,
      reason: "no trustworthy clock source"
    }
  };
}

export function validateTimezone(tz: string): boolean {
  return isValidIanaTimezone(tz);
}
