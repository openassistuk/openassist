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
  private readonly budget: TokenBudgetSlices;

  constructor(options: ContextPlannerOptions = {}) {
    this.maxRawTurns = options.maxRawTurns ?? 8;
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

  private fitSequentialMessages(
    messages: NormalizedMessage[],
    maxTokens: number
  ): { messages: NormalizedMessage[]; usedTokens: number } {
    const fitted: NormalizedMessage[] = [];
    let usedTokens = 0;
    for (const message of messages) {
      const remaining = maxTokens - usedTokens;
      if (remaining <= 0) {
        break;
      }
      const content = truncateToTokens(message.content, remaining);
      if (content.length === 0) {
        continue;
      }
      fitted.push({
        ...message,
        content
      });
      usedTokens += estimateTokens(content);
    }
    return { messages: fitted, usedTokens };
  }

  private fitNewestMessages(
    messages: NormalizedMessage[],
    maxTokens: number
  ): { messages: NormalizedMessage[]; usedTokens: number } {
    const fitted: NormalizedMessage[] = [];
    let usedTokens = 0;
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index]!;
      const remaining = maxTokens - usedTokens;
      if (remaining <= 0) {
        break;
      }
      const candidateTokens = estimateTokens(message.content);
      if (candidateTokens <= remaining) {
        fitted.unshift(message);
        usedTokens += candidateTokens;
        continue;
      }
      fitted.unshift({
        ...message,
        content: truncateToTokens(message.content, remaining)
      });
      usedTokens = maxTokens;
      break;
    }
    return { messages: fitted, usedTokens };
  }

  plan(input: ContextPlannerInput): PlannedContext {
    const raw = input.recentMessages.slice(-this.maxRawTurns);
    const fittedSystem = this.fitSequentialMessages(input.systemMessages, this.budget.system);
    const fittedRecalled = this.fitSequentialMessages(
      input.recalledStateMessages ?? [],
      this.budget.recalledState
    );
    const remainingForConversation = Math.max(
      0,
      this.budget.total -
        this.budget.safetyMargin -
        fittedSystem.usedTokens -
        fittedRecalled.usedTokens
    );
    const fittedConversation = this.fitNewestMessages(
      raw,
      Math.min(this.budget.activeTurn, remainingForConversation)
    );

    return {
      messages: [...fittedSystem.messages, ...fittedRecalled.messages, ...fittedConversation.messages],
      estimatedTokens:
        fittedSystem.usedTokens + fittedRecalled.usedTokens + fittedConversation.usedTokens
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
