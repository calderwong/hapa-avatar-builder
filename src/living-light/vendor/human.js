
/* Touch-through control ownership. The score never stops. Explicit mode and transient
 * interaction are independent. Events use the host's song clock; no animation clock. */
'use strict';
window.HapaHuman=function({director,values,write,playing,relative=()=>false,underlying=values,changed=()=>{}}){
 const owners=new Map(),starts=new Map(),D=HapaDirector;
 const valid=id=>D.validateValue(id,null);
 const mode=id=>director().controlModes?.[id]||'auto';
 function begin(id,token){valid(id);owners.set(id,token);starts.set(id,values()[id]);director().touches[id]=token;changed();}
 function update(id,value,token,first=false){valid(id);if(owners.get(id)!==token)return false;if(relative()&&mode(id)==='auto')value=D.clamp(underlying()[id]+value-(starts.get(id)??value));write(id,value,{begin:first});changed();return true;}
 function end(id,token,reason='release'){
  if(owners.get(id)!==token)return false;
  owners.delete(id);starts.delete(id);delete director().touches[id];
  if(mode(id)==='auto')write(id,null,{duration:playing()?director().releaseDuration:0,reason});
  changed();return true;
 }
 function endAll(reason='focus-loss'){for(const [id,token]of [...owners])end(id,token,reason);}
 function setMode(id,m){valid(id);if(!['auto','latch'].includes(m))throw Error('Mode must be auto or latch');const d=director();d.controlModes[id]=m;
  if(m==='auto'){owners.delete(id);delete d.touches[id];write(id,null,{duration:playing()?d.releaseDuration:0});}
  else if(!Number.isFinite(d.holds[id]))write(id,values()[id],{});
  changed();return m;
 }
 function releaseAll(){endAll('release-all');D.defs.forEach(p=>setMode(p.id,'auto'));}
 function setReturnDuration(seconds){if(!Number.isFinite(seconds)||seconds<0||seconds>.6)throw Error('Return must be 0–0.6 song seconds');director().releaseDuration=seconds;changed();}
 return{begin,update,end,endAll,setMode,mode,releaseAll,setReturnDuration,active:()=>Object.fromEntries(owners),owns:(id,token)=>owners.get(id)===token};
};
/* DOM binder. Native range keyboard semantics, pointer capture, cancellation and
 * focus loss are handled without converting an Auto control into a latched one. */
window.HapaHumanUI=function(human,{values,slider,pad}){
 const cleanups=[],pointers=new Map(),keysets=new Map(),keys=['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End','PageUp','PageDown'];
 const on=(el,ev,fn,opt)=>{el.addEventListener(ev,fn,opt);cleanups.push(()=>el.removeEventListener(ev,fn,opt));};
 function finishPointer(pid,reason){const obj=pointers.get(pid);if(!obj)return;pointers.delete(pid);for(const id of obj.ids)human.end(id,obj.token,reason);}
 function finishKeys(el,reason){const k=keysets.get(el);if(!k)return;keysets.delete(el);for(const id of k.ids)human.end(id,k.token,reason);}
 function bind(el,ids,isPad){
  const fromPad=e=>{const r=el.getBoundingClientRect();return{density:Math.max(0,Math.min(1,(e.clientX-r.left)/r.width)),intimacy:Math.max(0,Math.min(1,1-(e.clientY-r.top)/r.height))};};
  on(el,'pointerdown',e=>{if(e.button!==0||pointers.has(e.pointerId))return;
   const token='pointer:'+e.pointerId;const obj={token,ids,el};pointers.set(e.pointerId,obj);for(const id of ids)human.begin(id,token);
   try{el.setPointerCapture(e.pointerId);}catch(_){}
   const v=isPad?fromPad(e):{[ids[0]]:+el.value};for(const id of ids)human.update(id,v[id],token,true);
   if(isPad)e.preventDefault();
  });
  on(el,'pointermove',e=>{const obj=pointers.get(e.pointerId);if(!isPad||obj?.el!==el)return;const v=fromPad(e);for(const id of ids)human.update(id,v[id],obj.token);});
  on(el,'lostpointercapture',e=>finishPointer(e.pointerId,'capture-lost'));
  on(el,'blur',()=>{for(const [pid,obj]of [...pointers])if(obj.el===el)finishPointer(pid,'blur');finishKeys(el,'blur');});
  if(!isPad)on(el,'input',()=>{
   const p=[...pointers.values()].find(p=>p.el===el),k=keysets.get(el),owner=p||k;
   if(owner)human.update(ids[0],+el.value,owner.token);
   else{const token='accessible:'+ids[0];human.begin(ids[0],token);human.update(ids[0],+el.value,token,true);queueMicrotask(()=>human.end(ids[0],token,'accessible-input'));}
  });
  on(el,'keydown',e=>{if(!keys.includes(e.key))return;let k=keysets.get(el);if(!k){k={token:'keys:'+ids.join('/'),ids,keys:new Set()};keysets.set(el,k);for(const id of ids){human.begin(id,k.token);human.update(id,values()[id],k.token,true);}}k.keys.add(e.key);
   if(isPad){e.preventDefault();const v=values(),id=['ArrowLeft','ArrowRight','Home','End'].includes(e.key)?'density':'intimacy';let value=v[id]+(['ArrowRight','ArrowUp','PageUp'].includes(e.key)?.025:-.025);if(e.key==='Home')value=0;if(e.key==='End')value=1;human.update(id,Math.max(0,Math.min(1,value)),k.token);}
  });
  on(el,'keyup',e=>{const k=keysets.get(el);if(k){k.keys.delete(e.key);if(!k.keys.size)finishKeys(el,'key-up');}});
 }
 HapaDirector.defs.forEach(p=>bind(slider(p.id),[p.id],false));bind(pad,['density','intimacy'],true);
 on(window,'pointerup',e=>finishPointer(e.pointerId,'pointer-up'),true);on(window,'pointercancel',e=>finishPointer(e.pointerId,'pointer-cancel'),true);
 function suspend(reason){for(const pid of [...pointers.keys()])finishPointer(pid,reason);for(const el of [...keysets.keys()])finishKeys(el,reason);human.endAll(reason);}
 on(window,'blur',()=>suspend('window-blur'));on(document,'visibilitychange',()=>{if(document.hidden)suspend('hidden');});
 return{suspend,dispose(){suspend('dispose');cleanups.forEach(fn=>fn());}};
};

