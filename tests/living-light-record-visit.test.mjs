import test from 'node:test';
import assert from 'node:assert/strict';
import {createLivingLightRecordVisit,loadLivingLightRecordDestination} from '../src/domain/living-light-record-visit.js';
import {livingLightRecordDestination} from '../src/domain/living-light-navigation.js';
import {normalizeEchoRecordSummaryRows} from '../src/domain/echo-record-garden.js';
import {echoDirectionVariantFingerprint} from '../src/domain/echo-direction-variants.js';
const cut={id:'cut:pinned',timeline:[{id:'shot',start_sec:0,end_sec:10}]};
const catalog=[{music_video_project:{song_id:'song:destination',song_title:'Destination',updated_at:'revision:1',duration:10,record_preview:{latestCutId:cut.id,cutFingerprint:echoDirectionVariantFingerprint(cut)}}}];
const target=livingLightRecordDestination(normalizeEchoRecordSummaryRows(catalog)[0]);
const detail={music_video_project:{song_id:'song:destination',timeline:[],direction_script_variants:[cut,{id:'cut:newer',timeline:[]}]}};
test('record visit reads exact catalog declaration and pinned cut, without selecting newer or compiling',async()=>{
 const calls=[];const value=await loadLivingLightRecordDestination(target,{request:async path=>{calls.push(path);return path.includes('summary=1')?catalog:detail;}});
 assert.deepEqual(calls,['/director-projects?summary=1','/director-project?songId=song%3Adestination&variantId=cut%3Apinned']);assert.equal(value.cutId,cut.id);assert.equal(value.timeSeconds,0);assert.equal(value.dirty,false);
});
test('changed metadata, wrong song, changed cut and missing pinned cut all refuse before selection',async()=>{
 for(const changed of [{music_video_project:{...detail.music_video_project,song_id:'wrong'}},{music_video_project:{...detail.music_video_project,direction_script_variants:[{...cut,timeline:[]}]}},{music_video_project:{...detail.music_video_project,direction_script_variants:[]}}])await assert.rejects(loadLivingLightRecordDestination(target,{request:async path=>path.includes('summary=1')?catalog:changed}));
 let reads=0;await assert.rejects(loadLivingLightRecordDestination(target,{request:async()=>{reads++;return [{music_video_project:{...catalog[0].music_video_project,updated_at:'revision:2'}}];}}),/missing or changed/);assert.equal(reads,1);
});
function fixture(extra={}){
 const origin={songId:'song:origin',cutId:'cut:original',title:'Original',detail:{music_video_project:{song_id:'song:origin',timeline:[{id:'keep'}]}},workingFork:{project:{living_light_cues:[{id:'unsaved'}]}},selection:{instanceId:'use:chosen',cardRef:{id:'card:chosen',revision:'r:one'}},dirty:true,timeSeconds:7,cardPlan:{revision:'draft'}};
 let selected=structuredClone(origin),token='initial',busy=false;const states=[],activations=[];
 const visit=createLivingLightRecordVisit({readCurrent:()=>({snapshot:selected,token,busy}),load:async()=>({songId:'song:destination',cutId:'cut:pinned',dirty:false,timeSeconds:0}),activate:value=>{selected=value;token=value.songId;activations.push(structuredClone(value));},onState:value=>states.push(value),...extra});
 return {visit,origin,states,activations,get selected(){return selected;},set selected(value){selected=value;},set token(value){token=value;},set busy(value){busy=value;}};
}
test('one excursion preserves dirty original cut and bookmark, blocks nested visits, and restores a copy',async()=>{
 const f=fixture();assert(await f.visit.open(target));assert.equal(f.visit.diagnostics().heldSessions,1);assert.equal(f.selected.timeSeconds,0);await assert.rejects(f.visit.open(target),/Return to the original/);
 assert(f.visit.return());assert.deepEqual(f.selected,f.origin);f.selected.workingFork.project.living_light_cues[0].id='new edit';assert.equal(f.origin.workingFork.project.living_light_cues[0].id,'unsaved');assert.equal(f.visit.diagnostics().heldSessions,0);assert.equal(f.states.at(-1).state,'idle');f.visit.dispose();
});
test('destination dirty edits and active owner operations refuse return without dropping either session',async()=>{
 const f=fixture();f.busy=true;await assert.rejects(f.visit.open(target),/Wait/);f.busy=false;await f.visit.open(target);f.selected={...f.selected,dirty:true};assert.throws(()=>f.visit.return(),/Both sessions are retained/);assert.equal(f.visit.diagnostics().heldSessions,1);f.selected={...f.selected,dirty:false};f.busy=true;assert.throws(()=>f.visit.return(),/Wait/);f.busy=false;assert(f.visit.return());assert.deepEqual(f.selected,f.origin);
});
test('stale, canceled, failed and disposed destination reads never replace the current album',async()=>{
 for(const mode of ['stale','cancel','dispose','failure']){
  let release;const f=fixture({load:()=>new Promise((resolve,reject)=>release=mode==='failure'?reject:resolve)});const work=f.visit.open(target);
  if(mode==='stale')f.token='edited';if(mode==='cancel')f.visit.cancel();if(mode==='dispose')f.visit.dispose();
  release(mode==='failure'?Error('owner unavailable'):{songId:'destination'});
  if(['stale','failure'].includes(mode))await assert.rejects(work);else assert.equal(await work,false);
  assert.equal(f.activations.length,0);assert.equal(f.visit.diagnostics().heldSessions,0);
 }
});

test('busy session refuses before pausing or reading; an authorized visit pauses once',async()=>{
 let paused=0,reads=0;const f=fixture({pause:()=>paused++,load:async()=>{reads++;return {songId:'next',dirty:false};}});
 f.busy=true;await assert.rejects(f.visit.open(target),/Wait/);assert.equal(paused,0);assert.equal(reads,0);
 f.busy=false;await f.visit.open(target);assert.equal(paused,1);assert.equal(reads,1);f.visit.return();f.visit.dispose();
});
