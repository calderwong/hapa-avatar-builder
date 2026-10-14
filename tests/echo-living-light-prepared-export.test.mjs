import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {createLivingLightRegistry} from '../src/living-light/registry.js';
import {newJourneyDraft} from '../src/domain/living-light-journey.js';
import {createLivingLightService} from '../server/living-light-service.mjs';
import {packageLivingLightRender} from '../server/living-light-render-package.mjs';
import {createEchoLivingLightCue} from '../src/domain/echo-living-light-editor.js';
import {compileEchoLivingLightTrack} from '../src/domain/echo-living-light-cues.js';
import {compileHyperFramesShow,clipHyperFramesShow} from '../src/domain/hyperframes-show-compiler.js';
import {packageHyperFramesLivingLight,verifyLivingLightPackageMedia} from '../scripts/lib/hyperframes-living-light-package.mjs';
import {livingLightRenderDigest} from '../src/domain/echo-living-light-render-snapshot.js';
import {livingLightCutMedia,LIVING_LIGHT_MEDIA_SCHEMA} from '../src/domain/living-light-media.js';
import encoding from '../scripts/lib/prepared-frame-encoding.cjs';

async function fixture(t){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'ll-prepared-export-')),registry=createLivingLightRegistry(),owner=createLivingLightService({root,registry,resolveSong:async id=>({id})});
  t.after(async()=>{owner.close();await fs.rm(root,{recursive:true,force:true});});
  const draft=newJourneyDraft({songId:'test-song',durationUs:2e6,thing:registry.entries.find(t=>t.capabilities.continuous)},registry);
  const saved=await owner.saveJourney({journey:draft,expectedRevision:null,idempotencyKey:'test:save'},{mode:'authenticated-api',actor:{actorId:'agent:test',kind:'agent',displayName:'Test'}});
  const project={song_id:'test-song',duration:4,timeline:[],living_light_cues:[createEchoLivingLightCue({journey:saved.journey,cueId:'cue:one',startUs:1e6})]};
  const snapshot=await packageLivingLightRender({project,owner,packageMedia:()=>{throw Error('No media expected');}});
  const graph={schemaVersion:'hapa.music-viz.native-show-graph.v2',song:{id:'test-song',durationSeconds:4},stems:{items:[]},tracks:[],directorV2:{},livingLight:compileEchoLivingLightTrack(project)};
  return {root,project,snapshot,graph};
}
test('compiler admits only an exact cut snapshot and retains default export refusal',async t=>{
  const f=await fixture(t),options={project:f.project,showGraph:f.graph,telemetry:{fps:10,stems:[]}};
  assert.throws(()=>compileHyperFramesShow(options),{code:'living_light_export_unsupported'});
  const show=compileHyperFramesShow({...options,livingLightSnapshot:f.snapshot});
  assert.equal(show.livingLight.snapshotDigest,f.snapshot.snapshotDigest);assert.equal(show.livingLight.requiresPreparedFrames,true);
  const clip=clipHyperFramesShow(show,2);assert.equal(clip.livingLight.durationUs,4e6);assert.deepEqual(clip.livingLight.cues,show.livingLight.cues);
  for(const mutate of [g=>g.song.id='other',g=>g.song.durationSeconds=5,g=>g.livingLight.cues=[]]){const graph=structuredClone(f.graph);mutate(graph);assert.throws(()=>compileHyperFramesShow({...options,showGraph:graph,livingLightSnapshot:f.snapshot}));}
  const altered=structuredClone(f.snapshot);altered.recipes[0].package.journey.title='different';assert.throws(()=>compileHyperFramesShow({...options,livingLightSnapshot:altered}),/digest/);
});
test('packaging builds the native owner and emits UTF-8-safe exact metadata',async t=>{
  const f=await fixture(t),output=path.join(f.root,'output');let config;
  await packageHyperFramesLivingLight({snapshot:f.snapshot,packageRoot:f.root,output,root:'/owner',buildRuntime:async value=>{config=value;}});
  assert.equal(config.configFile,false);assert.equal(config.build.emptyOutDir,false);assert.equal(config.build.lib.entry,'/owner/src/living-light/director-snapshot.js');
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(output,'assets/data/living-light.json'),'utf8')),f.snapshot);
  assert((await fs.readFile(path.join(output,'assets/data/living-light.js'),'utf8')).startsWith('window.HAPA_LIVING_LIGHT_SNAPSHOT='));
});
test('package media verifier rejects changed bytes and symlink escapes',async t=>{
  const f=await fixture(t),snapshot=structuredClone(f.snapshot),row=snapshot.recipes[0],bytes=Buffer.from('exact media'),sha256=createHash('sha256').update(bytes).digest('hex');
  const ref=livingLightCutMedia({song_id:'test-song',active_direction_script_variant:{id:'cut'},timeline:[{id:'shot',media_id:'media',media_uri:'/media/test.mp4'}]})[0].ref;
  row.package.journey.mediaSlots=[{schemaVersion:LIVING_LIGHT_MEDIA_SCHEMA,enabled:true,surfaceRef:{instanceId:row.package.journey.instances[0].instanceId,surfaceId:'wall-left'},mediaRef:ref,trim:{inUs:0,outUs:null},loopPolicy:'loop',brightness:1}];
  const {packageDigest,...body}=row.package;row.package.packageDigest=livingLightRenderDigest(body);
  row.sources=[{ref,uri:'assets/living-light/'+sha256+'.mp4',sha256,bytes:bytes.length,identityBasis:'exact-cut-source-declaration-and-packaged-bytes'}];
  const {snapshotDigest,...sealed}=snapshot;snapshot.snapshotDigest=livingLightRenderDigest(sealed);
  const directory=path.join(f.root,'package'),target=path.join(directory,row.sources[0].uri);await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,bytes);
  assert.equal((await verifyLivingLightPackageMedia(snapshot,directory)).length,1);
  await fs.writeFile(target,Buffer.alloc(bytes.length));await assert.rejects(verifyLivingLightPackageMedia(snapshot,directory),/digest/);
  await fs.rm(target);await fs.writeFile(path.join(f.root,'outside.mp4'),bytes);await fs.symlink(path.join(f.root,'outside.mp4'),target);await assert.rejects(verifyLivingLightPackageMedia(snapshot,directory),/escapes/);
});
test('encoder plan bounds outputs and maps exactly one master, with explicit child role',()=>{
  const show={outputProfile:{width:1920,height:1080},fps:30,duration:2.1,livingLight:{captureRoute:'hapa-prepared-electron-v1',requiresPreparedFrames:true},packaging:{audio:{uri:'assets/audio/full_mix.mp3',sha256:'sha256:'+'a'.repeat(64)}}};
  const plan=encoding.encodingPlan(show,'/package','/output');assert.equal(plan.frameCount,63);assert.equal(plan.args.filter(a=>a==='-i').length,2);assert(plan.args.includes('1:a:0'));assert(plan.args.includes('-n'));assert(!plan.args.includes('-y'));
  assert.deepEqual(encoding.encoderEnvironment({NODE_OPTIONS:'--eval bad',ELECTRON_RUN_AS_NODE:'1',PATH:'/tools'}),{PATH:'/tools',HAPA_PREPARED_ENCODER_WORKER:'1'});
  for(const bad of [{...show,fps:0},{...show,duration:1801},{...show,packaging:{}},{...show,livingLight:{}},{...show,outputProfile:{width:8192,height:1080}}])assert.throws(()=>encoding.encodingPlan(bad,'/p','/o'));
});
test('capture receipts reject stale frames, wrong cuts, missing scenes and gap contamination',()=>{
  const show={showHash:'cut',fps:30,livingLight:{snapshotDigest:'exact',cues:[{cueId:'cue',window:{startUs:1e6,endUs:2e6}}]}};
  const receipt={frameIndex:30,showHash:'cut',snapshotDigest:'exact',livingLight:{frameIndex:30,songUs:1e6,active:true,cue:{cueId:'cue'}}};encoding.checkFrameReceipt(receipt,30,show);
  for(const mutate of [r=>r.frameIndex=29,r=>r.showHash='changed',r=>r.snapshotDigest='changed',r=>r.livingLight.active=false,r=>r.livingLight.cue.cueId='wrong',r=>r.livingLight.songUs++]){const bad=structuredClone(receipt);mutate(bad);assert.throws(()=>encoding.checkFrameReceipt(bad,30,show));}
  encoding.checkFrameReceipt({frameIndex:0,showHash:'cut',snapshotDigest:'exact',livingLight:{frameIndex:0,songUs:0,active:false,cue:null}},0,show);
});

test('bound signal banks must match the bytes of the packaged master',()=>{
  const snapshot={preparedSource:{playbackReceipt:{sourceHash:'a'.repeat(64),sha256:'b'.repeat(64)}}};
  for(const hash of ['a','b'])encoding.checkPreparedSoundtrack(snapshot,{sha256:'sha256:'+hash.repeat(64)});
  assert.throws(()=>encoding.checkPreparedSoundtrack(snapshot,{sha256:'sha256:'+'c'.repeat(64)}),/soundtrack/);
  assert.throws(()=>encoding.checkPreparedSoundtrack({preparedSource:{playbackReceipt:{}}},{sha256:'sha256:'+'a'.repeat(64)}),/soundtrack/);
  encoding.checkPreparedSoundtrack({preparedSource:null},{sha256:'sha256:'+'c'.repeat(64)});
});

test('capture parent starts one explicit file worker in an owned process group',()=>{
 const call=encoding.captureInvocation({executable:'/electron',root:'/owner',project:'/inputs',output:'/take',parentEnv:{NODE_OPTIONS:'--require bad',ELECTRON_RUN_AS_NODE:'1',PATH:'/tools'}});
 assert.deepEqual(call.args,['/owner/scripts/render-hyperframes-prepared.cjs','--project=/inputs','--output=/take']);
 assert.equal(call.options.shell,false);assert.equal(call.options.detached,true);assert.equal(call.options.stdio,'inherit');
 assert.deepEqual(call.options.env,{PATH:'/tools',HAPA_PREPARED_CAPTURE_WORKER:'1'});
 assert.throws(()=>encoding.captureInvocation({executable:'electron',root:'/owner',project:'/inputs',output:'/take',parentEnv:{}}),/absolute/);
});

test('local upstream launcher refuses prepared packages before spawning capture',async t=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'ll-upstream-guard-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 await fs.writeFile(path.join(root,'executable-show.json'),JSON.stringify({livingLight:{requiresPreparedFrames:true}}));
 for(const args of [['render'],['render',root],['render','--quality','high',root]])assert.throws(()=>encoding.assertLegacyCaptureRoute(args,root),/does not await/);
 encoding.assertLegacyCaptureRoute(['lint',root],root);
 await fs.writeFile(path.join(root,'executable-show.json'),JSON.stringify({}));encoding.assertLegacyCaptureRoute(['render'],root);
});

test('cancel arms force termination even when the child never emits close',()=>{
 const signals=[],timers=[];let cleared;
 const cancel=encoding.createCaptureCancellation({killGroup:s=>signals.push(s),setTimer:(fn,ms)=>{timers.push({fn,ms});return 7;},clearTimer:id=>cleared=id});
 cancel.cancel('operator canceled');assert.deepEqual(signals,['SIGTERM']);assert.equal(timers[0].ms,3000);
 cancel.cancel('duplicate');assert.equal(timers.length,1);assert.equal(cancel.reason,'operator canceled');
 timers[0].fn();assert.deepEqual(signals,['SIGTERM','SIGKILL']);cancel.dispose();assert.equal(cleared,7);
});


test('managed source packaging reuses exact immutable inputs and refuses corruption',async t=>{
 const {prepareSongCardLivingLight}=await import('../server/song-card-living-light.mjs');
 const f=await fixture(t),cacheRoot=path.join(f.root,'managed-inputs');
 let touched=false;
 assert.equal(await prepareSongCardLivingLight({project:{},owner:()=>{touched=true;},root:f.root,cacheRoot}),null);assert.equal(touched,false);
 await assert.rejects(prepareSongCardLivingLight({project:f.project,root:f.root,cacheRoot}),/source owner/);
 const owner={exportPackage:async()=>({storeMutation:false,analysisExecuted:false,package:f.snapshot.recipes[0].package}),resolveMedia:async()=>{throw Error('No painted media in fixture');}};
 const args={project:f.project,owner,root:f.root,cacheRoot},before=JSON.stringify(f.project);
 const first=await prepareSongCardLivingLight(args),again=await prepareSongCardLivingLight(args);
 assert.deepEqual(first,again);assert.equal(JSON.stringify(f.project),before);
 assert.equal(first.snapshot.snapshotDigest,f.snapshot.snapshotDigest);assert.equal(first.additionalSources.length,1);
 assert.deepEqual((await fs.readdir(cacheRoot)).filter(x=>x.startsWith('.preparing-')),[]);
 await fs.writeFile(first.manifest,'{}');await assert.rejects(prepareSongCardLivingLight(args),/digest|schema|fields/);
 assert.equal(await fs.readFile(first.manifest,'utf8'),'{}');
});

test('managed compiler admission requires every existing gate and exact prepared identity',async t=>{
 const {preparedSongCardCompilerReady}=await import('../server/song-card-living-light.mjs');
 const f=await fixture(t),show=compileHyperFramesShow({project:f.project,showGraph:f.graph,telemetry:{fps:10,stems:[]},livingLightSnapshot:f.snapshot});
 const validation=Object.fromEntries(['lint','inspect','cueCoverage','mediaPreflight','mediaOffline','visualizerPreflight','visualizerOffline','shaderFidelity'].map(k=>[k,'pass']));
 const report={ok:true,showHash:show.showHash,validation:{...validation,preparedCapture:'requires-hapa-prepared-electron-v1',showcaseReady:false}};
 assert.equal(preparedSongCardCompilerReady(report,show,f.snapshot),true);
 for(const key of Object.keys(validation)){const bad=structuredClone(report);bad.validation[key]='fail';assert.equal(preparedSongCardCompilerReady(bad,show,f.snapshot),false);}
 assert.equal(preparedSongCardCompilerReady({...report,showHash:'different'},show,f.snapshot),false);
 assert.equal(preparedSongCardCompilerReady(report,{...show,livingLight:{...show.livingLight,snapshotDigest:'different'}},f.snapshot),false);
 assert.equal(preparedSongCardCompilerReady(report,show,null),false);
 assert.equal(preparedSongCardCompilerReady({ok:true,validation:{showcaseReady:true}},null,null),true);
});

test('readiness accepts an exact snapshot without relaxing ordinary coverage',async t=>{
 const {preflightSongCardRenderReadiness}=await import('../src/domain/song-card-render-readiness.js');
 const f=await fixture(t),args={project:f.project,showGraph:f.graph,signalGraphPreflight:{ok:true},root:f.root};
 const old=preflightSongCardRenderReadiness(args);assert(old.blockers.some(b=>b.code==='show-compile-failed'));
 const prepared=preflightSongCardRenderReadiness({...args,livingLightSnapshot:f.snapshot});
 assert(!prepared.blockers.some(b=>b.code==='show-compile-failed'));
 assert.equal(prepared.ok,false); // An empty ordinary media track is not export coverage.
});

test('prepared pixel proof covers every cue at numbered frames and refuses blank/stale output',()=>{
 const show={showHash:'show',fps:30,duration:4,livingLight:{captureRoute:'hapa-prepared-electron-v1',snapshotDigest:'exact',cues:[{cueId:'one',window:{startUs:1e6,endUs:2e6}},{cueId:'two',window:{startUs:3e6,endUs:4e6}}]}};
 const times=encoding.preparedPixelTimestamps(show,[0,4]);assert(times.includes(1));assert(times.includes(3));assert(times.every(t=>t>=0&&t<4&&Math.abs(t*30-Math.round(t*30))<1e-8));
 const frames=times.map(timestamp=>{const index=Math.round(timestamp*30),songUs=Math.round(index*1e6/30),cue=show.livingLight.cues.find(c=>songUs>=c.window.startUs&&songUs<c.window.endUs);return {timestamp,metrics:{nonBlank:true,nonFlat:true},preparedFrame:{frameIndex:index,showHash:'show',snapshotDigest:'exact',livingLight:{frameIndex:index,songUs,active:!!cue,cue:cue||null}}};});
 return import('../server/song-card-living-light.mjs').then(({preparedSongCardPixelProof})=>{
 const report={showHash:'show',frames};assert.deepEqual(preparedSongCardPixelProof(show,report).cueIds,['one','two']);
 assert.throws(()=>preparedSongCardPixelProof(show,{...report,frames:frames.filter(f=>f.timestamp<3)}),/omitted/);
 for(const mutate of [r=>r.frames[1].preparedFrame.snapshotDigest='wrong',r=>r.frames.find(f=>f.preparedFrame.livingLight.active).metrics.nonBlank=false,r=>r.showHash='wrong']){const bad=structuredClone(report);mutate(bad);assert.throws(()=>preparedSongCardPixelProof(show,bad));}
 });
});


test('shared capture owner refuses worker recursion, canceled starts and existing takes before spawning',async t=>{
 const {runPreparedRender}=await import('../server/prepared-render-owner.mjs');
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'ll-owner-gates-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const output=path.join(root,'existing');await fs.mkdir(output);await fs.writeFile(path.join(output,'keep.txt'),'prior take');
 await assert.rejects(runPreparedRender({root,project:root,output}),/already exists/);
 assert.deepEqual(await fs.readdir(output),['keep.txt']);
 await assert.rejects(runPreparedRender({root,project:root,output,timeoutMs:1800001}),/budget/);
 const controller=new AbortController();controller.abort();await assert.rejects(runPreparedRender({root,project:root,output,signal:controller.signal}),{name:'AbortError'});
 const previous=process.env.HAPA_PREPARED_CAPTURE_WORKER;
 try{process.env.HAPA_PREPARED_CAPTURE_WORKER='1';await assert.rejects(runPreparedRender({root,project:root,output}),/worker cannot enter/);}finally{if(previous===undefined)delete process.env.HAPA_PREPARED_CAPTURE_WORKER;else process.env.HAPA_PREPARED_CAPTURE_WORKER=previous;}
});


test('saved-cut readiness freezes the same package and invalidates a modified certification input',async t=>{
 const {prepareEchoReadinessLivingLight}=await import('../server/echo-readiness-living-light.mjs');
 const {verifyEchoExecutionVisualInputEvidence}=await import('../server/echo-director-show-graph-loader.mjs');
 const f=await fixture(t);let closed=0;
 const factory=()=>{const owner=createLivingLightService({root:f.root});return {...owner,close:()=>{closed++;owner.close();}};};
 const prepared=await prepareEchoReadinessLivingLight({project:f.project,root:f.root,cacheRoot:path.join(f.root,'readiness'),ownerFactory:factory});
 assert.equal(prepared.snapshot.snapshotDigest,f.snapshot.snapshotDigest);assert.equal(closed,1);assert.equal(prepared.evidence.length,1);
 const evidence={visualInputs:prepared.evidence,proxyInputs:[]};assert.equal((await verifyEchoExecutionVisualInputEvidence(evidence)).ok,true);
 await fs.appendFile(prepared.manifest,' ');assert.equal((await verifyEchoExecutionVisualInputEvidence(evidence)).ok,false);
 assert.equal(await prepareEchoReadinessLivingLight({project:{},ownerFactory:()=>{throw Error('No owner expected');}}),null);
 await assert.rejects(prepareEchoReadinessLivingLight({project:f.project,root:f.root,cacheRoot:path.join(f.root,'failed'),ownerFactory:()=>({exportPackage:()=>{throw Error('owner unavailable');},resolveMedia:()=>{},close:()=>closed++})}),/owner unavailable/);
 assert.equal(closed,2);
});
