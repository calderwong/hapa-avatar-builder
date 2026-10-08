
/* Wind saved recipes, one shared human service. Native sliders do not invent holds. */
'use strict';
(()=>{const previous=HapaReliquaryUI;window.HapaReliquaryUI=function(h){
 const base=previous(h),$=id=>document.getElementById(id),W=HapaWind,card=document.createElement('section');card.id='windDesk';card.className='range-desk wind-desk';
 card.innerHTML=`<div class="section-label">WIND / ELEMENTAL DANCE <span class="reliq-pill">PAINT · 0.8.9</span></div>
 <p class="hint">Paint the air. A shared gust bends flame, combs water, and carries a visible stroke. Impacts expand as pressure fronts, with different returns in each element.</p>
 <div class="edit-grid"><button id="windVisit" class="primary">Confluence Court ↗</button><button id="windRehearse">Rehearse Pressure Passage ↗</button><button id="windShock">Send pressure wave · 6</button><button id="windTour">Add Wind excursion</button></div>
 <label class="range-head" for="windPreset">Wind character</label><select id="windPreset"><option value="custom">Current recipe</option><option value="zephyr">Zephyr · pearl breath</option><option value="tempest">Tempest · copper pressure</option><option value="calligraphy">Calligraphy · jade ribbons</option></select>
 <div class="switchrow"><label><input type="checkbox" id="windVisible"> Paint the air</label><label><input type="checkbox" id="windFire"> Bend Fire</label><label><input type="checkbox" id="windWater"> Stir Water</label></div>
 <div class="micro-status" id="windStatus"></div>
 <details id="windOptions"><summary>Wind · force / pigment / element exchange</summary><div id="windKnobs"></div>
 <div class="switchrow"><label><input type="checkbox" id="windEnabled"> Wind instrument</label><label><input type="checkbox" id="windAnimate"> Musical field motion</label><label><input type="checkbox" id="windExchange"> Fire updraft + Water drag</label><label><input type="checkbox" id="windEverywhere"> Ink in other worlds too</label></div>
 <label class="range-head" for="windPalette">Air pigments</label><select id="windPalette"><option value="jade">Jade / gold</option><option value="pearl">Pearl / silver</option><option value="copper">Copper / teal</option></select>
 <p class="footnote">These are saved arrangement settings. Perform live with the existing Auto faders, Gather → Release, or the new finite Pressure wave pad. Visible pigment is not force strength. Water responds with a slower envelope than Fire. Scene units and artistic pressure—not meteorology or explosion physics.</p><div id="windRoles" class="footnote"></div><button id="windSave" class="full">Export Wind Paint recipe</button></details>`;
 $('perform').insertBefore(card,$('perform').firstChild);let editing=false;
 const labels={strength:'Breeze · sustained carrying force',gusts:'Gusts · traveling packets',curl:'Curl · small painted turns',vortex:'Vortex · circling flow',pressure:'Pressure · impact / rebound',pigment:'Pigment · visible strokes only',bearing:'Bearing · degrees',fireCoupling:'Fire response · bend / recoil',waterCoupling:'Water response · chop / wakes',heatLift:'Fire → Wind · updraft',waterDrag:'Water → Wind · surface damping'};
 function commit(){if(editing){HapaEditorial.saveActive(h.state());editing=false;h.changed();}}
 function apply(p){commit();try{W.patch(h.state(),p);h.changed();}catch(e){h.toast(e.message,true);refresh();}}
 for(const [key,label]of Object.entries(labels)){const el=document.createElement('div'),range=W.numbers[key];el.innerHTML=`<label class="range-head" for="wind-${key}">${label}<output id="windv-${key}"></output></label><input id="wind-${key}" type="range" min="${range[0]}" max="${range[1]}" step="${key==='bearing'?1:.01}" aria-label="Wind ${key}">`;$('windKnobs').append(el);
  const slider=$('wind-'+key);slider.oninput=()=>{try{const n={...W.config(h.state()),[key]:+slider.value};W.validate(n);if(!editing){HapaEditorial.checkpoint(h.state(),'Wind '+key);editing=true;}h.state().reliquary.wind=n;h.mark();readout();}catch(e){h.toast(e.message,true);}};slider.onchange=commit;slider.onblur=commit;slider.addEventListener('pointercancel',commit);}
 const toggles={windVisible:'visible',windFire:'fireLink',windWater:'waterLink',windEnabled:'enabled',windAnimate:'animate',windExchange:'exchange',windEverywhere:'everywhere'};
 for(const [id,k]of Object.entries(toggles))$(id).onchange=e=>apply({[k]:e.target.checked});
 $('windPalette').onchange=e=>apply({palette:e.target.value});$('windPreset').onchange=e=>{if(W.presets[e.target.value])apply({...W.presets[e.target.value],enabled:true,visible:true});};
 $('windVisit').onclick=()=>{commit();HapaStudio.setWorld('confluence-court');HapaStudio.setPalette('confluence-dusk');};
 $('windRehearse').onclick=async()=>{commit();try{await HapaStudio.wind.rehearse();}catch(e){h.toast(e.message,true);}};
 $('windTour').onclick=()=>{commit();try{HapaStudio.wind.addExcursions();}catch(e){h.toast(e.message,true);}};
 $('windShock').onclick=()=>HapaStudio.wind.shock();
 $('windSave').onclick=()=>{commit();const u=URL.createObjectURL(new Blob([JSON.stringify(HapaStudio.wind.recipe(),null,2)],{type:'application/json'})),a=document.createElement('a');a.href=u;a.download='hapa-wind-paint.json';a.click();setTimeout(()=>URL.revokeObjectURL(u),15000);};
 function readout(){const c=W.config(h.state());for(const k of Object.keys(labels))$('windv-'+k).textContent=c[k].toFixed(k==='bearing'?0:2);}
 function refresh(){base.refresh();const c=W.config(h.state());for(const k of Object.keys(labels))if(document.activeElement!==$('wind-'+k))$('wind-'+k).value=c[k];for(const [id,k]of Object.entries(toggles))$(id).checked=c[k];$('windPalette').value=c.palette;readout();}
 function tick(t){base.tick(t);if(!$('perform').classList.contains('active'))return;const q=h.renderer().lastFrame?.wind||W.evaluate(h.cache(),h.state(),t);const point=HapaWindKernel.sample(q.field,[0,.5,-2]);
  $('windStatus').textContent=`${q.animated?'Musical wind':'Frozen / disabled wind'} · ${q.events.length} pressure front(s)\nAir speed ${Math.hypot(...point.velocity).toFixed(2)} scene units · Water memory ${q.memory.toFixed(2)}\n${q.feedback.thermalCount} Fire updraft source(s) · surface damping ${q.feedback.waterDamping.toFixed(2)}${q.events.length?'\nFront: '+q.events[0].source+' · '+q.events[0].age.toFixed(2)+'s':''}`;
  if($('windOptions').open)$('windRoles').textContent=q.trace.map(r=>r.name+': '+r.inputs.map(i=>i.id+' '+i.availability+(i.enabled?'':' / quiet')).join(', ')).join('\n');}
 refresh();return{refresh,tick,dispose(){base.dispose();}};
};})();

