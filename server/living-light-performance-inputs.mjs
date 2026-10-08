import {livingLightStemDeclarations,canonicalLivingLightRole} from '../src/domain/living-light-source-binding.js';
import {resolveEchoRuntimeMediaUri} from './echo-runtime-media-route.mjs';
export const LIVING_LIGHT_SOURCE_POLICY = 'living-light-assets-v1';
const fail=(code,message)=>{throw Object.assign(new Error(message),{code,statusCode:422});};
/** Explicit preparation only. Exact Song/asset declarations; no role-peer joins,
 * Director dependency, filesystem paths supplied by callers, or alignment claims. */
export function livingLightPerformanceInputs({songId,songStore,resolveOptions={}}={}) {
 const songs=(songStore?.songs||[]).filter(song=>song.id===songId);
 if(songs.length!==1)fail('living_light_song_ambiguous','Select one exact canonical Song.');
 const song=songs[0],audio=song.audio||{};
 const exactOptions={...resolveOptions,exactIdentityOnly:true};
 const audioUri=audio.localPath||audio.audioPath||audio.uri||`/api/song-registry/audio/${encodeURIComponent(audio.registryTrackId||song.registryTrackId||song.id)}`;
 const master=resolveEchoRuntimeMediaUri(audioUri,exactOptions);
 if(!master.ok)fail('living_light_master_unavailable','The selected Song has no local master route.');
 const rows=livingLightStemDeclarations(song);
 if(rows.length>32)fail('living_light_asset_budget','This explicit preparation supports at most 32 stem declarations.');
 if(new Set(rows.map(row=>row.assetId)).size!==rows.length)fail('living_light_asset_ambiguous','Each declaration needs a unique exact asset ID.');
 const items=rows.map(({stem,assetId})=>{
  if(typeof assetId!=='string'||!assetId.trim()||assetId.length>300)fail('living_light_asset_invalid','Asset identity is invalid.');
  const declaredRole=String(stem.stemType||stem.role||stem.kind||stem.title||'unknown');
  const declared=String(stem.localPath||stem.audioPath||stem.uri||'').trim();
  const source=declared?resolveEchoRuntimeMediaUri(declared,exactOptions):null;
  return {id:`stem:${encodeURIComponent(assetId)}`,assetId,declaredRole,stemType:declaredRole,canonicalRole:canonicalLivingLightRole(declaredRole),title:String(stem.title||declaredRole),audioPath:source?.ok?source.resolvedPath:null,sourceState:source?.ok?'resolved-route':'unresolved',alignmentState:'alignment-unverified'};
 });
 return {audioUri,masterPath:master.resolvedPath,graph:{schemaVersion:'hapa.echo.audio-preparation-inputs.v1',source:{songId,identityPolicy:LIVING_LIGHT_SOURCE_POLICY,renderCertification:false},song:{id:songId,title:song.title||songId,audioPath:audioUri,lyricOverlay:{}},stems:{items,count:items.length}}};
}
