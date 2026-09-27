import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { generateKeyPairSync, sign } from "node:crypto";
import { describe, it, mock } from "node:test";
import net from "node:net";
import { DatabaseSync } from "node:sqlite";
import { verifyManifest, download, readBuildIdentity } from "../../apps/openassist-cli/src/lib/release.js";
import { acquireLifecycleLock, containedPath, copyPrivateTree, removeManagedPath } from "../../apps/openassist-cli/src/lib/lifecycle-files.js";
import { normalizeConfigPaths, resolveUpdateMethod, sourceRef, recoverUpdate, pruneLifecycleHistory, executeUpdate, type LifecycleHost } from "../../apps/openassist-cli/src/lib/lifecycle-engine.js";
import { renderOperationSummary } from "../../apps/openassist-cli/src/lib/lifecycle-readiness.js";
import { saveInstallState, loadInstallState, atomicWriteJson } from "../../apps/openassist-cli/src/lib/install-state.js";
import { checkForUpdate, setUpdateNotifications } from "../../apps/openassist-cli/src/lib/update-notifications.js";
import { uninstallApplication } from "../../apps/openassist-cli/src/lib/lifecycle-uninstall.js";
import { defaultManagedInstallDir, defaultConfigPath, defaultEnvFilePath, writeDefaultConfig, loadConfig } from "../../packages/config/dist/index.js";
import { randomUUID } from "node:crypto";
import { discoverRelease, discoverSource } from "../../apps/openassist-cli/src/lib/update-discovery.js";

describe("managed lifecycle command contracts", () => {
  it("checks recorded tracks through public catalogues without sending saved selectors", async () => {
    const root=fs.mkdtempSync(path.join(os.tmpdir(),"oa-catalogue-"));
    const previousRoot=process.env.OPENASSIST_STATE_ROOT;
    process.env.OPENASSIST_STATE_ROOT=root;
    const fetchOriginal=globalThis.fetch;
    const requests:string[]=[];
    const commit="a".repeat(40);const available="b".repeat(40);
    const api="https://api.github.com/repos/openassistuk/openassist";
    let metadata:unknown={tag_name:"v2.0.0",draft:false,prerelease:false};
    try {
      globalThis.fetch=async input=>{requests.push(String(input));return new Response(JSON.stringify(metadata));};
      const active={method:"release" as const,path:root,nodePath:process.execPath,verified:true,channel:"stable" as const,build:{id:"active",version:"1.0.0",commit,nodeVersion:"24.21.0",configVersion:1,databaseVersion:1}};
      saveInstallState({installDir:root,active});
      assert.equal((await checkForUpdate(true)).available,"2.0.0");
      metadata=[{tag_name:"v1.0.0",draft:false,prerelease:false}];
      saveInstallState({active:{...active,pinnedVersion:"1.0.0"}});
      assert.equal((await checkForUpdate(true)).updateAvailable,false);
      assert.deepEqual(requests,[`${api}/releases/latest`,`${api}/releases?per_page=100&page=1`]);
      metadata=[{tag_name:"v2.0.0-beta",draft:false,prerelease:true}];
      assert.equal((await discoverRelease({channel:"preview"})).version,"2.0.0-beta");
      metadata=Array.from({length:100},()=>({tag_name:"v2.0.0",draft:false,prerelease:false}));
      await assert.rejects(discoverRelease({version:"9.0.0"}),/catalogue limit/);
      metadata=[];await assert.rejects(discoverRelease({version:"9.0.0"}),/No matching/);
      metadata={};await assert.rejects(discoverRelease({version:"9.0.0"}),/Invalid/);
      metadata=[null];await assert.rejects(discoverRelease({version:"9.0.0"}),/Invalid/);
      await assert.rejects(discoverRelease({version:"bad"}),/Invalid/);
      await assert.rejects(discoverRelease({channel:"bad" as never}),/Invalid/);
      metadata=[{ref:"refs/heads/private-selector",object:{type:"commit",sha:available}}];requests.length=0;
      saveInstallState({active:{...active,method:"source",ref:"private-selector"}});
      assert.equal((await checkForUpdate(true)).available,available);
      assert.deepEqual(requests,[`${api}/git/matching-refs/`]);
      const before=requests.length;
      saveInstallState({active:{...active,method:"source",ref:commit}});
      assert.equal((await checkForUpdate(true)).pinned,true);
      assert.equal(requests.length,before);
      saveInstallState({active:{...active,method:"source",ref:"missing"}});
      assert.equal((await checkForUpdate(true)).status,"unavailable");
      metadata=[];assert.equal((await discoverSource(commit.slice(0,8),commit)).pinned,true);
      for(const value of [{},[null],[{ref:"refs/heads/main",object:{type:"commit",sha:"bad"}}],[{ref:"refs/heads/main",object:{type:"blob",sha:commit}}]]){
        metadata=value;await assert.rejects(discoverSource("main",commit));
      }
      globalThis.fetch=async input=>new Response(JSON.stringify(String(input).includes("matching-refs") ? [{ref:"refs/tags/v1",object:{type:"tag",sha:available}}] : [{name:"v1",commit:{sha:commit}}]));
      assert.equal((await discoverSource("v1",commit)).commit,commit);
      globalThis.fetch=async input=>new Response(JSON.stringify(String(input).includes("matching-refs") ? [{ref:"refs/heads/main",object:{type:"commit",sha:available}}] : {default_branch:"main"}));
      assert.equal((await discoverSource("HEAD",commit)).commit,available);
    } finally {
      globalThis.fetch=fetchOriginal;
      if(previousRoot===undefined)delete process.env.OPENASSIST_STATE_ROOT;else process.env.OPENASSIST_STATE_ROOT=previousRoot;
      fs.rmSync(root,{recursive:true,force:true});
    }
  });
  it("keeps developer previews, cleanup and lifecycle errors machine-readable without touching primary state", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "oa-cli-isolated-"));
    const env = {...process.env, OPENASSIST_STATE_ROOT: root, HOME:root, USERPROFILE:root};
    const run = (...args: string[]) => {
      const result = spawnSync(process.execPath,["node_modules/tsx/dist/cli.mjs","apps/openassist-cli/src/index.ts",...args,"--json"],{env,encoding:"utf8"});
      assert.equal(result.error,undefined);
      return {code:result.status,body:JSON.parse(result.stdout)};
    };
    try {
      assert.equal(run("dev","test","--local",process.cwd(),"--dry-run").body.credentialsCopied,false);
      assert.equal(run("dev","test","--pr","12","--dry-run").body.source,"refs/pull/12/head");
      assert.equal(run("dev","test","--ref","unsafe&command","--dry-run").code,1);
      assert.equal(run("dev","test","--name","../primary","--dry-run").code,1);
      assert.equal(run("dev","test","--local",process.cwd(),"--pr","12","--dry-run").code,1);
      assert.deepEqual(run("dev","list").body.instances,[]);
      assert.equal(run("dev","remove","missing","--yes").code,0);
      assert.equal(run("uninstall","--dry-run").body.version,4);
      assert.equal(run("update","recover","--dry-run").body.detail,"No interrupted operation.");
      assert.equal(run("rollback","--dry-run").code,1);
      assert.equal(run("update","--source","--release","--dry-run").code,1);
      assert.equal(run("update","notifications","maybe","--dry-run").code,1);
      assert.equal(run("update","notifications","off").code,1);
      assert.equal(run("update","notifications","on","--dry-run").body.notifications,"on");
      assert.equal(run("update","check").body.detail,"No installation record. Install OpenAssist before checking its track.");
      assert.equal(fs.existsSync(path.join(root,"config","install-state.json")),false);
      fs.mkdirSync(path.join(root,"config"),{recursive:true});
      fs.writeFileSync(path.join(root,"config","install-state.json"),"invalid");
      assert.match(run("update","check").body.error,/Invalid install-state/);
    } finally {fs.rmSync(root,{recursive:true,force:true});}
  });

  it("authenticates release metadata and rejects transport size/status failures", async () => {
    const {privateKey,publicKey}=generateKeyPairSync("rsa",{modulusLength:2048});
    const build={id:"test",version:"0.1.0",commit:"a".repeat(40),nodeVersion:"24.21.0",configVersion:1,databaseVersion:1};
    const manifest={schemaVersion:1,build,channel:"stable",artifacts:["linux-x64","linux-arm64","darwin-x64","darwin-arm64"].map(target=>{const [platform,arch]=target.split('-');return{platform,arch,file:`${target}.tar.gz`,sha256:"b".repeat(64),bytes:10};})};
    const bytes=Buffer.from(JSON.stringify(manifest));
    const key=publicKey.export({type:"spki",format:"pem"}).toString();
    assert.equal(verifyManifest(bytes,sign("RSA-SHA256",bytes,privateKey),[key]).build.id,"test");
    assert.throws(()=>verifyManifest(bytes,Buffer.from("bad"),[key]),/signature/);
    const fetchOriginal=globalThis.fetch;
    try {
      globalThis.fetch=async()=>new Response("ok");
      assert.equal((await download("https://github.com/openassistuk/openassist/releases/download/v0.1.0/release.json",5)).toString(),"ok");
      await assert.rejects(download("http://example.test/release",5),/HTTPS/);
      globalThis.fetch=async()=>new Response("too large");
      await assert.rejects(download("https://github.com/openassistuk/openassist/releases/download/v0.1.0/release.json",5),/size limit/);
      globalThis.fetch=async()=>new Response("no",{status:404});
      await assert.rejects(download("https://github.com/openassistuk/openassist/releases/download/v0.1.0/release.json",5),/404/);
    } finally {globalThis.fetch=fetchOriginal;}
  });

  it("preserves state through private backups, lock contention and relative-path normalization", () => {
    const root=fs.mkdtempSync(path.join(os.tmpdir(),"oa-cli-contract-"));
    try {
      const unlock=acquireLifecycleLock(root);
      assert.throws(()=>acquireLifecycleLock(root),/operation/);
      unlock();
      assert.throws(()=>containedPath(root,path.dirname(root)),/outside/);
      const source=path.join(root,"state");fs.mkdirSync(source);fs.writeFileSync(path.join(source,"conversation"),"retained");
      copyPrivateTree(source,path.join(root,"backup"));
      assert.equal(fs.readFileSync(path.join(root,"backup","conversation"),"utf8"),"retained");
      removeManagedPath(root,path.join(root,"backup"));
      const config=path.join(root,"openassist.toml");fs.writeFileSync(config,'[runtime.paths]\ndataDir="data"\n');
      normalizeConfigPaths(config,root);
      assert.ok(fs.readFileSync(config,"utf8").includes("data"));
      assert.equal(resolveUpdateMethod({source:true}),"source");
      assert.equal(sourceRef({pr:"5"}),"refs/pull/5/head");
      assert.throws(()=>resolveUpdateMethod({ref:"bad&command"}),/Invalid/);
      fs.writeFileSync(path.join(root,"build-identity.json"),JSON.stringify({id:"bad"}));
      assert.throws(()=>readBuildIdentity(root),/compatibility/);
      assert.ok(renderOperationSummary({verified:false,root,backup:root,method:"release",notifications:"off",remove:["owned"],instances:[{name:"test"}]}).some(line=>line.includes("unverified")));
    } finally {fs.rmSync(root,{recursive:true,force:true});}
  });

  it("inspects recovery and uninstall plans while retaining protected history and offline notice preferences",async()=>{
    const root=fs.mkdtempSync(path.join(os.tmpdir(),"oa-cli-managed-"));
    const previousRoot=process.env.OPENASSIST_STATE_ROOT;process.env.OPENASSIST_STATE_ROOT=root;
    try{
      const managed=defaultManagedInstallDir();
      const directory=path.join(managed,"releases","active");fs.mkdirSync(directory,{recursive:true});
      const active={method:"release" as const,path:directory,nodePath:process.execPath,verified:true,channel:"stable" as const,build:{id:"active",version:"0.1.0",commit:"a".repeat(40),nodeVersion:"24.21.0",configVersion:1,databaseVersion:1}};
      const state=saveInstallState({installDir:directory,managedRoot:managed,active,configPath:defaultConfigPath(),envFilePath:defaultEnvFilePath()});
      setUpdateNotifications(false);assert.deepEqual(await checkForUpdate(),{disabled:true});
      setUpdateNotifications(true);
      atomicWriteJson(path.join(root,"config","update-check.json"),{checkedAt:Date.now(),current:"0.1.0",available:"0.1.0",updateAvailable:false});
      assert.equal((await checkForUpdate()).updateAvailable,false);
      const id=randomUUID();const backup=path.join(managed,"backups",id);fs.mkdirSync(backup,{recursive:true});
      const journal={version:1 as const,id,phase:"prepared" as const,before:state,candidate:active,backup};
      atomicWriteJson(path.join(managed,"operation.json"),journal);
      assert.deepEqual((await recoverUpdate(true)).operation,journal);
      const uninstall=await uninstallApplication({dryRun:true});
      assert.deepEqual(uninstall.purge,[]);assert.equal(uninstall.backupsRetained,true);
      const obsolete=path.join(managed,"releases","obsolete");fs.mkdirSync(obsolete);fs.writeFileSync(path.join(obsolete,"build-identity.json"),"{}");
      pruneLifecycleHistory(state,journal);assert.equal(fs.existsSync(obsolete),false);assert.equal(fs.existsSync(directory),true);
      assert.equal(loadInstallState()?.active?.build.id,"active");
      const result=renderOperationSummary({operation:journal,available:"0.2.0",current:"0.1.0",notifications:"on",ref:"main",build:active.build,verified:true});
      assert.ok(result.some(line=>line.includes("Operation phase: prepared")));
    }finally{if(previousRoot===undefined)delete process.env.OPENASSIST_STATE_ROOT;else process.env.OPENASSIST_STATE_ROOT=previousRoot;fs.rmSync(root,{recursive:true,force:true});}
  });

  it("executes activation, WAL backup, interrupted recovery and offline rollback against a simulated service host",async()=>{
    const home=fs.mkdtempSync(path.join(os.tmpdir(),"oa-cli-engine-"));
    const homeMock=mock.method(os,"homedir",()=>home);
    const savedRoot=process.env.OPENASSIST_STATE_ROOT;delete process.env.OPENASSIST_STATE_ROOT;
    let db:DatabaseSync|undefined;
    try{
      const root=defaultManagedInstallDir();
      fs.mkdirSync(path.dirname(defaultConfigPath()),{recursive:true});writeDefaultConfig(defaultConfigPath());
      const port=await new Promise<number>(resolve=>{const server=net.createServer();server.listen(0,"127.0.0.1",()=>{const port=(server.address() as net.AddressInfo).port;server.close(()=>resolve(port));});});
      fs.writeFileSync(defaultConfigPath(),fs.readFileSync(defaultConfigPath(),"utf8").replace(/bindPort\s*=\s*[\d_]+/,`bindPort = ${port}`));
      fs.writeFileSync(defaultEnvFilePath(),"# test credentials retained\n");
      const data=path.join(home,".local","share","openassist","data");fs.mkdirSync(data,{recursive:true});
      db=new DatabaseSync(path.join(data,"openassist.db"));db.exec("PRAGMA journal_mode=WAL; PRAGMA user_version=1; CREATE TABLE sentinel(content TEXT); INSERT INTO sentinel VALUES ('retained conversation')");
      const application=(name:string)=>{
        const directory=path.join(root,"releases",name);
        for(const entry of ["openassist-cli","openassistd"]){const file=path.join(directory,"apps",entry,"dist","index.js");fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,"process.exit(0)\n");}
        const build={id:name,version:"0.1.0",commit:"a".repeat(40),nodeVersion:"24.21.0",configVersion:1,databaseVersion:1};
        atomicWriteJson(path.join(directory,"build-identity.json"),build);
        return{method:"release" as const,path:directory,nodePath:process.execPath,build,verified:true,channel:"stable" as const};
      };
      const old=application("old");const candidate=application("candidate");
      saveInstallState({installDir:old.path,managedRoot:root,active:old,previous:candidate});
      let running=true;let active="old";let fail=false;const events:string[]=[];
      const host:LifecycleHost={platform:"linux",switchCurrent:(_root,target)=>{active=path.basename(target);events.push(`activate:${active}`);},
        checkHealth:async(_url,expected)=>({ok:running&&(!expected||expected.buildId===active),status:200,bodyText:"test host"}),
        service:{kind:"systemd-user",isInstalled:async()=>true,isRunning:async()=>running,
          stop:async()=>{events.push("stop");running=false;},install:async options=>{events.push(`install:${active}`);if(fail&&active==="candidate")throw new Error("injected activation failure");running=options.start!==false;},
          uninstall:async()=>{},start:async()=>{running=true;},restart:async()=>{running=true;},status:async()=>{},logs:async()=>{},enable:async()=>{},disable:async()=>{running=false;}}
      };
      const result=await executeUpdate({},true,host);assert.equal(result.verified,true);
      assert.deepEqual(events,["stop","activate:candidate","install:candidate"]);
      const backup=new DatabaseSync(path.join(String(result.backup),"data","openassist.db"),{readOnly:true});
      try{assert.equal((backup.prepare("SELECT content FROM sentinel").get() as {content:string}).content,"retained conversation");}finally{backup.close();}
      await executeUpdate({skipRestart:true},true,host);assert.equal(loadInstallState()?.active?.verified,false);
      running=true;assert.equal((await recoverUpdate(false,host)).phase,"complete");
      fail=true;await assert.rejects(executeUpdate({},true,host),/injected activation failure/);
      assert.equal(loadInstallState()?.active?.build.id,"old");assert.equal(running,true);
      assert.equal((db.prepare("SELECT content FROM sentinel").get() as {content:string}).content,"retained conversation");
      const journalFile=path.join(root,"operation.json");
      atomicWriteJson(journalFile,{version:1,id:randomUUID(),phase:"activating",before:loadInstallState(),candidate,serviceInstalled:true,wasRunning:true});
      assert.equal((await recoverUpdate(false,host)).phase,"rolled-back");
    }finally{db?.close();homeMock.mock.restore();if(savedRoot!==undefined)process.env.OPENASSIST_STATE_ROOT=savedRoot;fs.rmSync(home,{recursive:true,force:true});}
  });

  it("runs local working-tree instances with dedicated state and credentials, then removes only the selected instance",()=>{
    const root=fs.mkdtempSync(path.join(os.tmpdir(),"oa-cli-dev-"));
    const local=path.join(root,"local worktree");const bin=path.join(root,"bin");
    fs.mkdirSync(path.join(local,"apps","openassistd","dist"),{recursive:true});fs.mkdirSync(bin);
    fs.writeFileSync(path.join(local,"package.json"),JSON.stringify({name:"fixture",version:"0.1.0",packageManager:"pnpm@12.5.1"}));
    fs.writeFileSync(path.join(local,"pnpm-workspace.yaml"),"packages: []\n");
    fs.writeFileSync(path.join(local,"local-changes.txt"),"uncommitted content stays intact");
    fs.writeFileSync(path.join(local,"apps","openassistd","dist","index.js"),`const fs=require('node:fs'); const path=require('node:path'); fs.writeFileSync(path.join(process.env.OPENASSIST_STATE_ROOT,'child-check.json'),JSON.stringify({secretPresent:'OPENASSIST_FIXTURE_SECRET' in process.env,stateRoot:process.env.OPENASSIST_STATE_ROOT,envFile:process.env.OPENASSIST_ENV_FILE}));`);
    const stub=path.join(bin,"pnpm-stub.cjs");
    fs.writeFileSync(stub,"if(process.argv.includes('--version')) process.stdout.write('12.5.1');\n");
    const quote=(value:string)=>`'${value.replaceAll("'","'\\''")}'`;
    if(process.platform==="win32")fs.writeFileSync(path.join(bin,"pnpm.cmd"),`@"${process.execPath}" "${stub}" %*\r\n`);
    else fs.writeFileSync(path.join(bin,"pnpm"),`#!/bin/sh\nexec ${quote(process.execPath)} ${quote(stub)} "$@"\n`,{mode:0o755});
    const env={...process.env,HOME:root,USERPROFILE:root,PATH:bin+path.delimiter+process.env.PATH,OPENASSIST_STATE_ROOT:root,OPENASSIST_FIXTURE_SECRET:"test-only-value"};
    const run=(...args:string[])=>{
      const result=spawnSync(process.execPath,["node_modules/tsx/dist/cli.mjs","apps/openassist-cli/src/index.ts","dev",...args,"--json"],{env,encoding:"utf8",timeout:30_000});
      assert.equal(result.error,undefined);assert.ok(result.stdout,result.stderr);return {code:result.status,body:JSON.parse(result.stdout)};
    };
    try{
      const first=run("test","--local",local,"--name","local-test");assert.equal(first.code,0,JSON.stringify(first.body));
      const instance=path.join(root,".local","share","openassist","dev","local-test");
      assert.ok(first.body.setupCommand.includes(path.join(local,"apps","openassist-cli","dist","index.js")));
      assert.equal(JSON.parse(fs.readFileSync(path.join(instance,"instance.json"),"utf8")).setupCommand,first.body.setupCommand);
      const child=JSON.parse(fs.readFileSync(path.join(instance,"child-check.json"),"utf8"));assert.equal(child.secretPresent,false);assert.equal(child.stateRoot,instance);
      const config=loadConfig({baseFile:path.join(instance,"config","openassist.toml")}).config;
      assert.deepEqual(config.runtime.channels,[]);assert.equal(config.runtime.scheduler.enabled,false);assert.equal(config.runtime.bindAddress,"127.0.0.1");
      fs.writeFileSync(path.join(instance,"keep-state.txt"),"reuse me");
      assert.equal(run("test","--local",local,"--name","local-test").code,0);
      assert.equal(fs.readFileSync(path.join(instance,"keep-state.txt"),"utf8"),"reuse me");
      assert.equal(fs.readFileSync(path.join(local,"local-changes.txt"),"utf8"),"uncommitted content stays intact");
      assert.equal(fs.existsSync(path.join(root,".local","bin","openassist")),false);
      assert.ok(run("list").body.instances.some((item:{name:string})=>item.name==="local-test"));
      fs.mkdirSync(path.join(instance,"operation.lock"));assert.equal(run("remove","local-test","--yes").code,1);fs.rmdirSync(path.join(instance,"operation.lock"));
      assert.equal(run("remove","local-test","--dry-run").code,0);assert.equal(fs.existsSync(instance),true);
      assert.equal(run("remove","local-test","--yes").code,0);assert.equal(fs.existsSync(instance),false);
      assert.equal(fs.existsSync(local),true);
    }finally{fs.rmSync(root,{recursive:true,force:true});}
  });
});
