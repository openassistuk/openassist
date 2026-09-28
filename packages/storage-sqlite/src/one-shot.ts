import type { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { ONE_SHOT_LIMITS, type OneShotOwner, type OneShotTask, type OutboundEnvelope } from "@openassist/core-types";

const ACTIVE = "'pending','executing','ready','delivering'";
type Row = Record<string, unknown>;
function task(row: Row): OneShotTask {
  return {
    id: String(row.id), requestKey: String(row.request_key), actorId: String(row.actor_id),
    channelId: String(row.channel_id), conversationKey: String(row.conversation_key),
    scheduledFor: String(row.scheduled_for), timezone: String(row.timezone),
    action: JSON.parse(String(row.action)), state: row.state as OneShotTask["state"],
    createdAt: String(row.created_at), startedAt: row.started_at ? String(row.started_at) : undefined,
    attempts: Number(row.attempts), runAfter: String(row.run_after), note: row.note ? String(row.note) : undefined
  };
}

/** Additive format: old applications retain these tables without processing them. */
export class OneShotStore {
  constructor(private readonly db: DatabaseSync) {
    db.exec(`CREATE TABLE IF NOT EXISTS managed_one_shots (
      id TEXT PRIMARY KEY, request_key TEXT NOT NULL UNIQUE, actor_id TEXT NOT NULL,
      channel_id TEXT NOT NULL, conversation_key TEXT NOT NULL, scheduled_for TEXT NOT NULL,
      timezone TEXT NOT NULL, action TEXT NOT NULL, state TEXT NOT NULL, created_at TEXT NOT NULL,
      started_at TEXT, attempts INTEGER NOT NULL DEFAULT 0, run_after TEXT NOT NULL, note TEXT,
      cancel_requested INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS managed_one_shots_due ON managed_one_shots(state,run_after);
    CREATE TABLE IF NOT EXISTS managed_one_shot_deliveries (
      task_id TEXT NOT NULL REFERENCES managed_one_shots(id), part INTEGER NOT NULL,
      envelope TEXT NOT NULL, state TEXT NOT NULL, receipt TEXT, attempts INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(task_id,part)
    );`);
  }

  private transaction<T>(fn: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try { const value = fn(); this.db.exec("COMMIT"); return value; }
    catch (error) { this.db.exec("ROLLBACK"); throw error; }
  }

  get(id: string): OneShotTask | undefined {
    const row = this.db.prepare("SELECT * FROM managed_one_shots WHERE id=?").get(id);
    return row ? task(row) : undefined;
  }

  create(input: Omit<OneShotTask, "id" | "state" | "attempts" | "runAfter">, now: string): OneShotTask {
    return this.transaction(() => {
      const existing = this.db.prepare("SELECT * FROM managed_one_shots WHERE request_key=?").get(input.requestKey);
      if (existing) return task(existing);
      if (Date.parse(input.scheduledFor) <= Date.parse(now)) throw new Error("The original deadline has already passed and cannot be met. Choose a new deadline explicitly.");
      const counts = this.db.prepare(`SELECT count(*) AS total,
        sum(CASE WHEN actor_id=? AND channel_id=? THEN 1 ELSE 0 END) AS actor
        FROM managed_one_shots WHERE state IN (${ACTIVE})`).get(input.actorId, input.channelId)!;
      if (Number(counts.total) >= ONE_SHOT_LIMITS.activeTotal || Number(counts.actor) >= ONE_SHOT_LIMITS.activePerActor) throw new Error("Active reminder limit reached (32 per actor, 256 per installation).");
      const id = `reminder-${randomUUID()}`;
      this.db.prepare(`INSERT INTO managed_one_shots
        (id,request_key,actor_id,channel_id,conversation_key,scheduled_for,timezone,action,state,created_at,run_after)
        VALUES (?,?,?,?,?,?,?,?,'pending',?,?)`).run(id,input.requestKey,input.actorId,input.channelId,input.conversationKey,
          input.scheduledFor,input.timezone,JSON.stringify(input.action),input.createdAt,input.scheduledFor);
      return this.get(id)!;
    });
  }

  list(owner?: OneShotOwner): OneShotTask[] {
    const rows = owner
      ? this.db.prepare("SELECT * FROM managed_one_shots WHERE actor_id=? AND channel_id=? AND conversation_key=? ORDER BY created_at DESC,id LIMIT ?").all(owner.actorId,owner.channelId,owner.conversationKey,ONE_SHOT_LIMITS.listing)
      : this.db.prepare("SELECT * FROM managed_one_shots ORDER BY created_at DESC,id LIMIT ?").all(ONE_SHOT_LIMITS.listing);
    return rows.map(task);
  }

  cancel(id: string, owner: OneShotOwner): { task: OneShotTask; inFlight: boolean } {
    return this.transaction(() => {
      const current = this.get(id);
      if (!current || current.actorId !== owner.actorId || current.channelId !== owner.channelId || current.conversationKey !== owner.conversationKey) throw new Error("Reminder not found in this actor and chat scope.");
      const inFlight = current.state === "delivering" || current.state === "executing";
      if (current.state === "delivering") this.db.prepare("UPDATE managed_one_shots SET cancel_requested=1,note='Dispatch already in flight; any remaining parts cancelled.' WHERE id=?").run(id);
      if (["pending","executing","ready"].includes(current.state)) {
        this.db.prepare("UPDATE managed_one_shots SET state='cancelled',note=? WHERE id=?").run(
          inFlight ? "Generation already started; future delivery cancelled." : "Cancelled before dispatch.",id);
      }
      return { task: this.get(id)!, inFlight };
    });
  }

  recover(): void {
    this.transaction(() => {
      this.db.exec(`UPDATE managed_one_shots SET state='uncertain',note='Transport outcome unknown after restart; inspect before rescheduling.' WHERE state='delivering';
        UPDATE managed_one_shots SET state=CASE WHEN attempts>=3 THEN 'failed' ELSE 'pending' END,
          note='Generation interrupted before result persistence.' WHERE state='executing';`);
    });
  }

  due(now: string): OneShotTask[] {
    return this.db.prepare("SELECT * FROM managed_one_shots WHERE state IN ('pending','ready') AND run_after<=? ORDER BY run_after,id LIMIT ?").all(now,ONE_SHOT_LIMITS.perTick).map(task);
  }

  claim(id: string, now: string): boolean {
    return this.db.prepare("UPDATE managed_one_shots SET state='executing',attempts=attempts+1,started_at=coalesce(started_at,?) WHERE id=? AND state='pending'").run(now,id).changes === 1;
  }

  saveResult(id: string, parts: OutboundEnvelope[]): boolean {
    return this.transaction(() => {
      if (this.get(id)?.state !== "executing") return false;
      const insert = this.db.prepare("INSERT INTO managed_one_shot_deliveries(task_id,part,envelope,state) VALUES (?,?,?,'ready')");
      parts.forEach((part,index) => insert.run(id,index,JSON.stringify(part)));
      this.db.prepare("UPDATE managed_one_shots SET state='ready' WHERE id=?").run(id);
      return true;
    });
  }

  failExecution(id: string, nowMs: number): void {
    const current = this.get(id);
    if (current?.state !== "executing") return;
    this.db.prepare("UPDATE managed_one_shots SET state=?,run_after=?,note='Generation failed; bounded retry policy applied.' WHERE id=? AND state='executing'").run(
      current.attempts >= ONE_SHOT_LIMITS.attempts ? "failed" : "pending",new Date(nowMs + 5000 * current.attempts).toISOString(),id);
  }

  terminal(id: string, state: "failed" | "uncertain", note: string): void {
    this.db.prepare(`UPDATE managed_one_shots SET state=?,note=? WHERE id=? AND state IN (${ACTIVE})`).run(state,note,id);
  }

  nextDelivery(id: string): { part: number; envelope: OutboundEnvelope } | undefined {
    const row = this.db.prepare("SELECT * FROM managed_one_shot_deliveries WHERE task_id=? AND state='ready' ORDER BY part LIMIT 1").get(id);
    return row ? { part: Number(row.part), envelope: JSON.parse(String(row.envelope)) } : undefined;
  }

  countActive(): number {
    return Number(this.db.prepare(`SELECT count(*) AS count FROM managed_one_shots WHERE state IN (${ACTIVE})`).get()!.count);
  }

  beginDelivery(id: string, part: number): boolean {
    return this.transaction(() => {
      if (this.get(id)?.state !== "ready") return false;
      if (this.db.prepare("UPDATE managed_one_shot_deliveries SET state='sending',attempts=attempts+1 WHERE task_id=? AND part=? AND state='ready'").run(id,part).changes !== 1) return false;
      this.db.prepare("UPDATE managed_one_shots SET state='delivering' WHERE id=?").run(id);
      return true;
    });
  }

  recordReceipt(id: string, part: number, receipt: string): void {
    this.transaction(() => {
      this.db.prepare("UPDATE managed_one_shot_deliveries SET state='sent',receipt=? WHERE task_id=? AND part=? AND state='sending'").run(receipt,id,part);
      const remaining = this.nextDelivery(id);
      const cancelled = this.db.prepare("SELECT cancel_requested FROM managed_one_shots WHERE id=?").get(id)?.cancel_requested === 1;
      this.db.prepare("UPDATE managed_one_shots SET state=? WHERE id=? AND state='delivering'").run(remaining ? cancelled ? "cancelled" : "ready" : "delivered",id);
    });
  }

  rejectedDelivery(id: string, part: number, nowMs: number): void {
    this.transaction(() => {
      const row = this.db.prepare("SELECT attempts FROM managed_one_shot_deliveries WHERE task_id=? AND part=? AND state='sending'").get(id,part);
      if (!row) return;
      const failed = Number(row.attempts) >= ONE_SHOT_LIMITS.attempts;
      const cancelled = this.db.prepare("SELECT cancel_requested FROM managed_one_shots WHERE id=?").get(id)?.cancel_requested === 1;
      this.db.prepare("UPDATE managed_one_shot_deliveries SET state=? WHERE task_id=? AND part=?").run(failed ? "failed" : "ready",id,part);
      this.db.prepare("UPDATE managed_one_shots SET state=?,run_after=?,note='Transport rejected delivery; bounded retry policy applied.' WHERE id=? AND state='delivering'").run(cancelled ? "cancelled" : failed ? "failed" : "ready",new Date(nowMs + 5000 * Number(row.attempts)).toISOString(),id);
    });
  }
}
