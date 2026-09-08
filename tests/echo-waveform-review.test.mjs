import test from 'node:test';
import assert from 'node:assert/strict';
import { readEchoPlaybackWaveform } from '../src/domain/echo-audio-playback.js';
import { applyEchoLyricCorrection, summarizeEchoLyricOnsetReview } from '../src/domain/echo-lyric-timing-editor.js';
import { buildCueGraph } from '../src/domain/echo-director-v2.js';
import { createEchoDirectionWorkingFork, buildEchoDirectionForkRequest, deriveEchoDirectionVariantProject } from '../src/domain/echo-direction-variants.js';
const hash='a'.repeat(64);
function wav({rate=8000,channels=2,seconds=2,extensible=false}={}) {
 const offset=extensible?68:44, frames=rate*seconds, bytes=Buffer.alloc(offset+frames*channels*4);
 bytes.write('RIFF');bytes.writeUInt32LE(bytes.length-8,4);bytes.write('WAVEfmt ',8);bytes.writeUInt32LE(extensible?40:16,16);
 bytes.writeUInt16LE(extensible?65534:3,20);bytes.writeUInt16LE(channels,22);bytes.writeUInt32LE(rate,24);bytes.writeUInt32LE(rate*channels*4,28);bytes.writeUInt16LE(channels*4,32);bytes.writeUInt16LE(32,34);
 if(extensible){bytes.writeUInt16LE(22,36);bytes.writeUInt16LE(32,38);bytes.writeUInt32LE(3,44);Buffer.from([0,0,16,0,128,0,0,170,0,56,155,113]).copy(bytes,48)}
 bytes.write('data',offset-8);bytes.writeUInt32LE(bytes.length-offset,offset-4);
 for(let i=0;i<frames;i++)for(let c=0;c<channels;c++)bytes.writeFloatLE(c%2?-.25:.75,offset+(i*channels+c)*4);
 return {bytes,offset,receipt:{fidelity:'source-equivalent-ffmpeg-decoded-float32',sourceHash:hash,pcmSha256:'b'.repeat(64),byteSize:bytes.length,sampleRate:rate,channels}};
}
function source(w,mutate) {const reads=[];return {reads,fetchImpl:async(url,{headers})=>{const [,a,b]=/bytes=(\d+)-(\d+)/.exec(headers.Range),start=+a,end=+b;reads.push([start,end]);return mutate?.(w,start,end)||new Response(w.bytes.subarray(start,end+1),{status:206,headers:{'content-range':`bytes ${start}-${end}/${w.bytes.length}`}})}}}
test('range waveform matches channel extrema and exact source time in float and extensible WAV',async()=>{
 for(const extensible of [false,true]){const w=wav({extensible}),s=source(w),result=await readEchoPlaybackWaveform({url:'prepared',receipt:w.receipt,startSeconds:.5,endSeconds:1,bins:4,...s});
 assert.equal(result.peaks.length,4);assert.deepEqual(result.peaks.map(p=>[p.minimum,p.maximum]),Array(4).fill([-.25,.75]));assert.equal(result.startSeconds,.5);assert.equal(result.endSeconds,1);assert.equal(result.sourceHash,hash);assert.deepEqual(s.reads[1],[w.offset+4000*8,w.offset+8000*8-1]);assert.equal(result.peakResolutionSeconds,.125)}
});
test('large waveform requests obey byte, duration and compact peak budgets',async()=>{
 const w=wav({rate:192000,channels:8,seconds:2}),s=source(w),result=await readEchoPlaybackWaveform({url:'prepared',receipt:w.receipt,startSeconds:0,endSeconds:2,bins:100000,...s});
 assert.ok(result.bytesRead<=4*1024**2+65536);assert.equal(result.peaks.length,2000);assert.equal(result.limited,true);assert.ok(result.endSeconds<1);
 const mono=wav({seconds:15,channels:1});const r=await readEchoPlaybackWaveform({url:'prepared',receipt:mono.receipt,startSeconds:0,endSeconds:15,...source(mono)});assert.equal(r.endSeconds,12);assert.equal(r.limited,true);
});
test('waveform rejects full responses, stale size, truncation, format mismatch and cancellation',async()=>{
 const w=wav();let cancelled=false;
 await assert.rejects(readEchoPlaybackWaveform({url:'prepared',receipt:w.receipt,startSeconds:0,endSeconds:1,fetchImpl:async()=>({status:200,headers:new Headers(),body:{cancel:async()=>{cancelled=true}}})}),/range/);assert.equal(cancelled,true);
 for(const mutate of [
 (w,a,b)=>new Response(w.bytes.subarray(a,b+1),{status:206,headers:{'content-range':`bytes ${a}-${b}/${w.bytes.length+1}`}}),
 (w,a,b)=>new Response(w.bytes.subarray(a,b),{status:206,headers:{'content-range':`bytes ${a}-${b}/${w.bytes.length}`}})
 ])await assert.rejects(readEchoPlaybackWaveform({url:'prepared',receipt:w.receipt,startSeconds:0,endSeconds:1,...source(w,mutate)}),/changed|truncated/);
 await assert.rejects(readEchoPlaybackWaveform({url:'prepared',receipt:{...w.receipt,channels:1},startSeconds:0,endSeconds:1,...source(w)}),/format/);
 const controller=new AbortController();controller.abort();const s=source(w);await assert.rejects(readEchoPlaybackWaveform({url:'prepared',receipt:w.receipt,startSeconds:0,endSeconds:1,signal:controller.signal,...s}),/cancelled/);assert.equal(s.reads.length,0);
});
const fixture=()=>({song_id:'synthetic-reference',audio_id:'fixture',duration:5,lyrics:{audioHash:hash},timeline:[],visualizer_timeline:[],timed_lyrics:[{text:'hold on',start:1,end:4,words:[{word:'hold',start:1.2,end:2,confidence:.8},{word:'on',start:2.5,end:3,confidence:.7}]}]});
const edit=(p,c)=>({...p,...applyEchoLyricCorrection(p,c,{at:'2026-09-08T00:00:00Z'})});
const reference={type:'reference-onset',atSeconds:1.25,ambiguityMs:20,reviewer:'Automated fixture; not human',audioHash:hash};
test('reference comparison keeps imported error independent of correction and retains locks and confidence',()=>{
 const original=fixture();let p=edit(original,{type:'lock-word',locked:true});p=edit(p,reference);assert.equal(p.timed_lyrics[0].words[0].confidence,.8);assert.equal(p.timed_lyrics[0].words[0].manualTimingLocked,true);
 p=edit(p,{type:'lock-word',locked:false});p=edit(p,{type:'shift-word',deltaSeconds:.05});
 const report=summarizeEchoLyricOnsetReview(p,hash);assert.equal(report.referencedWords,1);assert.ok(Math.abs(report.importedCandidate.medianMs-50)<1e-9);assert.equal(report.corrected.medianMs,0);assert.equal(report.maximumDeclaredAmbiguityMs,20);
 assert.equal(p.timed_lyrics[0].words[0].confidence,null);assert.deepEqual(original,fixture());
 const stale=summarizeEchoLyricOnsetReview(p,'c'.repeat(64));assert.equal(stale.referencedWords,0);assert.equal(stale.rejected.length,1);assert.equal(stale.corrected.p95Ms,null);
});
test('invalid observations cannot become review evidence and text splitting cannot copy an onset to new tokens',()=>{
 for(const change of [{audioHash:'c'.repeat(64)},{reviewer:' '},{ambiguityMs:''},{ambiguityMs:null},{ambiguityMs:1001},{atSeconds:-1},{atSeconds:6}])assert.throws(()=>edit(fixture(),{...reference,...change}));
 let p=edit(fixture(),reference);let invalid=structuredClone(p);invalid.timed_lyrics[0].words[0].timingReference.ambiguityMs=null;assert.equal(summarizeEchoLyricOnsetReview(invalid,hash).referencedWords,0);
 p=edit(p,{type:'split-word',atSeconds:1.5,left:'ho',right:'ld'});assert.equal(summarizeEchoLyricOnsetReview(p,hash).referencedWords,0);
 p=edit(p,{...reference,atSeconds:1.22});assert.equal(summarizeEchoLyricOnsetReview(p,hash).importedCandidate.count,0);
});
test('reference survives fork serialization, compiled cue projection and undo without promoting source confidence',()=>{
 const original=fixture(),fork=createEchoDirectionWorkingFork(original,{id:'parent',timeline:[],visualizer_timeline:[]});fork.project=edit(fork.project,reference);
 const request=JSON.parse(JSON.stringify(buildEchoDirectionForkRequest(fork))),reloaded=deriveEchoDirectionVariantProject(original,{id:'child',timeline:request.timeline,visualizer_timeline:request.visualizerTimeline,project_patch:request.projectPatch});
 assert.equal(summarizeEchoLyricOnsetReview(reloaded,hash).referencedWords,1);assert.deepEqual(buildCueGraph(reloaded).lyricCues[0].words[0].timingReference,reloaded.timed_lyrics[0].words[0].timingReference);
 assert.deepEqual(edit(reloaded,{type:'undo'}).timed_lyrics,original.timed_lyrics);
});
