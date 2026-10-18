import { createHash } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { AttachmentRef, ContextCheckpoint, ContextCompactionJob, NormalizedMessage } from "@openassist/core-types";

type HistoryRow = { id: number; role: string; content: string; metadata_json: string | null; created_at: string };
export interface ContextHistory {
  messages: NormalizedMessage[];
  complete: boolean;
  bytes: number;
  blockedMessage?: { id: string; bytes: number };
}
export function contextSourceDigest(messages: NormalizedMessage[]): string {
  return createHash("sha256").update(JSON.stringify(messages)).digest("hex");
}

/** Additive tables: original messages, tool audits and legacy summaries remain readable. */
export class ContextStore {
  constructor(private readonly db: DatabaseSync, private readonly attachments: (ids: number[]) => Map<number, AttachmentRef[]>) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS context_checkpoints (
        session_id TEXT PRIMARY KEY REFERENCES sessions(id), revision INTEGER NOT NULL,
        covered_through INTEGER NOT NULL, source_digest TEXT NOT NULL, scope TEXT NOT NULL,
        summary TEXT NOT NULL, created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS context_compactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT, session_id TEXT NOT NULL REFERENCES sessions(id),
        expected_revision INTEGER NOT NULL, after_message_id INTEGER NOT NULL, through_message_id INTEGER NOT NULL,
        source_digest TEXT NOT NULL, scope TEXT NOT NULL, state TEXT NOT NULL DEFAULT 'pending',
        UNIQUE(session_id, expected_revision, after_message_id, through_message_id, source_digest, scope)
      );
      CREATE TABLE IF NOT EXISTS context_rejections (
        session_id TEXT NOT NULL REFERENCES sessions(id), fingerprint TEXT NOT NULL,
        state TEXT NOT NULL DEFAULT 'pending', PRIMARY KEY(session_id, fingerprint)
      );
    `);
  }

  checkpoint(sessionId: string): ContextCheckpoint | null {
    const row = this.db.prepare(`SELECT session_id AS sessionId, revision, covered_through AS coveredThrough,
      source_digest AS sourceDigest, scope, summary, created_at AS createdAt FROM context_checkpoints WHERE session_id=?`).get(sessionId);
    return row ? row as unknown as ContextCheckpoint : null;
  }

  /** Only non-side-effecting context/memory jobs are eligible for automatic restart recovery. */
  resumePending(): ContextCompactionJob[] {
    this.db.prepare("UPDATE jobs SET status='queued',locked_at=NULL WHERE status='running' AND type IN ('context_maintenance','extract_memory')").run();
    return this.db.prepare(`SELECT id,session_id AS sessionId,expected_revision AS expectedRevision,after_message_id AS afterMessageId,
      through_message_id AS throughMessageId,source_digest AS sourceDigest,scope,state FROM context_compactions c
      WHERE state='pending' AND NOT EXISTS (SELECT 1 FROM jobs j WHERE j.type='context_maintenance' AND json_extract(j.payload_json,'$.compactionId')=c.id)
      ORDER BY id LIMIT 256`).all() as unknown as ContextCompactionJob[];
  }

  /** Page descriptors before hydrating content so an oversized row cannot bypass the byte bound. */
  history(sessionId: string, after = 0, maxBytes = 33_554_432, through = Number.MAX_SAFE_INTEGER): ContextHistory {
    const messages: NormalizedMessage[] = [];
    let bytes = 0;
    let cursor = after;
    let blockedMessage: ContextHistory["blockedMessage"];
    while (messages.length < 10_000) {
      const descriptors = this.db.prepare(`SELECT id, length(CAST(content AS BLOB)) + coalesce(length(CAST(metadata_json AS BLOB)),0) + 128 AS bytes
        FROM messages WHERE session_id=? AND id>? AND id<=? ORDER BY id LIMIT 200`).all(sessionId, cursor, through) as Array<{id:number;bytes:number}>;
      if (!descriptors.length) return { messages, bytes, complete: true };
      const ids: number[] = [];
      for (const row of descriptors) {
        if (row.bytes > maxBytes) { blockedMessage = { id: String(row.id), bytes: row.bytes }; break; }
        if (bytes + row.bytes > maxBytes || messages.length + ids.length >= 10_000) break;
        bytes += row.bytes;
        ids.push(row.id);
      }
      if (!ids.length) return { messages, bytes, complete: false, ...(blockedMessage ? { blockedMessage } : {}) };
      const rows = this.db.prepare(`SELECT id, role, content, metadata_json, created_at FROM messages
        WHERE session_id=? AND id IN (${ids.map(() => "?").join(",")}) ORDER BY id`).all(sessionId, ...ids) as HistoryRow[];
      const attached = this.attachments(ids);
      for (const row of rows) {
        const metadata = JSON.parse(row.metadata_json ?? "{}") as Record<string,string>;
        const message: NormalizedMessage = { id: String(row.id), role: row.role as NormalizedMessage["role"], content: row.content,
          metadata, createdAt: row.created_at, toolCallId: metadata.toolCallId, toolName: metadata.toolName,
          attachments: attached.get(row.id) ?? undefined };
        const attachmentBytes = Buffer.byteLength(JSON.stringify(message.attachments ?? []), "utf8");
        if (bytes + attachmentBytes > maxBytes) {
          const rowBytes = Buffer.byteLength(row.content) + Buffer.byteLength(row.metadata_json ?? "") + 128 + attachmentBytes;
          return { messages, bytes, complete: false, ...(rowBytes > maxBytes ? { blockedMessage: { id: String(row.id), bytes: rowBytes } } : {}) };
        }
        bytes += attachmentBytes;
        messages.push(message);
      }
      cursor = ids.at(-1)!;
      if (ids.length !== descriptors.length) return { messages, bytes, complete: false, ...(blockedMessage ? { blockedMessage } : {}) };
    }
    const more = this.db.prepare("SELECT 1 FROM messages WHERE session_id=? AND id>? AND id<=? LIMIT 1").get(sessionId,cursor,through);
    return { messages, bytes, complete: !more };
  }

  reject(sessionId: string, fingerprint: string): boolean {
    return this.db.prepare("INSERT INTO context_rejections(session_id,fingerprint) VALUES(?,?) ON CONFLICT DO NOTHING")
      .run(sessionId,fingerprint).changes === 1;
  }

  repaired(sessionId: string, fingerprint: string, success: boolean): void {
    this.db.prepare("UPDATE context_rejections SET state=? WHERE session_id=? AND fingerprint=?")
      .run(success ? "repaired" : "failed",sessionId,fingerprint);
  }

  private boundary(sessionId: string): { revision: number; coveredThrough: number } {
    const checkpoint = this.checkpoint(sessionId);
    if (checkpoint) return checkpoint;
    const legacy = this.db.prepare("SELECT last_compacted_message_id AS coveredThrough FROM session_memory WHERE session_id=?").get(sessionId) as {coveredThrough:number} | undefined;
    return { revision: 0, coveredThrough: legacy?.coveredThrough ?? 0 };
  }

  begin(input: Omit<ContextCompactionJob,"id"|"state">): ContextCompactionJob {
    const current = this.boundary(input.sessionId);
    if (current.revision !== input.expectedRevision || current.coveredThrough !== input.afterMessageId || input.throughMessageId <= input.afterMessageId) {
      throw new Error("Context checkpoint changed; rebuild the compaction candidate.");
    }
    this.db.prepare(`INSERT INTO context_compactions(session_id,expected_revision,after_message_id,through_message_id,source_digest,scope)
      VALUES (?,?,?,?,?,?) ON CONFLICT DO NOTHING`).run(input.sessionId,input.expectedRevision,input.afterMessageId,input.throughMessageId,input.sourceDigest,input.scope);
    return this.db.prepare(`SELECT id,session_id AS sessionId,expected_revision AS expectedRevision,after_message_id AS afterMessageId,
      through_message_id AS throughMessageId,source_digest AS sourceDigest,scope,state FROM context_compactions
      WHERE session_id=? AND expected_revision=? AND after_message_id=? AND through_message_id=? AND source_digest=? AND scope=?`)
      .get(input.sessionId,input.expectedRevision,input.afterMessageId,input.throughMessageId,input.sourceDigest,input.scope) as unknown as ContextCompactionJob;
  }

  finish(job: ContextCompactionJob, summary: string, maxBytes: number): ContextCheckpoint | null {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const current = this.boundary(job.sessionId);
      const intent = this.db.prepare("SELECT 1 FROM context_compactions WHERE id=? AND session_id=? AND expected_revision=? AND after_message_id=? AND through_message_id=? AND source_digest=? AND scope=? AND state!='succeeded'")
        .get(job.id,job.sessionId,job.expectedRevision,job.afterMessageId,job.throughMessageId,job.sourceDigest,job.scope);
      const source = this.history(job.sessionId, job.afterMessageId, maxBytes, job.throughMessageId);
      if (!intent || current.revision !== job.expectedRevision || current.coveredThrough !== job.afterMessageId ||
        !source.complete || !source.messages.length || Number(source.messages.at(-1)?.id) !== job.throughMessageId || contextSourceDigest(source.messages) !== job.sourceDigest) {
        this.db.exec("ROLLBACK");
        return null;
      }
      if (!summary.trim() || Buffer.byteLength(summary) > 131_072) throw new Error("Context summary is empty or too large.");
      const now = new Date().toISOString();
      this.db.prepare(`INSERT INTO context_checkpoints(session_id,revision,covered_through,source_digest,scope,summary,created_at)
        VALUES (?,?,?,?,?,?,?) ON CONFLICT(session_id) DO UPDATE SET revision=excluded.revision,covered_through=excluded.covered_through,
        source_digest=excluded.source_digest,scope=excluded.scope,summary=excluded.summary,created_at=excluded.created_at`)
        .run(job.sessionId,job.expectedRevision+1,job.throughMessageId,job.sourceDigest,job.scope,summary,now);
      // Compatibility mirror; old binaries can read this additive database without deleting checkpoints.
      this.db.prepare(`INSERT INTO session_memory(session_id,summary_text,last_compacted_message_id,created_at,updated_at) VALUES(?,?,?,?,?)
        ON CONFLICT(session_id) DO UPDATE SET summary_text=excluded.summary_text,last_compacted_message_id=excluded.last_compacted_message_id,updated_at=excluded.updated_at`)
        .run(job.sessionId,summary,job.throughMessageId,now,now);
      this.db.prepare("UPDATE context_compactions SET state='succeeded' WHERE id=?").run(job.id);
      this.db.prepare("UPDATE context_compactions SET state='failed' WHERE session_id=? AND expected_revision<=? AND id!=? AND state='pending'")
        .run(job.sessionId,job.expectedRevision,job.id);
      this.db.exec("COMMIT");
      return this.checkpoint(job.sessionId);
    } catch (error) { this.db.exec("ROLLBACK"); throw error; }
  }

  fail(id: number): void { this.db.prepare("UPDATE context_compactions SET state='failed' WHERE id=? AND state!='succeeded'").run(id); }
}
