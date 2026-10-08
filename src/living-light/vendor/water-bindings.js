
/* One optional Water Paint binding on existing streamers. Coating is not full-volume refraction.
 * Parametric normals are differentiated after the added displacement, by the host silk shader.
 */
'use strict';
(()=>{
 const S=HapaOctaveShaders,insert=(s,a,b)=>{if(s.split(a).length!==2)throw Error('Water binding source anchor drift');return s.replace(a,b);};
 S.silkVertex=insert(S.silkVertex,'out vec3 vPos,vNormal;',HapaWaterKernel.glsl+'\nuniform float uWaterCoat;\nout vec3 vPos,vNormal;');
 S.silkVertex=insert(S.silkVertex,' return p;',' if(uWaterCoat>.5&&uMode==0){vec4 water=waterField(vec2(uv.x*4.,uv.y*3.));p.z+=water.x*.24*sin(uv.x*3.14159265);}\n return p;');
 S.silkFragment=insert(S.silkFragment,'layout(location=0)out vec4 color;',HapaWaterKernel.glsl+'\nuniform float uWaterCoat,uWaterWind;uniform vec2 uWaterFlow;\nlayout(location=0)out vec4 color;');
 S.silkFragment=insert(S.silkFragment,' float fog=exp(-max(0.,length(vPos-uEye)-3.)*.037);',`
 if(uWaterCoat>.5&&uMode==0){vec4 water=waterField(vec2(vUV.x*4.,vUV.y*3.));
  vec3 wn=normalize(n+vec3(-water.y,water.z,0.)*.40);float wet=pow(clamp(1.-abs(dot(wn,v)),0.,1.),5.);
  float glint=pow(max(0.,dot(wn,normalize(l+v))),85.);
  vec3 waterTint=mix(uBody*.18,uAccent*.30,.65)+uHighlight*(glint*.70+wet*.38);
  c=mix(c,waterTint,.67);e*=.42;
 }
 float fog=exp(-max(0.,length(vPos-uEye)-3.)*.037);`);
})();

