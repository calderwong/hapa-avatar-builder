
/* Element-specific optical hierarchy. No edits to Contour's approved shader path. */
'use strict';
window.HapaElementStyle={
 glsl:`
 uniform float uElementOn,uElementContour,uElementLight,uElementCaustics;
 uniform int uElementBody;
 float elementCore(float x,float width){return exp(-pow(x/max(width,.0001),2.));}
 `,
 uniforms(q){const s=q.style||{};return {uElementOn:s.on?1:0,uElementContour:s.contour||0,uElementLight:s.light||0,uElementCaustics:s.caustics||0,uElementBody:s.body?1:0};}
};

