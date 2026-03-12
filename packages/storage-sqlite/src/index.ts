import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import type {
  AttachmentRef,
  InboundEnvelope,
  ManagedCapabilityKind,
  ManagedCapabilityRecord,
  NormalizedMessage,
  OutboundEnvelope,
  PolicyProfile,
  RuntimeMemoryCategory,
  RuntimePermanentMemoryRecord,
  RuntimeSessionMemoryRecord,
  RetryPolicy
} from "@openassist/core-types";
import { redactSensitiveData, type OpenAssistLogger } from "@openassist/observability";

export interface JobRecord {
  id: number;
  type: string;
  payload: Record<string, unknown>;
  status: "queued" | "running" | "succeeded" | "failed";
  attempts: number;
  maxAttempts: number;
  runAfter: string;
}

export interface ConfigGenerationRecord {
  id: number;
  generation: number;
  status: "candidate" | "active" | "rolled_back";
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface ScheduledTaskCursorRecord {
  taskId: string;
  lastPlannedFor?: string;
  lastEnqueuedFor?: string;
  updatedAt: string;
}

export interface ScheduledTaskRunRecord {
  id: number;
  taskId: string;
  scheduledFor: string;
  startedAt: string;
  finishedAt?: string;
  status: "running" | "succeeded" | "failed";
  output?: Record<string, unknown>;
  errorText?: string;
  transportMessageId?: string;
}

export interface ClockCheckRecord {
  id: number;
  checkedAt: string;
  status: "healthy" | "degraded" | "unhealthy";
  source?: string;
  offsetMs?: number;
  details?: Record<string, unknown>;
}

export interface ToolInvocationRecord {
  id: number;
  sessionId: string;
  conversationKey: string;
  toolCallId: string;
  toolName: string;
  actorId: string;
  request: Record<string, unknown>;
  result?: Record<string, unknown>;
  status: "running" | "succeeded" | "failed" | "blocked";
  errorText?: string;
  startedAt: string;
  finishedAt?: string;
  durationMs?: number;
}

export interface OauthAccountRecord {
  providerId: string;
  accountId: string;
  encryptedSecretJson: string;
  expiresAt?: string;
  updatedAt: string;
}

export interface OauthFlowRecord {
  state: string;
  providerId: string;
  accountId: string;
  redirectUri: string;
  codeVerifier: string;
  expiresAt: string;
  consumedAt?: string;
}

export interface SessionBootstrapRecord {
  sessionId: string;
  assistantName: string;
  persona: string;
  operatorPreferences: string;
  coreIdentity: string;
  systemProfile: Record<string, unknown>;
  firstContactPrompted: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface MessageHistoryRecord extends NormalizedMessage {
  messageId: number;
}

export interface PermanentMemoryUpsertInput {
  actorScope: string;
  category: RuntimeMemoryCategory;
  summary: string;
  keywords: string[];
  sourceSessionId: string;
  sourceMessageId: number;
  salience?: number;
  state?: "active" | "forgotten";
}

export interface MessageAttachmentRecord extends AttachmentRef {
  messageId: number;
}

export interface ManagedCapabilityUpsertInput {
  kind: ManagedCapabilityKind;
  id: string;
  installRoot: string;
  installer: string;
  summary: string;
  updateSafe: boolean;
}

export interface OpenAssistDatabaseOptions {
  dbPath: string;
  logger: OpenAssistLogger;
}

function nowIso(): string {
  return new Date().toISOString();
}

function parseJson<T>(value: string | null): T {
  if (!value) {
    return {} as T;
  }
  return JSON.parse(value) as T;
}

function normalizeMemoryKey(category: RuntimeMemoryCategory, summary: string): string {
  const normalizedSummary = summary
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return `${category}:${normalizedSummary}`;
}

function toModeText(mode: number): string {
  return `0o${(mode & 0o777).toString(8).padStart(3, "0")}`;
}

function assertUnixOwnerOnlyPath(
  targetPath: string,
  kind: "file" | "directory",
  options: { allowMissing?: boolean } = {}
): void {
  if (process.platform === "win32") {
    return;
  }

  if (!fs.existsSync(targetPath)) {
    if (options.allowMissing) {
      return;
    }
    throw new Error(`Missing ${kind} path for permission check: ${targetPath}`);
  }

  const stat = fs.statSync(targetPath);
  if (kind === "file" && !stat.isFile()) {
    throw new Error(`Expected file path for permission check: ${targetPath}`);
  }
  if (kind === "directory" && !stat.isDirectory()) {
    throw new Error(`Expected directory path for permission check: ${targetPath}`);
  }

  const mode = stat.mode & 0o777;
  if ((mode & 0o077) !== 0) {
    throw new Error(
      `Insecure permissions on ${kind} '${targetPath}': ${toModeText(mode)}. ` +
        "Use owner-only permissions (no group/other access)."
    );
  }
}

export class OpenAssistDatabase {
  private readonly db: DatabaseSync;
  private readonly logger: OpenAssistLogger;

  constructor(options: OpenAssistDatabaseOptions) {
    this.logger = options.logger;
    const dir = path.dirname(options.dbPath);
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    if (process.platform !== "win32") {
      fs.chmodSync(dir, 0o700);
      assertUnixOwnerOnlyPath(dir, "directory");
    }

    const dbAlreadyExists = fs.existsSync(options.dbPath);
    this.db = new DatabaseSync(options.dbPath);
    if (process.platform !== "win32") {
      if (!dbAlreadyExists) {
        fs.chmodSync(options.dbPath, 0o600);
      }
      assertUnixOwnerOnlyPath(options.dbPath, "file");
    } else {
      this.logger.info(
        {
          type: "security.permissions.skip",
          path: options.dbPath,
          platform: process.platform
        },
        "skipping strict unix permission checks on this platform"
      );
    }
    this.db.exec("PRAGMA journal_mode = WAL;");
    this.db.exec("PRAGMA foreign_keys = ON;");
    this.initialize();
  }

  private runInTransaction<T>(fn: () => T): T {
    this.db.exec("BEGIN IMMEDIATE;");
    try {
      const result = fn();
      this.db.exec("COMMIT;");
      return result;
    } catch (error) {
      this.db.exec("ROLLBACK;");
      throw error;
    }
  }

  private initialize(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        conversation_key TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        conversation_key TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        metadata_json TEXT,
        internal_trace TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY(session_id) REFERENCES sessions(id)
      );

      CREATE TABLE IF NOT EXISTS message_attachments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        message_id INTEGER NOT NULL,
        attachment_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        name TEXT,
        mime_type TEXT,
        url TEXT,
        local_path TEXT,
        size_bytes INTEGER,
        caption_text TEXT,
        extracted_text TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY(message_id) REFERENCES messages(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY(session_id) REFERENCES sessions(id)
      );

      CREATE TABLE IF NOT EXISTS jobs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        status TEXT NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        max_attempts INTEGER NOT NULL DEFAULT 5,
        run_after TEXT NOT NULL,
        locked_at TEXT,
        last_error TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS job_attempts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        job_id INTEGER NOT NULL,
        attempt_number INTEGER NOT NULL,
        status TEXT NOT NULL,
        error_text TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY(job_id) REFERENCES jobs(id)
      );

      CREATE TABLE IF NOT EXISTS idempotency_keys (
        key TEXT PRIMARY KEY,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS config_generations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        generation INTEGER NOT NULL,
        status TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        activated_at TEXT,
        rolled_back_at TEXT
      );

      CREATE TABLE IF NOT EXISTS oauth_accounts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        provider_id TEXT NOT NULL,
        account_id TEXT NOT NULL,
        encrypted_secret_json TEXT NOT NULL,
        expires_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(provider_id, account_id)
      );

      CREATE TABLE IF NOT EXISTS oauth_flows (
        state TEXT PRIMARY KEY,
        provider_id TEXT NOT NULL,
        account_id TEXT NOT NULL,
        redirect_uri TEXT NOT NULL,
        code_verifier TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        consumed_at TEXT,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS policy_profiles (
        session_id TEXT PRIMARY KEY,
        profile TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS actor_policy_profiles (
        session_id TEXT NOT NULL,
        actor_id TEXT NOT NULL,
        profile TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY(session_id, actor_id)
      );

      CREATE TABLE IF NOT EXISTS skill_registry (
        id TEXT PRIMARY KEY,
        version TEXT NOT NULL,
        manifest_json TEXT NOT NULL,
        installed_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS managed_capabilities (
        kind TEXT NOT NULL,
        id TEXT NOT NULL,
        install_root TEXT NOT NULL,
        installer TEXT NOT NULL,
        summary TEXT NOT NULL,
        update_safe INTEGER NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY(kind, id)
      );

      CREATE TABLE IF NOT EXISTS module_health (
        module_id TEXT PRIMARY KEY,
        status TEXT NOT NULL,
        message TEXT,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS session_bootstrap (
        session_id TEXT PRIMARY KEY,
        assistant_name TEXT NOT NULL,
        persona TEXT NOT NULL,
        operator_preferences TEXT NOT NULL,
        core_identity TEXT NOT NULL,
        system_profile_json TEXT NOT NULL,
        first_contact_prompted INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS session_memory (
        session_id TEXT PRIMARY KEY,
        summary_text TEXT NOT NULL,
        last_compacted_message_id INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY(session_id) REFERENCES sessions(id)
      );

      CREATE TABLE IF NOT EXISTS permanent_memories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        actor_scope TEXT NOT NULL,
        category TEXT NOT NULL,
        summary_text TEXT NOT NULL,
        normalized_key TEXT NOT NULL,
        keywords_json TEXT NOT NULL,
        source_session_id TEXT NOT NULL,
        source_message_id INTEGER NOT NULL,
        salience REAL NOT NULL DEFAULT 1,
        state TEXT NOT NULL DEFAULT 'active',
        recall_count INTEGER NOT NULL DEFAULT 0,
        last_recalled_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(actor_scope, normalized_key)
      );

      CREATE TABLE IF NOT EXISTS dead_letters (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        reason TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS system_settings (
        key TEXT PRIMARY KEY,
        value_json TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS scheduled_task_cursors (
        task_id TEXT PRIMARY KEY,
        last_planned_for TEXT,
        last_enqueued_for TEXT,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS scheduled_task_runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id TEXT NOT NULL,
        scheduled_for TEXT NOT NULL,
        started_at TEXT NOT NULL,
        finished_at TEXT,
        status TEXT NOT NULL,
        output_json TEXT,
        error_text TEXT,
        transport_message_id TEXT
      );

      CREATE TABLE IF NOT EXISTS clock_checks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        checked_at TEXT NOT NULL,
        status TEXT NOT NULL,
        source TEXT,
        offset_ms INTEGER,
        details_json TEXT
      );

      CREATE TABLE IF NOT EXISTS tool_invocations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        conversation_key TEXT NOT NULL,
        tool_call_id TEXT NOT NULL,
        tool_name TEXT NOT NULL,
        actor_id TEXT NOT NULL,
        request_json TEXT NOT NULL,
        result_json TEXT,
        status TEXT NOT NULL,
        error_text TEXT,
        started_at TEXT NOT NULL,
        finished_at TEXT,
        duration_ms INTEGER
      );

      CREATE INDEX IF NOT EXISTS idx_messages_conversation_created
      ON messages(conversation_key, created_at);

      CREATE INDEX IF NOT EXISTS idx_messages_session_id_desc
      ON messages(session_id, id DESC);

      CREATE INDEX IF NOT EXISTS idx_managed_capabilities_kind_id
      ON managed_capabilities(kind, id);

      CREATE INDEX IF NOT EXISTS idx_permanent_memories_actor_state
      ON permanent_memories(actor_scope, state, updated_at DESC);

      CREATE INDEX IF NOT EXISTS idx_message_attachments_message_id
      ON message_attachments(message_id, id ASC);

      CREATE INDEX IF NOT EXISTS idx_jobs_status_run_after
      ON jobs(status, run_after);

      CREATE INDEX IF NOT EXISTS idx_oauth_flows_expires_at
      ON oauth_flows(expires_at);

      CREATE INDEX IF NOT EXISTS idx_scheduled_task_runs_task_scheduled
      ON scheduled_task_runs(task_id, scheduled_for DESC);

      CREATE INDEX IF NOT EXISTS idx_clock_checks_checked_at
      ON clock_checks(checked_at DESC);

      CREATE INDEX IF NOT EXISTS idx_tool_invocations_session_started
      ON tool_invocations(session_id, started_at DESC);
    `);
  }

  close(): void {
    this.db.close();
  }

  ensureSession(sessionId: string, conversationKey: string): void {
    const timestamp = nowIso();
    this.db
      .prepare(
        `
        INSERT INTO sessions (id, conversation_key, created_at, updated_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          conversation_key = excluded.conversation_key,
          updated_at = excluded.updated_at
      `
      )
      .run(sessionId, conversationKey, timestamp, timestamp);
  }

  insertIdempotencyKey(key: string): boolean {
    const statement = this.db.prepare(
      `INSERT OR IGNORE INTO idempotency_keys (key, created_at) VALUES (?, ?)`
    );
    const result = statement.run(key, nowIso());
    return Number(result.changes) > 0;
  }

  insertSchedulerIdempotencyKey(taskId: string, scheduledFor: string): boolean {
    return this.insertIdempotencyKey(`scheduler:${taskId}:${scheduledFor}`);
  }

  hasIdempotencyKey(key: string): boolean {
    const row = this.db
      .prepare(`SELECT 1 FROM idempotency_keys WHERE key = ? LIMIT 1`)
      .get(key) as { 1?: number } | undefined;
    return row !== undefined;
  }

  private persistMessageAttachments(messageId: number, attachments: AttachmentRef[], createdAt: string): void {
    if (attachments.length === 0) {
      return;
    }

    const statement = this.db.prepare(
      `
        INSERT INTO message_attachments (
          message_id,
          attachment_id,
          kind,
          name,
          mime_type,
          url,
          local_path,
          size_bytes,
          caption_text,
          extracted_text,
          created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
    );

    for (const attachment of attachments) {
      statement.run(
        messageId,
        attachment.id,
        attachment.kind,
        attachment.name ?? null,
        attachment.mimeType ?? null,
        attachment.url ?? null,
        attachment.localPath ?? null,
        attachment.sizeBytes ?? null,
        attachment.captionText ?? null,
        attachment.extractedText ?? null,
        createdAt
      );
    }
  }

  private getMessageAttachments(messageIds: number[]): Map<number, AttachmentRef[]> {
    const map = new Map<number, AttachmentRef[]>();
    if (messageIds.length === 0) {
      return map;
    }

    const placeholders = messageIds.map(() => "?").join(", ");
    const rows = this.db
      .prepare(
        `
          SELECT
            message_id,
            attachment_id,
            kind,
            name,
            mime_type,
            url,
            local_path,
            size_bytes,
            caption_text,
            extracted_text
          FROM message_attachments
          WHERE message_id IN (${placeholders})
          ORDER BY id ASC
        `
      )
      .all(...messageIds) as Array<{
      message_id: number;
      attachment_id: string;
      kind: AttachmentRef["kind"];
      name: string | null;
      mime_type: string | null;
      url: string | null;
      local_path: string | null;
      size_bytes: number | null;
      caption_text: string | null;
      extracted_text: string | null;
    }>;

    for (const row of rows) {
      const existing = map.get(row.message_id) ?? [];
      existing.push({
        id: row.attachment_id,
        kind: row.kind,
        name: row.name ?? undefined,
        mimeType: row.mime_type ?? undefined,
        url: row.url ?? undefined,
        localPath: row.local_path ?? undefined,
        sizeBytes: row.size_bytes ?? undefined,
        captionText: row.caption_text ?? undefined,
        extractedText: row.extracted_text ?? undefined
      });
      map.set(row.message_id, existing);
    }

    return map;
  }

  recordInbound(sessionId: string, envelope: InboundEnvelope): boolean {
    return this.runInTransaction(() => {
      if (!this.insertIdempotencyKey(envelope.idempotencyKey)) {
        return false;
      }

      this.ensureSession(sessionId, envelope.conversationKey);

      const inserted = this.db
        .prepare(
          `
          INSERT INTO messages (session_id, conversation_key, role, content, metadata_json, created_at)
          VALUES (?, ?, 'user', ?, ?, ?)
        `
        )
        .run(
          sessionId,
          envelope.conversationKey,
          envelope.text ?? "",
          JSON.stringify({
            channel: envelope.channel,
            channelId: envelope.channelId,
            senderId: envelope.senderId,
            transportMessageId: envelope.transportMessageId
          }),
          envelope.receivedAt
        );
      this.persistMessageAttachments(
        Number(inserted.lastInsertRowid),
        envelope.attachments ?? [],
        envelope.receivedAt
      );

      this.db
        .prepare(
          `
          INSERT INTO events (session_id, event_type, payload_json, created_at)
          VALUES (?, 'inbound_message', ?, ?)
        `
        )
        .run(sessionId, JSON.stringify(envelope), nowIso());

      return true;
    });
  }

  recordAssistantMessage(
    sessionId: string,
    conversationKey: string,
    message: NormalizedMessage,
    metadata: Record<string, unknown> = {}
  ): void {
    this.ensureSession(sessionId, conversationKey);
    const createdAt = nowIso();
    const mergedMetadata: Record<string, unknown> = {
      ...metadata,
      ...(message.metadata ?? {})
    };
    if (message.toolCallId) {
      mergedMetadata.toolCallId = message.toolCallId;
    }
    if (message.toolName) {
      mergedMetadata.toolName = message.toolName;
    }
    const inserted = this.db
      .prepare(
        `
        INSERT INTO messages (session_id, conversation_key, role, content, metadata_json, internal_trace, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `
      )
      .run(
        sessionId,
        conversationKey,
        message.role,
        message.content,
        JSON.stringify(mergedMetadata),
        message.internalTrace ?? null,
        createdAt
      );
    this.persistMessageAttachments(
      Number(inserted.lastInsertRowid),
      message.attachments ?? [],
      createdAt
    );
  }

  recordOutbound(sessionId: string, envelope: OutboundEnvelope, transportMessageId: string): void {
    this.ensureSession(sessionId, envelope.conversationKey);
    this.db
      .prepare(
        `
        INSERT INTO events (session_id, event_type, payload_json, created_at)
        VALUES (?, 'outbound_message', ?, ?)
      `
      )
      .run(
        sessionId,
        JSON.stringify({
          envelope,
          transportMessageId
        }),
        nowIso()
      );
  }

  getRecentMessages(sessionId: string, limit: number): NormalizedMessage[] {
    const rows = this.db
      .prepare(
        `
        SELECT id, role, content, metadata_json, internal_trace, created_at
        FROM messages
        WHERE session_id = ?
        ORDER BY id DESC
        LIMIT ?
      `
      )
      .all(sessionId, limit) as Array<{
      id: number;
      role: string;
      content: string;
      metadata_json: string | null;
      internal_trace: string | null;
      created_at: string;
    }>;
    const attachmentsByMessageId = this.getMessageAttachments(rows.map((row) => row.id));

    return rows
      .reverse()
      .map((row) => {
        const metadata = parseJson<Record<string, string>>(row.metadata_json);
        return {
          id: String(row.id),
          role: row.role as NormalizedMessage["role"],
          content: row.content,
          attachments: attachmentsByMessageId.get(row.id) ?? undefined,
          createdAt: row.created_at,
          metadata,
          internalTrace: row.internal_trace ?? undefined,
          toolCallId: metadata.toolCallId,
          toolName: metadata.toolName
        };
      });
  }

  getLatestMessageId(sessionId: string): number | null {
    const row = this.db
      .prepare(
        `
        SELECT id
        FROM messages
        WHERE session_id = ?
        ORDER BY id DESC
        LIMIT 1
      `
      )
      .get(sessionId) as { id: number } | undefined;
    return row ? Number(row.id) : null;
  }

  enqueueJob(type: string, payload: Record<string, unknown>, policy: RetryPolicy): number {
    const timestamp = nowIso();
    const result = this.db
      .prepare(
        `
        INSERT INTO jobs (type, payload_json, status, attempts, max_attempts, run_after, created_at, updated_at)
        VALUES (?, ?, 'queued', 0, ?, ?, ?, ?)
      `
      )
      .run(type, JSON.stringify(payload), policy.maxAttempts, timestamp, timestamp, timestamp);

    return Number(result.lastInsertRowid);
  }

  countQueuedJobs(): number {
    const row = this.db
      .prepare(`SELECT COUNT(*) as count FROM jobs WHERE status = 'queued'`)
      .get() as { count: number };
    return Number(row.count);
  }

  claimDueJobs(limit: number): JobRecord[] {
    const timestamp = nowIso();
    const rows = this.db
      .prepare(
        `
        SELECT id, type, payload_json, status, attempts, max_attempts, run_after
        FROM jobs
        WHERE status = 'queued' AND run_after <= ?
        ORDER BY id ASC
        LIMIT ?
      `
      )
      .all(timestamp, limit) as Array<{
      id: number;
      type: string;
      payload_json: string;
      status: "queued" | "running" | "succeeded" | "failed";
      attempts: number;
      max_attempts: number;
      run_after: string;
    }>;

    if (rows.length === 0) {
      return [];
    }

    const ids = rows.map((row) => row.id);
    const placeholders = ids.map(() => "?").join(",");
    this.db
      .prepare(
        `
        UPDATE jobs
        SET status = 'running', locked_at = ?, updated_at = ?
        WHERE id IN (${placeholders})
      `
      )
      .run(timestamp, timestamp, ...ids);

    return rows.map((row) => ({
      id: row.id,
      type: row.type,
      payload: parseJson<Record<string, unknown>>(row.payload_json),
      status: "running",
      attempts: row.attempts,
      maxAttempts: row.max_attempts,
      runAfter: row.run_after
    }));
  }

  markJobSucceeded(jobId: number): void {
    const timestamp = nowIso();
    this.db
      .prepare(`UPDATE jobs SET status = 'succeeded', updated_at = ? WHERE id = ?`)
      .run(timestamp, jobId);

    const attempts = this.getJobAttempts(jobId);
    this.db
      .prepare(
        `
        INSERT INTO job_attempts (job_id, attempt_number, status, created_at)
        VALUES (?, ?, 'succeeded', ?)
      `
      )
      .run(jobId, attempts + 1, timestamp);
  }

  markJobFailed(jobId: number, errorText: string, delayMs: number): void {
    const timestamp = nowIso();
    const row = this.db
      .prepare(`SELECT attempts, max_attempts, payload_json, type FROM jobs WHERE id = ?`)
      .get(jobId) as
      | {
          attempts: number;
          max_attempts: number;
          payload_json: string;
          type: string;
        }
      | undefined;

    if (!row) {
      return;
    }

    const nextAttempts = row.attempts + 1;
    this.db
      .prepare(
        `
        INSERT INTO job_attempts (job_id, attempt_number, status, error_text, created_at)
        VALUES (?, ?, 'failed', ?, ?)
      `
      )
      .run(jobId, nextAttempts, errorText, timestamp);

    if (nextAttempts >= row.max_attempts) {
      this.db
        .prepare(
          `
          UPDATE jobs
          SET status = 'failed', attempts = ?, updated_at = ?, last_error = ?
          WHERE id = ?
        `
        )
        .run(nextAttempts, timestamp, errorText, jobId);

      this.db
        .prepare(
          `
          INSERT INTO dead_letters (source, payload_json, reason, created_at)
          VALUES ('job', ?, ?, ?)
        `
        )
        .run(row.payload_json, errorText, timestamp);

      this.logger.error({ jobId, errorText }, "job moved to dead letter queue");
      return;
    }

    const runAfter = new Date(Date.now() + delayMs).toISOString();
    this.db
      .prepare(
        `
        UPDATE jobs
        SET status = 'queued', attempts = ?, run_after = ?, updated_at = ?, last_error = ?
        WHERE id = ?
      `
      )
      .run(nextAttempts, runAfter, timestamp, errorText, jobId);
  }

  private getJobAttempts(jobId: number): number {
    const row = this.db.prepare(`SELECT attempts FROM jobs WHERE id = ?`).get(jobId) as
      | { attempts: number }
      | undefined;
    return row?.attempts ?? 0;
  }

  setPolicyProfile(sessionId: string, profile: PolicyProfile): void {
    this.db
      .prepare(
        `
        INSERT INTO policy_profiles (session_id, profile, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(session_id) DO UPDATE SET profile = excluded.profile, updated_at = excluded.updated_at
      `
      )
      .run(sessionId, profile, nowIso());
  }

  setActorPolicyProfile(sessionId: string, actorId: string, profile: PolicyProfile): void {
    this.db
      .prepare(
        `
        INSERT INTO actor_policy_profiles (session_id, actor_id, profile, updated_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(session_id, actor_id) DO UPDATE SET
          profile = excluded.profile,
          updated_at = excluded.updated_at
      `
      )
      .run(sessionId, actorId, profile, nowIso());
  }

  getPolicyProfile(sessionId: string): PolicyProfile | null {
    const row = this.db
      .prepare(`SELECT profile FROM policy_profiles WHERE session_id = ?`)
      .get(sessionId) as { profile: PolicyProfile } | undefined;
    return row?.profile ?? null;
  }

  getActorPolicyProfile(sessionId: string, actorId: string): PolicyProfile | null {
    const row = this.db
      .prepare(`SELECT profile FROM actor_policy_profiles WHERE session_id = ? AND actor_id = ?`)
      .get(sessionId, actorId) as { profile: PolicyProfile } | undefined;
    return row?.profile ?? null;
  }

  getSessionBootstrap(sessionId: string): SessionBootstrapRecord | null {
    const row = this.db
      .prepare(
        `
        SELECT
          session_id,
          assistant_name,
          persona,
          operator_preferences,
          core_identity,
          system_profile_json,
          first_contact_prompted,
          created_at,
          updated_at
        FROM session_bootstrap
        WHERE session_id = ?
      `
      )
      .get(sessionId) as
      | {
          session_id: string;
          assistant_name: string;
          persona: string;
          operator_preferences: string;
          core_identity: string;
          system_profile_json: string;
          first_contact_prompted: number;
          created_at: string;
          updated_at: string;
        }
      | undefined;

    if (!row) {
      return null;
    }

    return {
      sessionId: row.session_id,
      assistantName: row.assistant_name,
      persona: row.persona,
      operatorPreferences: row.operator_preferences,
      coreIdentity: row.core_identity,
      systemProfile: parseJson<Record<string, unknown>>(row.system_profile_json),
      firstContactPrompted: row.first_contact_prompted === 1,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  upsertSessionBootstrap(input: {
    sessionId: string;
    assistantName: string;
    persona: string;
    operatorPreferences: string;
    coreIdentity: string;
    systemProfile: Record<string, unknown>;
    firstContactPrompted?: boolean;
  }): SessionBootstrapRecord {
    const timestamp = nowIso();
    const existing = this.getSessionBootstrap(input.sessionId);
    this.db
      .prepare(
        `
        INSERT INTO session_bootstrap (
          session_id,
          assistant_name,
          persona,
          operator_preferences,
          core_identity,
          system_profile_json,
          first_contact_prompted,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(session_id) DO UPDATE SET
          assistant_name = excluded.assistant_name,
          persona = excluded.persona,
          operator_preferences = excluded.operator_preferences,
          core_identity = excluded.core_identity,
          system_profile_json = excluded.system_profile_json,
          first_contact_prompted = excluded.first_contact_prompted,
          updated_at = excluded.updated_at
      `
      )
      .run(
        input.sessionId,
        input.assistantName,
        input.persona,
        input.operatorPreferences,
        input.coreIdentity,
        JSON.stringify(input.systemProfile),
        input.firstContactPrompted === true ? 1 : 0,
        existing?.createdAt ?? timestamp,
        timestamp
      );

    return this.getSessionBootstrap(input.sessionId)!;
  }

  markSessionBootstrapPrompted(sessionId: string): void {
    this.db
      .prepare(
        `
        UPDATE session_bootstrap
        SET first_contact_prompted = 1, updated_at = ?
        WHERE session_id = ?
      `
      )
      .run(nowIso(), sessionId);
  }

  getSessionMemory(sessionId: string): RuntimeSessionMemoryRecord | null {
    const row = this.db
      .prepare(
        `
        SELECT session_id, summary_text, last_compacted_message_id, created_at, updated_at
        FROM session_memory
        WHERE session_id = ?
      `
      )
      .get(sessionId) as
      | {
          session_id: string;
          summary_text: string;
          last_compacted_message_id: number;
          created_at: string;
          updated_at: string;
        }
      | undefined;

    if (!row) {
      return null;
    }

    return {
      sessionId: row.session_id,
      summary: row.summary_text,
      lastCompactedMessageId: Number(row.last_compacted_message_id),
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  upsertSessionMemory(input: {
    sessionId: string;
    summary: string;
    lastCompactedMessageId: number;
  }): RuntimeSessionMemoryRecord {
    const existing = this.getSessionMemory(input.sessionId);
    const timestamp = nowIso();
    this.db
      .prepare(
        `
        INSERT INTO session_memory (
          session_id,
          summary_text,
          last_compacted_message_id,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(session_id) DO UPDATE SET
          summary_text = excluded.summary_text,
          last_compacted_message_id = excluded.last_compacted_message_id,
          updated_at = excluded.updated_at
      `
      )
      .run(
        input.sessionId,
        input.summary,
        input.lastCompactedMessageId,
        existing?.createdAt ?? timestamp,
        timestamp
      );

    return this.getSessionMemory(input.sessionId)!;
  }

  getCompactionBatch(
    sessionId: string,
    afterMessageId: number,
    preserveTailCount: number,
    batchSize: number
  ): MessageHistoryRecord[] {
    const tailRows = this.db
      .prepare(
        `
        SELECT id
        FROM messages
        WHERE session_id = ?
        ORDER BY id DESC
        LIMIT ?
      `
      )
      .all(sessionId, preserveTailCount) as Array<{ id: number }>;

    if (tailRows.length < preserveTailCount) {
      return [];
    }

    const oldestTailMessageId = Math.min(...tailRows.map((row) => Number(row.id)));
    const rows = this.db
      .prepare(
        `
        SELECT id, role, content, metadata_json, internal_trace, created_at
        FROM messages
        WHERE session_id = ? AND id > ? AND id < ?
        ORDER BY id ASC
        LIMIT ?
      `
      )
      .all(sessionId, afterMessageId, oldestTailMessageId, batchSize) as Array<{
      id: number;
      role: string;
      content: string;
      metadata_json: string | null;
      internal_trace: string | null;
      created_at: string;
    }>;

    if (rows.length < batchSize) {
      return [];
    }

    const attachmentsByMessageId = this.getMessageAttachments(rows.map((row) => row.id));
    return rows.map((row) => {
      const metadata = parseJson<Record<string, string>>(row.metadata_json);
      return {
        messageId: Number(row.id),
        id: String(row.id),
        role: row.role as NormalizedMessage["role"],
        content: row.content,
        attachments: attachmentsByMessageId.get(row.id) ?? undefined,
        createdAt: row.created_at,
        metadata,
        internalTrace: row.internal_trace ?? undefined,
        toolCallId: metadata.toolCallId,
        toolName: metadata.toolName
      };
    });
  }

  listPermanentMemories(
    actorScope: string,
    options: {
      state?: "active" | "forgotten";
      limit?: number;
    } = {}
  ): RuntimePermanentMemoryRecord[] {
    const state = options.state ?? "active";
    const limit = options.limit ?? 50;
    const rows = this.db
      .prepare(
        `
        SELECT
          id,
          actor_scope,
          category,
          summary_text,
          keywords_json,
          source_session_id,
          source_message_id,
          salience,
          state,
          recall_count,
          last_recalled_at,
          created_at,
          updated_at
        FROM permanent_memories
        WHERE actor_scope = ? AND state = ?
        ORDER BY updated_at DESC, id DESC
        LIMIT ?
      `
      )
      .all(actorScope, state, limit) as Array<{
      id: number;
      actor_scope: string;
      category: RuntimeMemoryCategory;
      summary_text: string;
      keywords_json: string;
      source_session_id: string;
      source_message_id: number;
      salience: number;
      state: "active" | "forgotten";
      recall_count: number;
      last_recalled_at: string | null;
      created_at: string;
      updated_at: string;
    }>;

    return rows.map((row) => ({
      id: Number(row.id),
      actorScope: row.actor_scope,
      category: row.category,
      summary: row.summary_text,
      keywords: Array.isArray(parseJson<unknown>(row.keywords_json))
        ? (parseJson<string[]>(row.keywords_json) ?? [])
        : [],
      sourceSessionId: row.source_session_id,
      sourceMessageId: Number(row.source_message_id),
      salience: Number(row.salience),
      state: row.state,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      lastRecalledAt: row.last_recalled_at ?? undefined,
      recallCount: Number(row.recall_count)
    }));
  }

  upsertPermanentMemory(input: PermanentMemoryUpsertInput): RuntimePermanentMemoryRecord {
    const timestamp = nowIso();
    const normalizedKey = normalizeMemoryKey(input.category, input.summary);
    this.db
      .prepare(
        `
        INSERT INTO permanent_memories (
          actor_scope,
          category,
          summary_text,
          normalized_key,
          keywords_json,
          source_session_id,
          source_message_id,
          salience,
          state,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(actor_scope, normalized_key) DO UPDATE SET
          category = excluded.category,
          summary_text = excluded.summary_text,
          keywords_json = excluded.keywords_json,
          source_session_id = excluded.source_session_id,
          source_message_id = excluded.source_message_id,
          salience = excluded.salience,
          state = excluded.state,
          updated_at = excluded.updated_at
      `
      )
      .run(
        input.actorScope,
        input.category,
        input.summary,
        normalizedKey,
        JSON.stringify(input.keywords),
        input.sourceSessionId,
        input.sourceMessageId,
        input.salience ?? 1,
        input.state ?? "active",
        timestamp,
        timestamp
      );

    const row = this.db
      .prepare(
        `
        SELECT
          id,
          actor_scope,
          category,
          summary_text,
          keywords_json,
          source_session_id,
          source_message_id,
          salience,
          state,
          recall_count,
          last_recalled_at,
          created_at,
          updated_at
        FROM permanent_memories
        WHERE actor_scope = ? AND normalized_key = ?
      `
      )
      .get(input.actorScope, normalizedKey) as {
      id: number;
      actor_scope: string;
      category: RuntimeMemoryCategory;
      summary_text: string;
      keywords_json: string;
      source_session_id: string;
      source_message_id: number;
      salience: number;
      state: "active" | "forgotten";
      recall_count: number;
      last_recalled_at: string | null;
      created_at: string;
      updated_at: string;
    };

    return {
      id: Number(row.id),
      actorScope: row.actor_scope,
      category: row.category,
      summary: row.summary_text,
      keywords: parseJson<string[]>(row.keywords_json) ?? [],
      sourceSessionId: row.source_session_id,
      sourceMessageId: Number(row.source_message_id),
      salience: Number(row.salience),
      state: row.state,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      lastRecalledAt: row.last_recalled_at ?? undefined,
      recallCount: Number(row.recall_count)
    };
  }

  forgetPermanentMemory(id: number, actorScope: string): boolean {
    const result = this.db
      .prepare(
        `
        UPDATE permanent_memories
        SET state = 'forgotten', updated_at = ?
        WHERE id = ? AND actor_scope = ?
      `
      )
      .run(nowIso(), id, actorScope);
    return Number(result.changes) > 0;
  }

  markPermanentMemoriesRecalled(ids: number[]): void {
    if (ids.length === 0) {
      return;
    }
    const placeholders = ids.map(() => "?").join(", ");
    const timestamp = nowIso();
    this.db
      .prepare(
        `
        UPDATE permanent_memories
        SET recall_count = recall_count + 1, last_recalled_at = ?, updated_at = ?
        WHERE id IN (${placeholders})
      `
      )
      .run(timestamp, timestamp, ...ids);
  }

  upsertOauthAccount(
    providerId: string,
    accountId: string,
    encryptedSecretJson: string,
    expiresAt?: string
  ): void {
    const timestamp = nowIso();
    this.db
      .prepare(
        `
        INSERT INTO oauth_accounts (provider_id, account_id, encrypted_secret_json, expires_at, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(provider_id, account_id) DO UPDATE SET
          encrypted_secret_json = excluded.encrypted_secret_json,
          expires_at = excluded.expires_at,
          updated_at = excluded.updated_at
      `
      )
      .run(providerId, accountId, encryptedSecretJson, expiresAt ?? null, timestamp, timestamp);
  }

  getOauthAccount(providerId: string, accountId: string): OauthAccountRecord | null {
    const row = this.db
      .prepare(
        `
        SELECT provider_id, account_id, encrypted_secret_json, expires_at, updated_at
        FROM oauth_accounts
        WHERE provider_id = ? AND account_id = ?
      `
      )
      .get(providerId, accountId) as
      | {
          provider_id: string;
          account_id: string;
          encrypted_secret_json: string;
          expires_at: string | null;
          updated_at: string;
        }
      | undefined;

    if (!row) {
      return null;
    }

    return {
      providerId: row.provider_id,
      accountId: row.account_id,
      encryptedSecretJson: row.encrypted_secret_json,
      expiresAt: row.expires_at ?? undefined,
      updatedAt: row.updated_at
    };
  }

  listOauthAccounts(providerId?: string): OauthAccountRecord[] {
    const rows = (
      providerId
        ? this.db
            .prepare(
              `
              SELECT provider_id, account_id, encrypted_secret_json, expires_at, updated_at
              FROM oauth_accounts
              WHERE provider_id = ?
              ORDER BY updated_at DESC
            `
            )
            .all(providerId)
        : this.db
            .prepare(
              `
              SELECT provider_id, account_id, encrypted_secret_json, expires_at, updated_at
              FROM oauth_accounts
              ORDER BY provider_id ASC, updated_at DESC
            `
            )
            .all()
    ) as Array<{
      provider_id: string;
      account_id: string;
      encrypted_secret_json: string;
      expires_at: string | null;
      updated_at: string;
    }>;

    return rows.map((row) => ({
      providerId: row.provider_id,
      accountId: row.account_id,
      encryptedSecretJson: row.encrypted_secret_json,
      expiresAt: row.expires_at ?? undefined,
      updatedAt: row.updated_at
    }));
  }

  deleteOauthAccount(providerId: string, accountId: string): boolean {
    const result = this.db
      .prepare(`DELETE FROM oauth_accounts WHERE provider_id = ? AND account_id = ?`)
      .run(providerId, accountId);
    return Number(result.changes) > 0;
  }

  createOauthFlow(flow: OauthFlowRecord): void {
    this.db
      .prepare(
        `
        INSERT INTO oauth_flows (
          state,
          provider_id,
          account_id,
          redirect_uri,
          code_verifier,
          expires_at,
          consumed_at,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `
      )
      .run(
        flow.state,
        flow.providerId,
        flow.accountId,
        flow.redirectUri,
        flow.codeVerifier,
        flow.expiresAt,
        flow.consumedAt ?? null,
        nowIso()
      );
  }

  getOauthFlow(state: string): OauthFlowRecord | null {
    const row = this.db
      .prepare(
        `
        SELECT state, provider_id, account_id, redirect_uri, code_verifier, expires_at, consumed_at
        FROM oauth_flows
        WHERE state = ?
      `
      )
      .get(state) as
      | {
          state: string;
          provider_id: string;
          account_id: string;
          redirect_uri: string;
          code_verifier: string;
          expires_at: string;
          consumed_at: string | null;
        }
      | undefined;

    if (!row) {
      return null;
    }

    return {
      state: row.state,
      providerId: row.provider_id,
      accountId: row.account_id,
      redirectUri: row.redirect_uri,
      codeVerifier: row.code_verifier,
      expiresAt: row.expires_at,
      consumedAt: row.consumed_at ?? undefined
    };
  }

  consumeOauthFlow(state: string): OauthFlowRecord | null {
    return this.runInTransaction(() => {
      const flow = this.getOauthFlow(state);
      if (!flow || flow.consumedAt) {
        return null;
      }

      this.db
        .prepare(`UPDATE oauth_flows SET consumed_at = ? WHERE state = ?`)
        .run(nowIso(), state);

      return {
        ...flow,
        consumedAt: nowIso()
      };
    });
  }

  markOauthFlowConsumed(state: string): boolean {
    return this.runInTransaction(() => {
      const flow = this.getOauthFlow(state);
      if (!flow || flow.consumedAt) {
        return false;
      }

      const consumedAt = nowIso();
      this.db
        .prepare(`UPDATE oauth_flows SET consumed_at = ? WHERE state = ?`)
        .run(consumedAt, state);
      return true;
    });
  }

  purgeExpiredOauthFlows(now = nowIso()): number {
    const result = this.db
      .prepare(`DELETE FROM oauth_flows WHERE expires_at < ?`)
      .run(now);
    return Number(result.changes);
  }

  createConfigGeneration(payload: Record<string, unknown>): ConfigGenerationRecord {
    const row = this.db
      .prepare(`SELECT COALESCE(MAX(generation), 0) as generation FROM config_generations`)
      .get() as { generation: number };

    const generation = row.generation + 1;
    const createdAt = nowIso();
    const result = this.db
      .prepare(
        `
        INSERT INTO config_generations (generation, status, payload_json, created_at)
        VALUES (?, 'candidate', ?, ?)
      `
      )
      .run(generation, JSON.stringify(payload), createdAt);

    return {
      id: Number(result.lastInsertRowid),
      generation,
      status: "candidate",
      payload,
      createdAt
    };
  }

  activateConfigGeneration(generation: number): void {
    const timestamp = nowIso();
    this.db
      .prepare(`UPDATE config_generations SET status = 'rolled_back', rolled_back_at = ? WHERE status = 'active'`)
      .run(timestamp);

    this.db
      .prepare(
        `
        UPDATE config_generations
        SET status = 'active', activated_at = ?
        WHERE generation = ?
      `
      )
      .run(timestamp, generation);
  }

  rollbackConfigGeneration(generation: number): void {
    this.db
      .prepare(
        `
        UPDATE config_generations
        SET status = 'rolled_back', rolled_back_at = ?
        WHERE generation = ?
      `
      )
      .run(nowIso(), generation);
  }

  updateModuleHealth(moduleId: string, status: "healthy" | "degraded" | "unhealthy", message?: string): void {
    this.db
      .prepare(
        `
        INSERT INTO module_health (module_id, status, message, updated_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(module_id) DO UPDATE SET
          status = excluded.status,
          message = excluded.message,
          updated_at = excluded.updated_at
      `
      )
      .run(moduleId, status, message ?? null, nowIso());
  }

  getModuleHealth(): Array<{ moduleId: string; status: string; message?: string }> {
    const rows = this.db
      .prepare(`SELECT module_id, status, message FROM module_health ORDER BY module_id ASC`)
      .all() as Array<{ module_id: string; status: string; message: string | null }>;

    return rows.map((row) => ({
      moduleId: row.module_id,
      status: row.status,
      message: row.message ?? undefined
    }));
  }

  registerSkill(id: string, version: string, manifest: Record<string, unknown>): void {
    this.db
      .prepare(
        `
        INSERT INTO skill_registry (id, version, manifest_json, installed_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          version = excluded.version,
          manifest_json = excluded.manifest_json,
          installed_at = excluded.installed_at
      `
      )
      .run(id, version, JSON.stringify(manifest), nowIso());
  }

  listRegisteredSkills(): Array<{ id: string; version: string; manifest: Record<string, unknown> }> {
    const rows = this.db
      .prepare(`SELECT id, version, manifest_json FROM skill_registry ORDER BY id ASC`)
      .all() as Array<{ id: string; version: string; manifest_json: string }>;

    return rows.map((row) => ({
      id: row.id,
      version: row.version,
      manifest: parseJson<Record<string, unknown>>(row.manifest_json)
    }));
  }

  upsertManagedCapability(input: ManagedCapabilityUpsertInput): void {
    const timestamp = nowIso();
    this.db
      .prepare(
        `
        INSERT INTO managed_capabilities (
          kind,
          id,
          install_root,
          installer,
          summary,
          update_safe,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(kind, id) DO UPDATE SET
          install_root = excluded.install_root,
          installer = excluded.installer,
          summary = excluded.summary,
          update_safe = excluded.update_safe,
          updated_at = excluded.updated_at
      `
      )
      .run(
        input.kind,
        input.id,
        input.installRoot,
        input.installer,
        input.summary,
        input.updateSafe ? 1 : 0,
        timestamp,
        timestamp
      );
  }

  deleteManagedCapabilitiesNotInSet(kind: ManagedCapabilityKind, ids: string[]): void {
    if (ids.length === 0) {
      this.db.prepare(`DELETE FROM managed_capabilities WHERE kind = ?`).run(kind);
      return;
    }

    const placeholders = ids.map(() => "?").join(", ");
    this.db
      .prepare(
        `DELETE FROM managed_capabilities WHERE kind = ? AND id NOT IN (${placeholders})`
      )
      .run(kind, ...ids);
  }

  listManagedCapabilities(kind?: ManagedCapabilityKind): ManagedCapabilityRecord[] {
    const rows = (
      kind
        ? this.db
            .prepare(
              `
                SELECT kind, id, install_root, installer, summary, update_safe, created_at, updated_at
                FROM managed_capabilities
                WHERE kind = ?
                ORDER BY kind ASC, id ASC
              `
            )
            .all(kind)
        : this.db
            .prepare(
              `
                SELECT kind, id, install_root, installer, summary, update_safe, created_at, updated_at
                FROM managed_capabilities
                ORDER BY kind ASC, id ASC
              `
            )
            .all()
    ) as Array<{
      kind: ManagedCapabilityKind;
      id: string;
      install_root: string;
      installer: string;
      summary: string;
      update_safe: number;
      created_at: string;
      updated_at: string;
    }>;

    return rows.map((row) => ({
      kind: row.kind,
      id: row.id,
      installRoot: row.install_root,
      installer: row.installer,
      summary: row.summary,
      updateSafe: row.update_safe === 1,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }));
  }

  getManagedCapability(kind: ManagedCapabilityKind, id: string): ManagedCapabilityRecord | null {
    const row = this.db
      .prepare(
        `
          SELECT kind, id, install_root, installer, summary, update_safe, created_at, updated_at
          FROM managed_capabilities
          WHERE kind = ? AND id = ?
        `
      )
      .get(kind, id) as
      | {
          kind: ManagedCapabilityKind;
          id: string;
          install_root: string;
          installer: string;
          summary: string;
          update_safe: number;
          created_at: string;
          updated_at: string;
        }
      | undefined;

    if (!row) {
      return null;
    }

    return {
      kind: row.kind,
      id: row.id,
      installRoot: row.install_root,
      installer: row.installer,
      summary: row.summary,
      updateSafe: row.update_safe === 1,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  getSetting<T>(key: string): T | null {
    const row = this.db
      .prepare(`SELECT value_json FROM system_settings WHERE key = ?`)
      .get(key) as { value_json: string } | undefined;
    if (!row) {
      return null;
    }
    return parseJson<T>(row.value_json);
  }

  setSetting(key: string, value: unknown): void {
    this.db
      .prepare(
        `
        INSERT INTO system_settings (key, value_json, updated_at)
        VALUES (?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET
          value_json = excluded.value_json,
          updated_at = excluded.updated_at
      `
      )
      .run(key, JSON.stringify(value), nowIso());
  }

  getTaskCursor(taskId: string): ScheduledTaskCursorRecord | null {
    const row = this.db
      .prepare(
        `
        SELECT task_id, last_planned_for, last_enqueued_for, updated_at
        FROM scheduled_task_cursors
        WHERE task_id = ?
      `
      )
      .get(taskId) as
      | {
          task_id: string;
          last_planned_for: string | null;
          last_enqueued_for: string | null;
          updated_at: string;
        }
      | undefined;

    if (!row) {
      return null;
    }

    return {
      taskId: row.task_id,
      lastPlannedFor: row.last_planned_for ?? undefined,
      lastEnqueuedFor: row.last_enqueued_for ?? undefined,
      updatedAt: row.updated_at
    };
  }

  upsertTaskCursor(
    taskId: string,
    values: {
      lastPlannedFor?: string;
      lastEnqueuedFor?: string;
    }
  ): void {
    const existing = this.getTaskCursor(taskId);
    this.db
      .prepare(
        `
        INSERT INTO scheduled_task_cursors (task_id, last_planned_for, last_enqueued_for, updated_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(task_id) DO UPDATE SET
          last_planned_for = excluded.last_planned_for,
          last_enqueued_for = excluded.last_enqueued_for,
          updated_at = excluded.updated_at
      `
      )
      .run(
        taskId,
        values.lastPlannedFor ?? existing?.lastPlannedFor ?? null,
        values.lastEnqueuedFor ?? existing?.lastEnqueuedFor ?? null,
        nowIso()
      );
  }

  createScheduledRun(taskId: string, scheduledFor: string, startedAt = nowIso()): number {
    const result = this.db
      .prepare(
        `
        INSERT INTO scheduled_task_runs (task_id, scheduled_for, started_at, status)
        VALUES (?, ?, ?, 'running')
      `
      )
      .run(taskId, scheduledFor, startedAt);
    return Number(result.lastInsertRowid);
  }

  completeScheduledRunSuccess(
    runId: number,
    output?: Record<string, unknown>,
    transportMessageId?: string
  ): void {
    this.db
      .prepare(
        `
        UPDATE scheduled_task_runs
        SET status = 'succeeded',
            finished_at = ?,
            output_json = ?,
            transport_message_id = ?
        WHERE id = ?
      `
      )
      .run(nowIso(), output ? JSON.stringify(output) : null, transportMessageId ?? null, runId);
  }

  completeScheduledRunFailure(runId: number, errorText: string): void {
    this.db
      .prepare(
        `
        UPDATE scheduled_task_runs
        SET status = 'failed',
            finished_at = ?,
            error_text = ?
        WHERE id = ?
      `
      )
      .run(nowIso(), errorText, runId);
  }

  getLatestScheduledRuns(limit: number, taskId?: string): ScheduledTaskRunRecord[] {
    const rows = (
      taskId
        ? this.db
            .prepare(
              `
              SELECT id, task_id, scheduled_for, started_at, finished_at, status, output_json, error_text, transport_message_id
              FROM scheduled_task_runs
              WHERE task_id = ?
              ORDER BY id DESC
              LIMIT ?
            `
            )
            .all(taskId, limit)
        : this.db
            .prepare(
              `
              SELECT id, task_id, scheduled_for, started_at, finished_at, status, output_json, error_text, transport_message_id
              FROM scheduled_task_runs
              ORDER BY id DESC
              LIMIT ?
            `
            )
            .all(limit)
    ) as Array<{
      id: number;
      task_id: string;
      scheduled_for: string;
      started_at: string;
      finished_at: string | null;
      status: "running" | "succeeded" | "failed";
      output_json: string | null;
      error_text: string | null;
      transport_message_id: string | null;
    }>;

    return rows.map((row) => ({
      id: row.id,
      taskId: row.task_id,
      scheduledFor: row.scheduled_for,
      startedAt: row.started_at,
      finishedAt: row.finished_at ?? undefined,
      status: row.status,
      output: row.output_json ? parseJson<Record<string, unknown>>(row.output_json) : undefined,
      errorText: row.error_text ?? undefined,
      transportMessageId: row.transport_message_id ?? undefined
    }));
  }

  insertClockCheck(
    status: "healthy" | "degraded" | "unhealthy",
    source?: string,
    offsetMs?: number,
    details?: Record<string, unknown>
  ): number {
    const result = this.db
      .prepare(
        `
        INSERT INTO clock_checks (checked_at, status, source, offset_ms, details_json)
        VALUES (?, ?, ?, ?, ?)
      `
      )
      .run(nowIso(), status, source ?? null, offsetMs ?? null, details ? JSON.stringify(details) : null);
    return Number(result.lastInsertRowid);
  }

  getLatestClockCheck(): ClockCheckRecord | null {
    const row = this.db
      .prepare(
        `
        SELECT id, checked_at, status, source, offset_ms, details_json
        FROM clock_checks
        ORDER BY id DESC
        LIMIT 1
      `
      )
      .get() as
      | {
          id: number;
          checked_at: string;
          status: "healthy" | "degraded" | "unhealthy";
          source: string | null;
          offset_ms: number | null;
          details_json: string | null;
        }
      | undefined;

    if (!row) {
      return null;
    }

    return {
      id: row.id,
      checkedAt: row.checked_at,
      status: row.status,
      source: row.source ?? undefined,
      offsetMs: row.offset_ms ?? undefined,
      details: row.details_json ? parseJson<Record<string, unknown>>(row.details_json) : undefined
    };
  }

  startToolInvocation(input: {
    sessionId: string;
    conversationKey: string;
    toolCallId: string;
    toolName: string;
    actorId: string;
    request: Record<string, unknown>;
  }): number {
    const startedAt = nowIso();
    const result = this.db
      .prepare(
        `
        INSERT INTO tool_invocations (
          session_id,
          conversation_key,
          tool_call_id,
          tool_name,
          actor_id,
          request_json,
          status,
          started_at
        )
        VALUES (?, ?, ?, ?, ?, ?, 'running', ?)
      `
      )
      .run(
        input.sessionId,
        input.conversationKey,
        input.toolCallId,
        input.toolName,
        input.actorId,
        JSON.stringify(redactSensitiveData(input.request)),
        startedAt
      );
    return Number(result.lastInsertRowid);
  }

  finishToolInvocationSuccess(
    invocationId: number,
    resultPayload: Record<string, unknown>,
    durationMs: number
  ): void {
    this.db
      .prepare(
        `
        UPDATE tool_invocations
        SET status = 'succeeded',
            result_json = ?,
            finished_at = ?,
            duration_ms = ?
        WHERE id = ?
      `
      )
      .run(JSON.stringify(redactSensitiveData(resultPayload)), nowIso(), durationMs, invocationId);
  }

  finishToolInvocationFailure(
    invocationId: number,
    errorText: string,
    durationMs: number,
    resultPayload?: Record<string, unknown>,
    status: "failed" | "blocked" = "failed"
  ): void {
    this.db
      .prepare(
        `
        UPDATE tool_invocations
        SET status = ?,
            result_json = ?,
            error_text = ?,
            finished_at = ?,
            duration_ms = ?
        WHERE id = ?
      `
      )
      .run(
        status,
        resultPayload ? JSON.stringify(redactSensitiveData(resultPayload)) : null,
        errorText,
        nowIso(),
        durationMs,
        invocationId
      );
  }

  listToolInvocations(sessionId?: string, limit = 50): ToolInvocationRecord[] {
    const normalizedLimit = Math.max(1, Math.min(limit, 500));
    const rows = (
      sessionId
        ? this.db
            .prepare(
              `
              SELECT
                id,
                session_id,
                conversation_key,
                tool_call_id,
                tool_name,
                actor_id,
                request_json,
                result_json,
                status,
                error_text,
                started_at,
                finished_at,
                duration_ms
              FROM tool_invocations
              WHERE session_id = ?
              ORDER BY id DESC
              LIMIT ?
            `
            )
            .all(sessionId, normalizedLimit)
        : this.db
            .prepare(
              `
              SELECT
                id,
                session_id,
                conversation_key,
                tool_call_id,
                tool_name,
                actor_id,
                request_json,
                result_json,
                status,
                error_text,
                started_at,
                finished_at,
                duration_ms
              FROM tool_invocations
              ORDER BY id DESC
              LIMIT ?
            `
            )
            .all(normalizedLimit)
    ) as Array<{
      id: number;
      session_id: string;
      conversation_key: string;
      tool_call_id: string;
      tool_name: string;
      actor_id: string;
      request_json: string;
      result_json: string | null;
      status: "running" | "succeeded" | "failed" | "blocked";
      error_text: string | null;
      started_at: string;
      finished_at: string | null;
      duration_ms: number | null;
    }>;

    return rows.map((row) => ({
      id: row.id,
      sessionId: row.session_id,
      conversationKey: row.conversation_key,
      toolCallId: row.tool_call_id,
      toolName: row.tool_name,
      actorId: row.actor_id,
      request: redactSensitiveData(parseJson<Record<string, unknown>>(row.request_json)),
      result: row.result_json
        ? redactSensitiveData(parseJson<Record<string, unknown>>(row.result_json))
        : undefined,
      status: row.status,
      errorText: row.error_text ?? undefined,
      startedAt: row.started_at,
      finishedAt: row.finished_at ?? undefined,
      durationMs: row.duration_ms ?? undefined
    }));
  }
}
