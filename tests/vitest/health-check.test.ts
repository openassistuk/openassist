import { afterEach, describe, expect, it, vi } from "vitest";
import {
  checkHealth,
  deriveHealthProbeBaseUrls,
  preferredLocalHealthBaseUrl,
  waitForHealthy
} from "../../apps/openassist-cli/src/lib/health-check.js";

describe("health-check helpers", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("normalizes base url and detects healthy response", async () => {
    const fetchMock = vi.fn(async () => {
      return new Response("{\"status\":\"ok\"}", {
        status: 200,
        headers: {
          "content-type": "application/json"
        }
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await checkHealth("http://127.0.0.1:3344/");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("http://127.0.0.1:3344/v1/health");
    expect(result.ok).toBe(true);
    expect(result.status).toBe(200);
  });

  it("waits until healthy and returns latest result", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response("{\"status\":\"starting\"}", {
          status: 503
        })
      )
      .mockResolvedValueOnce(
        new Response("{\"status\":\"ok\"}", {
          status: 200
        })
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await waitForHealthy("http://127.0.0.1:3344", 1_000, 10);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.ok).toBe(true);
    expect(result.status).toBe(200);
  });

  it("returns failure result on timeout", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("connection refused");
    }));

    const result = await waitForHealthy("http://127.0.0.1:3344", 350, 10);

    expect(result.ok).toBe(false);
    expect(result.bodyText).toContain("connection refused");
  });

  it("derives loopback fallback probes for wildcard bind hosts", () => {
    expect(preferredLocalHealthBaseUrl("0.0.0.0", 3344)).toBe("http://127.0.0.1:3344");
    expect(preferredLocalHealthBaseUrl("::", 3344)).toBe("http://127.0.0.1:3344");

    expect(deriveHealthProbeBaseUrls("http://0.0.0.0:3344")).toEqual([
      "http://127.0.0.1:3344",
      "http://localhost:3344",
      "http://0.0.0.0:3344"
    ]);
  });

  it("tries multiple probe urls when waiting for health", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("fetch failed"))
      .mockResolvedValueOnce(
        new Response("{\"status\":\"ok\"}", {
          status: 200
        })
      );
    vi.stubGlobal("fetch", fetchMock);

    const result = await waitForHealthy(
      ["http://127.0.0.1:3344", "http://localhost:3344"],
      1_000,
      10
    );

    expect(result.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
