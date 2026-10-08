import test from 'node:test';
import assert from 'node:assert/strict';
import {validateThing,validateJourney,validateNote,canonicalJSON} from '../src/domain/living-light-contracts.js';
import {createLivingLightRegistry,IMPLEMENTATIONS} from '../src/living-light/registry.js';
import {admitLivingLightFeatures,validateSourceBinding,livingLightStemDeclarations} from '../src/domain/living-light-source-binding.js';
const registry=createLivingLightRegistry(),original=registry.entries[0],ref={thingId:original.thingId,revisionId:original.revisionId};
const journey=()=>({schemaVersion:'hapa.living-light.journey.v1',journeyId:'fixture:journey',revisionId:'fixture:r1',parentRevisionId:null,title:'Pinned independent uses',songId:'song:exact',sourceBindingRef:null,state:'draft-unresolved',mode:'continuous',seed:109,instances:[{instanceId:'use:first',thingRef:{...ref},parameters:{speed:.5},bindings:{}},{instanceId:'use:second',thingRef:{...ref},parameters:{speed:1.5},bindings:{}}],schedule:[{instanceId:'use:first',startUs:0,endUs:1000000},{instanceId:'use:second',startUs:1000000,endUs:2000000}],actorTreatment:'none',mediaSlots:[]});
const validate=j=>validateJourney(j,{resolveThing:registry.resolveThing,durationUs:2000000});
test('actual catalog identities preserve the alias and corridor outside modular destination inventory',()=>{
 assert.equal(registry.entries.length,50);const halo=registry.entries.find(t=>t.source.moduleId==='halo-vault');
 assert.deepEqual(halo.aliasOf,{thingId:'ll109:location:destination:lumen-arcade',revisionId:'ll109-source-r1'});
 assert.notEqual(halo.thingId,halo.aliasOf.thingId);assert.equal(registry.corridorDependency,'breathline-weave');assert(!registry.entries.some(t=>t.source.moduleId==='breathline-weave'));
 for(const thing of registry.entries){assert.match(thing.thingId,/^ll109:/);validateThing(thing,{implementations:IMPLEMENTATIONS});}
});
test('unknown versions, executable renderer fields, malformed control types and nonfinite values fail closed',()=>{
 const mutations=[t=>t.schemaVersion='hapa.living-light.thing.v99',t=>t.rendererRef.implementationId='https://example.invalid/renderer.js',t=>t.rendererRef.code='run()',t=>t.rendererRef.implementationVersion='unknown',t=>t.parameters.speed.default=Infinity,t=>t.parameters.speed.type='function',t=>t.parameters.speed.default=3,t=>t.thingId='title with spaces'];
 for(const mutate of mutations){const thing=structuredClone(original);mutate(thing);assert.throws(()=>validateThing(thing,{implementations:IMPLEMENTATIONS}));}
});
test('pinned repeated uses have independent settings; unknown revisions and broken schedules reject without mutation',()=>{
 const j=journey(),before=canonicalJSON(j);validate(j);assert.equal(canonicalJSON(j),before);
 assert.notEqual(j.instances[0].instanceId,j.instances[1].instanceId);assert.deepEqual(j.instances.map(i=>i.parameters.speed),[.5,1.5]);
 for(const mutate of [x=>x.instances[0].thingRef.revisionId='unknown',x=>x.schedule[1].startUs=1500000,x=>x.schedule[1].endUs=Infinity,x=>x.instances[1].instanceId='use:first',x=>x.actorTreatment='unknown',x=>x.instances[0].bindings.energy={source:'master',feature:'energy',onUnavailable:'guess'}]){
  const bad=structuredClone(j);mutate(bad);const bytes=canonicalJSONOrInvalid(bad);assert.throws(()=>validate(bad));assert.equal(canonicalJSONOrInvalid(bad),bytes);
 }
 function canonicalJSONOrInvalid(value){return JSON.stringify(value);}
});
function note(){return {schemaVersion:'hapa.living-light.note.v1',noteId:'note:exact',revisionId:'note:r1',parentRevisionId:null,target:{kind:'thing',thingId:ref.thingId,observedRevisionId:ref.revisionId},body:'<script>inert discussion text</script>',actor:{actorId:'agent:fixture',kind:'agent',displayName:'Fixture agent',instanceId:'fixture:instance'},createdAt:'2026-10-07T00:00:00Z',editedAt:'2026-10-07T00:00:00Z',eventType:'created'};}
test('note attribution is explicit and never defaults to human; exact cue targets reject invalid ranges',()=>{
 const n=note();validateNote(n);assert.equal(n.actor.kind,'agent');assert.match(n.body,/<script>/);
 for(const mutate of [x=>delete x.actor,x=>delete x.actor.kind,x=>x.actor.kind='unknown',x=>x.schemaVersion='v99',x=>x.actor.instanceId='invalid space']){const bad=note();mutate(bad);assert.throws(()=>validateNote(bad));}
 const cue=note();cue.target={kind:'instance',journeyId:'fixture:journey',observedRevisionId:'fixture:r1',instanceId:'use:first',sourceBindingRevisionId:'binding:r1',startUs:100000,endUs:300000};validateNote(cue);cue.target.endUs=cue.target.startUs;assert.throws(()=>validateNote(cue));
});
const hash='a'.repeat(64),pcm='b'.repeat(64);
function source(){return {schemaVersion:'hapa.living-light.source-binding.v1',bindingId:'binding:exact',revisionId:'binding:r1',songId:'song:exact',state:'decoded',master:{sourceHash:hash,decoded:{digest:pcm,sampleRate:24000,frameCount:48000,durationSeconds:2}},stems:[]};}
function features(){return {schemaVersion:'hapa.living-light.features.v1',songId:'song:exact',sourceHash:hash,decodedDigest:pcm,durationUs:2000000,configDigest:'c'.repeat(64),extractor:{id:'fixture',version:'1'},features:[{name:'energy',units:'normalized',range:[0,1],sampleRateHz:30,originUs:0,interpolation:'linear',availability:'silent',compatibility:'transformed',transformation:{version:'fixture-rms-1'},values:[0,0,0]}]};}
test('signals require exact song/source/decoded revision and finite declared semantics; RMS cannot become exact onset',()=>{
 admitLivingLightFeatures(features(),source());
 for(const mutate of [f=>f.schemaVersion='v99',f=>f.songId='same-title-wrong-id',f=>f.sourceHash=pcm,f=>f.decodedDigest=hash,f=>f.durationUs=183024000,f=>f.features[0].values[0]=NaN,f=>{f.features[0].name='onset';f.features[0].derivedFrom='rms';f.features[0].compatibility='exact-compatible';}]){const bad=features();mutate(bad);assert.throws(()=>admitLivingLightFeatures(bad,source()));}
});
test('source mapping never stretches or infers synchronization; archive filtering preserves original fallback IDs',()=>{
 const s=source();s.stems=[{assetId:'asset:exact',state:'available',timeMap:[{songStartUs:100000,songEndUs:1100000,sourceStartUs:0,sourceEndUs:1000000}]}];assert.throws(()=>validateSourceBinding(s));
 s.stems[0].alignmentState='verified';s.stems[0].alignmentEvidenceRef='atlas:exact-owner-receipt';validateSourceBinding(s);s.stems[0].timeMap[0].sourceEndUs=1100000;assert.throws(()=>validateSourceBinding(s));
 assert.deepEqual(livingLightStemDeclarations({id:'song:exact',stems:[{kind:'archive-zip'},{stemType:'Guitar'}]}).map(x=>x.assetId),['song:exact:declared:1']);
});
