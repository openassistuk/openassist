import { describe, expect, it } from "vitest";
import { DateTime } from "luxon";
import { applyMisfirePolicy } from "../../packages/core-runtime/src/scheduler.js";

describe("applyMisfirePolicy", () => {
  it("returns only latest run for catch-up-once", () => {
    const base = DateTime.fromISO("2026-02-23T10:00:00.000Z");
    const due = [base, base.plus({ minutes: 1 }), base.plus({ minutes: 2 })];
    const selected = applyMisfirePolicy("catch-up-once", due);
    expect(selected).toHaveLength(1);
    expect(selected[0]?.toUTC().toISO()).toBe("2026-02-23T10:02:00.000Z");
  });

  it("returns no runs for skip", () => {
    const base = DateTime.fromISO("2026-02-23T10:00:00.000Z");
    const due = [base, base.plus({ minutes: 1 })];
    expect(applyMisfirePolicy("skip", due)).toEqual([]);
  });

  it("returns all due runs for backfill up to cap", () => {
    const base = DateTime.fromISO("2026-02-23T10:00:00.000Z");
    const due = [base, base.plus({ minutes: 1 }), base.plus({ minutes: 2 })];
    const selected = applyMisfirePolicy("backfill", due);
    expect(selected).toHaveLength(3);
  });
});
