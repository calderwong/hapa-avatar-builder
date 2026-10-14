import test from 'node:test';
import assert from 'node:assert/strict';
import {createEchoLivingLightOfflineRenderer} from '../src/living-light/director-offline.js';
import {createEchoLivingLightCue} from '../src/domain/echo-living-light-editor.js';

function fixture(extra={}){
 const canvases=[],copies=[],inputs=[];let invalidation,dead=0,ready=true,mode='active';
 const canvasFactory=()=>{const listeners=new Map();const canvas={width:0,height:0,addEventListener:(n,f)=>listeners.set(n,f),removeEventListener:n=>listeners.delete(n),getContext:type=>type==='webgl2'?{isContextLost:()=>false}:{clearRect(){},drawImage:source=>copies.push(source)},lose(){listeners.get('webglcontextlost')?.({preventDefault(){}});},listeners};canvases.push(canvas);return canvas;};
 const renderer=createEchoLivingLightOfflineRenderer({width:1920,height:1080,fps:30,durationUs:10e6,canvasFactory,previewFactory:options=>{invalidation=options.onInvalidate;return {capture(input,paint){inputs.push(input);if(!ready)throw Object.assign(Error('Decode pending'),{code:'living_light_capture_waiting'});if(mode==='failed')throw Object.assign(Error('Missing exact source'),{code:'living_light_capture_failed'});if(mode==='gap')return null;paint(options.canvas);return {songUs:input.timelineUs,visualUs:input.timelineUs-1e6,journeyRef:{journeyId:'exact',revisionId:'one'},cueId:'scene'};},dispose(){dead++;},diagnostics:()=>({dead})};},...extra});
 return {renderer,canvases,copies,inputs,set ready(value){ready=value;invalidation();},set mode(value){mode=value;},get dead(){return dead;}};
}
test('integer frames independently address song time, stage synchronously, and support backward repeat',async()=>{
 const f=fixture(),painted=[],target={drawImage:(...args)=>painted.push(args)};
 try{assert.equal(f.renderer.frameCount,300);for(const frame of [30,75,30,299]){
  const result=await f.renderer.prepareFrame(frame);assert.equal(result.songUs,Math.round(frame*1e6/30));assert.equal(result.cue.songUs,result.songUs);assert.equal(f.inputs.at(-1).playing,false);assert.equal(f.inputs.at(-1).reducedMotion,false);assert.equal(f.inputs.at(-1).quality,'high');assert.deepEqual(f.inputs.at(-1).viewport,{width:1920,height:1080});
  assert.equal(f.copies.at(-1),f.canvases[0]);assert.deepEqual(f.renderer.paintFrame(frame,target),result);assert.equal(painted.at(-1)[0],f.canvases[1]);
 }assert.throws(()=>f.renderer.paintFrame(30,target),{code:'living_light_offline_unprepared'});
 f.mode='gap';const gap=await f.renderer.prepareFrame(90);assert.equal(gap.active,false);f.renderer.paintFrame(90,target);assert.equal(painted.length,4);
 }finally{f.renderer.dispose();}assert.equal(f.dead,1);assert(f.canvases.every(c=>c.width===1&&c.listeners.size===0));
});
test('pending decoding never paints an old frame and concurrent requests refuse',async()=>{
 const f=fixture();try{await f.renderer.prepareFrame(30);f.ready=false;const work=f.renderer.prepareFrame(60);
 assert.throws(()=>f.renderer.paintFrame(30,{}),{code:'living_light_offline_unprepared'});await assert.rejects(f.renderer.prepareFrame(70),{code:'living_light_offline_busy'});assert.equal(f.copies.length,1);
 f.ready=true;const result=await work;assert.equal(result.frameIndex,60);assert.equal(f.copies.length,2);assert(f.inputs.every(input=>[1e6,2e6].includes(input.timelineUs)));
 }finally{f.renderer.dispose();}
});
test('timeout and external cancellation tear down the host and reject without stale success',async()=>{
 const timed=fixture({frameTimeoutMs:20});timed.ready=false;await assert.rejects(timed.renderer.prepareFrame(30),{code:'living_light_offline_timeout'});assert.equal(timed.dead,1);assert.equal(timed.renderer.diagnostics().pending,false);
 const canceled=fixture(),controller=new AbortController();canceled.ready=false;const work=canceled.renderer.prepareFrame(30,{signal:controller.signal});controller.abort();await assert.rejects(work,{code:'living_light_offline_aborted'});assert.equal(canceled.dead,1);
 const before=fixture();controller.abort();await assert.rejects(before.renderer.prepareFrame(0,{signal:controller.signal}),{code:'living_light_offline_aborted'});assert.equal(before.inputs.length,0);before.renderer.dispose();
});
test('graphics loss, fatal source failure and explicit disposal prevent further output',async()=>{
 const lost=fixture();lost.ready=false;const pending=lost.renderer.prepareFrame(30);lost.canvases[0].lose();await assert.rejects(pending,{code:'living_light_offline_context_lost'});assert.equal(lost.dead,1);
 const idle=fixture();await idle.renderer.prepareFrame(30);idle.canvases[0].lose();assert.throws(()=>idle.renderer.paintFrame(30,{}),{code:'living_light_offline_context_lost'});idle.renderer.dispose();
 const missing=fixture();missing.mode='failed';await assert.rejects(missing.renderer.prepareFrame(30),/Missing exact source/);assert.equal(missing.dead,1);
 const disposed=fixture();disposed.ready=false;const work=disposed.renderer.prepareFrame(30);disposed.renderer.dispose();await assert.rejects(work,{code:'living_light_offline_aborted'});assert.equal(disposed.dead,1);await assert.rejects(disposed.renderer.prepareFrame(0),{code:'living_light_offline_disposed'});
});
test('invalid dimensions, rate, timeouts and frame positions fail before rendering',async()=>{
 for(const extra of [{width:3841},{height:0},{fps:29.97},{fps:121},{durationUs:0},{frameTimeoutMs:0}])assert.throws(()=>fixture(extra));
 const f=fixture();try{for(const frame of [-1,0.5,300,NaN,Infinity])await assert.rejects(f.renderer.prepareFrame(frame),{code:'living_light_offline_frame_invalid'});assert.equal(f.inputs.length,0);}finally{f.renderer.dispose();}
});
test('real Director host resolves exact sources asynchronously and maps separate Journey time',async()=>{
 const recipe={journeyId:'journey:one',revisionId:'revision:one',songId:'song:one',sourceBindingRef:null,schedule:[{instanceId:'a',startUs:0,endUs:4e6}],instances:[],mediaSlots:[]};
 const cue=createEchoLivingLightCue({journey:recipe,cueId:'cue:one',startUs:2e6,journeyWindow:{startUs:1e6,endUs:3e6}});
 const frames=[],prepared=[];let destroyed=0;
 const f=fixture({previewFactory:undefined,songId:'song:one',cues:[cue],resolveJourney:async()=>recipe,resolveRegistry:async()=>({}),prepareInput:async()=>({neutralStudy:true}),runtimeFactory:()=>({prepare:value=>prepared.push(value),evaluate:value=>({...value,visualUs:value.timelineUs}),render:value=>{frames.push(value);return true;},diagnostics:()=>({media:[]}),dispose:()=>destroyed++})});
 try{const receipt=await f.renderer.prepareFrame(75);assert.equal(receipt.songUs,2500000);assert.equal(receipt.cue.visualUs,1500000);assert.equal(frames.at(-1).signalTimelineUs,2500000);assert.equal(prepared.length,1);await f.renderer.prepareFrame(60);assert.equal(frames.at(-1).visualUs,1e6);}finally{f.renderer.dispose();}assert.equal(destroyed,1);
});
test('offline host refuses implicit neutral substitution for saved audio choices',async()=>{
 let prepare;
 const f=fixture({previewFactory:options=>{prepare=options.prepareInput;return {dispose(){},diagnostics:()=>({})};}});
 try{assert.deepEqual(await prepare({sourceBindingRef:null,instances:[]},{}),{neutralStudy:true});for(const journey of [{sourceBindingRef:{bindingId:'exact'},instances:[]},{sourceBindingRef:null,instances:[{bindings:{energy:{}}}]}])await assert.rejects(prepare(journey,{}),{code:'living_light_offline_source_required'});}finally{f.renderer.dispose();}
 const substitution=fixture({prepareInput:async()=>({neutralStudy:true}),previewFactory:options=>{prepare=options.prepareInput;return {dispose(){},diagnostics:()=>({})};}});
 try{await assert.rejects(prepare({sourceBindingRef:{bindingId:'exact'},instances:[]},{}),{code:'living_light_offline_source_required'});}finally{substitution.renderer.dispose();}
});
