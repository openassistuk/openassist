import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, it } from "node:test";
import { defaultConfigPath, defaultEnvFilePath, defaultManagedInstallDir, runtimeInstanceId, writeDefaultConfig } from "../../packages/config/src/index.js";
import { saveInstallState, loadInstallState, atomicWriteJson } from "../../apps/openassist-cli/src/lib/install-state.js";
import { needsFirstTimeSetup, completeOnboarding } from "../../apps/openassist-cli/src/lib/onboarding.js";
import { loadSetupQuickstartState, runSetupQuickstart } from "../../apps/openassist-cli/src/lib/setup-quickstart.js";
import { finalizeSetupActivation, recoverUpdate } from "../../apps/openassist-cli/src/lib/lifecycle-engine.js";
import { renderLinuxSystemdUnit, renderLaunchdWrapper, serviceExecutablePath } from "../../apps/openassist-cli/src/lib/service-manager.js";

let root: string, priorRoot: string | undefined;
beforeEach(() => { root=fs.mkdtempSync(path.join(os.tmpdir(),"oa-live-fixes-")); priorRoot=process.env.OPENASSIST_STATE_ROOT; process.env.OPENASSIST_STATE_ROOT=root; fs.mkdirSync(path.dirname(defaultConfigPath()),{recursive:true}); });
afterEach(() => { if(priorRoot===undefined) delete process.env.OPENASSIST_STATE_ROOT; else process.env.OPENASSIST_STATE_ROOT=priorRoot; fs.rmSync(root,{recursive:true,force:true}); });
function seed() {
  writeDefaultConfig(defaultConfigPath());
  const app={method:"release" as const,path:path.join(defaultManagedInstallDir(),"releases","app with spaces"),nodePath:process.execPath,verified:false,
    build:{id:"test-build",version:"0.2.0-rc.1",commit:"a".repeat(40),nodeVersion:"24.21.0",configVersion:1,databaseVersion:1}};
  fs.mkdirSync(app.path,{recursive:true});
  return saveInstallState({installDir:app.path,configPath:defaultConfigPath(),envFilePath:defaultEnvFilePath(),managedRoot:defaultManagedInstallDir(),active:app,onboarding:"pending"});
}
describe("live installer regressions", () => {
  it("recognizes seeded onboarding without rewriting customized or invalid configurations", () => {
    assert.equal(needsFirstTimeSetup(defaultConfigPath()),true);
    writeDefaultConfig(defaultConfigPath()); const original=fs.readFileSync(defaultConfigPath(),"utf8");
    assert.equal(needsFirstTimeSetup(defaultConfigPath()),true);
    fs.writeFileSync(defaultConfigPath(),original.replace(/bindPort\s*=\s*[\d_]+/,"bindPort = 4455"));
    assert.equal(needsFirstTimeSetup(defaultConfigPath()),false);
    fs.writeFileSync(defaultConfigPath(),"not valid TOML {{{");
    assert.equal(needsFirstTimeSetup(defaultConfigPath()),false);
    assert.equal(fs.readFileSync(defaultConfigPath(),"utf8"),"not valid TOML {{{");
    seed(); assert.equal(needsFirstTimeSetup(defaultConfigPath()),true);
    completeOnboarding(defaultConfigPath()); assert.equal(needsFirstTimeSetup(defaultConfigPath()),false);
  });
  it("completes packaged onboarding with an empty PATH and no Git, npm or pnpm", async () => {
    const record=seed(), oldPath=process.env.PATH;
    const port=await new Promise<number>((resolve,reject)=>{const server=net.createServer();server.once("error",reject);server.listen(0,"127.0.0.1",()=>{const port=(server.address() as net.AddressInfo).port;server.close(()=>resolve(port));});});
    const state=loadSetupQuickstartState(record.configPath,record.envFilePath,record.installDir); state.config.runtime.bindPort=port;
    const answers=["true","OpenAssist","Pragmatic and concise","Synthetic smoke test","openai","openai-main","gpt-5.6-terra","","default","synthetic-api-token","telegram","telegram-main","synthetic-bot-token","100000001","Europe","Europe/London","true","save"];
    const next=()=>{assert.ok(answers.length,"unexpected prompt");return answers.shift()!;};
    const prompts={input:async()=>next(),password:async()=>next(),confirm:async()=>next()==="true",select:async<T extends string>()=>next() as T};
    try {
      process.env.PATH=path.join(root,"empty-path");
      const result=await runSetupQuickstart(state,{configPath:record.configPath,envFilePath:record.envFilePath,installDir:record.installDir,skipService:true,requireTty:false},prompts);
      assert.equal(result.saved,true); assert.equal(answers.length,0); assert.equal(loadInstallState()?.onboarding,"complete");
    } finally { process.env.PATH=oldPath; }
  });
  it("rejects wrong build/instance, finalizes matching health, and keeps recovery dry runs read-only", async () => {
    const record=seed();
    const journal={version:1,id:randomUUID(),phase:"complete",candidate:record.active};
    atomicWriteJson(path.join(record.managedRoot!,"operation.json"),journal);
    const before=fs.readFileSync(path.join(record.managedRoot!,"operation.json"),"utf8");
    const dry=await recoverUpdate(true); assert.equal(dry.verified,false); assert.match(String(dry.nextCommand),/recover/);
    assert.equal(fs.readFileSync(path.join(record.managedRoot!,"operation.json"),"utf8"),before);
    const health=(build:string,instance=runtimeInstanceId(record.configPath))=>({ok:true,status:200,bodyText:JSON.stringify({status:"ok",build:{id:build},instanceId:instance})});
    assert.throws(()=>finalizeSetupActivation(record.configPath,health("wrong")),/did not match/);
    assert.throws(()=>finalizeSetupActivation(record.configPath,health("test-build","wrong-instance")),/did not match/);
    assert.equal(loadInstallState()?.active?.verified,false);
    finalizeSetupActivation(record.configPath,health("test-build"));
    assert.equal(loadInstallState()?.active?.verified,true);
    assert.equal(JSON.parse(fs.readFileSync(path.join(record.managedRoot!,"operation.json"),"utf8")).candidate.verified,true);
  });
  it("generates quoted service PATHs and resolves the selected Node without a shell profile", () => {
    const node=path.join(root,"runtime with spaces","node"); fs.mkdirSync(path.dirname(node),{recursive:true});
    const values={installDir:root,configPath:path.join(root,"config.toml"),envFilePath:path.join(root,"env"),nodeBin:node};
    for(const kind of ["systemd-user","systemd-system"] as const) {
      const unit=renderLinuxSystemdUnit(kind,values);
      assert.match(unit,/Environment="PATH=/); assert.ok(unit.includes("runtime with spaces"));
      assert.ok(unit.includes(".local/bin"));
    }
    const wrapper=renderLaunchdWrapper(values); assert.match(wrapper,/export PATH='/);
    if(process.platform!=="win32") {
      const previousHome=process.env.HOME;
      try {
        process.env.HOME=root;
        const command=path.join(root,".local/bin/openassist");fs.mkdirSync(path.dirname(command),{recursive:true});fs.writeFileSync(command,"#!/bin/sh\nprintf managed-wrapper",{mode:0o700});
        fs.writeFileSync(node,"#!/bin/sh\nprintf selected-node",{mode:0o700});
        const result=spawnSync("/bin/sh",["-c","openassist; node"],{encoding:"utf8",env:{PATH:serviceExecutablePath(node)}});
        assert.equal(result.status,0);assert.equal(result.stdout,"managed-wrapperselected-node");
      } finally {if(previousHome===undefined) delete process.env.HOME;else process.env.HOME=previousHome;}
    }
  });
});
