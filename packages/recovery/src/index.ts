import type { RetryPolicy } from "@openassist/core-types";
import type { OpenAssistLogger } from "@openassist/observability";
import type { OpenAssistDatabase } from "@openassist/storage-sqlite";

export type RecoveryJobHandler = (payload: Record<string, unknown>) => Promise<void>;

export interface RecoveryWorkerOptions {
  db: OpenAssistDatabase;
  logger: OpenAssistLogger;
  handlers: Record<string, RecoveryJobHandler>;
  pollIntervalMs?: number;
  claimBatchSize?: number;
}

function backoffDelay(attempt: number): number {
  const base = 1000;
  const max = 60_000;
  return Math.min(max, base * 2 ** Math.max(0, attempt - 1));
}

export class RecoveryWorker {
  private readonly db: OpenAssistDatabase;
  private readonly logger: OpenAssistLogger;
  private readonly handlers: Record<string, RecoveryJobHandler>;
  private readonly pollIntervalMs: number;
  private readonly claimBatchSize: number;
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(options: RecoveryWorkerOptions) {
    this.db = options.db;
    this.logger = options.logger;
    this.handlers = options.handlers;
    this.pollIntervalMs = options.pollIntervalMs ?? 1000;
    this.claimBatchSize = options.claimBatchSize ?? 20;
  }

  start(): void {
    if (this.running) {
      return;
    }
    this.running = true;
    this.tick().catch((error: unknown) => {
      this.logger.error({ error }, "recovery tick failed");
    });
  }

  stop(): void {
    this.running = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private async tick(): Promise<void> {
    if (!this.running) {
      return;
    }

    const jobs = this.db.claimDueJobs(this.claimBatchSize);
    for (const job of jobs) {
      const handler = this.handlers[job.type];
      if (!handler) {
        this.db.markJobFailed(job.id, `No handler registered for job type ${job.type}`, 1_000);
        continue;
      }

      try {
        await handler(job.payload);
        this.db.markJobSucceeded(job.id);
      } catch (error: unknown) {
        const errorText = error instanceof Error ? error.message : String(error);
        const delay = backoffDelay(job.attempts + 1);
        this.db.markJobFailed(job.id, errorText, delay);
        this.logger.warn({ jobId: job.id, error: errorText, delay }, "job retry scheduled");
      }
    }

    this.timer = setTimeout(() => {
      this.tick().catch((error: unknown) => {
        this.logger.error({ error }, "recovery loop failed");
      });
    }, this.pollIntervalMs);
  }

  enqueue(type: string, payload: Record<string, unknown>, policy: RetryPolicy): number {
    return this.db.enqueueJob(type, payload, policy);
  }
}