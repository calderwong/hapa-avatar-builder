import test from 'node:test';
import assert from 'node:assert/strict';
import {createLivingLightRegistry} from '../src/living-light/registry.js';
import {planLivingLightAlbumSong,buildLivingLightAlbumVariant} from '../src/domain/echo-living-light-album-pass.js';
import {validateDraft} from '../src/domain/living-light-journey.js';
import {deriveEchoDirectionVariantProject,deriveEchoSavedDirectionPlanningProject,echoDirectionVariantWithoutExecutionGraph,echoDirectionVariantSourceFingerprint} from '../src/domain/echo-direction-variants.js';
const registry=createLivingLightRegistry();
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
