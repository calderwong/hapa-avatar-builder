
/* Horizons 0.8 — pure score-time gestures, appearance policy, reviewed migration.
 * Effects cannot change transport, route progress or arrival. Human ownership is host-side.
 * The field water is a plane with analytic normals/sky reflections, not a fluid solver.
 */
'use strict';
window.HapaHorizons=(()=>{
 const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x)),smooth=x=>{x=clamp(x);return x*x*(3-2*x);},copy=x=>structuredClone(x);
 const kinds=['wave','open','spotlight','charge','gather','shock','discharge'];
 function defaults(){return {reflections:true,filter:true,attention:true,sourceTrim:false,nudge:false,strength:.72,align:false,focal:{A:[.5,.5],B:[.5,.5]}};}
 function init(s){s.horizons=defaults();s.director.gestures=[];s._gestureLive=[];return s;}
 function envelope(e,t){const end=e.end??(e.time+Math.min(e.duration||4,12));if(t<e.time||t>end+.25)return 0;const inTime=e.kind==='wave'?.055:.12,release=e.releaseDuration??.25;const attack=smooth((t-e.time)/inTime),rel=release>0?1-smooth((t-end)/release):(t<end?1:0);return attack*rel*e.strength;}
 function evaluate(s,t){const events=[...(s.director?.gestures||[]),...(s._gestureLive||[])];const a={discharge:0,shock:0,wave:0,open:0,spotlight:0,charge:0,gather:0,released:0,carryEvents:[],waves:[],active:[]};
  for(const e of events){if(e.kind==='gather'&&e.released&&t>=e.end&&t<e.end+24){const age=t-e.end,amount=e.strength*smooth(age/.16)*(1-smooth((age-1)/3.4));a.released=clamp(a.released+amount);if(amount>.001)a.active.push({id:e.id,kind:'gather',amount,origin:'release'});a.carryEvents.push({id:e.id+':release',time:e.end,life:24,source:'human',strength:e.strength,kind:'human release'});}const env=envelope(e,t);if(env<=0)continue;a[e.kind]=clamp(a[e.kind]+env);a.active.push({id:e.id,kind:e.kind,amount:env,origin:e.origin||'recorded'});if(e.kind==='wave')a.waves.push({age:t-e.time,amplitude:env*(s.reduced?.25:1)*(1-smooth((t-e.time)/3.5)),id:e.id});}
  a.waves=a.waves.slice(-4);return a;
 }
 function validateConfig(h){if(!h||!h.focal)throw Error('Missing Horizons settings');for(const k of ['reflections','filter','attention','sourceTrim','nudge','align'])if(typeof h[k]!=='boolean')throw Error('Invalid Horizons toggle '+k);if(!Number.isFinite(h.strength)||h.strength<0||h.strength>1)throw Error('Invalid gesture strength');for(const k of ['A','B'])if(!Array.isArray(h.focal[k])||h.focal[k].length!==2||!h.focal[k].every(x=>Number.isFinite(x)&&x>=0&&x<=1))throw Error('Invalid media focal point');}
 function validateEvents(events,duration){if(!Array.isArray(events)||events.length>4000)throw Error('Invalid gesture deck');const ids=new Set();for(const e of events){if(typeof e.id!=='string'||ids.has(e.id)||!kinds.includes(e.kind)||![e.time,e.end,e.strength].every(Number.isFinite)||e.time<0||e.time>duration||e.end<e.time||e.end>duration+.001||e.end-e.time>12.001||e.strength<0||e.strength>1)throw Error('Invalid gesture event');if(e.releaseDuration!==undefined&&(!Number.isFinite(e.releaseDuration)||e.releaseDuration<0||e.releaseDuration>.25))throw Error('Invalid gesture release');if(e.released!==undefined&&typeof e.released!=='boolean')throw Error('Invalid release event');ids.add(e.id);}}
 function validate(s,score){validateConfig(s.horizons);validateEvents(s.director.gestures||[],score.duration);for(const t of s.cut?.takes||[]){validateConfig(t.horizons);validateEvents(t.gestures||[],score.duration);}return true;}
 function migration(raw,score){if(raw?.schema!=='hapa.director.session/0.7')throw Error('Only Flow 0.7 sessions have a reviewed migration');const out=copy(raw),changes=['Preserve source identities, cues, take layouts, frozen cameras, locks and latched values.','Keep existing routes and styles. No Iris routes are inserted.','Disable new attention/filter/trim policies to preserve the old appearance.','Add an empty gesture deck; unrecorded temporary touches remain absent.'];
  const quietDefaults=()=>({...defaults(),attention:false,filter:false,reflections:false});
  out.schema='hapa.director.session/0.8.9';out.reliquary=HapaReliquary.defaults();out.horizons=quietDefaults();out.director.gestures=[];out.director.touches={};out.director.releases={};out.passages.schema='hapa.passages/0.8.9';
  for(const t of out.cut?.takes||[]){t.reliquary=HapaReliquary.defaults();t.horizons=quietDefaults();t.gestures=[];if(t.passages)t.passages.schema='hapa.passages/0.8.9';}
  if(out.cut){out.cut.undo=[];out.cut.redo=[];out.cut.punch=null;}
  HapaDirector.validateSession(out,score);return {session:out,changes,requiresConfirmation:true};
 }
 // Browser code uses start/end ownership; this planner only chooses an optional onset candidate.
 function alignTime(score,t,enabled){if(!enabled)return {time:t,basis:'immediate'};const ev=(score.stems.find(x=>x.id==='drums')?.events||[]).find(e=>e.time>=t&&e.time<=t+.16);return ev?{time:ev.time,basis:'nearby measured onset (not a beat)',wait:ev.time-t}:{time:t,basis:'immediate fallback'};}
 return {defaults,init,evaluate,envelope,validate,validateConfig,validateEvents,migration,alignTime,kinds,clamp,smooth};
})();
HapaCore.worlds.push({id:'tidal-observatory',name:'Tidal Observatory',subtitle:'Open sky / tidal platforms / luminous sails',kind:5,modules:['field.tidal-observatory','mesh.tidal-sails','media.surface','optics.beacon'],camera:'open horizon, bounded upright orbit'});
HapaCore.palettes.push({id:'pearl-tide',name:'Pearl & tide',description:'Pearl stone, blue-green water and a warm low sun',roles:{background:'#648594',shadow:'#082c35',body:'#8da9a2',accent:'#249b9f',highlight:'#ffd09b',emission:'#85dfca',fog:'#467077'}});
HapaCore.modules.push({id:'field.tidal-observatory',version:'0.8',kind:'world',outputs:['linearColor','linearEmission','projectedDepth']},{id:'gesture.deck',version:'0.8',kind:'control',description:'Score-time finite events, explicit releases, no edits to arrival time'},{id:'transition.iris-bloom',version:'0.8',kind:'transition',description:'Depth-writing solid petals on a live destination opening'});

