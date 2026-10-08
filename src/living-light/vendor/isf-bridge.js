
/* Deliberately narrow ISF admission: simple single-pass GLSL fragment generators/filters.
   Refuses feedback, multipass, imports, audio textures and vertex companions.
   This is NOT an arbitrary ISF loader and is not a port of the inaccessible linked shader. */
'use strict';
window.HapaISF={
 compileSource(source){
  const m=source.match(/^\s*\/\*(\{[\s\S]*?\})\*\//);if(!m)throw Error('ISF JSON header missing.');
  const meta=JSON.parse(m[1]);for(const k of ['PASSES','IMPORTED','PERSISTENT_BUFFERS'])if(meta[k])throw Error('Unsupported ISF capability: '+k);
  const declarations=[];
  for(const input of meta.INPUTS||[]){if(!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(input.NAME))throw Error('Unsafe input identifier');const type={float:'float',bool:'bool',color:'vec4',image:'sampler2D',point2D:'vec2',long:'int'}[input.TYPE];if(!type)throw Error('Unsupported input type '+input.TYPE);declarations.push(`uniform ${type} ${input.NAME};`);}
  const body=source.slice(m[0].length).replace(/\bgl_FragColor\b/g,'outColor');
  return {meta,fragment:`#version 300 es\nprecision highp float;\nlayout(location=0) out vec4 outColor;\nuniform vec2 RENDERSIZE;\nuniform float TIME,TIMEDELTA;\nuniform int FRAMEINDEX;\n#define isf_FragNormCoord (gl_FragCoord.xy / RENDERSIZE)\n#define IMG_NORM_PIXEL(img, uv) texture(img, uv)\n#define IMG_PIXEL(img, px) texture(img, (px) / vec2(textureSize(img,0)))\n${declarations.join('\n')}\n${body}`};
 }
};

