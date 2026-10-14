import test from 'node:test';
import assert from 'node:assert/strict';
import {livingLightMediaFraming,livingLightMediaFrameRects} from '../src/domain/living-light-media.js';
import {livingLightMediaFragment,createLivingLightMediaMaterial} from '../src/living-light/media-material.js';
const approx=(actual,expected)=>actual.forEach((v,i)=>assert.ok(Math.abs(v-expected[i])<1e-8,`${actual} != ${expected}`));
test('legacy placements keep their saved shape while defaulting to centered fill',()=>{
 const slot={};assert.deepEqual(livingLightMediaFraming(slot),{fit:'cover',crop:{x:0,y:0,width:1,height:1}});assert.deepEqual(slot,{});
 const frame=livingLightMediaFrameRects(slot,1920,1080,1);approx(frame.source,[.21875,0,.5625,1]);approx(frame.destination,[0,0,1,1]);
});
test('fit keeps the whole selected source with centered bars across aspect ratios',()=>{
 const slot={framing:{fit:'contain',crop:{x:0,y:0,width:1,height:1}}};
 approx(livingLightMediaFrameRects(slot,1920,1080,1).destination,[0,.21875,1,.5625]);
 approx(livingLightMediaFrameRects(slot,1080,1920,1).destination,[.21875,0,.5625,1]);
 approx(livingLightMediaFrameRects(slot,1920,1080,16/9).source,[0,0,1,1]);
});
test('top-left source crops reach the correct flipped-video UV rectangle before fit',()=>{
 const slot={framing:{fit:'contain',crop:{x:.1,y:.2,width:.5,height:.4}}};
 approx(livingLightMediaFrameRects(slot,100,100,1).source,[.1,.4,.5,.4]);
 approx(livingLightMediaFrameRects(slot,100,100,1).destination,[0,.1,1,.8]);
 slot.framing.fit='cover';approx(livingLightMediaFrameRects(slot,100,100,1).source,[.15,.4,.4,.4]);
});
test('framing refuses invalid fit, missing/nonfinite coordinates and out-of-source crops',()=>{
 for(const framing of [null,{}, {fit:'stretch',crop:{x:0,y:0,width:1,height:1}},{fit:'cover',crop:{x:-.1,y:0,width:1,height:1}},{fit:'cover',crop:{x:0,y:0,width:0,height:1}},{fit:'cover',crop:{x:.5,y:0,width:.6,height:1}},{fit:'cover',crop:{x:0,y:NaN,width:1,height:1}},{fit:'cover',crop:{x:0,y:0,width:1,height:1,uri:'/secret'}}])assert.throws(()=>livingLightMediaFraming({framing}));
 assert.throws(()=>livingLightMediaFrameRects({},0,100,1));
});
test('native shader structure must match before adaptation',()=>{assert.throws(()=>livingLightMediaFragment('different shader'),/needs review/);});
test('partial shader compile and link failures release every owned handle',()=>{
 for(const failure of ['vertex','fragment','link','none']){
  let shaderCount=0,deletedShaders=[],deletedPrograms=[];
  const gl={VERTEX_SHADER:1,FRAGMENT_SHADER:2,COMPILE_STATUS:3,LINK_STATUS:4,ACTIVE_UNIFORMS:5,
   createShader:type=>({id:++shaderCount,type}),shaderSource(){},compileShader(){},getShaderParameter:s=>!(failure==='vertex'&&s.type===1)&&!(failure==='fragment'&&s.type===2),getShaderInfoLog:()=>failure,
   createProgram:()=>({id:'owned'}),attachShader(){},linkProgram(){},getProgramParameter:(_p,k)=>k===4?failure!=='link':0,getProgramInfoLog:()=>failure,
   deleteShader:s=>deletedShaders.push(s.id),deleteProgram:p=>deletedPrograms.push(p.id)};
  const cover='if(uMediaAspect>uSurfaceAspect){float k=uSurfaceAspect/uMediaAspect;uv.x=clamp(uFocal.x,k*.5,1.-k*.5)+(uv.x-.5)*k;}else{float k=uMediaAspect/uSurfaceAspect;uv.y=clamp(uFocal.y,k*.5,1.-k*.5)+(uv.y-.5)*k;}';
  const native={HapaRenderer:{safeShader:s=>s},HapaShaders:{mediaVertex:'vertex',mediaFragment:'uniform sampler2D uVideo;'+cover+'vec3 c=srgbToLinear(texture(uVideo,uv).rgb)*uMediaGain;'}};
  if(failure==='none')assert.equal(createLivingLightMediaMaterial(gl,native).p.id,'owned');else assert.throws(()=>createLivingLightMediaMaterial(gl,native),/failed/);
  assert.equal(deletedShaders.length,shaderCount);assert.equal(deletedPrograms.length,failure==='link'?1:0);
 }
});
