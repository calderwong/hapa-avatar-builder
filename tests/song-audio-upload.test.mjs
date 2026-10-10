import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {Readable} from 'node:stream';
import {createSongAudioUpload} from '../server/song-audio-upload.mjs';
import {normalizeHapaSong} from '../src/domain/song.js';
import {AUDIO_SLOTS,suggestStemRole,uploadFileError,slotStatus} from '../src/domain/song-audio-upload.js';
const wav=Buffer.concat([Buffer.from('RIFF0000WAVE'),Buffer.alloc(100)]),mp3=Buffer.concat([Buffer.from('ID3'),Buffer.alloc(100)]);
async function setup(t,options={}){
 const root=await fs.mkdtemp(path.join(os.tmpdir(),'song-audio-upload-test-'));t.after(()=>fs.rm(root,{force:true,recursive:true}));await fs.mkdir(path.join(root,'data'));
 const storePath=path.join(root,'data/hapa-songs-store.json'),other={id:'other',unknown:{preserved:true}},song={id:'song',title:'Test song',artist:'original',audio:{},stems:[{id:'v',kind:'Vocals'},{id:'d',kind:'Drums'}],privateField:'preserved'};
 await fs.writeFile(storePath,JSON.stringify({songs:[song,other],unknown:'keep'}));
 const service=createSongAudioUpload({root,...options});
 const upload=async(params={})=>service.upload({songId:'song',kind:'master',format:'wav',filename:'song.WAV',revision:(await service.status('song')).revision,stream:Readable.from([wav]),...params});
 return {root,storePath,service,upload,other,read:async()=>JSON.parse(await fs.readFile(storePath))};
}
test('four upload slots persist, retain both formats per role, back up and preserve all other song data',async t=>{
 const f=await setup(t);const before=await fs.readFile(f.storePath);
 for(const kind of ['master','stem'])for(const format of ['wav','mp3']){
  const r=await f.upload({kind,format,filename:`audio.${format}`,role:'Vocals',stream:Readable.from([format==='wav'?wav:mp3])});
  assert.equal(r.inventory[kind==='master'?format:format+'_stems'].state,kind==='master'?'available':'partial');
 }
 const store=await f.read();assert.deepEqual(store.songs[1],f.other);assert.equal(store.unknown,'keep');assert.equal(store.songs[0].privateField,'preserved');assert.equal(store.songs[0].stems.length,2);
 const song=store.songs[0];assert.match(song.audio.localPath,/\.wav$/);assert.match(song.stems[0].localPath,/\.wav$/);assert.equal(song.stems[0].audioUploads.length,2);
 const normalized=normalizeHapaSong(song);assert.deepEqual(normalized.audio.audioUploads,song.audio.audioUploads);assert.equal(normalized.audio.mp3Path,song.audio.mp3Path);assert.deepEqual(normalized.stems[0],song.stems[0]);
 const backups=await fs.readdir(path.join(f.root,'data/backups'));assert.equal(backups.length,4);assert.ok((await Promise.all(backups.map(n=>fs.readFile(path.join(f.root,'data/backups',n))))).some(b=>b.equals(before)));
 const r=await f.service.status('song');assert.equal(r.inventory.wav_stems.present,1);assert.equal(r.inventory.mp3_stems.present,1);assert.deepEqual(r.inventory.wav_stems.missing_roles,['Drums']);
});
test('uploading WAV preserves a legacy MP3-only localPath and does not alter original bytes',async t=>{
 const f=await setup(t),original=path.join(f.root,'original.mp3');await fs.writeFile(original,mp3);const store=await f.read();store.songs[0].audio={localPath:original};await fs.writeFile(f.storePath,JSON.stringify(store));
 const r=await f.upload();assert.equal(r.inventory.mp3.state,'available');assert.equal(r.inventory.wav.state,'available');assert.deepEqual(await fs.readFile(original),mp3);assert.equal((await f.read()).songs[0].audio.mp3Path,original);
});
test('existing files require explicit replacement and replaced files remain recoverable',async t=>{
 const f=await setup(t);await f.upload();const before=await fs.readFile(f.storePath),old=(await f.read()).songs[0].audio.localPath;
 await assert.rejects(f.upload(),/already has/);assert.deepEqual(await fs.readFile(f.storePath),before);
 await f.upload({replace:true});assert.deepEqual(await fs.readFile(old),wav);assert.notEqual((await f.read()).songs[0].audio.localPath,old);
});
test('rejects traversal, format mismatch, empty, oversized and unknown-song uploads without store changes',async t=>{
 const f=await setup(t,{maxBytes:120}),before=await fs.readFile(f.storePath);
 for(const params of [{filename:'../../x.wav'},{filename:'a.mp3'},{format:'zip'},{role:'../x',kind:'stem'},{songId:'missing'},{stream:Readable.from([mp3])},{stream:Readable.from([])},{stream:Readable.from([wav,wav])}])await assert.rejects(f.upload(params));
 assert.deepEqual(await fs.readFile(f.storePath),before);assert.deepEqual(await fs.readdir(path.join(f.root,'data/song-audio-uploads')),[]);
});
test('revision conflict and interrupted stream discard staging bytes without modifying store',async t=>{
 const f=await setup(t),before=await fs.readFile(f.storePath);
 await assert.rejects(f.upload({revision:'stale'}),/Song changed/);
 async function* interrupted(){yield wav;throw new Error('connection lost');}
 await assert.rejects(f.upload({stream:Readable.from(interrupted())}),/connection lost/);
 assert.deepEqual(await fs.readFile(f.storePath),before);assert.deepEqual(await fs.readdir(path.join(f.root,'data/song-audio-uploads')),[]);
});
test('rechecks song revision after streaming; unrelated song edits survive',async t=>{
 const f=await setup(t);
 async function* changed(){yield wav;const store=await f.read();store.songs[0].title='Changed elsewhere';await fs.writeFile(f.storePath,JSON.stringify(store));}
 await assert.rejects(f.upload({stream:Readable.from(changed())}),/changed during upload/);assert.equal((await f.read()).songs[0].audio.localPath,undefined);
 async function* unrelated(){yield wav;const store=await f.read();store.songs[1].newField='keep';await fs.writeFile(f.storePath,JSON.stringify(store));}
 await f.upload({stream:Readable.from(unrelated())});assert.equal((await f.read()).songs[1].newField,'keep');
});
test('concurrent same-slot uploads cannot silently overwrite each other',async t=>{
 const f=await setup(t),revision=(await f.service.status('song')).revision;
 const results=await Promise.allSettled([f.upload({revision}),f.upload({revision})]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal((await f.read()).songs[0].audio.audioUploads.length,1);
});
test('UI accepts correct formats, only suggests exact roles, and labels unknown expectations honestly',()=>{
 assert.equal(AUDIO_SLOTS.length,4);assert.equal(suggestStemRole('02-backing-vocals.WAV'),'Backing Vocals');assert.equal(suggestStemRole('a song about drums.mp3'),'');
 assert.equal(uploadFileError({name:'track.wave',size:500},AUDIO_SLOTS[0]),'');assert.match(uploadFileError({name:'track.mp3',size:500},AUDIO_SLOTS[0]),/Choose WAV/);
 assert.match(slotStatus({expected:0},true),/unknown/);
});
