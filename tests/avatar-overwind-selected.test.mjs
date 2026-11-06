// One in-process native SQLite fixture, no network/process/worker or live stores.
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import os from 'node:os';import path from 'node:path';
import {AvatarOverwindOrigin} from '../server/avatar-overwind-origin.mjs';
import test from 'node:test';
test('exact private design staging and selected acknowledgement preserve origin order',async()=>{
const dir=await mkdtemp(path.join(os.tmpdir(),'dreamer-selected-origin-'));let origin;
try{
 origin=new AvatarOverwindOrigin({dbPath:path.join(dir,'outbox.sqlite3'),token:'fixture-token'});
 const record={id:'fixture-dreamer-card',title:'Exact design',summary:'A private source-linked design',createdAt:'2026-11-05T00:00:00Z',sourceKind:'reviewed_design',visibility:'private',custody:{schemaVersion:'hapa.card-custody-receipt.v1',cardId:'fixture-dreamer-card',originNodeId:'hapa-avatar-builder',cardCoreKey:'a'.repeat(64),cardRecordDigest:'b'.repeat(64),originPublicKey:'c'.repeat(64),minted:false,canonical:false}};
 const first=origin.stageCustodiedDesign(record);assert.equal(first.created,true);assert.equal(first.event.visibility,'private');assert.equal(first.event.payload.card.visibility,'private');
 assert.equal(origin.stageCustodiedDesign(record).event.event_id,first.event.event_id);assert.equal(origin.pending().length,1);
 assert.throws(()=>origin.stageCustodiedDesign({...record,summary:'Changed'}));assert.equal(origin.pending().length,1);
 let calls=0;const lost=await origin.uploadExact(first.event.event_id,first.event.digests.event,async()=>{calls++;throw Error('response lost');});assert.equal(lost.status.durableAcknowledgement,false);assert.equal(lost.status.attempts,1);
 const rejected=await origin.uploadExact(first.event.event_id,first.event.digests.event,async()=>{calls++;return new Response(JSON.stringify({results:[{event_id:first.event.event_id,outcome:'accepted',durable:true,ledger_position:21}]}),{status:503});});assert.equal(rejected.status.durableAcknowledgement,false);assert.equal(rejected.status.attempts,2);assert.equal(origin.stageCustodiedDesign(record).event.event_id,first.event.event_id);
 const accepted=await origin.uploadExact(first.event.event_id,first.event.digests.event,async(url,opts)=>{calls++;const payload=JSON.parse(opts.body);assert.equal(payload.events.length,1);assert.equal(payload.events[0].event_id,first.event.event_id);return new Response(JSON.stringify({results:[{event_id:first.event.event_id,event_digest:first.event.digests.event,outcome:'idempotent_duplicate',durable:true,ledger_position:22}]}));});
 assert.equal(accepted.status.durableAcknowledgement,true);assert.equal(accepted.status.attempts,3);
 const again=await origin.uploadExact(first.event.event_id,first.event.digests.event,()=>{throw Error('no acknowledged replay');});assert.equal(again.sent,0);assert.equal(calls,3);
 const later={...record,id:'later',custody:{...record.custody,cardId:'later'}};
 for(let i=0;i<251;i++)origin.appendOperation('item',{id:'unrelated-'+i,title:'Unrelated'},'card.created',null);
 const staged=origin.stageCustodiedDesign(later),before=origin.health();let unwanted=0;
 const held=await origin.uploadExact(staged.event.event_id,staged.event.digests.event,()=>{unwanted++;});assert.equal(held.sent,0);assert.equal(held.status.precedingUnacknowledged,251);assert.equal(unwanted,0);assert.deepEqual(origin.health(),before);
 assert.equal(origin.selectedDelivery(staged.event.event_id,staged.event.digests.event).originSequence,253);
 await assert.rejects(origin.uploadExact(staged.event.event_id,'sha256:'+'f'.repeat(64)));assert.equal(unwanted,0);
 console.log(JSON.stringify({ok:true,privateScopePreserved:true,sameEventReused:true,lostAckReconciled:true,precedingUnrelatedHeld:251,noUnrelatedUpload:true,selectedEventBeyondFirst250Found:true}));
}finally{origin?.close();await rm(dir,{recursive:true,force:true});}

});
