
/* Visible arrangement card, existing Gesture Deck ownership. No extra clock/player. */
'use strict';
(()=>{const prior=HapaReliquaryUI;window.HapaReliquaryUI=function(h){
 const base=prior(h),$=id=>document.getElementById(id),card=document.createElement('section');card.className='range-desk currents-desk';card.id='currentsDesk';
 card.innerHTML=`<div class="section-label">CHOREOGRAPHED CURRENTS <span class="reliq-pill">0.8.7</span></div>
 <p class="hint">Gather a phrase. Carry its light. Open into the next world.</p>
 <div class="edit-grid"><button id="currentsOn" class="primary">Choreography on</button><button id="currentsOff">Compare 0.8.5 feel</button></div>
 <label class="range-head" for="phraseContrast">Phrase Contrast <output id="phraseContrastValue"></output></label><input type="range" id="phraseContrast" aria-label="Phrase Contrast" min="0" max="1" step=".01">
 <div class="current-state"><b id="phraseState">Flowing</b><span id="phraseMotion"></span></div><div class="current-bars"><i id="gatherBar"></i><i id="openBar"></i><i id="settleBar"></i></div>
 <div id="carryReadout" class="range-live"></div><div id="journeyReadout" class="range-live"></div>
 <div class="edit-grid"><button id="playPhrase">Play next release ↗</button><button id="currentGestureJump">Gather / Release pad ↘</button></div>
 <details id="currentOptions"><summary>Choreography layers & quality experiment</summary><div class="switchrow current-options">
 <label><input type="checkbox" id="chJourney"> Musical journey pace</label><label><input type="checkbox" id="chCarry"> Cross-world gesture</label><label><input type="checkbox" id="chHeroes"> Arrival / destination arcs</label><label><input type="checkbox" id="chLens"> Phrase-led focus</label><label><input type="checkbox" id="chCloth"> Gather / release cloth</label><label><input type="checkbox" id="chRealms"> Organ / alignment / cloud aperture</label><label><input type="checkbox" id="chHalf"> Half-resolution volume experiment</label></div>
 <p class="footnote">Full-resolution volume is the default. Half-resolution uses depth-aware reconstruction and is an experiment, not an M3 benchmark. Opaque geometry and thin circuitry remain at output resolution.</p>
 <p class="footnote">Phrase Contrast allocates the existing 1×–5× movement ceiling; it does not infer lyrics or emotions. Musical travel is preplanned within each saved interval. Live Gather / Release shapes visuals without moving the camera's scheduled path.</p></details>
 <p class="footnote">Saved arrangement. Perform below with Auto faders, or hold pad 5 and release. Your good route timings remain intact.</p>`;
 $('perform').insertBefore(card,$('perform').firstChild);let editing=false;
 const switches={chJourney:'journeys',chCarry:'carry',chHeroes:'heroes',chLens:'lens',chCloth:'cloth',chRealms:'realmActions',chHalf:'halfVolume'};
 function commit(){if(editing){HapaEditorial.saveActive(h.state());editing=false;h.changed();}}
 function apply(p){commit();try{HapaCurrents.configure(h.state(),p);h.changed();}catch(e){h.toast(e.message,true);refresh();}}
 $('currentsOn').onclick=()=>apply({enabled:true});$('currentsOff').onclick=()=>apply({enabled:false});
 for(const [id,key]of Object.entries(switches))$(id).onchange=e=>apply({[key]:e.target.checked});
 const slider=$('phraseContrast');slider.oninput=()=>{const c={...HapaCurrents.config(h.state()),contrast:+slider.value};HapaCurrents.validate(c);if(!editing){HapaEditorial.checkpoint(h.state(),'Phrase contrast');editing=true;}h.state().reliquary.currents=c;h.mark();readout();};slider.onchange=commit;slider.onblur=commit;slider.addEventListener('pointercancel',commit);
 $('playPhrase').onclick=async()=>{commit();try{await HapaStudio.currents.playNextRelease();}catch(e){h.toast(e.message,true);}};
 $('currentGestureJump').onclick=()=>{$('gesture-gather').scrollIntoView({block:'center',behavior:'smooth'});$('gesture-gather').focus();};
 function readout(){const c=HapaCurrents.config(h.state());$('phraseContrastValue').textContent=Math.round(c.contrast*100)+'%';$('currentsOn').classList.toggle('active',c.enabled);$('currentsOff').classList.toggle('active',!c.enabled);}
 function refresh(){base.refresh();const c=HapaCurrents.config(h.state());if(!editing)slider.value=c.contrast;for(const [id,key]of Object.entries(switches))$(id).checked=c[key];readout();}
 function tick(t){base.tick(t);const q=HapaCurrents.evaluate(h.cache(),h.state(),t),r=h.renderer().routeTelemetry,cam=h.renderer().lastFrame?.cam?.instrument;
  $('phraseState').textContent=q.stage;$('phraseMotion').textContent=`activity ${Math.round(q.energy*100)}% · rise ${Math.round(q.rise*100)}%`;
  for(const [id,k]of [['gatherBar','gather'],['openBar','opening'],['settleBar','settle']])$(id).style.width=(q.on?q[k]*100:0)+'%';
  $('carryReadout').textContent=q.packet.id&&q.packet.strength>.001?`Carrying ${q.packet.source} · ${q.packet.kind}\n${q.packet.id} · ${q.packet.age.toFixed(1)} / ${q.packet.life}s`:'No selected traveling gesture · ordinary stem movement continues';
  $('journeyReadout').textContent=(r?.mode==='tunnel'||r?.mode==='avatar')?`Continuous Tunnel Worlds · ${r.family}\nNo scenic stops · Standard arrival schedule retained`:r?.active?`${r.motionPolicy||r.stage} · ${Number.isFinite(r.speed)?r.speed.toFixed(2)+' units/song-s':'approach'}\nArrival ${r.arrival.toFixed(2)}s stays fixed`:cam?.hero?cam.hero.name:'Destination / protected view';
 }
 refresh();return{refresh,tick,dispose(){commit();card.remove();base.dispose();}};
};})();

