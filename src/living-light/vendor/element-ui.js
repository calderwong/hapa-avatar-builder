
/* One performance card. Recipe edits are undoable, never Auto fader/camera holds. */
'use strict';
(()=>{const prior=HapaReliquaryUI;window.HapaReliquaryUI=function(h){
 const base=prior(h),$=id=>document.getElementById(id),E=HapaElements,card=document.createElement('section');let tab='together',editing=false;
 card.id='elementDesk';card.className='range-desk elemental-desk';
 const names={life:'Element Life',shape:'Audio → Shape',contour:'Contour Carry',light:'Light / Halo',interaction:'Interaction Strength'};
 card.innerHTML=`<div class="section-label">ELEMENTAL PERFORMANCE <span class="reliq-pill">106 · 0.9.16</span></div>
 <p class="hint">Water with weight. Air with pressure. Fire with reach. Shape and light are independent instruments.</p>
 <div class="element-tabs" role="tablist" aria-label="Element controls">${['water','wind','fire','together'].map(el=>`<button role="tab" data-element="${el}" aria-selected="${el===tab}">${el[0].toUpperCase()+el.slice(1)}</button>`).join('')}</div>
 <div class="edit-grid"><button id="elementApply" class="primary">Apply 106 to this take</button><button id="elementExplore">Open hero scene ↗</button></div>
 <div id="elementControls">${Object.entries(names).map(([key,label])=>`<div id="elementRow-${key}"><label class="range-head" for="element-${key}">${label}<output id="elementV-${key}"></output></label><input id="element-${key}" type="range" min="0" max="1" step=".01" aria-label="${label}"></div>`).join('')}</div>
 <div class="edit-grid"><button id="elementBody" aria-pressed="false">Body-only</button><button id="elementRest" aria-pressed="false">Isolate resting life</button><button id="elementFreeze" aria-pressed="false">Freeze element</button><button id="elementBaseline" aria-pressed="false">105 comparison</button></div>
 <div class="edit-grid"><button id="elementExit">Exit inspection</button><button id="elementMotion">Movement / Character / Octave ↓</button></div>
 <p id="elementStatus" class="micro-status" aria-live="polite"></p>
 <p class="footnote">Together edits shared settings; element tabs save overrides. Motion Character and Motion Octave reuse Geometry Dance; Movement Breadth is the existing instrument. Inspection never alters your route or exported take.</p>
 <details id="elementAdvanced"><summary>Advanced · original Water / Wind / Fire Paints</summary><label class="range-head" for="elementCaustics">Water caustics · authored receiver pattern</label><input id="elementCaustics" type="range" min="0" max="1" step=".01" aria-label="Water caustics"><button id="elementRecipe" class="full">Export elemental recipe</button></details>`;
 $('perform').insertBefore(card,$('perform').firstChild);
 for(const id of ['waterDesk','windDesk','fireDesk'])if($(id))$('elementAdvanced').append($(id));
 function commit(){if(editing){HapaEditorial.saveActive(h.state());editing=false;h.changed();}}
 function change(key,value){
  const s=h.state(),c=structuredClone(E.config(s));
  if(tab==='together'||key==='caustics')c[key]=value;else c.overrides[tab][key]=value;
  E.validate(c);if(!editing){HapaEditorial.checkpoint(s,'Elemental '+tab+' / '+key);editing=true;}s.reliquary.elemental=c;h.mark();readout();
 }
 for(const key of Object.keys(names)){const node=$('element-'+key);node.oninput=()=>{try{change(key,Number(node.value));}catch(e){h.toast(e.message,true);}};node.onchange=commit;node.onblur=commit;node.addEventListener('pointercancel',commit);}
 $('elementCaustics').oninput=e=>change('caustics',Number(e.target.value));$('elementCaustics').onchange=commit;$('elementCaustics').onblur=commit;
 for(const button of card.querySelectorAll('[data-element]'))button.onclick=()=>{commit();tab=button.dataset.element;for(const b of card.querySelectorAll('[data-element]'))b.setAttribute('aria-selected',String(b===button));refresh();};
 $('elementApply').onclick=()=>{commit();try{E.apply(h.state());h.changed();h.toast('106 treatment applied. Undo restores the previous take.');}catch(e){h.toast(e.message,true);}};
 $('elementExplore').onclick=()=>{commit();h.renderer().elementInspect('off');const dest={water:['rain-court','water-moonstone'],wind:['confluence-court','confluence-dusk'],fire:['hearth-of-three','hearth-twilight'],together:['confluence-court','confluence-dusk']}[tab];HapaStudio.setWorld(dest[0]);HapaStudio.setPalette(dest[1]);};
 for(const [id,mode]of [['elementBody','body'],['elementRest','rest'],['elementFreeze','freeze'],['elementBaseline','baseline']])$(id).onclick=()=>{commit();h.renderer().elementInspect(mode,tab);h.mark();readout();};
 $('elementExit').onclick=()=>{h.renderer().elementInspect('off');h.mark();readout();};
 $('elementMotion').onclick=()=>$('geometryDanceDesk')?.scrollIntoView({behavior:'smooth',block:'start'});
 $('elementRecipe').onclick=()=>{commit();const a=document.createElement('a'),url=URL.createObjectURL(new Blob([JSON.stringify({schema:'hapa.elemental.recipe/1',config:E.config(h.state())},null,2)],{type:'application/json'}));a.href=url;a.download='hapa-elemental-106.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),15000);};
 function readout(){const s=h.state(),c=tab==='together'?E.config(s):E.settings(s,tab),pr=s._elementInspect;for(const key of Object.keys(names))$('elementV-'+key).textContent=Math.round(c[key]*100)+'%';
  for(const [id,key]of [['elementBody','body'],['elementRest','rest'],['elementFreeze','freeze'],['elementBaseline','baseline']])$(id).setAttribute('aria-pressed',String(!!pr?.[key]));
  $('elementStatus').textContent=(E.config(s).enabled?'106 treatment enabled':'105 behavior · apply the treatment explicitly')+(pr?' · fixed-camera inspection'+(pr.freeze?' · frozen':'')+(pr.baseline?' · animated 105 comparison':''):' · normal itinerary');
 }
 function refresh(){base.refresh();const c=tab==='together'?E.config(h.state()):E.settings(h.state(),tab);if(!editing){for(const key of Object.keys(names))$('element-'+key).value=c[key];$('elementCaustics').value=c.caustics;}$('elementRow-interaction').hidden=tab!=='together';readout();}
 function tick(t){base.tick(t);if($('perform').classList.contains('active'))readout();}
 refresh();return{refresh,tick,dispose(){commit();base.dispose();card.remove();}};
};})();

