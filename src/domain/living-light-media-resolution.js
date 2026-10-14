import {livingLightCutMedia,livingLightMediaKey} from './living-light-media.js';
const fail=message=>{throw Object.assign(Error(message),{code:'invalid_media_resolution',statusCode:422});};
export function validateLivingLightMediaReferences(refs){
 if(!Array.isArray(refs)||refs.length>2)fail('Resolve at most two painted media sources at a time.');
 for(const ref of refs){
  if(!ref||typeof ref!=='object'||Array.isArray(ref)||Object.keys(ref).length!==5||Object.keys(ref).some(key=>!['songId','cutId','shotId','mediaId','sourceRevision'].includes(key)))fail('Use the exact saved media reference.');
  if(!['songId','cutId','shotId','mediaId'].every(key=>typeof ref[key]==='string'&&ref[key].trim()&&ref[key].length<=300)||!/^[a-f0-9]{64}$/.test(ref.sourceRevision))fail('Use bounded media identities and a source declaration digest.');
 }
 return refs;
}
/** Read-only projection through the existing cut owner. A matching title, media
 * ID, latest cut or changed source declaration can never resolve a saved pin. */
export async function resolveLivingLightMediaReferences(refs,{loadCut}={}){
 validateLivingLightMediaReferences(refs);const cuts=new Map(),results=[];
 for(const ref of refs){
  const cutKey=JSON.stringify([ref.songId,ref.cutId]);
  if(!cuts.has(cutKey))cuts.set(cutKey,Promise.resolve().then(()=>loadCut?.(ref.songId,ref.cutId)));
  try{
   const cut=await cuts.get(cutKey);
   if(!cut){results.push({ref:structuredClone(ref),state:'unavailable',reason:'cut-unavailable'});continue;}
   if(cut.song_id!==ref.songId||(cut.active_direction_script_variant?.id||'legacy')!==ref.cutId)throw Error('Cut owner returned another identity');
   const source=livingLightCutMedia(cut).find(row=>livingLightMediaKey(row.ref)===livingLightMediaKey(ref));
   results.push(source?{ref:structuredClone(ref),state:'resolved',source}:{ref:structuredClone(ref),state:'unavailable',reason:'source-declaration-unavailable'});
  }catch(error){results.push({ref:structuredClone(ref),state:'unavailable',reason:'cut-read-failed'});}
 }
 return {schemaVersion:'hapa.living-light.media-resolution.v1',readOnly:true,results};
}
/** Transient URLs never enter the recipe. Current draft sources can satisfy
 * exact pins immediately; missing sources are looked up in their owning cuts. */
export async function resolveLivingLightJourneyMedia(journey,{sources=[],request,signal,resolveUri=value=>value}={}){
 const refs=[...new Map((journey.mediaSlots||[]).filter(slot=>slot.enabled&&slot.mediaRef).map(slot=>[livingLightMediaKey(slot.mediaRef),slot.mediaRef])).values()];
 return resolveLivingLightMediaSources(refs,{sources,request,signal,resolveUri});
}
/** Shared transient lookup for painted surfaces and the one visible destination. */
export async function resolveLivingLightMediaSources(refs,{sources=[],request,signal,resolveUri=value=>value}={}){
 validateLivingLightMediaReferences(refs);const known=new Map(sources.map(source=>[livingLightMediaKey(source.ref),source]));
 const missing=refs.filter(ref=>!known.has(livingLightMediaKey(ref)));
 if(missing.length){
  const response=await request('/media/resolve',{method:'POST',body:JSON.stringify({refs:missing}),signal});
  if(response.schemaVersion!=='hapa.living-light.media-resolution.v1'||!response.readOnly||!Array.isArray(response.results))throw Error('Painted media lookup returned an unsupported response.');
  for(const result of response.results){
   if(result.state!=='resolved')continue;
   const wanted=missing.find(ref=>livingLightMediaKey(ref)===livingLightMediaKey(result.ref));
   if(!wanted||!result.source?.ref||livingLightMediaKey(result.source.ref)!==livingLightMediaKey(wanted)||typeof result.source.uri!=='string')throw Error('Painted media lookup returned a different source.');
   known.set(livingLightMediaKey(wanted),{...result.source,uri:resolveUri(result.source.uri)});
  }
 }
 return refs.flatMap(ref=>known.has(livingLightMediaKey(ref))?[known.get(livingLightMediaKey(ref))]:[]);
}
