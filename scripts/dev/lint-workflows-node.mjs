// The WASM build of actionlint does not load configuration files. Honor the
// repository's explicit additional runner labels without suppressing other rules.
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const {runLint,getLintLog}=require('@tktco/node-actionlint');
const files=fs.globSync(process.argv[2]).map(file=>({path:file,data:fs.readFileSync(file,'utf8')}));
const config=fs.existsSync('.github/actionlint.yaml')?fs.readFileSync('.github/actionlint.yaml','utf8'):'';
const labels=new Set([...config.matchAll(/^\s+- ([a-z0-9-]+)\s*$/gm)].map(m=>m[1]));
const results=[];
for(const file of files) for(const result of await runLint(file.data,file.path)) {
  const match=/^label "([a-z0-9-]+)" is unknown\./.exec(result.message);
  if(result.message && !(result.kind==='runner-label' && match && labels.has(match[1]))) results.push({...result,...file});
}
console.log(`Checking ${files.length} workflow file(s)...`);
if(results.length){console.error(getLintLog(results));process.exitCode=1;}
else console.log('All workflow files passed lint checks.');
