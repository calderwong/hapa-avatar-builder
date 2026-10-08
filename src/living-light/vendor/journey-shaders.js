/* 109: opt-in extension of the original fractal wall field + native depth-writing ribs.
 * Standard mode's new uniforms are zero. No fullscreen overlays or new render targets.
 */
'use strict';
window.HapaJourneyShaders=(()=>{
 const warp=`
uniform float uJourneyOn,uJAnchor;
uniform vec4 uJShape,uJPocket;
uniform float uJSpacing;
float jPocket(float z){float a=(z-uJPocket.x)/max(1.,uJPocket.y);return 1.+uJPocket.z*exp(-a*a*a*a);}
vec3 jInverse(vec3 p){
 if(uJourneyOn<.5)return p;
 float theta=atan(p.y,p.x),fac=1.+uJShape.z*sin(theta*6.+p.z*.13);
 float ang=uJShape.w*sin(p.z*.12);float c=cos(ang),s=sin(ang);
 p.xy=vec2(c*p.x+s*p.y,-s*p.x+c*p.y)/(max(vec2(.85),uJShape.xy)*fac*jPocket(p.z));return p;
}
`;
 const once=(s,a,b)=>{if(s.split(a).length!==2)throw Error('109 shader anchor mismatch: '+a);return s.replace(a,b);};
 let field=HapaShaders.field;
 field=once(field,'float thread(vec3 p,float shift){',warp+'\nfloat thread(vec3 p,float shift){');
 field=once(field,'float d=(length(p.xy-c)-',`if(uJourneyOn>.5){vec2 rails=vec2(sin(p.z*.13+shift+uPhase*.012),cos(p.z*.13+shift+uPhase*.012))*2.66;c=mix(rails,c,uJAnchor);}
  float d=(length(p.xy-c)-`);
 field=once(field,'vec3 raw=p;if(uWorld==0)p=gdInverse(p);','vec3 raw=p;if(uWorld==0)p=jInverse(gdInverse(p));');
 // Keep cell centers fixed while families morph; changing a global modulus period causes popping at long distances.
 field=once(field,'float cell=floor((p.z+5.)/10.);','float cell=floor((p.z+5.)/10.);');
 field=once(field,'q.z=mod(q.z+5.,10.)-5.;','q.z=mod(q.z+5.,10.)-5.;if(uJourneyOn>.5)q.z*=10./max(6.,uJSpacing);');

 HapaShaders.field=field;
 const vertex=`#version 300 es
 precision highp float;layout(location=0)in vec2 aUV;
 uniform mat4 uPV;uniform vec3 uEye;
 uniform float uJWeights[6],uJBase,uJClock,uJIntensity;uniform vec4 uJPocket;
 ${HapaGeometryGLSL}
 out vec3 vPos,vNormal;out vec2 vUV;out float vStation;
 const float PI=3.14159265359;
 vec3 shape(float a,float z,float lane){
  float sn=sin(a),cs=cos(a),ph=uJClock*.27;
  vec2 p=vec2(cs,sn)*3.22;
  vec2 cathedral=vec2(cs*(.80+.20*abs(sn)),sn*(sn>0.?1.36:1.05))*3.18;
  float wr=3.10+.30*sin(a*6.+z*.21+ph);
  vec2 weave=vec2(cs,sn)*wr;
  float oct=3.20*cos(PI/8.)/cos(mod(a+PI/8.,PI/4.)-PI/8.);
  vec2 electric=vec2(cs,sn)*oct;
  vec2 glass=vec2(cs*1.13,sn*1.03)*(3.10+.18*sin(a*3.-ph+z*.16));
  vec2 star=vec2(cs,sn)*(3.22+.22*cos(a*6.+ph*.22));
  p=p*uJWeights[0]+cathedral*uJWeights[1]+weave*uJWeights[2]+electric*uJWeights[3]+glass*uJWeights[4]+star*uJWeights[5];
  float pocketDistance=(z-uJPocket.x)/max(1.,uJPocket.y);p*=1.+uJPocket.z*exp(-pocketDistance*pocketDistance*pocketDistance*pocketDistance);
  p*=1.+lane*.041;
  float dz=uJWeights[2]*.52*sin(a*3.+ph+lane*PI)+uJWeights[4]*.40*sin(a*2.+ph*.6)+uJWeights[5]*.11*cos(a*6.);
  return vec3(p,z+lane*.23+dz);
 }
 vec3 point(vec2 uv){
  float station=floor(float(gl_InstanceID)/2.),lane=mod(float(gl_InstanceID),2.);
  float z=uJBase+station*7.6,a=uv.x*PI*2.,v=uv.y*PI*2.;
  vec3 p=shape(a,z,lane),rad=normalize(vec3(p.xy,0.));
  float thickness=.019+.019*uJWeights[1]+.018*uJWeights[4]+.012*uJWeights[5];
  p+=thickness*(rad*cos(v)+vec3(0,0,sin(v)));return gdForward(p);
 }
 void main(){vUV=aUV;vStation=uJBase+floor(float(gl_InstanceID)/2.)*7.6;
  vec3 p=point(aUV),du=point(aUV+vec2(.0002,0)),dv=point(aUV+vec2(0,.0002));
  vPos=p;vNormal=normalize(cross(du-p,dv-p));gl_Position=uPV*vec4(p,1.);
 }`;
 const fragment=`#version 300 es
 precision highp float;in vec3 vPos,vNormal;in vec2 vUV;in float vStation;
 uniform vec3 uEye,uJHot,uJCold;uniform float uJWeights[6],uJClock,uJIntensity;
 uniform int uJProof;
 layout(location=0)out vec4 color;layout(location=1)out vec4 emission;
 void main(){
  if(uJWeights[3]>.72&&fract(vUV.x*8.)>.90)discard;
  vec3 n=normalize(vNormal),v=normalize(uEye-vPos),l=normalize(vec3(.3,.8,-.4));
  float df=.22+.78*abs(dot(n,l)),spec=pow(max(abs(dot(n,normalize(l+v))),0.),38.);
  float jewel=pow(max(0.,cos(vUV.x*6.*6.28318)),64.)*uJWeights[5];
  float nodes=pow(max(0.,cos(vUV.x*8.*6.28318)),24.)*uJWeights[3];
  float pulse=.5+.5*sin(vStation*.50-uJClock*1.7);
  vec3 base=mix(uJCold*.09,uJHot*.13,.45+.45*cos(vUV.x*12.566));
  vec3 e=mix(uJHot,uJCold,jewel)*(.29+.25*spec+.3*jewel+.13*nodes*pulse)*uJIntensity;
  float fade=exp(-length(vPos-uEye)*.021)*(1.-smoothstep(66.,78.,vPos.z-uEye.z));
  color=vec4((base*df+uJHot*spec*.09+e)*fade,1.);emission=vec4(e*fade,1.);
  if(uJProof==1){color=vec4(vec3(.20+.65*abs(dot(n,l))),1.);emission=vec4(0,0,0,1);}
 }`;
 return{vertex,fragment};
})();
