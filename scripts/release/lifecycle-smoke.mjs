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
  const first=prepare('smoke-a');
  await executeUpdate({prepared:first});
  await service.install({installDir:first,repoRoot:first,nodePath:path.join(first,'runtime/bin/node'),configPath:config.defaultConfigPath(),envFilePath:config.defaultEnvFilePath()});
  const health=async id=>{
    for(let i=0;i<60;i++){
      try{const r=await fetch(`http://127.0.0.1:${parsed.runtime.bindPort}/v1/health`);const b=await r.json();if(r.ok&&b.build?.id===id&&b.instanceId===config.runtimeInstanceId(config.defaultConfigPath()))return;}catch{}
      await new Promise(resolve=>setTimeout(resolve,500));
    }
    throw new Error(`Expected live identity ${id} was not ready.`);
  };
  await health('smoke-a');
  fs.writeFileSync(path.join(parsed.runtime.paths.dataDir,'retained-state.txt'),'preserve through update, rollback and uninstall');
  const second=prepare('smoke-b');
  assert.equal((await executeUpdate({prepared:second})).verified,true);
  await health('smoke-b');
  assert.equal((await executeUpdate({},true)).verified,true);
  await health('smoke-a');
  await executeUpdate({prepared:second,skipRestart:true});
  assert.equal(loadInstallState().active.verified,false);
  await service.start();await health('smoke-b');
  assert.equal((await recoverUpdate()).phase,'complete');
  await uninstallApplication({});
  assert.equal(await service.isInstalled(),false);
  assert.equal(fs.readFileSync(path.join(parsed.runtime.paths.dataDir,'retained-state.txt'),'utf8'),'preserve through update, rollback and uninstall');
  assert.equal(fs.existsSync(first),false);
  assert.equal(fs.existsSync(second),false);
  await uninstallApplication({});
  console.log('Live systemd activation, private runtime, identity, rollback, skip-restart recovery and data-preserving uninstall passed.');
} catch(error) {
  spawnSync('journalctl',['-u','openassistd.service','--no-pager','-n','80'],{stdio:'inherit'});
  throw error;
} finally {
  if(await service.isInstalled()) {await service.stop().catch(()=>{});await service.uninstall();}
  fs.rmSync(home,{recursive:true,force:true});
}
