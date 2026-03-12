import type {
  NormalizedMessage,
  RuntimeMemoryCategory,
  RuntimePermanentMemoryRecord,
  RuntimeSessionMemoryRecord
} from "@openassist/core-types";

export const SESSION_RAW_TAIL_SIZE = 8;
export const SESSION_COMPACTION_BATCH_SIZE = 8;
export const MAX_COMPACTION_BATCHES_PER_TURN = 3;
export const MAX_RECALLED_MEMORIES = 4;

const MAX_SESSION_SUMMARY_CHARS = 3_000;
const MAX_MEMORY_SUMMARY_CHARS = 280;
const MAX_MEMORY_KEYWORDS = 6;
const STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "at",
  "be",
  "but",
  "by",
  "for",
  "from",
  "how",
  "i",
  "in",
  "is",
  "it",
  "of",
  "on",
  "or",
  "that",
  "the",
  "this",
  "to",
  "was",
  "we",
  "with",
  "you"
]);

export interface MemoryCandidate {
  category: RuntimeMemoryCategory;
  summary: string;
  keywords: string[];
  salience: number;
}

export interface MemoryExtractionResult {
  sessionSummary: string;
  memories: MemoryCandidate[];
}

function truncate(value: string, maxChars: number): string {
  const trimmed = value.trim();
  if (trimmed.length <= maxChars) {
    return trimmed;
  }
  return `${trimmed.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`;
}

function normalizeText(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(value: string): string[] {
  return normalizeText(value)
    .split(" ")
    .filter((item) => item.length >= 3 && !STOPWORDS.has(item));
}

function parseJsonObject(raw: string): Record<string, unknown> | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }
  const withoutFence =
    trimmed.startsWith("```") && trimmed.endsWith("```")
      ? trimmed.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim()
      : trimmed;
  try {
    const parsed = JSON.parse(withoutFence);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return null;
    }
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

function looksSensitive(value: string): boolean {
  return (
    /sk-[a-z0-9_-]{10,}/i.test(value) ||
    /\b(?:token|password|secret|api key|refresh token|access token)\b/i.test(value) ||
    /\b[a-f0-9]{24,}\b/i.test(value)
  );
}

function redactSensitiveText(value: string): string {
  return value
    .replace(/sk-[a-z0-9_-]{10,}/gi, "[REDACTED]")
    .replace(/\b[a-f0-9]{24,}\b/gi, "[REDACTED]")
    .trim();
}

function uniqueKeywords(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const seen = new Set<string>();
  const keywords: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") {
      continue;
    }
    const normalized = normalizeText(item);
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    keywords.push(normalized);
    if (keywords.length >= MAX_MEMORY_KEYWORDS) {
      break;
    }
  }
  return keywords;
}

function renderAttachments(message: NormalizedMessage): string[] {
  const attachments = message.attachments ?? [];
  const lines: string[] = [];
  for (const attachment of attachments) {
    const parts = [
      attachment.kind,
      attachment.name,
      attachment.captionText ? `caption=${truncate(attachment.captionText, 120)}` : "",
      attachment.extractedText ? `extracted=${truncate(attachment.extractedText, 240)}` : ""
    ].filter((part) => part && part.length > 0);
    if (parts.length > 0) {
      lines.push(`attachment: ${parts.join(", ")}`);
    }
  }
  return lines;
}

export function actorScopeFromParts(channelId: string, actorId: string): string {
  return `${channelId}:${actorId}`;
}

export function buildMemoryExtractionMessages(input: {
  existingSummary: string;
  batch: NormalizedMessage[];
  memoryEnabled: boolean;
}): NormalizedMessage[] {
  const transcriptLines: string[] = [];
  for (const message of input.batch) {
    transcriptLines.push(`[${message.role}] ${truncate(message.content || "(empty)", 800)}`);
    for (const attachmentLine of renderAttachments(message)) {
      transcriptLines.push(`  ${attachmentLine}`);
    }
  }

  return [
    {
      role: "system",
      content: [
        "You update OpenAssist compacted chat memory.",
        "Return strict JSON with exactly this shape:",
        '{"sessionSummary":"string","memories":[{"category":"preference|fact|goal","summary":"string","keywords":["string"],"salience":1}]}',
        "Rules:",
        "- sessionSummary must preserve durable context from the prior summary plus the new transcript block.",
        "- memories must include only stable user preferences, durable facts, or ongoing goals/projects worth recalling in future chats with the same actor.",
        "- do not store secrets, credentials, raw identifiers, one-off requests, transient troubleshooting steps, or speculation.",
        "- if no durable memories are justified, return an empty memories array.",
        "- do not return markdown or explanatory text."
      ].join("\n")
    },
    {
      role: "user",
      content: [
        `Permanent memory enabled: ${input.memoryEnabled ? "yes" : "no"}`,
        "Existing rolling session summary:",
        input.existingSummary.trim().length > 0 ? input.existingSummary.trim() : "(none yet)",
        "",
        "Transcript block to compact:",
        transcriptLines.join("\n")
      ].join("\n")
    }
  ];
}

export function parseMemoryExtractionResponse(
  content: string,
  options: { memoryEnabled: boolean }
): MemoryExtractionResult | null {
  const parsed = parseJsonObject(content);
  if (!parsed) {
    return null;
  }

  if (typeof parsed.sessionSummary !== "string") {
    return null;
  }
  const sessionSummary = truncate(redactSensitiveText(parsed.sessionSummary), MAX_SESSION_SUMMARY_CHARS);
  if (sessionSummary.length === 0) {
    return null;
  }

  const rawMemories = Array.isArray(parsed.memories) ? parsed.memories : [];
  const dedupe = new Set<string>();
  const memories: MemoryCandidate[] = [];
  for (const item of rawMemories) {
    if (!options.memoryEnabled) {
      break;
    }
    if (typeof item !== "object" || item === null || Array.isArray(item)) {
      continue;
    }
    const candidate = item as Record<string, unknown>;
    if (
      candidate.category !== "preference" &&
      candidate.category !== "fact" &&
      candidate.category !== "goal"
    ) {
      continue;
    }
    if (typeof candidate.summary !== "string") {
      continue;
    }
    const summary = truncate(redactSensitiveText(candidate.summary), MAX_MEMORY_SUMMARY_CHARS);
    if (summary.length < 8 || looksSensitive(summary)) {
      continue;
    }
    const keywords = uniqueKeywords(candidate.keywords);
    const salience =
      typeof candidate.salience === "number" && Number.isFinite(candidate.salience)
        ? Math.max(1, Math.min(5, Math.round(candidate.salience)))
        : 1;
    const key = `${candidate.category}:${normalizeText(summary)}`;
    if (!key || dedupe.has(key)) {
      continue;
    }
    dedupe.add(key);
    memories.push({
      category: candidate.category,
      summary,
      keywords,
      salience
    });
    if (memories.length >= 6) {
      break;
    }
  }

  return {
    sessionSummary,
    memories
  };
}

export function buildSessionMemorySystemMessage(memory: RuntimeSessionMemoryRecord): string {
  return [
    "OpenAssist rolling session summary",
    `- compacted through message id: ${memory.lastCompactedMessageId}`,
    `- summary: ${memory.summary}`
  ].join("\n");
}

export function buildPermanentMemorySystemMessage(
  memories: RuntimePermanentMemoryRecord[]
): string {
  return [
    "OpenAssist durable actor memory",
    ...memories.map(
      (memory, index) =>
        `${index + 1}. [${memory.category}] ${memory.summary} (keywords: ${memory.keywords.join(", ") || "none"})`
    )
  ].join("\n");
}

export function rankMemoriesForRecall(
  memories: RuntimePermanentMemoryRecord[],
  query: string,
  limit = MAX_RECALLED_MEMORIES
): RuntimePermanentMemoryRecord[] {
  const queryTerms = new Set(tokenize(query));
  const ranked = memories
    .map((memory) => {
      const haystackTerms = new Set(tokenize(`${memory.summary} ${memory.keywords.join(" ")}`));
      let overlap = 0;
      for (const term of queryTerms) {
        if (haystackTerms.has(term)) {
          overlap += 1;
        }
      }
      const recencyTimestamp = Date.parse(memory.lastRecalledAt ?? memory.updatedAt);
      const recencyBonus = Number.isNaN(recencyTimestamp)
        ? 0
        : Math.max(0, 1 - Math.min(1, (Date.now() - recencyTimestamp) / (14 * 24 * 60 * 60 * 1000)));
      const score =
        overlap * 5 +
        memory.salience * 2 +
        (memory.category === "goal" ? 1 : 0) +
        recencyBonus;
      return {
        memory,
        score
      };
    })
    .filter((entry) => entry.score > 0 && (queryTerms.size === 0 || entry.score >= 3))
    .sort((a, b) => b.score - a.score || b.memory.updatedAt.localeCompare(a.memory.updatedAt));

  return ranked.slice(0, limit).map((entry) => entry.memory);
}
