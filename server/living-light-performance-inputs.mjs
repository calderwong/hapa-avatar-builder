import {livingLightStemDeclarations,canonicalLivingLightRole} from '../src/domain/living-light-source-binding.js';
import {resolveEchoRuntimeMediaUri} from './echo-runtime-media-route.mjs';
import {chooseStemSet,stemRoleLabel} from '../src/domain/echo-stem-set.js';
import {livingLightStemSelection} from '../src/domain/living-light-stem-selection.js';
export const LIVING_LIGHT_SOURCE_POLICY = 'living-light-assets-v1';
const fail=(code,message)=>{throw Object.assign(new Error(message),{code,statusCode:422});};
/** Explicit preparation only. Exact Song/asset declarations; no role-peer joins,
 * Director dependency, filesystem paths supplied by callers, or alignment claims. */
export function livingLightPerformanceInputs({songId,songStore,resolveOptions={},stemSelectionPolicy=null}={}) {
 livingLightStemSelection(stemSelectionPolicy);
 const songs=(songStore?.songs||[]).filter(song=>song.id===songId);
 if(songs.length!==1)fail('living_light_song_ambiguous','Select one exact canonical Song.');
 const song=songs[0],audio=song.audio||{};
 const exactOptions={...resolveOptions,exactIdentityOnly:true};
 const audioUri=audio.localPath||audio.audioPath||audio.uri||`/api/song-registry/audio/${encodeURIComponent(audio.registryTrackId||song.registryTrackId||song.id)}`;
 const master=resolveEchoRuntimeMediaUri(audioUri,exactOptions);
 if(!master.ok)fail('living_light_master_unavailable','The selected Song has no local master route.');
 const declared=livingLightStemDeclarations(song);
 if(new Set(declared.map(row=>row.assetId)).size!==declared.length)fail('living_light_asset_ambiguous','Each declaration needs a unique exact asset ID.');
 const selected=stemSelectionPolicy?new Set(chooseStemSet(song.stems,{songTitle:song.title,preferDirs:[master.resolvedPath]})):null;
 const rows=selected?declared.filter(row=>selected.has(row.stem)):declared;
 if(rows.length>32)fail('living_light_asset_budget','This explicit preparation supports at most 32 stem declarations.');
 const items=rows.map(({stem,assetId})=>{
  if(typeof assetId!=='string'||!assetId.trim()||assetId.length>300)fail('living_light_asset_invalid','Asset identity is invalid.');
  const declaredRole=stemSelectionPolicy?stemRoleLabel(stem):String(stem.stemType||stem.role||stem.kind||stem.title||'unknown');
  const declared=String(stem.localPath||stem.audioPath||stem.uri||'').trim();
  const source=declared?resolveEchoRuntimeMediaUri(declared,exactOptions):null;
  return {id:`stem:${encodeURIComponent(assetId)}`,assetId,declaredRole,stemType:declaredRole,canonicalRole:canonicalLivingLightRole(declaredRole),title:String(stem.title||declaredRole),audioPath:source?.ok?source.resolvedPath:null,sourceState:source?.ok?'resolved-route':'unresolved',alignmentState:'alignment-unverified'};
 });
 return {audioUri,masterPath:master.resolvedPath,graph:{schemaVersion:'hapa.echo.audio-preparation-inputs.v1',source:{songId,identityPolicy:LIVING_LIGHT_SOURCE_POLICY,...(stemSelectionPolicy?{stemSelectionPolicy}:{}),renderCertification:false},song:{id:songId,title:song.title||songId,audioPath:audioUri,lyricOverlay:{}},stems:{items,count:items.length}}};
}
