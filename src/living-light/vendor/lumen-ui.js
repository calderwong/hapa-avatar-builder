
/* A native Perform card. Settings belong to saved takes; no CSS glow, timer or late scene injection. */
'use strict';
(()=>{const previous=HapaReliquaryUI;window.HapaReliquaryUI=function(h){
 const base=previous(h),$=id=>document.getElementById(id),L=HapaLumen,E=HapaElectricity;
 const card=document.createElement('section');card.className='range-desk living-light-desk';card.id='lumenDesk';
 card.innerHTML=`<div class="section-label">LIVING LIGHT <span class="reliq-pill">0.9.4 · REBUILT R1</span></div>
 <p class="hint">Luminous architecture, light in the air, and an electrical current that never needs a drum hit to feel alive.</p>
 <div class="edit-grid"><button id="liCloister" class="primary">Neon Cloister ↗</button><button id="liArcade">Lumen Arcade ↗</button><button id="liRehearse">Rehearse Neon Cascade ↗</button><button id="liTour">Add neon journey</button></div>
 <label class="range-head" for="li-air">Illuminated air<output id="liv-air"></output></label><input id="li-air" type="range" min="0" max="1" step=".01" aria-label="Illuminated air">
 <label class="range-head" for="li-detail">Material detail<output id="liv-detail"></output></label><input id="li-detail" type="range" min="0" max="1" step=".01" aria-label="Material detail">
 <label class="range-head" for="li-baseMotion">Electricity · base motion<output id="liv-baseMotion"></output></label><input id="li-baseMotion" type="range" min="0" max="1" step=".01" aria-label="Electricity base motion">
 <label class="range-head" for="li-audioAmp">Electricity · audio amplification<output id="liv-audioAmp"></output></label><input id="li-audioAmp" type="range" min="0" max="1" step=".01" aria-label="Electricity audio amplification">
 <details id="liOptions"><summary>Light · bloom / comparison / technical status</summary>
 <label class="range-head" for="li-light">Light sources<output id="liv-light"></output></label><input id="li-light" type="range" min="0" max="1" step=".01" aria-label="Light sources">
 <label class="range-head" for="li-glow">Selective bloom<output id="liv-glow"></output></label><input id="li-glow" type="range" min="0" max="1" step=".01" aria-label="Selective bloom">
 <div class="edit-grid"><button id="liQuiet">Compare no visual stems</button><button id="liRestore">Restore visual stems</button></div>
 <p class="footnote">The comparison disables visual stem inputs, not audible tracks. Base motion continues at song time; Pause, Reduced motion and Electricity's animation switch freeze it. Light uses bounded ray integration, not a flat screen tint. No shadowed multiple scattering.</p>
 </details><div class="micro-status" id="liStatus"></div>`;
 $('perform').prepend(card);let editing=null,priorStems=null;
 const electric=new Set(['baseMotion','audioAmp']),keys=['air','detail','baseMotion','audioAmp','light','glow'];
 const cfg=k=>electric.has(k)?E.config(h.state()):L.config(h.state());
 function commit(){if(editing){editing=null;HapaEditorial.saveActive(h.state());h.changed();}}
 for(const k of keys){const el=$('li-'+k);el.oninput=()=>{try{const n={...cfg(k),[k]:+el.value};(electric.has(k)?E:L).validate(n);if(!editing){HapaEditorial.checkpoint(h.state(),'Living Light '+k);editing=k;}h.state().reliquary[electric.has(k)?'electricity':'lumen']=n;h.mark();readout();}catch(e){h.toast(e.message,true);}};el.onchange=commit;el.onblur=commit;el.addEventListener('pointercancel',commit);}
 function readout(){for(const k of keys)$('liv-'+k).textContent=cfg(k)[k].toFixed(2);}
 function visit(id,pal){commit();HapaStudio.setWorld(id);HapaStudio.setPalette(pal);}
 $('liCloister').onclick=()=>visit('neon-cloister','electric-neon');$('liArcade').onclick=()=>visit('lumen-arcade','lumen-copper');
 $('liRehearse').onclick=async()=>{commit();try{await HapaStudio.lumen.rehearse();}catch(e){h.toast(e.message,true);}};
 $('liTour').onclick=()=>{commit();try{HapaStudio.lumen.addExcursions();h.toast('Neon journey added. Existing timing is unchanged.');}catch(e){h.toast(e.message,true);}};
 $('liQuiet').onclick=()=>{commit();priorStems=structuredClone(h.state().stems);HapaEditorial.checkpoint(h.state(),'Isolate basal electrical motion');for(const [id]of Object.entries(h.state().stems))HapaStudio.setStemVisual(id,false);h.changed();};
 $('liRestore').onclick=()=>{if(!priorStems)return;HapaEditorial.checkpoint(h.state(),'Restore visual sources');for(const [id,s]of Object.entries(priorStems))if(h.state().stems[id])HapaStudio.setStemVisual(id,s.visual);priorStems=null;h.changed();};
 function refresh(){base.refresh();for(const k of keys)if(document.activeElement!==$('li-'+k))$('li-'+k).value=cfg(k)[k];readout();}
 function tick(t){base.tick(t);if(!$('perform').classList.contains('active'))return;readout();const q=E.evaluate(h.cache(),h.state(),t),stats=h.renderer().lumenStats;
 $('liStatus').textContent=`Current phase ${q.phase.toFixed(2)} · resting rate ${q.basePhaseRate.toFixed(2)} rad / song second\n${q.events.length} recent measured / human discharges · base motion is not an event\n${stats&&Math.abs(stats.time-t)<.08?(stats.native?'Native neon geometry':'Electricity geometry')+' · '+(stats.volumeDrawn?stats.steps+' air samples':'air pass off')+' · '+(stats.incoming?'incoming view':'current view'):'Water, Fire, Wind, original Golden Loom and prior places remain available.'}`;
 }
 refresh();return{refresh,tick,dispose(){commit();base.dispose?.();card.remove();}};
};})();

