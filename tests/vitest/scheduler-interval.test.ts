import { describe, expect, it } from "vitest";
import { nextIntervalRun } from "../../packages/core-runtime/src/scheduler.js";

describe("scheduler interval helpers", () => {
  it("returns immediate now when there is no previous run", () => {
    const next = nextIntervalRun(undefined, 60, "2026-02-23T10:00:00.000Z");
    expect(next).toBe("2026-02-23T10:00:00.000Z");
  });

  it("returns previous + interval seconds when there is a previous run", () => {
    const next = nextIntervalRun("2026-02-23T10:00:00.000Z", 60);
    expect(next).toBe("2026-02-23T10:01:00.000Z");
  });
});
