
/* Visible saved surface controls. Existing six live faders retain Auto/Latch ownership. */
'use strict';
(()=>{
 const prior=HapaReliquaryUI;
 window.HapaReliquaryUI=function(h){
  const base=prior(h),$=id=>document.getElementById(id),card=document.createElement('section');card.className='range-desk loom-desk';card.id='loomDesk';
  card.innerHTML=`<div class="section-label">GOLDEN LOOM <span class="reliq-pill">MAIN FRACTAL TUNNEL</span></div>
   <p class="hint">The original geometry. Light that travels through its weave.</p>
   <label class="range-head" for="loomMode">Surface recipe <span class="muted">saved with take</span></label><select class="full" id="loomMode"></select>
   <label class="range-head" for="loomAmount">New detail <output id="lv-amount"></output></label><input id="loomAmount" type="range" min="0" max="1" step=".01" aria-label="Golden Loom new detail">
   <div class="edit-grid"><button id="loomRehearse" class="primary">Rehearse fractal ↝</button><button id="loomOriginal">Compare original</button></div>
   <details id="loomDetails"><summary>Line, flow and pulse controls</summary>
   <label class="range-head" for="loomClarity">Line clarity <output id="lv-clarity"></output></label><input id="loomClarity" type="range" min="0" max="1" step=".01" aria-label="Golden Loom line clarity">
   <label class="range-head" for="loomPulses">Traveling pulses <output id="lv-pulses"></output></label><input id="loomPulses" type="range" min="0" max="1" step=".01" aria-label="Golden Loom traveling pulses">
   <label class="range-head" for="loomCurrent">Current travel <output id="lv-current"></output></label><input id="loomCurrent" type="range" min="0" max="1" step=".01" aria-label="Golden Loom current travel">
   <label class="range-head" for="loomContrast">Shadow separation <output id="lv-contrast"></output></label><input id="loomContrast" type="range" min="0" max="1" step=".01" aria-label="Golden Loom shadow separation">
   <label class="switchrow"><input id="loomRibbons" type="checkbox"> Carry the material onto Golden Loom ribbons</label>
   <p class="footnote">Saved surface settings. Use Motion/Radiance below for momentary gestures. Changes never move an arrival or replace the fractal walls.</p></details>
   <div id="loomTrace" class="range-live"></div>`;
  const perform=$('perform');perform.insertBefore(card,perform.firstChild);
  for(const m of HapaLoom.modes)$('loomMode').add(new Option(m.name,m.id));
  let editing=null,compareMode='filigree';
  function commit(){if(editing){HapaEditorial.saveActive(h.state());editing=null;h.changed();}}
  function patch(p){commit();try{HapaLoom.configure(h.state(),p);h.changed();}catch(e){h.toast(e.message,true);refresh();}}
  const controls=[['loomAmount','amount'],['loomClarity','clarity'],['loomPulses','pulses'],['loomCurrent','current'],['loomContrast','contrast']];
  for(const [id,key]of controls){const el=$(id);el.oninput=()=>{const c={...h.state().reliquary.loom,[key]:+el.value};try{HapaLoom.validate(c);if(editing!==key){commit();HapaEditorial.checkpoint(h.state(),'Loom '+key);editing=key;}h.state().reliquary.loom=c;h.mark();readouts();}catch(e){h.toast(e.message,true);}};el.onchange=commit;el.onblur=commit;el.addEventListener('pointercancel',commit);}
  $('loomMode').onchange=e=>patch({mode:e.target.value});$('loomRibbons').onchange=e=>patch({ribbons:e.target.checked});
  $('loomRehearse').onclick=async()=>{commit();try{await window.HapaStudio.loom.rehearse();}catch(e){h.toast(e.message,true);}};
  $('loomOriginal').onclick=()=>{const mode=h.state().reliquary.loom.mode;if(mode!=='original')compareMode=mode;patch({mode:mode==='original'?compareMode:'original'});};
  function readouts(){const c=h.state().reliquary.loom;for(const [,key]of controls)$('lv-'+key).textContent=Math.round(c[key]*100)+'%';$('loomOriginal').textContent=c.mode==='original'?'Return to enhanced':'Compare original';}
  function refresh(){base.refresh();const c=h.state().reliquary.loom;if(!editing){for(const [id,key]of controls)$(id).value=c[key];}$('loomMode').value=c.mode;$('loomRibbons').checked=c.ribbons;readouts();}
  function tick(t){base.tick(t);const frame=h.renderer().lastFrame,q=frame?.loom;
   $('loomTrace').textContent=q?.active?`Active on fractal surface · ${q.pulseCount} measured wave${q.pulseCount===1?'':'s'}\nVoice ${q.voice.toFixed(2)} · filigree ${q.lace.toFixed(2)} · bass ${q.bass.toFixed(2)}`:q?.reason==='original surface'?'Original 0.8.2 appearance · geometry and travel unchanged':'Ready for the next Golden Loom view · other locations retained';
  }
  refresh();return{refresh,tick,dispose(){commit();base.dispose();card.remove();}};
 };
})();

