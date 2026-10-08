
/* Saved regional scores; all live performance remains under the existing Auto/Latch service. */
'use strict';
(()=>{
 const prior=HapaReliquaryUI;
 window.HapaReliquaryUI=function(h){
  const base=prior(h),host=document.getElementById('reliquary'),$=id=>document.getElementById(id);
  const section=document.createElement('section');section.className='octave-section';
  section.innerHTML=`<div class="section-label">OCTAVE / REGIONAL INSTRUMENT <span class="reliq-pill">0.8</span></div>
   <p class="hint">The two sides of the mantle answer separately. Colored currents travel through real ribbons; the same performer appears inside the tunnels.</p>
   <div class="switchrow"><label><input type="checkbox" id="octRegional"> Regional movement</label><label><input type="checkbox" id="octRibbons"> Shoulder streamers</label></div>
   <div class="switchrow"><label><input type="checkbox" id="octFigures"> 3D figures in tunnels</label></div>
   <div class="edit-grid"><label class="edit-label">CLOTH / FLUID WEIGHT<input id="octCloth" type="number" min="0" max="1" step=".01"></label><label class="edit-label">COLOR CURRENT<input id="octDye" type="number" min="0" max="1" step=".01"></label><label class="edit-label">BREADTH DIAL<input id="octBreadth" type="number" min="0" max="1" step=".01"></label><label class="edit-label">ORBIT SURGE<input id="octSurge" type="number" min="0" max="1" step=".01"></label></div>
   <div class="micro-status">These are saved design settings, not hidden holds. Use Motion, Radiance or the pads for momentary interventions. Left/right refer to a frontal view.</div>
   <div id="octRegions"></div><div class="micro-status" id="octTelemetry"></div>`;
  host.insertBefore(section,host.firstChild);
  function apply(p){try{HapaReliquary.patch(h.state(),p);h.changed();}catch(e){h.toast(e.message,true);refresh();}}
  for(const [id,key]of [['octRegional','regional'],['octRibbons','ribbons'],['octFigures','tunnelFigures']])$(id).onchange=e=>apply({[key]:e.target.checked});
  for(const [id,key]of [['octCloth','clothAmount'],['octDye','dyeAmount'],['octBreadth','breadthAmount'],['octSurge','cameraSurge']])$(id).onchange=e=>apply({[key]:Number(e.target.value)});
  for(const r of HapaOctave.regions){const row=document.createElement('div');row.className='oct-region';row.innerHTML=`<label>${r.name}<input type="number" id="og-${r.id}" min="0" max="1" step=".05" aria-label="${r.name} saved gain"></label><small>${r.sources.join(' + ')} → ${r.verb}</small><div class="reliq-meter"><i id="om-${r.id}"></i></div><small id="oa-${r.id}"></small>`;$('octRegions').appendChild(row);$('og-'+r.id).onchange=e=>apply({regionGains:{[r.id]:Number(e.target.value)}});}
  function refresh(){base.refresh();const c=h.state().reliquary;for(const [id,k]of [['octRegional','regional'],['octRibbons','ribbons'],['octFigures','tunnelFigures']])$(id).checked=c[k];$('octCloth').value=c.clothAmount;$('octDye').value=c.dyeAmount;$('octBreadth').value=c.breadthAmount;$('octSurge').value=c.cameraSurge;for(const r of HapaOctave.regions)$('og-'+r.id).value=c.regionGains[r.id];}
  function tick(t){base.tick(t);if(!host.classList.contains('active'))return;const q=HapaOctave.evaluate(h.cache(),h.state(),t);for(const r of HapaOctave.regions){const a=q.trace[r.id];$('om-'+r.id).style.width=(a.amplitude*100)+'%';$('oa-'+r.id).textContent=a.inputs.map(x=>x.availability+(x.enabled?'':' / disabled')).join(' · ');}
   const z=h.renderer().octaveStats;$('octTelemetry').textContent=z&&Math.abs(z.time-t)<.03?`${z.style} · ${z.actorCopies} actual mesh copies · ${z.actorTriangles.toLocaleString()} actor triangles\n${q.restriction}`:`${q.restriction}\nEach region retains its own measured source. Absent sources do not borrow activity.`;
  }
  refresh();return{refresh,tick,dispose(){base.dispose();}};
 };
})();

