
/* Saved arrangement controls; six performance faders still own live Auto/Latch. */
'use strict';
(()=>{
 const prior=HapaReliquaryUI;
 window.HapaReliquaryUI=function(h){
  const base=prior(h),$=id=>document.getElementById(id),card=document.createElement('section');card.className='range-desk realm-desk';card.id='realmDesk';
  card.innerHTML=`<div class="section-label">SHADER REALMS <span class="reliq-pill">SOURCE ADAPTATIONS · 0.9.11</span></div>
   <p class="hint">Visual-QA dominance pass: Prism / Echo / Contour are strong through structure and color, not white clipping. Each study remains dominant in its own world while infusing classic realms more legibly.</p>
   <div class="edit-grid"><button id="realmCircuit">Circuit Basilica ↗</button><button id="realmStars">Astral Anchorage ↗</button><button id="realmCloud">Cloud Choir ↗</button><button id="realmTour" class="primary">Add integrated realm route</button></div>
   <div class="edit-grid"><button id="realmPrism">Prism Sanctum ↗</button><button id="realmEcho">Echo Lattice ↗</button><button id="realmContour">Contour Gallery ↗</button><button id="realmTour2">Refresh integrated route</button></div>
   <div class="edit-grid"><button id="realmCircuitTrip">Circuit Transit ↝</button><button id="realmPrismTrip">Prism Spindle ↝</button><button id="realmEchoTrip">Echo Drift ↝</button><button id="realmContourTrip">Contour Fold ↝</button></div>
   <details id="realmDetails"><summary>Material, cross-study blending & source credits</summary>
   <label class="range-head" for="realmDetail">Study detail <output id="realmDetailVal"></output></label><input id="realmDetail" type="range" min="0" max="1" step=".01" aria-label="Realm detail">
   <label class="range-head" for="realmAtmosphere">Atmosphere / depth haze <output id="realmAtmosphereVal"></output></label><input id="realmAtmosphere" type="range" min="0" max="1" step=".01" aria-label="Realm atmosphere">
   <label class="range-head" for="realmExpression">Musical expression <output id="realmExpressionVal"></output></label><input id="realmExpression" type="range" min="0" max="1" step=".01" aria-label="Realm expression">
   <label class="range-head" for="realmStudyBlend">Study dominance <output id="realmStudyBlendVal"></output></label><input id="realmStudyBlend" type="range" min="0" max="1" step=".01" aria-label="Study dominance">
   <div class="switchrow"><label><input id="realmAnimate" type="checkbox"> Musical field motion</label><label><input id="realmMedia" type="checkbox"> Side video surfaces</label></div>
   <div class="switchrow"><label><input id="realmStudyAuto" type="checkbox"> Auto-drive prism / echo / contour dominance from stem telemetry</label></div>
   <p class="footnote">Pinned sources still include <b>UltimateKaliCircuits</b>, <b>SpaceIsThePlace</b>, and <b>CloudVortex</b>. This extension also folds in original Hapa studies grounded on the requested ISF editor targets <b>5e7a804a7c113618206deea1</b>, <b>5e7a7f7b7c113618206dde5f</b>, and <b>5e7a7fcb7c113618206de47c</b>. <b>They are not verbatim ports of inaccessible editor revisions.</b></p>
   <p class="footnote">Opaque surfaces keep real depth. Volumes stop at that depth; they are not solid collision geometry. Saved settings never move arrivals. Use the existing faders for temporary touches.</p></details>
   <div id="realmTrace" class="range-live"></div>`;
  $('loomDesk').insertAdjacentElement('afterend',card);let editing=null;
  function commit(){if(editing){HapaEditorial.saveActive(h.state());editing=null;h.changed();}}
  function apply(p){commit();try{HapaRealms.patch(h.state(),p);h.changed();}catch(e){h.toast(e.message,true);refresh();}}
  const knobs=[['realmDetail','detail'],['realmAtmosphere','atmosphere'],['realmExpression','expression'],['realmStudyBlend','studyBlend']];
  for(const [id,key]of knobs){const el=$(id);el.oninput=()=>{const next={...HapaRealms.defaults(),...h.state().reliquary.realms,[key]:+el.value};HapaRealms.validate(next);if(editing!==key){commit();HapaEditorial.checkpoint(h.state(),'Realm '+key);editing=key;}h.state().reliquary.realms=next;readout();h.mark();};el.onchange=commit;el.onblur=commit;el.addEventListener('pointercancel',commit);}
  $('realmAnimate').onchange=e=>apply({animate:e.target.checked});$('realmMedia').onchange=e=>apply({media:e.target.checked});$('realmStudyAuto').onchange=e=>apply({studyAuto:e.target.checked});
  for(const [id,world]of [['realmCircuit','circuit-basilica'],['realmStars','astral-anchorage'],['realmCloud','cloud-choir'],['realmPrism','prism-sanctum'],['realmEcho','echo-lattice'],['realmContour','contour-gallery']])$(id).onclick=()=>{commit();HapaStudio.setWorld(world);HapaStudio.setPalette(HapaRealms.paletteFor(world));};
  const addExcursions=()=>{commit();try{HapaStudio.realms.addExcursions();h.toast('Integrated shader-study route added while preserving your timing grid.');}catch(e){h.toast(e.message,true);}};
  $('realmTour').onclick=addExcursions;$('realmTour2').onclick=addExcursions;
  for(const [id,style]of [['realmCircuitTrip','circuit-transit'],['realmPrismTrip','prism-spindle'],['realmEchoTrip','echo-drift'],['realmContourTrip','contour-fold']])$(id).onclick=async()=>{commit();try{await HapaStudio.realms.rehearse(style);}catch(e){h.toast(e.message,true);}};
  function readout(){const c={...HapaRealms.defaults(),...h.state().reliquary.realms};for(const [id,key]of knobs)$(id+'Val').textContent=Math.round(c[key]*100)+'%';}
  function refresh(){base.refresh();const c={...HapaRealms.defaults(),...h.state().reliquary.realms};if(!editing)for(const [id,key]of knobs)$(id).value=c[key];$('realmAnimate').checked=c.animate;$('realmMedia').checked=c.media;$('realmStudyAuto').checked=c.studyAuto;readout();}
  function tick(t){base.tick(t);const f=h.renderer().lastFrame,q=f?.realms;$('realmTrace').textContent=q?`${q.incoming?'Incoming':'Current'} realm · ${q.volumeSteps} volume samples maximum\nPrism ${(q.studyMix?.[0]||0).toFixed(2)} · Echo ${(q.studyMix?.[1]||0).toFixed(2)} · Contour ${(q.studyMix?.[2]||0).toFixed(2)} · blend ${(q.studyBlend||0).toFixed(2)}\nVoice ${q.levels[0].toFixed(2)} · bass ${q.levels[1].toFixed(2)} · atmosphere ${q.levels[3].toFixed(2)}`:'Ready for integrated shader-study excursions · classic and study realms share surface language';}
  refresh();return{refresh,tick,dispose(){commit();card.remove();base.dispose();}};
 };
})();

