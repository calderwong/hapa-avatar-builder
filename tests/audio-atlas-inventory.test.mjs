import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {inspectSongAudio,inspectAudioInventory} from '../server/audio-atlas-inventory.mjs';
const mp3=Buffer.concat([Buffer.from('ID3'),Buffer.alloc(32)]),wav=Buffer.concat([Buffer.from('RIFF0000WAVE'),Buffer.alloc(32)]);
async function setup(t){const root=await fs.mkdtemp(path.join(os.tmpdir(),'atlas-inventory-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));return root;}
test('discovers exact uppercase WAV counterpart and ignores stale localAvailable claims',async t=>{
 const root=await setup(t),file=path.join(root,'song.mp3');await fs.writeFile(file,mp3);await fs.writeFile(path.join(root,'song.WAV'),wav);
 let result=await inspectSongAudio({id:'a',audio:{localPath:file,localAvailable:false}});assert.equal(result.wav.state,'available');assert.equal(result.mp3.state,'available');
 await fs.rm(file);result=await inspectSongAudio({id:'a',audio:{localPath:file,localAvailable:true}});assert.equal(result.mp3.state,'missing');assert.equal(result.wav.state,'available');
});
test('deduplicates role labels and reports a partial MP3 stem set',async t=>{
 const root=await setup(t);await fs.writeFile(path.join(root,'v.mp3'),mp3);await fs.writeFile(path.join(root,'d.wav'),wav);
 const song={id:'b',audio:{},stems:[{kind:'Vocals',localPath:path.join(root,'v.mp3')},{kind:'vocals'},{kind:'Drums',localPath:path.join(root,'d.wav')},{kind:'archive-zip',localPath:path.join(root,'stems.zip')}]};
 const r=await inspectSongAudio(song);assert.equal(r.mp3_stems.expected,2);assert.equal(r.mp3_stems.present,1);assert.equal(r.mp3_stems.state,'partial');assert.deepEqual(r.mp3_stems.missing_roles,['Drums']);
});
test('wrong container and remote-only references never become available',async t=>{
 const root=await setup(t);await fs.writeFile(path.join(root,'song.mp3'),wav);
 const r=await inspectSongAudio({audio:{localPath:path.join(root,'song.mp3')}});assert.equal(r.mp3.state,'invalid');
 const remote=await inspectSongAudio({audio:{mp3Uri:'https://example.test/song.mp3',wavUri:'/api/song-registry/a'},stems:[]});assert.equal(remote.mp3.state,'unresolved');assert.equal(remote.wav.state,'unresolved');assert.equal(remote.mp3_stems.state,'missing');
});
test('inventory preserves song order and reports per-format totals',async t=>{
 const root=await setup(t);await fs.writeFile(path.join(root,'song.mp3'),mp3);
 const r=await inspectAudioInventory([{id:'a',audio:{localPath:path.join(root,'song.mp3')}},{id:'b',audio:{localPath:path.join(root,'gone.mp3')}}],{root});assert.deepEqual(r.songs.map(s=>s.id),['a','b']);assert.equal(r.summary.mp3,1);assert.equal(r.summary.wav,0);
});

test('matches differing ingest numeric prefixes without matching unrelated roles or song titles',async t=>{
 const root=await setup(t);await fs.writeFile(path.join(root,'10-vocals.wav'),wav);await fs.writeFile(path.join(root,'01-vocals.mp3'),mp3);await fs.writeFile(path.join(root,'02-backing-vocals.mp3'),mp3);
 const result=await inspectSongAudio({stems:[{kind:'vocals',localPath:path.join(root,'10-vocals.wav')},{kind:'drums',localPath:path.join(root,'11-drums.wav')}]});
 assert.equal(result.mp3_stems.present,1);assert.equal(result.mp3_stems.roles[0].files[0].path,path.join(root,'01-vocals.mp3'));assert.deepEqual(result.mp3_stems.missing_roles,['drums']);
 const other=await inspectSongAudio({stems:[{kind:'vocals',localPath:path.join(root,'another-song-vocals.wav')}]});assert.equal(other.mp3_stems.present,0);
});


test('registered alternate audio containers find exact format siblings without inventing source quality',async t=>{
 const root=await setup(t);await fs.writeFile(path.join(root,'song.mp3'),mp3);await fs.writeFile(path.join(root,'song.WAV'),wav);
 for(const extension of ['m4a','flac','ogg','opus','aac','aiff','aif','wave']){
  const r=await inspectSongAudio({audio:{localPath:path.join(root,'song.'+extension)}});
  assert.equal(r.mp3.state,'available',extension);assert.equal(r.wav.state,'available',extension);assert.equal(r.decode_verified,false);
 }
 const unrelated=await inspectSongAudio({audio:{localPath:path.join(root,'different.m4a')}});assert.equal(unrelated.mp3.state,'missing');
 const nonAudio=await inspectSongAudio({audio:{localPath:path.join(root,'song.txt')}});assert.equal(nonAudio.mp3.state,'unresolved');
 const endpoint=await inspectSongAudio({audio:{localPath:'/api/song-registry/song.m4a'}});assert.equal(endpoint.mp3.state,'unresolved');
});
