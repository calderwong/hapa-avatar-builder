import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {createLivingLightRegistry} from '../src/living-light/registry.js';
import {extendLivingLightRegistry} from '../src/domain/living-light-preset.js';
import {readVisibilityPending,visibilityFingerprint} from '../src/domain/living-light-visibility-draft.js';
import {createLivingLightService} from '../server/living-light-service.mjs';
import {openAvatarCardCustodyService} from '../server/card-custody-service.mjs';
import {handleLivingLight} from '../server/living-light-routes.mjs';
import {newJourneyDraft} from '../src/domain/living-light-journey.js';
const registry=createLivingLightRegistry(),parent=registry.entries[0],ref=t=>({thingId:t.thingId,revisionId:t.revisionId});
const agent={mode:'authenticated-api',actor:{actorId:'agent:archive-proof',kind:'agent',displayName:'Archive proof'}};
const preset=(key,parameters={speed:1.5})=>({derivedFrom:ref(parent),title:'Synthetic archive preset',summary:'Synthetic settings',parameters,expectedRevision:null,idempotencyKey:key});
const visibility=(row,key)=>({expectedRevision:row.currentHead,expectedVisibilityRevision:row.visibility.revisionId,idempotencyKey:key});
async function fixture(real=false){const root=await fs.mkdtemp(path.join(os.tmpdir(),'living-light-archive-')),custodyOwner=real?openAvatarCardCustodyService({root:path.join(root,'data/card-custody')}):undefined,service=createLivingLightService({root,registry,custodyOwner,resolveSong:async id=>id==='fixture:song'?{id}:null});return {root,service,custodyOwner,cleanup:async()=>{service.close();await fs.rm(root,{recursive:true,force:true});}};}

test('archive reads remain lazy; source archive/restore preserves definitions and one real custody root',async()=>{const f=await fixture(true);try{
 const before=structuredClone(parent),initial=f.service.thing(parent.thingId);assert.deepEqual(initial.visibility,{archived:false,revisionId:null,revisionNumber:0});assert.equal(f.service.thingVisibilityHistory(parent.thingId).total,0);assert.equal(f.service.listThings().total,50);await assert.rejects(fs.access(path.join(f.root,'data/living-light/authoring.sqlite3')));
 const input=visibility(initial,'source:archive'),archived=await f.service.setThingVisibility(parent.thingId,true,input,agent);assert.equal(archived.custody.state,'verified');assert.equal(archived.visibility.archived,true);assert.equal(archived.visibility.revisionNumber,1);assert.deepEqual(archived.thing,before);assert.equal(f.service.listThings().total,49);assert.equal(f.service.listThings({includeArchived:true}).total,50);assert.deepEqual(f.service.thing(parent.thingId,parent.revisionId).thing,before);
 const restored=await f.service.setThingVisibility(parent.thingId,false,visibility(archived,'source:restore'),agent);assert.equal(restored.visibility.revisionNumber,2);assert.equal(restored.visibility.archived,false);assert.deepEqual(restored.custody.rootReceipt,archived.custody.rootReceipt);assert.equal((await f.custodyOwner.list()).cardCount,1);assert.equal(f.service.listThings().total,50);assert.equal(f.service.thingHistory(parent.thingId).total,1);assert.deepEqual(parent,before);
 f.service.close();const replay=await f.service.setThingVisibility(parent.thingId,true,input,agent);assert.equal(replay.idempotentReplay,true);assert.equal(f.service.thing(parent.thingId).visibility.archived,false);assert.equal(f.service.thingVisibilityHistory(parent.thingId).total,2);
}finally{await f.cleanup();}});

test('archived preset keeps exact recipe pins, defaults, revisions, notes and custody',async()=>{const f=await fixture(true);try{
 const saved=await f.service.savePreset(undefined,preset('preset:create'),agent),id=saved.thing.thingId;
 const overlay=extendLivingLightRegistry(registry,[saved.thing]),draft=newJourneyDraft({songId:'fixture:song',durationUs:20000000,thing:saved.thing,title:'Pinned archived preset'},overlay),recipe=await f.service.saveJourney({journey:draft,expectedRevision:null,idempotencyKey:'journey:create'},agent);
 await f.service.saveNote({target:{kind:'thing',thingId:id,observedRevisionId:saved.thing.revisionId},body:'Retained discussion',expectedRevision:null,idempotencyKey:'note:retained'},agent);
 const revised=await f.service.savePreset(id,{...preset('preset:revise',{speed:.7}),expectedRevision:saved.thing.revisionId},agent),archived=await f.service.setThingVisibility(id,true,visibility(revised,'preset:archive'),agent);
 assert.deepEqual(archived.custody.rootReceipt,saved.custody.rootReceipt);assert.equal(archived.noteCount,1);assert.equal(f.service.thingHistory(id).total,2);assert.equal(f.service.listThings({search:'Synthetic archive preset'}).total,0);assert.equal(f.service.listThings({search:'Synthetic archive preset',includeArchived:true}).total,1);
 assert.deepEqual(f.service.journey(recipe.journey.journeyId).journey,recipe.journey);assert.deepEqual(f.service.journey(recipe.journey.journeyId).journey.instances[0].thingRef,ref(saved.thing));assert.equal(f.service.thing(id,saved.thing.revisionId).thing.parameters.speed.default,1.5);
 const hidden=extendLivingLightRegistry(registry,[revised.thing],[saved.thing],{hiddenThingIds:[id,parent.thingId]});assert.equal(hidden.entries.find(t=>t.thingId===id),undefined);assert.equal(hidden.resolveThing(ref(saved.thing)).parameters.speed.default,1.5);assert.deepEqual(hidden.resolveThing(ref(parent)),parent);
 const restored=await f.service.setThingVisibility(id,false,visibility(archived,'preset:restore'),agent);assert.equal(restored.thing.parameters.speed.default,.7);assert.equal(restored.noteCount,1);assert.equal((await f.custodyOwner.list()).cardCount,3);
}finally{await f.cleanup();}});

test('CAS checks definition and visibility heads; replay/noop cannot duplicate events',async()=>{const f=await fixture();try{
 const saved=await f.service.savePreset(undefined,preset('cas:create'),agent),id=saved.thing.thingId,input=visibility(saved,'cas:archive'),first=await f.service.setThingVisibility(id,true,input,agent);
 await assert.rejects(f.service.setThingVisibility(id,true,{...input,idempotencyKey:'cas:other'},agent),e=>e.code==='visibility_conflict'&&e.currentVisibilityRevision===first.visibility.revisionId);
 const noop=await f.service.setThingVisibility(id,true,visibility(first,'cas:noop'),agent);assert.equal(noop.unchanged,true);assert.equal(f.service.thingVisibilityHistory(id).total,1);
 const replay=await f.service.setThingVisibility(id,true,input,agent);assert.equal(replay.idempotentReplay,true);assert.equal(f.service.thingVisibilityHistory(id).total,1);
 await assert.rejects(f.service.setThingVisibility(id,false,input,agent),e=>e.code==='idempotency_conflict');
 const revised=await f.service.savePreset(id,{...preset('cas:revise',{speed:.7}),expectedRevision:saved.thing.revisionId},agent);assert.equal(revised.visibility.archived,true);
 await assert.rejects(f.service.setThingVisibility(id,false,visibility(first,'cas:stale-definition'),agent),e=>e.code==='revision_conflict'&&e.currentHead===revised.thing.revisionId);
 assert.equal(f.service.thingVisibilityHistory(id).total,1);assert.equal((await f.service.setThingVisibility(id,false,visibility(revised,'cas:restore'),agent)).visibility.revisionNumber,2);
}finally{await f.cleanup();}});

test('archive/restore history and definition history page beyond fifty without dropping tails',async()=>{const f=await fixture();try{
 let row=await f.service.savePreset(undefined,preset('page:create'),agent),id=row.thing.thingId;
 for(let i=0;i<52;i++)row=await f.service.setThingVisibility(id,i%2===0,visibility(row,'page:visibility:'+i),agent);
 const first=f.service.thingVisibilityHistory(id,{limit:50}),tail=f.service.thingVisibilityHistory(id,{limit:50,offset:first.nextOffset});assert.equal(first.total,52);assert.equal(first.events.length,50);assert.equal(tail.events.length,2);assert.equal(tail.nextOffset,null);assert.equal(tail.events[1].revisionNumber,52);
 assert.equal(first.events[0].actor.kind,'agent');assert.equal(first.events[0].observedRevisionId,row.thing.revisionId);assert.equal(first.events[1].parentRevisionId,first.events[0].revisionId);
 for(let i=0;i<51;i++)row=await f.service.savePreset(id,{...preset('page:definition:'+i,{speed:i%2?.7:1.5}),expectedRevision:row.currentHead,title:'Synthetic revision '+i},agent);
 assert.equal(f.service.thingHistory(id,{limit:50}).total,52);assert.equal(f.service.thingHistory(id,{offset:50,limit:50}).revisions.length,2);assert.equal(f.service.thingVisibilityHistory(id).total,52);
 for(const options of [{limit:0},{limit:201},{offset:-1},{offset:.5}])assert.throws(()=>f.service.thingVisibilityHistory(id,options),e=>e.code==='invalid_page');
}finally{await f.cleanup();}});

test('invalid authority and fields fail before mutation; injected archive rollback is atomic',async()=>{const f=await fixture();try{
 const initial=f.service.thing(parent.thingId),input=visibility(initial,'rollback:archive');
 await assert.rejects(f.service.setThingVisibility(parent.thingId,true,input,{...agent,actor:{actorId:'human:local-operator',kind:'human',displayName:'Forged'}}),e=>e.code==='human_attribution_denied');
 for(const bad of [{...input,actor:agent.actor},{...input,expectedVisibilityRevision:undefined},{...input,expectedRevision:'absent'}])await assert.rejects(f.service.setThingVisibility(parent.thingId,true,bad,agent));
 await assert.rejects(fs.access(path.join(f.root,'data/living-light/authoring.sqlite3')));
 const owner=f.service.store,original=owner.materializeThingInTransaction.bind(owner);owner.materializeThingInTransaction=(db,thing)=>{original(db,thing);throw Error('Injected archive failure');};
 await assert.rejects(f.service.setThingVisibility(parent.thingId,true,input,agent),/Injected archive failure/);for(const table of ['identities','revisions','intents','requests'])assert.equal(owner.open().prepare('SELECT count(*) n FROM '+table).get().n,0);assert.equal(f.service.thingVisibilityHistory(parent.thingId).total,0);
 owner.materializeThingInTransaction=original;assert.equal((await f.service.setThingVisibility(parent.thingId,true,input,agent)).visibility.revisionNumber,1);
}finally{await f.cleanup();}});

test('ambiguous archive retry retains exact request identity and strips foreign authority',()=>{
 const pending={thingId:parent.thingId,archived:true,expectedRevision:parent.revisionId,expectedVisibilityRevision:null,key:'stable:retry',actor:agent.actor,token:'discard'},safe=readVisibilityPending(JSON.stringify(pending),parent.thingId);assert.equal(safe.key,'stable:retry');assert.equal(safe.actor,undefined);assert.equal(safe.token,undefined);assert.equal(visibilityFingerprint(parent.thingId,true,safe),visibilityFingerprint(parent.thingId,true,pending));assert.notEqual(visibilityFingerprint(parent.thingId,false,safe),visibilityFingerprint(parent.thingId,true,pending));assert.equal(readVisibilityPending(JSON.stringify(pending),'different'),null);assert.equal(readVisibilityPending('{',parent.thingId),null);assert.equal(readVisibilityPending(JSON.stringify({...pending,key:'bad key'}),parent.thingId),null);
});

test('protected routes archive/restore and expose exact history; invalid paths and JSON are rejected',async()=>{const f=await fixture();try{
 let status,response;const call=async(suffix,method,body)=>{await handleLivingLight({req:{method,headers:{}},res:{},url:new URL('http://127.0.0.1/api/echos/living-light'+suffix),service:f.service,authorize:()=>agent,readBody:async(req,limit)=>{assert.equal(limit,1048576);if(body instanceof Error)throw body;return body;},sendJson:(r,s,v)=>{status=s;response=v;}});return response;};
 const prefix='/things/'+parent.thingId,input=visibility(f.service.thing(parent.thingId),'route:archive');await call(prefix+'/archive','POST',input);assert.equal(status,201);assert.equal(response.visibility.archived,true);
 await call('/things','GET');assert.equal(response.total,49);await call('/things?includeArchived=true','GET');assert.equal(response.total,50);await call('/things?includeArchived=banana','GET');assert.equal(status,422);await call(prefix+'/visibility-history','GET');assert.equal(response.events.length,1);
 const row=f.service.thing(parent.thingId);await call(prefix+'/restore','POST',visibility(row,'route:restore'));assert.equal(status,201);assert.equal(response.visibility.archived,false);
 await call(prefix+'/archive','POST',new SyntaxError('bad JSON'));assert.equal(status,400);assert.equal(response.error,'invalid_json');await call(prefix+'/archive','POST',{...input,actor:agent.actor});assert.equal(status,422);await call(prefix+'/archive/extra','POST',input);assert.equal(status,404);await call(prefix+'/archive','GET');assert.equal(status,404);await call(prefix+'/visibility-history','POST',{});assert.equal(status,404);assert.equal(f.service.thingVisibilityHistory(parent.thingId).total,2);
}finally{await f.cleanup();}});
