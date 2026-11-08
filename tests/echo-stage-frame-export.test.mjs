import test from 'node:test';
import assert from 'node:assert/strict';
import { exportEchoStageChunk } from '../src/components/echo-stage-frame-export.js';
import { readEbml } from '../src/domain/webm-muxer.js';
test('Echo encodes bounded sequential stage frames with chunk-relative timing', async () => {
 const originalEncoder=globalThis.VideoEncoder,originalFrame=globalThis.VideoFrame,received=[];let closed=0;
 class FakeFrame {constructor(canvas,{timestamp,duration}){this.canvas=canvas;this.timestamp=timestamp;this.duration=duration;}close(){closed++;}}
 class FakeEncoder {static async isConfigSupported(){return {supported:true};}constructor(callbacks){this.callbacks=callbacks;this.state='unconfigured';this.encodeQueueSize=0;}configure(){this.state='configured';}encode(frame,{keyFrame}){received.push({timestamp:frame.timestamp,duration:frame.duration,keyFrame});this.callbacks.output({timestamp:frame.timestamp,type:keyFrame?'key':'delta',byteLength:2,copyTo(out){out.set([1,2]);}});}async flush(){}close(){this.state='closed';}}
 globalThis.VideoEncoder=FakeEncoder;globalThis.VideoFrame=FakeFrame;
 try{
  let position=30;const stage={key:'bound-stage',width:640,height:360,fps:30,frameCount:300,get position(){return position;},async renderFrame(index){assert.equal(index,position++);return {index,canvas:{}};}};
  const {blob,receipt}=await exportEchoStageChunk({stage,startFrame:30,endFrameExclusive:33});
  assert.equal(receipt.startFrame,30);assert.equal(receipt.endFrameExclusive,33);assert.equal(receipt.audio,null);assert.equal(receipt.alpha,false);
  assert.deepEqual(received.map(v=>v.timestamp),[0,33333,66667]);assert.deepEqual(received.map(v=>v.duration),[33333,33334,33333]);assert.equal(received[0].keyFrame,true);assert.equal(closed,3);
  assert.ok(readEbml(new Uint8Array(await blob.arrayBuffer())).length>0);
  await assert.rejects(()=>exportEchoStageChunk({stage,startFrame:0,endFrameExclusive:1}),/sequential/);
  await assert.rejects(()=>exportEchoStageChunk({stage,startFrame:33,endFrameExclusive:301}),/bounded/);
  const controller=new AbortController();controller.abort();await assert.rejects(()=>exportEchoStageChunk({stage,startFrame:33,endFrameExclusive:34,signal:controller.signal}));
 }finally{globalThis.VideoEncoder=originalEncoder;globalThis.VideoFrame=originalFrame;}
});
