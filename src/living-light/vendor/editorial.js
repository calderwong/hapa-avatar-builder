
/* Director's Cut 0.5. Original, deterministic editorial planner + non-destructive takes.
   A shot's name is an authored visual intention, never a claimed musical section.
   No network, audible transport, GPU, or repository ownership. */
'use strict';
window.HapaEditorial=(()=>{
 const clone=x=>structuredClone(x),clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x)),ease=x=>{x=clamp(x);return x*x*(3-2*x)};
 const recipes={cinematic:{label:'Director’s cut',min:14,target:22,max:31},ambient:{label:'Long exposure',min:23,target:34,max:45},performance:{label:'Rhythm study',min:10,target:16,max:23}};
 const names=['An opening held','The first thread','Through the aperture','A wider orbit','At the threshold','The answering light','The space between','Another perspective','Return to the thread','The final room'];
 function plan(score,style='cinematic',seed=1){
  if(!recipes[style])throw Error('Unknown directing recipe');const r=recipes[style],fps=score.fps,master=HapaCore.decode(score.master);
  const val=t=>master[clamp(Math.round(t*fps),0,master.length-1)]/255;
  const novelty=t=>Math.abs(val(t+1.4)-val(t-1.4))+.25*val(t);
  const out=[];let start=0,ix=0;
  while(start<score.duration-.01){
   let end=score.duration,evidence='Ending coverage';
   if(score.duration-start>r.max+8){
    let best=-Infinity;const target=start+r.target+Math.sin((ix+seed)*1.91)*3;
    for(let t=start+r.min;t<=Math.min(start+r.max,score.duration-r.min);t+=.5){const n=novelty(t)-Math.abs(t-target)*.008;if(n>best){best=n;end=Math.round(t*1000)/1000;}}
    evidence='Measured energy-change candidate within a bounded editorial window; not a beat/chorus label';
   }
   const sourceSlot=ix%4===3?'B':'A',cycle=['intimate','portrait','wide','orbit','portrait'];
   out.push({id:'cut-'+(ix+1),label:ix===0?'Before the first step':end===score.duration?'Return, changed':names[ix%names.length],start,end,rig:style==='ambient'?'portrait':cycle[(ix+(style==='performance'?1:0))%cycle.length],locked:false,locks:{shot:false,camera:false,look:false,media:false},cueBasis:evidence,
    media:{slot:sourceSlot,sourceIn:(ix*1.7)%5,sourceOut:9.96,rate:1,policy:'loop',portal:ix>0&&ix%3===2,portalDepth:.84},palette:'inherit',layout:null,cameraPose:null,lookSnapshot:null});
   start=end;ix++;if(ix>60)throw Error('Planner exceeded shot limit');
  }
  return out;
 }
 function init(score,state){
  state.director.shots=plan(score);state.director.punches=[];
  state.cut={schema:'hapa.editorial/0.5',active:'take-1',counter:1,layout:{A:{x:0,y:0,z:0,scale:1,yaw:0},B:{x:0,y:0,z:0,scale:1,yaw:0}},takes:[],undo:[],redo:[],punch:null,selected:0};
  state.cut.takes.push(snapshot(state,'take-1','Director’s cut'));return state;
 }
 function snapshot(state,id=state.cut.active,name){return{reliquary:clone(state.reliquary||HapaReliquary.defaults()),horizons:clone(state.horizons||HapaHorizons.defaults()),gestures:clone(state.director.gestures||[]),flow:clone(state.flow||{resonance:true,braid:true}),controlModes:clone(state.director.controlModes||{}),releaseDuration:state.director.releaseDuration??.18,latchedHolds:Object.fromEntries(Object.entries(state.director.holds).filter(([id])=>state.director.controlModes?.[id]==='latch')),id,name:name||state.cut.takes.find(t=>t.id===id)?.name||'Take',passages:state.passages?clone(state.passages):null,mode:state.director.mode,shots:clone(state.director.shots),lanes:clone(state.director.lanes),punches:clone(state.director.punches||[]),layout:clone(state.cut.layout)};}
 function saveActive(state){const n=state.cut.takes.findIndex(t=>t.id===state.cut.active);state.cut.takes[n]=snapshot(state);}
 function restoreTake(state,t){state.reliquary=clone(t.reliquary||HapaReliquary.defaults());state.horizons=clone(t.horizons||HapaHorizons.defaults());state.director.gestures=clone(t.gestures||[]);state._gestureLive=[];state.flow=clone(t.flow||state.flow);state.director.controlModes=clone(t.controlModes||Object.fromEntries(HapaDirector.defs.map(p=>[p.id,'auto'])));state.director.releaseDuration=t.releaseDuration??.18;state.director.touches={};if(t.passages)state.passages=clone(t.passages);state.director.mode=t.mode;state.director.shots=clone(t.shots);state.director.lanes=clone(t.lanes);state.director.punches=clone(t.punches||[]);state.director.holds=clone(t.latchedHolds||{});state.director.releases={};state.director.recording=false;state.cut.layout=clone(t.layout);state.cut.punch=null;}
 function checkpoint(state,reason){state.cut.undo.push({reason,take:snapshot(state)});if(state.cut.undo.length>40)state.cut.undo.shift();state.cut.redo=[];}
 function undo(state,forward=false){const from=forward?state.cut.redo:state.cut.undo,to=forward?state.cut.undo:state.cut.redo;if(!from.length)return false;const v=from.pop();to.push({reason:v.reason,take:snapshot(state)});restoreTake(state,v.take);saveActive(state);return v.reason;}
 function select(state,id){saveActive(state);const t=state.cut.takes.find(x=>x.id===id);if(!t)throw Error('Unknown take');restoreTake(state,t);state.cut.active=id;state.cut.undo=[];state.cut.redo=[];return t;}
 function fork(state,style='ambient',name){if(!recipes[style])throw Error('Unknown recipe');if(state.cut.takes.length>=12)throw Error('Maximum twelve takes');saveActive(state);const t=snapshot(state,'take-'+(++state.cut.counter),name||recipes[style].label);t.mode=style;
  t.shots.forEach((s,i)=>{if(s.locks.shot)return;
   if(!s.locks.camera){s.rig=style==='ambient'?'portrait':style==='performance'?['portrait','wide','portrait'][i%3]:['intimate','wide','orbit','portrait'][i%4];s.cameraPose=null;}
   if(!s.locks.look)s.palette=style==='ambient'?'blue-hour':style==='performance'?'gilded-tide':'inherit';
   if(!s.locks.media){s.media.sourceIn=+(Math.min(s.media.sourceOut-.2,(s.media.sourceIn+(style==='ambient'?2.1:3.6))%s.media.sourceOut)).toFixed(3);s.media.portal=style!=='performance'&&i>0&&i%3===(style==='ambient'?1:2);s.media.portalDepth=style==='ambient'?.45:.84;}
  });
  state.cut.takes.push(t);state.cut.active=t.id;restoreTake(state,t);state.cut.undo=[];state.cut.redo=[];return t;
 }
 function diff(state,id){const other=state.cut.takes.find(t=>t.id===id);if(!other)throw Error('Unknown compare take');const a=snapshot(state);const rows=[];for(let i=0;i<a.shots.length;i++){const x=a.shots[i],y=other.shots.find(s=>s.id===x.id);if(!y){rows.push({shot:x.id,change:'Missing in comparison'});continue;}const changes=[];for(const [k,label]of [['rig','camera rig'],['palette','palette'],['media','media cue'],['cameraPose','frozen camera']])if(JSON.stringify(x[k])!==JSON.stringify(y[k]))changes.push(label);if(changes.length)rows.push({shot:x.id,start:x.start,label:x.label,changes,protected:!!x.locks.shot});}return{active:a.name,other:other.name,sameBounds:JSON.stringify(a.shots.map(s=>[s.start,s.end]))===JSON.stringify(other.shots.map(s=>[s.start,s.end])),changes:rows};}
 function assertShot(s){if(s.locks?.shot)throw Error('Shot is protected. Unlock it before editing.');}
 function edit(state,id,patch){const shots=state.director.shots,i=shots.findIndex(s=>s.id===id),s=shots[i];if(!s)throw Error('Unknown shot');assertShot(s);const c=clone(s),prev=i>0?shots[i-1]:null;
  const allowed=['label','rig','start','locked','media','palette'];for(const k of Object.keys(patch))if(!allowed.includes(k))throw Error('Unsupported shot field: '+k);
  if(patch.rig!==undefined){if(s.locks.camera&&patch.rig!==s.rig)throw Error('Camera is protected');if(!HapaDirector.rigs.includes(patch.rig))throw Error('Invalid camera preset');c.rig=patch.rig;}
  if(patch.label!==undefined){if(typeof patch.label!=='string'||!patch.label.trim()||patch.label.length>80)throw Error('Invalid label');c.label=patch.label.trim();}
  if(patch.start!==undefined&&patch.start!==s.start){if(!prev||prev.locks.shot)throw Error('Cannot move this boundary');if(!Number.isFinite(patch.start)||patch.start<prev.start+3||patch.start>s.end-3)throw Error('Keep at least 3 seconds per adjacent shot');c.start=patch.start;}
  if(patch.media!==undefined){if(s.locks.media&&JSON.stringify({...s.media,...patch.media})!==JSON.stringify(s.media))throw Error('Media cue is protected');c.media={...c.media,...patch.media};validateCue(c.media);}
  if(patch.palette!==undefined){if(s.locks.look&&patch.palette!==s.palette)throw Error('Look is protected');if(patch.palette!=='inherit'&&!HapaCore.palettes.some(p=>p.id===patch.palette))throw Error('Unknown palette');c.palette=patch.palette;}
  if(patch.locked!==undefined)c.locked=!!patch.locked;
  const trial={...state,director:{...state.director,shots:clone(shots)},passages:state.passages?clone(state.passages):null};if(prev&&c.start!==s.start)trial.director.shots[i-1].end=c.start;trial.director.shots[i]=c;if(trial.passages)HapaPassages.reconcile(trial,HAPA_SCORES.find(x=>x.id===state.director.sourceId));checkpoint(state,'Edit '+s.label);if(prev&&c.start!==s.start)prev.end=c.start;shots[i]=c;if(trial.passages)state.passages=trial.passages;saveActive(state);return c;
 }
 function validateCue(c){if(!c||!['A','B'].includes(c.slot)||!['hold','loop'].includes(c.policy)||!Number.isFinite(c.sourceIn)||!Number.isFinite(c.sourceOut)||c.sourceIn<0||c.sourceOut<=c.sourceIn+.05||c.sourceOut>86400||!Number.isFinite(c.rate)||c.rate<.25||c.rate>2||typeof c.portal!=='boolean'||!Number.isFinite(c.portalDepth)||c.portalDepth<0||c.portalDepth>1)throw Error('Invalid source cue: use a positive source range, 0.25–2× speed, and hold/loop.');}
 function lock(state,id,kind,on,frame){const s=state.director.shots.find(s=>s.id===id);if(!s||!['shot','camera','look','media'].includes(kind))throw Error('Invalid lock');if(s.locks.shot&&kind!=='shot')throw Error('Unlock shot first');checkpoint(state,'Change '+kind+' protection');s.locks[kind]=!!on;
  if(kind==='camera'){if(on){if(!frame?.cam)throw Error('Render the shot first');s.cameraPose={eye:[...frame.cam.eye],forward:[...frame.cam.forward],fov:frame.cam.fov*180/Math.PI};}else s.cameraPose=null;}
  if(kind==='look')s.lookSnapshot=on?{palette:s.palette==='inherit'?state.palette:s.palette,radiance:frame?.e.director?.values.radiance??.5,flare:frame?.e.director?.values.flare??.2}:null;
  if(kind==='shot'&&!on){s.layout=null;s.lockedMode=null;s.locked=false;if(!s.locks.look)s.lookSnapshot=null;}
  if(kind==='shot'&&on){s.layout=clone(state.cut.layout);s.locked=true;s.lockedMode=state.director.mode;s.lookSnapshot={palette:s.palette==='inherit'?state.palette:s.palette,radiance:null,flare:null};}
  saveActive(state);return s;
 }
 function frame(state,t){const a=HapaDirector.shotAt(state.director.shots,t),s=a.shot,c=s.media||{slot:'A',sourceIn:0,sourceOut:12,rate:1,policy:'loop',portal:false,portalDepth:0};const local=clamp((t-s.start)/(s.end-s.start));
  const ingress=ease((local-.12)/.25),egress=1-ease((local-.71)/.21),amount=c.portal&&!state.reduced&&!s.locks?.camera?Math.min(ingress,egress)*c.portalDepth:0;
  return{shot:s,index:a.index,local,cue:c,portal:amount,fullBlend:ease((amount-.60)/.20),layout:s.layout||state.cut.layout,slot:c.slot,palette:s.lookSnapshot?.palette||s.palette,mode:s.locks?.shot?s.lockedMode:null};}
 function sourceTime(state,slot,t,duration){const f=frame(state,t),c=f.cue,active=slot===c.slot;const sourceIn=active?c.sourceIn:0,out=active?c.sourceOut:Math.min(12,duration),rate=active?c.rate:1,policy=active?c.policy:'loop';
  if(out>duration+.04||sourceIn>=duration) return{valid:false,reason:'Cue exceeds loaded source duration',target:Math.max(0,duration-.04),rate:0,policy};
  const elapsed=Math.max(0,t-f.shot.start)*rate,range=out-sourceIn,target=sourceIn+(policy==='loop'?elapsed%range:Math.min(elapsed,range-.034));return{valid:true,target:clamp(target,0,Math.max(0,duration-.034)),rate:policy==='hold'&&elapsed>=range?0:rate,policy,shot:f.shot.id,range:[sourceIn,out]};
 }
 function layoutEdit(state,slot,patch){const schema={x:[-3,3],y:[-2,2],z:[-2,2],scale:[.35,1.8],yaw:[-.7,.7]};if(!['A','B'].includes(slot))throw Error('Unknown layout slot');for(const [k,v]of Object.entries(patch))if(!schema[k]||!Number.isFinite(v)||v<schema[k][0]||v>schema[k][1])throw Error('Invalid arrangement control');Object.assign(state.cut.layout[slot],patch);}
 function beginPunch(state,id,start,end){HapaDirector.validateValue(id,null);if(!Number.isFinite(start)||!Number.isFinite(end)||start<0||end<=start||end>state.director.shots.at(-1).end)throw Error('Invalid punch range');if((state.director.punches||[]).length>=40)throw Error('Maximum 40 punch layers');checkpoint(state,'Punch '+id);const layer={id,start,end,points:[]};state.director.punches.push(layer);state.cut.punch=state.director.punches.length-1;state.director.recording=true;return layer;}
 function endPunch(state){state.director.recording=false;state.cut.punch=null;state.director.holds=Object.fromEntries(Object.entries(state.director.holds).filter(([id])=>state.director.controlModes?.[id]==='latch'));state.director.touches={};state.director.releases={};saveActive(state);}
 function validate(state,score){
  const shots=state.director?.shots;if(!Array.isArray(shots)||shots.length<1||shots.length>64)throw Error('Need 1–64 contiguous shots');let last=0;const ids=new Set();for(const s of shots){if(ids.has(s.id)||typeof s.id!=='string')throw Error('Duplicate/missing shot ID');ids.add(s.id);if(!Number.isFinite(s.start)||!Number.isFinite(s.end)||Math.abs(s.start-last)>.001||s.end<=s.start||!HapaDirector.rigs.includes(s.rig)||typeof s.label!=='string'||s.label.length>80)throw Error('Invalid shot coverage');if(!s.locks||!['shot','camera','look','media'].every(k=>typeof s.locks[k]==='boolean'))throw Error('Missing lock contract');validateCue(s.media);last=s.end;
   if(s.palette&&s.palette!=='inherit'&&!HapaCore.palettes.some(p=>p.id===s.palette))throw Error('Invalid shot palette');
   if(s.cameraPose){if(!Array.isArray(s.cameraPose.eye)||!Array.isArray(s.cameraPose.forward)||s.cameraPose.eye.length!==3||s.cameraPose.forward.length!==3||![...s.cameraPose.eye,...s.cameraPose.forward,s.cameraPose.fov].every(Number.isFinite)||s.cameraPose.fov<20||s.cameraPose.fov>100||Math.hypot(...s.cameraPose.forward)<.9)throw Error('Invalid frozen camera');}
  }if(Math.abs(last-score.duration)>.001)throw Error('Coverage differs from song duration');
  for(const p of state.director.punches||[]){HapaDirector.validateValue(p.id,null);if(!Number.isFinite(p.start)||!Number.isFinite(p.end)||p.start<0||p.end>score.duration||p.end<=p.start||!Array.isArray(p.points)||p.points.length>20000)throw Error('Invalid punch');let prev=-1;for(const pt of p.points){HapaDirector.validateValue(p.id,pt.value);if(!Number.isFinite(pt.time)||pt.time<p.start||pt.time>=p.end||pt.time<prev)throw Error('Invalid punch point');if(pt.duration!==undefined&&(!Number.isFinite(pt.duration)||pt.duration<0||pt.duration>.6))throw Error('Invalid punch release');if(pt.offset!==undefined&&(!Number.isFinite(pt.offset)||Math.abs(pt.offset)>1))throw Error('Invalid punch offset');prev=pt.time;}}
  if(state.cut){if(!Array.isArray(state.cut.takes)||state.cut.takes.length>12)throw Error('Invalid takes');const fake={cut:{layout:clone(state.cut.layout)}};for(const slot of ['A','B'])layoutEdit(fake,slot,state.cut.layout[slot]);}
  return true;
 }
 return{recipes,plan,init,frame,sourceTime,edit,lock,validateCue,validate,saveActive,select,fork,diff,checkpoint,undo,snapshot,layoutEdit,beginPunch,endPunch,clone,clamp,ease};
})();

HapaCore.worlds.push({id:'threshold-theatre',name:'Threshold Theatre',subtitle:'A listening room / images become architecture',kind:3,modules:['field.threshold-stage','media.surface','material.video-ribbon','optics.beacon'],camera:'constrained portal approach'});
HapaCore.palettes.push({id:'copper-nocturne',name:'Copper nocturne',description:'Ink, patinated copper, restrained gold',roles:{background:'#070e13',shadow:'#0f1b24',body:'#314c52',accent:'#74aaa6',highlight:'#ffe3b4',emission:'#d3a365',fog:'#15202a'}});
HapaCore.modules.push({id:'field.threshold-stage',version:'0.5.0',kind:'world',outputs:['linearColor','linearEmission','projectedDepth']},{id:'material.video-ribbon',version:'0.5.0',kind:'material',description:'SDR video sampled on real woven triangles; not volumetric reconstruction'});

