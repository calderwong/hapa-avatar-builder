import {validateJourney,canonicalJSON} from './living-light-contracts.js';
const clone=value=>structuredClone(value),newId=()=>`ll-instance:${crypto.randomUUID()}`;
export function editableJourney(value){const result=clone(value);for(const key of ['journeyId','revisionId','parentRevisionId'])delete result[key];return result;}
export function validateDraft(value,registry,durationUs){return validateJourney({...value,journeyId:'ll-journey:draft',revisionId:'ll-journey-r:draft',parentRevisionId:null},{resolveThing:registry.resolveThing,durationUs});}
const instance=(thing,id=newId())=>({instanceId:id,thingRef:{thingId:thing.thingId,revisionId:thing.revisionId},parameters:{},bindings:{}});
export function newJourneyDraft({songId,title,durationUs,thing,mode='continuous',seed=109},registry){const item=instance(thing),value={schemaVersion:'hapa.living-light.journey.v1',title:title||'New Journey',songId,sourceBindingRef:null,state:'draft-unresolved',mode,seed,instances:[item],schedule:[{instanceId:item.instanceId,startUs:0,endUs:durationUs}],actorTreatment:'none',mediaSlots:[]};validateDraft(value,registry,durationUs);return value;}
/** Explicit passage choice: retain existing endpoints when replacing, or add
 * the chosen next destination. Creating a tour never overwrites its input. */
export function useJourneyPassage(input,{mode,passageRef,fromRef,toRef,replaceInstanceId,songId,title,durationUs},registry){
 const passage=registry.resolveThing(passageRef);if(!passage?.capabilities.bridge)throw Error('Choose an exact connecting passage revision.');
 if(mode==='replace'){
  if(input?.mode!=='tour')throw Error('Choose a Location tour before replacing a connection.');
  const current=input.instances.find(item=>item.instanceId===replaceInstanceId);
  if(!current||!registry.resolveThing(current.thingRef)?.capabilities.bridge)throw Error('Choose an existing passage connection.');
  return {draft:editJourneyDraft(input,{type:'replace',instanceId:replaceInstanceId,thingRef:passageRef},registry),instanceId:replaceInstanceId};
 }
 if(!['extend','new'].includes(mode))throw Error('Choose Add next Location, Replace connection, or Create tour.');
 const to=registry.resolveThing(toRef);if(!to?.capabilities.destination)throw Error('Choose the next exact Location revision.');
 let base=input;
 if(mode==='new'){
  const from=registry.resolveThing(fromRef);if(!from?.capabilities.destination)throw Error('Choose the starting exact Location revision.');
  base=newJourneyDraft({songId,title,durationUs,thing:from,mode:'tour'},registry);
 }else if(input?.mode!=='tour')throw Error('A passage connects Locations. Create a Location tour first; the current draft is kept.');
 const draft=editJourneyDraft(base,{type:'add',thingRef:toRef,bridgeRef:passageRef},registry);
 return {draft,instanceId:draft.schedule.at(-2).instanceId};
}
function rebuild(value,rows){let cursor=0;value.schedule=rows.map(row=>{const next={...row,startUs:cursor,endUs:cursor+row.lengthUs};cursor=next.endUs;delete next.lengthUs;return next;});if(value.mode==='tour')value.schedule.forEach((row,i)=>{if(i%2===1){row.fromInstanceId=value.schedule[i-1].instanceId;row.toInstanceId=value.schedule[i+1].instanceId;row.entryAnchorId='entry';row.exitAnchorId='exit';}});value.instances=value.instances.filter(item=>value.schedule.some(row=>row.instanceId===item.instanceId));}
/** One committed editor action -> one undo snapshot. No source-time scaling. */
export function editJourneyDraft(input,action,registry){
 const value=clone(input),durationUs=input.schedule.at(-1).endUs,rows=value.schedule.map(row=>({...row,lengthUs:row.endUs-row.startUs})),index=rows.findIndex(row=>row.instanceId===action.instanceId),selected=value.instances.find(item=>item.instanceId===action.instanceId);
 const requireSelected=()=>{if(index<0||!selected)throw Error('Select a Journey instance first.');};
 if(action.type==='title')value.title=action.title;
 else if(action.type==='lock'){requireSelected();if(typeof action.value!=='boolean')throw Error('Choose an explicit lock state.');selected.locked=action.value;}
 else if(action.type==='parameter'){requireSelected();selected.parameters[action.key]=action.value;}
 else if(action.type==='binding'){requireSelected();if(action.binding===null)delete selected.bindings[action.portId];else selected.bindings[action.portId]=clone(action.binding);}
 else if(action.type==='reset'){requireSelected();selected.parameters={};}
 else if(action.type==='replace'){requireSelected();const old=registry.resolveThing(selected.thingRef),thing=registry.resolveThing(action.thingRef);if(!thing||old.variantKind!==thing.variantKind)throw Error('Choose a Thing with the same route capability.');selected.thingRef=clone(action.thingRef);selected.parameters={};selected.bindings={};}
 else if(action.type==='duration'){
  requireSelected();if(!Number.isSafeInteger(action.durationUs)||action.durationUs<1)throw Error('Enter a positive source-time duration.');const delta=action.durationUs-rows[index].lengthUs,next=index+1<rows.length?index+1:index-1;if(next<0)throw Error('A single instance covers the complete song.');rows[index].lengthUs=action.durationUs;rows[next].lengthUs-=delta;if(rows[next].lengthUs<1)throw Error('This duration leaves no time for the neighbouring instance.');rebuild(value,rows);
 }
 else if(action.type==='move'){
  requireSelected();const step=value.mode==='tour'?2:1,next=index+action.direction*step;if(value.mode==='tour'&&index%2)throw Error('Move a Location; its neighbouring passage connections follow it.');if(next<0||next>=rows.length)return value;[rows[index],rows[next]]=[rows[next],rows[index]];rebuild(value,rows);
 }
 else if(action.type==='add'||action.type==='duplicate'){
  if(action.type==='duplicate')requireSelected();const thing=action.type==='duplicate'?registry.resolveThing(selected.thingRef):registry.resolveThing(action.thingRef);if(!thing)throw Error('This Thing revision is unavailable.');const item=instance(thing);if(action.type==='duplicate'){item.parameters=clone(selected.parameters);item.bindings=clone(selected.bindings);}const last=rows.at(-1);
  if(value.mode==='continuous'){
   if(!thing.capabilities.continuous)throw Error('Continuous recipes use continuous Tunnel profiles.');const tail=Math.floor(last.lengthUs/2);if(tail<1)throw Error('The last interval is too short to split.');last.lengthUs-=tail;value.instances.push(item);rows.push({instanceId:item.instanceId,lengthUs:tail});
  }else{
   if(!thing.capabilities.destination)throw Error('Add a Location to a tour; choose its connecting passage below.');const bridge=registry.resolveThing(action.bridgeRef);if(!bridge?.capabilities.bridge)throw Error('Select a connecting passage.');const travel=8000000,remaining=last.lengthUs-travel;if(remaining<2000000)throw Error('The final Location needs at least ten seconds to split into a new stop and eight-second passage.');const dwell=Math.floor(remaining/2),bridgeItem=instance(bridge);last.lengthUs=remaining-dwell;value.instances.push(bridgeItem,item);rows.push({instanceId:bridgeItem.instanceId,lengthUs:travel},{instanceId:item.instanceId,lengthUs:dwell});
  }rebuild(value,rows);
 }
 else if(action.type==='remove'){
  requireSelected();if(rows.length===1)throw Error('Keep at least one instance in this recipe.');
  if(value.mode==='continuous'){const duration=rows[index].lengthUs;rows.splice(index,1);rows[Math.min(index,rows.length-1)].lengthUs+=duration;}
  else{if(index%2)throw Error('Remove a Location and its adjacent passage together.');let removed;if(index===0){removed=rows.splice(0,2);rows[0].lengthUs+=removed.reduce((sum,row)=>sum+row.lengthUs,0);}else if(index===rows.length-1){removed=rows.splice(index-1,2);rows.at(-1).lengthUs+=removed.reduce((sum,row)=>sum+row.lengthUs,0);}else{removed=rows.splice(index,2);rows[index].lengthUs+=removed.reduce((sum,row)=>sum+row.lengthUs,0);}}rebuild(value,rows);
 }
 else throw Error('Unknown Journey edit.');
 // Protect each locked use and the adjacent tour connections. Compare the
 // final candidate, so a duration/reorder/removal cannot move a locked endpoint
 // indirectly. Unlock is explicit; lock flags alone do not change the route.
 const guarded=new Set();input.schedule.forEach((row,i)=>{if(input.instances.find(item=>item.instanceId===row.instanceId)?.locked){guarded.add(row.instanceId);if(input.mode==='tour')for(const neighbour of [input.schedule[i-1],input.schedule[i+1]])if(neighbour&&registry.resolveThing(input.instances.find(item=>item.instanceId===neighbour.instanceId).thingRef).capabilities.bridge)guarded.add(neighbour.instanceId);}});
 const snapshot=(recipe,id)=>{const item=recipe.instances.find(item=>item.instanceId===id),row=recipe.schedule.find(row=>row.instanceId===id);if(!item||!row)return null;const {locked,...content}=item;return {item:content,row};};
 for(const id of guarded)if(canonicalJSON(snapshot(input,id))!==canonicalJSON(snapshot(value,id)))throw Error('Unlock the protected use and its route endpoints before changing this connection. Your draft is kept.');
 validateDraft(value,registry,durationUs);return value;
}
