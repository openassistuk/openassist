import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
const app=path.resolve(process.argv[2]);
const load=file=>import(pathToFileURL(path.join(app,'apps/openassist-cli',file)));
const config=await load('node_modules/@openassist/config/dist/index.js');
const state=await load('dist/lib/install-state.js');
const onboarding=await load('dist/lib/onboarding.js');
if(process.argv[3]==='verify') {
  const {checkHealth}=await load('dist/lib/health-check.js');
  const {finalizeSetupActivation}=await load('dist/lib/lifecycle-engine.js');
  const health=await checkHealth(process.argv[4]);
  finalizeSetupActivation(config.defaultConfigPath(),health);
  assert.equal(state.loadInstallState().active.verified,true);
  assert.equal(state.loadInstallState().onboarding,'complete');
} else {
  const build=JSON.parse(fs.readFileSync(path.join(app,'build-identity.json'),'utf8'));
  state.saveInstallState({installDir:app,configPath:config.defaultConfigPath(),envFilePath:config.defaultEnvFilePath(),onboarding:'pending',active:{method:'release',path:app,nodePath:path.join(app,'runtime/bin/node'),build,verified:false}});
  assert.equal(onboarding.needsFirstTimeSetup(config.defaultConfigPath()),true);
  const {loadSetupQuickstartState,runSetupQuickstart}=await load('dist/lib/setup-quickstart.js');
  const model=loadSetupQuickstartState(config.defaultConfigPath(),config.defaultEnvFilePath(),app);
  model.config.runtime.bindPort=Number(process.argv[3]);
  const answers=['true','OpenAssist','Concise','Synthetic artifact test','openai','openai-main','gpt-5.6-terra','','default','synthetic-api-token','telegram','telegram-main','synthetic-bot-token','100000001','Europe','Europe/London','true','save'];
  const next=()=>{assert.ok(answers.length,'unexpected onboarding prompt');return answers.shift();};
  const result=await runSetupQuickstart(model,{installDir:app,configPath:config.defaultConfigPath(),envFilePath:config.defaultEnvFilePath(),skipService:true,requireTty:false},
    {input:async()=>next(),password:async()=>next(),confirm:async()=>next()==='true',select:async()=>next()});
  assert.equal(result.saved,true);assert.equal(answers.length,0);
  assert.equal(onboarding.needsFirstTimeSetup(config.defaultConfigPath()),false);
  // No real channel/provider endpoint is contacted by the artifact test.
  const require=createRequire(path.join(app,'apps/openassist-cli/package.json'));
  const parsed=config.loadConfig({baseFile:config.defaultConfigPath()}).config;
  parsed.runtime.channels=[];parsed.runtime.time.ntpPolicy='off';
  fs.writeFileSync(config.defaultConfigPath(),require('@iarna/toml').stringify(parsed),{mode:0o600});
}
