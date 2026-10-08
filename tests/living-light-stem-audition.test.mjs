import test from 'node:test';
import assert from 'node:assert/strict';
import {selectEchoPlaybackSource} from '../server/echo-playback-selection.mjs';
import {buildLivingLightSongCatalog} from '../src/domain/living-light-source-binding.js';
import {prepareEchoAudioPlayback} from '../src/domain/echo-audio-playback.js';
import {transitionLivingLightAudition} from '../src/domain/living-light-audition.js';
const songStore={songs:[{id:'song',stems:[{id:'archive',kind:'archive-zip',localPath:'/source/archive.zip'},{stemType:'Guitar',localPath:'/source/a.wav'},{id:'guitar-b',stemType:'Guitar',localPath:'/source/b.wav'},{id:'alien',stemType:'Unmapped instrument',uri:'https://example.invalid/audio.wav'}]},{id:'other-song',stems:[{id:'guitar-b',stemType:'Guitar',localPath:'/source/other.wav'}]}]};
const select=assetId=>selectEchoPlaybackSource({songId:'song',assetId,audioUri:'/source/master.wav',songStore});
test('same-role assets and archive-adjacent fallback identities retain exact source selection',()=>{
 const before=JSON.stringify(songStore);
 const catalog=buildLivingLightSongCatalog(songStore.songs,{assetInventoryBySongId:{song:{'song:declared:1':{state:'available'}}}});
 assert.equal(catalog[0].stems[0].assetId,'song:declared:1');assert.equal(catalog[0].stems[0].state,'available');
 assert.equal(select('song:declared:1').sourcePath,'/source/a.wav');assert.equal(select('guitar-b').sourcePath,'/source/b.wav');
 assert.equal(select('guitar-b').sourceSelection.alignmentState,'alignment-unverified');assert.equal(select('guitar-b').sourceSelection.clock,'source-local');
 assert.equal(select(null).sourcePath,'/source/master.wav');assert.equal(JSON.stringify(songStore),before);
});
test('unknown, archive, duplicate, cross-song and nonlocal sources reject without substitution',()=>{
 for(const id of ['archive','missing'])assert.throws(()=>select(id),{code:'echo_playback_asset_unresolved'});
 assert.throws(()=>select('alien'),{code:'echo_playback_asset_unavailable'});
 const duplicate=structuredClone(songStore);duplicate.songs[0].stems.push({...duplicate.songs[0].stems[2]});
 assert.throws(()=>selectEchoPlaybackSource({songId:'song',assetId:'guitar-b',songStore:duplicate}),{code:'echo_playback_asset_unresolved'});
 assert.throws(()=>selectEchoPlaybackSource({songId:'absent',assetId:'guitar-b',songStore}),{code:'echo_playback_song_unresolved'});
 const unknown={songs:[{id:'song',stems:[{id:'u',stemType:'Unknown',localPath:'/source/u.wav'}]}]};
 assert.equal(selectEchoPlaybackSource({songId:'song',assetId:'u',songStore:unknown}).sourceSelection.canonicalRole,null);
});
const result={sourceUri:'hapa-stem:song:guitar-b',sourceSelection:{kind:'stem',songId:'song',assetId:'guitar-b',clock:'source-local',alignmentState:'alignment-unverified'},sourceHash:'a'.repeat(64),pcmSha256:'b'.repeat(64),durationSeconds:12,sampleRate:48000,channels:2,byteSize:48000*12*8+44,fidelity:'source-equivalent-ffmpeg-decoded-float32'};
test('client sends exact asset selection and releases only that source session',async()=>{
 const calls=[],controller=new AbortController();
 const prepared=await prepareEchoAudioPlayback({songId:'song',assetId:'guitar-b',signal:controller.signal,requestId:'stem-request-000001',fetchImpl:async(url,options)=>{calls.push({url,...options});return {ok:true,json:async()=>({id:'stem-job',kind:'playback-audio',status:'ready',result})};}});
 assert.match(calls[0].url,/assetId=guitar-b/);assert.equal(prepared.receipt.sourceSelection.assetId,'guitar-b');
 assert.equal(prepared.receipt.sourceUri,result.sourceUri);controller.abort();prepared.release();await Promise.resolve();
 assert.equal(calls.filter(row=>row.method==='DELETE').length,1);assert.match(calls.at(-1).url,/jobId=stem-job/);
});
test('client rejects same-role peers, wrong song, invented alignment and a mismatched opaque source route',async()=>{
 for(const wrong of [{...result,sourceSelection:{...result.sourceSelection,assetId:'guitar-a'}},{...result,sourceSelection:{...result.sourceSelection,songId:'other-song'}},{...result,sourceSelection:{...result.sourceSelection,alignmentState:'verified'}},{...result,sourceUri:'/source/private.wav'}]){
  const calls=[];await assert.rejects(prepareEchoAudioPlayback({songId:'song',assetId:'guitar-b',fetchImpl:async(url,options)=>{calls.push(options.method);return {ok:true,json:async()=>({id:'wrong',kind:'playback-audio',status:'ready',result:wrong})};}}),/does not match/);await Promise.resolve();assert.equal(calls.filter(method=>method==='DELETE').length,1);
 }
});
test('audition switches preserve held master time, restore paused position and reset across songs',()=>{
 const first=transitionLivingLightAudition(null,{songId:'song',assetId:'guitar-a',songSeconds:14.125});
 assert.equal(first.heldSongSeconds,14.125);assert.equal(first.restoreSeconds,0);
 const second=transitionLivingLightAudition(first,{songId:'song',assetId:'guitar-b',songSeconds:999});assert.equal(second.heldSongSeconds,14.125);
 const master=transitionLivingLightAudition(second,{songId:'song',songSeconds:999});assert.equal(master.assetId,null);assert.equal(master.restoreSeconds,14.125);
 const later=transitionLivingLightAudition(master,{songId:'song',assetId:'guitar-a',songSeconds:23.25});assert.equal(later.heldSongSeconds,23.25);
 assert.equal(transitionLivingLightAudition(later,{songId:'new-song',songSeconds:23.25}).restoreSeconds,0);
 assert.throws(()=>transitionLivingLightAudition(later,{songId:'song',songSeconds:Infinity}));
});
