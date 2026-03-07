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
