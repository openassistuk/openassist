import { afterEach, describe, expect, it, vi } from "vitest";
import {
  OPENASSIST_WEB_BRAVE_API_KEY_ENV,
  WebTool,
  extractHtmlText,
  unwrapDuckDuckGoHref
} from "../../packages/tools-web/src/index.js";

function createTool(config?: Partial<ConstructorParameters<typeof WebTool>[0]["config"]>) {
  return new WebTool({
    policyEngine: {
      currentProfile: async () => "full-root",
      setProfile: async () => undefined,
      authorize: async () => ({ allowed: true })
    },
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } as any,
    config
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env[OPENASSIST_WEB_BRAVE_API_KEY_ENV];
});

describe("WebTool", () => {
  it("extracts normalized title and text from HTML", () => {
    const extracted = extractHtmlText(`
      <html>
        <head><title>OpenAssist &amp; Tests</title></head>
        <body>
          <main><h1>Hello</h1><p>World</p><script>ignore()</script></main>
        </body>
      </html>
    `);

    expect(extracted.title).toBe("OpenAssist & Tests");
    expect(extracted.content).toContain("Hello");
    expect(extracted.content).toContain("World");
    expect(extracted.content).not.toContain("ignore");
  });

  it("unwraps DuckDuckGo redirect links", () => {
    expect(
      unwrapDuckDuckGoHref("/l/?uddg=https%3A%2F%2Fexample.com%2Fpost")
    ).toBe("https://example.com/post");
  });

  it("uses DuckDuckGo fallback search when Brave API is not configured in hybrid mode", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          `
            <div class="result">
              <a class="result__a" href="/l/?uddg=https%3A%2F%2Fexample.com%2Farticle">Example</a>
              <div class="result__snippet">Useful snippet</div>
            </div>
          `,
          {
            status: 200,
            headers: { "content-type": "text/html" }
          }
        )
      )
    );

    const tool = createTool({ searchMode: "hybrid" });
    const result = await tool.search({
      sessionId: "telegram:c1",
      actorId: "telegram:u1",
      query: "openassist"
    });

    expect(result.available).toBe(true);
    expect(result.backend).toBe("duckduckgo-html");
    expect(result.results[0]?.url).toBe("https://example.com/article");
  });

  it("returns a structured unavailable result in api-only mode without a Brave key", async () => {
    const tool = createTool({ searchMode: "api-only" });
    const result = await tool.search({
      sessionId: "telegram:c1",
      actorId: "telegram:u1",
      query: "openassist"
    });

    expect(result.available).toBe(false);
    expect(result.backend).toBe("unavailable");
    expect(result.guidance).toContain(OPENASSIST_WEB_BRAVE_API_KEY_ENV);
  });

  it("follows redirects and extracts HTML during fetch", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url === "https://example.com/start") {
          return new Response("", {
            status: 302,
            headers: { location: "https://example.com/final" }
          });
        }
        return new Response("<html><title>Final</title><body><p>Fetched page</p></body></html>", {
          status: 200,
          headers: { "content-type": "text/html" }
        });
      })
    );

    const tool = createTool();
    const result = await tool.fetchUrl({
      sessionId: "telegram:c1",
      actorId: "telegram:u1",
      url: "https://example.com/start"
    });

    expect(result.available).toBe(true);
    expect(result.finalUrl).toBe("https://example.com/final");
    expect(result.redirects).toEqual(["https://example.com/final"]);
    expect(result.title).toBe("Final");
    expect(result.content).toContain("Fetched page");
  });

  it("prefers Brave Search when the API key is configured", async () => {
    process.env[OPENASSIST_WEB_BRAVE_API_KEY_ENV] = "brave-key";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            web: {
              results: [
                {
                  title: "OpenAssist Docs",
                  url: "https://example.com/docs",
                  description: "Doc result"
                }
              ]
            }
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" }
          }
        )
      )
    );

    const tool = createTool({ searchMode: "hybrid" });
    const result = await tool.search({
      sessionId: "telegram:c1",
      actorId: "telegram:u1",
      query: "openassist docs"
    });

    expect(result.available).toBe(true);
    expect(result.backend).toBe("brave-api");
    expect(result.results[0]?.title).toBe("OpenAssist Docs");
  });
});
