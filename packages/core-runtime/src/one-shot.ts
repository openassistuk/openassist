import { createHash } from "node:crypto";
import { ChannelDeliveryRejected, ONE_SHOT_LIMITS, type OneShotOwner, type OneShotRequest, type OneShotTask, type OutboundEnvelope } from "@openassist/core-types";
import type { OneShotStore } from "@openassist/storage-sqlite";
import { renderOutboundEnvelope } from "./channel-rendering.js";
import { DateTime } from "luxon";

export function createOneShot(store: OneShotStore, owner: OneShotOwner, value: unknown, anchor: string, requestId: string, timezone: string, now = new Date().toISOString()): OneShotTask {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Reminder request must be an object.");
  const input = value as OneShotRequest;
  if (Object.keys(input).some(key => !["at","delaySeconds","action"].includes(key))) throw new Error("Reminder recipients come from the current actor and chat; unsupported request field.");
  if (!input.action || !["text","prompt"].includes(input.action.type)) throw new Error("Reminder action must be tagged text or prompt.");
  const content = input.action.type === "text" ? input.action.text : input.action.prompt;
  const field = input.action.type === "text" ? "text" : "prompt";
  if (Object.keys(input.action).some(key => !["type",field].includes(key)) || typeof content !== "string" || !content.trim() || content.length > ONE_SHOT_LIMITS.actionChars) throw new Error("Reminder action must contain 1–8000 characters.");
  if ((input.at !== undefined) === (input.delaySeconds !== undefined)) throw new Error("Specify exactly one of at or delaySeconds.");
  let deadline: number;
  if (input.at !== undefined) {
    if (typeof input.at !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?(?:Z|[+-]\d\d:\d\d)$/.test(input.at)) throw new Error("Absolute deadlines require an ISO timestamp with timezone offset.");
    deadline = DateTime.fromISO(input.at,{setZone:true}).toMillis();
  } else {
    if (typeof input.delaySeconds !== "number" || !Number.isFinite(input.delaySeconds) || input.delaySeconds <= 0 || input.delaySeconds > 315360000) throw new Error("delaySeconds must be positive and at most ten years.");
    deadline = Date.parse(anchor) + input.delaySeconds * 1000;
  }
  if (!Number.isFinite(deadline)) throw new Error("Invalid reminder deadline.");
  const scheduledFor = new Date(deadline).toISOString();
  const action = input.action.type === "text" ? { type: "text" as const, text: content } : { type: "prompt" as const, prompt: content };
  const requestKey = createHash("sha256").update(JSON.stringify([owner.channelId,owner.actorId,owner.conversationKey,requestId,input.at ?? input.delaySeconds,action])).digest("hex");
  return store.create({ ...owner, requestKey, scheduledFor, timezone, action, createdAt: now }, now);
}

export function oneShotReceipt(task: OneShotTask): Record<string, unknown> {
  return {
    id: task.id, scheduledFor: task.scheduledFor, timezone: task.timezone,
    actionType: task.action.type, state: task.state, note: task.note,
    timing: task.action.type === "prompt" ? "Generation begins at the deadline; delivery follows generation." : "Saved text is dispatched at the deadline without a model call."
  };
}

interface WorkerOptions {
  store: OneShotStore;
  enabled: () => boolean;
  intervalMs: () => number;
  authorize: (owner: OneShotOwner) => Promise<boolean>;
  available?: (owner: OneShotOwner) => Promise<boolean>;
  channelType: (id: string) => string;
  generate: (task: OneShotTask) => Promise<string>;
  send: (task: OneShotTask, envelope: OutboundEnvelope) => Promise<{ transportMessageId: string }>;
  now?: () => number;
}

async function bounded<T>(operation: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([operation, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("Scheduled operation timed out.")), ms); })]);
  } finally { clearTimeout(timer); }
}

export class OneShotWorker {
  private timer?: NodeJS.Timeout;
  private running = false;
  private readonly active = new Map<string, Promise<void>>();
  private readonly now: () => number;
  constructor(private readonly options: WorkerOptions) { this.now = options.now ?? (() => Date.now()); }

  start(): void {
    if (this.running) return;
    this.options.store.recover();
    this.running = true;
    this.schedule();
  }
  async stop(): Promise<void> {
    this.running = false;
    clearTimeout(this.timer);
    await Promise.allSettled(this.active.values());
  }
  private schedule(): void {
    this.timer = setTimeout(() => {
      void this.tick().catch(() => { /* Durable states are recovered on next start. */ });
      if (this.running) this.schedule();
    }, Math.max(100, this.options.intervalMs()));
  }
  async tick(): Promise<void> {
    if (!this.options.enabled()) return;
    const work: Promise<void>[] = [];
    for (const task of this.options.store.due(new Date(this.now()).toISOString())) {
      if (this.active.size >= ONE_SHOT_LIMITS.perTick) break;
      if (this.active.has(task.id)) continue;
      const pending = this.process(task).finally(() => { this.active.delete(task.id); });
      this.active.set(task.id,pending);
      work.push(pending);
    }
    await Promise.all(work);
  }
  private async process(task: OneShotTask): Promise<void> {
    const { store } = this.options;
      if (!await this.options.authorize(task)) {
        store.terminal(task.id,"failed","Approved full access or destination channel is no longer available.");
        return;
      }
      if (this.options.available && !await this.options.available(task)) return;
      if (task.state === "pending") {
        const started = this.now();
        if (!store.claim(task.id,new Date(started).toISOString())) return;
        try {
          let text = task.action.type === "text" ? task.action.text : await bounded(this.options.generate(task),120_000);
          if (!text.trim() || text.length > 32_000) throw new Error("Scheduled result exceeds output bounds.");
          const grace = Math.max(1000,2*this.options.intervalMs());
          if (started - Date.parse(task.scheduledFor) > grace) text += `\n\nDelayed reminder: originally scheduled for ${task.scheduledFor} (${task.timezone}); execution began ${new Date(started).toISOString()}.`;
          const parts = renderOutboundEnvelope({ channel: this.options.channelType(task.channelId), conversationKey: task.conversationKey,
            text, metadata: { source: "managed-one-shot", taskId: task.id, scheduledFor: task.scheduledFor } });
          if (!store.saveResult(task.id,parts)) return;
        } catch {
          store.failExecution(task.id,this.now());
          return;
        }
      }
      // One part per task per tick keeps dispatch bounded and allows cancellation between parts.
      const part = store.nextDelivery(task.id);
      if (!part) return;
      if (!await this.options.authorize(task)) {
        store.terminal(task.id,"failed","Authorization or channel availability changed before delivery.");
        return;
      }
      if (this.options.available && !await this.options.available(task)) return;
      if (!store.beginDelivery(task.id,part.part)) return;
      try {
        const receipt = await bounded(this.options.send(task,part.envelope),30_000);
        if (!receipt.transportMessageId) throw new Error("Transport omitted its receipt.");
        store.recordReceipt(task.id,part.part,receipt.transportMessageId.slice(0,1024));
      } catch (error) {
        if (error instanceof ChannelDeliveryRejected) store.rejectedDelivery(task.id,part.part,this.now());
        else store.terminal(task.id,"uncertain","Transport outcome unknown; inspect delivery before explicitly rescheduling. Automatic resend is disabled.");
      }
  }
}
