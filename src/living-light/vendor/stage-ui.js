
/* Native Perform card. Source-time stage settings are recipe edits, not camera holds. */
'use strict';
(()=>{const prior=HapaReliquaryUI;window.HapaReliquaryUI=function(h){
 const base=prior(h),S=HapaStages,$=id=>document.getElementById(id),card=document.createElement('section');let editing=false;
 card.id='stageDesk';card.className='range-desk stage-desk';
 const names={dance:'Stage Dance',texture:'Stage Texture',atmosphere:'Atmosphere',echo:'Stage Echo',life:'Resting Life'};
 card.innerHTML=`<div class="section-label">DANCING STAGES <span class="reliq-pill">107 · 0.9.17</span></div>
 <p class="hint">The room joins the performance. Rooted architecture, suspended fabric and carved surfaces move in counterpoint—not just brighter light.</p>
 <div class="edit-grid"><select id="stageWorld" aria-label="Stage to visit">${S.worlds.filter(w=>w.id!=='halo-vault').map(w=>`<option value="${w.id}">${w.name}</option>`).join('')}</select><button id="stageVisit" class="primary">Open stage ↗</button></div>
 <p id="stageSignature" class="micro-status"></p>
 <div class="edit-grid"><button id="stageApply">Apply 107 to this take</button><label class="switchrow"><input id="stageEnabled" type="checkbox">107 stage treatment</label></div>
 <label class="range-head" for="stageScope">Edit scope</label><select id="stageScope"><option value="shared">Shared stage settings</option><option value="world">Selected stage only</option></select>
 ${Object.entries(names).map(([key,label])=>`<label class="range-head" for="stage-${key}">${label}<output id="stageV-${key}"></output></label><input id="stage-${key}" type="range" min="0" max="1" step=".01" aria-label="${label}">`).join('')}
 <label class="range-head" for="stageFocus">Background Focus</label><select id="stageFocus"><option value="minimal">Minimal · main forms</option><option value="balanced">Balanced · forms + inlays</option><option value="rich">Rich · stronger material presence</option></select>
 <div class="edit-grid"><button id="stageBody" aria-pressed="false">Shape proof</button><button id="stageLayer" aria-pressed="false">Stage layer only</button><button id="stageRest" aria-pressed="false">Isolate resting life</button><button id="stageFreeze" aria-pressed="false">Freeze stage</button><button id="stageBaseline" aria-pressed="false">106 comparison</button><button id="stageExit">Exit inspection</button></div>
 <p id="stageStatus" class="micro-status" aria-live="polite"></p>
 <details><summary>About the stage instrument</summary><p class="footnote">Bass moves rooted mass; voice and harmonics steer scrims and shutters; plucked sources add local articulation; measured onsets travel and settle. Resting life is authored, not detected rhythm. Shape proof isolates the new 107 geometry under fixed light. Stage layer only excludes the inherited stage and all performers. Freeze holds only the 107 layer/material time. The 106 comparison restores the animated previous treatment. These are transient views, not edits to your itinerary.</p><div class="edit-grid"><button id="stageClearOverride">Clear selected override</button><button id="stageRecipe">Export stage recipe</button></div></details>`;
 $('perform').insertBefore(card,$('perform').firstChild);
 function selected(){return $('stageWorld').value;}
 function cfg(){const c=S.config(h.state());return $('stageScope').value==='world'?{...c,...c.overrides[selected()]}:c;}
 function commit(){if(editing){HapaEditorial.saveActive(h.state());editing=false;h.changed();}}
 function change(key,value){const s=h.state(),c=structuredClone(S.config(s));if($('stageScope').value==='world'&&key!=='enabled'){c.overrides[selected()]={...c.overrides[selected()],[key]:value};}else c[key]=value;
  S.validate(c);if(!editing){HapaEditorial.checkpoint(s,'Dancing Stages / '+key);editing=true;}s.reliquary.stages=c;h.mark();readout();}
 for(const key of S.keys){const node=$('stage-'+key);node.oninput=()=>{try{change(key,Number(node.value));}catch(e){h.toast(e.message,true);}};node.onchange=commit;node.onblur=commit;node.addEventListener('pointercancel',commit);}
 $('stageEnabled').onchange=e=>{change('enabled',e.target.checked);commit();};$('stageFocus').onchange=e=>{change('focus',e.target.value);commit();};
 $('stageWorld').onchange=()=>{commit();refresh();};$('stageScope').onchange=()=>{commit();refresh();};
 $('stageVisit').onclick=()=>{commit();h.renderer().stageInspect('off');h.renderer().elementInspect('off');const w=S.worlds.find(w=>w.id===selected());HapaStudio.setWorld(w.id);HapaStudio.setPalette(w.palette);h.toast('Visiting '+w.name+'. The saved route is not rewritten.');};
 $('stageApply').onclick=()=>{commit();S.apply(h.state());h.changed();h.toast('107 stage treatment applied. Undo restores the previous take.');};
 for(const [id,mode]of [['stageBody','body'],['stageLayer','layer'],['stageRest','rest'],['stageFreeze','freeze'],['stageBaseline','baseline']])$(id).onclick=()=>{commit();try{h.renderer().stageInspect(mode,selected());h.mark();readout();}catch(e){h.toast(e.message,true);}};
 $('stageExit').onclick=()=>{h.renderer().stageInspect('off');h.mark();readout();};
 $('stageClearOverride').onclick=()=>{commit();S.patch(h.state(),{overrides:{[selected()]:null}});h.changed();};
 $('stageRecipe').onclick=()=>{commit();const a=document.createElement('a'),url=URL.createObjectURL(new Blob([JSON.stringify({schema:'hapa.stage.recipe/1',config:S.config(h.state())},null,2)],{type:'application/json'}));a.href=url;a.download='hapa-stages-107.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),15000);};
 function readout(){const c=cfg(),s=h.state(),pr=s._stageInspect;for(const key of S.keys)$('stageV-'+key).textContent=Math.round(c[key]*100)+'%';$('stageSignature').textContent=S.worlds.find(w=>w.id===selected()).signature;
  for(const [id,key]of [['stageBody','body'],['stageLayer','layer'],['stageRest','rest'],['stageFreeze','freeze'],['stageBaseline','baseline']])$(id).setAttribute('aria-pressed',String(!!pr?.[key]));
  $('stageStatus').textContent=(S.config(s).enabled?'107 treatment enabled':'106 retained · apply explicitly')+(pr?' · fixed-camera inspection'+(pr.body?' · constant-light geometry':'')+(pr.freeze?' · stage frozen':'')+(pr.baseline?' · animated 106':''):S.eligible(s)?' · '+(S.world(s)?.name||'stage'):' · awaiting a feature stage; tunnels protected')+(s.reduced?' · Reduced Motion freezes new stage movement':'');
 }
 function refresh(){base.refresh();const c=cfg();if(!editing){for(const k of S.keys)$('stage-'+k).value=c[k];$('stageEnabled').checked=S.config(h.state()).enabled;$('stageFocus').value=c.focus;}readout();}
 function tick(t){base.tick(t);if($('perform').classList.contains('active'))readout();}
 refresh();return{refresh,tick,dispose(){commit();base.dispose();card.remove();}};
};})();

