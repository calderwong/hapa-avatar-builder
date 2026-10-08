
/* Depth-aware half-resolution reconstruction experiment. No history feedback.
 * Volume radiance/transmittance remain separate from opaque depth. Full res is default.
 */
'use strict';
window.HapaCurrentShaders={upsample:`#version 300 es
precision highp float;uniform vec2 uResolution,uLowSize;uniform float uNear,uFar;
uniform sampler2D uBase,uBaseEm,uDepth,uVolume,uLowEm;
layout(location=0)out vec4 color;layout(location=1)out vec4 emission;
float linearZ(float d){float z=d*2.-1.;return 2.*uNear*uFar/(uFar+uNear-z*(uFar-uNear));}
void main(){vec2 uv=gl_FragCoord.xy/uResolution;float depth=linearZ(texture(uDepth,uv).r);vec4 sum=vec4(0.);vec3 e=vec3(0.);float weight=0.;vec2 pos=uv*uLowSize-.5,cell=floor(pos);
 for(int y=0;y<2;y++)for(int x=0;x<2;x++){vec2 coord=(cell+vec2(float(x),float(y))+.5)/uLowSize;vec4 sampleEm=texture(uLowEm,coord);float spatial=(x==0?1.-fract(pos.x):fract(pos.x))*(y==0?1.-fract(pos.y):fract(pos.y));float edge=exp(-abs(sampleEm.a-depth)/max(.12,depth*.035));float w=spatial*edge;sum+=texture(uVolume,coord)*w;e+=sampleEm.rgb*w;weight+=w;}
 vec3 base=texture(uBase,uv).rgb,em=texture(uBaseEm,uv).rgb;if(weight>.0001){sum/=weight;e/=weight;color=vec4(base*clamp(sum.a,0.,1.)+sum.rgb,1.);emission=vec4(em*clamp(sum.a,0.,1.)+e,1.);}else{color=vec4(base,1.);emission=vec4(em,1.);}
}`};

