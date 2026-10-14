import test from 'node:test';
import assert from 'node:assert/strict';
import {createLivingLightPreviewDriver} from '../src/living-light/preview-driver.js';
function harness(){
 const documentTarget=new EventTarget();documentTarget.hidden=false;const canvas=new EventTarget();
 let audio={paused:true,ended:false,currentTime:7.5},held=false,frames=new Map(),next=0,disposed=0,restored=0,suspended=0,generation=1,painted=[],errors=[];
 const runtime={evaluate:input=>({...input,visualUs:input.timelineUs,generation}),render:packet=>{painted.push(packet.timelineUs);},suspend:()=>suspended++,restore:()=>{restored++;generation++;},dispose:()=>disposed++};
 const driver=createLivingLightPreviewDriver({canvas,runtime,documentTarget,getAudio:()=>audio,getFrame:()=>({timelineUs:Math.round(audio.currentTime*1e6),playing:!audio.paused&&!audio.ended,reducedMotion:held,quality:'balanced',viewport:{width:640,height:360}}),requestFrame:callback=>{frames.set(++next,callback);return next;},cancelFrame:id=>frames.delete(id),resizeObserverFactory:null,onError:error=>errors.push(error)});
 const event=(type,target=audio)=>{const e=new Event(type,{cancelable:true});Object.defineProperty(e,'target',{value:target});documentTarget.dispatchEvent(e);};
 return {driver,runtime,documentTarget,canvas,event,frames,painted,errors,get audio(){return audio;},replace:()=>{audio={paused:true,ended:false,currentTime:0};},hold:value=>{held=value;driver.redraw();},step:()=>{assert.equal(frames.size,1);const [id,callback]=frames.entries().next().value;frames.delete(id);callback();},counts:()=>({disposed,restored,suspended})};
}
test('paused seeks and replacement metadata redraw once; unrelated media cannot animate this canvas',()=>{
 const h=harness();assert.deepEqual(h.painted,[7500000]);assert.equal(h.frames.size,0);
 h.audio.currentTime=3;h.event('seeking');assert.equal(h.painted.at(-1),3000000);assert.equal(h.frames.size,0);
 h.replace();h.event('loadedmetadata');assert.equal(h.painted.at(-1),0);
 h.event('play',{paused:false});assert.equal(h.frames.size,0);
 h.driver.dispose();h.event('seeked');h.driver.redraw();assert.equal(h.frames.size,0);assert.equal(h.counts().disposed,1);
});
test('play/end/loop/hold are source-time driven with at most one frame and none while paused or hidden',()=>{
 const h=harness();h.audio.paused=false;h.event('play');h.event('playing');assert.equal(h.frames.size,1);
 h.audio.currentTime=8;h.step();assert.equal(h.painted.at(-1),8000000);assert.equal(h.frames.size,1);
 h.audio.currentTime=0;h.event('timeupdate');assert.equal(h.painted.at(-1),0);assert.equal(h.frames.size,1);
 h.hold(true);assert.equal(h.frames.size,0);h.hold(false);assert.equal(h.frames.size,1);
 h.documentTarget.hidden=true;h.event('visibilitychange',h.documentTarget);assert.equal(h.frames.size,0);h.audio.currentTime=11;
 h.documentTarget.hidden=false;h.event('visibilitychange',h.documentTarget);assert.equal(h.painted.at(-1),11000000);assert.equal(h.frames.size,1);
 h.audio.ended=true;h.event('ended');assert.equal(h.frames.size,0);h.audio.paused=true;h.event('pause');assert.equal(h.frames.size,0);
 h.driver.dispose();assert.equal(h.frames.size,0);
});
test('twenty enter/play/pause/context-loss/recover/leave cycles release every frame and preserve paused time',()=>{
 for(let i=0;i<20;i++){
  const h=harness();h.audio.paused=false;h.event('play');h.step();h.audio.paused=true;h.event('pause');
  h.canvas.dispatchEvent(new Event('webglcontextlost',{cancelable:true}));assert.equal(h.frames.size,0);assert.equal(h.driver.diagnostics().contextLost,true);
  h.audio.currentTime=2.25;h.canvas.dispatchEvent(new Event('webglcontextrestored'));assert.equal(h.painted.at(-1),2250000);assert.equal(h.frames.size,0);
  h.driver.dispose();h.driver.dispose();h.canvas.dispatchEvent(new Event('webglcontextrestored'));h.event('play');
  assert.deepEqual(h.counts(),{disposed:1,restored:1,suspended:1});assert.equal(h.frames.size,0);assert.equal(h.errors.length,0);
 }
});
test('context restore while hidden waits for visibility; render/restore failures stop without retries',()=>{
 const h=harness();h.canvas.dispatchEvent(new Event('webglcontextlost',{cancelable:true}));h.documentTarget.hidden=true;
 h.canvas.dispatchEvent(new Event('webglcontextrestored'));assert.equal(h.counts().restored,0);
 h.documentTarget.hidden=false;h.event('visibilitychange',h.documentTarget);assert.equal(h.counts().restored,1);
 h.runtime.render=()=>{throw Error('Shader fixture failed');};h.driver.redraw();assert.equal(h.driver.diagnostics().failed,true);assert.equal(h.errors.length,1);
 h.event('play');h.event('visibilitychange',h.documentTarget);h.driver.redraw();assert.equal(h.errors.length,1);assert.equal(h.frames.size,0);h.driver.dispose();
 const r=harness();r.runtime.restore=()=>{throw Error('Restore fixture failed');};r.canvas.dispatchEvent(new Event('webglcontextlost',{cancelable:true}));r.canvas.dispatchEvent(new Event('webglcontextrestored'));
 assert.equal(r.errors.length,1);assert.equal(r.frames.size,0);r.driver.dispose();
});

test('play and pause at the same timestamp still reach render to stop painted decoders',()=>{
 const h=harness(),before=h.painted.length;h.audio.paused=false;h.event('play');assert.equal(h.painted.length,before+1);h.audio.paused=true;h.event('pause');assert.equal(h.painted.length,before+2);assert.equal(h.frames.size,0);h.driver.dispose();
});


test('recorder takes frame ownership and releases it without a second animation loop',()=>{
 const h=harness();h.audio.paused=false;h.event('play');assert.equal(h.frames.size,1);
 h.driver.setExternalClock(true);const before=h.painted.length;assert.equal(h.frames.size,0);
 h.audio.currentTime=9;h.event('timeupdate');h.driver.redraw();assert.equal(h.frames.size,0);assert.equal(h.painted.length,before);
 h.driver.setExternalClock(false);assert.equal(h.painted.at(-1),9000000);assert.equal(h.frames.size,1);
 h.driver.dispose();h.driver.setExternalClock(false);assert.equal(h.frames.size,0);
});
