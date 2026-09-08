import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {echoTimelineMediaInstances,hyperFramesMediaPresentationWindow,hyperFramesMediaOpacityState} from '../src/domain/echo-media-presentation.js';
import {hyperFramesMediaElementTiming} from '../src/domain/hyperframes-show-compiler.js';
import {hyperFramesVideoFrameTime} from '../src/domain/hyperframes-media-frame-runtime.js';

test('authored cut/fades and dissolved mixed media keep independent visibility and source clocks',()=>{
 const media=echoTimelineMediaInstances([
  {media_id:'a',start_sec:0,end_sec:4,transition:'cut',media_contract:{type:'image'}},
  {media_id:'b',start_sec:4,end_sec:8,transition:'crossfade',media_contract:{type:'video'}},
  {media_id:'c',start_sec:8,end_sec:12,transition:'cut',media_contract:{type:'image'}},
  {media_id:'d',start_sec:12,end_sec:16,transition:'fade-out',media_contract:{type:'video'}},
 ]);
 const window=hyperFramesMediaPresentationWindow(media,1);
 assert.equal(window.presentationStart,3.55);
 assert.equal(hyperFramesMediaPresentationWindow(media,2).presentationStart,8);
 assert.equal(hyperFramesMediaOpacityState(media,2,7.99).alpha,0);
 assert.equal(hyperFramesMediaOpacityState(media,2,8).alpha,1);
 assert.equal(hyperFramesMediaOpacityState(media,3,15.75).alpha,.5);
 const timing=hyperFramesMediaElementTiming(media[1],window);
 const video={duration:10,dataset:{start:timing.activationStart,duration:timing.activationDuration,logicalDuration:4}};
 for(const t of [3.55,3.775,4,4.2,7.5,4.2,3.775]) {
  assert.ok(Math.abs(hyperFramesVideoFrameTime(video,t)-Math.max(0,t-4))<1e-9);
 }
 assert.equal(hyperFramesMediaOpacityState(media,1,3.775).localSeconds,0);
 assert.equal(hyperFramesMediaOpacityState(media,0,3.775).alpha,1);
 assert.ok(Math.abs(hyperFramesMediaOpacityState(media,1,3.775).alpha-.5)<1e-8);
});

test('no dissolve crosses an authored gap, a different track, or a generated-media interval',()=>{
 const incoming={id:'b',start:4,end:8,trackId:'a',transition:'crossfade'};
 for(const previous of [
  {id:'a',start:0,end:3,trackId:'a'},
  {id:'a',start:0,end:4,trackId:'b'},
  {id:'a',start:0,end:4,trackId:'a',source:{type:'generated-visualizer'}},
 ]) assert.equal(hyperFramesMediaPresentationWindow([previous,incoming],1).presentationStart,4);
});

test('serialized export transition functions run without module closures and preserve out-of-order samples',()=>{
 const context=vm.createContext({});
 vm.runInContext(hyperFramesMediaPresentationWindow.toString()+';'+hyperFramesMediaOpacityState.toString(),context);
 const media=[{start:0,end:4,transition:'cut'},{start:4,end:8,transition:'crossfade'}];
 for(const t of [0,3.55,3.775,4,7.99,8,4,3.775]) {
  context.media=media;context.time=t;
  const actual=vm.runInContext('hyperFramesMediaOpacityState(media,1,time)',context);
  assert.equal(JSON.stringify(actual),JSON.stringify(hyperFramesMediaOpacityState(media,1,t)));
 }
});
