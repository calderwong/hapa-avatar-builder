
/* Living Light 0.9.4 R1 — original scene-native light adapter.
 * Reconstructed from the saved 0.9.3 runtime, NOT the missing 0.9.4 binaries.
 * Shared song clock, take store and WebGL renderer; no timers or audio devices.
 */
'use strict';
window.HapaLumen=(()=>{
 const cp=x=>structuredClone(x),clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
 const worlds=[{id:'neon-cloister',name:'Neon Cloister',kind:24,subtitle:'Porcelain vault / suspended neon instrument'},
  {id:'lumen-arcade',name:'Lumen Arcade',kind:25,subtitle:'Copper pylons / luminous ribs / moving air'},
  {id:'halo-vault',name:'Halo Vault (Arcade)',kind:25,subtitle:'Compatibility name for the Arcade composition'}];
 const defaults=()=>({schema:'hapa.living-light/1',enabled:true,detail:.72,air:.42,light:.68,glow:.60});
 function validate(c){if(!c||c.schema!==defaults().schema||Object.keys(c).some(k=>!(k in defaults())))throw Error('Unknown Living Light recipe');if(typeof c.enabled!=='boolean')throw Error('Living Light enabled must be boolean');for(const k of ['detail','air','light','glow'])if(!Number.isFinite(c[k])||c[k]<0||c[k]>1)throw Error('Living Light '+k+' must be 0–1');return true;}
 const config=s=>s.reliquary?.lumen||defaults();
 const native=s=>s._tunnel?s._bridge?.style==='neon-cascade':worlds.some(w=>w.id===s.world);
 function patch(s,p){const n={...config(s),...p};validate(n);HapaEditorial.checkpoint(s,'Living Light');s.reliquary.lumen=n;HapaEditorial.saveActive(s);return cp(n);}
 function layout(s){
  if(s._tunnel){const L=s._bridge.length;return Array.from({length:8},(_,i)=>{const z=4+Math.floor(i/2)*(L-10)/3,side=i%2?1:-1;return{a:[side*3.45,1.35,z],b:[side*.52,3.6,z+.45],role:['guitar','lead-vocals','percussion','synth'][Math.floor(i/2)]};});}
  if(s.world==='neon-cloister')return Array.from({length:6},(_,i)=>{const a=i*Math.PI/3;return{a:[3.2*Math.cos(a),.70+(i%2)*.58,-2.1+2.3*Math.sin(a)],b:[.55*Math.cos(a),2.00,-2.1+.55*Math.sin(a)],role:['guitar','backing-vocals','lead-vocals','bass','synth','percussion'][i]};});
  return Array.from({length:6},(_,i)=>{const side=i%2?1:-1,z=-.2-Math.floor(i/2)*2.3;return{a:[side*3.12,.30,z],b:[side*2.1,3.0,z-.42],role:['guitar','lead-vocals','backing-vocals','synth','percussion','bass'][i]};});
 }
 function lights(s,q,channels){
  const a=[],b=[];for(const ch of channels.slice(0,8)){a.push([...ch.a]);b.push([...ch.b]);}
  return{a,b,count:a.length};
 }
 function decorate(s){const list=s.passages.bridges;if(!list.length)return;let from=s.passages.baseWorld;
  const chosen=list.findIndex((b,i)=>i>=2&&!['fractal-loom','thread','threshold','braid','iris-bloom'].includes(b.style));
  for(let i=0;i<list.length;i++){const b=list[i];b.from=from;if(i===0){b.to='neon-cloister';b.toPalette='electric-neon';}if(i===chosen){b.to='lumen-arcade';b.toPalette='lumen-copper';b.style='neon-cascade';b.label='Neon Cascade';}from=b.to;}
 }
 function tour(s,score){if(s.passages.bridges.some(b=>b.locked)||s.director.shots.some(x=>x.locks?.shot||x.locks?.camera))throw Error('Unlock protected routes/cameras before adding a neon journey');const next=cp(s.passages);decorate({...s,passages:next});HapaPassages.validate({...s,passages:next},score);HapaEditorial.checkpoint(s,'Add Neon Cascade');s.passages=next;HapaEditorial.saveActive(s);return cp(next);}
 return{worlds,defaults,validate,config,native,patch,layout,lights,decorate,tour};
})();
for(const w of HapaLumen.worlds){HapaElectricity.worlds.push(w);HapaCore.worlds.push({...w,modules:['paint.electricity','material.lumen','optics.local-scattering'],camera:'bounded upright musical arc'});}
HapaCore.palettes.push(
 {id:'electric-neon',name:'Living Light / Violet glass',roles:{background:'#050813',shadow:'#11192c',body:'#3e5264',accent:'#447ea9',highlight:'#f0cfaa',emission:'#58cfff',fog:'#151d36'}},
 {id:'lumen-copper',name:'Living Light / Copper aurora',roles:{background:'#090b17',shadow:'#19172b',body:'#485067',accent:'#7170a3',highlight:'#efbf82',emission:'#6cceec',fog:'#251e38'}},
 {id:'electric-halo',name:'Living Light / Halo (compatibility)',roles:{background:'#070a15',shadow:'#171b2b',body:'#526477',accent:'#607abd',highlight:'#efd3be',emission:'#79dbf2',fog:'#22243b'}});
HapaElectricity.presets.neon={baseMotion:.68,audioAmp:.85,charge:.70,threshold:.40,bend:.73,branching:.61,travel:.69,corona:.60,afterglow:.79,light:.67,palette:'violet'};
HapaElectricity.presets.arcade={...HapaElectricity.presets.neon,palette:'copper',corona:.54};
HapaElectricity.presets.halo={...HapaElectricity.presets.neon,branching:.45,light:.60};
HapaCore.modules.push({id:'material.lumen',version:'0.9.4r1',kind:'material',description:'Object-bound porcelain seams, brushed copper, dark stone; footprint-filtered detail'},
 {id:'optics.local-scattering',version:'0.9.4r1',kind:'volume',description:'Finite view-ray integration around bounded light segments; opaque termination depth retained; no light-space shadows'});

