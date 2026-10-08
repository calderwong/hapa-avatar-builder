
/* Original surface functions, derived analytically for this build. Not fetched ISF code.
 * Original Menger topology is retained; 105's shared deformation moves field and contours.
 * Finite pixel footprints prevent fine marks becoming razor-thin at grazing angles.
 */
'use strict';
(()=>{
 const S=HapaShaders;
 const code=`
uniform float uLoomOn,uLoomMix,uLoomClarity,uLoomPulses,uLoomContrast,uLoomRibbons;
uniform int uLoomMode;uniform vec4 uLoomPhase;
uniform float uLoomVoice,uLoomLace,uLoomBass,uLoomAir,uLoomRange;
uniform vec3 uLoomEvents[6];
float loomLine(float q,float w,float fp){float d=abs(fract(q+.5)-.5),aa=max(.001,fp*.68);
 float line=1.-smoothstep(max(0.,w-aa),w+aa,d);
 return mix(line,min(1.,2.*w),smoothstep(.38,.95,fp));}
vec4 loomPattern(vec2 p,float fp){
 float scale=1.55,ph=uLoomPhase.x,slow=uLoomPhase.y;
 vec2 q=p*scale;
 q+=vec2(sin(q.y*.53+ph*.31),sin(q.x*.57-ph*.27))*(.08+.10*uLoomBass);
 float pixel=fp*scale,w=mix(.062,.026,uLoomClarity);
 float gx=loomLine(q.x,w,pixel),gy=loomLine(q.y,w,pixel),grid=max(gx,gy);
 vec2 cell=abs(fract(q+.5)-.5);
 float node=1.-smoothstep(.068,.10+pixel*.65,length(cell));
 // A smaller nested grid is weighted by its actual projected footprint.
 float sub=max(loomLine(q.x*3.,w*.72,pixel*3.),loomLine(q.y*3.,w*.72,pixel*3.));
 float relay=.5+.5*sin(q.x*2.15+q.y*.65-ph*2.0);
 relay=relay*relay*relay;
 float graph=grid*(.35+.65*relay)+sub*.12*(1.-smoothstep(.12,.48,pixel));
 float warp=sin(p.y*1.85+slow*.28)+.55*sin(p.x*2.10-ph*.22);
 float a=sin(p.x*3.2+warp*.75+ph*.44),b=sin(p.y*3.05-warp*.72-slow*.38);
 float d=abs(a+b*.72),aa=max(.015,fp*4.1);
 float liquid=(1.-smoothstep(.06,.12+aa,d))*(.52+.48*(.5+.5*sin(p.y*1.3+ph*.24)));
 float contour=loomLine(p.x*.62+p.y*.24+.12*sin(p.y*.85+slow*.18)-uLoomPhase.z*.10,w*.86,fp*.95);
 float contour2=loomLine(p.x*.28-p.y*.72+.18*sin(p.x*.58+ph*.20)+uLoomPhase.z*.06,w*.72,fp*.85);
 float halo=max(contour*.72,contour2*.58)*( .55+.45*relay );
 return clamp(vec4(max(graph,halo*.22),liquid+.22*halo,max(contour,contour2*.86),node*(.28+.72*relay)+halo*.18),0.,1.);
}
vec4 loomTriplanar(vec3 p,vec3 n,float fp){
 vec3 weights=abs(n);weights=weights*weights;weights=weights*weights;weights/=max(.001,dot(weights,vec3(1.)));
 return loomPattern(p.yz,fp)*weights.x+loomPattern(p.xz,fp)*weights.y+loomPattern(p.xy,fp)*weights.z;
}
float loomWave(vec3 p){float wave=0.;for(int i=0;i<6;i++){
 vec3 e=uLoomEvents[i];float x=(p.z-e.x)/max(.1,e.z),tail=(p.z-e.x+1.6)/max(.25,e.z*1.8);
 wave+=(exp(-x*x*1.7)+.15*exp(-tail*tail*2.2))*max(0.,e.y);}
 return min(1.7,wave)*uLoomPulses;
}
void loomSurface(vec3 p,vec3 n,vec3 ray,float travel,float id,inout vec3 col,inout vec3 emission){
 if(uLoomOn<.5||uLoomMix<=0.||uWorld!=0)return;
 float fp=min(.5,max(.0008,travel*(2.*tan(uFov*.5))/max(64.,uResolution.y))/max(.22,abs(dot(n,-ray))));
 vec3 local=gdInverse(p);vec4 m=loomTriplanar(local,n,fp);
 vec3 w=uLoomMode==0?vec3(1.,.22,.12):uLoomMode==1?vec3(.24,1.10,.16):vec3(.30,.15,1.15);
 float mark=dot(m.xyz,w),pulse=loomWave(p);
 vec3 cold=mix(uAccent,uEmitColor,.45),gold=uHighlight;
 float carry=uDanceCarry;
 if(id<1.5){
  // Quiet, low-reflectance fractal body; sparse markings remain attached as it deforms.
  float premium=smoothstep(.05,.65,carry);
  col=mix(col,col*.018+vec3(.0002,.00035,.0022),premium);
  emission*=mix(1.,.024,premium);
  float trace=mix(mark,mark*.13,carry);
  emission+=uLoomMix*(cold*trace*(.08+.21*uLoomLace)+gold*m.w*.012);
  emission+=pulse*uLoomMix*(cold*(.12+.13*m.x)+gold*m.w*.08);
 }else if(id<3.5){
  col*=mix(1.,.16,carry);emission*=mix(1.,.20,carry);
  float packet=pow(.5+.5*sin(local.z*2.2-uLoomPhase.z*2.9),6.);
  emission+=mix(cold,vec3(2.,.035,.006),carry)*packet*(.08+.12*uLoomVoice);
 }else if(id<4.5){col*=mix(1.,.09,carry);emission*=mix(1.,.28,carry);}
}
void loomRibbon(vec3 p,vec3 n,vec2 uv,inout vec3 col,inout vec3 emission){
 if(uLoomRibbons<.5||uLoomOn<.5||uWorld!=0)return;
 float fp=min(.3,max(.001,length(p-uEye)*(2.*tan(uFov*.5))/max(uResolution.y,64.)));
 vec4 m=loomPattern(vec2(uv.x*12.,uv.y*3.5),fp);
 float detail=uLoomMode==0?m.x:uLoomMode==1?m.y:m.z;
 vec3 dye=mix(uAccent,uEmitColor,.45);
 vec3 ember=mix(vec3(.10,.22,1.04),vec3(1.30,.28,.10),.58+.42*sin(p.z*.46-uLoomPhase.x*.14));
 float contourAura=pow(clamp(m.z,0.,1.),1.15)*(.40+.60*uLoomVoice)+loomWave(p)*.18;
 if(uDanceCarry>.01){
  float seam=smoothstep(.452,.492,abs(uv.y-.5));
  if(seam<.06&&m.x<.58)discard;
  col*=mix(1.,.025,smoothstep(.05,.65,uDanceCarry));
  emission*=mix(1.,.04,smoothstep(.05,.65,uDanceCarry));
  emission+=mix(dye,vec3(1.9,.10,.012),uDanceCarry)*(seam*.36+m.x*.055);
 }
 col=mix(col,col*.88+dye*detail*.10+ember*contourAura*.045,uLoomMix*.6);
 emission+=uLoomMix*(dye*detail*(.08+.32*uLoomLace)+ember*(.06*contourAura)+uHighlight*loomWave(p)*.14);
}
`;
 function once(source,anchor,replacement){if(!source.includes(anchor)||source.indexOf(anchor)!==source.lastIndexOf(anchor))throw Error('Golden Loom patch anchor mismatch: '+anchor.slice(0,50));return source.replace(anchor,replacement);}
 S.field=once(S.field,'vec3 normalAt(',code+'\nvec3 normalAt(');
 S.field=once(S.field,'float fog=1.-exp(-travel*','loomSurface(p,n,rd,travel,id,color,emission);float fog=1.-exp(-travel*');
 S.meshFragment=once(S.meshFragment,'void main(){',code+'\nvoid main(){');
 S.meshFragment=once(S.meshFragment,'float fog=exp(-length(vPos-uEye)*','loomRibbon(vPos,n,vUV,base,emit);float fog=exp(-length(vPos-uEye)*');
})();

