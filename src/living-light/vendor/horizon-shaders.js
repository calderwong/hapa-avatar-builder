
/* Original procedural open-water scene and material filtering. No downloaded shader code.
 * Reflections include the analytic sky and field skyline only (NOT video/triangle reflections).
 * Water depth is planar; waves perturb shading normals. Appearance, not hydrodynamics.
 */
'use strict';
(()=>{
 const S=HapaShaders;
 const shared='uniform float uFilter,uReflections,uAttention,uSpotlight,uOpenGesture;uniform vec2 uGestureWaves[4];\n';
 for(const key of ['field','meshFragment']){
  S[key]=S[key].replace('precision highp float;','precision highp float;\n'+shared);
  S[key]=S[key].replace('return 1.0 - smoothstep(lineWidth, lineWidth * 2.0 + 0.001, distanceToThread);',`float aa=uFilter>.5?max(.001,fwidth(distanceToThread)*.72):.001;
    float detail=1.0-smoothstep(max(0.,lineWidth-aa),lineWidth*2.0+aa,distanceToThread);
    float footprint=max(fwidth(q.x),fwidth(q.y));
    return mix(detail,.14,uFilter*smoothstep(.65,1.5,footprint));`);
 }
 const land=`}else if(uWorld==5){
  // Low pale islands and a deliberately asymmetric distant skyline. Front water remains open.
  d=100.;id=8.;
  for(int i=0;i<3;i++){float j=float(i);vec3 c=vec3((j-1.)*5.4,-2.10,-1.8-j*1.45);vec3 q=p-c;
   float platform=max(length(q.xz)-(1.65+(.5-.5*cos(j*2.))*1.0),abs(q.y)-.18);
   float tier=max(length(q.xz)-1.22,abs(q.y-.20)-.08);d=min(d,min(platform,tier));}
  for(int i=0;i<7;i++){float j=float(i);vec3 c=vec3(-19.+j*6.4,-1.5,-19.-3.*sin(j*1.7));
   float ht=1.35+1.5*(.5+.5*sin(j*2.17));vec3 q=p-c-vec3(0.,ht*.5,0.);
   float rock=box(q,vec3(.7,ht*.5,1.10))-.14;d=min(d,rock);}
  float halo=torus(p-vec3(0.,1.0,-6.2),vec2(4.55,.065));if(halo<d){d=halo;id=4.;}
 `;
 S.field=S.field.replace('}else if(uWorld==4){',land+'}else if(uWorld==4){');
 const water=`
 vec3 tidalSky(vec3 d){
  float h=smoothstep(-.04,.72,d.y);vec3 c=mix(uFog*.82+uHighlight*.24,uBackground*.85,h);
  vec3 sun=normalize(vec3(-.48,.17,-1.));float disk=dot(d,sun);
  c+=uHighlight*(pow(max(0.,disk),700.)*1.9+pow(max(0.,disk),28.)*.12);
  float cloud=sin(d.x*8.+sin(d.z*13.+uPhase*.006))*sin(d.z*11.-d.x*2.);
  c+=uHighlight*.065*smoothstep(.15,.55,cloud)*smoothstep(.12,.32,d.y);
  return c;
 }
 float waveField(vec2 p){float w=sin(p.x*.73+p.y*.49+uPhase*.16)*.040+sin(p.x*1.74-p.y*.90-uPhase*.13)*.018;
  for(int j=0;j<4;j++){float age=uGestureWaves[j].x,amp=uGestureWaves[j].y;float r=length(p)-age*3.0;w+=sin(r*7.0)*exp(-r*r*.60)*amp*.11;}
  return w;
 }
 void tidalMain(){
  vec2 uv=(2.*gl_FragCoord.xy-uResolution)/uResolution.y;
  vec3 rd=normalize(uForward+tan(uFov*.5)*(uv.x*uRight+uv.y*uUp));
  float waterT=rd.y<-.0001?(-2.32-uEye.y)/rd.y:999.;if(waterT<0.)waterT=999.;
  float dist=0.,id=0.;bool hit=false;vec3 p;
  for(int i=0;i<116;i++){if(i>=uSteps)break;p=uEye+rd*dist;vec2 v=mapWorld(p);if(v.x<max(.002,dist*.0007)){hit=true;id=v.y;break;}dist+=max(.003,v.x*.8);if(dist>min(waterT,105.))break;}
  vec3 sky=tidalSky(rd),col=sky,emit=vec3(0.);float depth=1.;
  if(hit&&dist<waterT){
   vec3 n=normalAt(p,max(.003,dist*.0007));vec3 light=normalize(vec3(-.45,.8,.6));float diffuse=max(0.,dot(n,light));float fres=pow(1.-abs(dot(n,-rd)),3.);
   col=mix(uBody,uHighlight,.24)*(.40+.68*diffuse)+uAccent*fres*.05;
   col+=uHighlight*pow(max(0.,dot(n,normalize(light-rd))),50.)*.22;
   float pat=weaveMask(p,n);col+=uBody*pat*.035;
   if(id>3.5&&id<4.5){col=uBody*.6;emit=uEmitColor*(.1+.20*uEmission);}
   if(id>4.5&&id<5.5){col=uHighlight;emit=uHighlight*1.4;}
   float haze=1.-exp(-dist*.018);col=mix(col,sky,haze);emit*=1.-haze;
  }else if(waterT<120.){
   dist=waterT;p=uEye+rd*dist;vec2 pp=p.xz;
   float ep=.08+dist*.001;float dx=(waveField(pp+vec2(ep,0))-waveField(pp-vec2(ep,0)))/(2.*ep),dz=(waveField(pp+vec2(0,ep))-waveField(pp-vec2(0,ep)))/(2.*ep);
   vec3 n=normalize(vec3(-dx,1.,-dz));vec3 reflected=reflect(rd,n);vec3 reflection=tidalSky(reflected);
   if(uReflections>.5){
    float rdist=.07;vec3 rp;
    for(int j=0;j<34;j++){rp=p+vec3(0.,.035,0.)+reflected*rdist;vec2 v=mapWorld(rp);if(v.x<.03){reflection=mix(uShadow*.85,uBody*.65,.55)+uAccent*.05;break;}rdist+=max(.02,v.x*.82);if(rdist>70.)break;}
   }
   float fres=.08+.76*pow(1.-max(0.,dot(-rd,n)),4.5);
   col=mix(uShadow*.52+uAccent*.16,reflection,uReflections>.5?fres:.08);
   vec3 sun=normalize(vec3(-.48,.17,-1.));col+=uHighlight*pow(max(dot(reflected,sun),0.),230.)*.65;
   float rad=length(pp),rings=0.;for(int j=0;j<4;j++){float a=uGestureWaves[j].x;float v=rad-a*3.;rings+=exp(-v*v*16.)*uGestureWaves[j].y;}
   float autoWave=0.;for(int j=0;j<6;j++){float v=rad-uPulses[j].x;autoWave+=exp(-v*v*18.)*uPulses[j].y;}
   emit=uEmitColor*(rings*.60+autoWave*.07*uResonance)*exp(-rad*.025);
   float haze=1.-exp(-dist*.014);col=mix(col,tidalSky(vec3(rd.x,.005,rd.z)),haze);
  }else {dist=999.;}
  if(dist<999.){vec4 clip=uPV*vec4(p,1.);depth=clamp(clip.z/clip.w*.5+.5,0.,1.);}
  gl_FragDepth=depth;outColor=vec4(max(vec3(0.),col+emit),1.);outEmission=vec4(emit,1.);
 }
 `;
 S.field=S.field.replace('void main(){\n vec2 uv=',water+'\nvoid main(){\n if(uWorld==5){tidalMain();return;}\n vec2 uv=');
 // Finite manual waves run on floors/corridors in the earlier worlds too.
 S.field=S.field.replace('float fog=1.-exp(-travel*',`float gestureRing=0.;for(int k=0;k<4;k++){float x=(uWorld==0?p.z-uEye.z:length(p.xz))-uGestureWaves[k].x*3.;gestureRing+=exp(-x*x*9.)*uGestureWaves[k].y;}
  emission+=uEmitColor*gestureRing*.38*(uWorld==0?1.:max(.15,abs(n.y)));
  emission*=uAttention;float fog=1.-exp(-travel*`);
 // Source pattern filtering, restrained sail edging and cloth shading.
 S.meshVertex=S.meshVertex.replace('uniform float uPhase,uVocal,uExitZ;','uniform float uPhase,uVocal,uExitZ,uOpenGesture;');
 S.meshVertex=S.meshVertex.replace('vec4 w=uModel*vec4(p,1.);','if(uShape==5)p.xy*=1.+uOpenGesture*.16;vec4 w=uModel*vec4(p,1.);');
 S.meshVertex=S.meshVertex.replace('if(uShape==2)',`if(uShape==5){float y=aUV.y;float taper=.55+.45*sin(y*3.14159265);p=vec3((aUV.x-.5)*3.5*taper,(y-.5)*4.9,.40*sin(aUV.x*3.14159265)*sin(y*3.14159265)+.13*sin(uPhase*.05+y*3.)*sin(y*3.14159265));}
 if(uShape==2)`);
 S.meshFragment=S.meshFragment.replace('if(uShape==4){',`if(uShape==5){base=mix(uBody*.32+uHighlight*.06,base,.60);emit=uAccent*mask*.035+uEmitColor*edge*(.05+.16*uEmission);diff=.55+.45*max(0.,dot(n,normalize(vec3(2.,4.,5.)-vPos)));}
 emit*=uAttention;
 if(uShape==4){`);
 // Focal point uses valid crop-center limits: no clamp-smearing outside source range.
 S.mediaFragment=S.mediaFragment.replace('uniform int uMask,uGrade;','uniform int uMask,uGrade;uniform vec2 uFocal;uniform float uSourceTrim;');
 S.mediaFragment=S.mediaFragment.replace('if(uMediaAspect>uSurfaceAspect)uv.x=.5+(uv.x-.5)*uSurfaceAspect/uMediaAspect;else uv.y=.5+(uv.y-.5)*uMediaAspect/uSurfaceAspect;',`if(uMediaAspect>uSurfaceAspect){float k=uSurfaceAspect/uMediaAspect;uv.x=clamp(uFocal.x,k*.5,1.-k*.5)+(uv.x-.5)*k;}else{float k=uMediaAspect/uSurfaceAspect;uv.y=clamp(uFocal.y,k*.5,1.-k*.5)+(uv.y-.5)*k;}`);
 S.mediaFragment=S.mediaFragment.replace('c=mix(c,seam,edge);',`vec3 clipTint=srgbToLinear((texture(uVideo,vec2(.22,.35)).rgb+texture(uVideo,vec2(.50,.5)).rgb+texture(uVideo,vec2(.78,.65)).rgb)/3.);
 seam=mix(seam,seam*.50+clipTint*.60,uSourceTrim);c=mix(c,seam,edge);`);
 S.composite=S.composite.replace('uniform vec2 uResolution;','uniform vec2 uResolution,uPortalFocal;');
 S.composite=S.composite.replace('if(uPortalAspect>asp)puv.x=.5+(puv.x-.5)*asp/uPortalAspect;else puv.y=.5+(puv.y-.5)*uPortalAspect/asp;', 'if(uPortalAspect>asp){float k=asp/uPortalAspect;puv.x=clamp(uPortalFocal.x,k*.5,1.-k*.5)+(puv.x-.5)*k;}else{float k=uPortalAspect/asp;puv.y=clamp(uPortalFocal.y,k*.5,1.-k*.5)+(puv.y-.5)*k;}');
})();

