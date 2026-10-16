import type { NormalizedMessage } from "@openassist/core-types";

export interface TokenBudgetSlices {
  total: number;
  system: number;
  activeTurn: number;
  recalledState: number;
  safetyMargin: number;
}

export interface ContextPlannerOptions {
  maxRawTurns?: number;
  budget?: TokenBudgetSlices;
}

export interface ContextPlannerInput {
  systemMessages: NormalizedMessage[];
  recalledStateMessages?: NormalizedMessage[];
  recentMessages: NormalizedMessage[];
}

export interface PlannedContext {
  messages: NormalizedMessage[];
  estimatedTokens: number;
}

export function estimateContextTokens(value: unknown): number {
  return Math.ceil(Buffer.byteLength(JSON.stringify(value) ?? "", "utf8") / 3) + 32;
}

/** Enforce cancellation even when an adapter ignores its supplied signal. */
export async function runWithAbort<T>(operation: () => Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return operation();
  signal.throwIfAborted();
  return new Promise<T>((resolve,reject) => {
    const aborted = () => reject(new Error("Provider request cancelled before completion."));
    signal.addEventListener("abort",aborted,{ once: true });
    operation().then(resolve,reject).finally(() => signal.removeEventListener("abort",aborted));
  });
}

/** A new user entry starts a segment only after all outstanding calls have settled. */
export function conversationSegments(messages: NormalizedMessage[]): NormalizedMessage[][] {
  const segments: NormalizedMessage[][] = [];
  let segment: NormalizedMessage[] = [];
  const pending = new Map<string, number>();
  for (const message of messages) {
    if (message.role === "user" && segment.length && pending.size === 0) { segments.push(segment); segment = []; }
    segment.push(message);
    if (message.role === "assistant" && message.toolCallId) pending.set(message.toolCallId, (pending.get(message.toolCallId) ?? 0) + 1);
    if (message.role === "tool" && message.toolCallId && pending.has(message.toolCallId)) {
      const count = pending.get(message.toolCallId)! - 1;
      if (count) pending.set(message.toolCallId, count); else pending.delete(message.toolCallId);
    }
  }
  if (segment.length) segments.push(segment);
  return segments;
}

export class ContextPlanner {
  private readonly maxRawTurns: number;
  private readonly budget: TokenBudgetSlices;

  constructor(options: ContextPlannerOptions = {}) {
    this.maxRawTurns = options.maxRawTurns ?? 10_000;
    this.budget =
      options.budget ??
      {
        total: 24_000,
        system: 6_000,
        activeTurn: 9_000,
        recalledState: 5_000,
        safetyMargin: 1000
      };
  }

  plan(input: ContextPlannerInput): PlannedContext {
    const segments = conversationSegments(input.recentMessages);
    const raw: NormalizedMessage[] = [];
    for (let index = segments.length - 1; index >= 0; index--) {
      if (raw.length && raw.length + segments[index]!.length > this.maxRawTurns) break;
      raw.unshift(...segments[index]!);
    }
    const messages = [...input.systemMessages, ...(input.recalledStateMessages ?? []), ...raw];
    const estimatedTokens = estimateContextTokens(messages);
    if (estimatedTokens > this.budget.total - this.budget.safetyMargin)
      throw new Error("Complete context exceeds the configured budget; compaction is required. Current input and instructions were not truncated.");
    return { messages, estimatedTokens };
  }
}

function stripDelimitedBlock(content: string, startToken: string, endToken: string): string {
  const lowerContent = content.toLowerCase();
  const startLower = startToken.toLowerCase();
  const endLower = endToken.toLowerCase();
  let cursor = 0;
  let output = "";

  while (cursor < content.length) {
    const start = lowerContent.indexOf(startLower, cursor);
    if (start === -1) {
      output += content.slice(cursor);
      break;
    }
    output += content.slice(cursor, start);
    const endSearchStart = start + startLower.length;
    const end = lowerContent.indexOf(endLower, endSearchStart);
    if (end === -1) {
      break;
    }
    cursor = end + endLower.length;
  }

  return output;
}

export function sanitizeUserOutput(content: string): string {
  let sanitized = content;
  sanitized = stripDelimitedBlock(sanitized, "<think>", "</think>");
  sanitized = stripDelimitedBlock(sanitized, "```reasoning", "```");
  sanitized = stripDelimitedBlock(sanitized, "[internal_trace]", "[/internal_trace]");
  sanitized = sanitized.replace(/[ \t]{2,}/g, " ");
  sanitized = sanitized.trim();
  return sanitized;
}
