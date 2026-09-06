import test from 'node:test';
import assert from 'node:assert/strict';
import {echoObservedSourceWindow as map} from '../src/domain/echo-observed-source-window.js';
import {echoObservationsInSourceWindow} from '../src/domain/echo-observation-window.js';
const sha='a'.repeat(64);
const asset=(contract={})=>({id:'m',uri:'/media/runtime.mp4',sourceKind:'local-video',media_contract:contract,contentEvidence:{status:'prepared-inferred-limited',sourceSha256:sha,sourceDurationSeconds:10,boundRuntimeUri:'/media/runtime.mp4',boundMediaId:'m'}});
const cue={startSeconds:30,endSeconds:33};
test('a short destination cue maps only its played source range, not song time or full media',()=>{
 const result=map(asset(),cue);assert.deepEqual(result.window,{sourceSha256:sha,startSeconds:0,endSeconds:3});
 const sample=pointSeconds=>({schemaVersion:'hapa.echo.catalog-observation.v1',status:'inferred-limited',sourceByteStatus:'bytes-verified',sourceSha256:sha,revision:'b'.repeat(64),frameId:String(pointSeconds),pointSeconds});
 assert.deepEqual(echoObservationsInSourceWindow([sample(0),sample(2.9),sample(3),sample(5)],result.window).observations.map(row=>row.pointSeconds),[0,2.9]);
});
test('trim and terminal hold use the existing playback mapper without wrapping',()=>{
 assert.deepEqual(map(asset({sourceInSeconds:2,sourceOutSeconds:8}),cue).window,{sourceSha256:sha,startSeconds:2,endSeconds:5});
 const long=map(asset({sourceInSeconds:2,sourceOutSeconds:8}),{startSeconds:0,endSeconds:20});
 assert.equal(long.window.startSeconds,2);assert.equal(long.window.endSeconds,7.94);assert.equal(long.loop,false);
});
test('invalid, stale, image and unverified mappings never borrow video observations',()=>{
 assert.equal(map(asset({sourceInSeconds:9,sourceOutSeconds:12}),cue).reason,'source-window-outside-verified-duration');
 assert.equal(map(asset({timeMapping:{mode:'guess'}}),cue).reason,'unsupported-or-stale-source-time-mapping');
 assert.equal(map({...asset(),sourceKind:'local-photo'},cue).window,null);
 assert.equal(map({...asset(),contentEvidence:{}},cue).window,null);
 assert.equal(map(asset(),{startSeconds:5,endSeconds:5}).window,null);
 assert.equal(map({...asset(),uri:'/media/another-proxy.mp4'},cue).reason,'runtime-media-binding-changed-or-unverified');
 assert.equal(map({...asset(),id:'another-source'},cue).reason,'runtime-media-binding-changed-or-unverified');
});

test('valid fit-source mapping follows the declared cue and rejects a different destination duration',()=>{
 const contract={sourceInSeconds:2,sourceOutSeconds:8,timeMapping:{schemaVersion:'hapa.echo.transition-time-map.v1',mode:'fit-source-once-to-cue',sourceInSeconds:2,sourceOutSeconds:8,cueDurationSeconds:3,cueSampleSpanSeconds:3-1/30,outputFps:30,valid:true,reachesDeclaredLastFrame:true}};
 const result=map(asset(contract),cue);assert.deepEqual(result.window,{sourceSha256:sha,startSeconds:2,endSeconds:8});
 assert.equal(result.mapping,'fit-source-once-to-cue');
 assert.equal(map(asset(contract),{startSeconds:30,endSeconds:34}).reason,'unsupported-or-stale-source-time-mapping');
});
