import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createLogger } from "../../packages/observability/src/index.js";
import { ingestInboundAttachments } from "../../packages/core-runtime/src/attachments.js";
import { renderOutboundEnvelope } from "../../packages/core-runtime/src/channel-rendering.js";

function tempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

describe("runtime attachment ingest", () => {
  it("persists text-like documents, extracts bounded text, and appends attachment context", async () => {
    const root = tempDir("openassist-attachments-");
    roots.push(root);
    const stagingPath = path.join(root, "staging-note.txt");
    fs.writeFileSync(stagingPath, "hello from attachment body", "utf8");

    const result = await ingestInboundAttachments({
      attachmentsDir: path.join(root, "runtime-attachments"),
      envelope: {
        channel: "telegram",
        channelId: "telegram-main",
        transportMessageId: "msg-1",
        conversationKey: "chat-1",
        senderId: "u1",
        text: "please review",
        attachments: [
          {
            id: "doc-1",
            kind: "document",
            name: "note.txt",
            mimeType: "text/plain",
            localPath: stagingPath
          }
        ],
        receivedAt: new Date().toISOString(),
        idempotencyKey: "attachment-1"
      },
      logger: createLogger({ service: "test" })
    });

    expect(result.attachments).toHaveLength(1);
    expect(result.attachments[0]?.extractedText).toContain("hello from attachment body");
    expect(result.attachments[0]?.localPath).not.toBe(stagingPath);
    expect(fs.existsSync(result.attachments[0]!.localPath!)).toBe(true);
    expect(result.content).toContain("please review");
    expect(result.content).toContain("Document attachment: note.txt");
    expect(result.content).toContain("Extracted text:");
  });

  it("reports unsupported documents instead of silently dropping them", async () => {
    const root = tempDir("openassist-attachments-unsupported-");
    roots.push(root);
    const stagingPath = path.join(root, "diagram.pdf");
    fs.writeFileSync(stagingPath, "%PDF-1.7", "utf8");

    const result = await ingestInboundAttachments({
      attachmentsDir: path.join(root, "runtime-attachments"),
      envelope: {
        channel: "telegram",
        channelId: "telegram-main",
        transportMessageId: "msg-2",
        conversationKey: "chat-1",
        senderId: "u1",
        text: "",
        attachments: [
          {
            id: "doc-unsupported",
            kind: "document",
            name: "diagram.pdf",
            mimeType: "application/pdf",
            localPath: stagingPath
          }
        ],
        receivedAt: new Date().toISOString(),
        idempotencyKey: "attachment-2"
      },
      logger: createLogger({ service: "test" })
    });

    expect(result.attachments).toHaveLength(0);
    expect(result.notes[0]).toMatch(/only plain-text, markdown, CSV, JSON, and YAML-style documents are supported/i);
    expect(result.content).toContain("Attachment processing notes:");
  });
});

describe("channel reply rendering", () => {
  it("renders Telegram replies as safe HTML with structure preserved", () => {
    const chunks = renderOutboundEnvelope({
      channel: "telegram",
      conversationKey: "chat-1",
      text: "# Heading\n\n- one\n- two\n\n`inline`\n\n```ts\nconst x = 1;\n```",
      metadata: {}
    });

    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.metadata.renderFormat).toBe("telegram-html");
    expect(chunks[0]?.text).toContain("<b>Heading</b>");
    expect(chunks[0]?.text).toContain("• one");
    expect(chunks[0]?.text).toContain("<code>inline</code>");
    expect(chunks[0]?.text).toContain("<pre><code>const x = 1;");
  });

  it("keeps escaped Telegram code chunks within the channel limit", () => {
    const noisyCode = `<tag attr="value">&</tag>\n`.repeat(500);
    const chunks = renderOutboundEnvelope({
      channel: "telegram",
      conversationKey: "chat-1",
      text: `\`\`\`html\n${noisyCode}\n\`\`\``,
      metadata: {}
    });

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.text.length <= 3800)).toBe(true);
    expect(chunks.every((chunk) => chunk.metadata.renderFormat === "telegram-html")).toBe(true);
  });

  it("splits long Discord replies on semantic boundaries", () => {
    const longText = Array.from(
      { length: 120 },
      (_, index) => `## Section ${index + 1}\nA short paragraph that is long enough to trigger chunking when repeated many times.`
    ).join("\n\n");
    const chunks = renderOutboundEnvelope({
      channel: "discord",
      conversationKey: "discord-1",
      text: longText,
      metadata: {}
    });

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0]?.text).toContain("**Section 1**");
    expect(chunks.every((chunk) => chunk.text.length <= 1800)).toBe(true);
  });
});
