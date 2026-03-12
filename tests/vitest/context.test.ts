import { describe, expect, it } from "vitest";
import { ContextPlanner, sanitizeUserOutput } from "../../packages/core-runtime/src/context.js";

describe("ContextPlanner", () => {
  it("keeps only bounded raw turns after system and recalled state", () => {
    const planner = new ContextPlanner({ maxRawTurns: 3 });
    const recentMessages = [
      { role: "user", content: "1" },
      { role: "assistant", content: "2" },
      { role: "user", content: "3" },
      { role: "assistant", content: "4" }
    ];

    const result = planner.plan({
      systemMessages: [{ role: "system", content: "system" }] as never,
      recalledStateMessages: [{ role: "system", content: "summary" }] as never,
      recentMessages: recentMessages as never
    });
    expect(result.messages.length).toBe(5);
    expect(result.messages[0]?.content).toBe("system");
    expect(result.messages[1]?.content).toBe("summary");
    expect(result.messages[2]?.content).toBe("2");
    expect(result.messages[4]?.content).toBe("4");
  });

  it("budgets combined system and recalled state before raw history", () => {
    const planner = new ContextPlanner({
      maxRawTurns: 4,
      budget: {
        total: 80,
        system: 10,
        recalledState: 10,
        activeTurn: 10,
        safetyMargin: 5
      }
    });

    const result = planner.plan({
      systemMessages: [{ role: "system", content: "s".repeat(80) }] as never,
      recalledStateMessages: [{ role: "system", content: "r".repeat(80) }] as never,
      recentMessages: [{ role: "user", content: "u".repeat(120) }] as never
    });

    expect(result.messages).toHaveLength(3);
    expect(result.messages[0]?.content.length).toBeLessThanOrEqual(40);
    expect(result.messages[1]?.content.length).toBeLessThanOrEqual(40);
    expect(result.messages[2]?.content.length).toBeLessThanOrEqual(40);
    expect(result.estimatedTokens).toBeLessThanOrEqual(30);
  });

  it("strips reasoning and internal trace blocks", () => {
    const input =
      "hello <think>secret</think> ```reasoning\na\n``` [internal_trace]x[/internal_trace] world";
    const output = sanitizeUserOutput(input);
    expect(output).toBe("hello world");
  });

  it("drops trailing unmatched hidden sections", () => {
    const input = "keep <think>hidden";
    expect(sanitizeUserOutput(input)).toBe("keep");
  });
});
