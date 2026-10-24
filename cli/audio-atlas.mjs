#!/usr/bin/env node
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createAudioAtlas } from '../server/audio-atlas.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const atlas=createAudioAtlas({root});
const [op,id,...rest]=process.argv.slice(2);const options=Object.fromEntries(rest.filter(x=>x.startsWith('--')).map(x=>{const i=x.indexOf('=');return i<0?[x.slice(2),true]:[x.slice(2,i),x.slice(i+1)];}));
try{
 let result;
 if(op==='songs')result=atlas.list();
 else if(op==='inventory')result=await atlas.inventory();
 else if(op==='analyze')result=options['dry-run']?{song:atlas.list().find(s=>s.id===id),operation:'local analysis; no provider calls'}:await atlas.start(id,{alignmentBaseRunId:options['alignment-base-run']||null,transcriptionBaseRunId:options['transcription-base-run']||null,transcriptionSourceId:options['transcription-source']||null,transcriptionLanguage:options['transcription-language']||'en',transcribe:options.transcribe===true,beats:options.beats===true,acoustic:options.acoustic===true,pitch:options['pitch-source']?{sourceId:options['pitch-source'],channel:Number(options['pitch-channel']??0)}:null,alignment:options['align-text-file']?{sourceId:options['align-source']||'master',startSeconds:Number(options['align-start']),endSeconds:Number(options['align-end']),text:fs.readFileSync(options['align-text-file'],'utf8')}:null});
 else if(op==='jobs')result=atlas.jobs(id);
 else if(op==='status')result=atlas.status(id);
 else if(op==='describe'){const input={asset_id:options.asset||'master',start_sample:Number(options.start),end_sample:Number(options.end)};result=atlas.describe(id,input);result=await atlas.waitDescription(id,result.id);}
 else if(op==='descriptions')result=atlas.descriptions(id,options.id);
 else if(op==='review-description')result=atlas.reviewDescription(id,options.id,JSON.parse(fs.readFileSync(options.file,'utf8')));
 else if(op==='search-text')result=await atlas.searchText(id,options);
 else if(op==='text-searches')result=atlas.textSearches(id,options.id,options.limit);
 else if(op==='query')result=atlas.query(id,options);
 else if(op==='export')result={result:atlas.result(id),reviews:atlas.reviews(id),contract:atlas.contract(id),derived:atlas.derived?.(id)||{}};
 else if(op==='noise-reference')result=atlas.noiseReference(id,JSON.parse(fs.readFileSync(options.file,'utf8')));
 else if(op==='reference')result=atlas.reference(id,JSON.parse(fs.readFileSync(options.file,'utf8')));
 else if(op==='review')result=atlas.review(id,{...options,revision:Number(options.revision),...(options.correction?{correction:JSON.parse(options.correction)}:{})});
 else throw new Error('Usage: node cli/audio-atlas.mjs songs | inventory | analyze SONG [--dry-run] [--transcribe] [--beats] [--acoustic] [--pitch-source=stem-1 --pitch-channel=0] [--align-text-file=FILE --align-source=stem-1 --align-start=26 --align-end=41] | jobs [SONG] | status RUN | query RUN --op=contract|brief|timeline|curves|lyrics|search|acoustic|evidence|timing-evaluation|structure|spectrogram|technical|noise|noise-preview|pitch|rhythm|notes|harmony|activity [--channel=0] [--view=original|effective] [--detail=summary|full] | describe RUN --asset=ID --start=SAMPLE --end=SAMPLE | descriptions RUN [--id=DESCRIPTION] | review-description RUN --id=DESCRIPTION --file=REVIEW.json | search-text RUN --text=DESCRIPTION [--limit=8] | text-searches RUN [--id=QUERY] [--limit=8] | export RUN | noise-reference RUN --file=REFERENCE.json | reference RUN --file=REFERENCE.json | review RUN --revision=N --observation_id=ID --state=needs_review --reviewer=NAME --note=TEXT');
 if(op==='analyze'&&!options['dry-run'])result=await atlas.wait(result.id);
 console.log(JSON.stringify({ok:!['failed','cancelled','interrupted'].includes(result?.state),data:result},null,2));
 if(['failed','cancelled','interrupted'].includes(result?.state))process.exitCode=1;
}catch(e){console.error(JSON.stringify({ok:false,error:e.message}));process.exitCode=1;}finally{await atlas.close();}
