import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {createLivingLightService} from '../server/living-light-service.mjs';
import {packageLivingLightRender,createLivingLightMediaPackager} from '../server/living-light-render-package.mjs';
import {createLivingLightRegistry} from '../src/living-light/registry.js';
import {newJourneyDraft} from '../src/domain/living-light-journey.js';
import {livingLightCutMedia,LIVING_LIGHT_MEDIA_SCHEMA} from '../src/domain/living-light-media.js';
import {createEchoLivingLightCue} from '../src/domain/echo-living-light-editor.js';
import {livingLightRenderDigest,validateLivingLightRenderSnapshot} from '../src/domain/echo-living-light-render-snapshot.js';
import {livingLightPreparedBinding} from '../src/domain/living-light-prepared-binding.js';
import {createEchoLivingLightSnapshotRenderer} from '../src/living-light/director-snapshot.js';
import {fixture as signals} from './fixtures/living-light-signals.mjs';
import {readEchoSavedCut,readEchoSavedVariant} from '../server/echo-saved-cut-reader.mjs';
const registry=createLivingLightRegistry(),actor={mode:'authenticated-api',actor:{actorId:'agent:test',kind:'agent',displayName:'Test'}};
const seal=s=>{const {snapshotDigest,...body}=s;return {...body,snapshotDigest:livingLightRenderDigest(body)};};
async function setup({painted=true,bound=false,framing}={}){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'ll-render-package-')),input=signals(0),songId=input.songId,durationUs=2e6;
 const cut={song_id:songId,active_direction_script_variant:{id:'cut:one'},timeline:[{id:'shot:one',media_id:'clip:one',media_uri:'/media/test.mp4'}]};
 await fs.mkdir(path.join(root,'data/media'),{recursive:true});await fs.writeFile(path.join(root,'data/media/test.mp4'),'fixture video bytes');
 const owner=createLivingLightService({root,registry,resolveSong:async id=>({id}),resolveCut:async()=>cut});
 const draft=newJourneyDraft({songId,durationUs,thing:registry.entries.find(t=>t.capabilities.continuous)},registry),source=livingLightCutMedia(cut)[0];
 if(painted)draft.mediaSlots=[{schemaVersion:LIVING_LIGHT_MEDIA_SCHEMA,enabled:true,surfaceRef:{instanceId:draft.instances[0].instanceId,surfaceId:'wall-left'},mediaRef:source.ref,trim:{inUs:0,outUs:null},loopPolicy:'loop',brightness:1,...(framing?{framing}: {})}];
 if(bound){const binding=livingLightPreparedBinding(input);draft.sourceBindingRef={bindingId:binding.bindingId,revisionId:binding.revisionId};}
 const saved=await owner.saveJourney({journey:draft,expectedRevision:null,idempotencyKey:'test:saved'},actor),project={song_id:songId,duration:4,living_light_cues:[createEchoLivingLightCue({journey:saved.journey,cueId:'cue:one',startUs:1e6})]};
 // Bound preparation uses the same actual two-second song, not this neutral four-second placement fixture.
 if(bound){project.duration=2;project.living_light_cues=[createEchoLivingLightCue({journey:saved.journey,cueId:'cue:one',startUs:0})];}
 const output=path.join(root,'output'),packageMedia=createLivingLightMediaPackager({root,projectPath:path.join(root,'data/music-video-projects/project.json'),output});
 return {root,owner,project,source,saved,input,packageMedia,output,async build(extra={}){return packageLivingLightRender({project,owner,packageMedia,...extra});},async close(){owner.close();await fs.rm(root,{recursive:true,force:true});}};
}
test('owner snapshots and local byte packages reopen independently without rewriting authoring',async()=>{
 const f=await setup();try{
  const before=await fs.readFile(path.join(f.root,'data/living-light/authoring.sqlite3'));
  const snapshot=await f.build(),result=validateLivingLightRenderSnapshot(snapshot,{cues:f.project.living_light_cues,songId:f.project.song_id,durationUs:4e6});
  assert.equal(result.recipes.size,1);assert.equal(snapshot.recipes[0].package.noteHistories.length,0);assert.equal(snapshot.recipes[0].package.journey.revisionId,f.saved.journey.revisionId);
  const media=snapshot.recipes[0].sources[0],bytes=await fs.readFile(path.join(f.output,media.uri));assert.equal(media.sha256,createHash('sha256').update(bytes).digest('hex'));assert.equal(media.bytes,bytes.length);assert.deepEqual(await f.build(),snapshot);
  assert.deepEqual(await fs.readFile(path.join(f.root,'data/living-light/authoring.sqlite3')),before);assert.equal(snapshot.preparedSource,null);
 }finally{await f.close();}
});
test('missing and changed source declarations refuse; exported files do not substitute for exact refs',async()=>{
 const f=await setup();try{const snapshot=await f.build();const source=snapshot.recipes[0].sources[0];await fs.writeFile(path.join(f.output,source.uri),'corrupt');await assert.rejects(f.build({packageMedia:createLivingLightMediaPackager({root:f.root,projectPath:path.join(f.root,'project.json'),output:f.output})}),/content check/);
  await assert.rejects(f.build({owner:{...f.owner,resolveMedia:async()=>({readOnly:true,results:[{ref:f.source.ref,state:'unavailable'}]})}}),/cannot be resolved/);
  assert.deepEqual((await fs.readdir(path.join(f.output,'assets/living-light'))).filter(n=>n.startsWith('.copy-')),[]);
 }finally{await f.close();}
});
test('snapshot admission rejects corruption, cut drift, omitted definitions and executable definition substitution',async()=>{
 const f=await setup();try{const snapshot=await f.build();let bad=structuredClone(snapshot);bad.cues[0].window.startUs++;assert.throws(()=>validateLivingLightRenderSnapshot(bad),/digest/);
  assert.throws(()=>validateLivingLightRenderSnapshot(snapshot,{cues:[]}),/another cut/);
  for(const mutate of [s=>s.recipes=[],s=>s.recipes.push(structuredClone(s.recipes[0])),s=>s.recipes[0].sources[0].uri='https://example.invalid/clip.mp4',s=>s.recipes[0].sources[0].ref.sourceRevision='f'.repeat(64)]){bad=structuredClone(snapshot);mutate(bad);assert.throws(()=>validateLivingLightRenderSnapshot(seal(bad)));}
  bad=structuredClone(snapshot);bad.recipes[0].package.things[0].title='changed';const {packageDigest,...body}=bad.recipes[0].package;bad.recipes[0].package.packageDigest=livingLightRenderDigest(body);assert.throws(()=>validateLivingLightRenderSnapshot(seal(bad)),/source module definition changed/);
 }finally{await f.close();}
});
test('bound Journey packaging requires matching prepared identity and measured source semantics',async()=>{
 const f=await setup({painted:false,bound:true});try{
  await assert.rejects(f.build(),/exact prepared source/);const preparedSource={performance:f.input.performance,playbackReceipt:f.input.playbackReceipt};
  const snapshot=await f.build({preparedSource});assert(snapshot.preparedSource);validateLivingLightRenderSnapshot(snapshot);
  for(const change of [s=>s.preparedSource.playbackReceipt.pcmSha256='d'.repeat(64),s=>s.preparedSource.performance.masterAudioHash='e'.repeat(64),s=>s.preparedSource.playbackReceipt.sourceSelection={kind:'stem'},s=>s.preparedSource.performance.buses[0].frames[0].rawRms=8]){const bad=structuredClone(snapshot);change(bad);assert.throws(()=>validateLivingLightRenderSnapshot(seal(bad)));}
 }finally{await f.close();}
});
test('snapshot renderer pins caller data and resolves only packaged media, recipes and prepared input',async()=>{
 const f=await setup();try{const snapshot=await f.build();let options,dead=0;
  const canvas=()=>({width:0,height:0,getContext:()=>({clearRect(){},drawImage(){}}),addEventListener(){},removeEventListener(){}});
  const renderer=createEchoLivingLightSnapshotRenderer(snapshot,{width:100,height:100,canvasFactory:canvas,previewFactory:value=>{options=value;return {capture:()=>null,dispose:()=>dead++,diagnostics:()=>({})};}});
  snapshot.recipes[0].package.journey.title='mutated';const journey=await options.resolveJourney(f.project.living_light_cues[0].journeyRef);assert.notEqual(journey.title,'mutated');assert.equal((await options.resolveMedia(journey))[0].uri.startsWith('assets/living-light/'),true);assert.deepEqual(await options.prepareInput(journey,{}),{neutralStudy:true});
  await assert.rejects(options.resolveJourney({journeyId:journey.journeyId,revisionId:'latest'}),/absent/);
  await renderer.prepareFrame(0);renderer.dispose();assert.equal(dead,1);assert.equal(renderer.diagnostics().features.closed,true);
 }finally{await f.close();}
});
test('cancellation stops packaging; remote sources never fetch and source files remain intact',async()=>{
 const f=await setup();try{const controller=new AbortController();controller.abort();await assert.rejects(f.build({signal:controller.signal}),{name:'AbortError'});
  await assert.rejects(f.packageMedia({...f.source,ref:{...f.source.ref,mediaId:'remote'},uri:'https://example.invalid/clip.mp4'}),/Only local/);assert.equal(await fs.readFile(path.join(f.root,'data/media/test.mp4'),'utf8'),'fixture video bytes');
 }finally{await f.close();}
});
test('shared saved-cut reader preserves exact append-only and embedded variants and rejects path/song mismatch',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'ll-cut-reader-'));try{
  const directory=path.join(root,'data/music-video-project-variants/song-one');await fs.mkdir(directory,{recursive:true});await fs.mkdir(path.join(root,'data/music-video-projects'));
  const file=path.join(root,'data/music-video-projects/song-one-video-project.json');await fs.writeFile(file,JSON.stringify({song_id:'song-one',duration:4,timeline:[],direction_script_variants:[{id:'embedded',title:'Retained',timeline:[]}]}));
  await fs.writeFile(path.join(directory,'bundle.json'),JSON.stringify({direction_script_variants:[{id:'first',timeline:[]},{id:'exact',title:'Exact cut',timeline:[]}]}));
  assert.equal((await readEchoSavedVariant({root,songId:'song-one',variantId:'exact'})).title,'Exact cut');
  for(const cutId of ['exact','embedded','legacy'])assert.equal((await readEchoSavedCut({root,songId:'song-one',cutId})).active_direction_script_variant.id,cutId);
  assert.equal(await readEchoSavedCut({root,songId:'song-one',cutId:'missing'}),null);
  await assert.rejects(readEchoSavedCut({root,songId:'../song-one',cutId:'exact'}),/Invalid song/);
  await fs.writeFile(file,JSON.stringify({song_id:'different',timeline:[]}));await assert.rejects(readEchoSavedCut({root,songId:'song-one',cutId:'legacy'}),/differs/);
 }finally{await fs.rm(root,{recursive:true,force:true});}
});
test('portable render metadata cannot carry local paths or authority',async()=>{
 const f=await setup({painted:false,bound:true});try{const snapshot=await f.build({preparedSource:{performance:f.input.performance,playbackReceipt:f.input.playbackReceipt}});
  for(const entry of [{path:'/Users/operator/private/source.wav'},{authorization:'private'},{uri:'https://name:secret@example.invalid'}]){const bad=structuredClone(snapshot);Object.assign(bad.preparedSource.playbackReceipt,entry);assert.throws(()=>validateLivingLightRenderSnapshot(seal(bad)),/cannot carry/);}
 }finally{await f.close();}
});

test('exact render snapshots retain explicit crop and fit into the native recipe',async()=>{
 const framing={fit:'contain',crop:{x:.15,y:.2,width:.7,height:.6}},f=await setup({framing});try{
  const snapshot=await f.build();validateLivingLightRenderSnapshot(snapshot);assert.deepEqual(snapshot.recipes[0].package.journey.mediaSlots[0].framing,framing);
  let options;const canvas=()=>({width:0,height:0,getContext:()=>({clearRect(){},drawImage(){}}),addEventListener(){},removeEventListener(){}});
  const renderer=createEchoLivingLightSnapshotRenderer(snapshot,{width:100,height:100,canvasFactory:canvas,previewFactory:value=>{options=value;return {capture:()=>null,dispose(){},diagnostics:()=>({})};}});
  try{snapshot.recipes[0].package.journey.mediaSlots[0].framing.crop.x=.99;const recipe=await options.resolveJourney(f.project.living_light_cues[0].journeyRef);assert.deepEqual(recipe.mediaSlots[0].framing,framing);}finally{renderer.dispose();}
  const bad=structuredClone(await f.build());bad.recipes[0].package.journey.mediaSlots[0].framing.crop.x=.99;const {packageDigest,...body}=bad.recipes[0].package;bad.recipes[0].package.packageDigest=livingLightRenderDigest(body);assert.throws(()=>validateLivingLightRenderSnapshot(seal(bad)),/crop fully inside/);
 }finally{await f.close();}
});
