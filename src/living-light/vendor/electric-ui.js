

/* Visible saved Electricity recipe. Existing Auto/Latch and gesture recording remain authoritative. */
'use strict';
(()=>{const prior=HapaReliquaryUI;window.HapaReliquaryUI=function(h){
 const base=prior(h),$=id=>document.getElementById(id),E=HapaElectricity,card=document.createElement('section');card.className='range-desk electric-desk';card.id='electricDesk';
 card.innerHTML=`<div class="section-label">ELECTRICITY INSTRUMENT <span class="reliq-pill">PAINT / 0.9.4 R1</span></div>
 <p class="hint">Charge gathers. A path reaches, branches, conducts, and leaves an afterglow. Base motion keeps the channels moving between strokes. Audio amplification adds the music above that floor.</p>
 <div class="edit-grid"><button id="elRotunda" class="primary">Stormglass Rotunda ↗</button><button id="elHarp">Voltaic Harp ↗</button><button id="elJourney">Rehearse Arc Relay ↗</button><button id="elTour">Add Electricity excursions</button></div>
 <div class="edit-grid"><button id="elDischarge">↯ Send discharge · 7</button><button id="elNext">Next musical discharge ↗</button></div>
 <label class="range-head" for="elPreset">Electrical character</label><select id="elPreset"><option value="custom">Current recipe</option><option value="corona">Corona · held filaments</option><option value="storm">Storm · branching release</option><option value="copper">Copper · warm conductors</option></select>
 <div class="micro-status" id="elStatus"></div><div class="switchrow"><label><input id="elEnabled" type="checkbox"> Electricity Paint</label><label><input id="elGentle" type="checkbox"> Gentle discharges</label></div>
 <details id="elOptions"><summary>Charge · shape / travel / afterglow</summary><div id="elKnobs"></div>
 <div class="switchrow"><label><input id="elAnimate" type="checkbox"> Musical field motion</label><label><input id="elBranches" type="checkbox"> Side branches</label><label><input id="elWind" type="checkbox"> Wind bows the channels</label><label><input id="elCoat" type="checkbox"> Electric streamer embroidery</label><label><input id="elMedia" type="checkbox"> Side media surfaces</label></div>
 <div id="elRoles" class="footnote"></div><p class="footnote">Saved recipes, not hidden Auto holds. Send discharge uses the existing event track; Record gestures to save it. Bright local lines are softened and rate-spaced, but this is not a photosensitivity certification. Reduced motion removes discharge events. Charge and current are normalized artistic signals, not electrical measurements.</p><button id="elSave" class="full">Export Electricity Paint recipe</button></details>`;
 $('perform').prepend(card);let editing=false;
 const labels={baseMotion:'Base motion · always living',audioAmp:'Audio amplification · above the floor',charge:'Charge · bass / held tension',threshold:'Threshold · reserve the discharge',bend:'Tortuosity · guitar / channel shape',branching:'Branching · answering tendrils',travel:'Travel · accumulated current phase',corona:'Corona · sustained glow',afterglow:'Afterglow · return to rest',light:'Light · core & local illumination'};
 function commit(){if(editing){HapaEditorial.saveActive(h.state());editing=false;h.changed();}}
 function apply(p){commit();try{E.patch(h.state(),p);h.changed();}catch(e){h.toast(e.message,true);refresh();}}
 for(const [k,label]of Object.entries(labels)){const row=document.createElement('div');row.innerHTML=`<label class="range-head" for="el-${k}">${label}<output id="elv-${k}"></output></label><input type="range" id="el-${k}" min="0" max="1" step=".01" aria-label="Electricity ${k}">`;$('elKnobs').append(row);const el=$('el-'+k);
  el.oninput=()=>{const n={...E.config(h.state()),[k]:+el.value};try{E.validate(n);if(!editing){HapaEditorial.checkpoint(h.state(),'Electricity '+k);editing=true;}h.state().reliquary.electricity=n;h.mark();readout();}catch(e){h.toast(e.message,true);}};el.onchange=commit;el.onblur=commit;el.addEventListener('pointercancel',commit);}
 const toggles={elEnabled:'enabled',elGentle:'gentle',elAnimate:'animate',elBranches:'branches',elWind:'windLink',elCoat:'streamers',elMedia:'media'};
 for(const [id,k]of Object.entries(toggles))$(id).onchange=e=>apply({[k]:e.target.checked});
 $('elPreset').onchange=e=>{if(E.presets[e.target.value])apply({...E.presets[e.target.value],enabled:true});};
 $('elRotunda').onclick=()=>{commit();HapaStudio.setWorld('stormglass-rotunda');HapaStudio.setPalette('electric-porcelain');};
 $('elHarp').onclick=()=>{commit();HapaStudio.setWorld('voltaic-harp');HapaStudio.setPalette('electric-copper');};
 $('elJourney').onclick=async()=>{commit();try{await HapaStudio.electricity.rehearse();}catch(e){h.toast(e.message,true);}};
 $('elTour').onclick=()=>{commit();try{HapaStudio.electricity.addExcursions();}catch(e){h.toast(e.message,true);}};
 $('elDischarge').onclick=()=>HapaStudio.electricity.discharge();
 $('elNext').onclick=async()=>{commit();const ev=E.events(h.cache(),h.state()).find(e=>e.time>h.time()+.5);if(!ev){h.toast('No later selected discharge in this song.');return;}HapaStudio.setWorld('stormglass-rotunda');HapaStudio.setPalette('electric-porcelain');await HapaStudio.seek(Math.max(0,ev.time-.75));HapaStudio.resumePreview();await HapaStudio.play();};
 $('elSave').onclick=()=>{const b=new Blob([JSON.stringify(HapaStudio.electricity.recipe(),null,2)],{type:'application/json'}),u=URL.createObjectURL(b),a=document.createElement('a');a.href=u;a.download='hapa-electricity-paint.json';a.click();setTimeout(()=>URL.revokeObjectURL(u),15000);};
 function readout(){const c=E.config(h.state());for(const k of Object.keys(labels))$('elv-'+k).textContent=c[k].toFixed(2);}
 function refresh(){base.refresh();const c=E.config(h.state());for(const k of Object.keys(labels))if(document.activeElement!==$('el-'+k))$('el-'+k).value=c[k];for(const [id,k]of Object.entries(toggles))$(id).checked=c[k];readout();}
 function tick(t){base.tick(t);if(!$('perform').classList.contains('active'))return;const q=E.evaluate(h.cache(),h.state(),t),v=h.renderer().lastFrame?.electricity;
 $('elStatus').textContent=`Charge ${q.charge.toFixed(2)} · ${q.events.length} recent discharge(s) · ${q.animated?'coherent source-time motion':'held form'}\n`+(v?`${v.channels} conductor channels · ${v.pathCount} paths · ${v.triangles.toLocaleString()} arc triangles`:'Paint available in the two electrical locations and Arc Relay.');
 $('elRoles').textContent=q.trace.map(r=>r.name+': '+r.inputs.map(i=>i.id+' '+i.availability+(i.enabled?'':' / quiet')).join(', ')).join('\n');}
 refresh();return{refresh,tick,dispose(){base.dispose();}};
};})();


