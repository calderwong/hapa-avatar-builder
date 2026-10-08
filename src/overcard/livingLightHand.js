import {applyCollectionCommand,pickUpEntity} from '@hapa/overcard/core';
import {livingLightCardTarget,livingLightTargetFromEntity,livingLightCustodyReady} from './livingLight.js';
const surfaceId='hapa-avatar-builder';
const fail=(code,message)=>{throw Object.assign(Error(message),{code});};
function admit(snapshot,target,mode){
 if(snapshot.sync.connection!=='online')fail('shared_hand_offline','Reconnect the shared Hand before picking up this Card.');
 const ledger=snapshot.collections,preference=ledger.activeHands[surfaceId];
 const hand=preference?.collectionId?ledger.collections[preference.collectionId]:preference?null:Object.values(ledger.collections).find(row=>row.kind==='hand'&&row.activeForSurfaces?.includes(surfaceId));
 if(mode==='add'){
  if(!hand||hand.kind!=='hand')fail('active_hand_required','Choose an active Hand in Manage first.');
  if(hand.members.some(row=>row.sourceSystem==='hapa-avatar-builder'&&row.entityType==='card'&&row.entityId===target.id))fail('duplicate','This Card is already in the active Hand. Its held revision is unchanged.');
  if(hand.capacity!==undefined&&hand.members.length>=hand.capacity)fail('capacity','The active Hand is full.');
 }
 return {ledger,hand};
}
/** Source custody precedes shared placement. Neither operation is replayed here. */
export async function useLivingLightSharedCard({target:input,mode,client,store,setHeld,signal}){
 const target=livingLightCardTarget(input);if(!['add','pickup'].includes(mode))fail('invalid_operation','Choose Add to Hand or Pick up.');
 admit(store.getSnapshot(),target,mode);
 const record=await client.request('/shared-card/prepare',{method:'POST',body:JSON.stringify(target),signal});
 if(signal?.aborted)fail('cancelled','Card selection changed before pickup.');
 const exact=livingLightTargetFromEntity(record.entity);
 if(!exact||JSON.stringify(exact)!==JSON.stringify(target))fail('card_revision_mismatch','The source returned a different Card revision.');
 if(!livingLightCustodyReady(record,target))fail('card_custody_pending','Card custody is pending. Your saved Card and notes are retained; recover the source before adding it to the Hand.');
 const {ledger,hand}=admit(store.getSnapshot(),target,mode),at=new Date().toISOString(),actor='calder';
 if(mode==='pickup'){setHeld(pickUpEntity({entity:record.entity,surfaceId,actor,at}));return {state:'held',entity:record.entity};}
 const id=crypto.randomUUID(),receipt=applyCollectionCommand(ledger,{id,operation:'copy',entity:record.entity,toCollectionId:hand.id,expectedToRevision:hand.revision,actor,at,provenance:{source:surfaceId+':living-light',actor,createdAt:at,traceId:id}});
 await store.dispatch('state.upsert',{record:{kind:'collection-ledger',id:'shared',value:receipt.state,summary:'Add '+record.entity.label+' to Hand'}});
 return {state:'added',handName:hand.name,entity:record.entity};
}
