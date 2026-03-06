import { TextDecoder } from "node:util";
import type { PolicyEngine, RuntimeWebToolsConfig } from "@openassist/core-types";
import { redactSensitiveData, type OpenAssistLogger } from "@openassist/observability";

export const OPENASSIST_WEB_BRAVE_API_KEY_ENV = "OPENASSIST_TOOLS_WEB_BRAVE_API_KEY";

const DEFAULT_WEB_CONFIG: RuntimeWebToolsConfig = {
  enabled: true,
  searchMode: "hybrid",
  requestTimeoutMs: 15_000,
  maxRedirects: 5,
  maxFetchBytes: 1_000_000,
  maxSearchResults: 8,
  maxPagesPerRun: 4
};

const DEFAULT_USER_AGENT = "OpenAssist/0.1 (+https://github.com/openassistuk/openassist)";
const BRAVE_SEARCH_URL = "https://api.search.brave.com/res/v1/web/search";
const DUCKDUCKGO_SEARCH_URL = "https://html.duckduckgo.com/html/";
const HTML_TEXT_LIMIT = 12_000;
const EXCERPT_LIMIT = 480;
const HIDDEN_HTML_ELEMENTS = new Set(["head", "script", "style", "noscript", "template", "svg"]);
const BLOCK_BREAK_HTML_ELEMENTS = new Set(["br", "p", "div", "section", "article", "ul", "ol", "table", "tr", "h1", "h2", "h3", "h4", "h5", "h6"]);

export interface WebSearchRequest {
  sessionId: string;
  actorId: string;
  query: string;
  limit?: number;
  domains?: string[];
}

export interface WebSearchResultItem {
  title: string;
  url: string;
  snippet: string;
  domain: string;
}

export interface WebSearchResult {
  available: boolean;
  backend: "brave-api" | "duckduckgo-html" | "unavailable";
  searchMode: RuntimeWebToolsConfig["searchMode"];
  query: string;
  results: WebSearchResultItem[];
  guidance?: string;
  note?: string;
}

export interface WebFetchRequest {
  sessionId: string;
  actorId: string;
  url: string;
  format?: "text" | "excerpt";
  maxBytes?: number;
}

export interface WebCitation {
  id: string;
  title: string;
  url: string;
}

export interface WebFetchResult {
  available: boolean;
  requestedUrl: string;
  finalUrl?: string;
  redirects: string[];
  status?: number;
  title?: string;
  contentType?: string;
  content: string;
  excerpt: string;
  fetchedAt: string;
  byteLength?: number;
  citations: WebCitation[];
  guidance?: string;
}

export interface WebRunRequest {
  sessionId: string;
  actorId: string;
  objective: string;
  query?: string;
  urls?: string[];
  searchLimit?: number;
  pageLimit?: number;
  domains?: string[];
}

export interface WebRunResult {
  available: boolean;
  objective: string;
  query?: string;
  backend: "brave-api" | "duckduckgo-html" | "unavailable";
  search?: WebSearchResult;
  sources: Array<{
    citationId: string;
    title: string;
    url: string;
    excerpt: string;
    content: string;
    contentType?: string;
  }>;
  citations: WebCitation[];
  synthesis: string;
  guidance?: string;
}

export interface WebToolStatus {
  enabled: boolean;
  searchMode: RuntimeWebToolsConfig["searchMode"];
  braveApiConfigured: boolean;
  fallbackEnabled: boolean;
  searchStatus: "disabled" | "available" | "fallback" | "unavailable";
  requestTimeoutMs: number;
  maxRedirects: number;
  maxFetchBytes: number;
  maxSearchResults: number;
  maxPagesPerRun: number;
}

export interface WebToolOptions {
  policyEngine: PolicyEngine;
  logger: OpenAssistLogger;
  config?: Partial<RuntimeWebToolsConfig>;
  userAgent?: string;
}

interface ParsedHtmlTag {
  name: string;
  closing: boolean;
  startIndex: number;
  endIndex: number;
}

function isHtmlWhitespaceChar(value: string | undefined): boolean {
  return value === " " || value === "\n" || value === "\t" || value === "\r" || value === "\f" || value === "\v";
}

function isHtmlTagNameChar(value: string | undefined): boolean {
  if (!value) {
    return false;
  }
  const code = value.charCodeAt(0);
  return (
    (code >= 48 && code <= 57) ||
    (code >= 65 && code <= 90) ||
    (code >= 97 && code <= 122) ||
    value === ":" ||
    value === "-" ||
    value === "_"
  );
}

function parseHtmlTag(value: string, startIndex: number): ParsedHtmlTag | undefined {
  if (value[startIndex] !== "<") {
    return undefined;
  }

  let index = startIndex + 1;
  let closing = false;
  if (value[index] === "/") {
    closing = true;
    index += 1;
  }

  while (isHtmlWhitespaceChar(value[index])) {
    index += 1;
  }

  const nameStart = index;
  while (isHtmlTagNameChar(value[index])) {
    index += 1;
  }
  const name = value.slice(nameStart, index).toLowerCase();

  let quote: "\"" | "'" | undefined;
  while (index < value.length) {
    const current = value[index];
    if (quote) {
      if (current === quote) {
        quote = undefined;
      }
      index += 1;
      continue;
    }
    if (current === "\"" || current === "'") {
      quote = current;
      index += 1;
      continue;
    }
    if (current === ">") {
      return {
        name,
        closing,
        startIndex,
        endIndex: index
      };
    }
    index += 1;
  }

  return undefined;
}

function isSelfClosingHtmlTag(value: string, tag: ParsedHtmlTag): boolean {
  let index = tag.endIndex - 1;
  while (index > tag.startIndex && isHtmlWhitespaceChar(value[index])) {
    index -= 1;
  }
  return value[index] === "/";
}

function skipHtmlComment(value: string, startIndex: number): number {
  const endIndex = value.indexOf("-->", startIndex + 4);
  return endIndex >= 0 ? endIndex + 3 : value.length;
}

function findClosingHtmlTagStart(value: string, startIndex: number, tagName: string): number {
  let depth = 1;
  let index = startIndex;
  while (index < value.length) {
    if (value.startsWith("<!--", index)) {
      index = skipHtmlComment(value, index);
      continue;
    }
    if (value[index] !== "<") {
      index += 1;
      continue;
    }

    const tag = parseHtmlTag(value, index);
    if (!tag) {
      index += 1;
      continue;
    }

    if (tag.name === tagName) {
      if (tag.closing) {
        depth -= 1;
        if (depth === 0) {
          return tag.startIndex;
        }
      } else if (!isSelfClosingHtmlTag(value, tag)) {
        depth += 1;
      }
    }

    index = tag.endIndex + 1;
  }

  return -1;
}

function skipHtmlElementContent(value: string, startIndex: number, tagName: string): number {
  const closingStart = findClosingHtmlTagStart(value, startIndex, tagName);
  if (closingStart < 0) {
    return value.length;
  }
  const closingTag = parseHtmlTag(value, closingStart);
  return closingTag ? closingTag.endIndex + 1 : value.length;
}

export function normalizeWhitespace(value: string): string {
  const output: string[] = [];
  let pendingSpace = false;
  let newlineRun = 0;

  for (const current of value) {
    if (current === "\r") {
      continue;
    }

    if (current === "\n") {
      pendingSpace = false;
      while (output.length > 0 && output[output.length - 1] === " ") {
        output.pop();
      }
      if (output.length > 0 && newlineRun < 2) {
        output.push("\n");
      }
      newlineRun += 1;
      continue;
    }

    if (current === " " || current === "\t" || current === "\f" || current === "\v") {
      if (output.length > 0 && output[output.length - 1] !== "\n") {
        pendingSpace = true;
      }
      continue;
    }

    if (pendingSpace && output.length > 0 && output[output.length - 1] !== "\n") {
      output.push(" ");
    }
    pendingSpace = false;
    newlineRun = 0;
    output.push(current);
  }

  return output.join("").trim();
}

export function decodeHtmlEntities(value: string): string {
  const output: string[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const current = value[index];
    if (current !== "&") {
      output.push(current);
      continue;
    }

    const endIndex = value.indexOf(";", index + 1);
    if (endIndex < 0 || endIndex - index > 16) {
      output.push(current);
      continue;
    }

    const entity = value.slice(index + 1, endIndex);
    const normalized = entity.toLowerCase();
    let decoded: string | undefined;
    if (normalized === "amp") {
      decoded = "&";
    } else if (normalized === "lt") {
      decoded = "<";
    } else if (normalized === "gt") {
      decoded = ">";
    } else if (normalized === "quot") {
      decoded = "\"";
    } else if (normalized === "apos" || normalized === "#39") {
      decoded = "'";
    } else if (normalized === "nbsp") {
      decoded = " ";
    } else if (normalized.startsWith("#x")) {
      const codePoint = Number.parseInt(normalized.slice(2), 16);
      if (Number.isFinite(codePoint)) {
        decoded = String.fromCodePoint(codePoint);
      }
    } else if (normalized.startsWith("#")) {
      const codePoint = Number.parseInt(normalized.slice(1), 10);
      if (Number.isFinite(codePoint)) {
        decoded = String.fromCodePoint(codePoint);
      }
    }

    if (decoded === undefined) {
      output.push(value.slice(index, endIndex + 1));
    } else {
      output.push(decoded);
    }
    index = endIndex;
  }

  return output.join("");
}

function htmlFragmentToText(value: string, options?: { skipHidden?: boolean }): string {
  const output: string[] = [];
  let index = 0;

  while (index < value.length) {
    if (value.startsWith("<!--", index)) {
      index = skipHtmlComment(value, index);
      continue;
    }
    if (value[index] !== "<") {
      output.push(value[index]);
      index += 1;
      continue;
    }

    const tag = parseHtmlTag(value, index);
    if (!tag) {
      output.push(value[index]);
      index += 1;
      continue;
    }

    if (options?.skipHidden && !tag.closing && HIDDEN_HTML_ELEMENTS.has(tag.name)) {
      index = skipHtmlElementContent(value, tag.endIndex + 1, tag.name);
      continue;
    }

    if (tag.name === "li" && !tag.closing) {
      output.push("\n- ");
      index = tag.endIndex + 1;
      continue;
    }

    if (tag.name === "li" || BLOCK_BREAK_HTML_ELEMENTS.has(tag.name)) {
      output.push("\n");
      index = tag.endIndex + 1;
      continue;
    }

    index = tag.endIndex + 1;
  }

  return normalizeWhitespace(decodeHtmlEntities(output.join("")));
}

function limitText(value: string, maxChars: number): string {
  if (value.length <= maxChars) {
    return value;
  }
  return `${value.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`;
}

function toExcerpt(value: string): string {
  return limitText(normalizeWhitespace(value), EXCERPT_LIMIT);
}

function asDomainList(domains: string[] | undefined): string[] {
  return (domains ?? [])
    .map((item) => item.trim().toLowerCase())
    .filter((item) => item.length > 0)
    .slice(0, 5);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function isHttpUrl(value: URL): boolean {
  return value.protocol === "http:" || value.protocol === "https:";
}

function normalizeUrl(rawUrl: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error(`Invalid URL: ${rawUrl}`);
  }
  if (!isHttpUrl(parsed)) {
    throw new Error(`Only http and https URLs are supported: ${rawUrl}`);
  }
  parsed.hash = "";
  return parsed;
}

function withDomainFilters(query: string, domains: string[]): string {
  if (domains.length === 0) {
    return query;
  }
  return `${query} ${domains.map((item) => `site:${item}`).join(" OR ")}`.trim();
}

function responseIsRedirect(status: number): boolean {
  return status >= 300 && status < 400;
}

function extractTitleFromHtml(html: string): string | undefined {
  let index = 0;
  while (index < html.length) {
    if (html.startsWith("<!--", index)) {
      index = skipHtmlComment(html, index);
      continue;
    }
    if (html[index] !== "<") {
      index += 1;
      continue;
    }

    const tag = parseHtmlTag(html, index);
    if (!tag) {
      index += 1;
      continue;
    }

    if (tag.name === "title" && !tag.closing) {
      const closingStart = findClosingHtmlTagStart(html, tag.endIndex + 1, "title");
      if (closingStart < 0) {
        return undefined;
      }
      const title = htmlFragmentToText(html.slice(tag.endIndex + 1, closingStart));
      return title.length > 0 ? title : undefined;
    }

    index = tag.endIndex + 1;
  }

  return undefined;
}

export function extractHtmlText(html: string): { title?: string; content: string; excerpt: string } {
  const title = extractTitleFromHtml(html);
  const text = htmlFragmentToText(html, { skipHidden: true });
  const bounded = limitText(text, HTML_TEXT_LIMIT);
  return {
    title,
    content: bounded,
    excerpt: toExcerpt(bounded)
  };
}

export function unwrapDuckDuckGoHref(href: string): string {
  try {
    const base = href.startsWith("http") ? undefined : "https://duckduckgo.com";
    const parsed = new URL(href, base);
    const redirectTarget = parsed.searchParams.get("uddg");
    if (redirectTarget) {
      return redirectTarget;
    }
    return parsed.toString();
  } catch {
    return href;
  }
}

function hostFromUrl(value: string): string {
  try {
    return new URL(value).hostname;
  } catch {
    return "";
  }
}

async function readResponseText(response: Response, maxBytes: number): Promise<{ text: string; byteLength: number }> {
  if (!response.body) {
    return { text: "", byteLength: 0 };
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    if (!value) {
      continue;
    }
    total += value.byteLength;
    if (total > maxBytes) {
      throw new Error(`Response exceeded maxFetchBytes (${maxBytes})`);
    }
    chunks.push(value);
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return {
    text: new TextDecoder("utf8", { fatal: false }).decode(merged),
    byteLength: total
  };
}

function isExtractableContentType(contentType: string): boolean {
  const normalized = contentType.toLowerCase();
  return (
    normalized.includes("text/") ||
    normalized.includes("application/json") ||
    normalized.includes("application/xml") ||
    normalized.includes("application/xhtml") ||
    normalized.includes("application/javascript") ||
    normalized.includes("html")
  );
}

function unavailableSearchResult(
  query: string,
  mode: RuntimeWebToolsConfig["searchMode"],
  guidance: string,
  note?: string
): WebSearchResult {
  return {
    available: false,
    backend: "unavailable",
    searchMode: mode,
    query,
    results: [],
    guidance,
    note
  };
}

function unavailableFetchResult(
  requestedUrl: string,
  guidance: string,
  finalUrl?: string
): WebFetchResult {
  return {
    available: false,
    requestedUrl,
    finalUrl,
    redirects: [],
    content: "",
    excerpt: "",
    fetchedAt: new Date().toISOString(),
    citations: finalUrl
      ? [{ id: "[1]", title: finalUrl, url: finalUrl }]
      : [],
    guidance
  };
}

export class WebTool {
  private readonly policyEngine: PolicyEngine;
  private readonly logger: OpenAssistLogger;
  private readonly config: RuntimeWebToolsConfig;
  private readonly userAgent: string;

  constructor(options: WebToolOptions) {
    this.policyEngine = options.policyEngine;
    this.logger = options.logger;
    this.config = {
      ...DEFAULT_WEB_CONFIG,
      ...(options.config ?? {})
    };
    this.userAgent = options.userAgent ?? DEFAULT_USER_AGENT;
  }

  private braveApiKey(): string {
    return process.env[OPENASSIST_WEB_BRAVE_API_KEY_ENV]?.trim() ?? "";
  }

  getStatus(): WebToolStatus {
    const braveApiConfigured = this.braveApiKey().length > 0;
    const fallbackEnabled = this.config.searchMode !== "api-only";
    let searchStatus: WebToolStatus["searchStatus"];
    if (!this.config.enabled) {
      searchStatus = "disabled";
    } else if (this.config.searchMode === "fallback-only") {
      searchStatus = "fallback";
    } else if (braveApiConfigured) {
      searchStatus = "available";
    } else if (this.config.searchMode === "hybrid") {
      searchStatus = "fallback";
    } else {
      searchStatus = "unavailable";
    }

    return {
      enabled: this.config.enabled,
      searchMode: this.config.searchMode,
      braveApiConfigured,
      fallbackEnabled,
      searchStatus,
      requestTimeoutMs: this.config.requestTimeoutMs,
      maxRedirects: this.config.maxRedirects,
      maxFetchBytes: this.config.maxFetchBytes,
      maxSearchResults: this.config.maxSearchResults,
      maxPagesPerRun: this.config.maxPagesPerRun
    };
  }

  private async authorize(action: "web.search" | "web.fetch" | "web.run", request: { sessionId: string; actorId: string; command: string }): Promise<void> {
    const decision = await this.policyEngine.authorize(action, {
      sessionId: request.sessionId,
      actorId: request.actorId,
      command: request.command
    });
    if (!decision.allowed) {
      throw new Error(decision.reason ?? `${action} blocked by policy`);
    }
  }

  private async fetchWithRedirects(inputUrl: string, maxBytes: number): Promise<{
    requestedUrl: string;
    finalUrl: string;
    redirects: string[];
    status: number;
    contentType: string;
    body: string;
    byteLength: number;
  }> {
    const requestedUrl = normalizeUrl(inputUrl).toString();
    const redirects: string[] = [];
    let currentUrl = requestedUrl;
    for (let attempt = 0; attempt <= this.config.maxRedirects; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), this.config.requestTimeoutMs);
      try {
        const response = await fetch(currentUrl, {
          redirect: "manual",
          headers: {
            "user-agent": this.userAgent,
            "accept": "text/html,application/xhtml+xml,application/json,text/plain;q=0.9,*/*;q=0.2"
          },
          signal: controller.signal
        });
        clearTimeout(timeout);
        if (responseIsRedirect(response.status)) {
          const location = response.headers.get("location");
          if (!location) {
            throw new Error(`Redirect response missing location header for ${currentUrl}`);
          }
          const nextUrl = normalizeUrl(new URL(location, currentUrl).toString()).toString();
          redirects.push(nextUrl);
          currentUrl = nextUrl;
          continue;
        }

        const contentType = response.headers.get("content-type") ?? "application/octet-stream";
        const { text, byteLength } = await readResponseText(response, maxBytes);
        return {
          requestedUrl,
          finalUrl: currentUrl,
          redirects,
          status: response.status,
          contentType,
          body: text,
          byteLength
        };
      } finally {
        clearTimeout(timeout);
      }
    }
    throw new Error(`Too many redirects for ${requestedUrl}`);
  }

  private async searchBrave(query: string, limit: number, domains: string[]): Promise<WebSearchResult> {
    const apiKey = this.braveApiKey();
    if (!apiKey) {
      throw new Error(`${OPENASSIST_WEB_BRAVE_API_KEY_ENV} is not configured`);
    }
    const searchParams = new URLSearchParams();
    searchParams.set("q", withDomainFilters(query, domains));
    searchParams.set("count", String(limit));
    searchParams.set("result_filter", "web");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.requestTimeoutMs);
    try {
      const response = await fetch(`${BRAVE_SEARCH_URL}?${searchParams.toString()}`, {
        headers: {
          "accept": "application/json",
          "x-subscription-token": apiKey,
          "user-agent": this.userAgent
        },
        signal: controller.signal
      });
      const payload = (await response.json()) as {
        web?: {
          results?: Array<{ title?: string; url?: string; description?: string }>;
        };
      };
      const results = (payload.web?.results ?? [])
        .map((item) => ({
          title: normalizeWhitespace(item.title ?? ""),
          url: item.url ?? "",
          snippet: normalizeWhitespace(item.description ?? ""),
          domain: hostFromUrl(item.url ?? "")
        }))
        .filter((item) => item.title.length > 0 && item.url.length > 0)
        .slice(0, limit);
      return {
        available: true,
        backend: "brave-api",
        searchMode: this.config.searchMode,
        query,
        results
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  private async searchDuckDuckGo(query: string, limit: number, domains: string[]): Promise<WebSearchResult> {
    const searchParams = new URLSearchParams();
    searchParams.set("q", withDomainFilters(query, domains));
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.requestTimeoutMs);
    try {
      const response = await fetch(`${DUCKDUCKGO_SEARCH_URL}?${searchParams.toString()}`, {
        headers: {
          "accept": "text/html,application/xhtml+xml",
          "user-agent": this.userAgent
        },
        signal: controller.signal
      });
      const html = await response.text();
      const results: WebSearchResultItem[] = [];
      const linkPattern = /<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
      let match: RegExpExecArray | null;
      while ((match = linkPattern.exec(html)) !== null && results.length < limit) {
        const href = unwrapDuckDuckGoHref(match[1] ?? "");
        const title = htmlFragmentToText(match[2] ?? "");
        if (!href || !title) {
          continue;
        }
        const near = html.slice(match.index, Math.min(html.length, match.index + 1400));
        const snippetMatch =
          near.match(/<a[^>]*class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>/i) ??
          near.match(/<div[^>]*class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
        const snippet = htmlFragmentToText(snippetMatch?.[1] ?? "");
        const normalizedUrl = normalizeUrl(href).toString();
        if (results.some((item) => item.url === normalizedUrl)) {
          continue;
        }
        results.push({
          title,
          url: normalizedUrl,
          snippet,
          domain: hostFromUrl(normalizedUrl)
        });
      }
      return {
        available: true,
        backend: "duckduckgo-html",
        searchMode: this.config.searchMode,
        query,
        results
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  async search(request: WebSearchRequest): Promise<WebSearchResult> {
    await this.authorize("web.search", {
      sessionId: request.sessionId,
      actorId: request.actorId,
      command: `web.search:${request.query}`
    });
    const query = request.query.trim();
    if (!query) {
      throw new Error("query must be a non-empty string");
    }
    if (!this.config.enabled) {
      return unavailableSearchResult(
        query,
        this.config.searchMode,
        "Native web tools are disabled in runtime config."
      );
    }

    const limit = clamp(
      request.limit ?? this.config.maxSearchResults,
      1,
      this.config.maxSearchResults
    );
    const domains = asDomainList(request.domains);

    try {
      if (this.config.searchMode !== "fallback-only") {
        const brave = await this.searchBrave(query, limit, domains);
        this.logger.info(
          redactSensitiveData({
            type: "audit.web.search",
            sessionId: request.sessionId,
            actorId: request.actorId,
            backend: brave.backend,
            query,
            resultCount: brave.results.length
          }),
          "web search completed"
        );
        return brave;
      }
    } catch (error) {
      this.logger.warn(
        redactSensitiveData({
          type: "audit.web.search.warning",
          sessionId: request.sessionId,
          actorId: request.actorId,
          backend: "brave-api",
          query,
          error: error instanceof Error ? error.message : String(error)
        }),
        "web search backend failed"
      );
      if (this.config.searchMode === "api-only") {
        return unavailableSearchResult(
          query,
          this.config.searchMode,
          `Configure ${OPENASSIST_WEB_BRAVE_API_KEY_ENV} or switch tools.web.searchMode away from api-only.`
        );
      }
    }

    try {
      const fallback = await this.searchDuckDuckGo(query, limit, domains);
      this.logger.info(
        redactSensitiveData({
          type: "audit.web.search",
          sessionId: request.sessionId,
          actorId: request.actorId,
          backend: fallback.backend,
          query,
          resultCount: fallback.results.length
        }),
        "web search completed"
      );
      return fallback;
    } catch (error) {
      return unavailableSearchResult(
        query,
        this.config.searchMode,
        `No configured search backend is currently reachable. Configure ${OPENASSIST_WEB_BRAVE_API_KEY_ENV} or retry later.`,
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  async fetchUrl(request: WebFetchRequest): Promise<WebFetchResult> {
    await this.authorize("web.fetch", {
      sessionId: request.sessionId,
      actorId: request.actorId,
      command: `web.fetch:${request.url}`
    });
    if (!this.config.enabled) {
      return unavailableFetchResult(
        request.url,
        "Native web tools are disabled in runtime config."
      );
    }
    const format = request.format ?? "text";
    if (format !== "text" && format !== "excerpt") {
      throw new Error("format must be 'text' or 'excerpt'");
    }

    try {
      const response = await this.fetchWithRedirects(
        request.url,
        clamp(request.maxBytes ?? this.config.maxFetchBytes, 1, this.config.maxFetchBytes)
      );

      if (response.status >= 400) {
        return unavailableFetchResult(
          response.requestedUrl,
          `HTTP ${response.status} returned for ${response.finalUrl}.`,
          response.finalUrl
        );
      }

      if (!isExtractableContentType(response.contentType)) {
        return unavailableFetchResult(
          response.requestedUrl,
          `Unsupported content type for extraction: ${response.contentType}.`,
          response.finalUrl
        );
      }

      const extracted = response.contentType.toLowerCase().includes("html")
        ? extractHtmlText(response.body)
        : {
            title: undefined,
            content: limitText(normalizeWhitespace(response.body), HTML_TEXT_LIMIT),
            excerpt: toExcerpt(response.body)
          };
      const content = format === "excerpt" ? extracted.excerpt : extracted.content;
      const citationTitle = extracted.title ?? response.finalUrl;
      const result: WebFetchResult = {
        available: true,
        requestedUrl: response.requestedUrl,
        finalUrl: response.finalUrl,
        redirects: response.redirects,
        status: response.status,
        title: extracted.title,
        contentType: response.contentType,
        content,
        excerpt: extracted.excerpt,
        fetchedAt: new Date().toISOString(),
        byteLength: response.byteLength,
        citations: [{ id: "[1]", title: citationTitle, url: response.finalUrl }]
      };
      this.logger.info(
        redactSensitiveData({
          type: "audit.web.fetch",
          sessionId: request.sessionId,
          actorId: request.actorId,
          requestedUrl: response.requestedUrl,
          finalUrl: response.finalUrl,
          status: response.status,
          contentType: response.contentType
        }),
        "web fetch completed"
      );
      return result;
    } catch (error) {
      return unavailableFetchResult(
        request.url,
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  async run(request: WebRunRequest): Promise<WebRunResult> {
    await this.authorize("web.run", {
      sessionId: request.sessionId,
      actorId: request.actorId,
      command: `web.run:${request.objective}`
    });
    const objective = request.objective.trim();
    if (!objective) {
      throw new Error("objective must be a non-empty string");
    }
    if (!this.config.enabled) {
      return {
        available: false,
        objective,
        backend: "unavailable",
        sources: [],
        citations: [],
        synthesis: "",
        guidance: "Native web tools are disabled in runtime config."
      };
    }

    const explicitUrls = (request.urls ?? []).map((item) => item.trim()).filter((item) => item.length > 0);
    const pageLimit = clamp(request.pageLimit ?? this.config.maxPagesPerRun, 1, this.config.maxPagesPerRun);
    let search: WebSearchResult | undefined;
    let candidateUrls = explicitUrls.slice(0, pageLimit);

    if (candidateUrls.length === 0) {
      const query = request.query?.trim();
      if (!query) {
        throw new Error("web.run requires either query or urls");
      }
      search = await this.search({
        sessionId: request.sessionId,
        actorId: request.actorId,
        query,
        limit: clamp(request.searchLimit ?? pageLimit, 1, this.config.maxSearchResults),
        domains: request.domains
      });
      candidateUrls = search.results.map((item) => item.url).slice(0, pageLimit);
      if (!search.available || candidateUrls.length === 0) {
        return {
          available: false,
          objective,
          query,
          backend: search.backend,
          search,
          sources: [],
          citations: [],
          synthesis: "",
          guidance: search.guidance ?? "No web sources could be gathered for this run."
        };
      }
    }

    const dedupedUrls = Array.from(new Set(candidateUrls)).slice(0, pageLimit);
    const fetches: WebFetchResult[] = [];
    for (const url of dedupedUrls) {
      const fetched = await this.fetchUrl({
        sessionId: request.sessionId,
        actorId: request.actorId,
        url,
        format: "text"
      });
      if (fetched.available) {
        fetches.push(fetched);
      }
    }

    const citations = fetches.map((item, index) => ({
      id: `[${index + 1}]`,
      title: item.title ?? item.finalUrl ?? item.requestedUrl,
      url: item.finalUrl ?? item.requestedUrl
    }));
    const sources = fetches.map((item, index) => ({
      citationId: `[${index + 1}]`,
      title: item.title ?? item.finalUrl ?? item.requestedUrl,
      url: item.finalUrl ?? item.requestedUrl,
      excerpt: item.excerpt,
      content: item.content,
      contentType: item.contentType
    }));
    const synthesis = normalizeWhitespace(
      [
        `Objective: ${objective}`,
        search?.query ? `Search query: ${search.query}` : "",
        ...sources.map(
          (item) =>
            `${item.citationId} ${item.title}\nURL: ${item.url}\nExcerpt: ${item.excerpt}\nContent: ${limitText(item.content, 2200)}`
        )
      ]
        .filter((item) => item.length > 0)
        .join("\n\n")
    );
    return {
      available: sources.length > 0,
      objective,
      query: search?.query ?? request.query,
      backend: search?.backend ?? "unavailable",
      search,
      sources,
      citations,
      synthesis,
      guidance:
        sources.length > 0
          ? undefined
          : "No reachable extractable web sources were returned for this run."
    };
  }
}
