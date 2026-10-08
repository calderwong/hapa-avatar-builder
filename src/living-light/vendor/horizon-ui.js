
/* Host-side finite gestures + lifecycle ownership. No clocks inside visuals.
 * Keyboard/pointer clients share the exact start/end implementation. */
'use strict';
window.HapaHorizonUI=function(h){
 const $=id=>document.getElementById(id),H=HapaHorizons;let counter=0;const held=new Map(),clean=[];
 const on=(el,k,fn,opts)=>{el.addEventListener(k,fn,opts);clean.push(()=>el.removeEventListener(k,fn,opts));};
 const labels={wave:'Send a wave',open:'Open the crown',spotlight:'Spotlight',charge:'Charge arrival',gather:'Gather → Release',shock:'Pressure wave',discharge:'Send discharge'};
 $('gestureHost').innerHTML=`<div class="section-label">GESTURE DECK <span class="muted">1 · 2 · 3 · 4 · 5 · 6 · 7</span></div><div class="gesture-grid">${H.kinds.map((k,i)=>`<button class="gesture-pad" id="gesture-${k}" data-gesture="${k}"><span>${['◉','⟷','◇','◌','↗','◎','↯'][i]}</span><b>${labels[k]}</b><small>${i===0||k==='shock'||k==='discharge'?'Tap · finite pulse':k==='gather'?'Hold to gather · let go to open':'Hold · release to Auto'}</small></button>`).join('')}</div><label class="gesture-strength">Strength <input id="gestureStrength" type="range" min="0" max="1" step=".01" value=".72"><output id="gestureStrengthValue">.72</output></label><div class="switchrow"><label><input id="gestureAlign" type="checkbox"> Wave: nearby onset ≤160ms</label><label><input id="nudgeMode" type="checkbox"> Relative nudge</label></div><div id="gestureStatus" class="micro-status">Tap or hold. Gestures never move an arrival.</div><div id="nextArrival" class="micro-status"></div>`;
 function begin(kind,token='agent'){if(!H.kinds.includes(kind))throw Error('Unknown gesture');const st=h.state();if(held.has(kind))end(kind,held.get(kind).token,'replaced');
  if(st.director.shots[HapaDirector.shotAt(st.director.shots,h.time()).index]?.locks?.look&&kind==='charge'){h.toast('This look is protected; optics remain constrained.');}
  const aligned=H.alignTime(h.score(),h.time(),kind==='wave'&&st.horizons.align),duration=kind==='discharge'?3:kind==='shock'?8:kind==='wave'?3.5:12;
  const all=[...(st.director.gestures||[]),...(st._gestureLive||[])];if(kind==='discharge'&&all.some(e=>e.kind==='discharge'&&Math.abs(e.time-h.time())<.85)){h.toast('Let the electrical stroke open before sending another.');return null;}let id;do{id='gesture-'+(++counter);}while(all.some(e=>e.id===id));
  const e={id,kind,time:aligned.time,end:Math.min(h.score().duration,aligned.time+duration),strength:st.horizons.strength,origin:st.director.recording?'recorded':'human-live',basis:aligned.basis};
  if(st.director.recording){HapaEditorial.checkpoint(st,'Record '+kind);st.director.gestures.push(e);}else{st._gestureLive=(st._gestureLive||[]).filter(x=>x.end+(x.kind==='gather'&&x.released?24:.25)>=h.time());st._gestureLive.push(e);}
  if(kind!=='wave'&&kind!=='shock'&&kind!=='discharge')held.set(kind,{token,event:e});h.mark();return {...e};
 }
 function end(kind,token='agent',reason='release'){const o=held.get(kind);if(!o||o.token!==token)return false;held.delete(kind);o.event.end=Math.max(o.event.time,Math.min(o.event.end,h.time()));o.event.releaseDuration=h.playing()?.25:0;if(kind==='gather')o.event.released=h.playing()&&!['seek','song change','focus loss','hidden','blur','dispose'].includes(reason);if(reason==='seek'||reason==='song change'){h.state()._gestureLive=[];}HapaEditorial.saveActive(h.state());h.mark();return true;}
 function release(reason='release'){for(const [k,o]of [...held])end(k,o.token,reason);}
 const pointers=new Map(),keys=new Map();
 for(const k of H.kinds){const el=$('gesture-'+k);on(el,'pointerdown',e=>{if(e.button!==0)return;e.preventDefault();const token='pad:'+e.pointerId;pointers.set(e.pointerId,{k,token});try{el.setPointerCapture(e.pointerId);}catch(_){}begin(k,token);});on(el,'lostpointercapture',e=>finish(e.pointerId));
  on(el,'keydown',e=>{if([' ','Enter'].includes(e.key)){e.preventDefault();if(!e.repeat)begin(k,'button:'+k);}});on(el,'keyup',e=>{if([' ','Enter'].includes(e.key)){e.preventDefault();end(k,'button:'+k);}});on(el,'blur',()=>{const o=held.get(k);if(o)end(k,o.token,'blur');});
 }
 function finish(pid){const p=pointers.get(pid);if(p){end(p.k,p.token);pointers.delete(pid);}}
 on(window,'pointerup',e=>finish(e.pointerId),true);on(window,'pointercancel',e=>finish(e.pointerId),true);on(window,'blur',()=>{release('focus loss');keys.clear();pointers.clear();});on(document,'visibilitychange',()=>{if(document.hidden)release('hidden');});
 on(document,'keydown',e=>{if(['INPUT','TEXTAREA','SELECT','BUTTON'].includes(e.target.tagName)||e.ctrlKey||e.metaKey||e.altKey)return;const i=['1','2','3','4','5','6','7'].indexOf(e.key);if(i>=0&&!e.repeat){e.preventDefault();const k=H.kinds[i];keys.set(e.key,k);begin(k,'key:'+e.key);}});
 on(document,'keyup',e=>{const k=keys.get(e.key);if(k){end(k,'key:'+e.key);keys.delete(e.key);}});
 function config(patch){const s=h.state(),next={...s.horizons,...patch};H.validateConfig(next);HapaEditorial.checkpoint(s,'Change Horizons look');s.horizons=next;HapaEditorial.saveActive(s);h.mark();refresh();return structuredClone(next);}
 on($('gestureStrength'),'input',e=>{h.state().horizons.strength=+e.target.value;h.mark();});on($('gestureAlign'),'change',e=>config({align:e.target.checked}));on($('nudgeMode'),'change',e=>config({nudge:e.target.checked}));
 for(const [id,key]of [['horizonReflection','reflections'],['patternFilter','filter'],['attentionBudget','attention'],['sourceTrim','sourceTrim']])on($(id),'change',e=>config({[key]:e.target.checked}));
 for(const slot of ['A','B'])for(const axis of [0,1])on($('focal'+slot+axis),'input',e=>{const focal=structuredClone(h.state().horizons.focal);focal[slot][axis]=+e.target.value;config({focal});});
 function refresh(){const v=h.state().horizons;for(const [id,key]of [['horizonReflection','reflections'],['patternFilter','filter'],['attentionBudget','attention'],['sourceTrim','sourceTrim'],['nudgeMode','nudge'],['gestureAlign','align']])$(id).checked=v[key];$('gestureStrength').value=v.strength;for(const slot of ['A','B'])for(const axis of [0,1])$('focal'+slot+axis).value=v.focal[slot][axis];}
 function tick(t){const s=h.state(),a=H.evaluate(s,t);for(const [k,o]of [...held])if(t>o.event.end+.25)held.delete(k);for(const k of H.kinds)$('gesture-'+k).classList.toggle('pressed',held.has(k));$('gestureStrengthValue').textContent=s.horizons.strength.toFixed(2);
  const trace=HapaDirector.evaluate(h.score(),h.cache(),s,t),v=trace.features;const policy=s.horizons.attention?'Selective attention':'Dense response';
  $('gestureStatus').textContent=a.active.length?a.active.map(e=>labels[e.kind]+' '+Math.round(e.amount*100)+'%').join(' · '):`${policy} · ${trace.subject}. ${s.director.recording?'Deck events are recording.':'Record to save interventions.'}`;
  const p=HapaPassages.at(s,t),next=p.active?p.bridge:p.next;const label=next?HapaCore.worlds.find(w=>w.id===next.to)?.name:'';
  $('nextArrival').textContent=next?`${p.active?p.stage.toUpperCase():'NEXT'} → ${label} · ${Math.max(0,next.arrival-t).toFixed(1)}s to arrival`:'Inhabiting the destination · no pending transition';
 }
 function clear(){release('clear');const s=h.state();HapaEditorial.checkpoint(s,'Clear gesture deck');s.director.gestures=[];s._gestureLive=[];HapaEditorial.saveActive(s);h.mark();}
 refresh();return {begin,end,release,refresh,tick,config,clear,active:()=>Object.fromEntries([...held].map(([k,v])=>[k,v.token])),read:()=>({settings:structuredClone(h.state().horizons),events:structuredClone(h.state().director.gestures),live:structuredClone(h.state()._gestureLive||[])}),dispose:()=>{release('dispose');clean.forEach(f=>f());}};

};

