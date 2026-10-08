
/* Water Paint desk. Saved recipe knobs, existing momentary Auto faders for performance. */
'use strict';
(()=>{const prior=HapaReliquaryUI;window.HapaReliquaryUI=function(h){
 const base=prior(h),$=id=>document.getElementById(id),card=document.createElement('section');card.id='waterDesk';card.className='range-desk water-desk';
 card.innerHTML=`<div class="section-label">WATER INSTRUMENT <span class="reliq-pill">PAINT / 0.8.7</span></div>
 <p class="hint">One instrument. Many surfaces. Bass lifts the water; wind combs it; impacts send rings across it.</p>
 <div class="edit-grid"><button id="waterCourt" class="primary">Rain Court ↗</button><button id="waterReach">Windward Reach ↗</button><button id="waterTidal">Tidal Observatory ↗</button><button id="waterJourney">Rehearse water passage ↗</button></div>
 <label class="range-head" for="waterPreset">Water character</label><select id="waterPreset"><option value="custom">Current recipe</option><option value="mirror">Mirror / listening rain</option><option value="windglass">Windglass / open swell</option><option value="storm">Storm blue / higher crests</option></select>
 <div class="edit-grid"><button id="waterWave">Send a ripple</button><button id="waterTour">Add water excursions</button></div>
 <div class="micro-status" id="waterStatus"></div>
 <details id="waterOptions" open><summary>Paints · waves / wind / light</summary><div id="waterKnobs"></div>
 <div class="switchrow"><label><input id="waterAnimate" type="checkbox"> Musical water motion</label><label><input id="waterReflect" type="checkbox"> Reflect architecture</label><label><input id="waterUpgrade" type="checkbox"> Upgrade old Tidal water</label><label><input id="waterSilk" type="checkbox"> Water Paint on streamers</label></div>
 <p class="footnote">Saved recipe settings. The existing Motion/Radiance faders stay Auto and return on release. Reflections use a mirrored camera at the mean water level; refraction uses the opaque scene. Not a fluid simulator or full ray-traced transport.</p>
 <div id="waterRoles"></div><button id="waterRecipeSave" class="full">Export Water Paint recipe</button></details>`;
 $('perform').insertBefore(card,$('perform').firstChild);let editing=false;
 const labels={swell:'Swell · bass / wave height',wind:'Wind · sustained stems / small ripples',impacts:'Impacts · onset rings',current:'Current · integrated travel',light:'Light · voice / glints',foam:'Foam · crest albedo',clarity:'Clarity · absorption'};
 for(const [key,label]of Object.entries(labels)){const row=document.createElement('div');row.innerHTML=`<label class="range-head" for="w-${key}">${label}<output id="wv-${key}"></output></label><input id="w-${key}" type="range" min="0" max="1" step=".01" aria-label="Water ${key}">`; $('waterKnobs').append(row);
  const el=$('w-'+key);el.oninput=()=>{try{const next={...HapaWater.config(h.state()),[key]:Number(el.value)};HapaWater.validate(next);if(!editing){HapaEditorial.checkpoint(h.state(),'Water '+key);editing=true;}h.state().reliquary.water=next;h.mark();readout();}catch(e){h.toast(e.message,true);}};el.onchange=commit;el.onblur=commit;el.addEventListener('pointercancel',commit);}
 function commit(){if(editing){HapaEditorial.saveActive(h.state());editing=false;h.changed();}}
 function apply(p){commit();try{HapaWater.patch(h.state(),p);h.changed();}catch(e){h.toast(e.message,true);refresh();}}
 const switches={waterAnimate:'animate',waterReflect:'reflections',waterUpgrade:'upgradeTidal',waterSilk:'streamers'};
 for(const [id,key]of Object.entries(switches))$(id).onchange=e=>apply({[key]:e.target.checked});
 $('waterPreset').onchange=e=>{if(HapaWater.presets[e.target.value])apply(HapaWater.presets[e.target.value]);};
 for(const [id,world,palette]of [['waterCourt','rain-court','water-moonstone'],['waterReach','windward-reach','water-sunrise'],['waterTidal','tidal-observatory','pearl-tide']])$(id).onclick=()=>{commit();HapaStudio.setWorld(world);HapaStudio.setPalette(palette);};
 $('waterWave').onclick=()=>{HapaStudio.horizons.begin('wave','water-desk');HapaStudio.horizons.end('wave','water-desk');};
 $('waterJourney').onclick=async()=>{commit();try{await HapaStudio.water.rehearse();}catch(e){h.toast(e.message,true);}};
 $('waterTour').onclick=()=>{commit();try{HapaStudio.water.addExcursions();}catch(e){h.toast(e.message,true);}};
 $('waterRecipeSave').onclick=()=>{commit();const data={schema:'hapa.paint.recipe/1',paint:'water',version:'0.1.0',config:HapaWater.config(h.state()),note:'Recipe only. No audio/media data or implicit network fetch.'},url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='hapa-water-paint.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),15000);};
 function readout(){const c=HapaWater.config(h.state());for(const key of Object.keys(labels))$('wv-'+key).textContent=Math.round(c[key]*100)+'%';}
 function refresh(){base.refresh();const c=HapaWater.config(h.state());if(!editing)for(const key of Object.keys(labels))$('w-'+key).value=c[key];for(const [id,key]of Object.entries(switches))$(id).checked=c[key];readout();}
 function tick(t){base.tick(t);if(!$('perform').classList.contains('active'))return;const q=h.renderer().waterStats,live=q&&Math.abs(q.time-t)<.05;
  $('waterStatus').textContent=live?`${q.binding.id} · ${q.animated?'playing':'frozen'}\nSwell ${q.swell.toFixed(3)} · wind ${q.wind.toFixed(3)} · ${q.events.length} finite rings\n${q.reflection} · ${q.incoming?'incoming view':'current view'}`:'Water Paint ready · visit a water scene or enable streamer coating';
  if(live)$('waterRoles').textContent=q.trace.map(x=>`${x.name}: ${x.inputs.map(i=>i.id+' '+i.availability).join(' / ')}`).join('\n');
 }
 refresh();return{refresh,tick,dispose(){commit();card.remove();base.dispose();}};
};})();

