import test from 'node:test';
import assert from 'node:assert/strict';
import {createLivingLightGraphicsLease} from '../src/living-light/graphics-lease.js';
function fixture(){
 const allocated=new Set(),gl={MAGIC:9};
 for(const type of ['Shader','Program','Buffer','VertexArray','Texture','Framebuffer','Renderbuffer','Query','Sampler','Sync']){
  gl[type==='Sync'?'fenceSync':'create'+type]=function(){assert.equal(this,gl);const handle={type};allocated.add(handle);return handle;};
  gl['delete'+type]=function(handle){assert.equal(this,gl);assert(allocated.delete(handle),'double-delete or foreign handle');};
 }
 gl.drawArrays=function(...args){assert.equal(this,gl);return args;};
 const canvas={width:1,getContext(kind){assert.equal(this,canvas);return kind==='webgl2'?gl:null;},getBoundingClientRect(){assert.equal(this,canvas);return {width:this.width};}};
 return {canvas,gl,allocated};
}
test('graphics lease delegates the real receiver, preserves canvas dimensions and deletes only surviving handles',()=>{
 const f=fixture(),lease=createLivingLightGraphicsLease(f.canvas),gl=lease.canvas.getContext('webgl2');
 assert.equal(gl,lease.canvas.getContext('webgl2'));assert.equal(gl.MAGIC,9);assert.deepEqual(gl.drawArrays(1,2,3),[1,2,3]);
 lease.canvas.width=640;assert.equal(f.canvas.width,640);assert.equal(lease.canvas.getBoundingClientRect().width,640);
 const shader=gl.createShader();gl.createProgram();gl.createTexture();gl.fenceSync();gl.deleteShader(shader);
 assert.equal(lease.diagnostics().liveResources,3);lease.dispose();lease.dispose();assert.equal(f.allocated.size,0);assert.throws(()=>gl.createBuffer(),/disposed/);
});
import {createLivingLightRuntime} from '../src/living-light/runtime.js';
import {createNativeNamespace} from '../src/living-light/native.generated.js';
import {createLivingLightRegistry} from '../src/living-light/registry.js';
const registry=createLivingLightRegistry(),thing=registry.entries[0];
const recipe={schemaVersion:'hapa.living-light.journey.v1',journeyId:'fixture:j',revisionId:'fixture:r',parentRevisionId:null,title:'Fixture',songId:'fixture:s',sourceBindingRef:null,state:'draft-unresolved',mode:'continuous',seed:109,instances:[{instanceId:'use',thingRef:{thingId:thing.thingId,revisionId:thing.revisionId},parameters:{},bindings:{}}],schedule:[{instanceId:'use',startUs:0,endUs:2000000}],actorTreatment:'none',mediaSlots:[]};
const prepare={journeyRevision:recipe,sourceBinding:{songId:'fixture:s',durationUs:2000000},generation:1,neutralStudy:true};
test('partial shader constructor and post-construction hook failures release native allocations before retry',()=>{
 for(const boundary of ['constructor','hook']){
  const f=fixture(),n={...createNativeNamespace()};
  n.HapaRenderer=class {constructor(canvas){const gl=canvas.getContext('webgl2');gl.createShader();gl.createProgram();gl.createBuffer();if(boundary==='constructor')throw Error('Compile fixture failed');Object.assign(this,{programs:{},buffers:[],vaos:[],targets:[]});}dispose(){}resize(){}render(){}};
  n.HapaPassageRenderer=()=>{throw Error('Hook fixture failed');};n.HapaGeometryDanceVisuals=n.HapaJourneyVisuals=()=>{};
  const runtime=createLivingLightRuntime({canvas:f.canvas,registry,nativeFactory:()=>n});assert.throws(()=>runtime.prepare(prepare),/fixture failed/);assert.equal(f.allocated.size,0);assert.equal(runtime.diagnostics().canvasCount,0);runtime.dispose();runtime.dispose();assert.equal(f.allocated.size,0);
 }
});
test('twenty quality/module restore cycles have one live allocation set and zero after leave',()=>{
 const f=fixture(),n={...createNativeNamespace()};let closed=0;
 n.HapaRenderer=class {constructor(canvas){const gl=canvas.getContext('webgl2');gl.createTexture();gl.createFramebuffer();gl.createBuffer();Object.assign(this,{programs:{},buffers:[],vaos:[],targets:[]});}dispose(){closed++;}resize(){}render(){}};
 n.HapaPassageRenderer=n.HapaGeometryDanceVisuals=n.HapaJourneyVisuals=()=>{};
 const runtime=createLivingLightRuntime({canvas:f.canvas,registry,nativeFactory:()=>n});
 for(let i=0;i<20;i++){
  runtime.prepare({...prepare,generation:i*2+1});assert.equal(f.allocated.size,3);
  const packet=runtime.evaluate({timelineUs:500000,quality:i%2?'draft':'high'});runtime.render(packet);runtime.suspend();runtime.restore();assert.equal(f.allocated.size,3);assert.throws(()=>runtime.render(packet),/Stale/);
 }
 runtime.dispose();assert.equal(closed,40);assert.equal(f.allocated.size,0);assert.equal(runtime.diagnostics().graphicsLease,null);
});
