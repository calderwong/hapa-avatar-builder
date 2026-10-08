
/* Fire desk: saved recipe knobs use the existing checkpoint boundary. Live faders stay Auto. */
'use strict';
(()=>{const previous=HapaReliquaryUI;window.HapaReliquaryUI=function(h){
 const base=previous(h),$=id=>document.getElementById(id),card=document.createElement('section');card.id='fireDesk';card.className='range-desk fire-desk';
 card.innerHTML=`<div class="section-label">FIRE INSTRUMENT <span class="reliq-pill">PAINT / 0.8.8</span></div>
 <p class="hint">A held note feeds the hearth. The voice reaches upward. Plucked notes curl the tongues; accents lift sparks.</p>
 <div class="edit-grid"><button id="fireHearth" class="primary">Hearth of Three ↗</button><button id="fireOrgan">Cinder Organ ↗</button><button id="fireJourney">Rehearse Ember Passage ↗</button><button id="fireTour">Add Fire excursions</button></div>
 <label class="range-head" for="firePreset">Fire character</label><select id="firePreset"><option value="custom">Current recipe</option><option value="hearth">Hearth / held warmth</option><option value="forge">Forge / wider reach</option><option value="spirit">Spirit / blue-gold art flame</option></select>
 <div class="edit-grid"><button id="fireSpark">Send sparks</button><button id="fireOriginal">Remove Fire binding</button></div>
 <div class="micro-status" id="fireStatus"></div>
 <details id="fireOptions" open><summary>Paints · fuel / curl / wind / light</summary><div id="fireKnobs"></div>
 <div class="switchrow"><label><input type="checkbox" id="fireEnabled"> Fire Paint</label><label><input type="checkbox" id="fireAnimate"> Musical flame motion</label><label><input type="checkbox" id="fireCoat"> Ember lacquer on streamers</label><label><input type="checkbox" id="fireMedia"> Side media surfaces</label></div>
 <div id="fireRoles"></div><p class="footnote">Saved recipe controls. Play live with Motion, Radiance or Gather → Release. Fire is an authored 3D density/emission field, not a combustion simulator. Heat is a normalized art coordinate, not temperature in degrees.</p>
 <button id="fireRecipeSave" class="full">Export Fire Paint recipe</button></details>`;
 $('perform').insertBefore(card,$('perform').firstChild);let editing=false;
 const labels={fuel:'Fuel · bass / held warmth',reach:'Reach · voices / flame height',turbulence:'Curl · guitar & keys / tongues',wind:'Wind · pads / lean',embers:'Embers · accents / finite sparks',haze:'Heat shimmer · local distortion',light:'Warm light · separate illumination',smoke:'Smoke · cooling plume'};
 function commit(){if(editing){HapaEditorial.saveActive(h.state());editing=false;h.changed();}}
 function apply(p){commit();try{HapaFire.patch(h.state(),p);h.changed();}catch(e){h.toast(e.message,true);refresh();}}
 for(const [key,label]of Object.entries(labels)){const row=document.createElement('div');row.innerHTML=`<label class="range-head" for="fire-${key}">${label}<output id="firev-${key}"></output></label><input id="fire-${key}" type="range" min="0" max="1" step=".01" aria-label="Fire ${key}">`;$('fireKnobs').append(row);
  const el=$('fire-'+key);el.oninput=()=>{try{const next={...HapaFire.config(h.state()),[key]:+el.value};HapaFire.validate(next);if(!editing){HapaEditorial.checkpoint(h.state(),'Fire '+key);editing=true;}h.state().reliquary.fire=next;h.mark();readout();}catch(e){h.toast(e.message,true);}};el.onchange=commit;el.onblur=commit;el.addEventListener('pointercancel',commit);}
 for(const [id,k]of [['fireEnabled','enabled'],['fireAnimate','animate'],['fireCoat','streamers'],['fireMedia','media']])$(id).onchange=e=>apply({[k]:e.target.checked});
 $('firePreset').onchange=e=>{if(HapaFire.presets[e.target.value])apply({...HapaFire.presets[e.target.value],enabled:true});};
 $('fireHearth').onclick=()=>{commit();HapaStudio.setWorld('hearth-of-three');HapaStudio.setPalette('hearth-twilight');};
 $('fireOrgan').onclick=()=>{commit();HapaStudio.setWorld('cinder-organ');HapaStudio.setPalette('forge-nocturne');};
 $('fireJourney').onclick=async()=>{commit();try{await HapaStudio.fire.rehearse();}catch(e){h.toast(e.message,true);}};
 $('fireTour').onclick=()=>{commit();try{HapaStudio.fire.addExcursions();}catch(e){h.toast(e.message,true);}};
 $('fireSpark').onclick=()=>{HapaStudio.horizons.begin('wave','fire-desk');HapaStudio.horizons.end('wave','fire-desk');};
 $('fireOriginal').onclick=()=>apply({enabled:false,streamers:false});
 $('fireRecipeSave').onclick=()=>{commit();const b=new Blob([JSON.stringify(HapaStudio.fire.recipe(),null,2)],{type:'application/json'}),u=URL.createObjectURL(b),a=document.createElement('a');a.href=u;a.download='hapa-fire-paint.json';a.click();setTimeout(()=>URL.revokeObjectURL(u),15000);};
 function readout(){const c=HapaFire.config(h.state());for(const k of Object.keys(labels))$('firev-'+k).textContent=c[k].toFixed(2);}
 function refresh(){base.refresh();const c=HapaFire.config(h.state());for(const k of Object.keys(labels))if(document.activeElement!==$('fire-'+k))$('fire-'+k).value=c[k];
  for(const [id,k]of [['fireEnabled','enabled'],['fireAnimate','animate'],['fireCoat','streamers'],['fireMedia','media']])$(id).checked=c[k];readout();}
 function tick(t){base.tick(t);if(!$('perform').classList.contains('active'))return;const q=HapaFire.evaluate(h.cache(),h.state(),t),render=h.renderer().lastFrame?.fire;
  $('fireStatus').textContent=(render?`${render.emitters.length} 3D emitter(s) · ${render.samplesPerIntersectedEmitter} samples / crossing\n`:'Fire is available in its locations and as an optional streamer Paint.\n')+`Fuel ${q.channels.fuel.toFixed(2)} · reach ${q.channels.reach.toFixed(2)} local units · ${q.events.length} musical spark event(s)\n${q.animated?'Source-time field + finite events':'Frozen field / no new events'}`;
  $('fireRoles').textContent=q.trace.map(r=>r.name+': '+r.inputs.map(i=>i.id+' '+i.availability+(i.enabled?'':' / quiet')).join(', ')).join('\n');}
 refresh();return{refresh,tick,dispose(){base.dispose();}};
};})();

