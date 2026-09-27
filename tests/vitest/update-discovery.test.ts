import { afterEach, describe, expect, it, vi } from "vitest";
import { discoverRelease, discoverSource } from "../../apps/openassist-cli/src/lib/update-discovery.js";
import { download } from "../../apps/openassist-cli/src/lib/lifecycle-download.js";

const api = "https://api.github.com/repos/openassistuk/openassist";
const asset = "https://github.com/openassistuk/openassist/releases/download/v1.0.0/release.json";
const commit = "a".repeat(40);
const next = "b".repeat(40);
const release = (version: string, preview = false) => ({tag_name: `v${version}`, prerelease: preview, draft: false});
const ref = (name: string, type = "commit") => ({ref: name, object: {type, sha: next}});
const respond = (value: unknown) => new Response(JSON.stringify(value));
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("public update catalogue discovery", () => {
  it("keeps exact-version selectors local and finds older releases on later pages", async () => {
    const fetch = vi.fn(async (url: URL) => respond(url.searchParams.get("page") === "1" ? Array.from({length: 100}, (_, i) => release(`2.0.${i}`)) : [release("1.0.0")]));
    vi.stubGlobal("fetch", fetch);
    expect(await discoverRelease({version: "1.0.0"})).toEqual({tag: "v1.0.0", version: "1.0.0", channel: "stable"});
    expect(fetch.mock.calls.map(([url]) => String(url))).toEqual([`${api}/releases?per_page=100&page=1`, `${api}/releases?per_page=100&page=2`]);
  });
  it("uses GitHub latest-stable semantics and skips drafts for previews", async () => {
    const fetch = vi.fn(async (url: URL) => respond(url.pathname.endsWith("latest") ? release("1.0.0") : [{...release("2.0.0-beta", true), draft: true}, release("1.0.0"), release("1.1.0-beta", true)]));
    vi.stubGlobal("fetch", fetch);
    expect((await discoverRelease({})).version).toBe("1.0.0");
    expect((await discoverRelease({channel: "preview"})).version).toBe("1.1.0-beta");
    expect((await discoverRelease({version: "1.1.0-beta"})).channel).toBe("preview");
    expect(String(fetch.mock.calls[0][0])).toBe(`${api}/releases/latest`);
  });
  it("does not substitute a target or query the saved value when a selection is missing", async () => {
    const fetch = vi.fn(async () => respond([release("1.0.0")]));
    vi.stubGlobal("fetch", fetch);
    await expect(discoverRelease({version: "9.0.0-private"})).rejects.toThrow("No matching");
    expect(String(fetch.mock.calls[0]?.[0])).not.toContain("9.0.0-private");
    await expect(discoverRelease({channel: "preview"})).rejects.toThrow("No matching");
  });
  it("bounds catalogue pages and rejects malformed or oversized responses", async () => {
    const fetch = vi.fn(async () => respond(Array.from({length: 100}, () => release("1.0.0"))));
    vi.stubGlobal("fetch", fetch);
    await expect(discoverRelease({version: "9.0.0"})).rejects.toThrow("catalogue limit");
    expect(fetch).toHaveBeenCalledTimes(10);
    for (const value of [{}, Array(101).fill(release("1.0.0")), [null], [{tag_name: 2}], [{draft: false, prerelease: false, tag_name: "other"}]]) {
      fetch.mockImplementation(async () => respond(value));
      await expect(discoverRelease({version: "9.0.0"})).rejects.toThrow();
    }
    fetch.mockImplementation(async () => new Response("{}", {headers: {"content-length": String(3 * 1024 * 1024)}}));
    await expect(discoverRelease({})).rejects.toThrow("size limit");
  });
  it("rejects invalid selectors and honours an already-expired overall deadline without fetching", async () => {
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    for (const version of ["", "1.0.0\n", "https://example.test", "v1.0.0"]) await expect(discoverRelease({version})).rejects.toThrow("Invalid release version");
    await expect(discoverRelease({channel: "other" as never})).rejects.toThrow("channel");
    await expect(discoverRelease({}, AbortSignal.abort())).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });
  it("shares one cancellation signal across catalogue pages", async () => {
    const controller = new AbortController();
    const fetch = vi.fn(async () => { controller.abort(); return respond(Array.from({length: 100}, () => release("1.0.0"))); });
    vi.stubGlobal("fetch", fetch);
    await expect(discoverRelease({version: "2.0.0"}, controller.signal)).rejects.toThrow();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("selects branch, PR and lightweight-tag commits without transmitting their names", async () => {
    const fetch = vi.fn(async () => respond([ref("refs/heads/feature/private-selector"), ref("refs/pull/63/head"), ref("refs/tags/v1.0.0")]));
    vi.stubGlobal("fetch", fetch);
    for (const name of ["feature/private-selector", "refs/heads/feature/private-selector", "refs/pull/63/head", "v1.0.0"]) expect(await discoverSource(name, commit)).toEqual({commit: next, pinned: false});
    expect(fetch.mock.calls.every(([url]) => String(url) === `${api}/git/matching-refs/`)).toBe(true);
  });
  it("resolves annotated tags through fixed paginated tag catalogues", async () => {
    const fetch = vi.fn(async (url: URL) => respond(url.pathname.endsWith("matching-refs/") ? [ref("refs/tags/v1.0.0", "tag")] : url.searchParams.get("page") === "1" ? Array.from({length: 100}, (_, i) => ({name: `v2.0.${i}`, commit: {sha: next}})) : [{name: "v1.0.0", commit: {sha: commit}}]));
    vi.stubGlobal("fetch", fetch);
    expect(await discoverSource("v1.0.0", next)).toEqual({commit, pinned: false});
    expect(fetch.mock.calls.map(([url]) => String(url))).toEqual([`${api}/git/matching-refs/`, `${api}/tags?per_page=100&page=1`, `${api}/tags?per_page=100&page=2`]);
  });
  it("recognizes installed immutable commits without requesting them", async () => {
    const fetch = vi.fn(async () => respond([])); vi.stubGlobal("fetch", fetch);
    expect(await discoverSource(commit, commit)).toEqual({commit, pinned: true});
    expect(fetch).not.toHaveBeenCalled();
    expect(await discoverSource(commit.slice(0, 12), commit)).toEqual({commit, pinned: true});
    await expect(discoverSource(next, commit)).rejects.toThrow("unavailable");
  });
  it("resolves HEAD using public repository metadata and rejects ambiguity", async () => {
    const fetch = vi.fn(async (url: URL) => respond(url.pathname.endsWith("matching-refs/") ? [ref("refs/heads/main"), ref("refs/tags/main")] : {default_branch: "main"}));
    vi.stubGlobal("fetch", fetch);
    expect(await discoverSource("HEAD", commit)).toEqual({commit: next, pinned: false});
    await expect(discoverSource("main", commit)).rejects.toThrow("Ambiguous");
    fetch.mockImplementation(async (url: URL) => respond(url.pathname.endsWith("matching-refs/") ? [] : {}));
    await expect(discoverSource("HEAD", commit)).rejects.toThrow("Default source");
  });
  it("fails closed on missing, invalid, duplicate and non-commit refs", async () => {
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    for (const value of [{}, [], [null], [ref("other")], [ref("refs/heads/main"), ref("refs/heads/main")], [{...ref("refs/heads/main"), object: {sha: "bad", type: "commit"}}], [ref("refs/heads/main", "tree")], Array(10_001).fill(ref("refs/heads/main"))]) {
      fetch.mockImplementation(async () => respond(value));
      await expect(discoverSource("main", commit)).rejects.toThrow();
    }
    fetch.mockImplementation(async (url: URL) => respond(url.pathname.endsWith("matching-refs/") ? [ref("refs/tags/tag", "tag")] : [{name: "tag", commit: {sha: "bad"}}]));
    await expect(discoverSource("tag", commit)).rejects.toThrow("Invalid tag");
    fetch.mockImplementation(async (url: URL) => respond(url.pathname.endsWith("matching-refs/") ? [ref("refs/tags/tag", "tag")] : []));
    await expect(discoverSource("tag", commit)).rejects.toThrow("Tag commit unavailable");
  });
});

describe("lifecycle download destinations", () => {
  it("rejects arbitrary destinations, credentials, ports and API selector routes before fetching", async () => {
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    for (const url of ["https://example.test/file", "https://github.com.evil.test/file", "https://127.0.0.1/file", `${api}/commits/private`, `${api}/releases/tags/v1.0.0`, `${api}/releases?per_page=100&page=11`, `${api}/releases?per_page=100&page=1&secret=private`, `${api}/releases/latest#private`, asset.replace("github.com", "user:secret@github.com"), asset.replace("github.com", "github.com:444"), asset.replace("openassistuk/openassist", "another/repo"), asset + "?private=value", "https://release-assets.githubusercontent.com/direct"]) await expect(download(url, 100)).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });
  it("allows approved CDN redirects, omits credentials and preserves signed queries", async () => {
    for (const host of ["release-assets.githubusercontent.com", "objects.githubusercontent.com"]) {
      const fetch = vi.fn().mockResolvedValueOnce(new Response(null, {status: 302, headers: {location: `https://${host}/asset?signature=test`}})).mockResolvedValueOnce(new Response("ok"));
      vi.stubGlobal("fetch", fetch);
      expect((await download(asset, 100)).toString()).toBe("ok");
      expect(String(fetch.mock.calls[1][0])).toBe(`https://${host}/asset?signature=test`);
      expect(fetch.mock.calls[1][1]).toMatchObject({credentials: "omit", referrerPolicy: "no-referrer", redirect: "manual"});
      expect(fetch.mock.calls[1][1].body).toBeUndefined();
    }
  });
  it("checks every redirect and prevents API-to-CDN and arbitrary-host escapes", async () => {
    for (const [from, to] of [[asset, "https://evil.test/steal"], [asset, "http://github.com/insecure"], [`${api}/releases/latest`, "https://release-assets.githubusercontent.com/file"], [asset, `${api}/releases/latest`], [asset, "https://github.com/another/repo"], [asset, "https://user:secret@release-assets.githubusercontent.com/file"]]) {
      const fetch = vi.fn(async () => new Response(null, {status: 302, headers: {location: to}})); vi.stubGlobal("fetch", fetch);
      await expect(download(from, 100)).rejects.toThrow();
      expect(fetch).toHaveBeenCalledTimes(1);
    }
    const fetch = vi.fn().mockResolvedValueOnce(new Response(null, {status: 302, headers: {location: "https://release-assets.githubusercontent.com/file"}})).mockResolvedValueOnce(new Response(null, {status: 302, headers: {location: "https://evil.test/file"}}));
    vi.stubGlobal("fetch", fetch); await expect(download(asset, 100)).rejects.toThrow("not approved"); expect(fetch).toHaveBeenCalledTimes(2);
  });
});
