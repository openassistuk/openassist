import { download } from "./lifecycle-download.js";
import { validateSourceRef } from "./update-track.js";

const REPOSITORY = "https://api.github.com/repos/openassistuk/openassist";
const VERSION = /^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/;
const COMMIT = /^[a-f0-9]{40}$/;
const MAX_PAGES = 10;

export interface DiscoveredRelease { tag: string; version: string; channel: "stable" | "preview" }

function releaseEntry(value: unknown): DiscoveredRelease | undefined {
  if (!value || typeof value !== "object") throw new Error("Invalid release catalogue entry.");
  const entry = value as Record<string, unknown>;
  if (typeof entry.draft !== "boolean" || typeof entry.prerelease !== "boolean" || typeof entry.tag_name !== "string") throw new Error("Invalid release catalogue entry.");
  if (entry.draft || !entry.tag_name.startsWith("v") || !VERSION.test(entry.tag_name.slice(1)) || /\s/.test(entry.tag_name)) return undefined;
  return {tag: entry.tag_name, version: entry.tag_name.slice(1), channel: entry.prerelease ? "preview" : "stable"};
}

async function cataloguePage(kind: "releases" | "tags", page: number, signal: AbortSignal): Promise<unknown[]> {
  // Only a closed route choice and our own bounded page counter reach the network.
  const url = kind === "releases" ? `${REPOSITORY}/releases?per_page=100&page=${page}` : `${REPOSITORY}/tags?per_page=100&page=${page}`;
  const entries: unknown = JSON.parse((await download(url, 2 * 1024 * 1024, signal)).toString("utf8"));
  if (!Array.isArray(entries) || entries.length > 100) throw new Error("Invalid update catalogue page.");
  return entries;
}

/** Saved selectors are local predicates, never URL components. Metadata is advisory. */
export async function discoverRelease(options: {channel?: "stable" | "preview"; version?: string}, signal = AbortSignal.timeout(10_000)): Promise<DiscoveredRelease> {
  if (options.channel !== undefined && !["stable", "preview"].includes(options.channel)) throw new Error("Invalid release channel.");
  if (options.version !== undefined && (!VERSION.test(options.version) || /\s/.test(options.version))) throw new Error("Invalid release version; use a semantic version without a leading v.");
  if (!options.version && options.channel !== "preview") {
    const entry = releaseEntry(JSON.parse((await download(`${REPOSITORY}/releases/latest`, 2 * 1024 * 1024, signal)).toString("utf8")));
    if (entry?.channel === "stable") return entry;
  } else {
    for (let page = 1; page <= MAX_PAGES; page++) {
      const entries = await cataloguePage("releases", page, signal);
      for (const value of entries) {
        const entry = releaseEntry(value);
        if (entry && (options.version ? entry.version === options.version : entry.channel === "preview")) return entry;
      }
      if (entries.length < 100) break;
      if (page === MAX_PAGES) throw new Error("Release catalogue limit reached; target availability is unknown. No target was substituted.");
    }
  }
  throw new Error("No matching published release is available. No target was substituted.");
}

async function tagCommit(name: string, signal: AbortSignal): Promise<string> {
  for (let page = 1; page <= MAX_PAGES; page++) {
    const entries = await cataloguePage("tags", page, signal);
    for (const value of entries) {
      const tag = value as {name?: unknown; commit?: {sha?: unknown}} | null;
      if (!tag || typeof tag.name !== "string" || typeof tag.commit?.sha !== "string" || !COMMIT.test(tag.commit.sha)) throw new Error("Invalid tag catalogue entry.");
      if (tag.name === name) return tag.commit.sha;
    }
    if (entries.length < 100) break;
  }
  throw new Error("Tag commit unavailable within the catalogue limit.");
}

export async function discoverSource(ref: string, current: string | undefined, signal = AbortSignal.timeout(10_000)): Promise<{commit: string; pinned: boolean}> {
  validateSourceRef(ref);
  if (COMMIT.test(ref) && ref === current) return {commit: ref, pinned: true};
  const entries: unknown = JSON.parse((await download(`${REPOSITORY}/git/matching-refs/`, 4 * 1024 * 1024, signal)).toString("utf8"));
  if (!Array.isArray(entries) || entries.length > 10_000) throw new Error("Invalid or oversized source catalogue.");
  const refs = new Map<string, {sha: string; type: string}>();
  for (const value of entries) {
    if (!value || typeof value.ref !== "string" || !value.ref.startsWith("refs/") || refs.has(value.ref) ||
        !value.object || typeof value.object.sha !== "string" || !COMMIT.test(value.object.sha) ||
        !["commit", "tag", "tree", "blob"].includes(value.object.type)) throw new Error("Invalid source catalogue entry.");
    refs.set(value.ref, {sha: value.object.sha, type: value.object.type});
  }
  let selected = ref;
  if (ref === "HEAD") {
    const repository = JSON.parse((await download(REPOSITORY, 1024 * 1024, signal)).toString("utf8"));
    if (typeof repository.default_branch !== "string") throw new Error("Default source branch unavailable.");
    selected = `refs/heads/${repository.default_branch}`;
  }
  const names = selected.startsWith("refs/") ? [selected] : [`refs/heads/${selected}`, `refs/tags/${selected}`, `refs/${selected}`];
  const matches = names.filter(name => refs.has(name));
  if (matches.length > 1) throw new Error("Ambiguous source ref; use a fully qualified ref.");
  if (!matches.length) {
    if (/^[a-f0-9]{7,40}$/.test(ref) && current && COMMIT.test(current) && current.startsWith(ref)) return {commit: current, pinned: true};
    throw new Error("Source ref unavailable in the public catalogue. No target was substituted.");
  }
  const name = matches[0];
  const target = refs.get(name)!;
  if (target.type === "commit") return {commit: target.sha, pinned: false};
  if (target.type === "tag" && name.startsWith("refs/tags/")) return {commit: await tagCommit(name.slice(10), signal), pinned: false};
  throw new Error("Source ref does not identify a commit.");
}
