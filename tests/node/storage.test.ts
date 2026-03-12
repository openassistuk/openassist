import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { createLogger } from "../../packages/observability/src/index.js";
import { OpenAssistDatabase } from "../../packages/storage-sqlite/src/index.js";

function tempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("OpenAssistDatabase", () => {
  it("deduplicates inbound messages by idempotency key", () => {
    const root = tempDir("openassist-db-");
    roots.push(root);

    const db = new OpenAssistDatabase({
      dbPath: path.join(root, "openassist.db"),
      logger: createLogger({ service: "test" })
    });

    const envelope = {
      channel: "telegram" as const,
      channelId: "telegram-main",
      transportMessageId: "1",
      conversationKey: "c1",
      senderId: "u1",
      text: "hello",
      attachments: [],
      receivedAt: new Date().toISOString(),
      idempotencyKey: "idemp-1"
    };

    const first = db.recordInbound("telegram-main:c1", envelope);
    const second = db.recordInbound("telegram-main:c1", envelope);

    assert.equal(first, true);
    assert.equal(second, false);
    db.close();
  });

  it("moves jobs to dead letters after max attempts", () => {
    const root = tempDir("openassist-db-jobs-");
    roots.push(root);

    const db = new OpenAssistDatabase({
      dbPath: path.join(root, "openassist.db"),
      logger: createLogger({ service: "test" })
    });

    const jobId = db.enqueueJob("test", { x: 1 }, { maxAttempts: 1, initialDelayMs: 1, maxDelayMs: 1 });
    const jobs = db.claimDueJobs(10);
    assert.ok(jobs.map((job) => job.id).includes(jobId));

    db.markJobFailed(jobId, "boom", 1);
    const next = db.claimDueJobs(10);
    assert.equal(next.length, 0);
    db.close();
  });

  it("round-trips tool message metadata fields for recent-message replay", () => {
    const root = tempDir("openassist-storage-tools-");
    roots.push(root);

    const logger = createLogger({ service: "test" });
    const db = new OpenAssistDatabase({ dbPath: path.join(root, "openassist.db"), logger });

    const sessionId = "telegram-main:c1";
    const conversationKey = "c1";
    db.recordAssistantMessage(sessionId, conversationKey, {
      role: "assistant",
      content: "",
      toolCallId: "tool-1",
      toolName: "fs.read",
      metadata: {
        toolArgumentsJson: "{\"path\":\"/tmp/a.txt\"}"
      }
    });
    db.recordAssistantMessage(sessionId, conversationKey, {
      role: "tool",
      content: "file-content",
      toolCallId: "tool-1",
      toolName: "fs.read",
      metadata: {
        isError: "false"
      }
    });

    const rows = db.getRecentMessages(sessionId, 10);
    assert.equal(rows.length, 2);
    assert.equal(rows[0]?.toolCallId, "tool-1");
    assert.equal(rows[0]?.toolName, "fs.read");
    assert.equal(rows[1]?.toolCallId, "tool-1");
    assert.equal(rows[1]?.toolName, "fs.read");

    db.close();
  });

  it("round-trips attachment metadata for recent-message replay", () => {
    const root = tempDir("openassist-storage-attachments-");
    roots.push(root);

    const logger = createLogger({ service: "test" });
    const db = new OpenAssistDatabase({ dbPath: path.join(root, "openassist.db"), logger });
    const attachmentPath = path.join(root, "attachments", "note.txt");
    fs.mkdirSync(path.dirname(attachmentPath), { recursive: true });
    fs.writeFileSync(attachmentPath, "hello from attachment", "utf8");

    const sessionId = "telegram-main:c1";
    const envelope = {
      channel: "telegram" as const,
      channelId: "telegram-main",
      transportMessageId: "1",
      conversationKey: "c1",
      senderId: "u1",
      text: "see attached",
      attachments: [
        {
          id: "attachment-1",
          kind: "document" as const,
          name: "note.txt",
          mimeType: "text/plain",
          localPath: attachmentPath,
          sizeBytes: 21,
          captionText: "see attached",
          extractedText: "hello from attachment"
        }
      ],
      receivedAt: new Date().toISOString(),
      idempotencyKey: "idemp-attachment-1"
    };

    const accepted = db.recordInbound(sessionId, envelope);
    assert.equal(accepted, true);

    const rows = db.getRecentMessages(sessionId, 10);
    assert.equal(rows.length, 1);
    assert.equal(rows[0]?.attachments?.length, 1);
    assert.equal(rows[0]?.attachments?.[0]?.name, "note.txt");
    assert.equal(rows[0]?.attachments?.[0]?.localPath, attachmentPath);
    assert.equal(rows[0]?.attachments?.[0]?.extractedText, "hello from attachment");

    db.close();
  });

  it("stores and updates session bootstrap memory", () => {
    const root = tempDir("openassist-db-session-bootstrap-");
    roots.push(root);

    const db = new OpenAssistDatabase({
      dbPath: path.join(root, "openassist.db"),
      logger: createLogger({ service: "test" })
    });

    const inserted = db.upsertSessionBootstrap({
      sessionId: "telegram-main:c1",
      assistantName: "OpenAssist",
      persona: "Direct",
      operatorPreferences: "Use apt",
      coreIdentity: "OpenAssist local gateway",
      systemProfile: {
        platform: "linux",
        arch: "x64"
      }
    });

    assert.equal(inserted.sessionId, "telegram-main:c1");
    assert.equal(inserted.firstContactPrompted, false);

    db.markSessionBootstrapPrompted("telegram-main:c1");
    const prompted = db.getSessionBootstrap("telegram-main:c1");
    assert.equal(prompted?.firstContactPrompted, true);

    db.upsertSessionBootstrap({
      sessionId: "telegram-main:c1",
      assistantName: "Nova",
      persona: "Execution-focused",
      operatorPreferences: "Keep it concise",
      coreIdentity: "OpenAssist local gateway",
      systemProfile: {
        platform: "linux",
        arch: "x64"
      },
      firstContactPrompted: true
    });

    const updated = db.getSessionBootstrap("telegram-main:c1");
    assert.equal(updated?.assistantName, "Nova");
    assert.equal(updated?.persona, "Execution-focused");
    assert.equal(updated?.operatorPreferences, "Keep it concise");
    assert.equal(updated?.firstContactPrompted, true);

    db.close();
  });

  it("stores session compaction memory and returns compactable batches", () => {
    const root = tempDir("openassist-db-session-memory-");
    roots.push(root);

    const db = new OpenAssistDatabase({
      dbPath: path.join(root, "openassist.db"),
      logger: createLogger({ service: "test" })
    });

    const sessionId = "telegram-main:c1";
    for (let index = 1; index <= 16; index += 1) {
      if (index % 2 === 1) {
        db.recordInbound(sessionId, {
          channel: "telegram",
          channelId: "telegram-main",
          transportMessageId: `m-${index}`,
          conversationKey: "c1",
          senderId: "u1",
          text: `user-${index}`,
          attachments: [],
          receivedAt: new Date(Date.now() + index).toISOString(),
          idempotencyKey: `idemp-${index}`
        });
      } else {
        db.recordAssistantMessage(sessionId, "c1", {
          role: "assistant",
          content: `assistant-${index}`
        });
      }
    }

    const batch = db.getCompactionBatch(sessionId, 0, 8, 8);
    assert.equal(batch.length, 8);
    assert.equal(batch[0]?.content, "user-1");
    assert.equal(batch[7]?.content, "assistant-8");

    const stored = db.upsertSessionMemory({
      sessionId,
      summary: "Conversation summary",
      lastCompactedMessageId: batch[7]!.messageId
    });
    assert.equal(stored.summary, "Conversation summary");
    assert.equal(stored.lastCompactedMessageId, batch[7]!.messageId);
    assert.equal(db.getSessionMemory(sessionId)?.summary, "Conversation summary");

    const stale = db.upsertSessionMemory({
      sessionId,
      summary: "Older summary should not overwrite",
      lastCompactedMessageId: batch[3]!.messageId
    });
    assert.equal(stale.summary, "Conversation summary");
    assert.equal(stale.lastCompactedMessageId, batch[7]!.messageId);

    db.close();
  });

  it("upserts, recalls, and forgets actor-scoped permanent memories", () => {
    const root = tempDir("openassist-db-permanent-memory-");
    roots.push(root);

    const db = new OpenAssistDatabase({
      dbPath: path.join(root, "openassist.db"),
      logger: createLogger({ service: "test" })
    });

    const first = db.upsertPermanentMemory({
      actorScope: "telegram-main:u1",
      category: "preference",
      summary: "Use Debian apt commands when suggesting package installs.",
      keywords: ["debian", "apt"],
      sourceSessionId: "telegram-main:c1",
      sourceMessageId: 10,
      salience: 4
    });
    const second = db.upsertPermanentMemory({
      actorScope: "telegram-main:u1",
      category: "preference",
      summary: "Use Debian apt commands when suggesting package installs.",
      keywords: ["debian", "apt", "packages"],
      sourceSessionId: "telegram-main:c2",
      sourceMessageId: 20,
      salience: 5
    });

    assert.equal(first.id, second.id);
    const memories = db.listPermanentMemories("telegram-main:u1");
    assert.equal(memories.length, 1);
    assert.equal(memories[0]?.salience, 5);
    assert.equal(memories[0]?.keywords.includes("packages"), true);

    db.markPermanentMemoriesRecalled([second.id]);
    const recalled = db.listPermanentMemories("telegram-main:u1");
    assert.equal(recalled[0]?.recallCount, 1);
    assert.ok(recalled[0]?.lastRecalledAt);

    assert.equal(db.listPermanentMemories("telegram-main:u2").length, 0);
    assert.equal(db.listPermanentMemories("discord-main:u1").length, 0);
    assert.equal(db.forgetPermanentMemory(second.id, "telegram-main:u1"), true);
    assert.equal(db.listPermanentMemories("telegram-main:u1").length, 0);

    db.close();
  });

  it("redacts secret-like tool invocation payload fields", () => {
    const root = tempDir("openassist-db-tool-redaction-");
    roots.push(root);

    const db = new OpenAssistDatabase({
      dbPath: path.join(root, "openassist.db"),
      logger: createLogger({ service: "test" })
    });

    const invocationId = db.startToolInvocation({
      sessionId: "telegram-main:c1",
      conversationKey: "c1",
      toolCallId: "tool-1",
      toolName: "exec.run",
      actorId: "assistant",
      request: {
        command: "echo hello",
        env: {
          OPENASSIST_TEST_SECRET: "sk-test-long-key-value",
          PATH: "/usr/bin"
        },
        apiKey: "sk-test-another-key"
      }
    });
    db.finishToolInvocationSuccess(
      invocationId,
      {
        stdout: "sk-test-long-key-value",
        accessToken: "sk-test-token-value"
      },
      42
    );

    const rows = db.listToolInvocations("telegram-main:c1", 10);
    assert.equal(rows.length, 1);
    assert.equal((rows[0]?.request.env as Record<string, string>)?.OPENASSIST_TEST_SECRET, "[REDACTED]");
    assert.equal((rows[0]?.request.env as Record<string, string>)?.PATH, "[REDACTED]");
    assert.equal(rows[0]?.request.apiKey, "[REDACTED]");
    assert.equal(rows[0]?.result?.accessToken, "[REDACTED]");
    assert.equal(rows[0]?.result?.stdout, "[REDACTED]");

    db.close();
  });

  it("stores, updates, lists, and prunes managed capabilities", () => {
    const root = tempDir("openassist-db-managed-capabilities-");
    roots.push(root);

    const db = new OpenAssistDatabase({
      dbPath: path.join(root, "openassist.db"),
      logger: createLogger({ service: "test" })
    });

    db.upsertManagedCapability({
      kind: "skill",
      id: "disk-maintenance",
      installRoot: path.join(root, "skills", "disk-maintenance"),
      installer: "skill-path-copy",
      summary: "Disk maintenance skill",
      updateSafe: true
    });
    db.upsertManagedCapability({
      kind: "helper-tool",
      id: "ripgrep-helper",
      installRoot: path.join(root, "helper-tools", "ripgrep"),
      installer: "manual",
      summary: "Local search helper",
      updateSafe: true
    });

    const insertedSkill = db.getManagedCapability("skill", "disk-maintenance");
    assert.ok(insertedSkill);
    assert.equal(insertedSkill?.summary, "Disk maintenance skill");

    db.upsertManagedCapability({
      kind: "helper-tool",
      id: "ripgrep-helper",
      installRoot: path.join(root, "helper-tools", "ripgrep"),
      installer: "pkg.install",
      summary: "Updated helper metadata",
      updateSafe: false
    });

    const helpers = db.listManagedCapabilities("helper-tool");
    assert.equal(helpers.length, 1);
    assert.equal(helpers[0]?.installer, "pkg.install");
    assert.equal(helpers[0]?.updateSafe, false);

    db.deleteManagedCapabilitiesNotInSet("skill", []);
    assert.equal(db.listManagedCapabilities("skill").length, 0);

    db.close();
  });
});
