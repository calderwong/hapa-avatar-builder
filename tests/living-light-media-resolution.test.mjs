import test from 'node:test';
import assert from 'node:assert/strict';
import {livingLightCutMedia} from '../src/domain/living-light-media.js';
import {resolveLivingLightMediaReferences,resolveLivingLightJourneyMedia} from '../src/domain/living-light-media-resolution.js';
import {handleLivingLight} from '../server/living-light-routes.mjs';
const cut={song_id:'song:a',active_direction_script_variant:{id:'cut:a'},timeline:[{id:'shot:a',media_id:'media:a',media_title:'Original',media_uri:'/media/a.mp4'},{id:'shot:b',media_id:'media:b',media_title:'Original',media_uri:'/media/b.mp4'}]};
const sources=livingLightCutMedia(cut),refs=sources.map(row=>row.ref);
test('saved refs resolve only through their exact cut, shared cut loads once and lookup never edits it',async()=>{
 const original=structuredClone(cut),loads=[];const result=await resolveLivingLightMediaReferences(refs,{loadCut:async(...args)=>{loads.push(args);return cut;}});
 assert.deepEqual(loads,[['song:a','cut:a']]);assert.deepEqual(result.results.map(row=>row.source),sources);assert.equal(result.readOnly,true);assert.deepEqual(cut,original);
});
test('changed source, wrong song/cut, deleted source and read failure stay unresolved without latest/title fallback',async()=>{
 for(const altered of [null,{...cut,song_id:'song:other'},{...cut,active_direction_script_variant:{id:'cut:other'}},{...cut,timeline:[{...cut.timeline[0],media_uri:'/media/replaced.mp4'}]},{...cut,timeline:[]}]){
  const result=await resolveLivingLightMediaReferences([refs[0]],{loadCut:async()=>altered});assert.equal(result.results[0].state,'unavailable');assert.equal(result.results[0].source,undefined);
 }
 const result=await resolveLivingLightMediaReferences([refs[0]],{loadCut:async()=>{throw Error('private file path');}});assert.equal(result.results[0].reason,'cut-read-failed');assert(!JSON.stringify(result).includes('private file'));
});
test('arbitrary URLs, fields, bad digests and excessive refs reject before owner reads',async()=>{
 let reads=0;for(const refsInput of [null,{},[...refs,refs[0]],[{...refs[0],uri:'/etc/secret'}],[{...refs[0],sourceRevision:'bad'}],[{...refs[0],mediaId:''}]])await assert.rejects(resolveLivingLightMediaReferences(refsInput,{loadCut:async()=>reads++}),{code:'invalid_media_resolution'});assert.equal(reads,0);
});
test('reopened Journey combines current exact sources and pinned media from another cut without persisting URLs',async()=>{
 const journey={mediaSlots:refs.map(mediaRef=>({enabled:true,mediaRef}))},before=structuredClone(journey),calls=[];
 const result=await resolveLivingLightJourneyMedia(journey,{sources:[sources[0]],request:async(route,options)=>{calls.push({route,body:JSON.parse(options.body)});return resolveLivingLightMediaReferences(JSON.parse(options.body).refs,{loadCut:async()=>cut});},resolveUri:uri=>'http://127.0.0.1:8807'+uri});
 assert.deepEqual(calls,[{route:'/media/resolve',body:{refs:[refs[1]]}}]);assert.equal(result[0].uri,sources[0].uri);assert.equal(result[1].uri,'http://127.0.0.1:8807/media/b.mp4');assert.deepEqual(journey,before);
 let called=false;await resolveLivingLightJourneyMedia(journey,{sources,request:async()=>{called=true;}});assert.equal(called,false);
});
test('missing source stays absent and an owner response cannot substitute a different pin',async()=>{
 const journey={mediaSlots:[{enabled:true,mediaRef:refs[0]}]};assert.deepEqual(await resolveLivingLightJourneyMedia(journey,{request:async()=>({schemaVersion:'hapa.living-light.media-resolution.v1',readOnly:true,results:[{ref:refs[0],state:'unavailable'}]})}),[]);
 await assert.rejects(resolveLivingLightJourneyMedia(journey,{request:async()=>({schemaVersion:'hapa.living-light.media-resolution.v1',readOnly:true,results:[{ref:refs[0],state:'resolved',source:sources[1]}]})}),/different source/);
});
test('protected read-only route rejects extra fields and never resolves before authorization',async()=>{
 let calls=0,out;const service={resolveMedia:async input=>{calls++;return resolveLivingLightMediaReferences(input,{loadCut:async()=>cut});}};
 const run=async(body,allowed=true)=>{out=null;await handleLivingLight({req:{method:'POST'},res:{},url:new URL('http://localhost/api/echos/living-light/media/resolve'),service,authorize:()=>allowed?{actor:{}}:null,readBody:async()=>body,sendJson:(_,status,value)=>out={status,value}});return out;};
 assert.equal(await run({refs},false),null);assert.equal(calls,0);assert.equal((await run({refs,uri:'/bad'})).status,422);assert.equal(calls,0);assert.equal((await run({refs})).value.results[0].state,'resolved');assert.equal(calls,1);
});


test('CLI exact media read uses the protected owner route once and returns unresolved references intact',async()=>{
 const {runLivingLightCLI}=await import('../cli/living-light.mjs');const calls=[];
 const result=await runLivingLightCLI(['resolve-media','--file','refs.json'],{
  env:{HAPA_AVATAR_ADMIN_TOKEN:'fixture-only'},stat:async()=>({size:100}),readFile:async()=>JSON.stringify({refs}),
  fetcher:async(url,options)=>{calls.push({url,options});return new Response(JSON.stringify(await resolveLivingLightMediaReferences(refs,{loadCut:async()=>null})),{status:200});}
 });
 assert.equal(calls.length,1);assert.equal(calls[0].url,'http://127.0.0.1:8797/api/echos/living-light/media/resolve');assert.equal(calls[0].options.method,'POST');assert.deepEqual(JSON.parse(calls[0].options.body),{refs});assert.deepEqual(result.results.map(row=>row.state),['unavailable','unavailable']);
});

test('destination lookup reads only its current exact pin from a closed cut and propagates cancellation',async()=>{
 const {resolveLivingLightMediaSources}=await import('../src/domain/living-light-media-resolution.js');
 const controller=new AbortController(),calls=[];
 const resolved=await resolveLivingLightMediaSources([refs[1]],{sources:[sources[0]],signal:controller.signal,request:async(path,options)=>{calls.push(JSON.parse(options.body).refs);assert.equal(options.signal,controller.signal);return resolveLivingLightMediaReferences(JSON.parse(options.body).refs,{loadCut:async()=>cut});}});
 assert.deepEqual(calls,[[refs[1]]]);assert.deepEqual(resolved,[sources[1]]);
 controller.abort();await assert.rejects(resolveLivingLightMediaSources([refs[1]],{signal:controller.signal,request:async(_,options)=>{options.signal.throwIfAborted();}}),{name:'AbortError'});
});
