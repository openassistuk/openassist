import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import net from 'node:net';
const source=path.resolve(process.argv[2]);
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'openassist-portable-'));
const app=path.join(temporary,'relocated');
const target=`${process.platform}-${process.arch}`;
const record=JSON.parse(fs.readFileSync(path.join(path.dirname(source),`${target}.json`),'utf8'));
const unpack=spawnSync(process.execPath,[path.join(path.dirname(source),`bootstrap-verifier-${target}.mjs`),path.join(path.dirname(source),record.artifact.file),app,record.build.version],{encoding:'utf8'});
if(unpack.status!==0)throw new Error(unpack.stderr || unpack.stdout);
const node=path.join(app,'runtime/bin/node');
const cli=path.join(app,'apps/openassist-cli/dist/index.js');
const daemon=path.join(app,'apps/openassistd/dist/index.js');
const state=path.join(temporary,'state');
const env={...process.env,PATH:path.join(temporary,'empty-path'),OPENASSIST_STATE_ROOT:state};
const run=args=>{const result=spawnSync(node,args,{env,cwd:temporary,encoding:'utf8'});if(result.status!==0)throw new Error(result.stderr||result.stdout);return result.stdout;};
let child;
try {
  fs.mkdirSync(env.PATH);
  fs.mkdirSync(path.join(state,'config'),{recursive:true});
  run([cli,'--help']); run([daemon,'--help']);
  run([cli,'init']);
  const file=path.join(state,'config/openassist.toml');
  let config=fs.readFileSync(file,'utf8');
  const port=await new Promise(resolve=>{const server=net.createServer();server.listen(0,'127.0.0.1',()=>{const port=server.address().port;server.close(()=>resolve(port));});});
  config=config.replace('bindPort = 3344',`bindPort = ${port}`);
  fs.writeFileSync(file,config);
  // Import every production adapter from the deployed daemon graph without credentials.
  const require=createRequire(path.join(app,'apps/openassistd/package.json'));
  for(const name of ['@openassist/providers-openai','@openassist/providers-codex','@openassist/providers-anthropic','@openassist/providers-azure-foundry','@openassist/providers-openai-compatible','@openassist/channels-telegram','@openassist/channels-discord','@openassist/channels-whatsapp-md','@openassist/storage-sqlite']) require.resolve(name);
  // Native media processing must actually execute on each advertised architecture.
  const baileys=createRequire(require.resolve('@openassist/channels-whatsapp-md'));
  const media=createRequire(baileys.resolve('@whiskeysockets/baileys'));
  const sharp=media('sharp');
  await sharp({create:{width:2,height:2,channels:3,background:'#ffffff'}}).png().toBuffer();
  child=spawn(node,[daemon,'run','--config',file],{env,cwd:temporary,stdio:['ignore','ignore','inherit']});
  let healthy=false;
  for(let i=0;i<30;i++){
    try{const response=await fetch(`http://127.0.0.1:${port}/v1/health`);const body=await response.json();if(response.ok&&body.build?.id===record.build.id&&body.instanceId){healthy=true;break;}}catch{}
    await new Promise(resolve=>setTimeout(resolve,1000));
  }
  if(!healthy)throw new Error('Relocated daemon did not become healthy.');
  console.log('Portable CLI, daemon, adapter graph, private Node, and SQLite passed without system build tools.');
} finally {
  if(child&&child.exitCode===null){child.kill('SIGTERM');await new Promise(resolve=>child.once('exit',resolve));}
  fs.rmSync(temporary,{recursive:true,force:true});
}
