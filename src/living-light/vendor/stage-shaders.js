
/* Original Dancing Stages shaders. Rest mesh -> bounded deformed mesh -> attached material.
 * Normals differentiate the same deformation. Mesh depth participates in the host MRT.
 */
'use strict';
window.HapaStageShaders=(()=>{
 const response=`
uniform vec4 uStPhase,uStMotion,uStTone,uStAccent[4];
uniform float uStEcho,uStSeed,uStClock,uStTexture,uStAtmosphere,uStFocus;
uniform int uStOn,uStBody,uStWind,uStFamily;
${HapaWindKernel.glsl}
float stEcho(vec3 p,float seed){float result=0.,d=length(p.xz-vec2(0.,-2.));
 for(int i=0;i<4;i++){vec4 e=uStAccent[i];if(e.w<=0.)continue;float a=e.x-d/7.-(.5+.5*sin(seed))*.18;if(a<0.)continue;
 result+=e.y*sin(a*7.5)*exp(-a*1.8)*clamp(a/.07,0.,1.);}
 return clamp(result,-1.,1.)*uStEcho;
}
vec3 stagePoint(vec3 p,vec3 anchor,vec4 data,vec3 wind){
 float role=data.x,s=data.y+uStSeed,h=max(.1,data.z),amp=uStMotion.x,life=uStMotion.y;
 if(uStOn==0||amp<=0.||role<.5)return p;
 amp*=role<1.5?1.35:role<2.5?1.65:role<3.5?1.75:role<4.5?1.4:role<5.5?1.6:role<6.5?1.8:.8;
 vec3 v=p-anchor;float top=clamp(v.y/h,0.,1.),hang=clamp(-v.y/h,0.,1.),e=stEcho(p,s);
 vec4 ph=uStPhase,m=uStMotion,tn=uStTone;vec3 o=p;
 if(role<1.5){float g=top*top,a=ph.x+s+v.z*.23;
  o.x+=amp*g*(v.x*(.015*life+.040*m.z)*sin(a)+(.06*life+.20*m.w)*sin(ph.y+s));
  o.y+=amp*g*((.09*life+.34*m.z)*sin(a-.5)+.15*e);
  o.z+=amp*g*((.10*life+.35*tn.x)*sin(ph.w+s+v.x*.25)+.18*e);
 }else if(role<2.5||role>6.5){float g=hang*hang,air=role>6.5?.45:1.;
  o.x+=amp*g*air*((.20*life+.42*m.w)*sin(ph.y+s+v.y*.65)+wind.x*(.12*life+.26*m.w));
  o.z+=amp*g*air*((.22*life+.44*tn.x)*sin(ph.w+s+v.x*1.6+v.y*.8)+.34*e+wind.z*(.12*life+.26*m.w));
  o.y+=amp*hang*air*(.06*life+.15*tn.y)*sin(ph.z+s+v.x*1.2);
 }else if(role<3.5){float a=amp*((.045*life+.18*m.w+.10*tn.y)*sin(ph.y+s)+.10*e),c=cos(a),sn=sin(a);
  o.x=anchor.x+v.x*c-v.z*sn;o.z=anchor.z+v.x*sn+v.z*c;o.y+=amp*top*(.06*life+.17*tn.x)*sin(ph.w+s);
 }else if(role<4.5){o.y+=amp*top*((.10*life+.50*m.z)*sin(ph.x+s)+.38*e);o.x+=amp*top*(.03*life+.13*tn.y)*sin(ph.z+s);
 }else if(role<5.5){float a=amp*(.03*life+.12*tn.x)*sin(ph.w+s),c=cos(a),sn=sin(a);
  o.x=anchor.x+v.x*c-v.y*sn;o.y=anchor.y+v.x*sn+v.y*c;o.z+=amp*(.13*life+.38*m.w)*sin(ph.y+s)+amp*.12*e;
 }else{float g=top*top;o.y+=amp*g*(.08*life+.30*m.z)*sin(ph.x+s+v.z*.2);o.z+=amp*g*((.18*life+.35*tn.x)*sin(ph.w+s+v.y*.6)+.22*e);}
 return o;
}
`;
 const vertex=`#version 300 es
precision highp float;precision highp int;
layout(location=0)in vec3 aPosition;layout(location=1)in vec3 aNormal;layout(location=2)in vec2 aUV;layout(location=3)in vec3 aAnchor;layout(location=4)in vec4 aData;
uniform mat4 uPV;uniform vec3 uEye;
${response}
out vec3 vStPosition,vStNormal,vStRest;out vec2 vStUV;flat out float vStMat,vStSeed;
void main(){vec3 wind=uStWind==1?clamp(windField(aPosition).xyz,vec3(-1.5),vec3(1.5)):vec3(0.);
 vec3 p=stagePoint(aPosition,aAnchor,aData,wind),n=normalize(aNormal),t=normalize(cross(abs(n.y)>.96?vec3(1.,0.,0.):vec3(0.,1.,0.),n)),b=cross(n,t);
 // Differentiate the full receiving deformation; rest-field receiver sample is held locally.
 const float eps=.002;
 vec3 dt=stagePoint(aPosition+t*eps,aAnchor,aData,wind)-stagePoint(aPosition-t*eps,aAnchor,aData,wind);
 vec3 db=stagePoint(aPosition+b*eps,aAnchor,aData,wind)-stagePoint(aPosition-b*eps,aAnchor,aData,wind);
 vStPosition=p;vStNormal=normalize(cross(dt,db));vStRest=aPosition;vStUV=aUV;vStMat=aData.w;vStSeed=aData.y;
 gl_Position=uPV*vec4(p,1.);
}`;
 const fragment=`#version 300 es
precision highp float;precision highp int;
in vec3 vStPosition,vStNormal,vStRest;in vec2 vStUV;flat in float vStMat,vStSeed;
uniform vec3 uEye,uBody,uAccent,uHighlight,uShadow,uFog;
uniform float uStClock,uStTexture,uStAtmosphere,uStFocus,uStClipLevel;
uniform int uStBody,uStFamily,uStReflection,uStAir;
layout(location=0)out vec4 outColor;layout(location=1)out vec4 outEmission;
float stBand(float x,float width){float a=max(fwidth(x)*1.3,.008),d=abs(fract(x+.5)-.5);return 1.-smoothstep(width,width+a,d);}
void main(){if(uStReflection==1&&vStPosition.y<uStClipLevel+.016)discard;
 vec3 V=normalize(uEye-vStPosition),N=normalize(vStNormal);if(dot(N,V)<0.)N=-N;
 vec3 L=normalize(vec3(-.42,.74,.53)),H=normalize(L+V);float nl=max(0.,dot(N,L)),spec=pow(max(0.,dot(N,H)),45.);
 if(uStBody==1){vec3 col=vec3(.16+.56*nl+.10*pow(1.-max(0.,dot(N,V)),2.));outColor=vec4(col,1.);outEmission=vec4(0.,0.,0.,1.);return;}
 vec2 uv=vStUV;float m=vStMat,seed=vStSeed;
 // Mesh/object-space footprints: fine pattern fades rather than shimmering in distance.
 float footprint=max(length(fwidth(uv)),.0001),fine=1.-smoothstep(.025,.12,footprint),detail=min(1.,uStTexture*uStFocus);
 float grain=sin(uv.x*61.+sin(uv.y*19.))*sin(uv.y*43.+sin(uv.x*17.));
 float broad=.5+.5*sin(uv.y*2.2+sin(uv.x*1.4+seed)*1.3);
 float seam=max(stBand(uv.x*.75,.025),stBand(uv.y*.55,.018));
 float carve=stBand(uv.x*2.3+.20*sin(uv.y*2.4),.025)*( .35+.65*broad);
 vec3 base=mix(uShadow*.72,vec3(.10,.16,.18)+uBody*.21,.67),em=vec3(0.);float rough=.65,shine=.14;
 if(m<.5){if(uStFamily==5||uStFamily==6)base=mix(vec3(.065,.045,.041),uBody*.12,.26);if(uStFamily==9)base*=.58;if(uStFamily==1)base*=.24;base*=.73+.27*broad;base*=1.-detail*seam*.46;base+=detail*carve*vec3(.015,.022,.024);base*=1.+detail*fine*grain*.045;rough=.9;shine=.10;}
 else if(m<1.5){base=mix(vec3(.105,.058,.022),uHighlight*.22,.20);base*=.63+.37*broad;float engraving=stBand(uv.y*1.8+.14*sin(uv.x*4.),.035);base*=1.-engraving*detail*.48;base+=uAccent*detail*carve*.022;shine=.42;rough=.22;}
 else if(m<2.5){base=mix(vec3(.115,.18,.205),uHighlight*.33,.35);base*=.84+.16*broad;base*=1.-detail*seam*.32;base+=uAccent*carve*detail*.028;shine=.38;rough=.3;}
 else if(m<3.5){float warp=sin(uv.x*2.1+uv.y*.9+sin(uv.y*1.8+seed)*.34);float woven=stBand(uv.x*5.,.09)*stBand(uv.y*6.,.10);base=mix(uBody*.26+vec3(.035,.025,.064),uAccent*.16+vec3(.012,.023,.034),.5+.5*warp);base*=.74+.26*broad;base+=uHighlight*detail*(carve*.030+woven*fine*.018);if(uStFamily==1)base*=.47;shine=.24;rough=.6;}
 else if(m<4.5){base=mix(vec3(.025,.064,.094),uBody*.30,.45);float etched=max(stBand(uv.x*3.+.12*sin(uv.y*5.),.028),stBand(uv.y*.9,.019));base+=detail*etched*mix(uAccent*.16,uHighlight*.085,.5);shine=.7;rough=.12;}
 else if(m<5.5){base=uHighlight*.40;em=uAccent*.025;shine=.6;rough=.22;}
 else if(m<6.5){base=mix(vec3(.05,.018,.012),vec3(.18,.065,.026),broad);base*=1.-detail*seam*.38;base+=uHighlight*detail*carve*.019;shine=.30;rough=.5;}
 else{
  float edge=sin(clamp(uv.x/3.4,0.,1.)*3.141593)*sin(clamp(uv.y/4.2,0.,1.)*3.141593);
  float wisps=.5+.5*sin(uv.x*2.3+sin(uv.y*2.1+seed)+uStClock*.035);
  float alpha=clamp(edge*edge*wisps*uStAtmosphere*uStFocus*.12,0.,.11);if(alpha<.002)discard;
  vec3 col=mix(uFog*.35,uAccent*.13,.35);outColor=vec4(col*alpha,alpha);outEmission=vec4(0.,0.,0.,alpha);return;
 }
 // Bounded surface-gradient relief. This changes material normals, not the mesh silhouette.
 float relief=detail*(.028*broad-.012*seam+.007*carve+fine*.002*grain);
 vec3 dx=dFdx(vStPosition),dy=dFdy(vStPosition),rx=cross(dy,N),ry=cross(N,dx);float determinant=dot(dx,rx);
 if(abs(determinant)>.0000001){vec3 slope=(dFdx(relief)*rx+dFdy(relief)*ry)/determinant;slope=clamp(slope,vec3(-.22),vec3(.22));N=normalize(N-slope);}
 nl=max(0.,dot(N,L));spec=pow(max(0.,dot(N,H)),mix(78.,20.,rough));
 float rim=pow(clamp(1.-dot(N,V),0.,1.),3.);vec3 col=base*(.48+.75*nl)+uHighlight*spec*shine*.36+uAccent*rim*.05;
 // A warm lower bounce and cool upper fill model the stage's palette, not new moving light sources.
 col+=base*vec3(.12,.065,.027)*(1.-smoothstep(-1.,3.,vStPosition.y));
 float distanceFade=1.-exp(-max(0.,length(uEye-vStPosition)-16.)*.018);col=mix(col,uFog*.17,distanceFade);em*=1.-distanceFade;
 outColor=vec4(max(col+em,vec3(0.)),1.);outEmission=vec4(em,1.);
}`;
 return{response,vertex,fragment};
})();

