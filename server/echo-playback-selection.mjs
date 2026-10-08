import {livingLightStemDeclarations,canonicalLivingLightRole} from '../src/domain/living-light-source-binding.js';
import {resolveEchoRuntimeMediaUri} from './echo-runtime-media-route.mjs';
const fail=(code,message,statusCode=422)=>{throw Object.assign(Error(message),{code,statusCode});};

/** Server-owned selection only. No path from a browser, role/name join,
 * alignment inference, source substitution or extra preparation queue. */
export function selectEchoPlaybackSource({songId,assetId=null,audioUri,songStore,resolveOptions={}}){
 if(!assetId){const source=resolveEchoRuntimeMediaUri(audioUri,resolveOptions);if(!source.ok)fail('echo_playback_source_unresolved','The selected master has no verified local route.');return {sourcePath:source.resolvedPath,sourceUri:audioUri,sourceSelection:{kind:'master',songId}};}
 if(typeof assetId!=='string'||!assetId.trim()||assetId.length>300)fail('echo_playback_asset_invalid','Select an exact registered stem asset.');
 const songs=(songStore?.songs||[]).filter(song=>song.id===songId);
 if(songs.length!==1)fail('echo_playback_song_unresolved','The exact Song identity is missing or ambiguous.',404);
 const matches=livingLightStemDeclarations(songs[0]).filter(row=>row.assetId===assetId);
 if(matches.length!==1)fail('echo_playback_asset_unresolved','The exact stem asset is missing, archived or ambiguous.',404);
 const stem=matches[0].stem,declared=String(stem.localPath||stem.audioPath||stem.uri||'').trim();
 const source=resolveEchoRuntimeMediaUri(declared,resolveOptions);
 if(!declared||!source.ok)fail('echo_playback_asset_unavailable','The selected stem has no readable local source route.');
 const declaredRole=stem.stemType||stem.kind||stem.title||stem.id||'unknown';
 return {sourcePath:source.resolvedPath,sourceUri:`hapa-stem:${encodeURIComponent(songId)}:${encodeURIComponent(assetId)}`,sourceSelection:{kind:'stem',songId,assetId,declaredRole,canonicalRole:canonicalLivingLightRole(declaredRole),clock:'source-local',alignmentState:'alignment-unverified'}};
}
