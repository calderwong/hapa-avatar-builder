
/* Numerical experiments use timestamped, persisted interventions. Not hidden live holds. */
'use strict';
(()=>{const prior=HapaReliquaryUI;window.HapaReliquaryUI=function(h){
 const base=prior(h),$=id=>document.getElementById(id),card=document.createElement('section');card.id='dynamicsDesk';card.className='range-desk';
 card.innerHTML=`<div class="section-label">ELEMENTAL DYNAMICS <span class="reliq-pill">SIMULATION / 0.9.0</span></div>
 <p class="hint">Air takes the long way around. Heat feeds fire. Water takes that heat—and carries it away.</p>
 <div class="edit-grid"><button id="dynVisit" class="primary">Visit Alchemical Court ↗</button><button id="dynDemo">Play quench study</button><button id="dynQuench">Quench left fire</button><button id="dynIgnite">Reignite fires</button><button id="dynPulse">Pressure impulse</button><button id="dynTour">Add laboratory arrival</button></div>
 <p class="footnote">Quench / Ignite / Pressure are always written to the simulation event track at song time. The study authors Quench at 16s and Ignite at 24s; these are not inferred lyrics or fire instructions.</p>
 <div class="micro-status" id="dynStatus">A stateful 20 Hz simulation, independent of render frame rate. Existing worlds stay procedural.</div>
 <details><summary>Fluid · chemistry · transparency · recovery</summary><div id="dynKnobs"></div>
 <div id="dynSwitches" class="switchrow"></div><label class="edit-label">FIELD VIEW<select id="dynView"><option value="beauty">Beauty / layered elements</option><option value="heat">Transported heat</option><option value="condensate">Condensate only</option></select></label>
 <div class="edit-grid"><button id="dynLayers">Audit transparent layers</button><button id="dynReverse">Reverse draw order</button><button id="dynGPU">Test GPU recovery</button><button id="dynRetry">Retry graphics</button></div>
 <div id="dynAudit" class="micro-status"></div><p class="footnote">Recipe changes replay the numerical history. Six captured surface layers, plus an overflow witness. This is a local simulation—not universal transparent sorting, engineering combustion or an ocean solver. Existing Auto faders remain momentary.</p></details>`;
 $('perform').prepend(card);let edit=false,reversed=false;
 const labels={fuel:'Burner feed / bass sustain',wind:'Inlet flow / musical gusts',quench:'Water intervention strength',pigment:'Painted airflow',volume:'Flame / mist density'};
 function commit(){if(edit){HapaEditorial.saveActive(h.state());edit=false;h.changed();}}
 for(const [key,label]of Object.entries(labels)){const el=document.createElement('div');el.innerHTML=`<label class="range-head" for="dyn-${key}">${label}<output id="dynv-${key}"></output></label><input id="dyn-${key}" type="range" min="0" max="1" step=".01">`;$('dynKnobs').append(el);$('dyn-'+key).oninput=e=>{const n={...HapaDynamics.config(h.state()),[key]:+e.target.value};HapaDynamics.validate(n);if(!edit){HapaEditorial.checkpoint(h.state(),'Dynamics '+key);edit=true;}h.state().reliquary.dynamics=n;h.mark();readout();};$('dyn-'+key).onchange=commit;$('dyn-'+key).onblur=commit;}
 const toggles={enabled:'Simulation running',obstacles:'Solid obstacles',projection:'Pressure projection',combustion:'Fuel / oxygen reaction',boiling:'Water phase change',condensation:'Visible condensate',ink:'Painted flow curves',surfaces:'Translucent veils',orderCorrect:'Depth-ordered composition'};
 for(const[k,v]of Object.entries(toggles)){const el=document.createElement('label');el.innerHTML=`<input type="checkbox" id="dynt-${k}"> ${v}`;$('dynSwitches').append(el);$('dynt-'+k).onchange=e=>{commit();try{HapaStudio.dynamics.configure({[k]:e.target.checked});}catch(e){h.toast(e.message,true);}};}
 $('dynVisit').onclick=async()=>{commit();HapaStudio.pause();HapaStudio.setWorld('alchemical-court');HapaStudio.setPalette('reaction-copper');await HapaStudio.dynamics.prepare();HapaStudio.resumePreview();};
 $('dynDemo').onclick=()=>HapaStudio.dynamics.run(true).catch(e=>h.toast(e.message,true));
 for(const[id,kind]of [['dynQuench','quench'],['dynIgnite','ignite'],['dynPulse','pressure']])$(id).onclick=()=>{commit();try{const e=HapaStudio.dynamics.event(kind);h.toast(kind+' recorded at '+e.time.toFixed(2)+' song seconds');}catch(e){h.toast(e.message,true);}};
 $('dynTour').onclick=()=>{try{HapaStudio.dynamics.addExcursion();}catch(e){h.toast(e.message,true);}};
 $('dynView').onchange=e=>HapaStudio.dynamics.view(e.target.value);
 $('dynLayers').onclick=()=>{$('dynAudit').textContent=JSON.stringify(HapaStudio.dynamics.layers(),null,2);};
 $('dynReverse').onclick=()=>{reversed=!reversed;HapaStudio.dynamics.reverseDrawOrder(reversed);h.toast('Geometry submission order '+(reversed?'reversed':'normal')+'; depth-peeling result should stay the same.');};
 $('dynGPU').onclick=()=>{try{HapaStudio.recovery.test();}catch(e){h.toast(e.message,true);}};
 $('dynRetry').onclick=()=>HapaStudio.recovery.retry()?.catch?.(e=>h.toast(e.message,true));
 function readout(){const c=HapaDynamics.config(h.state());for(const k of Object.keys(labels))$('dynv-'+k).textContent=Math.round(c[k]*100)+'%';}
 function refresh(){base.refresh();const c=HapaDynamics.config(h.state());if(!edit)for(const k of Object.keys(labels))$('dyn-'+k).value=c[k];for(const k of Object.keys(toggles))$('dynt-'+k).checked=c[k];readout();}
 function tick(t){base.tick(t);if(!$('perform').classList.contains('active'))return;const s=h.renderer().dynamicsStats,rec=window.HapaStudio?.recovery.status();
  $('dynStatus').textContent=s?`${s.grid.join(' × ')} cells · simulation ${s.simulatedTime.toFixed(2)}s / song ${t.toFixed(2)}s\nReaction L ${(s.leftReaction||0).toFixed(2)} / R ${(s.rightReaction||0).toFixed(2)} · vapor ${(s.vapor||0).toFixed(2)} · mist ${(s.mist||0).toFixed(2)}\nDivergence ${(s.projection?.before||0).toExponential(1)} → ${(s.projection?.after||0).toExponential(1)}\n${s.obstacles} obstacles · 6 peel layers + overflow audit\nGraphics ${rec?.phase||'ready'} · ${rec?.count||0} recoveries`:`Stateful numerical Paints ready · visit the Court\nGraphics ${rec?.phase||'ready'} · ${rec?.count||0} recoveries`;}
 refresh();return{refresh,tick,dispose(){commit();card.remove();base.dispose();}};
};})();

