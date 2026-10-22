import test from 'node:test';
import assert from 'node:assert/strict';
import {createLivingLightRegistry} from '../src/living-light/registry.js';
import {planLivingLightAlbumSong,buildLivingLightAlbumVariant,planLivingLightMusicResponse,resolveLivingLightMusicPlan,MUSIC_PASS_ID} from '../src/domain/echo-living-light-album-pass.js';
import {validateDraft} from '../src/domain/living-light-journey.js';
import {deriveEchoDirectionVariantProject,deriveEchoSavedDirectionPlanningProject,echoDirectionVariantWithoutExecutionGraph,echoDirectionVariantSourceFingerprint} from '../src/domain/echo-direction-variants.js';
const registry=createLivingLightRegistry();
import {fixture as signalsFixture} from './fixtures/living-light-signals.mjs';
function musicInput(){
 const f=signalsFixture(1);f.songId='song-fixture';f.performance.songId=f.songId;f.performance.stemSelectionPolicy='coherent-stems-v1';
 f.playbackReceipt.durationSeconds=180;f.performance.durationSeconds=180;
 for(const bus of f.performance.buses){bus.durationSeconds=180;bus.frames=Array.from({length:1800},(_,i)=>({...bus.frames[i%20],t:i/10}));if(bus.decodedAnalysis)bus.decodedAnalysis.frameCount=180*8000;}
 return f;
}
test('music pass forks exact sources while preserving original cue windows, painted clips, cuts and source revisions',()=>{
 const f=fixture(),plain=planLivingLightAlbumSong(f.project,registry),journey={...plain.journey,journeyId:'ll-journey:original',revisionId:'ll-journey-r:original',parentRevisionId:null};
 const first=buildLivingLightAlbumVariant({...f,plan:plain,journey,createdAt:'2026-10-16T00:00:00Z'}),project=first.projected,before=JSON.stringify({f,journey,project}),input=musicInput();
 const plan=planLivingLightMusicResponse({project,registry,resolveJourney:()=>journey,...input});
 assert.equal(plan.drafts.length,1);assert.deepEqual(plan.drafts[0].journey.mediaSlots,journey.mediaSlots);assert.deepEqual(plan.drafts[0].lineage,{journeyId:journey.journeyId,revisionId:journey.revisionId});
 assert(plan.drafts[0].journey.instances.every(i=>i.musicResponse.roles.drums.sourceRefs[0].assetId==='exact-asset-0'));
 assert(plan.bindingRef.bindingId.startsWith('prepared-coherent:'));assert(plan.bindingRef.revisionId.includes(input.performance.fingerprint));
 const saved={...plan.drafts[0].journey,journeyId:'ll-journey:response',revisionId:'ll-journey-r:response',parentRevisionId:null};
 const resolved=resolveLivingLightMusicPlan(plan,new Map([['response-0',saved]]));
 const result=buildLivingLightAlbumVariant({...f,project,parent:first.variant,plan:resolved,createdAt:'2026-10-22T00:00:00Z',musicResponse:true});
 assert.equal(result.variant.id,MUSIC_PASS_ID);assert.equal(result.projected.living_light_cues.length,6);
 assert.deepEqual(result.projected.living_light_cues.map(c=>c.window),project.living_light_cues.map(c=>c.window));
 assert(result.projected.living_light_cues.every(c=>c.journeyRef.journeyId===saved.journeyId));
 assert.equal(JSON.stringify({f,journey,project}),before);assert.equal(plan.coverage[0].roles[0].qualifiedStemUs,0,'an external fixture map cannot certify the prepared bank');
 assert.equal(plan.coverage[1].qualifiedStemRoles.length,0);assert(plan.coverage[1].roles[0].masterResponseUs>0);
});
test('locked cue recipes are retained and reported, never falsely counted as a new musical response',()=>{
 const f=fixture(),plain=planLivingLightAlbumSong(f.project,registry),journey={...plain.journey,journeyId:'ll-journey:original',revisionId:'ll-journey-r:original',parentRevisionId:null};
 const first=buildLivingLightAlbumVariant({...f,plan:plain,journey,createdAt:'2026-10-16T00:00:00Z'});first.projected.living_light_cues[0].locks.journey=true;
 const plan=planLivingLightMusicResponse({project:first.projected,registry,resolveJourney:()=>journey,...musicInput()});
 assert.deepEqual(plan.cues[0],first.projected.living_light_cues[0]);assert.equal(plan.coverage[0].responseVerified,false);assert.equal(plan.coverage[0].status,'preserved-locked-choice');assert.equal(plan.drafts.length,1);
 journey.instances[0].locked=true;
 const allLocked=planLivingLightMusicResponse({project:first.projected,registry,resolveJourney:()=>journey,...musicInput()});
 assert.equal(allLocked.drafts.length,0);assert(allLocked.coverage.every(c=>c.status==='preserved-locked-choice'));
});
test('music authoring refuses a mismatched playback clock before creating any Journey draft',()=>{
 const f=fixture(),input=musicInput();input.playbackReceipt.durationSeconds-=.01;
 assert.throws(()=>planLivingLightMusicResponse({project:f.project,registry,...input}),/timeline exceeds prepared playback/);
});
function fixture(duration=180){const base={song_id:'song-fixture',song_title:'Fixture',duration,timed_lyrics:[{text:'Original lyric',start:2,end:5}],timeline:[{start_sec:0,end_sec:duration,media_id:'clip-a',media_uri:'/media/a.mp4',media_contract:{type:'video'}}]};const parent={id:'source-cut',timeline:base.timeline,project_patch:{lyric_style:{fontSize:104}}};return {base,parent,project:deriveEchoDirectionVariantProject(base,parent)};}
test('album direction preserves music and media while adding complete passages and painted exact sources',()=>{
 const f=fixture(),before=JSON.stringify(f),plan=planLivingLightAlbumSong(f.project,registry);
 validateDraft(plan.journey,registry,180e6);
 const journey={...plan.journey,journeyId:'ll-journey:test',revisionId:'ll-journey-r:test',parentRevisionId:null};
 const {variant,projected}=buildLivingLightAlbumVariant({...f,plan,journey,createdAt:'2026-10-16T00:00:00Z'});
 assert.equal(JSON.stringify(f),before);assert.deepEqual(variant.timeline,f.project.timeline);assert.deepEqual(projected.timed_lyrics,f.project.timed_lyrics);
 assert.equal(projected.living_light_cues.length,6);assert.equal(projected.director_show_graph.livingLight.cues.length,6);
 assert.equal(plan.journey.mediaSlots.length,2);assert.ok(plan.journey.mediaSlots.every(s=>s.mediaRef.cutId==='source-cut'));
 assert.equal(projected.living_light_cues.filter(c=>c.role==='transition').length,2);
 assert.ok(plan.journey.instances.every(i=>Object.keys(i.bindings).length===0));
 assert.equal(projected.active_direction_script_variant.projectionValidation.ok,true);
});
test('short songs remain bounded; unsupported durations refuse without clipping',()=>{
 const f=fixture(40),plan=planLivingLightAlbumSong(f.project,registry);validateDraft(plan.journey,registry,40e6);
 const result=buildLivingLightAlbumVariant({...f,plan,journey:{...plan.journey,journeyId:'ll-journey:test',revisionId:'ll-journey-r:test',parentRevisionId:null},createdAt:'2026-10-16T00:00:00Z'});
 assert.ok(result.projected.living_light_cues.every(c=>c.window.endUs<=40e6));
 assert.throws(()=>planLivingLightAlbumSong(fixture(39).project,registry),/at least 40/);
});
test('existing Living Light cues and independent locks are retained verbatim',()=>{
 const f=fixture(),p=planLivingLightAlbumSong(f.project,registry),journey={...p.journey,journeyId:'ll-journey:test',revisionId:'ll-journey-r:test',parentRevisionId:null};
 const first=buildLivingLightAlbumVariant({...f,plan:p,journey,createdAt:'2026-10-16T00:00:00Z'});
 first.projected.living_light_cues[0].locks={timing:true,journey:true};
 const plan=planLivingLightAlbumSong(first.projected,registry);assert.equal(plan.existing,true);
 const next=buildLivingLightAlbumVariant({...f,project:first.projected,plan,createdAt:'2026-10-16T00:00:00Z'});
 assert.deepEqual(next.projected.living_light_cues,first.projected.living_light_cues);
});
test('omitted execution graphs retain source identity and allow uncertified editing without claiming render readiness',()=>{
 const f=fixture(),plan=planLivingLightAlbumSong(f.project,registry),journey={...plan.journey,journeyId:'ll-journey:test',revisionId:'ll-journey-r:test',parentRevisionId:null};
 const {variant,projected}=buildLivingLightAlbumVariant({...f,plan,journey,createdAt:'2026-10-16T00:00:00Z'}),before=JSON.stringify(variant);
 const delivered=echoDirectionVariantWithoutExecutionGraph(variant);delivered.execution_preview={status:'preparing',reason:'certificate-unavailable'};
 const saved=deriveEchoSavedDirectionPlanningProject(f.base,delivered,{fallbackProject:projected});
 assert.ok(saved);assert.equal(saved.living_light_cues.length,6);assert.equal(saved.editor_graph_fallback.requiresExactCertificate,true);
 assert.equal(echoDirectionVariantSourceFingerprint(delivered),variant.fingerprint);assert.equal(JSON.stringify(variant),before);
 delivered.timeline[0].media_id='tampered';assert.equal(deriveEchoSavedDirectionPlanningProject(f.base,delivered,{fallbackProject:projected}),null);
});
