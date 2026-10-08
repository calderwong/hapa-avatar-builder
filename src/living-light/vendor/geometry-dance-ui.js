
/* Prominent, saved geometry controls. They do not steal ownership from six native
 * Auto/Latch performance faders. Inspection is transient and not exported.
 */
'use strict';
(()=>{const previous=HapaReliquaryUI;
 window.HapaReliquaryUI=function(h){
  const base=previous(h),$=id=>document.getElementById(id),D=HapaGeometryDance,card=document.createElement('section');
  card.className='range-desk living-light-desk';card.id='geometryDanceDesk';
  const sliders=[['breath','Geometry Breath'],['gain','Deformation Gain'],['carry','Contour Carry'],['asymmetry','Asymmetry'],['waveTravel','Wave Travel'],['rails','Pulse Rail Intensity']];
  const slider=([k,l])=>`<label class="range-head" for="gd-${k}">${l}<output id="gdv-${k}"></output></label><input id="gd-${k}" type="range" min="0" max="1" step=".01" aria-label="${l}">`;
  card.innerHTML=`<div class="section-label">GEOMETRY DANCE <span class="reliq-pill">105 · 0.9.15</span></div>
  <p class="hint">Bass swells the walls. Percussion launches shape waves. Voices twist the ribs. Light follows the moving structure.</p>
  <div class="edit-grid"><button id="gdTour" class="primary">Restore fractal-first tour</button><button id="gdFractal">Play Golden Loom ▶</button><button id="gdContour">Play Contour Gallery ▶</button><button id="gdLattice">Play Harmonic Lattice ▶</button></div>
  ${sliders.slice(0,3).map(slider).join('')}
  <div class="edit-grid"><label>Motion Character<select id="gdCharacter"><option value="flow">Flow</option><option value="percussive">Percussive</option><option value="elastic">Elastic</option></select></label><label>Motion Octave<select id="gdOctave"><option value="0">Low · broad waves</option><option value="1">Middle · dancing</option><option value="2">High · quicker detail</option></select></label></div>
  <div class="switchrow"><label><input id="gdEnabled" type="checkbox"> Geometry Dance enabled</label><label><input id="gdProof" type="checkbox"> Shape-only proof</label></div>
  <details><summary>Wave controls · fixed-camera comparison</summary>${sliders.slice(3).map(slider).join('')}
  <label class="wide-label">PROOF FAMILY <select id="gdProbeStyle"><option value="fractal-loom">Fractal Pulse / Golden Loom</option><option value="contour-fold">Contour Fold</option><option value="echo-drift">Harmonic Lattice</option><option value="prism-spindle">Prism Spindle</option></select></label>
  <p class="footnote">Shape-only proof fixes the camera, disables bloom, media, particles and moving light, and draws the same geometry. It is not saved in your take. Movement Breadth below controls the 1×–5× musical peak envelope; deformation remains spatially bounded. Turn Deformation Gain to zero to isolate the motion floor. Pause holds song time.</p></details><div id="gdStatus" class="micro-status"></div>`;
  $('perform').prepend(card);let editing=null;
  function commit(){if(editing){HapaEditorial.saveActive(h.state());editing=null;h.changed();}}
  const run=async(fn)=>{commit();try{await fn();h.changed();}catch(e){h.toast(e.message,true);}};
  for(const [k]of sliders){const el=$('gd-'+k);el.oninput=()=>{try{const c={...D.config(h.state()),[k]:+el.value};D.validate(c);if(editing!==k){commit();HapaEditorial.checkpoint(h.state(),'Geometry '+k);editing=k;}h.state().reliquary.dance=c;readout();h.mark();}catch(e){h.toast(e.message,true);}};el.onchange=commit;el.onblur=commit;el.addEventListener('pointercancel',commit);}
  $('gdCharacter').onchange=e=>run(()=>D.patch(h.state(),{character:e.target.value}));$('gdOctave').onchange=e=>run(()=>D.patch(h.state(),{octave:+e.target.value}));$('gdEnabled').onchange=e=>run(()=>D.patch(h.state(),{enabled:e.target.checked}));
  $('gdProof').onchange=e=>run(()=>{HapaStudio.geometry.inspect(e.target.checked,$('gdProbeStyle').value);HapaStudio.resumePreview();});
  $('gdProbeStyle').onchange=()=>{if($('gdProof').checked)HapaStudio.geometry.inspect(true,$('gdProbeStyle').value);h.mark();};
  $('gdTour').onclick=()=>run(()=>{HapaStudio.geometry.inspect(false);HapaStudio.geometry.restoreHero();h.toast('Golden Loom restored to at least 62% of passage time. Arrival times and destinations retained.');});
  $('gdFractal').onclick=()=>run(async()=>{HapaStudio.geometry.inspect(false);HapaStudio.geometry.restoreHero();HapaStudio.resumePreview();await HapaStudio.loom.rehearse();});
  $('gdContour').onclick=()=>run(async()=>{HapaStudio.geometry.inspect(false);HapaStudio.setWorld('contour-gallery');HapaStudio.setPalette('contour-ember-102');HapaStudio.resumePreview();await HapaStudio.play();});
  $('gdLattice').onclick=()=>run(async()=>{HapaStudio.geometry.inspect(false);const p=HapaStudio.passages.read(),b=p.bridges.find(x=>x.style==='echo-drift');if(b){HapaStudio.resumePreview();await HapaStudio.passages.rehearse(b.id);}else{HapaStudio.setWorld('echo-lattice');HapaStudio.setPalette('echo-ultraviolet');HapaStudio.resumePreview();await HapaStudio.play();}});
  function readout(){const c=D.config(h.state());for(const [k]of sliders)$('gdv-'+k).textContent=Math.round(c[k]*100)+'%';}
  function refresh(){base.refresh();const c=D.config(h.state());for(const [k]of sliders)if(document.activeElement!==$('gd-'+k))$('gd-'+k).value=c[k];$('gdEnabled').checked=c.enabled;$('gdCharacter').value=c.character;$('gdOctave').value=c.octave;$('gdProof').checked=!!h.state()._geometryProof;readout();}
  function tick(t){base.tick(t);if(!$('perform').classList.contains('active'))return;const f=h.renderer().lastFrame,q=f?.geometry;if(!q)return;const cov=HapaPassages.coverage(h.state().passages,h.cache().score.duration);$('gdStatus').textContent=`${q.style} · ${q.active?'geometry active':q.reason} · peak envelope ${q.breadth.toFixed(2)}×\nRadius amplitude ${(q.shape[0]*100).toFixed(0)}% · twist ${(q.shape[1]*180/Math.PI).toFixed(0)}° · ${q.events.length} traveling impacts\nGolden Loom ${(100*cov.fractalSeconds/Math.max(1,cov.passageSeconds)).toFixed(0)}% of passage time · arrival times retained`;}
  refresh();return{refresh,tick,dispose(){commit();card.remove();base.dispose?.();}};
 };
})();

