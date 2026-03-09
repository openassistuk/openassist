import { describe, expect, it } from "vitest";
import {
  buildPullRequestRef,
  classifyUpdateTrack,
  parsePullRequestNumber
} from "../../apps/openassist-cli/src/lib/update-track.js";

describe("update track helpers", () => {
  it("classifies pull-request tracks explicitly", () => {
    expect(classifyUpdateTrack("refs/pull/42/head")).toEqual({
      kind: "pull-request",
      ref: "refs/pull/42/head",
      label: "PR #42 (refs/pull/42/head)",
      shortLabel: "PR #42",
      prNumber: 42,
      requiresExplicitUpgradeTarget: true
    });
  });

  it("classifies branches, raw refs, and detached state", () => {
    expect(classifyUpdateTrack("release/v1.2")).toMatchObject({
      kind: "branch",
      label: "release/v1.2",
      requiresExplicitUpgradeTarget: false
    });
    expect(classifyUpdateTrack("refs/tags/v1.2.3")).toMatchObject({
      kind: "raw-ref",
      label: "refs/tags/v1.2.3",
      requiresExplicitUpgradeTarget: false
    });
    expect(classifyUpdateTrack("HEAD")).toMatchObject({
      kind: "detached",
      label: "Detached or not recorded",
      requiresExplicitUpgradeTarget: false
    });
  });

  it("builds and validates pull request refs", () => {
    expect(buildPullRequestRef(23)).toBe("refs/pull/23/head");
    expect(buildPullRequestRef("57")).toBe("refs/pull/57/head");
    expect(parsePullRequestNumber("57")).toBe(57);
    expect(() => parsePullRequestNumber("0")).toThrow(/Invalid pull request number/);
    expect(() => parsePullRequestNumber("abc")).toThrow(/Invalid pull request number/);
  });
});
