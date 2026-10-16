import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createLivingLightRegistry} from '../src/living-light/registry.js';
import {newJourneyDraft,editJourneyDraft,validateDraft,editableJourney} from '../src/domain/living-light-journey.js';
import {createLivingLightService} from '../server/living-light-service.mjs';
import {normalizeEchoRecordSummaryRows} from '../src/domain/echo-record-garden.js';
import {LIVING_LIGHT_DESTINATION_SCHEMA as schemaVersion,livingLightRecordDestination,livingLightDestinationAvailability,validateLivingLightDestination,livingLightNavigationMap,createLivingLightExplorer} from '../src/domain/living-light-navigation.js';
const registry=createLivingLightRegistry(),ref=thing=>({thingId:thing.thingId,revisionId:thing.revisionId}),thing=id=>registry.entries.find(t=>t.source.moduleId===id);
const record=normalizeEchoRecordSummaryRows([{song_id:'song:record',song_title:'Album record',duration:60,updated_at:'revision:one',record_preview:{latestCutId:'cut:one',cutFingerprint:'declared-cut-one'}}])[0],target=livingLightRecordDestination(record);
function route(){let draft=newJourneyDraft({songId:'song:one',title:'Album route',durationUs:60e6,thing:thing('solar-reliquary'),mode:'tour'},registry);for(const [location,bridge] of [['tidal-observatory','fractal-loom'],['resonance-vault','silken-current']])draft=editJourneyDraft(draft,{type:'add',thingRef:ref(thing(location)),bridgeRef:ref(thing(bridge))},registry);return draft;}
test('Record Garden declaration pin survives key ordering but rejects changed owner data and title substitutes',()=>{
 assert.equal(livingLightDestinationAvailability(target,{records:[record]}).state,'available');
 const reordered={ref:{sourceRevision:target.ref.sourceRevision,cutId:target.ref.cutId,songId:target.ref.songId},kind:'record',schemaVersion};assert.equal(livingLightDestinationAvailability(reordered,{records:[record]}).state,'available');
 for(const value of [{...record,songId:'other'},{...record,source:{...record.source,revisionId:'new'}}])assert.equal(livingLightDestinationAvailability(target,{records:[value]}).state,'unavailable');
 assert.equal(livingLightDestinationAvailability(target,{records:[{...record,preview:{...record.preview,latestCutId:'other'}}]}).state,'pinned-cut-unresolved');
 assert.equal(livingLightRecordDestination({...record,source:{},preview:{}}),null);
});
test('destination validation rejects URLs, extra fields and use on a tunnel; locked Location rejects target change',()=>{
 for(const bad of [{...target,url:'https://bad'},{...target,ref:{...target.ref,sourceRevision:'latest'}},{schemaVersion,kind:'web',ref:{url:'/'}},{schemaVersion,kind:'card',ref:{kind:'thing',id:'../bad',revision:'r'}}])assert.throws(()=>validateLivingLightDestination(bad));
 const original=route(),id=original.instances[0].instanceId;let next=editJourneyDraft(original,{type:'destination',instanceId:id,destination:target},registry);assert.equal(original.instances[0].destination,undefined);const locked=editJourneyDraft(next,{type:'lock',instanceId:id,value:true},registry);assert.throws(()=>editJourneyDraft(locked,{type:'destination',instanceId:id,destination:null},registry),/Unlock/);assert.deepEqual(locked.instances[0].destination,target);
 assert.throws(()=>editJourneyDraft(original,{type:'destination',instanceId:original.schedule[1].instanceId,destination:target},registry),/Only Locations/);
 const swapped=editJourneyDraft(next,{type:'replace',instanceId:id,thingRef:ref(thing('resonance-vault'))},registry);assert.deepEqual(swapped.instances[0].destination,target);validateDraft(swapped,registry,60e6);
});
test('three Location map uses two original bridges; missing refs and dangling destinations refuse',()=>{
 const draft=route(),map=livingLightNavigationMap(draft,registry);assert.equal(map.locations.length,3);assert.equal(map.edges.length,2);assert.deepEqual(map.edges.map(row=>row.title),[thing('fractal-loom').title,thing('silken-current').title]);
 const bad=structuredClone(draft);bad.schedule[1].toInstanceId='missing';assert.throws(()=>livingLightNavigationMap(bad,registry),/missing endpoints/);bad.schedule[1].toInstanceId=draft.schedule[1].toInstanceId;bad.instances[0].thingRef.revisionId='latest';assert.throws(()=>livingLightNavigationMap(bad,registry),/revision/);
 for(const span of [3999999,60000001]){const invalid=structuredClone(draft);invalid.schedule[1].endUs=invalid.schedule[1].startUs+span;assert.throws(()=>livingLightNavigationMap(invalid,registry),/unsupported duration/);}
 const unsupported={resolveThing:reference=>{const value=registry.resolveThing(reference);return value?.capabilities.bridge?{...value,capabilities:{}}:value;}};
 assert.throws(()=>livingLightNavigationMap(draft,unsupported),/unsupported passage/);
});
test('Explore travels full passages, holds without elapsed drift, returns exact bookmark and never edits the route',()=>{
 const draft=route(),before=structuredClone(draft),map=livingLightNavigationMap(draft,registry),bookmark={songId:'song:one',cutId:'cut:one',timeSeconds:17.3};let clock=0;const explorer=createLivingLightExplorer(map,{now:()=>clock,bookmark});
 assert.equal(explorer.sample().timelineUs,0);explorer.travel(map.locations[1].id);clock=2000;assert.equal(explorer.sample().timelineUs,map.edges[0].startUs+2e6);explorer.hold(true);clock=9000;assert.equal(explorer.sample().timelineUs,map.edges[0].startUs+2e6);explorer.hold(false);clock=15000;assert.equal(explorer.sample().locationId,map.locations[1].id);assert.equal(explorer.sample().traveling,false);
 explorer.travel(map.locations[2].id);clock=23000;assert.equal(explorer.sample().locationId,map.locations[2].id);assert.equal(explorer.back().locationId,map.locations[1].id);assert.equal(explorer.home().locationId,map.home);assert.deepEqual(explorer.end(),bookmark);assert.throws(()=>explorer.sample(),/ended/);assert.deepEqual(draft,before);
});
test('reduced travel jumps to arrival, stop cancels a passage, arbitrary direct navigation is explicit and history bounded',()=>{
 const map=livingLightNavigationMap(route(),registry),explorer=createLivingLightExplorer(map,{now:()=>0});assert.throws(()=>explorer.travel(map.locations[2].id),/connected/);assert.equal(explorer.travel(map.locations[1].id,{reducedMotion:true}).timelineUs,map.locations[1].startUs);explorer.travel(map.locations[2].id);assert.equal(explorer.stop().locationId,map.locations[1].id);for(let i=0;i<80;i++)explorer.jump(map.locations[i%3].id);assert(explorer.diagnostics().historyCount<=50);assert.throws(()=>explorer.jump('unknown'),/existing/);explorer.end();
});
test('native owner saves destination pins, reopens old revisions and keeps CAS; import reports unresolved external owners',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'ll-navigation-')),actor={mode:'authenticated-api',actor:{actorId:'agent:fixture',kind:'agent',displayName:'Fixture'}};let service=createLivingLightService({root,registry,resolveSong:async id=>({id})});
 try{let draft=route();draft=editJourneyDraft(draft,{type:'destination',instanceId:draft.instances[0].instanceId,destination:target},registry);const saved=await service.saveJourney({journey:draft,expectedRevision:null,idempotencyKey:'navigation:first'},actor);
  const packet=service.exportPackage({kind:'journey',id:saved.journey.journeyId,revision:saved.currentHead}).package,preview=await service.importPreview(packet);assert.equal(preview.canCommit,false);assert(preview.unresolved.some(row=>row.code==='portable_navigation_targets_unresolved'));
  const next=editJourneyDraft(editableJourney(saved.journey),{type:'destination',instanceId:draft.instances[0].instanceId,destination:null},registry);await service.saveJourney({journeyId:saved.journey.journeyId,journey:next,expectedRevision:saved.currentHead,idempotencyKey:'navigation:next'},actor);
  await assert.rejects(service.saveJourney({journeyId:saved.journey.journeyId,journey:draft,expectedRevision:saved.currentHead,idempotencyKey:'navigation:stale'},actor),error=>error.code==='revision_conflict');
  service.close();service=createLivingLightService({root,registry,resolveSong:async id=>({id})});assert.deepEqual(service.journey(saved.journey.journeyId,saved.currentHead).journey.instances[0].destination,target);assert.equal(service.journey(saved.journey.journeyId).journey.instances[0].destination,undefined);
 }finally{service.close();await fs.rm(root,{recursive:true,force:true});}
});

test('Follow Director maps half-open visual time to Locations and complete tunnels without extrapolation',async()=>{
 const {livingLightNavigationAt}=await import('../src/domain/living-light-navigation.js');
 const map={locations:[{id:'a',startUs:0,endUs:6e6},{id:'b',startUs:14e6,endUs:20e6}],edges:[{from:'a',to:'b',startUs:6e6,endUs:14e6}]};
 assert.equal(livingLightNavigationAt(map,-1),null);assert.equal(livingLightNavigationAt(map,NaN),null);
 assert.deepEqual(livingLightNavigationAt(map,5999999),{locationId:'a',timelineUs:5999999,traveling:false});
 assert.deepEqual(livingLightNavigationAt(map,6e6),{locationId:'a',to:'b',timelineUs:6e6,traveling:true});
 assert.equal(livingLightNavigationAt(map,14e6).locationId,'b');assert.equal(livingLightNavigationAt(map,14e6).traveling,false);assert.equal(livingLightNavigationAt(map,20e6),null);
});
