import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { generateKeyPairSync, sign } from "node:crypto";
import { describe, it } from "node:test";
import { verifyManifest, download, readBuildIdentity } from "../../apps/openassist-cli/src/lib/release.js";
import { acquireLifecycleLock, containedPath, copyPrivateTree, removeManagedPath } from "../../apps/openassist-cli/src/lib/lifecycle-files.js";
import { normalizeConfigPaths, resolveUpdateMethod, sourceRef, recoverUpdate, pruneLifecycleHistory } from "../../apps/openassist-cli/src/lib/lifecycle-engine.js";
import { renderOperationSummary } from "../../apps/openassist-cli/src/lib/lifecycle-readiness.js";
import { saveInstallState, loadInstallState, atomicWriteJson } from "../../apps/openassist-cli/src/lib/install-state.js";
import { checkForUpdate, setUpdateNotifications } from "../../apps/openassist-cli/src/lib/update-notifications.js";
import { uninstallApplication } from "../../apps/openassist-cli/src/lib/lifecycle-uninstall.js";
import { defaultManagedInstallDir, defaultConfigPath, defaultEnvFilePath } from "../../packages/config/src/index.js";
import { randomUUID } from "node:crypto";

describe("managed lifecycle command contracts", () => {
  it("keeps developer previews, cleanup and lifecycle errors machine-readable without touching primary state", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "oa-cli-isolated-"));
    const env = {...process.env, OPENASSIST_STATE_ROOT: root, HOME:root, USERPROFILE:root};
    const run = (...args: string[]) => {
      const result = spawnSync(process.execPath,["apps/openassist-cli/dist/index.js",...args,"--json"],{env,encoding:"utf8"});
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
      assert.equal((await download("https://example.test/release",5)).toString(),"ok");
      await assert.rejects(download("http://example.test/release",5),/HTTPS/);
      globalThis.fetch=async()=>new Response("too large");
      await assert.rejects(download("https://example.test/release",5),/size limit/);
      globalThis.fetch=async()=>new Response("no",{status:404});
      await assert.rejects(download("https://example.test/release",5),/404/);
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
});
