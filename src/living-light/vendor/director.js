
/* Director 0.4: pure score-time choreography, cached measurements, editable human takes.
   No transport, network, file system, or GPU ownership. All values are normalized 0..1.
   Visual act names are editorial, NOT inferred verse/chorus/lyric annotations. */
'use strict';
window.HapaDirector=(()=>{
 const clamp=(x,a=0,b=1)=>Math.min(b,Math.max(a,x));
 const mix=(a,b,t)=>a+(b-a)*t;
 const ease=x=>{x=clamp(x);return x*x*(3-2*x);};
 const defs=[
  {id:'intimacy',label:'Intimacy',description:'Moves the camera closer to its subject; no change to playback speed.',default:.65},
  {id:'density',label:'Density',description:'Reveals companion screens and raises atmospheric detail.',default:.42},
  {id:'radiance',label:'Radiance',description:'Emissive seams and selective bloom, not the audio volume.',default:.48},
  {id:'motion',label:'Motion',description:'Bounded camera movement amplitude. Phase comes from absolute song time.',default:.45},
  {id:'reveal',label:'Reveal',description:'Opens the aperture and unfolds the companion media surfaces.',default:.35},
  {id:'flare',label:'Optics',description:'Source-anchored lens flare; real scene depth can still hide it.',default:.32}
 ];
 const rigs=['intimate','portrait','wide','orbit'];
 const bases={intimate:[.86,.18,.36,.20,.13,.18],portrait:[.62,.40,.47,.38,.46,.30],wide:[.27,.61,.58,.49,.81,.40],orbit:[.44,.76,.61,.61,.91,.43]};
 function create(score){return {enabled:true,mode:'cinematic',holds:{},lanes:{},releases:{},touches:{},controlModes:Object.fromEntries(defs.map(p=>[p.id,'auto'])),releaseDuration:.18,shots:structuredClone(score.shots),recording:false,visuals:Object.fromEntries(score.stems.map(s=>[s.id,s.availability==='present'])),sourceId:score.id};}
 function sampleLane(points,t,automatic){
  if(!points?.length||t<points[0].time)return null;
  let i=0;while(i+1<points.length&&points[i+1].time<=t)i++;
  const a=points[i],b=points[i+1];
  if(a.value===null){
   const dur=a.duration??0,age=t-a.time;
   return dur>0&&age<dur?automatic+(a.offset||0)*(1-ease(age/dur)):null;
  }
  // A release is an event, not an instruction to fade early toward a future value.
  if(!b||b.value===null||b.event==='touch')return a.value;
  return mix(a.value,b.value,ease((t-a.time)/Math.max(.00001,b.time-a.time)));
 }
 function shotAt(shots,t){let i=0;while(i+1<shots.length&&shots[i+1].start<=t)i++;return {shot:shots[i],index:i,local:clamp((t-shots[i].start)/(shots[i].end-shots[i].start))};}
 function evaluate(score,cache,performance,t){
  const d=performance.director,at=shotAt(d.shots,t),shot=at.shot,next=d.shots[at.index+1];
  const directionMode=shot.locks?.shot?shot.lockedMode||d.mode:d.mode;
  const transition=next&&!shot.locked&&!shot.locks?.camera?ease((t-(shot.end-3))/3):0;
  const baseA=bases[shot.rig]||bases.portrait,baseB=bases[next?.rig]||baseA;
  const feature=(id,key='energy')=>{const f=cache.get(id,key,t);return performance.stems[id]?.visual!==false&&f.availability==='present'?(f.value??0):0;};
  const v=feature('lead-vocals'),g=feature('guitar'),dr=feature('drums'),bs=feature('bass'),sy=feature('synth'),back=feature('backing-vocals');
  const keys=feature('keyboard'),strings=feature('strings'),brass=feature('brass'),winds=feature('woodwinds'),perc=feature('percussion'),other=feature('other');
  const additions=[.09*v,.07*sy+.07*g+.025*keys+.03*strings+.02*other,.13*v+.1*back+.035*brass,.07*dr+.025*perc,.08*g+.04*bs+.025*winds,.09*back+.03*brass];
  const sourceLabels=[['lead-vocals'],['synth','guitar','keyboard','strings','other'],['lead-vocals','backing-vocals','brass'],['drums','percussion'],['guitar','bass','woodwinds'],['backing-vocals','brass']];
  const gesture=window.HapaHorizons?HapaHorizons.evaluate(performance,t):{open:0,spotlight:0,charge:0};
  const gestureAdd=[-.13*gesture.open,-.22*gesture.spotlight,.10*gesture.open+.14*gesture.charge,0,.28*gesture.open,.08*gesture.charge];
  const values={},trace={};
  defs.forEach((p,i)=>{
   let baseline=d.enabled?mix(baseA[i],baseB[i],transition):p.default;
   if(directionMode==='ambient'){if(p.id==='motion')baseline*=.23;if(p.id==='density')baseline*=.62;if(p.id==='flare')baseline*=.35;}
   if(directionMode==='performance'){if(p.id==='intimacy')baseline=.55;if(p.id==='reveal')baseline=.7;if(p.id==='motion')baseline=.3;}
   const contribution=(d.enabled?additions[i]:0)+gestureAdd[i],automatic=clamp(baseline+contribution);
   let recorded=sampleLane(d.lanes[p.id],t,automatic);
   const punch=(d.punches||[]).filter(x=>x.id===p.id&&t>=x.start&&t<x.end&&x.points.length).at(-1);if(punch){const v=sampleLane(punch.points,t,recorded===null?automatic:recorded);if(v!==null)recorded=v;}
   let result=recorded===null?automatic:recorded;
   const release=d.releases[p.id],returning=!!(release&&release.duration>0&&t>=release.time&&t<release.time+release.duration);if(returning)result+=release.offset*(1-ease((t-release.time)/release.duration));
   const hold=d.holds[p.id];if(Number.isFinite(hold))result=hold;
   if(shot.locks?.look&&shot.lookSnapshot){if(p.id==='radiance')result=shot.lookSnapshot.radiance;if(p.id==='flare')result=shot.lookSnapshot.flare;}
   let limited=null;if(performance.reduced&&p.id==='motion'&&result>.06){result=.06;limited='reduced motion';}if(performance.reduced&&p.id==='flare'&&result>.16){result=.16;limited='reduced motion';}
   values[p.id]=clamp(result);trace[p.id]={time:t,shotId:shot.id,rig:shot.rig,baseline,lookAhead:transition,sourceRoles:sourceLabels[i],measuredContribution:contribution-gestureAdd[i],gestureContribution:gestureAdd[i],automatic,recorded,manual:Number.isFinite(hold)?hold:null,release:returning,controlMode:d.controlModes?.[p.id]||'auto',touching:!!d.touches?.[p.id],activity:d.touches?.[p.id]?'touch':Number.isFinite(hold)?'latch':returning?'return':recorded!==null?'take':'auto',limit:limited,final:values[p.id]};
  });
  return {values,trace,shot,index:at.index,local:at.local,transition,features:{vocal:v,guitar:g,drums:dr,bass:bs,synth:sy,backing:back,keyboard:keys,strings,brass,woodwinds:winds,percussion:perc,other},subject:v>.14?'Lead-vocal thread':g>.15?'Guitar weave':'Media aperture'};
 }
 function validateValue(id,value){if(!defs.some(d=>d.id===id))throw Error('Unknown control: '+id);if(value!==null&&(!Number.isFinite(value)||value<0||value>1))throw Error('Control value must be null or a finite number in [0,1].');}
 function point(d,id,time,value,extra={}){
  validateValue(id,value);if(!Number.isFinite(time)||time<0)throw Error('Invalid time');
  const a=d.lanes[id]||(d.lanes[id]=[]),same=a.findIndex(p=>Math.abs(p.time-time)<.000001);
  const p={time:+time.toFixed(6),value,...extra};
  if(same>=0)a[same]=p;else a.push(p);a.sort((a,b)=>a.time-b.time);
  if(a.length>20000)throw Error('Automation point limit reached.');
 }
 function hold(d,id,value,t,current,target=current,options={}){
  validateValue(id,value);const duration=options.duration??d.releaseDuration??.18;
  if(value===null){
   delete d.holds[id];
   const release={time:t,value:current,offset:current-target,duration};d.releases[id]=release;
   if(d.recording){point(d,id,t,null,{event:'release',offset:release.offset,duration});delete d.releases[id];}
  }else{
   d.holds[id]=value;delete d.releases[id];
   if(d.recording)point(d,id,t,value,options.begin?{event:'touch'}:{});
  }
 }
 function validateSession(data,score){
  if(!data||!['hapa.director.session/0.9.4r1'].includes(data.schema))throw Error('Unsupported session schema.');
  if(data.songId!==score.id||JSON.stringify(data.sourceHashes)!==JSON.stringify(score.stems.map(s=>s.sha256)))throw Error('Session belongs to different audio sources.');
  if(!['cinematic','ambient','performance'].includes(data.director?.mode))throw Error('Unknown direction mode.');
  if(!Number.isFinite(data.director.releaseDuration)||data.director.releaseDuration<0||data.director.releaseDuration>.6)throw Error('Invalid release duration');
  for(const [id,mode]of Object.entries(data.director.controlModes||{})){validateValue(id,null);if(!['auto','latch'].includes(mode))throw Error('Invalid human mode');}
  for(const [id,value]of Object.entries(data.director.holds||{})){validateValue(id,value);if(data.director.controlModes[id]!=='latch')throw Error('Auto controls cannot contain saved holds');}
  for(const [id,points]of Object.entries(data.director.lanes||{})){
   validateValue(id,null);if(!Array.isArray(points)||points.length>20000)throw Error('Invalid lane');let last=-1;
   for(const p of points){validateValue(id,p.value);if(!Number.isFinite(p.time)||p.time<0||p.time>score.duration||p.time<last)throw Error('Invalid keyframe time/order.');if(p.duration!==undefined&&(!Number.isFinite(p.duration)||p.duration<0||p.duration>.6))throw Error('Invalid release point');if(p.offset!==undefined&&(!Number.isFinite(p.offset)||Math.abs(p.offset)>1))throw Error('Invalid release offset');last=p.time;}
  }
  const shots=data.director.shots;if(!Array.isArray(shots)||shots.length<1||shots.length>64)throw Error('Between one and sixty-four ordered shots are required.');
  let last=0;for(const s of shots){if(!Number.isFinite(s.start)||!Number.isFinite(s.end)||Math.abs(s.start-last)>.001||s.end<=s.start||!rigs.includes(s.rig)||typeof s.label!=='string'||s.label.length>80)throw Error('Invalid shot bounds, label, or camera rig.');last=s.end;}
  if(Math.abs(last-score.duration)>.001)throw Error('Shot coverage differs from song duration.');
  if(!data.flow||typeof data.flow.resonance!=='boolean'||typeof data.flow.braid!=='boolean'||typeof data.flow.edge!=='boolean')throw Error('Invalid Flow visual settings');
  if(!HapaCore.worlds.some(w=>w.id===data.world)||!HapaCore.palettes.some(p=>p.id===data.palette))throw Error('Unknown world or palette.');
  if(data.render){const r=data.render;
   for(const [k,a,b]of [['yaw',-256,256],['pitch',-.7,.7],['fov',36,72],['exposure',.3,2.8],['finishAmount',0,.65],['mediaGain',0,2]])if(r[k]!==undefined&&(!Number.isFinite(r[k])||r[k]<a||r[k]>b))throw Error('Invalid render field: '+k);
   for(const [k,allowed]of [['quality',['draft','balanced','high']],['materialMode',['direct','texture']],['camera',['directed','still']]])if(r[k]!==undefined&&!allowed.includes(r[k]))throw Error('Unknown render option: '+k);
   if(r.effects)for(const [k,v]of Object.entries(r.effects))if(!['weave','bloom','flare','dust','finish','meshes'].includes(k)||typeof v!=='boolean')throw Error('Invalid effect toggle');
   if(r.gradeMedia!==undefined&&typeof r.gradeMedia!=='boolean')throw Error('Invalid media grade flag');
  }
  if(window.HapaEditorial&&data.schema==='hapa.director.session/0.9.4r1')HapaEditorial.validate(data,score);
  if(window.HapaPassages){HapaPassages.validate(data,score);for(const take of data.cut?.takes||[])HapaPassages.validate({...data,director:{...data.director,shots:take.shots},passages:take.passages},score);}
  if(window.HapaHorizons)HapaHorizons.validate(data,score);if(window.HapaReliquary)HapaReliquary.validate(data);
  return true;
 }
 return{defs,rigs,create,evaluate,shotAt,hold,point,sampleLane,validateValue,validateSession,clamp,mix,ease};
})();
// Existing geometry/material/optics parameters remain separate from the performance desk.
HapaCore.worlds[2].name='Lunar Cloister';HapaCore.worlds[2].subtitle='Media observatory / shared-depth screens';
HapaCore.modules.push({id:'media.surface',version:'0.4.0',kind:'geometry',description:'Origin-clean video textures on depth-writing triangle surfaces'});
HapaCore._baselineEvaluate=HapaCore.evaluate;
HapaCore.evaluate=function(cache,state,t){
 const f=HapaCore._baselineEvaluate(cache,state,t);if(!state.director)return f;
 const d=HapaDirector.evaluate(cache.score,cache,state,t),p=d.values,sv=d.features;
 Object.assign(f.values,{
  'world.breath':Math.min(.4,.04+.16*sv.bass+.04*p.reveal),
  'material.warp':Math.min(.7,.09+.3*sv.vocal+.23*sv.guitar),
  'material.scale':3.8+p.density*5.2,
  'material.emission':.13+p.radiance*.78+sv.guitar*.10,
  'vocal.presence':.08+sv.vocal*.9+sv.backing*.27,
  'optics.bloom':.08+p.radiance*.46,
  'optics.flare':p.flare*1.25,
  'optics.exposure':state.exposure||1.0,
  'atmosphere.dust':.10+p.density*.75,
  'camera.motion':p.motion,
  'finish.amount':state.finishAmount??.10
 });f.director=d;return f;
};

