import { describe, expect, it } from "vitest";
import { extractProviderAuthReadinessMap } from "../../apps/openassist-cli/src/lib/provider-auth-readiness.js";

describe("provider auth readiness", () => {
  it("returns an empty map for non-object payloads", () => {
    expect(extractProviderAuthReadinessMap(undefined)).toEqual({});
    expect(extractProviderAuthReadinessMap(null)).toEqual({});
    expect(extractProviderAuthReadinessMap("nope")).toEqual({});
    expect(extractProviderAuthReadinessMap(["wrong"])).toEqual({});
  });

  it("maps a single provider status response", () => {
    expect(
      extractProviderAuthReadinessMap({
        providerId: "codex-main",
        linkedAccountCount: 2,
        currentAuth: {
          chatReady: true
        }
      })
    ).toEqual({
      "codex-main": {
        linkedAccountCount: 2,
        chatReady: true
      }
    });
  });

  it("maps multi-provider payloads and filters invalid provider entries", () => {
    expect(
      extractProviderAuthReadinessMap({
        providers: [
          {
            providerId: "codex-main",
            linkedAccountCount: 1,
            currentAuth: {
              chatReady: true
            }
          },
          {
            providerId: "anthropic-main"
          },
          {
            providerId: "   ",
            linkedAccountCount: 10,
            currentAuth: {
              chatReady: true
            }
          },
          {
            linkedAccountCount: 4
          }
        ]
      })
    ).toEqual({
      "anthropic-main": {
        linkedAccountCount: 0,
        chatReady: false
      },
      "codex-main": {
        linkedAccountCount: 1,
        chatReady: true
      }
    });
  });

  it("defaults missing account counts and chat readiness to safe falsey values", () => {
    expect(
      extractProviderAuthReadinessMap({
        providerId: "openai-main",
        linkedAccountCount: undefined,
        currentAuth: {
          chatReady: undefined
        }
      })
    ).toEqual({
      "openai-main": {
        linkedAccountCount: 0,
        chatReady: false
      }
    });
  });
});
