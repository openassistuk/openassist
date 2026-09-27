import fs from 'node:fs';
import path from 'node:path';
import { sign, createPublicKey } from 'node:crypto';
import { createHash } from 'node:crypto';
const dir = path.resolve(process.argv[2]);
const channel = process.argv[3];
if(!['stable','preview'].includes(channel)) throw new Error('Choose stable or preview.');
const records = ['linux-x64','linux-arm64','darwin-x64','darwin-arm64'].map(t => JSON.parse(fs.readFileSync(path.join(dir,`${t}.json`),'utf8')));
if(records.some(r => JSON.stringify(r.build) !== JSON.stringify(records[0].build))) throw new Error('Artifacts must have identical build identities.');
if((channel === 'stable') === records[0].build.version.includes('-')) throw new Error('Stable/preview channel must match semantic version.');
for (const {artifact} of records) for (const entry of [artifact,artifact.bootstrap.runtime,artifact.bootstrap.verifier]) {
  if (!/^[A-Za-z0-9._-]+$/.test(entry.file)) throw new Error('Unsafe release filename.');
  const bytes=fs.readFileSync(path.join(dir,entry.file));
  if(bytes.length!==entry.bytes || createHash('sha256').update(bytes).digest('hex')!==entry.sha256) throw new Error('Artifact differs from build metadata.');
}
const privateKey = process.env.OPENASSIST_RELEASE_SIGNING_KEY;
if(!privateKey) throw new Error('Protected release signing key is not provisioned.');
const key = fs.readFileSync('release-public.pem','utf8');
const pub = createPublicKey(privateKey).export({type:'spki',format:'pem'});
if(key.trim() !== pub.trim()) throw new Error('Signing key is not pinned in release-public.pem.');
const manifest = Buffer.from(JSON.stringify({schemaVersion:1,build:records[0].build,channel,artifacts:records.map(r=>r.artifact)},null,2));
fs.writeFileSync(path.join(dir,'release.json'),manifest);
fs.writeFileSync(path.join(dir,'release.sig'),sign('RSA-SHA256',manifest,privateKey));
const index = Buffer.from(`version ${records[0].build.version}\nchannel ${channel}\n`+records.flatMap(r => {
  const target=`${r.artifact.platform}-${r.artifact.arch}`;
  return [[target,r.artifact],[`${target}-runtime`,r.artifact.bootstrap.runtime],[`${target}-verifier`,r.artifact.bootstrap.verifier]].map(([name,a])=>`${name} ${a.file} ${a.sha256} ${a.bytes}`);
}).join('\n')+'\n');
fs.writeFileSync(path.join(dir,'release-index.txt'),index);
fs.writeFileSync(path.join(dir,'release-index.sig'),sign('RSA-SHA256',index,privateKey));
