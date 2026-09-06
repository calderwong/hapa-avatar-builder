import test from 'node:test';
import assert from 'node:assert/strict';
import {buildShotPreferencePatch as patch,inspectStoredShotDecision} from '../src/domain/shot-decision-inspector.js';
import {activeTasteEvidence,applyTastePriors} from '../src/domain/human-taste-memory.js';
import {createEchoNarrativeRecut} from '../src/domain/echo-narrative-recut.js';
const project=()=>({song_id:'fixture',duration:12,timeline:['a','a','b','c'].map((id,i)=>({media_id:id,media_uri:'/media/'+id+'.mp4',start_sec:i*3,end_sec:i*3+3,camera_motion:'static'}))});
function act(p,action,index=1){const inspector=inspectStoredShotDecision(p.timeline[index]);return {...p,...patch(p,{shotIndex:index,inspector,action,targetMediaId:p.timeline[index].media_id,operator:'fixture-human',rationale:'Explicit fixture control',at:'2026-01-01T00:00:00Z'})};}
const recut=p=>createEchoNarrativeRecut({project:p,recipeId:'performance-kinetic',seed:'test',range:{startSeconds:0,endSeconds:12}}).project;

test('inspector pin changes the existing recut media lock and unpin releases only that lock',()=>{
 const p=project();p.timeline[1].locks=['camera'];const before=JSON.stringify(p),pinned=act(p,'pin');
 assert.deepEqual(pinned.timeline[1].locks,['camera','media']);
 assert.equal(recut(pinned).timeline[1].media_id,'a');
 const unpinned=act(pinned,'unpin');assert.deepEqual(unpinned.timeline[1].locks,['camera']);
 assert.equal(JSON.stringify(p),before);assert.equal(unpinned.shot_preference_events.length,2);
 assert.deepEqual(activeTasteEvidence(unpinned.human_taste_memory,{shot:inspectStoredShotDecision(unpinned.timeline[1]).shotId}),[]);
});

test('per-shot exclusion constrains future recut selection and unban removes only its exact ID',()=>{
 const p=project();p.timeline[1].mediaConstraints={bans:['unrelated'],requiredSceneIds:[]};
 const banned=act(p,'ban');assert.deepEqual(banned.timeline[1].mediaConstraints.bans,['unrelated','a']);
 assert.notEqual(recut(banned).timeline[1].media_id,'a');assert.equal(banned.timeline[0].media_id,'a');
 const restored=act(banned,'unban');assert.deepEqual(restored.timeline[1].mediaConstraints.bans,['unrelated']);
 assert.deepEqual(activeTasteEvidence(restored.human_taste_memory,{shot:inspectStoredShotDecision(restored.timeline[1]).shotId}),[]);
});

test('pins never relax exclusions; stale controls and invented alternatives are rejected',()=>{
 const p=act(act(project(),'pin'),'ban');assert.throws(()=>recut(p),/operator-ban/);
 const original=project(),inspector=inspectStoredShotDecision(original.timeline[1]),changed=act(original,'pin');
 const options={shotIndex:1,inspector,action:'ban',targetMediaId:'a',operator:'fixture',rationale:'review'};
 assert.throws(()=>patch(changed,options),/selected shot changed/);
 assert.throws(()=>patch(original,{...options,action:'replace',targetMediaId:'invented'}),/stored alternative/);
});

test('shot identities without authored index remain distinct and repeated preferences do not amplify taste',()=>{
 const p=project();assert.notEqual(inspectStoredShotDecision(p.timeline[0]).shotId,inspectStoredShotDecision(p.timeline[1]).shotId);
 const twice=act(act(act(p,'pin'),'pin'),'pin'),id=inspectStoredShotDecision(twice.timeline[1]).shotId;
 const active=activeTasteEvidence(twice.human_taste_memory,{shot:id});assert.equal(active.length,1);
 assert.equal(applyTastePriors([{id:'a'}],twice.human_taste_memory,{shot:id})[0].tastePrior,.1);
});


test('an exclusion can be removed after its source was replaced, without replacing the new footage',()=>{
 const banned=act(project(),'ban'),changed=recut(banned),shot=changed.timeline[1];assert.notEqual(shot.media_id,'a');
 const result=patch(changed,{shotIndex:1,inspector:inspectStoredShotDecision(shot),action:'unban',targetMediaId:'a',operator:'fixture',rationale:'Release earlier exclusion',at:'2026-01-02'});
 assert.deepEqual(result.timeline[1].mediaConstraints.bans,[]);assert.equal(result.timeline[1].media_id,shot.media_id);
});
