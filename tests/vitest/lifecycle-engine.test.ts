import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { defaultManagedInstallDir, defaultConfigPath, defaultEnvFilePath, writeDefaultConfig } from "../../packages/config/src/index.js";
import { defaultInstallStatePath, cachedUpdateStatus } from "../../packages/config/src/index.js";
import { saveInstallState, loadInstallState, atomicWriteJson } from "../../apps/openassist-cli/src/lib/install-state.js";
import { executeUpdate, recoverUpdate, readLifecycleJournal, pruneLifecycleHistory, prepareSource, buildSource } from "../../apps/openassist-cli/src/lib/lifecycle-engine.js";
import { randomUUID } from "node:crypto";
import { uninstallApplication } from "../../apps/openassist-cli/src/lib/lifecycle-uninstall.js";
import { checkForUpdate, setUpdateNotifications } from "../../apps/openassist-cli/src/lib/update-notifications.js";
import type { InstalledApplication } from "../../packages/core-types/src/index.js";
import { installationSummary, installationSummaryText } from "../../apps/openassist-cli/src/lib/installation-summary.js";
import { buildLifecycleReport } from "../../apps/openassist-cli/src/lib/lifecycle-readiness.js";

const controls=vi.hoisted(()=>({running:true,installed:true,failCandidate:false,badStartup:false,active:"old",events:[] as string[]}));
vi.mock("../../apps/openassist-cli/src/lib/command-runner.js",async importOriginal=>({...await importOriginal<object>(),SpawnCommandRunner:class {
  async run(command:string,args:string[]){
    controls.events.push([command,...args].join(" "));
    if(command==="git" && args[0]==="clone") {
      const directory=args.at(-1)!;
      fs.mkdirSync(path.join(directory,".git","info"),{recursive:true});
      fs.writeFileSync(path.join(directory,"package.json"),JSON.stringify({version:"0.1.0",packageManager:"pnpm@12.5.1"}));
    }
    return {code:0,stderr:"",stdout:command==="pnpm" && args[0]==="--version" ? "12.5.1" : command==="git" && args[0]==="rev-parse" ? "a".repeat(40) : ""};
  }
}}));
vi.mock("node:child_process",()=>({spawnSync:vi.fn(()=>({status:controls.badStartup?1:0,stdout:"",stderr:""}))}));
vi.mock("../../apps/openassist-cli/src/lib/lifecycle-files.js",async importOriginal=>({...await importOriginal<object>(),switchCurrent:vi.fn((_root:string,target:string)=>{controls.active=path.basename(target);controls.events.push(`activate:${controls.active}`);})}));
vi.mock("../../apps/openassist-cli/src/lib/service-manager.js",()=>({createServiceManager:()=>({kind:"systemd-user",isInstalled:async()=>controls.installed,stop:async()=>{controls.running=false;controls.events.push("stop");},install:async(options:{installDir:string;start:boolean})=>{controls.events.push(`install:${path.basename(options.installDir)}`);if(controls.failCandidate&&path.basename(options.installDir)==="candidate")throw new Error("injected service activation failure");controls.running=options.start;},uninstall:async()=>{controls.installed=false;controls.events.push("uninstall");}})}));
vi.mock("../../apps/openassist-cli/src/lib/health-check.js",()=>({checkHealth:async(_url:string,expected?:{buildId:string})=>({ok:controls.running&&(!expected||expected.buildId===controls.active)}),preferredLocalHealthBaseUrl:()=>"http://127.0.0.1:3344"}));
vi.mock("../../apps/openassist-cli/src/lib/release.js",async importOriginal=>({...await importOriginal<object>(),platformArtifact:vi.fn(()=>({bytes:1024})),resolveRelease:vi.fn(async()=>({manifest:{build:{id:"candidate",version:"0.2.0",configVersion:1,databaseVersion:1},channel:"stable",artifacts:[]},baseUrl:"https://example.test"}))}));

let home:string;
let originalPlatform:string;
function app(name:string):InstalledApplication{
  const directory=path.join(defaultManagedInstallDir(),"releases",name);fs.mkdirSync(directory,{recursive:true});
  const build={id:name,version:"0.1.0",commit:"a".repeat(40),nodeVersion:"24.21.0",configVersion:1,databaseVersion:1};
  fs.writeFileSync(path.join(directory,"build-identity.json"),JSON.stringify(build));
  return{method:"release",path:directory,nodePath:path.join(directory,"runtime/bin/node"),build,verified:true,channel:"stable"};
}
beforeEach(()=>{
  home=fs.mkdtempSync(path.join(os.tmpdir(),"oa-engine-test-"));
  vi.spyOn(os,"homedir").mockReturnValue(home);
  originalPlatform=process.platform;Object.defineProperty(process,"platform",{value:"linux",configurable:true});
  Object.assign(controls,{running:true,installed:true,failCandidate:false,badStartup:false,active:"old",events:[]});
  fs.mkdirSync(path.dirname(defaultConfigPath()),{recursive:true});writeDefaultConfig(defaultConfigPath());fs.writeFileSync(defaultEnvFilePath(),"# private env\n");
  const active=app("old");
  saveInstallState({installDir:active.path,managedRoot:defaultManagedInstallDir(),configPath:defaultConfigPath(),envFilePath:defaultEnvFilePath(),active});
});
afterEach(()=>{Object.defineProperty(process,"platform",{value:originalPlatform,configurable:true});vi.restoreAllMocks();fs.rmSync(home,{recursive:true,force:true});});

describe("staged lifecycle recovery",()=>{
  it("prepares before stopping, backs up state, then verifies the exact application",async()=>{
    const candidate=app("candidate");
    const result=await executeUpdate({prepared:candidate.path});
    expect(result.verified).toBe(true);expect(controls.events).toEqual(["stop","activate:candidate","install:candidate"]);
    expect(loadInstallState()?.previous?.build.id).toBe("old");
    expect(fs.readFileSync(path.join(String(result.backup),"env"),"utf8")).toBe("# private env\n");
    expect((await recoverUpdate()).operation).toBeTruthy();
  });
  it("does not stop the current service when candidate startup validation fails",async()=>{
    const candidate=app("candidate");controls.badStartup=true;
    await expect(executeUpdate({prepared:candidate.path})).rejects.toThrow("startup check");
    expect(controls.events).toEqual([]);expect(controls.running).toBe(true);expect(loadInstallState()?.active?.build.id).toBe("old");
  });
  it("rolls back a failed activation without downloading or rebuilding",async()=>{
    const candidate=app("candidate");controls.failCandidate=true;
    await expect(executeUpdate({prepared:candidate.path})).rejects.toThrow("injected");
    expect(controls.events).toContain("activate:old");expect(controls.running).toBe(true);expect(loadInstallState()?.active?.build.id).toBe("old");
    expect(fs.readFileSync(defaultEnvFilePath(),"utf8")).toContain("private env");
  });
  it("keeps skipped restarts unverified and confirms them only after expected health",async()=>{
    const candidate=app("candidate");await executeUpdate({prepared:candidate.path,skipRestart:true});
    expect(loadInstallState()?.active?.verified).toBe(false);expect(controls.running).toBe(false);
    expect((await recoverUpdate(true)).operation).toMatchObject({phase:"unverified"});
    controls.running=true;expect(await recoverUpdate()).toMatchObject({phase:"complete"});
    expect(loadInstallState()?.active?.verified).toBe(true);
  });
  it("confirms the first service start without losing the retained application",async()=>{
    controls.installed=false;controls.running=false;
    const candidate=app("candidate");await executeUpdate({prepared:candidate.path});
    expect(loadInstallState()?.active?.verified).toBe(false);
    expect((await recoverUpdate(true)).operation).toMatchObject({phase:"complete"});
    controls.running=true;
    expect(await recoverUpdate()).toMatchObject({phase:"complete"});
    expect(loadInstallState()?.active?.verified).toBe(true);
    expect(loadInstallState()?.previous?.build.id).toBe("old");
  });
  it("reports the matched release and unverified activation in setup and doctor",()=>{
    const state=loadInstallState()!;saveInstallState({active:{...state.active!,verified:false,pinnedVersion:"0.1.0"}});
    const info=installationSummary(state.installDir,state.configPath);
    expect(info).toMatchObject({installationMethod:"release",activationVerified:false,trackedRef:"0.1.0"});
    expect(installationSummaryText(state.installDir,state.configPath)).toContain("release 0.1.0 (activation unverified");
    expect(installationSummary(path.join(home,"other"),state.configPath).installStatePresent).toBe(false);
    const report=buildLifecycleReport({...info,installDir:state.installDir,configPath:state.configPath,envFilePath:state.envFilePath,repoBacked:false,configExists:true,envExists:true});
    expect(report.context.activationVerified).toBe(false);
    expect(report.sections.needsActionBeforeFirstReply.some(item=>item.id==="install.unverified")).toBe(true);
    expect(report.context.updateTrackKind).toBe("release");
  });
  it("blocks concurrent operations and incompatible candidates before stopping",async()=>{
    const candidate=app("candidate");fs.mkdirSync(path.join(defaultManagedInstallDir(),"operation.lock"));
    await expect(executeUpdate({prepared:candidate.path})).rejects.toThrow("operation");
    fs.rmSync(path.join(defaultManagedInstallDir(),"operation.lock"),{recursive:true});
    fs.writeFileSync(path.join(candidate.path,"build-identity.json"),JSON.stringify({...candidate.build,databaseVersion:2}));
    await expect(executeUpdate({prepared:candidate.path})).rejects.toThrow("compatibility");expect(controls.events).toEqual([]);
  });
  it("refuses a manually running daemon and missing rollback",async()=>{
    const candidate=app("candidate");controls.installed=false;
    await expect(executeUpdate({prepared:candidate.path})).rejects.toThrow("manually running");
    await expect(executeUpdate({},true)).rejects.toThrow("No retained");
  });
  it("previews release and rollback without mutating files",async()=>{
    const before=loadInstallState();expect(await executeUpdate({dryRun:true})).toMatchObject({method:"release",target:{id:"candidate"}});
    expect(loadInstallState()).toEqual(before);expect(controls.events).toEqual([]);
  });
  it("preserves data by default and refuses modified service ownership",async()=>{
    const candidate=app("candidate");await executeUpdate({prepared:candidate.path});
    const preview=await uninstallApplication({dryRun:true});expect(preview.purge).toEqual([]);
    await expect(uninstallApplication({})).rejects.toThrow("ownership");
    controls.installed=false;await uninstallApplication({});expect(fs.existsSync(defaultConfigPath())).toBe(true);
    expect(await uninstallApplication({})).toMatchObject({detail:"No recorded installation; nothing removed."});
  });
  it("caches update notices and honors the explicit opt-out",async()=>{
    expect(await checkForUpdate(true)).toMatchObject({updateAvailable:true});
    expect(await checkForUpdate()).toMatchObject({available:"0.2.0"});
    setUpdateNotifications(false);expect(await checkForUpdate()).toEqual({disabled:true});
    expect(await checkForUpdate(true)).toMatchObject({updateAvailable:true});
  });
  it.each(["preparing","prepared","stopped","backed-up","activating"])("recovers interruption at %s without restoring conversation state",async phase=>{
    const before=loadInstallState();const candidate=app("candidate");
    atomicWriteJson(path.join(defaultManagedInstallDir(),"operation.json"),{version:1,id:randomUUID(),phase,before,candidate,serviceInstalled:true,wasRunning:true});
    expect((await recoverUpdate()).phase).toBe("rolled-back");
    expect(loadInstallState()?.active?.build.id).toBe("old");
    expect(fs.readFileSync(defaultEnvFilePath(),"utf8")).toContain("private env");
    if(["preparing","prepared"].includes(phase))expect(controls.events).toEqual([]);
    else expect(controls.events).toContain("activate:old");
  });
  it("rejects invalid journals and preserves unfinished files during uninstall",async()=>{
    const file=path.join(defaultManagedInstallDir(),"operation.json");
    atomicWriteJson(file,{version:3,id:randomUUID(),phase:"activating"});
    expect(()=>readLifecycleJournal(defaultManagedInstallDir())).toThrow("Invalid lifecycle");
    atomicWriteJson(file,{version:1,id:randomUUID(),phase:"prepared",candidate:app("candidate")});
    await expect(uninstallApplication({})).rejects.toThrow("unfinished");
    fs.mkdirSync(path.join(defaultManagedInstallDir(),"operation.lock"));
    await expect(recoverUpdate()).rejects.toThrow("lock remains");
  });
  it("blocks custom purge paths and prunes only unreferenced application history",async()=>{
    const previous=app("previous");const obsolete=app("obsolete");const candidate=app("candidate");
    const state=saveInstallState({previous});
    pruneLifecycleHistory(state,{version:1,id:randomUUID(),phase:"complete",candidate});
    expect(fs.existsSync(obsolete.path)).toBe(false);expect(fs.existsSync(previous.path)).toBe(true);expect(fs.existsSync(candidate.path)).toBe(true);
    saveInstallState({configPath:path.join(home,"custom.toml")});
    await expect(uninstallApplication({purge:true})).rejects.toThrow("Custom configuration");
  });
  it("rejects modified command ownership before stopping the service",async()=>{
    const file=path.join(home,"wrapper");fs.writeFileSync(file,"modified");
    saveInstallState({ownedFiles:[{path:file,sha256:"a".repeat(64)}]});
    await expect(executeUpdate({prepared:app("candidate").path})).rejects.toThrow("modified");
    expect(controls.events).toEqual([]);
  });
  it("fails closed on malformed installation records rather than selecting another installation",()=>{
    const original=loadInstallState()!;
    for(const patch of [{schemaVersion:99},{configPath:"relative"},{envFilePath:"relative"},{managedRoot:"relative"},{notifications:"yes"},{ownedFiles:{}},{ownedFiles:[{path:"relative",sha256:"bad"}]},{installDir:path.join(home,"different")},...[
      {method:"unknown"},{nodePath:"relative"},{verified:"yes"},{channel:"unknown"},{build:{...original.active!.build,commit:"invalid"}},{build:{...original.active!.build,configVersion:1.5}},{build:{...original.active!.build,nodeVersion:24}}
    ].map(active=>({active:{...original.active,...active}}))]){
      atomicWriteJson(defaultInstallStatePath(),{...original,...patch});
      expect(()=>loadInstallState()).toThrow("Invalid install-state");
    }
  });
  it("reads cached status without network and repairs stale or malformed notice caches",async()=>{
    const file=path.join(path.dirname(defaultConfigPath()),"update-check.json");
    expect(cachedUpdateStatus()).toBeUndefined();
    fs.writeFileSync(file,"invalid");
    expect(await checkForUpdate()).toMatchObject({available:"0.2.0"});
    expect(cachedUpdateStatus()).toContain("Update available");
    atomicWriteJson(file,{checkedAt:0,available:"0.2.0"});expect(cachedUpdateStatus()).toBeUndefined();
    expect(await checkForUpdate()).toMatchObject({available:"0.2.0"});
    setUpdateNotifications(false);expect(cachedUpdateStatus()).toBe("Update notices disabled");
    setUpdateNotifications(true);
    atomicWriteJson(file,{checkedAt:Date.now(),status:"unavailable"});expect(cachedUpdateStatus()).toBe("Update check unavailable");
    atomicWriteJson(file,{checkedAt:Date.now(),updateAvailable:false});expect(cachedUpdateStatus()).toContain("No update");
  });
  it("stages an immutable source revision with the pinned toolchain and private runtime",async()=>{
    const candidate=await prepareSource(defaultManagedInstallDir(),"refs/pull/7/head");
    expect(candidate.ref).toBe("refs/pull/7/head");expect(candidate.build.commit).toBe("a".repeat(40));
    expect(fs.existsSync(candidate.nodePath)).toBe(true);
    expect(controls.events.some(event=>event==="git checkout --detach FETCH_HEAD")).toBe(true);
    expect(controls.events).toContain("pnpm install --frozen-lockfile");
    expect(fs.readFileSync(path.join(candidate.path,".git","info","exclude"),"utf8")).toContain("/runtime/");
    fs.writeFileSync(path.join(candidate.path,"package.json"),JSON.stringify({packageManager:"pnpm@1.0.0"}));
    await expect(buildSource(candidate.path)).rejects.toThrow("pinned package manager");
    expect(loadInstallState()?.active?.build.id).toBe("old");
  });
  it("retains the newest two backups and any older operation-referenced backup",()=>{
    const state=loadInstallState()!;const backups=path.join(defaultManagedInstallDir(),"backups");
    const directories=Array.from({length:4},(_,i)=>{
      const directory=path.join(backups,randomUUID());fs.mkdirSync(directory,{recursive:true});fs.utimesSync(directory,i+100,i+100);return directory;
    });
    pruneLifecycleHistory(state,{version:1,id:randomUUID(),phase:"complete",backup:directories[0]});
    expect(directories.map(file=>fs.existsSync(file))).toEqual([true,false,true,true]);
  });
});
