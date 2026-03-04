import { describe, expect, it } from "vitest";
import { ContextPlanner, sanitizeUserOutput } from "../../packages/core-runtime/src/context.js";

describe("ContextPlanner", () => {
  it("keeps only bounded raw turns", () => {
    const planner = new ContextPlanner({ maxRawTurns: 3 });
    const messages = [
      { role: "user", content: "1" },
      { role: "assistant", content: "2" },
      { role: "user", content: "3" },
      { role: "assistant", content: "4" }
    ];

    const result = planner.plan("system", messages as never);
    expect(result.messages.length).toBe(4);
    expect(result.messages[1]?.content).toBe("2");
    expect(result.messages[3]?.content).toBe("4");
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
