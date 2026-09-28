import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import net from 'node:net';
import {spawnSync} from 'node:child_process';

// Run only on a disposable root-owned Linux hosted runner, never an operator host.
if (process.platform !== 'linux' || process.getuid() !== 0 || process.env.GITHUB_ACTIONS !== 'true') throw new Error('Live lifecycle smoke requires a disposable hosted Linux root context.');
if(fs.existsSync('/etc/systemd/system/openassistd.service')) throw new Error('Refusing to replace an existing OpenAssist service.');
const source=path.resolve(process.argv[2]);
// PrivateTmp service hardening deliberately hides /tmp: exercise a real home layout.
const home=fs.mkdtempSync('/root/openassist-live-');
process.env.HOME=home;
delete process.env.OPENASSIST_STATE_ROOT;
const load=file=>import(pathToFileURL(path.join(source,'apps/openassist-cli',file)));
const config=await load('node_modules/@openassist/config/dist/index.js');
const {executeUpdate,recoverUpdate}=await load('dist/lib/lifecycle-engine.js');
const {uninstallApplication}=await load('dist/lib/lifecycle-uninstall.js');
const {createServiceManager}=await load('dist/lib/service-manager.js');
const {SpawnCommandRunner}=await load('dist/lib/command-runner.js');
const {loadInstallState}=await load('dist/lib/install-state.js');
const release=await load('dist/lib/release.js');
const require=createRequire(path.join(source,'apps/openassist-cli/package.json'));
const TOML=require('@iarna/toml');
const service=createServiceManager(new SpawnCommandRunner());
try {
  fs.mkdirSync(config.defaultConfigDir(),{recursive:true,mode:0o700});
  config.writeDefaultConfig(config.defaultConfigPath());
  const parsed=config.loadConfig({baseFile:config.defaultConfigPath()}).config;
  parsed.runtime.channels=[];
  parsed.runtime.scheduler.enabled=false;
  parsed.runtime.bindPort=await new Promise(resolve=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const port=s.address().port;s.close(()=>resolve(port));});});
  fs.writeFileSync(config.defaultConfigPath(),TOML.stringify(parsed),{mode:0o600});
  fs.writeFileSync(config.defaultEnvFilePath(),'# no credentials in smoke\n',{mode:0o600});
  const prepare=name=>{
    const target=path.join(config.defaultManagedInstallDir(),'releases',name);
    fs.cpSync(source,target,{recursive:true,verbatimSymlinks:true});
    const build=JSON.parse(fs.readFileSync(path.join(target,'build-identity.json'),'utf8'));
    build.id=name;fs.writeFileSync(path.join(target,'build-identity.json'),JSON.stringify(build));
    return target;
  };
  // Use the immutable published rc.1 application and its updater, not a relabelled candidate.
  const published=await release.resolveRelease({version:'0.2.0-rc.1',channel:'preview'});
  const artifact=release.platformArtifact(published.manifest);
  const bytes=await release.download(`${published.baseUrl}/${artifact.file}`,artifact.bytes,120_000);
  assert.equal(bytes.length,artifact.bytes);assert.equal(release.sha256(bytes),artifact.sha256);
  const first=path.join(config.defaultManagedInstallDir(),'releases','published-rc1');
  release.unpackRelease(bytes,first);
  assert.deepEqual(release.readBuildIdentity(first),published.manifest.build);
  const firstId=published.manifest.build.id;
  await executeUpdate({prepared:first});
  await service.install({installDir:first,repoRoot:first,nodePath:path.join(first,'runtime/bin/node'),configPath:config.defaultConfigPath(),envFilePath:config.defaultEnvFilePath()});
  const health=async id=>{
    for(let i=0;i<60;i++){
      try{const r=await fetch(`http://127.0.0.1:${parsed.runtime.bindPort}/v1/health`);const b=await r.json();if(r.ok&&b.build?.id===id&&b.instanceId===config.runtimeInstanceId(config.defaultConfigPath()))return;}catch{}
      await new Promise(resolve=>setTimeout(resolve,500));
    }
    throw new Error(`Expected live identity ${id} was not ready.`);
  };
  await health(firstId);
  assert.equal((await recoverUpdate()).phase,'complete');
  assert.equal(loadInstallState().active.verified,true);
  fs.writeFileSync(path.join(parsed.runtime.paths.dataDir,'retained-state.txt'),'preserve through update, rollback and uninstall');
  const oldLoad=file=>import(pathToFileURL(path.join(first,'apps/openassist-cli',file)));
  const oldEngine=await oldLoad('dist/lib/lifecycle-engine.js');
  const oldStorage=await oldLoad('node_modules/@openassist/storage-sqlite/dist/index.js');
  const logger={info(){},warn(){},error(){}};
  const dbFile=path.join(parsed.runtime.paths.dataDir,'openassist.db');
  const oldDb=new oldStorage.OpenAssistDatabase({dbPath:dbFile,logger});
  oldDb.recordInbound('telegram-test:100000001',{channel:'telegram',channelId:'telegram-test',conversationKey:'100000001',senderId:'100000001',transportMessageId:'fixture-message',text:'Copper Lantern synthetic history',attachments:[],receivedAt:new Date().toISOString(),idempotencyKey:'upgrade-history'});
  oldDb.upsertSessionMemory({sessionId:'telegram-test:100000001',summary:'Copper Lantern synthetic memory',lastCompactedMessageId:1});
  oldDb.close();
  const configBefore=fs.readFileSync(config.defaultConfigPath());
  const envBefore=fs.readFileSync(config.defaultEnvFilePath());
  const second=prepare('smoke-b');
  // Exercise the deployed daemon's own module-root discovery while install-state
  // still describes the previous application, exactly as during service startup.
  const candidateContext=await import(pathToFileURL(path.join(second,'apps/openassistd/dist/install-context.js')));
  assert.equal(loadInstallState().installDir,first);
  assert.equal(candidateContext.loadRuntimeInstallContext(config.defaultConfigPath()).installDir,second);
  assert.equal(candidateContext.loadRuntimeInstallContext(config.defaultConfigPath()).installationMethod,'release');
  assert.equal((await oldEngine.executeUpdate({prepared:second})).verified,true);
  await health('smoke-b');
  assert.deepEqual(fs.readFileSync(config.defaultConfigPath()),configBefore);
  assert.deepEqual(fs.readFileSync(config.defaultEnvFilePath()),envBefore);
  const {OpenAssistDatabase}=await load('node_modules/@openassist/storage-sqlite/dist/index.js');
  const currentDb=new OpenAssistDatabase({dbPath:dbFile,logger});
  assert.equal(currentDb.getRecentMessages('telegram-test:100000001',10)[0].content,'Copper Lantern synthetic history');
  assert.equal(currentDb.getSessionMemory('telegram-test:100000001').summary,'Copper Lantern synthetic memory');
  const owner={actorId:'100000001',channelId:'telegram-test',conversationKey:'100000001'};
  const reminder=currentDb.oneShots.create({...owner,requestKey:'upgrade-guard',scheduledFor:new Date(Date.now()+3600000).toISOString(),timezone:'UTC',action:{type:'text',text:'synthetic reminder'},createdAt:new Date().toISOString()},new Date().toISOString());
  await assert.rejects(executeUpdate({dryRun:true},true),/lacks managed one-shot support/);
  assert.equal(currentDb.oneShots.get(reminder.id).state,'pending');
  currentDb.oneShots.cancel(reminder.id,owner);currentDb.close();
  assert.equal((await executeUpdate({},true)).verified,true);
  await health(firstId);
  await executeUpdate({prepared:second,skipRestart:true});
  assert.equal(loadInstallState().active.verified,false);
  await service.start();await health('smoke-b');
  assert.equal((await recoverUpdate()).phase,'complete');
  const commit=JSON.parse(fs.readFileSync(path.join(source,'build-identity.json'),'utf8')).commit;
  assert.equal((await executeUpdate({source:true,ref:commit,yes:true})).verified,true);
  assert.equal(loadInstallState().active.method,'source');
  assert.equal(loadInstallState().active.build.commit,commit);
  await health(`source-${commit}`);
  const returned=prepare('smoke-return-to-release');
  assert.equal((await executeUpdate({prepared:returned,release:true,channel:'stable',yes:true})).verified,true);
  assert.equal(loadInstallState().active.method,'release');
  assert.equal(loadInstallState().previous.method,'source');
  await health('smoke-return-to-release');
  await uninstallApplication({});
  assert.equal(await service.isInstalled(),false);
  assert.equal(fs.readFileSync(path.join(parsed.runtime.paths.dataDir,'retained-state.txt'),'utf8'),'preserve through update, rollback and uninstall');
  assert.equal(fs.existsSync(first),false);
  assert.equal(fs.existsSync(second),false);
  await uninstallApplication({});
  console.log('Live systemd activation, private runtime, identity, rollback, skip-restart recovery, immutable source build, return to release and data-preserving uninstall passed.');
} catch(error) {
  spawnSync('journalctl',['-u','openassistd.service','--no-pager','-n','80'],{stdio:'inherit'});
  throw error;
} finally {
  if(await service.isInstalled()) {await service.stop().catch(()=>{});await service.uninstall();}
  fs.rmSync(home,{recursive:true,force:true});
}
