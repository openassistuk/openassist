import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createLogger } from "../../packages/observability/src/index.js";
import {
  cleanupStagedAttachments,
  ingestInboundAttachments,
  stageOutboundAttachments
} from "../../packages/core-runtime/src/attachments.js";
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
    expect(result.notes[0]).toMatch(
      /only plain-text, markdown, CSV, JSON, and YAML-style documents are supported/i
    );
    expect(result.content).toContain("Attachment processing notes:");
  });
});

describe("runtime outbound attachment staging", () => {
  it("copies bounded outbound attachments into a private staging area and cleans them up", async () => {
    const root = tempDir("openassist-outbound-stage-");
    roots.push(root);
    const sourceA = path.join(root, "report.txt");
    const sourceB = path.join(root, "chart.png");
    fs.writeFileSync(sourceA, "report", "utf8");
    fs.writeFileSync(sourceB, "png", "utf8");

    const staged = await stageOutboundAttachments({
      attachmentsDir: path.join(root, "outbound"),
      sourcePaths: [sourceA, sourceB],
      attachmentsConfig: {
        maxFilesPerMessage: 2,
        maxImageBytes: 1024,
        maxDocumentBytes: 1024,
        maxExtractedChars: 2000
      },
      logger: createLogger({ service: "test" })
    });

    expect(staged.notes).toEqual([]);
    expect(staged.attachments).toHaveLength(2);
    expect(staged.attachments[0]?.localPath).not.toBe(sourceA);
    expect(fs.existsSync(staged.attachments[0]!.localPath)).toBe(true);
    expect(fs.existsSync(staged.attachments[1]!.localPath)).toBe(true);

    await cleanupStagedAttachments(staged.attachments);
    expect(fs.existsSync(staged.attachments[0]!.localPath)).toBe(false);
    expect(fs.existsSync(staged.attachments[1]!.localPath)).toBe(false);
  });

  it("keeps limits explicit when outbound attachments exceed the configured count or size", async () => {
    const root = tempDir("openassist-outbound-stage-limits-");
    roots.push(root);
    const small = path.join(root, "small.txt");
    const large = path.join(root, "large.txt");
    const extra = path.join(root, "extra.txt");
    fs.writeFileSync(small, "ok", "utf8");
    fs.writeFileSync(large, "0123456789", "utf8");
    fs.writeFileSync(extra, "extra", "utf8");

    const staged = await stageOutboundAttachments({
      attachmentsDir: path.join(root, "outbound"),
      sourcePaths: [small, large, extra],
      attachmentsConfig: {
        maxFilesPerMessage: 2,
        maxImageBytes: 1024,
        maxDocumentBytes: 4,
        maxExtractedChars: 2000
      },
      logger: createLogger({ service: "test" })
    });

    expect(staged.attachments).toHaveLength(1);
    expect(staged.attachments[0]?.name).toBe("small.txt");
    expect(staged.notes.join(" ")).toMatch(/Only the first 2 outbound attachments were kept/i);
    expect(staged.notes.join(" ")).toMatch(/large\.txt was skipped because it is larger/i);
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
      (_, index) =>
        `## Section ${index + 1}\nA short paragraph that is long enough to trigger chunking when repeated many times.`
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

  it("keeps attachments and replies on the first chunk while preserving direct-recipient routing", () => {
    const chunks = renderOutboundEnvelope({
      channel: "discord",
      conversationKey: "channel-1",
      directRecipientUserId: "operator-1",
      replyToTransportMessageId: "msg-9",
      text: Array.from({ length: 500 }, (_, index) => `Paragraph ${index + 1}.`).join(" "),
      attachments: [
        {
          id: "doc-1",
          kind: "document",
          name: "report.txt",
          localPath: "/tmp/report.txt",
          mimeType: "text/plain"
        }
      ],
      metadata: {}
    });

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0]?.attachments).toHaveLength(1);
    expect(chunks[0]?.replyToTransportMessageId).toBe("msg-9");
    expect(chunks[0]?.directRecipientUserId).toBe("operator-1");
    expect(chunks.slice(1).every((chunk) => chunk.attachments === undefined)).toBe(true);
    expect(chunks.slice(1).every((chunk) => chunk.replyToTransportMessageId === undefined)).toBe(true);
    expect(chunks.slice(1).every((chunk) => chunk.directRecipientUserId === "operator-1")).toBe(true);
  });
});
