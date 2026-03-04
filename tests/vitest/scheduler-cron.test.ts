import { describe, expect, it } from "vitest";
import { nextCronRun } from "../../packages/core-runtime/src/scheduler.js";

describe("scheduler cron helpers", () => {
  it("computes next run in UTC", () => {
    const next = nextCronRun("*/5 * * * * *", "2026-02-23T10:00:01.000Z", "UTC");
    expect(next).toBe("2026-02-23T10:00:05.000Z");
  });

  it("returns undefined for invalid cron", () => {
    expect(nextCronRun("invalid cron", "2026-02-23T10:00:01.000Z", "UTC")).toBeUndefined();
  });
});
