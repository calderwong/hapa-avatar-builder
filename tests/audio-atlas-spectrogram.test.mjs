import {readSpectrogramWindow} from '../src/domain/audio-atlas-spectrogram.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {querySpectrogram,validateSpectrogram} from '../server/audio-atlas-spectrogram.mjs';
import {validateAtlasResult} from '../server/audio-atlas.mjs';
const sha=b=>createHash('sha256').update(b).digest('hex');
function fixture(t){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'hapa-atlas-spectrum-test-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const bytes=Buffer.from([10,20,30,40,50,60]);
 const asset={id:'master',source_sha256:'a'.repeat(64),timeline_id:'t',sample_rate_hz:8000,sample_count:23,channels:2,status:'ready'};
 asset.spectrogram={frequency_units:'Hz',level_units:'dBFS of peak single-sided FFT-bin amplitude per band; not PSD or loudness',sparse_snapshots:false,status:'complete',method:'hapa.channel-stft-display.v1',source_asset_id:'master',source_sha256:asset.source_sha256,timeline_id:'t',sample_rate_hz:8000,sample_count:23,channels:2,hop_samples:10,frame_count:3,fft_size:512,window:'periodic Hann',centered:true,first_frame_sample:0,time_map:{numerator:1,denominator:1,offset_samples:0,target:'own decoded source timeline'},band_count:1,bands:[{first_fft_bin:0,end_fft_bin:257,low_hz:0,high_hz:4000}],encoding:{dtype:'uint8',axis_order:['frame','channel','band'],offset_db:-120,step_db:.5,min:0,max:240},artifact:'spectrogram-master.u8',artifact_sha256:sha(bytes),byte_length:6};
 fs.writeFileSync(path.join(dir,asset.spectrogram.artifact),bytes);return {asset,dir};
}
test('spectral windows preserve source/channel identity, frame centers and padded support',t=>{
 const {asset,dir}=fixture(t);const r=querySpectrogram(asset,dir,{start:0,end:23,channel:1});assert.equal(r.total,3);assert.deepEqual(r.frames.map(f=>f.values),[[20],[40],[60]]);assert.deepEqual(r.frames.map(f=>f.center_sample),[0,10,20]);assert.equal(r.source_sha256,asset.source_sha256);assert.equal(r.frames[0].support_start_sample,0);assert.equal(r.frames[2].support_end_sample,23);
 const short=querySpectrogram(asset,dir,{start:5,end:15,channel:0});assert.equal(short.frames.length,1);assert.equal(short.frames[0].center_sample,10);
 const last=querySpectrogram(asset,dir,{start:22,end:23});assert.equal(last.frames.length,1);assert.equal(last.frames[0].cell_end_sample,23);
});
test('odd hop boundaries and final tail are covered once with half-open cells',t=>{
 const {asset,dir}=fixture(t);asset.sample_count=asset.spectrogram.sample_count=14;asset.spectrogram.hop_samples=5;
 for(let start=0;start<14;start++){const r=querySpectrogram(asset,dir,{start,end:start+1});assert.equal(r.frames.length,1);assert.ok(r.frames[0].cell_start_sample<=start&&r.frames[0].cell_end_sample>start);}
});
test('pagination is bounded and never silently replaces omitted frames',t=>{
 const {asset,dir}=fixture(t);const r=querySpectrogram(asset,dir,{start:0,end:23,limit:1});assert.equal(r.total,3);assert.equal(r.truncated,true);assert.equal(r.frames.length,1);
 assert.equal(querySpectrogram(asset,dir,{start:0,end:23,offset:2}).frames[0].center_sample,20);assert.equal(querySpectrogram(asset,dir,{start:0,end:23,offset:3}).frames.length,0);
 for(const args of [{channel:2},{channel:-1},{limit:1001},{limit:1.5},{offset:-1},{start:-1},{end:24}])assert.throws(()=>querySpectrogram(asset,dir,{start:0,end:23,...args}));
});
test('metadata validates exact source, rational map, units/encoding and frequency partitions',t=>{
 const {asset}=fixture(t);assert.equal(validateSpectrogram(asset).status,'complete');validateAtlasResult({assets:[asset],observations:[]});
 const changes=[s=>s.frequency_units='kHz',s=>s.timeline_id='other',s=>s.source_sha256='b'.repeat(64),s=>s.channels=1,s=>s.frame_count=4097,s=>s.centered=false,s=>s.time_map.offset_samples=1,s=>s.bands[0].high_hz=3999,s=>s.encoding.step_db=1,s=>s.artifact='../escape',s=>s.byte_length=100];
 for(const change of changes){const a=structuredClone(asset);change(a.spectrogram);assert.throws(()=>validateSpectrogram(a));assert.throws(()=>validateAtlasResult({assets:[a],observations:[]}));}
});
test('missing or tampered evidence fails; legacy missing measurement is not silence',t=>{
 const {asset,dir}=fixture(t);assert.equal(querySpectrogram({...asset,spectrogram:null},dir,{start:0,end:23}).state,'not_available');
 const file=path.join(dir,asset.spectrogram.artifact);fs.appendFileSync(file,'!');assert.throws(()=>querySpectrogram(asset,dir,{start:0,end:23}),/integrity/);fs.unlinkSync(file);assert.throws(()=>querySpectrogram(asset,dir,{start:0,end:23}),/unavailable/);
});


test('UI reads both bounded pages before presenting a complete 30-second window',async()=>{
 let calls=0;const first={state:'complete',total:1201,offset:0,channel:1,timeline_id:'t',artifact_sha256:'h',truncated:true,frames:Array.from({length:1000},(_,i)=>({center_sample:i}))};
 const next={...first,offset:1000,truncated:false,frames:Array.from({length:201},(_,i)=>({center_sample:1000+i}))};
 const r=await readSpectrogramWindow(async route=>{calls++;if(calls===2)assert.ok(route.endsWith('&offset=1000'));return calls===1?first:next;},'/query?limit=1000');
 assert.equal(calls,2);assert.equal(r.frames.length,1201);assert.equal(r.frames.at(-1).center_sample,1200);assert.equal(r.truncated,false);
});
test('UI rejects incomplete or mismatched pages without more requests',async()=>{
 for(const next of [{state:'complete',truncated:false,total:1201,offset:1000,channel:0,frames:[]},{state:'failed'}]){
  let calls=0;await assert.rejects(readSpectrogramWindow(async()=>{calls++;return calls===1?{state:'complete',truncated:true,total:1201,frames:Array(1000).fill(0),channel:1}:next;},'/query?limit=1000'),/match/);assert.equal(calls,2);
 }
 await assert.rejects(readSpectrogramWindow(async()=>({state:'complete',total:1203,frames:[]}),'/query'),/bounded/);
 await assert.rejects(readSpectrogramWindow(async()=>({state:'complete',total:1,frames:[]}),'/query'),/Incomplete/);
});
test('UI keeps read failures and empty legacy results explicit',async()=>{
 await assert.rejects(readSpectrogramWindow(async()=>{throw new Error('saved spectral evidence unavailable');},'/query'),/unavailable/);
 const empty={state:'not_available',frames:[]};assert.equal(await readSpectrogramWindow(async()=>empty,'/query'),empty);
});
