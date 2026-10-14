import test from 'node:test';
import assert from 'node:assert/strict';
import {createEchoLivingLightPreview} from '../src/living-light/director-preview.js';
import {createEchoLivingLightCue} from '../src/domain/echo-living-light-editor.js';
const recipe=(id='one')=>({journeyId:'journey:'+id,revisionId:'revision:1',songId:'song:1',sourceBindingRef:null,schedule:[{instanceId:'a',startUs:0,endUs:2e6}],instances:[],mediaSlots:[]});
const cue=(id,startUs=1e6)=>createEchoLivingLightCue({journey:recipe(id),cueId:'cue:'+id,startUs});
const flush=async()=>{for(let i=0;i<10;i++)await Promise.resolve();};
function fixture(cues=[cue('one')],extra={}){
 const states=[],prepared=[],frames=[],dead=[],live=new Set(),requests=[];let invalidations=0;
 const host=createEchoLivingLightPreview({canvas:{},cues,songId:'song:1',durationUs:10e6,resolveJourney:async ref=>{requests.push(ref);return recipe(ref.journeyId.split(':')[1]);},resolveRegistry:async()=>({}),onState:s=>states.push(s),onInvalidate:()=>invalidations++,runtimeFactory:()=>{const id=live.size;live.add(id);return {prepare:p=>prepared.push(p),evaluate:p=>({...p,visualUs:p.timelineUs,generation:1}),render:p=>{frames.push(p);return true;},diagnostics:()=>({generation:2,features:'unavailable',media:[]}),suspend(){},restore(){},dispose(){dead.push(id);live.delete(id);}};},...extra});
 return {host,states,prepared,frames,dead,live,requests,get invalidations(){return invalidations;}};
}
test('same song clock selects half-open cues, preserves Journey offset and prefetched exact references',async()=>{
 const f=fixture([cue('one'),cue('two',5e6)]);
 assert.equal(f.host.evaluate({timelineUs:0}),null);await flush();assert.equal(f.requests.length,1);assert.equal(f.live.size,0);
 const packet=f.host.evaluate({timelineUs:1500000,playing:true});assert.equal(packet.timelineUs,500000);assert.equal(packet.signalTimelineUs,1500000);assert.equal(packet.directorSongUs,1500000);assert.equal(f.host.render(packet),true);assert.equal(f.prepared[0].sourceBinding.durationUs,10e6);assert.equal(f.prepared[0].journeyDurationUs,2e6);
 await flush();assert.equal(f.requests.length,2);assert.equal(f.live.size,1);assert.equal(f.host.evaluate({timelineUs:3e6}),null);assert.equal(f.live.size,0);assert.equal(f.states.at(-1).state,'inactive');
 f.host.render(f.host.evaluate({timelineUs:5e6}));assert.equal(f.frames.at(-1).timelineUs,0);assert.equal(f.live.size,1);assert.equal(f.host.render(packet),false);f.host.dispose();assert.equal(f.live.size,0);assert.equal(f.host.diagnostics().retainedRecipes,0);
});
test('backward seeks cancel obsolete resolutions and never paint another cue or latest revision',async()=>{
 let release;const first=recipe('one');const f=fixture([cue('one'),cue('two',5e6)],{resolveJourney:async ref=>ref.journeyId===first.journeyId?new Promise(r=>release=r):recipe('two')});
 f.host.evaluate({timelineUs:1e6});await flush();f.host.evaluate({timelineUs:5e6});assert.equal(f.host.diagnostics().retainedRecipes,1);release(first);await flush();assert.equal(f.host.diagnostics().retainedRecipes,1);assert.equal(f.prepared.length,1);
 const packet=f.host.evaluate({timelineUs:5e6});f.host.render(packet);assert.equal(f.prepared[0].journeyRevision.journeyId,'journey:two');f.host.dispose();
 const wrong=fixture(undefined,{resolveJourney:async()=>({...first,revisionId:'latest'})});wrong.host.evaluate({timelineUs:1e6});await flush();assert.equal(wrong.host.evaluate({timelineUs:1e6}),null);assert.match(wrong.states.at(-1).message,/exact saved/);assert.equal(wrong.live.size,0);wrong.host.dispose();
});
test('failed native preparation is visible, bounded and cleaned up; disposal cancels late reads',async()=>{
 const f=fixture(undefined,{prepareInput:()=>{throw Error('Missing exact source');}});f.host.evaluate({timelineUs:1e6});await flush();f.host.evaluate({timelineUs:1e6});assert.equal(f.states.at(-1).state,'unavailable');assert.match(f.states.at(-1).message,/Missing exact/);for(let i=0;i<10;i++)f.host.evaluate({timelineUs:1e6});assert.equal(f.prepared.length,0);assert.equal(f.requests.length,1);f.host.dispose();
 let release,signal;const delayed=fixture(undefined,{resolveJourney:async(_,options)=>{signal=options.signal;return new Promise(r=>release=r);}});delayed.host.evaluate({timelineUs:1e6});await flush();delayed.host.dispose();release(recipe());await flush();assert(signal.aborted);assert.equal(delayed.invalidations,0);assert.equal(delayed.live.size,0);
});
test('one revision shared by cues still validates each source window and resumes after suspension',async()=>{
 const a=cue('one'),b={...cue('one',5e6),cueId:'cue:two',journeyWindow:{startUs:2e6,endUs:4e6}};const f=fixture([a,b]);f.host.evaluate({timelineUs:1e6});await flush();f.host.render(f.host.evaluate({timelineUs:1e6}));f.host.suspend();assert.equal(f.host.evaluate({timelineUs:2e6}),null);f.host.restore();assert(f.host.evaluate({timelineUs:2e6}));assert.equal(f.host.evaluate({timelineUs:5e6}),null);assert.match(f.states.at(-1).message,/beyond/);assert(f.host.evaluate({timelineUs:1e6}));f.host.dispose();
});

test('a native draw failure releases graphics and does not repeatedly recreate the failed renderer',async()=>{
 let created=0,disposed=0;const f=fixture(undefined,{runtimeFactory:()=>{created++;return {prepare(){},evaluate:p=>({...p,directorCueId:'cue:one'}),render(){throw Error('GPU refused draw');},dispose(){disposed++;}};}});
 f.host.evaluate({timelineUs:1e6});await flush();const packet=f.host.evaluate({timelineUs:1e6});assert.equal(f.host.render(packet),false);for(let i=0;i<10;i++)assert.equal(f.host.evaluate({timelineUs:1e6}),null);assert.equal(created,1);assert.equal(disposed,1);assert.match(f.states.at(-1).message,/GPU refused/);f.host.dispose();
});
