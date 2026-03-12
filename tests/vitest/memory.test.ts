import { describe, expect, it } from "vitest";
import {
  buildMemoryExtractionMessages,
  parseMemoryExtractionResponse,
  rankMemoriesForRecall
} from "../../packages/core-runtime/src/memory.js";

describe("memory helpers", () => {
  it("builds bounded extraction messages with prior summary and transcript block", () => {
    const messages = buildMemoryExtractionMessages({
      existingSummary: "Prior summary",
      memoryEnabled: true,
      batch: [
        {
          role: "user",
          content: "Remember that I prefer Debian apt commands for package examples."
        }
      ]
    });

    expect(messages).toHaveLength(2);
    expect(messages[0]?.content).toMatch(/strict JSON/i);
    expect(messages[1]?.content).toMatch(/Prior summary/);
    expect(messages[1]?.content).toMatch(/Debian apt commands/);
  });

  it("parses, redacts, and filters extraction responses conservatively", () => {
    const parsed = parseMemoryExtractionResponse(
      JSON.stringify({
        sessionSummary: "The operator prefers Debian apt and is working on the home lab refresh.",
        memories: [
          {
            category: "preference",
            summary: "Use Debian apt commands when giving package instructions.",
            keywords: ["Debian", "apt", "packages"],
            salience: 4
          },
          {
            category: "fact",
            summary: "API key sk-test-1234567890abcdefghijkl should be stored here",
            keywords: ["api-key"],
            salience: 5
          }
        ]
      }),
      { memoryEnabled: true }
    );

    expect(parsed).not.toBeNull();
    expect(parsed?.sessionSummary).toMatch(/Debian apt/);
    expect(parsed?.memories).toHaveLength(1);
    expect(parsed?.memories[0]?.category).toBe("preference");
    expect(parsed?.memories[0]?.keywords).toEqual(["debian", "apt", "packages"]);
  });

  it("ranks recalled memories by overlap, salience, and recency", () => {
    const ranked = rankMemoriesForRecall(
      [
        {
          id: 1,
          actorScope: "telegram-main:u1",
          category: "preference",
          summary: "Use Debian apt commands when suggesting package installs.",
          keywords: ["debian", "apt"],
          sourceSessionId: "telegram-main:chat-1",
          sourceMessageId: 10,
          salience: 4,
          state: "active",
          createdAt: "2026-03-10T00:00:00.000Z",
          updatedAt: new Date().toISOString(),
          recallCount: 0
        },
        {
          id: 2,
          actorScope: "telegram-main:u1",
          category: "goal",
          summary: "Home lab refresh is in progress.",
          keywords: ["homelab", "refresh"],
          sourceSessionId: "telegram-main:chat-1",
          sourceMessageId: 11,
          salience: 2,
          state: "active",
          createdAt: "2026-03-10T00:00:00.000Z",
          updatedAt: "2026-03-10T00:00:00.000Z",
          recallCount: 0
        }
      ],
      "How should I install ripgrep on Debian?",
      2
    );

    expect(ranked).toHaveLength(2);
    expect(ranked[0]?.id).toBe(1);
  });
});
