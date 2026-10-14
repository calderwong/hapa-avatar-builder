import test from 'node:test';
import assert from 'node:assert/strict';
import {createEchoLivingLightCue,editEchoLivingLightCues,createEchoLivingLightEditHistory} from '../src/domain/echo-living-light-editor.js';
function journey(id='one',durationUs=20e6){return {journeyId:'journey:'+id,revisionId:'rev:1',songId:'song:one',sourceBindingRef:null,schedule:[{instanceId:'location',startUs:0,endUs:durationUs}],mediaSlots:[{mediaRef:'fixture-'+id}]};}
const journeys=[journey(),journey('two'),journey('short',4e6)],resolveJourney=ref=>journeys.find(j=>j.journeyId===ref.journeyId&&j.revisionId===ref.revisionId);
const make=(overrides={})=>createEchoLivingLightCue({journey:journeys[0],cueId:'cue:one',startUs:0,journeyWindow:{startUs:0,endUs:6e6},...overrides});
const project=cues=>({song_id:'song:one',duration:24,living_light_cues:cues,timeline:[{media_id:'preserved'}]});
const edit=(p,a,opts={})=>editEchoLivingLightCues(p,a,{resolveJourney,...opts});
const rejects=(fn,code)=>assert.throws(fn,error=>error.code===code);
test('insert, move, trim and remove preserve source recipes and unrelated project state',()=>{
 const p=project([]),before=structuredClone(p),source=structuredClone(journeys);
 let cues=edit(p,{type:'insert',cue:make()});assert.equal(cues.length,1);
 cues=edit(project(cues),{type:'move',cueId:'cue:one',startUs:8e6});assert.deepEqual(cues[0].window,{startUs:8e6,endUs:14e6});
 cues=edit(project(cues),{type:'window',cueId:'cue:one',journeyWindow:{startUs:10e6,endUs:18e6}});assert.deepEqual(cues[0].window,{startUs:8e6,endUs:16e6});
 assert.deepEqual(edit(project(cues),{type:'remove',cueId:'cue:one'}),[]);assert.deepEqual(p,before);assert.deepEqual(journeys,source);
});
test('timing and Journey locks are independent and require an explicit unlock',()=>{
 let cues=[make()];cues=edit(project(cues),{type:'lock',cueId:'cue:one',lock:'timing',value:true});
 rejects(()=>edit(project(cues),{type:'move',cueId:'cue:one',startUs:1e6}),'living_light_cue_locked');
 cues=edit(project(cues),{type:'swap',cueId:'cue:one',journey:journeys[1]});assert.equal(cues[0].journeyRef.journeyId,'journey:two');assert.deepEqual(cues[0].window,{startUs:0,endUs:6e6});
 rejects(()=>edit(project(cues),{type:'swap',cueId:'cue:one',journey:journeys[1],journeyWindow:{startUs:0,endUs:8e6}}),'living_light_cue_locked');
 cues=edit(project(cues),{type:'lock',cueId:'cue:one',lock:'journey',value:true});rejects(()=>edit(project(cues),{type:'swap',cueId:'cue:one',journey:journeys[0]}),'living_light_cue_locked');rejects(()=>edit(project(cues),{type:'remove',cueId:'cue:one'}),'living_light_cue_locked');
 cues=edit(project(cues),{type:'lock',cueId:'cue:one',lock:'timing',value:false});cues=edit(project(cues),{type:'move',cueId:'cue:one',startUs:2e6});assert.equal(cues[0].window.startUs,2e6);
});
test('incompatible swaps refuse atomically and preserve original media/scene selection',()=>{
 const p=project([make()]),before=structuredClone(p);
 rejects(()=>edit(p,{type:'swap',cueId:'cue:one',journey:journeys[2]}),'living_light_journey_window');
 rejects(()=>edit(p,{type:'move',cueId:'cue:one',startUs:23e6}),'living_light_cue_duration');
 rejects(()=>edit(p,{type:'insert',cue:make({cueId:'cue:two'})}),'living_light_cue_overlap');assert.deepEqual(p,before);
});
test('undo and redo restore each complete cue action while unrelated edits survive',()=>{
 const initial=[make()],h=createEchoLivingLightEditHistory(initial),p=project(initial);
 const swapped=edit(p,{type:'swap',cueId:'cue:one',journey:journeys[1]});h.commit(initial,swapped);
 const concurrent={...p,timeline:[{media_id:'new-unrelated-media'}],living_light_cues:swapped};
 const restored={...concurrent,living_light_cues:h.undo(concurrent.living_light_cues)};
 assert.deepEqual(restored.living_light_cues,initial);assert.equal(restored.timeline[0].media_id,'new-unrelated-media');assert.deepEqual(h.redo(initial),swapped);
});
test('stale edits and stale undo refuse instead of overwriting another cue change',()=>{
 const initial=[make()],h=createEchoLivingLightEditHistory(initial),changed=edit(project(initial),{type:'move',cueId:'cue:one',startUs:2e6});
 rejects(()=>edit(project(changed),{type:'remove',cueId:'cue:one'},{expectedCues:initial}),'living_light_edit_conflict');rejects(()=>h.undo(changed),'living_light_edit_conflict');
});
test('unavailable source cues remain removable without a replacement or title lookup',()=>{
 const missing=make();missing.journeyRef.revisionId='gone';
 assert.deepEqual(edit(project([missing]),{type:'remove',cueId:'cue:one'}),[]);
 rejects(()=>edit(project([missing]),{type:'move',cueId:'cue:one',startUs:2e6}),'living_light_journey_unavailable');
});
