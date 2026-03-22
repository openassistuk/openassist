import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
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

  it("keeps image summaries, sanitized staged names, and explicit ingest notes for missing or oversized inputs", async () => {
    const root = tempDir("openassist-attachments-mixed-");
    roots.push(root);
    const smallImagePath = path.join(root, "photo file.png");
    const largeImagePath = path.join(root, "huge.png");
    const yamlPath = path.join(root, "config file.yaml");
    const ignoredPath = path.join(root, "ignored.txt");
    fs.writeFileSync(smallImagePath, "png", "utf8");
    fs.writeFileSync(largeImagePath, "0123456789", "utf8");
    fs.writeFileSync(yamlPath, "alpha: beta\nsecond: value", "utf8");
    fs.writeFileSync(ignoredPath, "ignored", "utf8");

    const result = await ingestInboundAttachments({
      attachmentsDir: path.join(root, "runtime-attachments"),
      attachmentsConfig: {
        maxFilesPerMessage: 4,
        maxImageBytes: 4,
        maxDocumentBytes: 128,
        maxExtractedChars: 8
      },
      envelope: {
        channel: "telegram",
        channelId: "telegram-main",
        transportMessageId: "msg-3",
        conversationKey: "chat-1",
        senderId: "u1",
        text: "",
        attachments: [
          {
            id: "missing-attachment",
            kind: "document",
            name: "   "
          },
          {
            id: "image-attachment",
            kind: "image",
            name: "photo file.png",
            mimeType: "image/png",
            localPath: smallImagePath
          },
          {
            id: "large-image",
            kind: "image",
            name: "huge.png",
            mimeType: "image/png",
            localPath: largeImagePath
          },
          {
            id: "yaml-doc",
            kind: "document",
            name: "config file.yaml",
            localPath: yamlPath
          },
          {
            id: "ignored-doc",
            kind: "document",
            name: "ignored.txt",
            localPath: ignoredPath
          }
        ],
        receivedAt: new Date().toISOString(),
        idempotencyKey: "attachment-3"
      },
      logger: createLogger({ service: "test" })
    });

    expect(result.attachments).toHaveLength(2);
    expect(result.notes.join(" ")).toMatch(/Only the first 4 attachments were kept/i);
    expect(result.notes.join(" ")).toMatch(/missing-attachment could not be read from the channel connector/i);
    expect(result.notes.join(" ")).toMatch(/huge\.png was skipped because it is larger than the image limit/i);
    expect(result.content).toContain("Image attachment: photo file.png type image/png");
    expect(result.content).toContain("Document attachment: config file.yaml");
    expect(result.attachments[1]?.extractedText?.length).toBeLessThanOrEqual(8);
    expect(path.basename(result.attachments[0]!.localPath!)).toBe("photo_file.png");
    expect(path.basename(result.attachments[1]!.localPath!)).toBe("config_file.yaml");
    expect(fs.existsSync(smallImagePath)).toBe(false);
    expect(fs.existsSync(yamlPath)).toBe(false);
    expect(fs.existsSync(ignoredPath)).toBe(true);
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

  it("detects mime types across supported outbound file extensions", async () => {
    const root = tempDir("openassist-outbound-mime-");
    roots.push(root);
    const files = [
      "diagram.svg",
      "image.webp",
      "notes.md",
      "service.log",
      "table.csv",
      "payload.json",
      "config.yaml",
      "scan.pdf",
      "letter.docx",
      "blob.bin"
    ].map((name) => {
      const filePath = path.join(root, name);
      fs.writeFileSync(filePath, "data", "utf8");
      return filePath;
    });

    const staged = await stageOutboundAttachments({
      attachmentsDir: path.join(root, "outbound"),
      sourcePaths: files,
      attachmentsConfig: {
        maxFilesPerMessage: files.length,
        maxImageBytes: 1024,
        maxDocumentBytes: 1024,
        maxExtractedChars: 2000
      },
      logger: createLogger({ service: "test" })
    });

    const mimeByName = Object.fromEntries(staged.attachments.map((attachment) => [attachment.name, attachment.mimeType]));

    expect(staged.notes).toEqual([]);
    expect(mimeByName["diagram.svg"]).toBe("image/svg+xml");
    expect(mimeByName["image.webp"]).toBe("image/webp");
    expect(mimeByName["notes.md"]).toBe("text/markdown");
    expect(mimeByName["service.log"]).toBe("text/plain");
    expect(mimeByName["table.csv"]).toBe("text/csv");
    expect(mimeByName["payload.json"]).toBe("application/json");
    expect(mimeByName["config.yaml"]).toBe("application/yaml");
    expect(mimeByName["scan.pdf"]).toBe("application/pdf");
    expect(mimeByName["letter.docx"]).toBe(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    );
    expect(mimeByName["blob.bin"]).toBeUndefined();
  });

  it("reports non-file, oversized, and missing outbound sources explicitly", async () => {
    const root = tempDir("openassist-outbound-errors-");
    roots.push(root);
    const directoryPath = path.join(root, "folder");
    const oversizedImagePath = path.join(root, "large.png");
    const missingPath = path.join(root, "missing.txt");
    const logger = { warn: vi.fn() };
    fs.mkdirSync(directoryPath, { recursive: true });
    fs.writeFileSync(oversizedImagePath, "0123456789", "utf8");

    const staged = await stageOutboundAttachments({
      attachmentsDir: path.join(root, "outbound"),
      sourcePaths: [directoryPath, oversizedImagePath, missingPath],
      attachmentsConfig: {
        maxFilesPerMessage: 3,
        maxImageBytes: 4,
        maxDocumentBytes: 1024,
        maxExtractedChars: 2000
      },
      logger: logger as never
    });

    expect(staged.attachments).toEqual([]);
    expect(staged.notes.join(" ")).toMatch(/folder was skipped because it is not a regular file/i);
    expect(staged.notes.join(" ")).toMatch(/large\.png was skipped because it is larger than the image limit/i);
    expect(staged.notes.join(" ")).toMatch(/missing\.txt could not be staged for outbound delivery/i);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "outbound.attachment.stage.failure",
        sourcePath: missingPath
      }),
      "outbound attachment staging failed"
    );
  });
});

describe("attachment cleanup", () => {
  it("ignores empty local paths and best-effort delete failures", async () => {
    const rmSpy = vi.spyOn(fs.promises, "rm").mockRejectedValueOnce(new Error("locked"));

    await expect(
      cleanupStagedAttachments([
        {} as { localPath?: string },
        { localPath: path.join(os.tmpdir(), "locked.txt") }
      ])
    ).resolves.toBeUndefined();

    expect(rmSpy).toHaveBeenCalledTimes(1);
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
