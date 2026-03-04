export interface HealthResult {
  ok: boolean;
  status: number;
  bodyText: string;
  baseUrl?: string;
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

function isIpv6Literal(host: string): boolean {
  return host.includes(":") && !host.startsWith("[") && !host.endsWith("]");
}

function formatHostForUrl(host: string): string {
  return isIpv6Literal(host) ? `[${host}]` : host;
}

function withHost(url: URL, host: string): string {
  const clone = new URL(url.toString());
  clone.hostname = host;
  return normalizeBaseUrl(clone.toString());
}

export function preferredLocalHealthBaseUrl(bindAddress: string, bindPort: number): string {
  if (bindAddress === "0.0.0.0") {
    return `http://127.0.0.1:${bindPort}`;
  }
  if (bindAddress === "::") {
    return `http://127.0.0.1:${bindPort}`;
  }
  return `http://${formatHostForUrl(bindAddress)}:${bindPort}`;
}

export function deriveHealthProbeBaseUrls(baseUrl: string): string[] {
  const normalized = normalizeBaseUrl(baseUrl);
  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    return [normalized];
  }

  const urls: string[] = [];
  const pushUnique = (value: string): void => {
    if (!urls.includes(value)) {
      urls.push(value);
    }
  };

  const hostname = parsed.hostname;
  if (hostname === "0.0.0.0") {
    pushUnique(withHost(parsed, "127.0.0.1"));
    pushUnique(withHost(parsed, "localhost"));
  } else if (hostname === "::" || hostname === "0:0:0:0:0:0:0:0") {
    pushUnique(withHost(parsed, "::1"));
    pushUnique(withHost(parsed, "127.0.0.1"));
    pushUnique(withHost(parsed, "localhost"));
  }
  pushUnique(normalized);
  return urls;
}

export async function checkHealth(baseUrl: string): Promise<HealthResult> {
  const normalized = normalizeBaseUrl(baseUrl);
  const url = `${normalized}/v1/health`;
  const response = await fetch(url, {
    method: "GET",
    headers: {
      accept: "application/json"
    }
  });
  const bodyText = await response.text();
  const ok = response.status < 400 && bodyText.includes("\"status\":\"ok\"");
  return {
    ok,
    status: response.status,
    bodyText,
    baseUrl: normalized
  };
}

export async function waitForHealthy(
  baseUrl: string | string[],
  timeoutMs = 60_000,
  intervalMs = 2_000,
  onAttempt?: (result: HealthResult, attempt: number) => void
): Promise<HealthResult> {
  const deadline = Date.now() + timeoutMs;
  const baseUrls = Array.isArray(baseUrl)
    ? baseUrl.map((item) => normalizeBaseUrl(item))
    : deriveHealthProbeBaseUrls(baseUrl);
  let last: HealthResult = {
    ok: false,
    status: 0,
    bodyText: ""
  };
  let attempts = 0;

  while (Date.now() <= deadline) {
    for (const probeBaseUrl of baseUrls) {
      attempts += 1;
      try {
        last = await checkHealth(probeBaseUrl);
        onAttempt?.(last, attempts);
        if (last.ok) {
          return last;
        }
      } catch (error) {
        last = {
          ok: false,
          status: 0,
          bodyText: error instanceof Error ? error.message : String(error),
          baseUrl: probeBaseUrl
        };
        onAttempt?.(last, attempts);
      }
    }
    await new Promise((resolve) => setTimeout(resolve, Math.max(200, intervalMs)));
  }

  return last;
}
