import {createNativeNamespace} from '../../src/living-light/native.generated.js';
import {createLivingLightMediaMaterial} from '../../src/living-light/media-material.js';
import {livingLightMediaFrameRects} from '../../src/domain/living-light-media.js';
export function verifyFramingPixels(){
 const canvas=document.createElement('canvas');canvas.width=64;canvas.height=64;
 const gl=canvas.getContext('webgl2',{preserveDrawingBuffer:true});if(!gl)throw Error('WebGL2 unavailable');
 const native=createNativeNamespace(),textures=[],samples=[];let p,vao,buffer,framebuffer;
 try{
  p=createLivingLightMediaMaterial(gl,native);vao=gl.createVertexArray();buffer=gl.createBuffer();gl.bindVertexArray(vao);gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([0,0,1,0,0,1,0,1,1,0,1,1]),gl.STATIC_DRAW);gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,2,gl.FLOAT,false,0,0);
  const texture=()=>{const t=gl.createTexture();textures.push(t);gl.bindTexture(gl.TEXTURE_2D,t);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.NEAREST);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);return t;};
  framebuffer=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,framebuffer);
  for(let i=0;i<2;i++){const t=texture();gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA8,64,64,0,gl.RGBA,gl.UNSIGNED_BYTE,null);gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0+i,gl.TEXTURE_2D,t,0);}gl.drawBuffers([gl.COLOR_ATTACHMENT0,gl.COLOR_ATTACHMENT1]);if(gl.checkFramebufferStatus(gl.FRAMEBUFFER)!==gl.FRAMEBUFFER_COMPLETE)throw Error('Pixel fixture framebuffer incomplete');
  const picture=document.createElement('canvas');picture.width=4;picture.height=4;const ctx=picture.getContext('2d');for(const [x,y,color]of [[0,0,'red'],[2,0,'lime'],[0,2,'blue'],[2,2,'yellow']]){ctx.fillStyle=color;ctx.fillRect(x,y,2,2);}
  const source=texture();gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,picture);gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,false);
  const identity=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],expect=(label,x,y,rgb)=>{const rgba=new Uint8Array(4);gl.readPixels(x,y,1,1,gl.RGBA,gl.UNSIGNED_BYTE,rgba);const ok=rgb.every((v,i)=>v?rgba[i]>220:rgba[i]<5);samples.push({label,x,y,rgba:[...rgba],expected:rgb,ok});if(!ok)throw Error('Pixel mismatch '+label+': '+rgba);};
  function draw(fit,crop,width=4,height=4){const rect=livingLightMediaFrameRects({framing:{fit,crop}},width,height,1);gl.viewport(0,0,64,64);gl.useProgram(p.p);gl.bindVertexArray(vao);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,source);native.HapaRenderer.uniforms(gl,p,{uPV:identity,uModel:identity,uSize:[2,2],uVideo:0,uMediaGain:1,uMask:0,uGrade:0,uEye:[0,0,0],uHighlight:[0,0,0],uAccent:[0,0,0],uRadiance:0,uSourceTrim:0,uFocal:[.5,.5],uPaintSourceRect:rect.source,uPaintDestinationRect:rect.destination});gl.drawArrays(gl.TRIANGLES,0,6);if(gl.getError()!==gl.NO_ERROR)throw Error('Native GL paint error');}
  const whole={x:0,y:0,width:1,height:1};draw('cover',whole);expect('top left stays red',16,48,[1,0,0]);expect('bottom left stays blue',16,16,[0,0,1]);expect('top right stays green',48,48,[0,1,0]);
  draw('cover',{x:0,y:0,width:.5,height:.5});expect('top-left crop fills center',32,32,[1,0,0]);expect('crop retains orientation',16,16,[1,0,0]);
  draw('contain',whole,8,4);expect('wide fit upper bar',32,56,[0,0,0]);expect('wide fit lower bar',32,8,[0,0,0]);expect('wide fit picture',16,40,[1,0,0]);
  draw('contain',whole,4,8);expect('tall fit left bar',8,32,[0,0,0]);expect('tall fit right bar',56,32,[0,0,0]);expect('tall fit picture',24,48,[1,0,0]);
  draw('cover',whole,8,4);expect('wide fill has no bar',16,56,[1,0,0]);
  return {ok:true,samples,material:'production native painted material',input:'four-color synthetic image uploaded with the production Y-flip'};
 }finally{if(p)gl.deleteProgram(p.p);for(const t of textures)gl.deleteTexture(t);if(buffer)gl.deleteBuffer(buffer);if(vao)gl.deleteVertexArray(vao);if(framebuffer)gl.deleteFramebuffer(framebuffer);gl.getExtension('WEBGL_lose_context')?.loseContext();}
}
