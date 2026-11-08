import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto,createHash } from 'node:crypto';
import { createWebmMuxer,readEbml,WEBM_IDS as ID } from '../src/domain/webm-muxer.js';
import { assembleEchoStageMatroska } from '../src/components/echo-stage-assemble.js';
const hash=b=>createHash('sha256').update(b).digest('hex');
function wav(){const pcm=Uint8Array.from({length:48000*4},(_,i)=>(i*31)%256),bytes=new Uint8Array(44+pcm.length),v=new DataView(bytes.buffer),put=(i,s)=>[...s].forEach((c,j)=>bytes[i+j]=c.charCodeAt(0));put(0,'RIFF');v.setUint32(4,bytes.length-8,true);put(8,'WAVE');put(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,2,true);v.setUint32(24,48000,true);v.setUint32(28,192000,true);v.setUint16(32,4,true);v.setUint16(34,16,true);put(36,'data');v.setUint32(40,pcm.length,true);bytes.set(pcm,44);return {bytes,pcm};}
test('stage assembly preserves every PCM sample and refuses incomplete or altered sources',async()=>{
 const old=globalThis.crypto;if(!old)globalThis.crypto=webcrypto;
 try{
  const mux=createWebmMuxer({video:{codec:'V_VP9',width:640,height:360}});for(let i=0;i<30;i++)mux.addVideoChunk({data:new Uint8Array([1,i]),timestampUs:Math.round(i*1e6/30),keyframe:i===0});const raw=mux.finalize({durationUs:1000000}),blob=new Blob([raw],{type:'video/webm'});
  const manifest={key:'test',frameCount:30,chunkFrames:30,width:640,height:360,fps:30},receipt={schemaVersion:'hapa.echo.stage-video-chunk.v1',key:'test',startFrame:0,endFrameExclusive:30,width:640,height:360,fps:30,codec:'vp09.00.10.08',audio:null,alpha:false,bytes:blob.size},chunks=[{blob,receipt,blobSha256:hash(raw)}],master=wav();
  const args={manifest,chunks,masterBytes:master.bytes,masterSha256:hash(master.bytes),sampleCount:48000};const result=await assembleEchoStageMatroska(args),bytes=new Uint8Array(await result.blob.arrayBuffer()),segment=readEbml(bytes).find(e=>e.id===ID.Segment),children=e=>readEbml(bytes,e.dataAt,e.dataAt+e.size),parts=[];
  for(const cluster of children(segment).filter(e=>e.id===ID.Cluster))for(const block of children(cluster).filter(e=>e.id===ID.SimpleBlock&&bytes[e.dataAt]===0x82))parts.push(bytes.subarray(block.dataAt+4,block.dataAt+block.size));
  assert.deepEqual(Buffer.concat(parts),Buffer.from(master.pcm));assert.equal(result.receipt.audioSamples,48000);assert.equal(result.receipt.audioCodec,'pcm_s16le');
  await assert.rejects(()=>assembleEchoStageMatroska({...args,masterSha256:'f'.repeat(64)}),/Master SHA/);
  await assert.rejects(()=>assembleEchoStageMatroska({...args,chunks:[]}),/contiguous/);
  await assert.rejects(()=>assembleEchoStageMatroska({...args,manifest:{...manifest,frameCount:29}}),/complete master/);
  await assert.rejects(()=>assembleEchoStageMatroska({...args,chunks:[{...chunks[0],blobSha256:'a'.repeat(64)}]}),/chunk SHA/);
 }finally{if(!old)delete globalThis.crypto;}
});
