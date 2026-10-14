import {sha256} from '@noble/hashes/sha2.js';
import {bytesToHex} from '@noble/hashes/utils.js';
import {mapEchoSourceWindowTime} from './echo-playback-sync.js';

export const LIVING_LIGHT_MEDIA_SCHEMA='hapa.living-light.media-placement.v1';
const hash=value=>bytesToHex(sha256(new TextEncoder().encode(JSON.stringify(value))));
const fail=message=>{throw Object.assign(new Error(message),{code:'invalid_media_placement',status:422});};
const fields=(value,allowed)=>{if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!allowed.includes(k)))fail('Unsupported media placement fields.');};
const text=value=>typeof value==='string'&&value.trim().length>0&&value.length<=300;

/** Pilot capability adapter, independent of immutable source definitions. */
export function livingLightMediaSurfaces(thing){
 if(thing?.capabilities?.continuous||['fractal-loom','silken-current','media-weave'].includes(thing?.source?.moduleId))return ['wall-left','wall-right'];
 if(['solar-reliquary','tidal-observatory'].includes(thing?.source?.moduleId))return ['portal'];
 return [];
}
/** Pin the cut's source declaration, not inferred byte identity. Resolved URIs
 * stay transient; saved recipes cannot supply URLs or local filesystem paths. */
export function livingLightCutMedia(project,resolveUri=value=>value){
 if(!project?.song_id)return [];
 const cutId=String(project.active_direction_script_variant?.id||project.activeDirectionScriptVariant?.id||'legacy');
 return (project.timeline||[]).flatMap((shot,index)=>{
  const contract=shot.media_contract||{},uri=contract.runtimeUri||shot.runtime_media_uri||shot.media_uri;
  const type=contract.type||(/\.(mp4|webm|mov|m4v)(?:$|[?#])/i.test(uri||'')?'video':'');
  if(!uri||!['video','local-video'].includes(type)||!shot.media_id)return [];
  const shotId=String(shot.id||shot.shot_id||`shot-${index}`),mediaId=String(shot.media_id);
  if(![project.song_id,cutId,shotId,mediaId].every(text))return [];
  const sourceRevision=hash([project.song_id,cutId,shotId,mediaId,uri,contract.originalUri||shot.media_uri||null,contract.contentHash||contract.sourceHash||contract.sha256||null]);
  return [{ref:{songId:project.song_id,cutId,shotId,mediaId,sourceRevision},title:String(shot.media_title||mediaId),uri:resolveUri(uri),identityBasis:'exact-cut-source-declaration'}];
 });
}
export const livingLightMediaKey=ref=>JSON.stringify([ref.songId,ref.cutId,ref.shotId,ref.mediaId,ref.sourceRevision]);
export function validateLivingLightMedia(slots,{instances,resolveThing,songId}){
 const occupied=new Set();let enabled=0;
 for(const slot of slots){
  if(slot?.schemaVersion===undefined&&slot?.enabled===false)continue;
  fields(slot,['schemaVersion','enabled','surfaceRef','mediaRef','trim','loopPolicy','brightness']);
  if(slot.schemaVersion!==LIVING_LIGHT_MEDIA_SCHEMA||typeof slot.enabled!=='boolean')fail('Choose a supported media placement.');
  fields(slot.surfaceRef,['instanceId','surfaceId']);
  const instance=instances.find(i=>i.instanceId===slot.surfaceRef.instanceId);
  if(!instance||!livingLightMediaSurfaces(resolveThing(instance.thingRef)).includes(slot.surfaceRef.surfaceId))fail('This use does not support the chosen painted surface.');
  const key=JSON.stringify([slot.surfaceRef.instanceId,slot.surfaceRef.surfaceId]);if(occupied.has(key))fail('A surface can hold only one clip.');occupied.add(key);
  fields(slot.mediaRef,['songId','cutId','shotId','mediaId','sourceRevision']);
  if(!['songId','cutId','shotId','mediaId'].every(k=>text(slot.mediaRef[k]))||slot.mediaRef.songId!==songId||!/^[a-f0-9]{64}$/.test(slot.mediaRef.sourceRevision))fail('Choose an exact video from this song’s cut.');
  fields(slot.trim,['inUs','outUs']);
  if(!Number.isSafeInteger(slot.trim.inUs)||slot.trim.inUs<0||slot.trim.inUs>1800000000||!(slot.trim.outUs===null||(Number.isSafeInteger(slot.trim.outUs)&&slot.trim.outUs>slot.trim.inUs&&slot.trim.outUs<=1800000000)))fail('Enter a valid clip source range.');
  if(!['loop','hold'].includes(slot.loopPolicy)||!Number.isFinite(slot.brightness)||slot.brightness<0||slot.brightness>2)fail('Use Loop or Hold and brightness between 0 and 2.');
  if(slot.enabled)enabled++;
 }
 if(enabled>2)fail('This preview supports two painted surfaces per recipe. Remove or disable one first.');
 return slots;
}
export function livingLightMediaTime(slot,row,timelineUs,durationSeconds){
 if(!Number.isFinite(durationSeconds)||durationSeconds<=slot.trim.inUs/1e6||(slot.trim.outUs!==null&&slot.trim.outUs/1e6>durationSeconds+.001))throw Error('Saved trim is outside the decoded clip.');
 return mapEchoSourceWindowTime({elapsedSeconds:Math.max(0,(Math.min(timelineUs,row.endUs)-row.startUs)/1e6),durationSeconds,sourceInSeconds:slot.trim.inUs/1e6,sourceOutSeconds:slot.trim.outUs===null?null:slot.trim.outUs/1e6,loop:slot.loopPolicy==='loop'});
}
