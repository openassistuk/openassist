import fs from "node:fs";
import path from "node:path";
import type {
  AttachmentKind,
  AttachmentRef,
  InboundEnvelope,
  OutboundAttachmentRef,
  RuntimeAttachmentConfig
} from "@openassist/core-types";
import type { OpenAssistLogger } from "@openassist/observability";

const DEFAULT_ATTACHMENT_CONFIG: RuntimeAttachmentConfig = {
  maxFilesPerMessage: 4,
  maxImageBytes: 10_000_000,
  maxDocumentBytes: 1_000_000,
  maxExtractedChars: 12_000
};

const TEXT_DOCUMENT_MIME_TYPES = new Set([
  "application/json",
  "application/x-yaml",
  "application/yaml",
  "text/csv",
  "text/log",
  "text/markdown",
  "text/plain",
  "text/x-log",
  "text/x-markdown",
  "text/x-yaml"
]);

const TEXT_DOCUMENT_EXTENSIONS = new Set([
  ".csv",
  ".json",
  ".log",
  ".md",
  ".markdown",
  ".txt",
  ".yaml",
  ".yml"
]);

const IMAGE_EXTENSIONS = new Set([
  ".apng",
  ".gif",
  ".jpeg",
  ".jpg",
  ".png",
  ".svg",
  ".webp"
]);

export interface IngestInboundAttachmentsOptions {
  attachmentsConfig?: RuntimeAttachmentConfig;
  attachmentsDir: string;
  envelope: InboundEnvelope;
  logger: OpenAssistLogger;
}

export interface IngestInboundAttachmentsResult {
  content: string;
  attachments: AttachmentRef[];
  notes: string[];
}

export interface StageOutboundAttachmentsOptions {
  attachmentsConfig?: RuntimeAttachmentConfig;
  attachmentsDir: string;
  sourcePaths: string[];
  logger: OpenAssistLogger;
}

export interface StageOutboundAttachmentsResult {
  attachments: OutboundAttachmentRef[];
  notes: string[];
}

function toModeText(mode: number): string {
  return `0o${(mode & 0o777).toString(8).padStart(3, "0")}`;
}

function assertOwnerOnlyPath(targetPath: string, kind: "file" | "directory"): void {
  if (process.platform === "win32") {
    return;
  }

  const stat = fs.statSync(targetPath);
  if (kind === "directory" && !stat.isDirectory()) {
    throw new Error(`Expected directory path for permission check: ${targetPath}`);
  }
  if (kind === "file" && !stat.isFile()) {
    throw new Error(`Expected file path for permission check: ${targetPath}`);
  }

  const mode = stat.mode & 0o777;
  if ((mode & 0o077) !== 0) {
    throw new Error(
      `Insecure permissions on ${kind} '${targetPath}': ${toModeText(mode)}. ` +
        "Use owner-only permissions (no group/other access)."
    );
  }
}

async function ensurePrivateDirectory(targetPath: string): Promise<void> {
  await fs.promises.mkdir(targetPath, { recursive: true, mode: 0o700 });
  if (process.platform !== "win32") {
    await fs.promises.chmod(targetPath, 0o700);
    assertOwnerOnlyPath(targetPath, "directory");
  }
}

async function ensurePrivateFile(targetPath: string): Promise<void> {
  if (process.platform !== "win32") {
    await fs.promises.chmod(targetPath, 0o600);
    assertOwnerOnlyPath(targetPath, "file");
  }
}

function sanitizeName(value: string | undefined, fallback: string): string {
  const raw = (value ?? "").trim();
  if (raw.length === 0) {
    return fallback;
  }
  return raw.replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 80) || fallback;
}

function attachmentDisplayName(attachment: AttachmentRef): string {
  return attachment.name?.trim() || attachment.id;
}

function inferAttachmentKind(attachment: AttachmentRef): AttachmentKind {
  if (attachment.kind === "image" || attachment.kind === "document") {
    return attachment.kind;
  }

  const mime = attachment.mimeType?.toLowerCase() ?? "";
  if (mime.startsWith("image/")) {
    return "image";
  }
  return "document";
}

function inferOutboundAttachmentKind(sourcePath: string): AttachmentKind {
  const ext = path.extname(sourcePath).toLowerCase();
  return IMAGE_EXTENSIONS.has(ext) ? "image" : "document";
}

function inferOutboundMimeType(sourcePath: string, kind: AttachmentKind): string | undefined {
  const ext = path.extname(sourcePath).toLowerCase();
  if (kind === "image") {
    if (ext === ".png" || ext === ".apng") {
      return "image/png";
    }
    if (ext === ".gif") {
      return "image/gif";
    }
    if (ext === ".svg") {
      return "image/svg+xml";
    }
    if (ext === ".webp") {
      return "image/webp";
    }
    return "image/jpeg";
  }

  if (ext === ".md" || ext === ".markdown") {
    return "text/markdown";
  }
  if (ext === ".txt" || ext === ".log") {
    return "text/plain";
  }
  if (ext === ".csv") {
    return "text/csv";
  }
  if (ext === ".json") {
    return "application/json";
  }
  if (ext === ".yaml" || ext === ".yml") {
    return "application/yaml";
  }
  if (ext === ".pdf") {
    return "application/pdf";
  }
  if (ext === ".docx") {
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }
  return undefined;
}

function isTextLikeDocument(attachment: AttachmentRef): boolean {
  const mime = attachment.mimeType?.toLowerCase();
  if (mime && (mime.startsWith("text/") || TEXT_DOCUMENT_MIME_TYPES.has(mime))) {
    return true;
  }

  const ext = path.extname(attachment.name ?? attachment.localPath ?? "").toLowerCase();
  return TEXT_DOCUMENT_EXTENSIONS.has(ext);
}

async function readExtractedText(sourcePath: string, maxChars: number): Promise<string> {
  const content = await fs.promises.readFile(sourcePath, "utf8");
  return content.length <= maxChars ? content : content.slice(0, maxChars);
}

function buildAttachmentContext(attachments: AttachmentRef[], notes: string[], baseText: string): string {
  const blocks: string[] = [];
  const trimmedBase = baseText.trim();
  if (trimmedBase.length > 0) {
    blocks.push(trimmedBase);
  }

  const summaries = attachments
    .filter((attachment) => attachment.kind === "image")
    .map((attachment) => {
      const parts = [`Image attachment: ${attachmentDisplayName(attachment)}`];
      if (attachment.mimeType) {
        parts.push(`type ${attachment.mimeType}`);
      }
      return parts.join(" ");
    });
  if (summaries.length > 0) {
    blocks.push(summaries.join("\n"));
  }

  for (const attachment of attachments.filter((item) => item.kind === "document")) {
    const headerParts = [`Document attachment: ${attachmentDisplayName(attachment)}`];
    if (attachment.mimeType) {
      headerParts.push(`(${attachment.mimeType})`);
    }
    if (attachment.extractedText) {
      blocks.push(`${headerParts.join(" ")}\nExtracted text:\n${attachment.extractedText}`);
    } else {
      blocks.push(headerParts.join(" "));
    }
  }

  if (notes.length > 0) {
    blocks.push(`Attachment processing notes:\n${notes.map((note) => `- ${note}`).join("\n")}`);
  }

  return blocks.filter((block) => block.trim().length > 0).join("\n\n");
}

export function resolveAttachmentConfig(
  config: RuntimeAttachmentConfig | undefined
): RuntimeAttachmentConfig {
  return {
    ...DEFAULT_ATTACHMENT_CONFIG,
    ...(config ?? {})
  };
}

export async function ingestInboundAttachments(
  options: IngestInboundAttachmentsOptions
): Promise<IngestInboundAttachmentsResult> {
  const config = resolveAttachmentConfig(options.attachmentsConfig);
  const inboundAttachments = Array.isArray(options.envelope.attachments)
    ? options.envelope.attachments
    : [];
  const notes: string[] = [];
  const attachments: AttachmentRef[] = [];
  const limitedAttachments = inboundAttachments.slice(0, config.maxFilesPerMessage);

  if (inboundAttachments.length > config.maxFilesPerMessage) {
    notes.push(
      `Only the first ${config.maxFilesPerMessage} attachment${config.maxFilesPerMessage === 1 ? "" : "s"} were kept for this message.`
    );
  }

  if (limitedAttachments.length > 0) {
    await ensurePrivateDirectory(options.attachmentsDir);
  }

  for (const attachment of limitedAttachments) {
    const sourcePath = attachment.localPath;
    if (!sourcePath) {
      notes.push(`${attachmentDisplayName(attachment)} could not be read from the channel connector.`);
      continue;
    }

    try {
      const stat = await fs.promises.stat(sourcePath);
      const kind = inferAttachmentKind(attachment);
      const sizeLimit = kind === "image" ? config.maxImageBytes : config.maxDocumentBytes;
      const displayName = attachmentDisplayName(attachment);

      if (stat.size > sizeLimit) {
        notes.push(
          `${displayName} was skipped because it is larger than the ${kind} limit (${sizeLimit} bytes).`
        );
        continue;
      }

      if (kind === "document" && !isTextLikeDocument(attachment)) {
        notes.push(
          `${displayName} was skipped because only plain-text, markdown, CSV, JSON, and YAML-style documents are supported right now.`
        );
        continue;
      }

      const fileName = sanitizeName(
        attachment.name,
        `${Date.now()}-${sanitizeName(attachment.id, kind)}${path.extname(sourcePath)}`
      );
      const persistedPath = path.join(options.attachmentsDir, fileName);
      await fs.promises.copyFile(sourcePath, persistedPath);
      await ensurePrivateFile(persistedPath);

      let extractedText: string | undefined;
      if (kind === "document") {
        extractedText = await readExtractedText(persistedPath, config.maxExtractedChars);
      }

      attachments.push({
        ...attachment,
        kind,
        localPath: persistedPath,
        sizeBytes: stat.size,
        extractedText
      });

      if (persistedPath !== sourcePath) {
        await fs.promises.rm(sourcePath, { force: true });
      }
    } catch (error) {
      const displayName = attachmentDisplayName(attachment);
      const errText = error instanceof Error ? error.message : String(error);
      notes.push(`${displayName} could not be processed: ${errText}`);
      options.logger.warn(
        {
          type: "attachment.ingest.failure",
          channelId: options.envelope.channelId,
          conversationKey: options.envelope.conversationKey,
          attachmentId: attachment.id,
          error: errText
        },
        "attachment ingest failed"
      );
    }
  }

  return {
    content: buildAttachmentContext(attachments, notes, options.envelope.text ?? ""),
    attachments,
    notes
  };
}

export async function stageOutboundAttachments(
  options: StageOutboundAttachmentsOptions
): Promise<StageOutboundAttachmentsResult> {
  const config = resolveAttachmentConfig(options.attachmentsConfig);
  const notes: string[] = [];
  const attachments: OutboundAttachmentRef[] = [];
  const limitedPaths = options.sourcePaths.slice(0, config.maxFilesPerMessage);

  if (options.sourcePaths.length > config.maxFilesPerMessage) {
    notes.push(
      `Only the first ${config.maxFilesPerMessage} outbound attachment${config.maxFilesPerMessage === 1 ? "" : "s"} were kept.`
    );
  }

  if (limitedPaths.length > 0) {
    await ensurePrivateDirectory(options.attachmentsDir);
  }

  for (const sourcePath of limitedPaths) {
    try {
      const absolutePath = path.resolve(sourcePath);
      const stat = await fs.promises.stat(absolutePath);
      if (!stat.isFile()) {
        notes.push(`${path.basename(absolutePath)} was skipped because it is not a regular file.`);
        continue;
      }

      const kind = inferOutboundAttachmentKind(absolutePath);
      const sizeLimit = kind === "image" ? config.maxImageBytes : config.maxDocumentBytes;
      if (stat.size > sizeLimit) {
        notes.push(
          `${path.basename(absolutePath)} was skipped because it is larger than the ${kind} limit (${sizeLimit} bytes).`
        );
        continue;
      }

      const fileName = sanitizeName(
        path.basename(absolutePath),
        `${Date.now()}-${sanitizeName(path.basename(absolutePath), kind)}${path.extname(absolutePath)}`
      );
      const stagedPath = path.join(
        options.attachmentsDir,
        `${Date.now()}-${attachments.length + 1}-${fileName}`
      );
      await fs.promises.copyFile(absolutePath, stagedPath);
      await ensurePrivateFile(stagedPath);

      attachments.push({
        id: `${Date.now()}-${attachments.length + 1}`,
        kind,
        name: fileName,
        localPath: stagedPath,
        mimeType: inferOutboundMimeType(absolutePath, kind),
        sizeBytes: stat.size
      });
    } catch (error) {
      const errText = error instanceof Error ? error.message : String(error);
      notes.push(`${path.basename(sourcePath)} could not be staged for outbound delivery: ${errText}`);
      options.logger.warn(
        {
          type: "outbound.attachment.stage.failure",
          sourcePath,
          error: errText
        },
        "outbound attachment staging failed"
      );
    }
  }

  return {
    attachments,
    notes
  };
}

export async function cleanupStagedAttachments(
  attachments: Array<Pick<AttachmentRef, "localPath"> | Pick<OutboundAttachmentRef, "localPath">>
): Promise<void> {
  for (const attachment of attachments) {
    if (!attachment.localPath) {
      continue;
    }

    try {
      await fs.promises.rm(attachment.localPath, { force: true });
    } catch {
      // Best-effort cleanup only.
    }
  }
}
