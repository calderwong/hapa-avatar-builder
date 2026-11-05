import test from 'node:test';
import assert from 'node:assert/strict';
import { paintEchoCampfireRecording } from '../src/domain/echo-campfire-recording.js';

function context(fail = false) {
  return { globalAlpha: 0.4, globalCompositeOperation: 'screen', draws: [],
    save() { this.previous = [this.globalAlpha, this.globalCompositeOperation]; },
    restore() { [this.globalAlpha, this.globalCompositeOperation] = this.previous; },
    drawImage(...args) { this.draws.push([this.globalAlpha, this.globalCompositeOperation, ...args]); if (fail) throw new Error('canvas unavailable'); } };
}
test('Campfire capture replaces the cut with its actual presented canvas and restores composition state', () => {
  for (const [width,height] of [[1920,1080],[1080,1920]]) {
    const canvas = {width:640,height:360}, ctx = context();
    assert.equal(paintEchoCampfireRecording(ctx,{canvas,ready:true},width,height),true);
    assert.deepEqual(ctx.draws,[[1,'source-over',canvas,0,0,width,height]]);
    assert.equal(ctx.globalAlpha,0.4); assert.equal(ctx.globalCompositeOperation,'screen');
  }
});
test('a missing or not-yet-painted Campfire waits; GPU failure cannot become a completed take', () => {
  const canvas = {width:640,height:360};
  for (const surface of [null,{canvas,ready:false},{canvas:{width:0,height:360},ready:true}]) {
    const ctx=context();
    assert.throws(()=>paintEchoCampfireRecording(ctx,surface,1920,1080),{code:'campfire_capture_waiting'});
    assert.equal(ctx.draws.length,0);
  }
  assert.throws(()=>paintEchoCampfireRecording(context(),{canvas,ready:true,error:'GPU device lost'},1920,1080),/GPU device lost/);
});
test('capture errors restore the compositor state and propagate to the existing incomplete-take path', () => {
  const ctx=context(true);
  assert.throws(()=>paintEchoCampfireRecording(ctx,{canvas:{width:640,height:360},ready:true},1920,1080),/canvas unavailable/);
  assert.equal(ctx.globalAlpha,0.4); assert.equal(ctx.globalCompositeOperation,'screen');
});
