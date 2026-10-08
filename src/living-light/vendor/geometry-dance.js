
/* Hapa Geometry Dance 105 / Loom 🧵. Original deterministic spatial instrument.
 * Cached measured stems + explicit resting floor. No new audio/player/clock.
 * Forward/inverse spatial map shared with GLSL; phase is accumulated, never t*energy.
 */
'use strict';
window.HapaGeometryDance=(()=>{
 const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x)),smooth=x=>{x=clamp(x);return x*x*(3-2*x);};
 const defaults=()=>({enabled:true,breath:.55,gain:.82,asymmetry:.58,waveTravel:.64,carry:.70,rails:.70,character:'flow',octave:1});
 const characters={flow:[1,1,1,1],percussive:[.83,.80,.68,1.38],elastic:[1.12,1.15,1.12,.88]};
 function validate(c){if(!c||Object.keys(c).some(k=>!(k in defaults())))throw Error('Unknown Geometry Dance setting');if(typeof c.enabled!=='boolean')throw Error('Dance enabled must be boolean');for(const k of ['breath','gain','asymmetry','waveTravel','carry','rails'])if(!Number.isFinite(c[k])||c[k]<0||c[k]>1)throw Error('Dance '+k+' must be finite 0–1');if(!characters[c.character]||![0,1,2].includes(c.octave))throw Error('Invalid motion character / octave');return true;}
 const config=s=>({...defaults(),...(s.reliquary?.dance||{enabled:false})});
 const style=s=>s._tunnel?s._bridge?.style:s.world==='breathline-weave'?'fractal-loom':s.world;
 const tunnelStyles=['fractal-loom','thread','threshold','braid','iris-bloom','media-weave','prism-spindle','echo-drift','contour-fold','silken-current','oracle-procession','crown-engine','circuit-transit','cloud-slipstream'];
 const fields=new Set([...tunnelStyles,'contour-gallery','prism-sanctum','echo-lattice']);
 function evaluate(cache,state,t,provided={}){
  if(!Number.isFinite(t)||t<0||t>cache.score.duration)throw Error('Geometry time outside source');
  const c=config(state),k=provided.kin||HapaArticulation.evaluate(cache,state,t),s=k.signals;
  const shot=state.cut?HapaEditorial.frame(state,state._cueTime??t).shot:null;
  const protectedGeometry=!!shot?.locks?.shot;
  const realmFamily=['contour-gallery','contour-fold','echo-lattice','echo-drift','prism-sanctum','prism-spindle','cloud-choir','cloud-slipstream','circuit-basilica','circuit-transit'].includes(style(state));
  const on=c.enabled&&!state.reduced&&state.reliquary?.animated!==false&&(!realmFamily||state.reliquary?.realms?.animate!==false)&&!protectedGeometry;
  const f=id=>s[id]||{},n=x=>Number.isFinite(x)?x:0;
  const bass=clamp(n(f('bass').mass)),voice=clamp(n(f('lead-vocals').sustain)),hit=clamp(Math.max(n(f('drums').strike),n(f('percussion').strike),0));
  const melody=clamp(.45*n(f('guitar').sustain)+.35*n(f('keyboard').sustain)+.35*n(f('synth').sustain)+.20*n(f('strings').sustain));
  const high=clamp(.4*n(f('percussion').high)+.4*n(f('guitar').high)+.6*n(f('synth').high));
  const peak=clamp(k.breadthPeak||0),breadth=1+4*(state.reliquary?.breadthAmount??0)*peak;
  const m=provided.macro||HapaDirector.evaluate(cache.score,cache,state,t).values;
  const live=.40+.60*clamp(m.motion??.45),drive=c.gain*live*(1+.52*(breadth-1));
  const floor=c.breath,kind=style(state),tunnel=tunnelStyles.includes(kind),v=characters[c.character],freq=[.72,1,1.36][c.octave];
  const rate=(.72+.95*c.waveTravel)*freq;
  const accum=(id)=>n(f(id).phase),basePhase=[.72,.52,.64,.46].map(x=>on?t*x*floor*rate:0);
  const audioPhase=[.88*accum('bass')+.20*accum('drums'),.62*accum('lead-vocals')+.3*accum('backing-vocals'),.62*accum('guitar')+.46*accum('synth')+.42*accum('keyboard'),.56*accum('bass')+.5*accum('synth')].map(x=>on?x*c.gain*rate:0);
  const phase=basePhase.map((x,i)=>x+audioPhase[i]);
  // Amplitudes are bounded BEFORE evaluation of the spatial map. Peak multiplier
  // redistributes deformation headroom; it is not permission to close the travel lane.
  const shape=on?[
   Math.min(.28,(.055*floor+drive*(.25*bass+.09*voice))*v[0]),
   Math.min(.70,(.12*floor+drive*(.46*bass+.24*voice))*v[1]),
   Math.min(.56,(.10*floor+drive*(.55*voice+.20*melody))*c.asymmetry*v[2]),
   Math.min(.10,.018*floor+drive*(.095*melody+.055*high))
  ]:[0,0,0,0];
  const shape2=on?[Math.min(.12,.025*floor+drive*.14*voice),Math.min(.48,.11*floor+drive*.48*bass),Math.min(.08,.012*floor+drive*.10*melody),Math.min(.18,drive*.17*v[3])]:[0,0,0,0];
  const events=[];
  if(on&&cache.fixture==='song'){
   for(const id of ['drums','percussion']){
    if(state.stems[id]?.visual===false)continue;const src=cache.score.stems.find(x=>x.id===id);if(src?.availability!=='present')continue;
    const a=src.events||[];let lo=0,hi=a.length;while(lo<hi){let mid=(lo+hi)>>1;if(a[mid].time<=t)lo=mid+1;else hi=mid;}
    for(let i=lo-1;i>=0&&lo-i<=6;i--){const e=a[i],age=t-e.time;if(age>3.0)break;
     const b=state._bridge,origin=b?-.35+b.length*HapaCurrents.progress(cache,state,b,e.time):-7+cache.phase(e.time);
     events.push({time:e.time,source:id,z:origin+4+age*(7+5*c.waveTravel),strength:clamp(e.strength)*Math.exp(-age*.8),width:1.3+.8*bass,age});
    }
   }
  }
  events.sort((a,b)=>b.time-a.time);events.splice(4);
  const ev=new Float32Array(16);for(let i=0;i<4;i++)ev[i*4]=-10000;events.forEach((e,i)=>ev.set([e.z,e.strength,e.width,e.age],i*4));
  const length=state._tunnel?state._bridge?.length||36:0;
  const active=on&&fields.has(kind),protectLook=!!(shot?.locks?.look||shot?.locks?.shot);
  const u={uDanceOn:active?1:0,uDanceShape:shape,uDanceShape2:shape2,uDancePhase:phase,uDanceEvents:ev,uDanceLength:length,uDanceCarry:c.enabled&&!protectLook?c.carry:0,uDanceRails:c.rails,uGeometryOnly:state._geometryProof?1:0};
  return{time:t,active,animated:on,style:kind,tunnel,length,phase,basePhase,audioPhase,shape,shape2,levels:[bass,voice,hit,melody],events,breadth,liveMotion:live,config:c,uniforms:u,source:'cached 60 Hz response over 30 Hz measurements; onset-driven packets',limits:{radial:[.68,1.36],oval:.12,petal:.08,sway:.56,twist:.70,axial:.48},reason:protectedGeometry?'protected shot':state.reduced?'reduced motion':!c.enabled?'disabled':'performing'};
 }
 function windowAt(z,q){return q.length>0?smooth(z/3.2)*smooth((q.length-z)/4.2):1;}
 function pulse(z,q){let p=0;for(const e of q.events){const x=(z-e.z)/e.width;p+=e.strength*Math.exp(-x*x*1.6);}return Math.min(1.3,p);}
 function components(z,q){const [a,b,c,d]=q.shape,ph=q.phase,x=q.shape2,w=windowAt(z,q),hit=pulse(z,q);
  const rad=clamp(w*(a*Math.sin(.48*z-ph[0])+d*Math.sin(1.12*z-ph[2])-x[3]*hit),-.32,.36);
  return{radial:1+rad,oval:w*x[0]*Math.sin(.31*z-ph[1]),twist:w*b*Math.sin(.33*z-ph[1]),x:w*c*Math.sin(.26*z-ph[1]*.79),y:w*c*.66*Math.sin(.39*z-ph[2]*.67),petal:w*x[2]*Math.sin(.27*z-ph[2]),axial:w*x[1]*Math.sin(.41*z-ph[3])};
 }
 function forward(p,q){if(!q.active)return [...p];const z=p[2],k=components(z,q),a=Math.atan2(p[1],p[0]),pet=1+k.petal*Math.cos(a*4+q.phase[2]*.16),x=p[0]*(k.radial+k.oval)*pet,y=p[1]*(k.radial-k.oval)*pet;
  return[x*Math.cos(k.twist)-y*Math.sin(k.twist)+k.x,x*Math.sin(k.twist)+y*Math.cos(k.twist)+k.y,z+k.axial];}
 function inverse(p,q){if(!q.active)return [...p];let z=p[2];for(let i=0;i<5;i++)z=p[2]-components(z,q).axial;const k=components(z,q),dx=p[0]-k.x,dy=p[1]-k.y,x=(dx*Math.cos(k.twist)+dy*Math.sin(k.twist))/(k.radial+k.oval),y=(-dx*Math.sin(k.twist)+dy*Math.cos(k.twist))/(k.radial-k.oval),a=Math.atan2(y,x),pet=1+k.petal*Math.cos(a*4+q.phase[2]*.16);return[x/pet,y/pet,z];}
 function patch(state,p){const c={...config(state),...p};validate(c);HapaEditorial.checkpoint(state,'Geometry Dance recipe');state.reliquary.dance=c;HapaEditorial.saveActive(state);return structuredClone(c);}
 return{defaults,validate,config,style,tunnelStyles,evaluate,forward,inverse,components,windowAt,patch,characters};
})();

