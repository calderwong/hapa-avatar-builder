import {canonicalJSON} from './living-light-contracts.js';
export const visibilityDraftKey=id=>'hapa.living-light.visibility-pending.v1:'+id;
export function visibilityFingerprint(id,archived,request){return canonicalJSON({thingId:id,archived,expectedRevision:request.expectedRevision,expectedVisibilityRevision:request.expectedVisibilityRevision});}
export function readVisibilityPending(raw,id){
 try{
  if(typeof raw!=='string'||raw.length>8192)return null;const value=JSON.parse(raw),validId=v=>typeof v==='string'&&v.length<=256&&/^[a-zA-Z0-9][a-zA-Z0-9:._-]*$/.test(v);
  if(value.thingId!==id||typeof value.archived!=='boolean'||!validId(value.expectedRevision)||(value.expectedVisibilityRevision!==null&&!validId(value.expectedVisibilityRevision))||!validId(value.key))return null;
  return {thingId:id,archived:value.archived,expectedRevision:value.expectedRevision,expectedVisibilityRevision:value.expectedVisibilityRevision,key:value.key};
 }catch{return null;}
}
