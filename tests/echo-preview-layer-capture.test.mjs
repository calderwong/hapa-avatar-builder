import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { paintEchoScoreDustRecording } from '../src/domain/echo-score-dust-recording.js';
import { planEchoScoreDustLayer, bindEchoScoreDustLayerRender, compileEchoScoreDustTrack } from '../src/domain/echo-score-dust-layer.js';

function fixture(blend = 'screen') {
  const layer = planEchoScoreDustLayer({ songId:'song',atlasRunId:'run',scoreFingerprint:'fp',seed:7,startSeconds:0,endSeconds:10,opacity:0.4,blend });
  const bound = bindEchoScoreDustLayerRender(layer, { recordingId:'take',uri:'/dust.webm',sha256:'a'.repeat(64),receipt:{schemaVersion:'hapa.echo.score-dust.export.v1',scoreFingerprint:'fp',seed:7,background:'transparent',width:1920,height:1080,fps:30,startSeconds:0,durationSeconds:10} });
  return compileEchoScoreDustTrack({song_id:'song',duration:10,score_dust_layer:bound});
}
test('live capture paints Dust in portrait with the same opacity and blend, restoring the context',()=>{
  const draws=[],ctx={globalAlpha:1,globalCompositeOperation:'source-over',save(){this.saved=[this.globalAlpha,this.globalCompositeOperation];},restore(){[this.globalAlpha,this.globalCompositeOperation]=this.saved;},drawImage(...args){draws.push([this.globalAlpha,this.globalCompositeOperation,...args]);}};
  const video={canvas:{width:1920,height:1080},painted:true,blend:'screen'};
  assert.equal(paintEchoScoreDustRecording(ctx,fixture(),video,1,1080,1920),true);
  assert.equal(draws[0][0],1);assert.equal(draws[0][1],'screen');assert.equal(draws[0][2],video.canvas);
  assert.deepEqual(draws[0].slice(-4),[0,0,1080,1920]);
  assert.equal(ctx.globalAlpha,1);assert.equal(ctx.globalCompositeOperation,'source-over');
  assert.equal(paintEchoScoreDustRecording(ctx,fixture(),video,10,1080,1920),false);
  assert.equal(draws.length,1);
});
test('missing or broken Dust is refused; live capture reuses the visible painted canvas',()=>{
  const track=fixture(),video={canvas:{width:1920,height:1080},painted:true};
  for(const bad of [null,{...video,painted:false},{...video,canvas:null},{...video,canvas:{width:0,height:0}}]){
    assert.throws(()=>paintEchoScoreDustRecording({},track,bad,1,100,100),{code:'score_dust_capture_waiting'});
  }
  assert.throws(()=>paintEchoScoreDustRecording({},track,{...video,error:{}},1,100,100),/could not be decoded/);
  assert.throws(()=>paintEchoScoreDustRecording({},null,video,1,100,100),/Render the Score Dust/);
});
test('the real recorder wires the layer after Living Light and before lyrics and handles waiting independently',()=>{
  const source=fs.readFileSync(new URL('../src/components/HapaEchosView.jsx',import.meta.url),'utf8');
  const composite=source.slice(source.indexOf('const compositePreviewRecordingFrame ='),source.indexOf('const startPreviewRecordingComposite ='));
  assert.ok(composite.indexOf('scoreDustLayerRecordingRef.current')>composite.indexOf('livingLightRecordingRef.current'));
  assert.ok(composite.indexOf('scoreDustLayerRecordingRef.current')<composite.indexOf('paintEchoLyricSurfaceToCanvas'));
  assert.match(source,/captureRef=\{scoreDustLayerRecordingRef\}/);
  assert.match(source,/\['living_light_capture_waiting', 'score_dust_capture_waiting'/);
});
