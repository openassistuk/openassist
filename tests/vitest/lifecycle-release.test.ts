import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { generateKeyPairSync, sign } from "node:crypto";
import { gzipSync } from "node:zlib";
import { afterEach, describe, expect, it, vi } from "vitest";
import { verifyManifest, unpackRelease, sha256, download, readBuildIdentity, trustedReleaseKeys, resolveRelease, platformArtifact, findApplicationRoot } from "../../apps/openassist-cli/src/lib/release.js";
import { resolveUpdateMethod, sourceRef, normalizeConfigPaths } from "../../apps/openassist-cli/src/lib/lifecycle-engine.js";
import { acquireLifecycleLock, containedPath, copyPrivateTree, removeManagedPath } from "../../apps/openassist-cli/src/lib/lifecycle-files.js";
import { inspectDatabaseVersion } from "../../packages/storage-sqlite/src/compatibility.js";
import { DatabaseSync } from "node:sqlite";
import { isolatedEnvironment, isolatedDaemonEnvironment, instancePath } from "../../apps/openassist-cli/src/commands/dev.js";
import { checkHealth } from "../../apps/openassist-cli/src/lib/health-check.js";
import { renderOperationSummary } from "../../apps/openassist-cli/src/lib/lifecycle-readiness.js";
import { getBuildIdentity, runtimeInstanceId } from "../../packages/config/src/build-identity.js";

const require = createRequire(path.resolve("apps/openassist-cli/package.json"));
const tar = require("tar");
const roots:string[]=[];
const temp=()=>{const root=fs.mkdtempSync(path.join(os.tmpdir(),"oa-release-test-"));roots.push(root);return root;};
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();for(const root of roots.splice(0))fs.rmSync(root,{recursive:true,force:true});});
const build={id:"0.1.0-test",version:"0.1.0",commit:"a".repeat(40),nodeVersion:"24.21.0",configVersion:1,databaseVersion:1};
const manifest=()=>({schemaVersion:1,build,channel:"stable",artifacts:["linux-x64","linux-arm64","darwin-x64","darwin-arm64"].map(target=>{const[platform,arch]=target.split('-');return{platform,arch,file:`${target}.tar.gz`,sha256:"b".repeat(64),bytes:100};})});

describe("verified lifecycle releases",()=>{
  it("preserves path-only instance fingerprints and normalizes equivalent paths",()=>{
    const configPath=process.platform==="win32" ? "C:\\OpenAssist\\config\\openassist.toml" : "/var/lib/openassist/openassist.toml";
    const expected=process.platform==="win32" ? "6ab3c271c1ff61cb0f860905" : "3bb2c5179b37e066681c3103";
    expect(runtimeInstanceId(configPath)).toBe(expected);
    expect(runtimeInstanceId(path.join(path.dirname(configPath),"subdir","..","openassist.toml"))).toBe(expected);
    expect(runtimeInstanceId(path.relative(process.cwd(),configPath))).toBe(expected);
    expect(runtimeInstanceId(path.join(path.dirname(configPath),"other","openassist.toml"))).not.toBe(expected);
  });
  it("keeps instance identity independent of configuration and env-file contents",()=>{
    const root=temp(),configPath=path.join(root,"openassist.toml"),envPath=path.join(root,"openassistd.env");
    const expected=runtimeInstanceId(configPath);
    fs.writeFileSync(configPath,"first configuration fixture");
    fs.writeFileSync(envPath,"first environment fixture");
    expect(runtimeInstanceId(configPath)).toBe(expected);
    fs.writeFileSync(configPath,"replacement configuration fixture");
    fs.writeFileSync(envPath,"replacement environment fixture");
    expect(runtimeInstanceId(configPath)).toBe(expected);
    fs.rmSync(configPath);fs.rmSync(envPath);
    expect(runtimeInstanceId(configPath)).toBe(expected);
  });
  it("finds the packaged trust anchor above a deployed application's workspace marker",()=>{
    const root=temp(), app=path.join(root,"apps","openassist-cli");
    fs.mkdirSync(app,{recursive:true});
    fs.writeFileSync(path.join(app,"pnpm-workspace.yaml"),"packages: []\n");
    fs.writeFileSync(path.join(root,"build-identity.json"),JSON.stringify(build));
    expect(findApplicationRoot(app)).toBe(root);
    fs.rmSync(path.join(root,"build-identity.json"));
    expect(findApplicationRoot(app)).toBe(app);
  });
  it("reports the source workspace version while preferring immutable build metadata",()=>{
    const root=temp();const app=path.join(root,"apps","openassist-cli","dist");fs.mkdirSync(app,{recursive:true});
    fs.writeFileSync(path.join(root,"pnpm-workspace.yaml"),"packages: []\n");
    fs.writeFileSync(path.join(root,"package.json"),JSON.stringify({name:"openassist",version:"0.2.0-rc.1"}));
    expect(getBuildIdentity(app)).toMatchObject({id:"development",version:"0.2.0-rc.1"});
    fs.writeFileSync(path.join(root,"build-identity.json"),JSON.stringify(build));
    expect(getBuildIdentity(app)).toEqual(build);
  });
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
    await expect(download("https://github.com/openassistuk/openassist/releases/download/v0.1.0/file",10)).rejects.toThrow("404");
    vi.stubGlobal("fetch",vi.fn().mockResolvedValue(new Response("too large",{headers:{"content-length":"999"}})));
    await expect(download("https://github.com/openassistuk/openassist/releases/download/v0.1.0/file",10)).rejects.toThrow("size limit");
    vi.stubGlobal("fetch",vi.fn().mockResolvedValue(new Response("oversized")));
    await expect(download("https://github.com/openassistuk/openassist/releases/download/v0.1.0/file",2)).rejects.toThrow("size limit");
    vi.stubGlobal("fetch",vi.fn().mockResolvedValue(new Response("ok")));
    expect((await download("https://github.com/openassistuk/openassist/releases/download/v0.1.0/file",10)).toString()).toBe("ok");
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
    for(const ref of ["", "main\n", "main?token=example", "-option"]){
      expect(()=>resolveUpdateMethod({ref})).toThrow("Invalid source ref");
      expect(()=>sourceRef({}, {trackedRef:ref} as never)).toThrow("Invalid source ref");
    }
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
  it("loads dedicated credentials only for the daemon and protects routing/runtime variables",()=>{
    const root=temp();const dir=path.join(root,"config");fs.mkdirSync(dir,{mode:0o700});
    fs.writeFileSync(path.join(dir,"openassistd.env"),'CUSTOM_PROVIDER_KEY="dedicated key"\nAZURE_CLIENT_ID=dedicated-id\nOPENASSIST_STATE_ROOT=/primary\nOPENASSIST_ENV_FILE=/primary.env\nOPENASSIST_SERVICE_MANAGER_KIND=systemd-system\nNODE_OPTIONS=--require=bad\nPATH=/wrong\nINIT_CWD=/primary\n',{mode:0o600});
    expect(isolatedEnvironment(root).CUSTOM_PROVIDER_KEY).toBeUndefined();
    const env=isolatedDaemonEnvironment(root);
    expect(env.CUSTOM_PROVIDER_KEY).toBe("dedicated key");expect(env.AZURE_CLIENT_ID).toBe("dedicated-id");
    expect(env.OPENASSIST_STATE_ROOT).toBe(root);expect(env.OPENASSIST_ENV_FILE).toBe(path.join(dir,"openassistd.env"));
    expect(env.OPENASSIST_SERVICE_MANAGER_KIND).toBe("manual");expect(env.PATH).toBe(process.env.PATH);
    expect(env.NODE_OPTIONS).toBeUndefined();expect(env.INIT_CWD).toBeUndefined();
  });
  it("normalizes relative state paths without changing credentials",()=>{
    const root=temp();const file=path.join(root,"openassist.toml");fs.writeFileSync(file,'[runtime.paths]\ndataDir="old/data"\n[security]\nsecretsBackend="encrypted-file"\n');
    normalizeConfigPaths(file,root);const text=fs.readFileSync(file,"utf8");expect(text).toContain("encrypted-file");expect(text).toContain("old");expect(text).not.toContain('dataDir="old/data"');
  });

  it("resolves stable, pinned and preview identities and rejects mismatched signed tracks",async()=>{
    const {privateKey,publicKey}=generateKeyPairSync("rsa",{modulusLength:2048});
    const key=publicKey.export({type:"spki",format:"pem"}).toString();
    const payload=manifest();
    let metadata:unknown={tag_name:"v0.1.0",draft:false,prerelease:false};
    const fetch=vi.fn(async(input:URL)=>{
      const url=input.toString();
      const bytes=Buffer.from(JSON.stringify(payload));
      return new Response(url.endsWith('release.sig') ? sign("RSA-SHA256",bytes,privateKey) : url.endsWith('release.json') ? bytes : JSON.stringify(url.includes("?per_page=") && !Array.isArray(metadata) ? [metadata] : metadata));
    });
    vi.stubGlobal("fetch",fetch);
    expect((await resolveRelease({},[key])).manifest.channel).toBe("stable");
    expect((await resolveRelease({version:"0.1.0"},[key])).manifest.build.version).toBe("0.1.0");
    expect(fetch.mock.calls.slice(0,6).map(([url])=>String(url))).toEqual([
      "https://api.github.com/repos/openassistuk/openassist/releases/latest",
      "https://github.com/openassistuk/openassist/releases/download/v0.1.0/release.json",
      "https://github.com/openassistuk/openassist/releases/download/v0.1.0/release.sig",
      "https://api.github.com/repos/openassistuk/openassist/releases?per_page=100&page=1",
      "https://github.com/openassistuk/openassist/releases/download/v0.1.0/release.json",
      "https://github.com/openassistuk/openassist/releases/download/v0.1.0/release.sig"
    ]);
    payload.channel="preview"; metadata=[{tag_name:"v0.1.0",draft:false,prerelease:true}];
    expect((await resolveRelease({channel:"preview"},[key])).manifest.channel).toBe("preview");
    metadata={tag_name:"v0.1.0",draft:false,prerelease:false};
    await expect(resolveRelease({},[key])).rejects.toThrow("requested track");
    metadata={tag_name:"bad",draft:false,prerelease:false};await expect(resolveRelease({},[key])).rejects.toThrow("No matching");
    metadata=[];await expect(resolveRelease({channel:"preview"},[key])).rejects.toThrow("No matching");
  });

  it("rejects signed but unsupported manifest shapes",()=>{
    const {privateKey,publicKey}=generateKeyPairSync("rsa",{modulusLength:2048});
    const key=publicKey.export({type:"spki",format:"pem"}).toString();
    for(const patch of [{schemaVersion:2},{channel:"unknown"},{build:null},{artifacts:null},{artifacts:[]},{build:{...build,id:"../bad"}},{build:{...build,version:"not-a-version"}},{build:{...build,configVersion:2}},{build:{...build,databaseVersion:2}},{build:{...build,commit:"bad"}}]){
      const bytes=Buffer.from(JSON.stringify({...manifest(),...patch}));
      expect(()=>verifyManifest(bytes,sign("RSA-SHA256",bytes,privateKey),[key])).toThrow("manifest");
    }
    for(const patch of [{platform:"win32"},{arch:"riscv64"},{sha256:"bad"},{bytes:0},{bytes:1.2},{bytes:1024**3}]){
      const value=manifest();Object.assign(value.artifacts[0],patch);const bytes=Buffer.from(JSON.stringify(value));
      expect(()=>verifyManifest(bytes,sign("RSA-SHA256",bytes,privateKey),[key])).toThrow("artifact");
    }
  });

  it("rejects unsafe tar entries and link ancestors without creating output",()=>{
    const archive=(entries:Record<string,unknown>[])=>gzipSync(Buffer.concat([...entries.map(entry=>{const header=new tar.Header({size:0,mode:0o644,...entry});header.encode();return header.block;}),Buffer.alloc(1024)]));
    for(const entries of [
      [{path:"../escape",type:"File"}], [{path:"/absolute",type:"File"}], [{path:"a:b",type:"File"}],
      [{path:"same",type:"File"},{path:"same",type:"File"}], [{path:"fifo",type:"FIFO"}],
      [{path:"link",type:"SymbolicLink",linkpath:"/outside"}], [{path:"link",type:"Link",linkpath:"../outside"}],
      [{path:"link",type:"SymbolicLink",linkpath:"inside"},{path:"link/file",type:"File"}],
      [{path:"a",type:"SymbolicLink",linkpath:"."},{path:"b",type:"SymbolicLink",linkpath:"a/../outside"}],
      [{path:"b",type:"SymbolicLink",linkpath:"a/../outside"},{path:"a",type:"SymbolicLink",linkpath:"."}],
      [{path:"a",type:"SymbolicLink",linkpath:"b"},{path:"b",type:"SymbolicLink",linkpath:"a"}],
      [{path:"a",type:"Link",linkpath:"b"},{path:"b",type:"Link",linkpath:"a"}],
      [{path:"a",type:"SymbolicLink",linkpath:"."},{path:"b",type:"Link",linkpath:"a/../outside"}],
      [{path:"inside",type:"File"},{path:"dir/link",type:"SymbolicLink",linkpath:"../inside"},{path:"copy",type:"Link",linkpath:"dir/link"}],
      Array.from({length:41},(_,i)=>({path:`link${i}`,type:"SymbolicLink",linkpath:i===0?"file":`link${i-1}`}))
    ]){
      const root=temp();expect(()=>unpackRelease(archive(entries),path.join(root,"out")),JSON.stringify(entries)).toThrow();expect(fs.existsSync(path.join(root,"out"))).toBe(false);
    }
  });
  it.skipIf(process.platform==="win32")("retains ordinary internal package links and hardlinks",async()=>{
    const root=temp();const source=path.join(root,"source");fs.mkdirSync(path.join(source,"store","pkg"),{recursive:true});fs.mkdirSync(path.join(source,"modules"));
    fs.writeFileSync(path.join(source,"store","pkg","index.js"),"legitimate package");
    fs.symlinkSync("../store/pkg",path.join(source,"modules","pkg"));
    fs.linkSync(path.join(source,"store","pkg","index.js"),path.join(source,"copy.js"));
    const archive=path.join(root,"good.tar.gz");await tar.c({cwd:source,file:archive,gzip:true},["store","modules","copy.js"]);
    const out=path.join(root,"out");unpackRelease(fs.readFileSync(archive),out);
    expect(fs.readFileSync(path.join(out,"modules","pkg","index.js"),"utf8")).toBe("legitimate package");
    expect(fs.readFileSync(path.join(out,"copy.js"),"utf8")).toBe("legitimate package");
  });

  it("validates platform runtime floors independently of manifest signatures",()=>{
    const original=process.platform;
    try{
      Object.defineProperty(process,"platform",{value:"win32",configurable:true});expect(()=>platformArtifact(manifest() as never)).toThrow("No packaged");
      Object.defineProperty(process,"platform",{value:"darwin",configurable:true});
      vi.spyOn(os,"release").mockReturnValue("22.5.0");expect(()=>platformArtifact(manifest() as never)).toThrow("13.5");
      vi.spyOn(os,"release").mockReturnValue("22.6.0");expect(platformArtifact(manifest() as never).platform).toBe("darwin");
      Object.defineProperty(process,"platform",{value:"linux",configurable:true});
      vi.spyOn(process.report,"getReport").mockReturnValue({header:{glibcVersionRuntime:"2.27"}} as never);expect(()=>platformArtifact(manifest() as never)).toThrow("glibc");
      vi.spyOn(process.report,"getReport").mockReturnValue({header:{glibcVersionRuntime:"2.28"}} as never);
      vi.spyOn(os,"release").mockReturnValue("4.17.0");expect(()=>platformArtifact(manifest() as never)).toThrow("kernel");
      vi.spyOn(os,"release").mockReturnValue("6.1.0");expect(platformArtifact(manifest() as never).platform).toBe("linux");
    } finally{Object.defineProperty(process,"platform",{value:original,configurable:true});}
  });
  it("accepts health only from the expected build and instance",async()=>{
    const expected={buildId:"candidate",instanceId:"isolated"};
    for(const [body,ok] of [[{status:"ok",build:{id:"candidate"},instanceId:"isolated"},true],[{status:"ok",build:{id:"other"},instanceId:"isolated"},false],[{status:"ok",build:{id:"candidate"},instanceId:"primary"},false],[{status:"ok"},false],[{status:"failed"},false]] as const){
      vi.stubGlobal("fetch",vi.fn(async()=>new Response(JSON.stringify(body))));
      expect((await checkHealth("http://127.0.0.1:3344",expected)).ok).toBe(ok);
    }
    vi.stubGlobal("fetch",vi.fn(async()=>new Response('not JSON')));
    expect((await checkHealth("http://127.0.0.1:3344",expected)).ok).toBe(false);
  });
  it("bounds redirects and refuses HTTPS downgrade before requesting it",async()=>{
    const fetch=vi.fn(async()=>new Response(null,{status:302,headers:{location:"http://example.test/insecure"}}));
    vi.stubGlobal("fetch",fetch);
    await expect(download("https://github.com/openassistuk/openassist/releases/download/v0.1.0/release.json",100)).rejects.toThrow("HTTPS");expect(fetch).toHaveBeenCalledTimes(1);
    fetch.mockImplementation(async()=>new Response(null,{status:302,headers:{location:"/openassistuk/openassist/releases/download/v0.1.0/release.json"}}));
    await expect(download("https://github.com/openassistuk/openassist/releases/download/v0.1.0/release.json",100)).rejects.toThrow("redirect limit");
  });
  it("renders concise shared summaries for availability, deletion and unverified activation",()=>{
    expect(renderOperationSummary({}).join('\n')).toContain("Ready now\n- Operation completed.\nNeeds action\n- None.");
    const lines=renderOperationSummary({build:{version:"1.0.0",id:"one"},operation:{phase:"prepared"},method:"release",available:"1.0.0",current:"0.1.0",ref:"main",root:"/managed",backup:"/backup",notifications:"on",instances:[{name:"test"}],remove:["/owned"],purge:["/config"],preserved:["/custom"],verified:false,retentionWarning:"Review retained backup",nextCommand:"openassist update recover"});
    expect(lines.join('\n')).toContain("Activation is unverified");expect(lines.at(-1)).toBe("- openassist update recover");
    expect(renderOperationSummary({disabled:true}).join('\n')).toContain("notifications are disabled");
  });
});
