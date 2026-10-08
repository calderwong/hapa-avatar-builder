
/* Editorial controls configure this location; the existing six performance faders
 * remain momentary Auto controls. No duplicate human-ownership service. */
'use strict';
window.HapaReliquaryUI=function(h){
 const host=document.getElementById('reliquary'),R=HapaReliquary,$=id=>document.getElementById(id);
 host.innerHTML=`<div class="section-label">THE LIVING RELIQUARY <span class="reliq-pill">3D / STEM CONDUCTOR</span></div>
 <p class="hint">Attacks strike. Held notes open. The body settles rather than switching off. Auto still returns as soon as you let go.</p>
 <div class="edit-grid"><button id="reliqVisit" class="primary">Visit the Reliquary</button><button id="reliqJourney">Rehearse the arrival</button></div>
 <div class="reliq-focus edit-grid"><label class="edit-label">CAMERA FRAMING<select id="reliqFrame"><option value="score">Follow the score</option><option value="portrait">Portrait</option><option value="close">Close study</option><option value="chamber">Chamber</option></select></label>
 <label class="edit-label">FOCUS INTENTION<select id="reliqFocus"><option value="directed">Vocal-led rack</option><option value="core">Keep core sharp</option><option value="trim">Foreground trim</option><option value="deep">Deep / all sharp</option></select></label></div>
 <label class="edit-label">DEPTH-FOCUS STRENGTH <input id="reliqDefocus" type="number" min="0" max="1" step=".01"></label>
 <div class="switchrow"><label><input type="checkbox" id="reliqAnimated"> Musical articulation</label><label><input type="checkbox" id="reliqCrown"> Answering crown</label></div>
 <div class="switchrow"><label><input type="checkbox" id="reliqMicro"> Fine lace</label><label><input type="checkbox" id="reliqEmbroidery"> Cloth embroidery</label></div>
 <div class="switchrow"><label><input type="checkbox" id="reliqCorona"> Cyan corona</label><label><input type="checkbox" id="reliqJewels"> Faceted gems</label></div>
 <div class="switchrow"><label><input type="checkbox" id="reliqMedia"> Chamber video panels</label></div>
 <p class="footnote">These are saved per-take design choices. Perform live with the six Auto faders or Gesture Deck. Disabling a visual role does not mute the audible mix.</p>
 <div class="section-label">MOTION CHARACTER <span class="reliq-pill">SAVED ARRANGEMENT</span></div>
 <div class="switchrow"><label><input type="checkbox" id="artEnabled"> Elastic articulation</label><label><input type="checkbox" id="artOrbit"> Musical camera arcs</label></div>
 <div class="switchrow"><label><input type="checkbox" id="artPalette"> Flowing palette</label></div>
 <div class="edit-grid">
 <label class="edit-label">SHAPE / SUSTAIN<input id="artShape" type="number" min="0" max="1" step=".01"></label>
 <label class="edit-label">ATTACK / RECOIL<input id="artRebound" type="number" min="0" max="1" step=".01"></label>
 <label class="edit-label">FILIGREE FLOW<input id="artFlow" type="number" min="0" max="1" step=".01"></label>
 <label class="edit-label">PALETTE TRAVEL<input id="artColor" type="number" min="0" max="1" step=".01"></label>
 <label class="edit-label">ORBIT WIDTH<input id="artWidth" type="number" min="0" max="1" step=".01"></label><label class="edit-label">MOVEMENT BREADTH<input id="artBreadth" type="number" min="0" max="1" step=".01"></label><label class="edit-label">CAMERA SURGE<input id="artCameraSurge" type="number" min="0" max="1" step=".01"></label></div>
 <div class="edit-grid"><button id="artCalm">Restrained baseline</button><button id="artExpressive" class="primary">Elastic performance</button></div>
 <p class="footnote">Movement breadth treats the current feel as the floor and lets peaks surge toward a much larger range. Camera surge increases orbit speed and arc size at those peaks. These settings rescore the arrangement; play live with the existing momentary Motion/Radiance faders.</p>
 <div class="section-label">ATTACK / SUSTAIN / RECOIL</div><div id="artTrace" class="micro-status"></div>
 <div class="section-label">WHY THE FIGURE MOVES</div><div id="reliqRoles"></div>
 <div id="reliqStats" class="micro-status">Preparing original Atelier geometry…</div>
 <p class="footnote">Role names come from stem labels. Events are measured onset candidates—not certified beats, lyrics, facial speech or cloth physics.</p>`;
 for(const role of R.roles){const div=document.createElement('div');div.className='reliq-role';div.innerHTML=`<label><input type="checkbox" id="rr-${role.id}"><b>${role.label}</b><output id="rv-${role.id}">0.00</output></label><div class="reliq-meter"><i id="rm-${role.id}"></i></div><small>${role.target}</small><small id="rs-${role.id}" class="muted"></small>`;host.querySelector('#reliqRoles').appendChild(div);$('rr-'+role.id).onchange=e=>apply({roles:{[role.id]:e.target.checked}});}
 function apply(p){try{R.patch(h.state(),p);h.changed();}catch(e){h.toast(e.message,true);refresh();}}
 const select={reliqFrame:'framing',reliqFocus:'focus',reliqDefocus:'defocus',artShape:'shapeAmount',artRebound:'rebound',artFlow:'flowAmount',artColor:'colorAmount',artWidth:'orbitWidth',artBreadth:'breadthAmount',artCameraSurge:'cameraSurge'};
 for(const [id,key]of Object.entries(select))$(id).onchange=e=>apply({[key]:['defocus','shapeAmount','rebound','flowAmount','colorAmount','orbitWidth','breadthAmount','cameraSurge'].includes(key)?Number(e.target.value):e.target.value});
 const toggles={reliqAnimated:'animated',reliqCrown:'crown',reliqMicro:'micro',reliqEmbroidery:'embroidery',reliqCorona:'corona',reliqJewels:'jewels',reliqMedia:'roomMedia',artEnabled:'articulation',artOrbit:'orbitInstrument',artPalette:'paletteMotion'};
 for(const [id,key]of Object.entries(toggles))$(id).onchange=e=>apply({[key]:e.target.checked});
 $('artCalm').onclick=()=>apply({articulation:false,orbitInstrument:false,paletteMotion:false,regional:false,ribbons:false});
 $('artExpressive').onclick=()=>apply({articulation:true,orbitInstrument:true,paletteMotion:true,regional:true,ribbons:true,shapeAmount:.92,rebound:.8,flowAmount:.85,colorAmount:.58,orbitWidth:.72,breadthAmount:1,cameraSurge:.9});
 $('reliqVisit').onclick=()=>{window.HapaStudio.setWorld('celestial-reliquary');h.toast('Reliquary single-world view. Passage timing is retained; re-enable the tour in Passages.');};
 $('reliqJourney').onclick=()=>{const b=h.state().passages?.bridges.findLast(x=>x.to==='celestial-reliquary');if(!b){h.toast('This approved take has no Reliquary arrival. Its existing routes were preserved.',true);return;}window.HapaStudio.passages.setEnabled(true);window.HapaStudio.passages.rehearse(b.id);};
 function refresh(){const c=h.state().reliquary;for(const [id,key]of Object.entries(select))$(id).value=c[key];for(const [id,key]of Object.entries(toggles))$(id).checked=c[key];for(const r of R.roles)$('rr-'+r.id).checked=c.roles[r.id];}
 function tick(t){if(!host.classList.contains('active'))return;const d=R.evaluate(h.cache(),h.state(),t);for(const r of R.roles){const tr=d.trace[r.id];$('rv-'+r.id).textContent=tr.final.toFixed(2);$('rm-'+r.id).style.width=(tr.final*100)+'%';$('rs-'+r.id).textContent=tr.inputs.map(i=>`${i.id}: ${i.availability}${i.enabled?'':' / disabled'}`).join(' · ');}
  const k=d.kinetics,camera=h.renderer().lastFrame?.cam?.instrument;
  $('artTrace').textContent=`Voice attack ${k.voice.attack.toFixed(2)} / sustain ${k.voice.sustain.toFixed(2)}\nBass mass ${k.bass.mass.toFixed(2)} / drum elastic ${k.drum.strike.toFixed(2)}\nGold pluck ${d.trimPluck.toFixed(3)} / body recoil ${d.bodyRecoil.toFixed(3)} world units\nOrbit phase ${d.orbitPhase.toFixed(2)} rad / phase speed ${d.cameraSpeed.toFixed(3)} rad per song-second${camera?' / active arc':' / route or static view'}`;
  const s=h.renderer().reliquaryStats;const latest=s?.time!==undefined&&Math.abs(s.time-t)<.05;
  $('reliqStats').textContent=latest?`${Math.round(s.triangles).toLocaleString()} triangles · ${s.msaaSamples}× MSAA\nFocus ${s.focusDistance.toFixed(2)} world units · ${s.incoming?'incoming portal view':'current view'}\nNo reference-image textures · shared color/emission/depth`:'The Reliquary is available as a destination. Role meters use current song time even while another world is visible.';
 }
 refresh();return{refresh,tick,dispose(){host.innerHTML='';}};
};

