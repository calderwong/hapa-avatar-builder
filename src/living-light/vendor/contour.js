
/* Original Hapa Contour 102. Screenshot-guided 3D light architecture.
 * One host song clock. No ISF source copy, hidden timer, or invented audio events.
 */
'use strict';
window.HapaContour=(()=>{
 const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x)),finite=x=>Number.isFinite(x)?x:0;
 const defaults=()=>({enabled:true,loopScale:.58,halo:.52,nodes:.48,blueDepth:.62,baseMotion:.48,audioAmp:.78});
 function validate(c){if(!c||typeof c!=='object'||Object.keys(c).some(k=>!(k in defaults())))throw Error('Unknown Contour 102 setting');
  if(typeof c.enabled!=='boolean')throw Error('Contour enabled must be boolean');
  for(const k of Object.keys(defaults()).filter(k=>k!=='enabled'))if(!Number.isFinite(c[k])||c[k]<0||c[k]>1)throw Error('Contour '+k+' must be within 0–1');return true;
 }
 const config=s=>({...defaults(),...(s.reliquary?.realms?.contour||{})});
 const active=s=>config(s).enabled&&(s._tunnel?s._bridge?.style==='contour-fold':s.world==='contour-gallery') || ((s._geometryProof || (HapaGeometryDance.config(s).enabled && HapaGeometryDance.config(s).carry>0)) && (s._tunnel?['echo-drift','prism-spindle'].includes(s._bridge?.style):['echo-lattice','prism-sanctum'].includes(s.world)));
 function evaluate(cache,state,t){
  const c=config(state),k=HapaArticulation.evaluate(cache,state,t),s=k.signals;
  const on=!state.reduced&&state.reliquary?.animated!==false&&state.reliquary?.realms?.animate!==false;
  const v=s['lead-vocals'],b=s.bass,m=s.guitar,keys=s.keyboard,sy=s.synth,back=s['backing-vocals'];
  const bass=clamp(finite(b.mass)),voice=clamp(finite(v.sustain)),hit=clamp(Math.max(0,finite(s.drums.strike),finite(s.percussion.strike)));
  const melody=clamp(.46*finite(m.sustain)+.28*finite(keys.sustain)+.26*finite(sy.sustain));
  const basePhase=on?.22*c.baseMotion*t:0;
  const musicalPhase=on?c.audioAmp*(.13*finite(m.phase)+.11*finite(keys.phase)+.075*finite(sy.phase)+.045*finite(v.phase)):0;
  const phase=basePhase+musicalPhase;
  return{time:t,phase,basePhase,musicalPhase,animated:on,config:c,
   levels:on?[bass*c.audioAmp,voice*c.audioAmp,hit*c.audioAmp,melody*c.audioAmp]:[0,0,0,0],
   sources:{bass:b.availability,voice:v.availability,guitar:m.availability,keyboard:keys.availability,synth:sy.availability,percussion:s.percussion.availability},
   basis:'Existing cached stem sustain / mass / strike and accumulated phases. No beat, lyric or emotion classification.'};
 }
 function patch(state,p){const c={...config(state),...p};validate(c);HapaEditorial.checkpoint(state,'Contour 102 recipe');state.reliquary.realms={...state.reliquary.realms,contour:c};HapaEditorial.saveActive(state);return structuredClone(c);}
 function excursion(state,score){
  const p=structuredClone(state.passages),existing=p.bridges.find(b=>b.style==='contour-fold');
  let i=existing?p.bridges.indexOf(existing):p.bridges.findIndex((b,j)=>j>=2&&b.style!=='fractal-loom'&&!b.locked);
  if(i<0)throw Error('No eligible non-fractal passage. Choose an unlocked treatment in Passages.');
  const b=p.bridges[i],next=p.bridges[i+1];
  const protect=HapaPassages.protection(state,b);if(b.locked||(next&&next.locked)||protect)throw Error('Protected route: '+(protect||'locked passage'));
  if(next&&HapaPassages.protection(state,next))throw Error('The next route endpoint is protected.');
  b.style='contour-fold';b.to='contour-gallery';b.toPalette='contour-ember-102';b.label='Contour Fold · Emberline';if(next)next.from=b.to;
  HapaPassages.validate({...state,passages:p},score);HapaEditorial.checkpoint(state,'Add one Contour excursion');state.passages=p;state.passages.enabled=true;HapaEditorial.saveActive(state);return structuredClone(b);
 }
 return{defaults,validate,config,active,evaluate,patch,excursion};
})();
HapaCore.palettes.push({id:'contour-ember-102',name:'Contour / Emberline 102',description:'Saturated ultramarine void, red/copper contours and tiny near-white nodes',roles:{background:'#030326',shadow:'#070b35',body:'#0c1440',accent:'#ff2816',highlight:'#fff7e8',emission:'#ff5020',fog:'#101063'}});
HapaCore.modules.push({id:'paint.contour-102',version:'0.9.12',kind:'world',description:'Instanced 3D luminous contours with analytic line halos, blue cell interiors and localized node glows; screenshot-guided original implementation.'});

