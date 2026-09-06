import test from 'node:test';
import assert from 'node:assert/strict';
import {createImageShotGeometry,selectImageShotRendition} from '../src/domain/unified-media-catalog.js';
const source={uri:'/media/comic/page.png',sha256:'a'.repeat(64),width:4096,height:4096};
const geometry=createImageShotGeometry({original:source,pageId:'page:1',readingOrder:0});
test('image geometry preserves exact original identity and rejects ambiguous panel order',()=>{
  assert.deepEqual(geometry.original,source);
  assert.equal(geometry.protectionStatus,'whole-page-fallback');
  const panel={id:'panel:1',readingOrder:0,x:0,y:0,width:1,height:.5};
  assert.throws(()=>createImageShotGeometry({original:source,panels:[panel,{...panel,id:'panel:2'}]}),/duplicate/);
  assert.throws(()=>createImageShotGeometry({original:source,protectedRegions:[{x:0,y:0,width:2,height:1}]}),/region/);
});
test('preview chooses smallest adequate verified derivative, ignoring stale source bindings',()=>{
  const make=(size,sourceHash=source.sha256)=>({uri:`/media/cache/${size}.png`,sha256:'b'.repeat(64),sourceHash,width:size,height:size,verified:true});
  const choice=selectImageShotRendition({geometry,renditions:[make(512),make(1024),make(2048),make(1000,'c'.repeat(64))],outputProfile:{width:1000,height:1000}});
  assert.equal(choice.selected.width,1024);assert.equal(choice.status,'ready-preview');
  assert.equal(choice.insufficientResolution,false);
});
test('final output keeps original pixels and explicitly blocks original decode beyond budget',()=>{
  const options={geometry,outputProfile:{width:3840,height:2160},finalRender:true};
  assert.equal(selectImageShotRendition(options).selected.uri,source.uri);
  const blocked=selectImageShotRendition({...options,maxDecodedBytes:1024});
  assert.equal(blocked.status,'blocked-original-decode-budget');assert.equal(blocked.selected,null);
  const upscaled=selectImageShotRendition({...options,crop:{width:.5,height:.5}});
  assert.equal(upscaled.insufficientResolution,true);
});
