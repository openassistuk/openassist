import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createHash, createPublicKey, verify } from "node:crypto";
import { gunzipSync } from "node:zlib";
import * as tar from "tar";
import { fileURLToPath } from "node:url";
import type { BuildIdentity, ReleaseManifest, ReleaseArtifact } from "@openassist/core-types";
import { download } from "./lifecycle-download.js";
import { discoverRelease } from "./update-discovery.js";

export { download } from "./lifecycle-download.js";

export const MAX_ARCHIVE_BYTES = 512 * 1024 * 1024;
export const MAX_UNPACKED_BYTES = 1024 * 1024 * 1024;
export const sha256 = (data: Buffer | string): string => createHash("sha256").update(data).digest("hex");

export function findApplicationRoot(start = path.dirname(fileURLToPath(import.meta.url))): string {
  let current = start;
  let sourceRoot: string | undefined;
  while (true) {
    if (fs.existsSync(path.join(current, "build-identity.json"))) return current;
    // pnpm deploy can leave a workspace marker inside an individual application.
    // A packaged build identity above that marker owns the release trust anchor.
    if (fs.existsSync(path.join(current, "pnpm-workspace.yaml"))) sourceRoot ??= current;
    const parent = path.dirname(current);
    if (parent === current) {
      if (sourceRoot) return sourceRoot;
      throw new Error("Cannot locate OpenAssist application files.");
    }
    current = parent;
  }
}

export function readBuildIdentity(root: string): BuildIdentity {
  const identity = JSON.parse(fs.readFileSync(path.join(root, "build-identity.json"), "utf8"));
  if (!identity || !/^[a-zA-Z0-9._-]{1,160}$/.test(identity.id) ||
      typeof identity.version !== "string" || !/^[a-f0-9]{40,64}$/.test(identity.commit) ||
      !/^24\.(2[1-9]|[3-9]\d|\d{3,})\.\d+$/.test(identity.nodeVersion) ||
      identity.configVersion !== 1 || identity.databaseVersion !== 1) {
    throw new Error("Unsupported build identity or state compatibility. Use a compatible release.");
  }
  return identity;
}

export function trustedReleaseKeys(root = findApplicationRoot()): string[] {
  const key = fs.readFileSync(path.join(root, "release-public.pem"), "utf8");
  if (!key.includes("-----BEGIN PUBLIC KEY-----")) throw new Error("No production release signing key is provisioned. Use an explicit source installation until a signed release is available.");
  return [key];
}

export function verifyManifest(bytes: Buffer, signature: Buffer, keys: string[]): ReleaseManifest {
  if (bytes.length > 1024 * 1024 || !keys.some(key => createPublicKey(key).asymmetricKeyType==="rsa" && verify("RSA-SHA256", bytes, key, signature))) throw new Error("Release signature verification failed.");
  const manifest = JSON.parse(bytes.toString("utf8")) as ReleaseManifest;
  if (manifest.schemaVersion !== 1 || !["stable", "preview"].includes(manifest.channel) || !manifest.build ||
      !Array.isArray(manifest.artifacts) || manifest.artifacts.length !== 4 ||
      !/^[a-zA-Z0-9._-]{1,160}$/.test(manifest.build.id) ||
      !/^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/.test(manifest.build.version) ||
      manifest.build.configVersion !== 1 || manifest.build.databaseVersion !== 1 ||
      !/^[a-f0-9]{40,64}$/.test(manifest.build.commit)) throw new Error("Unsupported release manifest.");
  const targets = new Set<string>();
  for (const artifact of manifest.artifacts) {
    const target = `${artifact.platform}-${artifact.arch}`;
    if (!['linux-x64','linux-arm64','darwin-x64','darwin-arm64'].includes(target) || targets.has(target) ||
        !/^[a-zA-Z0-9._-]+\.tar\.gz$/.test(artifact.file) || !/^[a-f0-9]{64}$/.test(artifact.sha256) ||
        !Number.isSafeInteger(artifact.bytes) || artifact.bytes <= 0 || artifact.bytes > MAX_ARCHIVE_BYTES) throw new Error("Invalid release artifact.");
    targets.add(target);
  }
  return manifest;
}

export function platformArtifact(manifest: ReleaseManifest): ReleaseArtifact {
  const artifact = manifest.artifacts.find(a => a.platform === process.platform && a.arch === process.arch);
  if (!artifact) throw new Error(`No packaged release for ${process.platform}/${process.arch}. Linux glibc and macOS x64/arm64 are supported.`);
  if (process.platform === "linux") {
    const report = process.report.getReport() as { header: { glibcVersionRuntime?: string } };
    const glibc = report.header.glibcVersionRuntime?.split(".").map(Number);
    const kernel = os.release().split('.').map(Number);
    if (!glibc || glibc[0] < 2 || (glibc[0] === 2 && glibc[1] < 28) || kernel[0] < 4 || (kernel[0] === 4 && kernel[1] < 18)) throw new Error("Packaged releases require Linux glibc >=2.28 and kernel >=4.18.");
  }
  if (process.platform === "darwin") {
    const kernel = os.release().split('.').map(Number);
    if (kernel[0] < 22 || (kernel[0] === 22 && kernel[1] < 6)) throw new Error("Packaged releases require macOS 13.5 or later.");
  }
  return artifact;
}

export async function resolveRelease(options: {channel?: "stable" | "preview"; version?: string}, keys = trustedReleaseKeys()): Promise<{manifest: ReleaseManifest; baseUrl: string}> {
  const release = await discoverRelease(options);
  const baseUrl = `https://github.com/openassistuk/openassist/releases/download/${release.tag}`;
  const [bytes, signature] = await Promise.all([download(`${baseUrl}/release.json`, 1024 * 1024, 5000), download(`${baseUrl}/release.sig`, 8192, 5000)]);
  const manifest = verifyManifest(bytes, signature, keys);
  if (`v${manifest.build.version}` !== release.tag || manifest.channel !== release.channel) throw new Error("Release identity does not match the requested track.");
  return {manifest, baseUrl};
}

/** Validate the entire archive before extraction; links may only resolve inside the artifact. */
export function unpackRelease(archive: Buffer, target: string): void {
  if (fs.existsSync(target)) throw new Error("Release extraction target already exists.");
  const unpacked = gunzipSync(archive, { maxOutputLength: MAX_UNPACKED_BYTES });
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "openassist-archive-"));
  const file = path.join(temporary, "release.tar");
  fs.writeFileSync(file, unpacked, {mode: 0o600});
  const entries = new Map<string, {type: string; link: string}>();
  try {
    tar.t({file, sync: true, strict: true, onReadEntry: entry => {
      const name = entry.path.replace(/\/$/, "");
      if (!name || path.posix.isAbsolute(name) || /[\\\x00-\x1f:]/.test(name) ||
          name.split('/').some(p => p === '..' || p === '.' || !p) || entries.has(name) || entries.size >= 100_000 ||
          !["File", "Directory", "SymbolicLink", "Link"].includes(entry.type)) throw new Error("Unsafe release archive entry.");
      if (entry.type === "SymbolicLink" || entry.type === "Link") {
        const link = entry.linkpath ?? "";
        const resolved = path.posix.normalize(entry.type === "Link" ? link : path.posix.join(path.posix.dirname(name), link));
        if (!link || path.posix.isAbsolute(link) || /[\\\x00-\x1f:]/.test(link) || resolved === '..' || resolved.startsWith('../')) throw new Error("Release archive link escapes its installation.");
      }
      entries.set(name, {type: entry.type, link: entry.linkpath ?? ""});
    }});
    if (!entries.size || unpacked.length < 1024 || !unpacked.subarray(-1024).every(b => b === 0)) throw new Error("Truncated release archive.");
    // Resolve components before '..': lexical normalization alone hides traversal
    // through links such as a -> . and b -> a/../outside. Use the complete map so
    // validation does not depend on archive order or files already extracted.
    const resolveLink = (name: string, visiting = new Set<string>(), budget = {remaining: 40}): string[] => {
      if (visiting.has(name) || --budget.remaining < 0) throw new Error("Release archive contains a cyclic or excessive link chain.");
      visiting.add(name);
      const entry = entries.get(name)!;
      const resolved = entry.type === "Link" ? [] : name.split('/').slice(0, -1);
      for (const segment of entry.link.split('/')) {
        if (!segment || segment === '.') continue;
        if (segment === '..') {
          if (!resolved.length) throw new Error("Release archive link escapes its installation.");
          resolved.pop();
        } else {
          resolved.push(segment);
          const targetName = resolved.join('/');
          const target = entries.get(targetName);
          if (target?.type === "SymbolicLink" || target?.type === "Link") {
            resolved.splice(0, resolved.length, ...resolveLink(targetName, visiting, budget));
          }
        }
      }
      visiting.delete(name);
      return resolved;
    };
    for (const name of entries.keys()) {
      let parent = path.posix.dirname(name);
      while (parent !== '.') {
        if (entries.has(parent) && entries.get(parent)?.type !== 'Directory') throw new Error("Archive writes through a link or file.");
        parent = path.posix.dirname(parent);
      }
    }
    for (const [name, entry] of entries) {
      if (entry.type === "SymbolicLink" || entry.type === "Link") resolveLink(name);
      // A hardlink to a symlink copies the symlink inode, whose relative target
      // then resolves from the new parent. Only direct regular-file targets are
      // needed by deployment archives; refuse aliases rather than reinterpret them.
      if (entry.type === "Link" &&
          (entry.link.split('/').includes('..') || entries.get(path.posix.normalize(entry.link))?.type !== "File")) {
        throw new Error("Release archive hardlinks must target regular archive files directly.");
      }
    }
    fs.mkdirSync(target, {recursive: true, mode: 0o700});
    tar.x({file, cwd: target, sync: true, strict: true, preservePaths: false, noChmod: true, noMtime: true});
  } finally { fs.rmSync(temporary, {recursive: true, force: true}); }
}
