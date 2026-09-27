import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { generateKeyPairSync, sign } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { verifyManifest, unpackRelease, sha256, download, readBuildIdentity, trustedReleaseKeys, resolveRelease, platformArtifact } from "../../apps/openassist-cli/src/lib/release.js";
import { resolveUpdateMethod, sourceRef, normalizeConfigPaths, pruneLifecycleHistory } from "../../apps/openassist-cli/src/lib/lifecycle-engine.js";
import { acquireLifecycleLock, containedPath, copyPrivateTree, removeManagedPath } from "../../apps/openassist-cli/src/lib/lifecycle-files.js";
import { inspectDatabaseVersion } from "../../packages/storage-sqlite/src/compatibility.js";
import { DatabaseSync } from "node:sqlite";
import { isolatedEnvironment, instancePath } from "../../apps/openassist-cli/src/commands/dev.js";

const require = createRequire(path.resolve("apps/openassist-cli/package.json"));
const tar = require("tar");
const roots:string[]=[];
const temp=()=>{const root=fs.mkdtempSync(path.join(os.tmpdir(),"oa-release-test-"));roots.push(root);return root;};
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();for(const root of roots.splice(0))fs.rmSync(root,{recursive:true,force:true});});
const build={id:"0.1.0-test",version:"0.1.0",commit:"a".repeat(40),nodeVersion:"24.21.0",configVersion:1,databaseVersion:1};
const manifest=()=>({schemaVersion:1,build,channel:"stable",artifacts:["linux-x64","linux-arm64","darwin-x64","darwin-arm64"].map(target=>{const[platform,arch]=target.split('-');return{platform,arch,file:`${target}.tar.gz`,sha256:"b".repeat(64),bytes:100};})});

describe("verified lifecycle releases",()=>{
  it("authenticates exact manifest bytes and rejects tampering and duplicate targets",()=>{
    const {privateKey,publicKey}=generateKeyPairSync("rsa",{modulusLength:2048});
    const key=publicKey.export({type:"spki",format:"pem"}).toString();
    const bytes=Buffer.from(JSON.stringify(manifest()));
    const signature=sign("RSA-SHA256",bytes,privateKey);
    expect(verifyManifest(bytes,signature,[key]).build.id).toBe(build.id);
    expect(()=>verifyManifest(Buffer.concat([bytes,Buffer.from(" ")]),signature,[key])).toThrow("signature");
    expect(()=>verifyManifest(bytes,signature,[])).toThrow("signature");
    const invalid=manifest();invalid.artifacts[0].file="../escape.tar.gz";
    const bad=Buffer.from(JSON.stringify(invalid));
    expect(()=>verifyManifest(bad,sign("RSA-SHA256",bad,privateKey),[key])).toThrow("artifact");
    invalid.artifacts[0]=invalid.artifacts[1];
    const duplicate=Buffer.from(JSON.stringify(invalid));
    expect(()=>verifyManifest(duplicate,sign("RSA-SHA256",duplicate,privateKey),[key])).toThrow("artifact");
  });
  it("round-trips a portable archive and refuses overwrite/truncation",async()=>{
    const root=temp();const source=path.join(root,"source");fs.mkdirSync(source);fs.writeFileSync(path.join(source,"file.txt"),"content");
    const archive=path.join(root,"test.tar.gz");await tar.c({cwd:source,file:archive,gzip:true},["file.txt"]);
    const data=fs.readFileSync(archive);const target=path.join(root,"unpacked");
    unpackRelease(data,target);expect(fs.readFileSync(path.join(target,"file.txt"),"utf8")).toBe("content");
    expect(()=>unpackRelease(data,target)).toThrow("already exists");
    expect(()=>unpackRelease(data.subarray(0,30),path.join(root,"broken"))).toThrow();
    expect(fs.existsSync(path.join(root,"broken"))).toBe(false);
  });
  it("rejects an escaping symbolic link before extracting any file",async()=>{
    if(process.platform === "win32") return;
    const root=temp();fs.symlinkSync("../../outside",path.join(root,"bad"));
    const archive=path.join(root,"bad.tar.gz");await tar.c({cwd:root,file:archive,gzip:true},["bad"]);
    expect(()=>unpackRelease(fs.readFileSync(archive),path.join(root,"out"))).toThrow("escapes");
    expect(fs.existsSync(path.join(root,"out"))).toBe(false);
  });
  it("bounds downloads, rejects HTTP, status errors and oversized streams",async()=>{
    await expect(download("http://example.test/file",10)).rejects.toThrow("HTTPS");
    vi.stubGlobal("fetch",vi.fn().mockResolvedValue(new Response("no",{status:404})));
    await expect(download("https://example.test/file",10)).rejects.toThrow("404");
    vi.stubGlobal("fetch",vi.fn().mockResolvedValue(new Response("too large",{headers:{"content-length":"999"}})));
    await expect(download("https://example.test/file",10)).rejects.toThrow("size limit");
    vi.stubGlobal("fetch",vi.fn().mockResolvedValue(new Response("oversized")));
    await expect(download("https://example.test/file",2)).rejects.toThrow("size limit");
    vi.stubGlobal("fetch",vi.fn().mockResolvedValue(new Response("ok")));
    expect((await download("https://example.test/file",10)).toString()).toBe("ok");
    expect(sha256("ok")).toHaveLength(64);
  });
  it("rejects unsupported build identities and unprovisioned signing keys",()=>{
    const root=temp();fs.writeFileSync(path.join(root,"build-identity.json"),JSON.stringify(build));
    expect(readBuildIdentity(root)).toEqual(build);
    fs.writeFileSync(path.join(root,"release-public.pem"),"# not provisioned");
    expect(()=>trustedReleaseKeys(root)).toThrow("No production");
    fs.writeFileSync(path.join(root,"build-identity.json"),JSON.stringify({...build,databaseVersion:2}));
    expect(()=>readBuildIdentity(root)).toThrow("compatibility");
  });
  it("rejects malformed release selectors before requesting the network",async()=>{
    await expect(resolveRelease({version:"../../main"},[])).rejects.toThrow("Invalid release version");
    expect(()=>resolveUpdateMethod({source:true,channel:"stable"})).toThrow("conflicting");
    expect(()=>resolveUpdateMethod({pr:"0"})).toThrow("Invalid");
    expect(()=>resolveUpdateMethod({ref:"--upload-pack=bad"})).toThrow("Invalid");
    expect(resolveUpdateMethod({})).toBe("release");
    expect(resolveUpdateMethod({installDir:temp()})).toBe("source");
    expect(sourceRef({pr:"23"})).toBe("refs/pull/23/head");
    expect(sourceRef({ref:"main"})).toBe("main");
    expect(()=>sourceRef({}, {trackedRef:"refs/pull/23/head"} as never)).toThrow("explicit");
  });
  it("uses exclusive locks and never deletes outside managed roots",()=>{
    const root=temp();const unlock=acquireLifecycleLock(root);
    expect(()=>acquireLifecycleLock(root)).toThrow("operation");unlock();
    expect(()=>containedPath(root,root)).toThrow("outside");
    expect(()=>removeManagedPath(root,path.dirname(root))).toThrow("outside");
    const file=path.join(root,"source");fs.writeFileSync(file,"private");
    copyPrivateTree(file,path.join(root,"backup"));expect(fs.readFileSync(path.join(root,"backup"),"utf8")).toBe("private");
    removeManagedPath(root,path.join(root,"backup"));expect(fs.existsSync(path.join(root,"backup"))).toBe(false);
  });
  it("blocks unknown and future databases without initializing them",()=>{
    const root=temp();expect(inspectDatabaseVersion(path.join(root,"missing"))).toBe(1);
    const file=path.join(root,"future.db");let db=new DatabaseSync(file);db.exec("PRAGMA user_version=2");db.close();
    expect(()=>inspectDatabaseVersion(file)).toThrow("Unsupported database schema");
    db=new DatabaseSync(file);db.exec("PRAGMA user_version=0; CREATE TABLE unrelated (id INTEGER)");db.close();
    expect(()=>inspectDatabaseVersion(file)).toThrow("Unrecognized");
    db=new DatabaseSync(file,{readOnly:true});expect(db.prepare("SELECT name FROM sqlite_master WHERE name='sessions'").get()).toBeUndefined();db.close();
  });
  it("keeps developer environment isolated and rejects traversal names",()=>{
    process.env.OPENASSIST_PROVIDER_SECRET_API_KEY="test-value";
    try {const env=isolatedEnvironment(temp());expect(env.OPENASSIST_PROVIDER_SECRET_API_KEY).toBeUndefined();expect(env.OPENASSIST_STATE_ROOT).toBeTruthy();expect(()=>instancePath("../primary")).toThrow("Instance names");}
    finally{delete process.env.OPENASSIST_PROVIDER_SECRET_API_KEY;}
  });
  it("normalizes relative state paths without changing credentials",()=>{
    const root=temp();const file=path.join(root,"openassist.toml");fs.writeFileSync(file,'[runtime.paths]\ndataDir="old/data"\n[security]\nsecretsBackend="encrypted-file"\n');
    normalizeConfigPaths(file,root);const text=fs.readFileSync(file,"utf8");expect(text).toContain("encrypted-file");expect(text).toContain("old");expect(text).not.toContain('dataDir="old/data"');
  });
});
