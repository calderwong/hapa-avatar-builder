import {mkdir,writeFile,rename,rm,readFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {buildEchoMediaEvidenceIndex} from '../server/echo-media-evidence-index.mjs';
import {prepareEchoCatalogObservations} from '../server/echo-catalog-observation-preparation.mjs';
import {createEchoSourceInspector} from '../server/echo-source-inventory.mjs';
const root=path.resolve(import.meta.dirname,'..');
const manifestPath=process.argv.find(arg=>arg.startsWith('--observations-from='))?.slice('--observations-from='.length);
const output=path.resolve(process.argv.find(arg=>arg.startsWith('--output='))?.slice(9)||path.join(root,'data/echo-media-evidence',manifestPath?'observations.json':'index.json'));
const started=performance.now();
let index;
if(manifestPath){
  if((await stat(manifestPath)).size>1024*1024)throw Error('observation-manifest-budget');
  const bytes=await readFile(manifestPath);if(bytes.length>1024*1024)throw Error('observation-manifest-budget');
  const manifest=JSON.parse(bytes);
  index=await prepareEchoCatalogObservations({catalogPath:path.join(root,'artifacts/echo-video-enrichment-v1/catalog.sqlite3'),mediaIds:manifest.mediaIds,runtimeSources:manifest.runtimeSources,sourceInspector:createEchoSourceInspector()});
}else index=await buildEchoMediaEvidenceIndex({root});
const serialized=JSON.stringify(index);
if(Buffer.byteLength(serialized)>32*1024*1024)throw new Error('echo_evidence_index_budget');
await mkdir(path.dirname(output),{recursive:true});
const temp=output+'.'+randomUUID()+'.tmp';
try{await writeFile(temp,serialized+'\n',{flag:'wx'});await rename(temp,output);}finally{await rm(temp,{force:true});}
console.log(JSON.stringify({output,revision:index.revision,records:index.records?.length,withCharacters:index.records?.filter(row=>row.characterIds.length).length,withScenes:index.records?.filter(row=>row.sceneIds.length).length,observations:index.metrics,bytes:Buffer.byteLength(serialized),elapsedMs:performance.now()-started,maxRssBytes:process.resourceUsage().maxRSS*1024,truth:index.truth||'sampled-inferences-not-verified-visual-identity'}));
