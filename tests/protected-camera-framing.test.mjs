import test from 'node:test';
import assert from 'node:assert/strict';
import {echoProtectedCameraFrame} from '../src/domain/echo-camera-framing.js';
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
test('DOM media-box coordinates and Canvas source/destination rectangles agree at every corner',()=>{
  for(const [outputWidth,outputHeight] of [[1920,1080],[1080,1920],[1080,1080]])for(const crop of [
    {x:0,y:0,width:1,height:1,fit:'contain'},
    {x:.1,y:.3,width:.8,height:.2,fit:'contain'},
    {x:.2,y:.1,width:.5,height:.5,fit:'cover'},
  ]){
    const result=echoProtectedCameraFrame({sourceWidth:1024,sourceHeight:2048,outputWidth,outputHeight,crop:{...crop,cameraModel:'protected-v2'}});
    const sx=parseFloat(result.style.width)/1024,sy=parseFloat(result.style.height)/2048;
    for(const t of [0,.25,.5,.75,1]){
      close(parseFloat(result.style.left)+(result.x+t*result.width)*sx,result.destination.x+t*result.destination.width);
      close(parseFloat(result.style.top)+(result.y+t*result.height)*sy,result.destination.y+t*result.destination.height);
    }
    assert.ok(result.destination.x>=-1e-8&&result.destination.y>=-1e-8);
    assert.ok(result.destination.x+result.destination.width<=outputWidth+1e-8);
    assert.ok(result.destination.y+result.destination.height<=outputHeight+1e-8);
  }
});
test('legacy crops do not opt into protected geometry and invalid dimensions fail visibly',()=>{
  const dimensions={sourceWidth:1024,sourceHeight:2048,outputWidth:1920,outputHeight:1080};
  assert.equal(echoProtectedCameraFrame({...dimensions,crop:{x:0,y:0,width:1,height:1}}),null);
  assert.throws(()=>echoProtectedCameraFrame({...dimensions,sourceWidth:0}),/dimensions/);
});

test('protected fit scale fails on invalid metadata and DOM clips the requested source window',()=>{
  const base={sourceWidth:4096,sourceHeight:4096,outputWidth:1920,outputHeight:1080,crop:{cameraModel:'protected-v2',x:.25,y:.25,width:.5,height:.5,fit:'contain'}};
  assert.equal(echoProtectedCameraFrame(base).style.clipPath,'inset(25% 25% 25% 25%)');
  for(const fitScale of [null,NaN,Infinity,-1,0,2,'1'])assert.throws(()=>echoProtectedCameraFrame({...base,crop:{...base.crop,fitScale}}),/fit-scale/);
});

test('emitted browser runtime reproduces protected camera sampling on nonsequential seeks',async()=>{
  const vm=await import('node:vm');
  const runtime=await import('../src/domain/echo-camera-framing.js');
  const {buildProtectedCameraPath}=await import('../src/domain/media-role-camera.js');
  const plan=buildProtectedCameraPath({mediaId:'hero',sourceHash:'b'.repeat(64),technical:{width:4096,height:4096},durationSeconds:8,
    analysis:{sourceHash:'b'.repeat(64),protectedRegionsStatus:'source-bound',protectedRegions:[{x:.4,y:.4,width:.1,height:.1}]}});
  const keys=plan.keyframes.map(row=>({...row,atSeconds:10+row.offset*8,easing:plan.easing,cameraPathId:plan.id,slotId:'hero'}));
  const browser=vm.runInNewContext(runtime.echoCameraFramingRuntimeBrowserSource()+';HapaEchoCameraFraming');
  const samples=[17.99,10,14.5,12,11,18,15,10];
  for(const time of samples){
    const crop=runtime.echoCameraKeyframeAt(keys,time).crop;
    assert.deepEqual(JSON.parse(JSON.stringify(browser.echoCameraKeyframeAt(keys,time).crop)),crop);
    const args={sourceWidth:4096,sourceHeight:4096,outputWidth:1920,outputHeight:1080,crop};
    assert.deepEqual(JSON.parse(JSON.stringify(browser.echoProtectedCameraFrame(args))),echoProtectedCameraFrame(args));
    const presentation=runtime.echoCameraMotionPresentation({startSeconds:10,endSeconds:18,timeSeconds:time,crop});
    assert.equal(presentation.scale,1);
    assert.deepEqual(runtime.echoCameraCoverSourceRect({...args,presentation}),echoProtectedCameraFrame(args));
  }
  assert.deepEqual(runtime.echoCameraKeyframeAt(keys,11).crop,keys[0].crop);
});

test('native-resolution odd-sized panel lettering stays on integer output pixels',()=>{
  const frame=echoProtectedCameraFrame({sourceWidth:1024,sourceHeight:2048,outputWidth:1080,outputHeight:1080,
    crop:{cameraModel:'protected-v2',fit:'contain',fitScale:1016/1080,x:4/1024,y:1207/2048,width:1016/1024,height:833/2048}});
  close(frame.destination.height,833);
  assert.equal(frame.destination.y,123);
  assert.ok(Number.isInteger(parseFloat(frame.style.top)));
});
