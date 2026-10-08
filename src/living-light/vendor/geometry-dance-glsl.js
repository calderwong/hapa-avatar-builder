
/* Forward and inverse match geometry-dance.js. One common deformation contract
 * for SDF structures, vertex paths, attached highlights and the QA transform test.
 */
'use strict';
window.HapaGeometryGLSL=`
uniform float uDanceOn,uDanceLength,uDanceCarry,uDanceRails;
uniform vec4 uDanceShape,uDanceShape2,uDancePhase,uDanceEvents[4];
uniform int uGeometryOnly;
float gdWindow(float z){return uDanceLength>0.?smoothstep(0.,3.2,z)*smoothstep(0.,4.2,uDanceLength-z):1.;}
float gdPulse(float z){float p=0.;for(int i=0;i<4;i++){vec4 e=uDanceEvents[i];float x=(z-e.x)/max(.1,e.z);p+=e.y*exp(-x*x*1.6);}return min(1.3,p);}
float gdAxial(float z){return gdWindow(z)*uDanceShape2.y*sin(.41*z-uDancePhase.w);}
void gdComponents(float z,out vec2 scale,out float twist,out vec2 offset,out float petal){
 float w=gdWindow(z);vec4 a=uDanceShape,b=uDanceShape2,p=uDancePhase;
 float radial=1.+clamp(w*(a.x*sin(.48*z-p.x)+a.w*sin(1.12*z-p.z)-b.w*gdPulse(z)),-.32,.36);
 float oval=w*b.x*sin(.31*z-p.y);scale=vec2(radial+oval,radial-oval);
 twist=w*a.y*sin(.33*z-p.y);offset=w*a.z*vec2(sin(.26*z-p.y*.79),.66*sin(.39*z-p.z*.67));
 petal=w*b.z*sin(.27*z-p.z);
}
vec3 gdForward(vec3 p){if(uDanceOn<.5)return p;vec2 scale,offset;float twist,petal;gdComponents(p.z,scale,twist,offset,petal);
 float fac=1.+petal*cos(4.*atan(p.y,p.x)+uDancePhase.z*.16);vec2 q=p.xy*scale*fac;
 q=vec2(cos(twist)*q.x-sin(twist)*q.y,sin(twist)*q.x+cos(twist)*q.y)+offset;
 return vec3(q,p.z+gdAxial(p.z));
}
vec3 gdInverse(vec3 p){if(uDanceOn<.5)return p;float z=p.z;for(int i=0;i<5;i++)z=p.z-gdAxial(z);
 vec2 scale,offset;float twist,petal;gdComponents(z,scale,twist,offset,petal);vec2 q=p.xy-offset;
 q=vec2(cos(twist)*q.x+sin(twist)*q.y,-sin(twist)*q.x+cos(twist)*q.y)/scale;
 q/=1.+petal*cos(4.*atan(q.y,q.x)+uDancePhase.z*.16);return vec3(q,z);
}
// Deliberately conservative ray steps inside the authored corridor. The map is
// not an exact distance field; solid topology is unchanged and never used as fluid physics.
float gdStepScale(){return uDanceOn>.5?.29:1.;}
`;

