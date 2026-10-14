import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {livingLightCutMedia,livingLightMediaKey,livingLightMediaTime,LIVING_LIGHT_MEDIA_SCHEMA} from '../src/domain/living-light-media.js';
import {newJourneyDraft,editJourneyDraft,validateDraft} from '../src/domain/living-light-journey.js';
import {createLivingLightRegistry} from '../src/living-light/registry.js';
import {createLivingLightService} from '../server/living-light-service.mjs';
import {installLivingLightMedia} from '../src/living-light/media-surfaces.js';
const registry=createLivingLightRegistry(),thing=registry.entries.find(t=>t.capabilities.continuous);
const project={song_id:'song:one',active_direction_script_variant:{id:'cut:one'},timeline:[{id:'shot:a',media_id:'media:a',media_title:'Same title',media_uri:'/media/a.mp4'},{id:'shot:b',media_id:'media:b',media_title:'Same title',media_uri:'/media/b.mp4'}]},sources=livingLightCutMedia(project);
const draft=()=>newJourneyDraft({songId:'song:one',title:'Painted journey',durationUs:20000000,thing},registry);
const placement=(recipe,surface='wall-left',source=sources[0])=>({schemaVersion:LIVING_LIGHT_MEDIA_SCHEMA,enabled:true,surfaceRef:{instanceId:recipe.instances[0].instanceId,surfaceId:surface},mediaRef:source.ref,trim:{inUs:1000000,outUs:4000000},loopPolicy:'loop',brightness:.9});
const paint=(d,p=placement(d))=>editJourneyDraft(d,{type:'media',instanceId:p.surfaceRef.instanceId,surfaceId:p.surfaceRef.surfaceId,placement:p},registry);
test('source identities distinguish title collisions, cuts and replacements; URIs stay transient',()=>{
 assert.notEqual(livingLightMediaKey(sources[0].ref),livingLightMediaKey(sources[1].ref));
 for(const p of [{...project,active_direction_script_variant:{id:'cut:two'}},{...project,timeline:[{...project.timeline[0],media_uri:'/media/changed.mp4'}]}])assert.notEqual(livingLightMediaKey(sources[0].ref),livingLightMediaKey(livingLightCutMedia(p)[0].ref));
 assert.equal(livingLightCutMedia({...project,timeline:[{...project.timeline[0],media_uri:'/media/a.png'}]}).length,0);
 assert(!JSON.stringify(placement(draft())).includes('/media/'));
});
test('painting, swapping and removal preserve route, independent surfaces and locked uses',()=>{
 const original=draft(),first=paint(original),two=paint(first,placement(first,'wall-right',sources[1]));assert.equal(original.mediaSlots.length,0);assert.deepEqual(two.schedule,original.schedule);
 const swapped=paint(two,placement(two,'wall-left',sources[1]));assert.deepEqual(swapped.mediaSlots.find(s=>s.surfaceRef.surfaceId==='wall-right'),two.mediaSlots[1]);
 const locked=editJourneyDraft(two,{type:'lock',instanceId:two.instances[0].instanceId,value:true},registry);assert.throws(()=>paint(locked),/Unlock/);
 const removed=editJourneyDraft(two,{type:'media',instanceId:two.instances[0].instanceId,surfaceId:'wall-left',placement:null},registry);assert.equal(removed.mediaSlots.length,1);assert.deepEqual(removed.schedule,two.schedule);
});
test('contract rejects unknown fields, bad ranges, incompatible surfaces, duplicate keys and excess decoders',()=>{
 const d=draft(),p=placement(d);
 for(const change of [{uri:'https://untrusted.invalid/x'},{trim:{inUs:-1,outUs:null}},{trim:{inUs:3,outUs:2}},{mediaRef:{...p.mediaRef,songId:'other'}},{brightness:NaN},{loopPolicy:'auto'},{surfaceRef:{...p.surfaceRef,surfaceId:'unknown'}}])assert.throws(()=>paint(d,{...p,...change}));
 const duplicated={...d,mediaSlots:[p,{...p,surfaceRef:{surfaceId:'wall-left',instanceId:p.surfaceRef.instanceId}}]};assert.throws(()=>validateDraft(duplicated,registry),/only one/);
 const extended=editJourneyDraft(paint(d),{type:'duplicate',instanceId:d.instances[0].instanceId},registry);assert.equal(extended.mediaSlots.length,2);assert.equal(extended.mediaSlots[1].surfaceRef.instanceId,extended.instances[1].instanceId);
 assert.throws(()=>editJourneyDraft(paint(paint(d),placement(d,'wall-right')),{type:'duplicate',instanceId:d.instances[0].instanceId},registry),/two painted/);
});
test('source clock maps loop, held trim, backward seek and invalid decoder metadata',()=>{
 const d=draft(),p=placement(d),row={startUs:5000000,endUs:15000000};
 assert.equal(livingLightMediaTime(p,row,5000000,8),1);assert.equal(livingLightMediaTime(p,row,6500000,8),2.5);
 assert(livingLightMediaTime(p,row,9000000,8)<3);assert.equal(livingLightMediaTime({...p,loopPolicy:'hold'},row,9000000,8),3.94);
 assert.equal(livingLightMediaTime(p,row,5000000,8),1);
 for(const duration of [0,2,NaN,Infinity])assert.throws(()=>livingLightMediaTime(p,row,5000000,duration));
});
test('owner save/reopen retains painted references and revisions without rewriting old choices',async()=>{
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'ll-painted-')),actor={mode:'authenticated-api',actor:{actorId:'agent:test',kind:'agent',displayName:'Test'}},resolveSong=async()=>({id:'song:one'});let service=createLivingLightService({root,registry,resolveSong});
 try{const first=await service.saveJourney({journey:paint(draft()),expectedRevision:null,idempotencyKey:'media:first'},actor),changed=paint(first.journey,{...first.journey.mediaSlots[0],mediaRef:sources[1].ref});
 const {journeyId,revisionId,parentRevisionId,...authoring}=changed;
 await service.saveJourney({journeyId,journey:authoring,expectedRevision:revisionId,idempotencyKey:'media:second'},actor);service.close();service=createLivingLightService({root,registry,resolveSong});
 assert.deepEqual(service.journey(journeyId,revisionId).journey.mediaSlots,first.journey.mediaSlots);assert.deepEqual(service.journey(journeyId).journey.mediaSlots[0].mediaRef,sources[1].ref);
 }finally{service.close();await fs.rm(root,{recursive:true,force:true});}
});
function harness(supplied=sources,patch={}){
 const d=paint(draft()),events={},deleted=[],uploads=[],draws=[];Object.assign(d.mediaSlots[0],patch);let plays=0,pauses=0;
 const video={muted:false,paused:true,seeking:false,readyState:2,duration:8,videoWidth:640,videoHeight:360,_time:0,get currentTime(){return this._time;},set currentTime(t){this._time=t;this.seeking=true;},addEventListener(t,f){events[t]=f;},removeEventListener(t){delete events[t];},pause(){this.paused=true;pauses++;},play(){this.paused=false;plays++;return Promise.resolve();},load(){},remove(){},removeAttribute(){}};
 const gl=new Proxy({createTexture:()=>({id:'texture'}),deleteTexture:t=>deleted.push(t),texImage2D:()=>uploads.push(video.currentTime),drawArrays:()=>draws.push(1)}, {get:(o,k)=>k in o?o[k]:(/^[A-Z_0-9]+$/.test(k)?k:()=>{})});
 const renderer={gl,state:{_journey:true},scene:{},programs:{media:{p:{}}},quadVAO:{},drawCalls:0,drawScene:()=>({cam:{eye:[0,0,0],pv:[]},values:{}}),bind(){},texture(){}};
 const adapter=installLivingLightMedia({renderer,journey:d,sources:supplied,native:{HapaRenderer:{uniforms(){}},HapaMath:{model:()=>[]}},videoFactory:()=>video});
 return {adapter,video,events,deleted,uploads,draws,renderer,get plays(){return plays;},get pauses(){return pauses;},settle(){video.seeking=false;events.seeked?.();},frame(t,playing=false,reducedMotion=false){adapter.sync({visualUs:t,playing,reducedMotion});renderer.drawScene(t/1e6);}};
}
test('decoder follows paused seeks and reverse playback; stale frames never paint; suspension/disposal release owners',async()=>{
 const h=harness();try{h.events.loadeddata();h.frame(0);assert.equal(h.draws.length,0);h.settle();h.frame(0);assert.equal(h.draws.length,3);assert.equal(h.video.muted,true);assert.equal(h.video.volume,0);
 h.frame(2000000);assert.equal(h.draws.length,3);h.settle();h.frame(2000000);assert.equal(h.video.currentTime,3);
 h.frame(0,true);assert.equal(h.draws.length,6);h.settle();h.frame(0,true);assert.equal(h.video.currentTime,1);assert.equal(h.plays,1);
 h.adapter.suspend();assert.equal(h.video.paused,true);h.frame(1000000,true,true);assert.equal(h.video.paused,true);
 }finally{h.adapter.dispose();}assert.equal(h.deleted.length,1);assert.equal(Object.keys(h.events).length,0);h.adapter.dispose();assert.equal(h.deleted.length,1);
});
test('missing and failed clips stay explicit and cannot masquerade as painted frames',()=>{
 const missing=harness([]);try{missing.frame(0);assert.equal(missing.adapter.diagnostics()[0].status,'unresolved');assert.equal(missing.draws.length,0);}finally{missing.adapter.dispose();}
 const broken=harness();try{broken.events.error();broken.events.loadeddata();broken.frame(0);assert.equal(broken.adapter.diagnostics()[0].status,'error');assert.equal(broken.draws.length,0);}finally{broken.adapter.dispose();}
});

test('trim-end hold settles the shared terminal frame instead of holding the full clip end',()=>{
 const h=harness(sources,{loopPolicy:'hold'});try{h.events.loadeddata();h.video._time=4;h.video.paused=false;h.frame(6000000,true);assert.equal(h.video.paused,true);assert.equal(h.video.currentTime,3.94);assert.equal(h.draws.length,0);h.settle();h.frame(6000000,true);assert.equal(h.draws.length,3);assert.equal(h.plays,0);}finally{h.adapter.dispose();}
});
