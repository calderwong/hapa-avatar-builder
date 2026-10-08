
/* Saved Contour recipe controls; existing Auto/Latch performance faders unchanged. */
'use strict';
(()=>{const prior=HapaReliquaryUI;
window.HapaReliquaryUI=function(h){
 const base=prior(h),$=id=>document.getElementById(id),C=HapaContour,card=document.createElement('section');card.id='contour102Desk';card.className='range-desk living-light-desk';
 const knobs=[['loopScale','Contour size'],['halo','Red halo spread'],['nodes','White-hot nodes'],['blueDepth','Blue interior depth'],['baseMotion','Resting motion'],['audioAmp','Audio amplification']];
 card.innerHTML=`<div class="section-label">CONTOUR / EMBERLINE <span class="reliq-pill">105 · 0.9.15</span></div>
 <p class="hint">Large red light contours, blue negative space, and small hot nodes. Nested outlines occupy three-dimensional space instead of a bright painted tunnel wall.</p>
 <div class="edit-grid"><button id="coVisit" class="primary">Play Contour Gallery ▶</button><button id="coRehearse">Rehearse Contour Fold ▶</button><button id="coAdd">Add one Contour excursion</button><button id="coQuiet">Isolate resting motion</button></div>
 ${knobs.slice(0,3).map(([k,n])=>`<label class="range-head" for="co-${k}">${n}<output id="cov-${k}"></output></label><input id="co-${k}" type="range" min="0" max="1" step=".01" aria-label="${n}">`).join('')}
 <details><summary>Blue space · motion · comparison</summary>
 ${knobs.slice(3).map(([k,n])=>`<label class="range-head" for="co-${k}">${n}<output id="cov-${k}"></output></label><input id="co-${k}" type="range" min="0" max="1" step=".01" aria-label="${n}">`).join('')}
 <div class="switchrow"><label><input id="coEnable" type="checkbox"> Contour Currents renderer</label></div>
 <div class="edit-grid"><button id="coRestore">Restore visual stems</button><button id="coReset">Reset Contour recipe</button></div>
 <p class="footnote">Disable the Contour Currents renderer to compare the legacy pre-102 field. Light paths have real 3D positions, but are not solid collision surfaces. Halo is an artistic light profile, not a fluid simulation. Pause and Reduced motion freeze the added animation. Adding an excursion keeps the original times and rejects protected routes.</p>
 </details><div id="coStatus" class="micro-status"></div>`;
 $('perform').prepend(card);let edit=null,savedStems=null;
 function commit(){if(edit){HapaEditorial.saveActive(h.state());edit=null;h.changed();}}
 for(const [k]of knobs){const el=$('co-'+k);el.oninput=()=>{try{const c={...C.config(h.state()),[k]:+el.value};C.validate(c);if(edit!==k){commit();HapaEditorial.checkpoint(h.state(),'Contour '+k);edit=k;}h.state().reliquary.realms={...h.state().reliquary.realms,contour:c};h.mark();readout();}catch(e){h.toast(e.message,true);}};el.onchange=commit;el.onblur=commit;el.addEventListener('pointercancel',commit);}
 const run=async fn=>{commit();try{await fn();h.changed();}catch(e){h.toast(e.message,true);}};
 $('coEnable').onchange=e=>run(()=>C.patch(h.state(),{enabled:e.target.checked}));
 $('coVisit').onclick=()=>run(async()=>{HapaStudio.setWorld('contour-gallery');HapaStudio.setPalette('contour-ember-102');HapaStudio.resumePreview();await HapaStudio.play();});
 $('coRehearse').onclick=()=>run(()=>HapaStudio.realms.rehearse('contour-fold'));
 $('coAdd').onclick=()=>run(()=>{C.excursion(h.state(),h.cache().score);h.toast('One Contour excursion added. Arrival times retained; Undo restores it.');});
 $('coQuiet').onclick=()=>run(()=>{savedStems=structuredClone(h.state().stems);HapaEditorial.checkpoint(h.state(),'Isolate resting contour motion');for(const id of Object.keys(h.state().stems))HapaStudio.setStemVisual(id,false);});
 $('coRestore').onclick=()=>run(()=>{if(!savedStems)return;HapaEditorial.checkpoint(h.state(),'Restore contour sources');for(const [id,s]of Object.entries(savedStems))if(h.state().stems[id])HapaStudio.setStemVisual(id,s.visual);savedStems=null;});
 $('coReset').onclick=()=>run(()=>C.patch(h.state(),C.defaults()));
 function readout(){const c=C.config(h.state());for(const [k]of knobs)$('cov-'+k).textContent=Math.round(c[k]*100)+'%';}
 function refresh(){base.refresh();const c=C.config(h.state());for(const [k]of knobs)if(document.activeElement!==$('co-'+k))$('co-'+k).value=c[k];$('coEnable').checked=c.enabled;readout();}
 function tick(t){base.tick(t);if(!$('perform').classList.contains('active'))return;const st=h.renderer().lastFrame?.contour;const q=C.evaluate(h.cache(),h.state(),t);$('coStatus').textContent=st?`${st.mode} · ${st.loops} 3D contours · ${st.nodes} hot nodes · ${st.motes} motes\nPhase ${q.phase.toFixed(3)} = base ${q.basePhase.toFixed(3)} + audio ${q.musicalPhase.toFixed(3)}\nBass ${q.levels[0].toFixed(2)} · voice ${q.levels[1].toFixed(2)} · transients ${q.levels[2].toFixed(2)}`:'Play Contour Gallery or rehearse Contour Fold to see the new renderer.';}
 refresh();return{refresh,tick,dispose(){commit();card.remove();base.dispose?.();}};
};})();

