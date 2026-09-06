import test from 'node:test';
import assert from 'node:assert/strict';
import {buildProtectedCameraPath} from '../src/domain/media-role-camera.js';

const regions=[{x:.35,y:.35,width:.25,height:.25}];
const fixture={mediaId:'image:hero',sourceHash:'a'.repeat(64),technical:{width:4096,height:4096},analysis:{sourceHash:'a'.repeat(64),protectedRegions:regions,protectedRegionsStatus:'verified'},durationSeconds:8};
const ease=t=>t*t*t*(t*(t*6-15)+10);
test('all intermediate camera samples contain protected regions and retain original pixel coverage',()=>{
  const plan=buildProtectedCameraPath(fixture);
  for(const c of plan.corridors){
    assert.equal(c.layout,'protected-cover');
    assert.ok(c.maximumVelocity<=plan.limits.maxVelocity+1e-12);
    assert.ok(c.maximumAcceleration<=plan.limits.maxAcceleration+1e-12);
    for(let i=0;i<=800;i++){
      const t=i/800,s=ease(t);
      const crop=Object.fromEntries(['x','y','width','height'].map(k=>[k,c.startCrop[k]+(c.endCrop[k]-c.startCrop[k])*s]));
      assert.ok(crop.x>=0&&crop.y>=0&&crop.x+crop.width<=1+1e-10&&crop.y+crop.height<=1+1e-10);
      for(const r of regions)assert.ok(crop.x<=r.x&&crop.y<=r.y&&crop.x+crop.width>=r.x+r.width&&crop.y+crop.height>=r.y+r.height);
      assert.ok(crop.width*4096>=c.width&&crop.height*4096>=c.height);
    }
  }
});
test('unsegmented comic pages remain whole, fitted and held across every aspect',()=>{
  const plan=buildProtectedCameraPath({...fixture,technical:{width:1024,height:2048},analysis:{},readingSeconds:4});
  for(const c of plan.corridors){
    assert.equal(c.layout,'fitted-image');assert.equal(c.motion,'hold');
    assert.equal(c.startCrop.width,1);assert.equal(c.startCrop.height,1);
    assert.ok(c.reasons.includes('protected-regions-unverified'));
    assert.equal(c.fullBleed,false);assert.equal(c.maximumVelocity,0);
  }
  assert.equal(plan.depthMode,'deterministic-2d');
});
test('phrase cue and reading interval control absolute hold, without inventing timing truth',()=>{
  const plan=buildProtectedCameraPath({...fixture,startSeconds:10,phraseCue:{id:'word:2',atSeconds:13,source:'manual-alignment',timingStatus:'verified'}});
  assert.equal(plan.phraseCue.atSeconds,13);assert.equal(plan.corridors[0].holdSeconds,3);
  const unknown=buildProtectedCameraPath({...fixture,startSeconds:10,phraseCue:{id:'guess',atSeconds:13,source:'inferred'}});
  assert.equal(unknown.phraseCue.timingStatus,'unverified');assert.equal(unknown.phraseCue.atSeconds,10);
  const short=buildProtectedCameraPath({...fixture,durationSeconds:.1});
  assert.ok(short.corridors.every(c=>c.maximumVelocity===0));
});
test('invalid geometry is rejected and input identity determines reproducible paths',()=>{
  assert.throws(()=>buildProtectedCameraPath({...fixture,technical:{width:0,height:10}}),/dimensions/);
  assert.throws(()=>buildProtectedCameraPath({...fixture,analysis:{protectedRegions:[{x:-.1,y:0,width:.5,height:.5}]}}),/region/);
  const before=structuredClone(fixture);
  const a=buildProtectedCameraPath(fixture),b=buildProtectedCameraPath(fixture);
  assert.deepEqual(a,b);assert.deepEqual(fixture,before);
  assert.notEqual(a.id,buildProtectedCameraPath({...fixture,readingSeconds:4}).id);
});

test('stale protected regions fall back and all cache-affecting limits change identity',()=>{
  const stale=buildProtectedCameraPath({...fixture,sourceHash:'b'.repeat(64)});
  assert.ok(stale.corridors.every(c=>c.reasons.includes('protected-regions-source-mismatch')));
  const normal=buildProtectedCameraPath(fixture);
  assert.notEqual(normal.id,buildProtectedCameraPath({...fixture,maxTextureSize:2048}).id);
  assert.notEqual(normal.id,buildProtectedCameraPath({...fixture,maxDecodedBytes:1024}).id);
});

test('source-bound panel windows fit without exposing neighboring panels or clipping protected text',()=>{
  const viewRegion={x:.05,y:.25,width:.9,height:.2};
  const plan=buildProtectedCameraPath({...fixture,technical:{width:1024,height:2048},viewRegion,
    analysis:{sourceHash:fixture.sourceHash,protectedRegionsStatus:'source-bound',protectedRegions:[viewRegion]}});
  for(const corridor of plan.corridors){
    assert.equal(corridor.startCrop.x,viewRegion.x);assert.equal(corridor.startCrop.y,viewRegion.y);
    assert.equal(corridor.startCrop.width,viewRegion.width);assert.equal(corridor.startCrop.height,viewRegion.height);
    assert.equal(corridor.startCrop.fit,'contain');
  }
  const pending=buildProtectedCameraPath({...fixture,viewRegion,analysis:{}});
  assert.equal(pending.viewRegion.width,1,'unverified panel bounds do not crop source');
  assert.throws(()=>buildProtectedCameraPath({...fixture,viewRegion}),/outside-panel/);
  for(const maxDecodedBytes of [NaN,-1,0,Infinity])assert.throws(()=>buildProtectedCameraPath({...fixture,maxDecodedBytes}),/decode-limits/);
});
