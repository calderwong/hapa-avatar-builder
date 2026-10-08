import test from 'node:test';
import assert from 'node:assert/strict';
import {createLivingLightStillCache,livingLightThingStudy,livingLightSavedStudyTarget} from '../src/domain/living-light-stills.js';
import {createLivingLightRegistry} from '../src/living-light/registry.js';
import {createNativeNamespace} from '../src/living-light/native.generated.js';
import {createLivingLightRuntime} from '../src/living-light/runtime.js';
import {compileLivingLightNativeTour} from '../src/domain/living-light-native-tour.js';
import {editableJourney} from '../src/domain/living-light-journey.js';
const registry=createLivingLightRegistry(),n=createNativeNamespace(),png='data:image/png;base64,AAAA';
const study=thing=>livingLightThingStudy({thing,registry,songId:'fixture:song',durationUs:20000000});
test('all 50 exact source references compile in neutral authored framing, retaining Halo identity and passage context',()=>{
 const before=structuredClone(registry.entries);
 for(const thing of registry.entries){const reference=study(thing);assert.deepEqual(reference.target,{kind:'thing',id:thing.thingId,revision:thing.revisionId});assert.equal(reference.referenceTimeUs,10000000);assert(reference.journey.instances.every(i=>!Object.keys(i.bindings).length&&!Object.keys(i.parameters).length));if(reference.journey.mode==='tour'){const compiled=compileLivingLightNativeTour(reference.journey,{registry,native:n,durationUs:20000000});const target=compiled.evidence.find(row=>row.instanceId==='reference');assert.deepEqual(target.thingRef,{thingId:thing.thingId,revisionId:thing.revisionId});if(thing.capabilities.bridge){assert.equal(compiled.passages.bridges[0].style,thing.source.moduleId);assert(reference.context.includes('Solar Reliquary'));assert.equal(compiled.passages.bridges[0].start,5);assert.equal(compiled.passages.bridges[0].arrival,15);}}}
 assert.deepEqual(registry.entries,before);assert.equal(registry.entries.length,50);assert.throws(()=>livingLightThingStudy({thing:registry.entries.find(t=>t.capabilities.bridge),registry,songId:'fixture:song',durationUs:2}));
});
test('saved study identity refuses edited defaults, title, timing and unsaved content',()=>{
 const saved=study(registry.entries[0]).journey,draft=editableJourney(saved);
 assert.deepEqual(livingLightSavedStudyTarget(draft,saved),{kind:'journey',id:saved.journeyId,revision:saved.revisionId});
 for(const mutate of [x=>x.title='Unsaved',x=>x.seed++,x=>x.instances[0].parameters.speed=2,x=>x.schedule[0].endUs--]){const next=structuredClone(draft);mutate(next);assert.equal(livingLightSavedStudyTarget(next,saved),null);}
 assert.equal(livingLightSavedStudyTarget(draft,null),null);
});
test('session cache bounds serialized images and receipts, evicts oldest revisions and isolates snapshots',()=>{
 const cache=createLivingLightStillCache({maxEntries:2,maxBytes:300,maxImageBytes:100}),target=(revision)=>({kind:'thing',id:'fixture:thing',revision}),capture={dataUrl:png,receipt:{visualUs:10,context:'Neutral'}};
 cache.put(target('r1'),capture);capture.receipt.visualUs=50;assert.equal(cache.get(target('r1')).receipt.visualUs,10);
 cache.put(target('r2'),capture);cache.put(target('r3'),capture);assert.equal(cache.get(target('r1')),null);assert(cache.get(target('r2')));assert(cache.diagnostics().bytes<=300);
 const row=cache.get(target('r3'));row.receipt.context='Changed';assert.equal(cache.get(target('r3')).receipt.context,'Neutral');assert.equal(cache.get(target('unknown')),null);
 assert.throws(()=>cache.put(target('r4'),{dataUrl:'https://example.org/image.png',receipt:{}}));assert.throws(()=>cache.put(target('r4'),{dataUrl:png,receipt:{large:'x'.repeat(1000)}}));assert.equal(cache.diagnostics().entries,2);
 cache.clear();assert.equal(cache.diagnostics().bytes,0);assert.equal(cache.get(target('r3')),null);
});
test('capture requires a current painted frame, rejects hidden/stale frames, preserves held time and releases the CPU canvas',()=>{
 const native={...createNativeNamespace()};let closed=0,copied=0;const outputs=[];
 native.HapaRenderer=class{constructor(){Object.assign(this,{programs:{},buffers:[],vaos:[],targets:[],environment:{backend:'fixture'}});}render(){}resize(){}dispose(){closed++;}};
 native.HapaPassageRenderer=native.HapaGeometryDanceVisuals=native.HapaJourneyVisuals=()=>{};
 const runtime=createLivingLightRuntime({canvas:{},registry,nativeFactory:()=>native,stillCanvasFactory:()=>{const output={getContext:()=>({drawImage:()=>copied++}),toDataURL:()=>png};outputs.push(output);return output;}}),journey=study(registry.entries.find(t=>t.capabilities.continuous)).journey;
 runtime.prepare({journeyRevision:journey,sourceBinding:{songId:journey.songId,durationUs:20000000},generation:1,neutralStudy:true});assert.throws(()=>runtime.captureStill());
 const frame=runtime.evaluate({timelineUs:3000000});runtime.render(frame);const result=runtime.captureStill();assert.equal(result.receipt.visualUs,3000000);assert.deepEqual(result.receipt.recipe,journey);assert.equal(outputs[0].width,0);assert.equal(outputs[0].height,0);
 runtime.evaluate({timelineUs:4000000,reducedMotion:true});const reference=runtime.captureReferenceStill({timelineUs:10000000});assert.equal(reference.receipt.visualUs,10000000);assert.equal(runtime.evaluate({timelineUs:5000000,reducedMotion:true}).visualUs,3000000);
 runtime.suspend();assert.throws(()=>runtime.captureStill());runtime.restore();assert.throws(()=>runtime.captureStill());assert.throws(()=>runtime.render(frame));runtime.render(runtime.evaluate({timelineUs:0}));runtime.captureStill();
 runtime.dispose();assert.throws(()=>runtime.captureStill());assert.equal(closed,2);assert.equal(copied,3);assert(outputs.every(output=>output.width===0&&output.height===0));
});
