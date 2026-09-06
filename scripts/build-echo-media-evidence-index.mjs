import {mkdir,writeFile,rename,rm} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {buildEchoMediaEvidenceIndex} from '../server/echo-media-evidence-index.mjs';
const root=path.resolve(import.meta.dirname,'..');
const output=path.resolve(process.argv.find(arg=>arg.startsWith('--output='))?.slice(9)||path.join(root,'data/echo-media-evidence/index.json'));
const started=performance.now();
const index=await buildEchoMediaEvidenceIndex({root});
const serialized=JSON.stringify(index);
if(Buffer.byteLength(serialized)>32*1024*1024)throw new Error('echo_evidence_index_budget');
await mkdir(path.dirname(output),{recursive:true});
const temp=output+'.'+randomUUID()+'.tmp';
try{await writeFile(temp,serialized+'\n',{flag:'wx'});await rename(temp,output);}finally{await rm(temp,{force:true});}
console.log(JSON.stringify({output,revision:index.revision,records:index.records.length,withCharacters:index.records.filter(row=>row.characterIds.length).length,withScenes:index.records.filter(row=>row.sceneIds.length).length,bytes:Buffer.byteLength(serialized),elapsedMs:performance.now()-started,maxRssBytes:process.resourceUsage().maxRSS*1024,truth:index.truth}));
