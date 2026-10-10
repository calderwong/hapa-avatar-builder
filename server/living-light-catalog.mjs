import fs from 'node:fs/promises';
import {inspectAudioInventory,inspectExactAudioReference} from './audio-atlas-inventory.mjs';
import {resolveEchoRuntimeMediaUri} from './echo-runtime-media-route.mjs';
import {buildLivingLightSongCatalog,livingLightStemDeclarations} from '../src/domain/living-light-source-binding.js';
/** Owning Song store and Atlas inventory remain authoritative; read-only adapter. */
export async function readLivingLightSongCatalog({songStorePath,root,songId=null,inventory=null,assetInventoryBySongId=null}) {
 const store=JSON.parse(await fs.readFile(songStorePath,'utf8'));
 if(songId){const matches=(store.songs||[]).filter(song=>song.id===songId);if(matches.length!==1)throw Object.assign(Error('Select one exact registered Song ID.'),{code:'living_light_song_not_found',statusCode:404});store.songs=matches;}
 const inspected=inventory||await inspectAudioInventory(store.songs||[],{root});
 // Atlas role summaries cannot certify each declaration: placeholders and repeated
 // same-role sources require separate owner checks against their own references.
 const assets=assetInventoryBySongId||{};
 if(!assetInventoryBySongId){
  const requests=(store.songs||[]).flatMap(song=>livingLightStemDeclarations(song).map(row=>({song,...row})));
  let cursor=0;
  await Promise.all(Array.from({length:Math.min(4,requests.length)},async()=>{
   while(cursor<requests.length){const {song,stem,assetId}=requests[cursor++];
    let resolved;try{resolved=resolveEchoRuntimeMediaUri(stem.localPath||stem.audioPath||stem.uri,{root});}catch{resolved=null;}
    assets[song.id]??={};assets[song.id][assetId]=await inspectExactAudioReference(resolved?.resolvedPath);
   }
  }));
 }
 const songs=buildLivingLightSongCatalog(store.songs||[],{inventoryById:Object.fromEntries(inspected.songs.map(s=>[s.id,s])),assetInventoryBySongId:assets});
 return {schemaVersion:'hapa.living-light.catalog.v1',songs,summary:inspected.summary,checkedAt:inspected.checked_at,verification: 'identity-and-readable-header-only',decodeVerified:false,analysisOnList:false};
}
