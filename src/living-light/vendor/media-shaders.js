
/* Actual depth-writing media geometry. No DOM-overlay trick or canvas-2D projection.
   RGB video is treated as SDR sRGB-like browser-decoded input, then composed in linear light. */
'use strict';
HapaShaders.mediaVertex=`#version 300 es
precision highp float;
layout(location=0) in vec2 aUV;
uniform mat4 uPV,uModel;uniform vec2 uSize;
out vec2 vUV;out vec3 vPos;
void main(){vUV=aUV;vec4 w=uModel*vec4((aUV-.5)*uSize,0.,1.);vPos=w.xyz;gl_Position=uPV*w;}`;
HapaShaders.mediaFragment=`#version 300 es
precision highp float;
in vec2 vUV;in vec3 vPos;
uniform sampler2D uVideo;
uniform vec3 uHighlight,uAccent,uEye;
uniform float uMediaAspect,uSurfaceAspect,uRadiance,uMediaGain;
uniform int uMask,uGrade;
layout(location=0) out vec4 outColor;layout(location=1) out vec4 outEmission;
vec3 srgbToLinear(vec3 c){return mix(pow((c+.055)/1.055,vec3(2.4)),c/12.92,lessThanEqual(c,vec3(.04045)));}
void main(){
 vec2 q=vUV-.5;float edge=0.;
 if(uMask==1){float r=length(q*2.);if(r>1.)discard;edge=smoothstep(.951,.981,r);}
 else{float d=min(min(vUV.x,1.-vUV.x),min(vUV.y,1.-vUV.y));edge=1.-smoothstep(.005,.016,d);}
 vec2 uv=vUV;
 if(uMediaAspect>uSurfaceAspect)uv.x=.5+(uv.x-.5)*uSurfaceAspect/uMediaAspect;else uv.y=.5+(uv.y-.5)*uMediaAspect/uSurfaceAspect;
 vec3 c=srgbToLinear(texture(uVideo,uv).rgb)*uMediaGain;
 if(uGrade==1)c=mix(c,c*(uAccent*.6+vec3(.5)),.45);
 vec3 seam=mix(uAccent,uHighlight,.7)*(.32+uRadiance*.9);
 c=mix(c,seam,edge);vec3 emission=seam*edge*.65+c*.025;
 float fog=exp(-length(vPos-uEye)*.013);outColor=vec4(c*fog,1.);outEmission=vec4(emission*fog,1.);
}`;

