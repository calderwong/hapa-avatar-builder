
/* Original 107 receiver materials. Exact opt-out returns the inherited shader path.
 * Deliberately restricted to native stage surfaces; element density/height and tunnel
 * code are not changed. Each insertion asserts its unique source anchor before compile.
 */
'use strict';
(()=>{
 const common=`
uniform int uStOn,uStBody;
uniform float uStTexture,uStClock,uStAtmosphere,uStFocus;
float stLine(float x,float w,float fp){return 1.-smoothstep(w,w+max(.008,fp),abs(fract(x+.5)-.5));}
vec3 stNative(vec3 base,vec3 p,vec3 n,float footprint){
 if(uStOn==0||uStTexture<=0.)return base;
 vec2 q=abs(n.y)>.65?p.xz:abs(n.x)>.65?p.zy:p.xy;
 float fp=max(.006,footprint),fine=1.-smoothstep(.03,.10,fp);
 float broad=.5+.5*sin(q.x*.64+sin(q.y*.82));
 float seams=max(stLine(q.x*.42,.014,fp*.8),stLine(q.y*.42,.014,fp*.8));
 float carving=stLine(q.x*1.3+.12*sin(q.y*2.6),.024,fp*1.6)*( .4+.6*broad);
 float grain=sin(q.x*57.+sin(q.y*31.))*sin(q.y*49.);
 // Cool recesses, a few warm inlays, multi-scale surface relief. Not a light blanket.
 vec3 relief=base*(.69+.31*broad)*(1.-seams*.44);
 relief+=uHighlight*carving*.027+uAccent*carving*.016;
 relief*=1.+grain*fine*.04;
 return mix(base,relief,uStTexture);
}
vec3 stSky(vec3 base,vec3 rd){
 if(uStOn==0)return base;
 float h=smoothstep(-.03,.09,rd.y)*(1.-smoothstep(.36,.72,rd.y));
 float band=sin(rd.z*18.+rd.x*12.+sin(rd.x*6.+uStClock*.009));
 float bank=smoothstep(.1,.9,band)*h;
 return base*(1.-bank*.17*uStAtmosphere)+uAccent*bank*.008*uStAtmosphere;
}
`;
 function once(s,a,b,label){if(s.split(a).length!==2)throw Error('107 stage shader anchor mismatch: '+label);return s.replace(a,b);}
 let s=HapaWaterShaders.field;
 s=once(s,'const float PI=3.14159265359;',common+'\nconst float PI=3.14159265359;','Water declarations');
 s=once(s,'return max(c,vec3(0.));}','return stSky(max(c,vec3(0.)),dir);}','Water sky');
 s=once(s,'col=base*(.36+.67*diffuse)', 'base=stNative(base,p,n,2.*t*tan(uFov*.5)/uResolution.y);\n  col=base*(.36+.67*diffuse)','Water stone');HapaWaterShaders.field=s;
 s=HapaFireShaders.field;s=once(s,'uniform int uFireSteps;',common+'\n uniform int uFireSteps;','Fire declarations');
 s=once(s,'c=base*(.35+.56*lam)', 'if(id<3.5)base=stNative(base,p,n,2.*t*tan(uFov*.5)/uResolution.y);\n   c=base*(.35+.56*lam)','Fire stone');HapaFireShaders.field=s;
 s=HapaLumenShaders.stage;s=once(s,'float boxD(vec3 p,vec3 b)',common+'\nfloat boxD(vec3 p,vec3 b)','Lumen declarations');
 s=once(s,'c=base*(.25+.8*diff)', 'if(hit.y<3.5)base=stNative(base,p,n,footprint);\n  c=base*(.25+.8*diff)','Lumen material');HapaLumenShaders.stage=s;
})();

