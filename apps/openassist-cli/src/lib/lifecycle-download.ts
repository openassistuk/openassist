const REPOSITORY_PATH = "/repos/openassistuk/openassist";
const ASSET_HOSTS = new Set(["release-assets.githubusercontent.com", "objects.githubusercontent.com"]);

function assertDestination(url: URL, assetRequest: boolean, redirect: boolean): void {
  if (url.protocol !== "https:") throw new Error("Release downloads require HTTPS.");
  if (url.username || url.password || url.port || url.hash) throw new Error("Invalid update download URL.");
  if (!assetRequest && url.hostname === "api.github.com") {
    const route = url.pathname.slice(REPOSITORY_PATH.length);
    if (url.pathname.startsWith(REPOSITORY_PATH) &&
        ["", "/releases/latest", "/git/matching-refs/"].includes(route) && !url.search) return;
    if (url.pathname.startsWith(REPOSITORY_PATH) && ["/releases", "/tags"].includes(route) &&
        /^\?per_page=100&page=([1-9]|10)$/.test(url.search)) return;
  }
  if (assetRequest && url.hostname === "github.com" && !url.search &&
      /^\/openassistuk\/openassist\/releases\/download\/v\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?\/[a-zA-Z0-9._-]+$/.test(url.pathname)) return;
  if (assetRequest && redirect && ASSET_HOSTS.has(url.hostname)) return;
  throw new Error("Update download destination is not approved.");
}

/** Lifecycle-only transport: fixed public API routes or verified-release asset routes. */
export async function download(url: string, limit: number, timeout: number | AbortSignal = 30_000): Promise<Buffer> {
  let parsed = new URL(url);
  const assetRequest = parsed.hostname === "github.com";
  const signal = typeof timeout === "number" ? AbortSignal.timeout(timeout) : timeout;
  let response: Response;
  for (let redirects = 0; ; redirects++) {
    assertDestination(parsed, assetRequest, redirects > 0);
    signal.throwIfAborted();
    response = await fetch(parsed, {
      redirect: "manual", credentials: "omit", referrerPolicy: "no-referrer", signal,
      headers: {accept: assetRequest ? "application/octet-stream" : "application/vnd.github+json", "user-agent": "OpenAssist"}
    });
    if (![301, 302, 303, 307, 308].includes(response.status)) break;
    const location = response.headers.get("location");
    await response.body?.cancel();
    if (!location || redirects >= 5) throw new Error("Release redirect limit exceeded or redirect location missing.");
    parsed = new URL(location, parsed);
  }
  if (!response.ok || !response.body) {
    await response.body?.cancel();
    throw new Error(`Release download failed (HTTP ${response.status}). No installation was changed.`);
  }
  if (Number(response.headers.get("content-length")) > limit) {
    await response.body.cancel();
    throw new Error("Release download exceeds its size limit.");
  }
  const chunks: Buffer[] = [];
  let bytes = 0;
  for await (const chunk of response.body) {
    bytes += chunk.length;
    if (bytes > limit) throw new Error("Release download exceeds its size limit.");
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}
