
/* One existing GL context. Opaque geometry writes host projected depth; volume
 * reads it, stops at the nearest surface, and writes to a different scratch pair.
 * Shader kernels are attributed CC BY-NC-SA 3.0 adaptations. See credits.
 */
'use strict';
window.HapaRealmVisuals=function(r){
 HapaContourVisuals(r);
 const gl=r.gl,U=HapaRenderer.uniforms,M=HapaMath;
 const field=HapaRenderer.program(gl,HapaShaders.vertex,HapaRealmShaders.field,'Realms / inscribed architecture');
 const volume=HapaRenderer.program(gl,HapaShaders.vertex,HapaRealmShaders.volume,'Realms / depth-terminated volume');
 r.programs.realmField=field;r.programs.realmVolume=volume;let scratch=null,low=null,focusScratch=null;
 const up=HapaRenderer.program(gl,HapaShaders.vertex,HapaCurrentShaders.upsample,'Depth-aware volume reconstruction');r.programs.currentUpsample=up;
 function blit(src,dst){
  gl.bindFramebuffer(gl.READ_FRAMEBUFFER,src.fbo);gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER,dst.fbo);
  for(let i=0;i<2;i++){gl.readBuffer(gl.COLOR_ATTACHMENT0+i);gl.drawBuffers(i===0?[gl.COLOR_ATTACHMENT0]:[gl.NONE,gl.COLOR_ATTACHMENT1]);gl.blitFramebuffer(0,0,r.width,r.height,0,0,r.width,r.height,gl.COLOR_BUFFER_BIT,gl.NEAREST);}
  gl.bindFramebuffer(gl.FRAMEBUFFER,dst.fbo);gl.drawBuffers([gl.COLOR_ATTACHMENT0,gl.COLOR_ATTACHMENT1]);
 }
 r.drawRealms=(t,f)=>{
  if(HapaContour.active(r.state))return r.drawContour(t,f);
  const s=r.state,config=s.reliquary.realms,q=HapaRealms.evaluate(r.cache,s,t),styleMap={
   'circuit-transit':10,'cloud-slipstream':11,'prism-spindle':15,'echo-drift':16,'contour-fold':17
  },kind=s._tunnel?(styleMap[s._bridge.style]??11):f.cam.kind;
  const u={...f.values,uRealm:kind,uRealmPhase:q.phase,uRealmLevels:q.levels,uRealmDetail:q.detail,uRealmAtmosphere:q.atmosphere,uRealmExpression:q.expression,uRealmRadiance:q.radiance,uRealmLength:s._bridge?.length||36,uRealmAction:q.actions?q.choreo.contrast:0,uPhraseCue:q.choreo.cue,uPhrasePacket:q.choreo.packetUniform,uPhraseTint:q.choreo.packet.color,uStudyMix:q.studyMix,uStudyBlend:q.studyBlend};
  const target=r.scene;
  r.bind(target);gl.drawBuffers([gl.COLOR_ATTACHMENT0,gl.COLOR_ATTACHMENT1]);gl.enable(gl.DEPTH_TEST);gl.depthMask(true);gl.depthFunc(gl.LEQUAL);gl.disable(gl.BLEND);gl.disable(gl.CULL_FACE);gl.clearColor(.001,.001,.002,1);gl.clearDepth(1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
  gl.useProgram(field.p);U(gl,field,{...u,uRealmSteps:s.quality==='high'?140:s.quality==='draft'?76:112});gl.bindVertexArray(r.fullVAO);gl.drawArrays(gl.TRIANGLES,0,3);r.drawCalls++;
  if(config.media)r.drawMedia(f,t);
  // The inspector occluder remains an actual depth-writing surface, including inside fog.
  if(s.occluder){const c=[0,.65,0],pos=M.add(f.cam.eye,M.scale(M.sub(c,f.cam.eye),.5)),model=M.identity();model.set([...M.scale(f.cam.right,1.15),0],0);model.set([...M.scale(f.cam.up,1.15),0],4);model.set([...f.cam.forward,0],8);model.set([...pos,1],12);
   gl.useProgram(r.programs.mesh.p);U(gl,r.programs.mesh,{...f.values,uModel:model,uShape:2,uBlocker:1});gl.bindVertexArray(r.quadVAO);gl.drawArrays(gl.TRIANGLES,0,6);r.drawCalls++;
  }
  const cc=HapaCurrents.config(s),cq=q.choreo;let focusDistance=null,focusAperture=0;
  if(cc.enabled&&cc.lens&&cq.on&&!cq.lookProtected&&kind<10&&s.debug==='beauty'){focusDistance=Math.max(.2,M.dot(M.sub([0,.65,0],f.cam.eye),f.cam.forward)-cq.focus*1.3);focusAperture=(.8+cq.focus*5)*(1-cq.opening*.50)*cq.contrast;if(!focusScratch||!r.targets.includes(focusScratch))focusScratch=r.target(r.width,r.height,{count:2,float:r.hdr});r.full(r.programs.reliquaryFocus,focusScratch,{image:0,emissionImage:1,depthImage:2,size:[r.width,r.height],nearPlane:f.cam.near,farPlane:f.cam.far,focusDistance,aperture:focusAperture},[target.textures[0],target.textures[1],target.depthTexture]);blit(focusScratch,target);}
  const steps=s.quality==='draft'?24:s.quality==='high'?56:40;
  if(([8,9,11,12,14,15,17].includes(kind))&&config.atmosphere>0){
   if(!scratch||!r.targets.includes(scratch))scratch=r.target(r.width,r.height,{count:2,float:r.hdr});
   if(cc.enabled&&cc.halfVolume&&r.hdr){const w=Math.ceil(r.width/2),h=Math.ceil(r.height/2);if(!low||!r.targets.includes(low))low=r.target(w,h,{count:2,float:r.hdr});r.full(volume,low,{...u,uResolution:[w,h],uFullSize:[r.width,r.height],uVolumeOnly:1,uNear:f.cam.near,uFar:f.cam.far,uRealmSteps:steps,uSceneColor:0,uSceneEmission:1,uSceneDepth:2},[target.textures[0],target.textures[1],target.depthTexture]);r.full(up,scratch,{uResolution:[r.width,r.height],uLowSize:[w,h],uNear:f.cam.near,uFar:f.cam.far,uBase:0,uBaseEm:1,uDepth:2,uVolume:3,uLowEm:4},[target.textures[0],target.textures[1],target.depthTexture,low.textures[0],low.textures[1]]);}else r.full(volume,scratch,{...u,uFullSize:[r.width,r.height],uVolumeOnly:0,uNear:f.cam.near,uFar:f.cam.far,uRealmSteps:steps,uSceneColor:0,uSceneEmission:1,uSceneDepth:2},[target.textures[0],target.textures[1],target.depthTexture]);
   blit(scratch,target);
  }
  // Source and bloom belong to this view. No fake projected flare inside cloud/star fields.
  const core=[0,.65,0],project=M.transform(f.cam.pv,[...core,1]);f.source=core;f.sourceFront=project[3]>0;f.sourceUV=[project[0]/project[3]*.5+.5,project[1]/project[3]*.5+.5,project[2]/project[3]*.5+.5];
  const bloomScale=kind===12||kind===15?1.18:kind===13||kind===16?1.22:kind===14||kind===17?1.15:1.04;
  const exposureScale=kind===14||kind===17 ? .88 : kind===12||kind===13||kind===15||kind===16 ? .97 : 1.0;
  f.e.values['optics.flare']=0;
  f.e.values['optics.bloom']*=bloomScale;
  f.e.values['optics.exposure']*=exposureScale;
  f.e.director.subject=kind===7?'Recursive circuit tracery':kind===8?'Inversion stars and an orbital instrument':kind===9?'The cloud choir':kind===10?'Circuit-lit passage':kind===11?'Cloud Slipstream':kind===12?'Prism Sanctum':kind===13?'Echo Lattice':kind===14?'Contour Gallery':kind===15?'Prism Spindle':kind===16?'Echo Drift':'Contour Fold';
  f.realms={time:t,kind,...q,focusDistance,focusAperture,volumeResolution:cc.enabled&&cc.halfVolume&&r.hdr?[Math.ceil(r.width/2),Math.ceil(r.height/2)]:[r.width,r.height],volumeSteps:(([8,9,11,12,14,15,17].includes(kind))&&config.atmosphere>0)?steps:0,volumeDepth:'nearest projected opaque depth',incoming:!!s._incoming};r.realmStats=f.realms;
  return f;
 };
 return true;
};

