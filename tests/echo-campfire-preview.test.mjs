import test from 'node:test';
import assert from 'node:assert/strict';
import { atlasFixture } from './echo-score-dust-fixture.mjs';
import { atlasVisualScore } from '../server/audio-atlas-visual-score.mjs';
import { buildEchoCampfirePreviewPacket } from '../src/domain/echo-campfire-preview.js';
import { readSavedCampfireDirection } from '../vendor/campfire-stage/src/echo/saved-campfire-direction.js';
import { sampleCampfireSpectrum, readCampfireBoundedResponse } from '../src/components/echo-campfire-spectrum-client.js';

function dustFor(songId){
  const result=atlasFixture();result.song_id=songId;
  const value=atlasVisualScore(result);
  return {status:'atlas',validation:{ok:true},score:value.score,timeline:value.timeline,direction:{},settings:{pulse:1,seed:7},saved:null,dirty:true};
}
test('any measured song gets its own automatic Campfire direction without altering saved data',()=>{
  for(const songId of ['dear-papa-song-luna-di-clara','dear-papa-song-write-home','dear-papa-song-thirsty-in-the-dark']){
    const dust=dustFor(songId),before=JSON.stringify(dust),{packet,mode}=buildEchoCampfirePreviewPacket(dust,songId);
    assert.equal(mode,'automatic song direction');assert.equal(packet.direction.campfire.binding.songId,songId);
    assert.equal(readSavedCampfireDirection(packet).status,'saved');
    assert.equal(JSON.stringify(dust),before);
  }
});
test('saved choreography is preserved; stale and foreign bindings are refused',()=>{
  const songId='song',dust=dustFor(songId),extension=buildEchoCampfirePreviewPacket(dust,songId).packet.direction.campfire;
  extension.defaults={plume:{reach:1.4}};dust.saved={revision:1};dust.dirty=false;dust.direction={campfire:extension};
  assert.equal(buildEchoCampfirePreviewPacket(dust,songId).packet.direction.campfire,extension);
  extension.binding.scoreFingerprint='stale';assert.throws(()=>buildEchoCampfirePreviewPacket(dust,songId),/no longer matches/);
  assert.throws(()=>buildEchoCampfirePreviewPacket(dust,'another-song'),/exact master/);
});
test('spectrum is measured from PCM, finite, bounded and cancellable',async()=>{
  const sampleRate=16000,pcm=Float32Array.from({length:sampleRate},(_,i)=>0.4*Math.sin(2*Math.PI*440*i/sampleRate));
  const spectrum=await sampleCampfireSpectrum({channels:[pcm],sampleRate,durationSeconds:1},'a'.repeat(64));
  assert.equal(spectrum.frames.length,11);assert.equal(spectrum.frames[3].length,32);
  assert.ok(spectrum.frames[3].some(n=>n>0));assert.ok(spectrum.frames.flat().every(n=>n>=0&&n<=1));
  const controller=new AbortController();controller.abort();
  await assert.rejects(sampleCampfireSpectrum({channels:[pcm],sampleRate,durationSeconds:1},'a',{signal:controller.signal}),/abort/i);
  await assert.rejects(sampleCampfireSpectrum({channels:[pcm],sampleRate,durationSeconds:1201},'a'),/limit/);
});
test('bounded fetch stops oversized declared and streamed inputs',async()=>{
  await assert.rejects(readCampfireBoundedResponse(new Response(new Uint8Array(5),{headers:{'content-length':'5'}}),4),/memory limit/);
  await assert.rejects(readCampfireBoundedResponse(new Response(new Uint8Array(5)),4),/memory limit/);
  assert.equal((await readCampfireBoundedResponse(new Response(new Uint8Array(4)),4)).byteLength,4);
});
