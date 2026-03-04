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
  snapshotEveryNTurns?: number;
  budget?: TokenBudgetSlices;
}

export interface PlannedContext {
  messages: NormalizedMessage[];
  snapshotWritten: boolean;
  estimatedTokens: number;
}

function estimateTokens(value: string): number {
  // Approximation: ~4 characters per token for English text.
  return Math.ceil(value.length / 4);
}

function truncateToTokens(content: string, maxTokens: number): string {
  const maxChars = maxTokens * 4;
  if (content.length <= maxChars) {
    return content;
  }
  return content.slice(0, maxChars);
}

export class ContextPlanner {
  private readonly maxRawTurns: number;
  private readonly snapshotEveryNTurns: number;
  private readonly budget: TokenBudgetSlices;

  constructor(options: ContextPlannerOptions = {}) {
    this.maxRawTurns = options.maxRawTurns ?? 12;
    this.snapshotEveryNTurns = options.snapshotEveryNTurns ?? 8;
    this.budget =
      options.budget ??
      {
        total: 24_000,
        system: 1500,
        activeTurn: 3000,
        recalledState: 3500,
        safetyMargin: 1000
      };
  }

  plan(systemPrompt: string, recentMessages: NormalizedMessage[]): PlannedContext {
    const raw = recentMessages.slice(-this.maxRawTurns);

    const systemMessage: NormalizedMessage = {
      role: "system",
      content: truncateToTokens(systemPrompt, this.budget.system)
    };

    const tokenBudgetForConversation =
      this.budget.total - this.budget.system - this.budget.safetyMargin;

    const plannedConversation: NormalizedMessage[] = [];
    let used = estimateTokens(systemMessage.content);

    for (let i = raw.length - 1; i >= 0; i -= 1) {
      const message = raw[i]!;
      const candidateTokens = estimateTokens(message.content);
      if (used + candidateTokens > tokenBudgetForConversation) {
        continue;
      }
      plannedConversation.unshift(message);
      used += candidateTokens;
    }

    const snapshotWritten = raw.length > 0 && raw.length % this.snapshotEveryNTurns === 0;

    return {
      messages: [systemMessage, ...plannedConversation],
      snapshotWritten,
      estimatedTokens: used
    };
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
