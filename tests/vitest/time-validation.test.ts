import { describe, expect, it } from "vitest";
import { detectSystemTimezoneCandidate, validateTimezone } from "../../packages/core-runtime/src/clock-health.js";
import { isValidTimezone, normalizeTimezone } from "../../packages/core-runtime/src/scheduler.js";

describe("timezone validation", () => {
  it("accepts valid IANA timezone names", () => {
    expect(validateTimezone("UTC")).toBe(true);
    expect(isValidTimezone("America/New_York")).toBe(true);
  });

  it("rejects invalid timezone names", () => {
    expect(validateTimezone("Not/AZone")).toBe(false);
    expect(isValidTimezone("Not/AZone")).toBe(false);
  });

  it("normalizes known timezone names", () => {
    expect(normalizeTimezone("UTC")).toBe("UTC");
  });

  it("detects a fallback timezone candidate", () => {
    const detected = detectSystemTimezoneCandidate();
    expect(typeof detected).toBe("string");
    expect(detected.length).toBeGreaterThan(0);
  });
});
