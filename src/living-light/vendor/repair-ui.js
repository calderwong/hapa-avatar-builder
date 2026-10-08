
/* 0.8.2 recovery desk. Saved RANGE settings live at the top of Perform;
 * the existing six Auto/Latch faders retain temporary ownership semantics. */
'use strict';
(()=>{
 const previous=HapaReliquaryUI;
 window.HapaReliquaryUI=function(h){
  const base=previous(h),$=id=>document.getElementById(id),perform=$('perform');
  const card=document.createElement('section');card.id='rangeDesk';card.className='range-desk';
  card.innerHTML=`<div class="section-label">MOTION CHARACTER <span class="reliq-pill">SAVED RANGE</span></div>
   <label class="range-head" for="motionBreadth">Movement Breadth <output id="breadthCeiling">1×–5×</output></label>
   <input id="motionBreadth" type="range" min="0" max="1" step=".01" aria-label="Movement Breadth" title="Keep the current floor; expand the peak movement ceiling">
   <label class="range-head" for="cameraSurgeMain">Camera Surge <output id="surgeCeiling"></output></label>
   <input id="cameraSurgeMain" type="range" min="0" max="1" step=".01" aria-label="Camera Surge" title="Smoothly integrated camera velocity at musical peaks">
   <div class="range-meter"><i id="breadthActualBar"></i></div><div id="breadthActual" class="range-live">Preparing musical range…</div>
   <div class="edit-grid"><button id="openMotionCharacter">Motion details ↗</button><button id="openOctave">Octave regions ↗</button></div>
   <p class="footnote">Range settings persist. Perform live with the Auto faders below; release still returns to the moving score.</p>
   <button id="restoreFractal" class="full primary">Restore original fractal-first tunnels</button>
   <div id="mainRouteMix" class="range-live"></div>`;
  perform.insertBefore(card,perform.firstChild);
  let editing=null;
  function begin(key){if(editing===key)return;commit();HapaEditorial.checkpoint(h.state(),'Range '+key);editing=key;}
  function commit(){if(editing!==null){HapaEditorial.saveActive(h.state());editing=null;h.changed();}}
  for(const [id,key]of [['motionBreadth','breadthAmount'],['cameraSurgeMain','cameraSurge']]){
   const el=$(id);
   el.oninput=()=>{const value=Number(el.value),next={...h.state().reliquary,[key]:value};
    try{HapaReliquary.validateConfig(next);begin(key);h.state().reliquary=next;h.mark();readouts();}catch(e){h.toast(e.message,true);refresh();}};
   el.onchange=commit;el.onblur=commit;el.addEventListener('pointercancel',commit);
  }
  function openDetails(regional){commit();document.querySelector('[data-tab="reliquary"]').click();
   const target=regional?document.querySelector('.octave-section'):$('artBreadth')?.closest('.edit-grid');
   if(target){const parent=$('reliquary');parent.scrollTop=target.offsetTop-parent.offsetTop-12;target.classList.add('reveal-focus');setTimeout(()=>target.classList.remove('reveal-focus'),1500);}}
  $('openMotionCharacter').onclick=()=>openDetails(false);$('openOctave').onclick=()=>openDetails(true);
  $('restoreFractal').onclick=()=>{try{window.HapaStudio.passages.setMix('fractal-first');h.toast('Original fractal tunnel restored as the main route. Timing and other tunnel designs retained.');}catch(e){h.toast(e.message,true);}};
  const diag=document.createElement('button');diag.textContent='Save rendering diagnostics';diag.className='full';diag.id='saveRenderDiagnostics';$('inspect').append(diag);
  diag.onclick=()=>{try{const data=window.HapaStudio.diagnostics();const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='Hapa_Octave_082_Diagnostics.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);}catch(e){h.toast(e.message,true);}};
  function readouts(){const c=h.state().reliquary;$('breadthCeiling').textContent='1×–'+(1+4*c.breadthAmount).toFixed(1)+'×';$('surgeCeiling').textContent=Math.round(c.cameraSurge*100)+'%';}
  function refresh(){base.refresh();const c=h.state().reliquary;if(!editing){$('motionBreadth').value=c.breadthAmount;$('cameraSurgeMain').value=c.cameraSurge;}readouts();
   const p=h.state().passages,cov=HapaPassages.coverage(p,h.cache().score.duration);$('mainRouteMix').textContent=`${Math.round(cov.fractalSeconds/Math.max(.001,cov.passageSeconds)*100)}% original fractal · ${cov.count} journeys · saved arrival times`;}
  function tick(t){base.tick(t);if(!card.isConnected)return;const art=HapaReliquary.evaluate(h.cache(),h.state(),t),cam=h.renderer().lastFrame?.cam?.instrument;
   $('breadthActualBar').style.width=Math.max(0,Math.min(100,(art.movementScale-1)/4*100))+'%';
   $('breadthActual').textContent=`Now ${art.movementScale.toFixed(2)}× movement · ${cam?'camera '+cam.phaseRate.toFixed(3)+' rad/song-s':h.renderer().inRoute?'scheduled passage camera':'stationary/protected view'}`;
  }
  refresh();return{refresh,tick,dispose(){base.dispose();card.remove();diag.remove();}};
 };
})();

