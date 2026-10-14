/** Adapted from the retained Hapa Living Light native media shader/compiler.
 * Keep its depth, linear-light, mask, grading and emission behavior, adding
 * per-placement framing without mutating the shared native material or vendor.
 * This adapter owns one program per painted host and all partial compile handles.
 */
export function livingLightMediaFragment(source) {
 const cover='if(uMediaAspect>uSurfaceAspect){float k=uSurfaceAspect/uMediaAspect;uv.x=clamp(uFocal.x,k*.5,1.-k*.5)+(uv.x-.5)*k;}else{float k=uMediaAspect/uSurfaceAspect;uv.y=clamp(uFocal.y,k*.5,1.-k*.5)+(uv.y-.5)*k;}';
 const sample='vec3 c=srgbToLinear(texture(uVideo,uv).rgb)*uMediaGain;';
 for(const needle of ['uniform sampler2D uVideo;',cover,sample])if(source.split(needle).length!==2)throw Error('Native painted-media shader changed; framing adapter needs review.');
 return source.replace('uniform sampler2D uVideo;','uniform sampler2D uVideo; uniform vec4 uPaintSourceRect,uPaintDestinationRect;')
  .replace(cover,`uv=(uv-uPaintDestinationRect.xy)/uPaintDestinationRect.zw;
 bool insidePicture=all(greaterThanEqual(uv,vec2(0.)))&&all(lessThanEqual(uv,vec2(1.)));
 uv=uPaintSourceRect.xy+uv*uPaintSourceRect.zw;`)
  .replace(sample,'vec3 c=insidePicture?srgbToLinear(texture(uVideo,uv).rgb)*uMediaGain:vec3(0.);');
}
export function createLivingLightMediaMaterial(gl,native) {
 const vertex=native.HapaRenderer.safeShader(native.HapaShaders.mediaVertex),fragment=native.HapaRenderer.safeShader(livingLightMediaFragment(native.HapaShaders.mediaFragment));
 const shaders=[];let program=null,complete=false;
 try {
  for(const [type,source]of [[gl.VERTEX_SHADER,vertex],[gl.FRAGMENT_SHADER,fragment]]){
   const shader=gl.createShader(type);if(!shader)throw Error('Painted media shader allocation failed');shaders.push(shader);
   gl.shaderSource(shader,source);gl.compileShader(shader);
   if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw Error('Painted media shader compilation failed: '+gl.getShaderInfoLog(shader));
  }
  program=gl.createProgram();if(!program)throw Error('Painted media program allocation failed');
  for(const shader of shaders)gl.attachShader(program,shader);gl.linkProgram(program);
  if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error('Painted media shader link failed: '+gl.getProgramInfoLog(program));
  const uniforms=new Map();
  for(let i=0;i<gl.getProgramParameter(program,gl.ACTIVE_UNIFORMS);i++){
   const u=gl.getActiveUniform(program,i);uniforms.set(u.name.replace(/\[0\]$/,''),{type:u.type,size:u.size,name:u.name,loc:gl.getUniformLocation(program,u.name)});
  }
  complete=true;return {p:program,uniforms,label:'Living Light painted placement',vertexSource:vertex,fragmentSource:fragment};
 }finally{for(const shader of shaders)gl.deleteShader(shader);if(!complete&&program)gl.deleteProgram(program);}
}
