
/* Optional Ember lacquer on the existing six streamer meshes. Same Fire field;
 * material/emission only, not a full liquid/gaseous replacement of the character. */
'use strict';
(()=>{const S=HapaOctaveShaders;const add=(s,key,code)=>{if(s.split(key).length!==2)throw Error('Fire binding anchor missing: '+key);return s.replace(key,code);};
 S.silkFragment=add(S.silkFragment,'void main(){',HapaFireKernel.glsl+'\nuniform float uFireCoat;\nvoid main(){');
 S.silkFragment=add(S.silkFragment,'float fog=exp(-max(0.,length(vPos-uEye)-3.)*.037);',`
 if(uMode==0&&uFireCoat>0.){vec3 local=vec3((vUV.y-.5)*1.65,vUV.x*uFireShape.y,0.);vec4 fire=ffSample(local);
  float ink=clamp(fire.x*.65,0.,1.)*uFireCoat;vec3 hot=ffColor(fire.y);
  c=mix(c,c*.42+hot*.075,ink*.65);e+=hot*ink*(.30+uFireOptics.x*.40);
 }
 float fog=exp(-max(0.,length(vPos-uEye)-3.)*.037);`);
})();

