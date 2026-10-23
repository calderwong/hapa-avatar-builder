import {createNativeNamespace} from '../../src/living-light/native.generated.js';
import {createLivingLightMediaMaterial} from '../../src/living-light/media-material.js';

function verify(canvas){
 const gl=canvas.getContext('webgl2',{preserveDrawingBuffer:true,antialias:false,alpha:false});if(!gl)throw Error('WebGL2 unavailable');
 const native=createNativeNamespace(),textures=[],programs=[],buffers=[],vaos=[],samples=[];let framebuffer,depth;
 const report={ok:false,scope:'Production painted material plus native optical composite; synthetic SDR input, not HDR/display calibration or human acceptance',samples};
 const identity=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
 function geometry(vertices){const vao=gl.createVertexArray(),buffer=gl.createBuffer();vaos.push(vao);buffers.push(buffer);gl.bindVertexArray(vao);gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(vertices),gl.STATIC_DRAW);gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,2,gl.FLOAT,false,0,0);return vao;}
 function texture(width,height,pixels=null){const t=gl.createTexture();textures.push(t);gl.bindTexture(gl.TEXTURE_2D,t);for(const key of [gl.TEXTURE_MIN_FILTER,gl.TEXTURE_MAG_FILTER])gl.texParameteri(gl.TEXTURE_2D,key,gl.NEAREST);for(const key of [gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T])gl.texParameteri(gl.TEXTURE_2D,key,gl.CLAMP_TO_EDGE);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,width,height,0,gl.RGBA,gl.UNSIGNED_BYTE,pixels);return t;}
 function sample(label,expected,x=32,y=32,tolerance=3){const rgba=new Uint8Array(4);gl.readPixels(x,y,1,1,gl.RGBA,gl.UNSIGNED_BYTE,rgba);const error=gl.getError();const ok=error===gl.NO_ERROR&&expected.every((v,i)=>Math.abs(rgba[i]-v)<=tolerance);samples.push({label,x,y,rgba:[...rgba],expected,tolerance,glError:error,ok});if(!ok)throw Error('Pixel mismatch: '+label);return [...rgba];}
 try{
  const material=createLivingLightMediaMaterial(gl,native);programs.push(material.p);
  const composite=native.HapaRenderer.program(gl,native.HapaShaders.vertex,native.HapaShaders.composite,'composition acceptance');programs.push(composite.p);
  const quad=geometry([0,0,1,0,0,1,0,1,1,0,1,1]),screen=geometry([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]);
  framebuffer=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,framebuffer);const scene=texture(64,64),emission=texture(64,64);
  for(const [i,t] of [scene,emission].entries())gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0+i,gl.TEXTURE_2D,t,0);
  depth=gl.createRenderbuffer();gl.bindRenderbuffer(gl.RENDERBUFFER,depth);gl.renderbufferStorage(gl.RENDERBUFFER,gl.DEPTH_COMPONENT16,64,64);gl.framebufferRenderbuffer(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.RENDERBUFFER,depth);gl.drawBuffers([gl.COLOR_ATTACHMENT0,gl.COLOR_ATTACHMENT1]);
  if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw Error('Composition framebuffer incomplete');
  const source=texture(1,1,new Uint8Array([128,128,128,255])),black=texture(1,1,new Uint8Array([0,0,0,255]));
  function clear(){gl.bindFramebuffer(gl.FRAMEBUFFER,framebuffer);gl.viewport(0,0,64,64);gl.depthMask(true);gl.clearColor(0,0,0,1);gl.clearDepth(1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);}
  function paint(rgb,{z=0,size=2,mask=0,grade=0,gain=1,accent=[0,0,0]}={}){
   gl.bindFramebuffer(gl.FRAMEBUFFER,framebuffer);gl.enable(gl.DEPTH_TEST);gl.depthMask(true);gl.depthFunc(gl.LEQUAL);gl.disable(gl.BLEND);gl.disable(gl.CULL_FACE);gl.useProgram(material.p);gl.bindVertexArray(quad);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,source);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array([...rgb,255]));
   const model=[...identity];model[14]=z;
   native.HapaRenderer.uniforms(gl,material,{uPV:identity,uModel:model,uSize:[size,size],uVideo:0,uMediaGain:gain,uMask:mask,uGrade:grade,uEye:[0,0,0],uHighlight:[0,0,0],uAccent:accent,uRadiance:0,uSourceTrim:0,uFocal:[.5,.5],uPaintSourceRect:[0,0,1,1],uPaintDestinationRect:[0,0,1,1]});gl.drawArrays(gl.TRIANGLES,0,6);
  }
  clear();paint([128,128,128]);const linear=sample('SDR mid-gray enters the linear scene once',[55,55,55]);
  clear();paint([128,128,128],{gain:.5});sample('Brightness scales linear light',[28,28,28]);
  clear();paint([128,128,128],{grade:1,accent:[1,.3,.2]});sample('Native palette grade applies in linear light',[58,47,46]);
  clear();paint([255,0,0],{z:.5});paint([0,255,0],{z:-.5,size:1});paint([0,0,255],{z:.8});
  sample('Near geometry occludes later farther video',[0,253,0]);sample('Uncovered background survives a farther draw',[251,0,0],8,8,4);
  paint([0,0,255],{z:-.75,size:1,mask:1});sample('Portal center paints at its own depth',[0,0,253]);sample('Portal corners discard and retain the geometry below',[0,253,0],18,18,4);
  clear();paint([128,128,128]);
  const srgb=x=>x<=.0031308?12.92*x:1.055*Math.pow(x,1/2.4)-.055;
  const display=x=>Math.round(255*Math.pow(srgb(Math.min(1,(x*(2.51*x+.03))/(x*(2.43*x+.59)+.14))),.96));
  for(const exposure of [1,2]){
   gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.disable(gl.DEPTH_TEST);gl.useProgram(composite.p);gl.bindVertexArray(screen);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,scene);gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,black);
   native.HapaRenderer.uniforms(gl,composite,{uScene:0,uBloom:1,uDepth:1,uVisibility:1,uEmissionTex:1,uWeaveTex:1,uPortalVideo:1,uResolution:[64,64],uSourceUV:[0,0,0],uHighlight:[0,0,0],uAccent:[0,0,0],uPortalBlend:0,uPortalAspect:1,uVideoGain:1,uFlare:0,uBloomGain:0,uExposure:exposure,uDebug:0});gl.drawArrays(gl.TRIANGLES,0,6);
   const expected=display(linear[0]/255*exposure);sample('Native optical display transform at exposure '+exposure,[expected,expected,expected]);
  }
  report.ok=true;
 }catch(error){report.error=error.message;}
 finally{
  gl.useProgram(null);gl.bindVertexArray(null);gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.bindRenderbuffer(gl.RENDERBUFFER,null);gl.bindBuffer(gl.ARRAY_BUFFER,null);for(const unit of [gl.TEXTURE0,gl.TEXTURE1]){gl.activeTexture(unit);gl.bindTexture(gl.TEXTURE_2D,null);}
  if(framebuffer)gl.deleteFramebuffer(framebuffer);if(depth)gl.deleteRenderbuffer(depth);for(const p of programs)gl.deleteProgram(p);for(const t of textures)gl.deleteTexture(t);for(const v of vaos)gl.deleteVertexArray(v);for(const b of buffers)gl.deleteBuffer(b);
  report.resourcesReleased=programs.every(p=>!gl.isProgram(p))&&textures.every(t=>!gl.isTexture(t))&&buffers.every(b=>!gl.isBuffer(b))&&vaos.every(v=>!gl.isVertexArray(v))&&(!framebuffer||!gl.isFramebuffer(framebuffer))&&(!depth||!gl.isRenderbuffer(depth));report.ok&&=report.resourcesReleased;
 }
 return report;
}
document.querySelector('#run').addEventListener('click',()=>{
 const button=document.querySelector('#run');button.disabled=true;
 try{const result=verify(document.querySelector('#output'));document.querySelector('#report').textContent=JSON.stringify(result,null,2);document.querySelector('#status').textContent=(result.ok?'Passed ':'Failed ')+result.samples.length+' composition samples; resources '+(result.resourcesReleased?'released':'unresolved');}
 catch(error){document.querySelector('#status').textContent='Unavailable: '+error.message;}
 finally{button.disabled=false;}
});
