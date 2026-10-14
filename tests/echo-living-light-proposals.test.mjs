import test from 'node:test';
import assert from 'node:assert/strict';
import {createEchoLivingLightCue,createEchoLivingLightEditHistory} from '../src/domain/echo-living-light-editor.js';
import {echoLivingLightProposalBasis,previewEchoLivingLightProposal,resolveEchoLivingLightProposal} from '../src/domain/echo-living-light-proposals.js';
import {handleLivingLight} from '../server/living-light-routes.mjs';
import {runLivingLightCLI} from '../cli/living-light.mjs';
const journey=id=>({journeyId:'journey:'+id,revisionId:'rev:one',songId:'song:one',sourceBindingRef:null,schedule:[{startUs:0,endUs:20e6}]});
const sources=[journey('a'),journey('b')],resolveJourney=ref=>sources.find(j=>j.journeyId===ref.journeyId&&j.revisionId===ref.revisionId);
const cue=createEchoLivingLightCue({journey:sources[0],cueId:'cue:a',startUs:0,journeyWindow:{startUs:0,endUs:5e6}});
const project={song_id:'song:one',duration:30,living_light_cues:[cue],timeline:[{media_id:'untouched'}]};
const make=(operations,p=project)=>({...echoLivingLightProposalBasis(p,'cut:one','proposal:one'),operations});
const options={cutId:'cut:one',resolveJourney};
const move={type:'move',cueId:'cue:a',startUs:6e6},swap={type:'swap',cueId:'cue:a',journeyRef:{journeyId:'journey:b',revisionId:'rev:one'}};
const rejects=(fn,code)=>assert.throws(fn,error=>error.code===code);
test('multi-action review is inert, exact and one history entry; unrelated edits survive undo/redo',()=>{
 const original=structuredClone(project),sourceBefore=structuredClone(sources),proposal=make([move,swap]);
 const result=previewEchoLivingLightProposal(project,proposal,options);assert.equal(result.changes.length,2);assert.equal(result.readOnly,true);assert.equal(result.cues[0].window.startUs,6e6);assert.equal(result.cues[0].journeyRef.journeyId,'journey:b');assert.deepEqual(project,original);assert.deepEqual(sources,sourceBefore);
 const history=createEchoLivingLightEditHistory(project.living_light_cues);history.commit(project.living_light_cues,result.cues);
 const edited={...project,timeline:[{media_id:'new-media'}],living_light_cues:history.undo(result.cues)};assert.deepEqual(edited.living_light_cues,project.living_light_cues);assert.equal(edited.timeline[0].media_id,'new-media');assert.deepEqual(history.redo(edited.living_light_cues),result.cues);
 result.cues[0].window.startUs=10;assert.equal(project.living_light_cues[0].window.startUs,0);
});
test('locked action late in a proposal refuses the entire proposal; no hidden unlock operation',()=>{
 const p=structuredClone(project);p.living_light_cues[0].locks.journey=true;const before=structuredClone(p);
 rejects(()=>previewEchoLivingLightProposal(p,make([move,swap],p),options),'living_light_cue_locked');assert.deepEqual(p,before);
 rejects(()=>previewEchoLivingLightProposal(p,make([{type:'lock',cueId:'cue:a',lock:'journey',value:false},swap],p),options),'living_light_proposal_invalid');
 p.living_light_cues[0].locks={timing:true,journey:false};assert.equal(previewEchoLivingLightProposal(p,make([swap],p),options).cues[0].locks.timing,true);
 rejects(()=>previewEchoLivingLightProposal(p,make([move],p),options),'living_light_cue_locked');
});
test('stale base, wrong cut/song and different owner revision refuse without reads',async()=>{
 let reads=0;const asyncOptions={cutId:'cut:one',loadJourney:async()=>{reads++;return sources[0];}};
 for(const proposal of [{...make([move]),baseCues:[]},{...make([move]),target:{songId:'song:one',cutId:'cut:other'}},{...make([move]),target:{songId:'song:other',cutId:'cut:one'},baseCues:[]}])await assert.rejects(resolveEchoLivingLightProposal(project,proposal,asyncOptions));
 assert.equal(reads,0);
 rejects(()=>previewEchoLivingLightProposal(project,make([swap]),{...options,resolveJourney:()=>sources[0]}),'living_light_journey_unavailable');
});
test('out-of-range, partial passage, overlap and changed source binding refuse atomically',()=>{
 const before=structuredClone(project);
 rejects(()=>previewEchoLivingLightProposal(project,make([move,{type:'window',cueId:'cue:a',journeyWindow:{startUs:0,endUs:25e6}}]),options),'living_light_cue_duration');
 const inserted=structuredClone(cue);inserted.cueId='cue:b';rejects(()=>previewEchoLivingLightProposal(project,make([{type:'insert',cue:inserted}]),options),'living_light_cue_overlap');
 rejects(()=>previewEchoLivingLightProposal(project,make([move]),{...options,resolveJourney:()=>({...sources[0],sourceBindingRef:{bindingId:'bind:one',revisionId:'r:one'}})}),'living_light_journey_source_mismatch');
 const passage={...sources[0],schedule:[{startUs:0,endUs:2e6},{startUs:2e6,endUs:8e6,fromInstanceId:'a',toInstanceId:'b'},{startUs:8e6,endUs:20e6}]};
 rejects(()=>previewEchoLivingLightProposal(project,make([move]),{...options,resolveJourney:()=>passage}),'living_light_passage_truncated');assert.deepEqual(project,before);
});
test('closed schema rejects excessive actions, forged recipes, actor assertions and prototype operation names',()=>{
 for(const proposal of [{...make([move]),actor:{kind:'human'}},make(Array(33).fill(move)),make([]),make([{...swap,journey:sources[1]}]),make([{type:'constructor',cueId:'cue:a'}]),make([{type:'__proto__',cueId:'cue:a'}])])rejects(()=>previewEchoLivingLightProposal(project,proposal,options),'living_light_proposal_invalid');
});
test('async resolution deduplicates exact revisions, follows insert/swap and cancels without applying',async()=>{
 const reads=[];const result=await resolveEchoLivingLightProposal(project,make([move,swap,{type:'window',cueId:'cue:a',journeyWindow:{startUs:2e6,endUs:7e6}}]),{cutId:'cut:one',loadJourney:async ref=>{reads.push(ref);return resolveJourney(ref);}});
 assert.equal(reads.length,2);assert.equal(result.preview.cues[0].journeyWindow.startUs,2e6);
 const controller=new AbortController();await assert.rejects(resolveEchoLivingLightProposal(project,make([move]),{cutId:'cut:one',signal:controller.signal,loadJourney:async ref=>{controller.abort();return resolveJourney(ref);}}),{name:'AbortError'});
 const missing=structuredClone(project);missing.living_light_cues[0].journeyRef.revisionId='rev:gone';
 const removed=await resolveEchoLivingLightProposal(missing,make([{type:'remove',cueId:'cue:a'}],missing),{cutId:'cut:one',loadJourney:()=>{throw Error('Must not read a deleted source');}});assert.deepEqual(removed.preview.cues,[]);
});
test('protected preview route authorizes before reading and has no commit operation',async()=>{
 let calls=0,out;const service={previewDirectorProposal:async proposal=>{calls++;return previewEchoLivingLightProposal(project,proposal,options);}};
 const run=async(body,allowed=true,suffix='preview')=>{out=null;await handleLivingLight({req:{method:'POST'},res:{},url:new URL('http://localhost/api/echos/living-light/director-proposals/'+suffix),service,authorize:()=>allowed?{actor:{}}:null,readBody:async()=>body,sendJson:(_,status,value)=>out={status,value}});return out;};
 assert.equal(await run({proposal:make([move])},false),null);assert.equal(calls,0);assert.equal((await run({proposal:make([move]),apply:true})).status,422);assert.equal(calls,0);assert.equal((await run({proposal:make([move])})).value.readOnly,true);assert.equal(calls,1);assert.equal((await run({proposal:make([move])},true,'commit')).status,404);
});
test('CLI uses the same read-only preview, once, preserving source metadata',async()=>{
 const proposal=make([move]),calls=[];const result=await runLivingLightCLI(['preview-director-proposal','--file','proposal.json'],{env:{HAPA_AVATAR_ADMIN_TOKEN:'fixture-only'},stat:async()=>({size:1000}),readFile:async()=>JSON.stringify(proposal),fetcher:async(url,options)=>{calls.push({url,options});return new Response(JSON.stringify(previewEchoLivingLightProposal(project,JSON.parse(options.body).proposal,{cutId:'cut:one',resolveJourney})));}});
 assert.equal(result.readOnly,true);assert.equal(calls.length,1);assert.equal(calls[0].url,'http://127.0.0.1:8797/api/echos/living-light/director-proposals/preview');assert.deepEqual(JSON.parse(calls[0].options.body),{proposal});
});

test('service previews one exact saved cut and revisions without creating a store',async()=>{
 const {createLivingLightService}=await import('../server/living-light-service.mjs');
 const fs=await import('node:fs/promises'),os=await import('node:os'),path=await import('node:path');
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'ll-proposal-owner-')),reads=[];let wrong=false;
 const service=createLivingLightService({root,resolveCut:async(songId,cutId)=>{reads.push({songId,cutId});return {...project,active_direction_script_variant:{id:wrong?'cut:wrong':cutId}};}});
 service.store.journey=(journeyId,revisionId)=>({journey:resolveJourney({journeyId,revisionId})});
 try{const result=await service.previewDirectorProposal(make([move,swap]));assert.equal(result.readOnly,true);assert.deepEqual(reads,[{songId:'song:one',cutId:'cut:one'}]);await assert.rejects(fs.access(service.store.file));wrong=true;await assert.rejects(service.previewDirectorProposal(make([move])),{code:'cut_not_found'});}
 finally{service.close();await fs.rm(root,{recursive:true,force:true});}
});
test('malformed proposal JSON is a readable client error before owner access',async()=>{
 let out;await handleLivingLight({req:{method:'POST'},res:{},url:new URL('http://localhost/api/echos/living-light/director-proposals/preview'),service:{},authorize:()=>({actor:{}}),readBody:async()=>{throw new SyntaxError('bad JSON');},sendJson:(_,status,value)=>out={status,value}});assert.equal(out.status,400);assert.equal(out.value.error,'invalid_json');
});
