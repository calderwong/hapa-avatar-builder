/* Native 109 view controls, stored per take. Existing itinerary is never rewritten. */
'use strict';
(()=>{const previous=HapaReliquaryUI;window.HapaReliquaryUI=function(h){
 const base=previous(h),J=HapaJourney,$=id=>document.getElementById(id),card=document.createElement('section');
 card.id='journeyDesk';card.className='range-desk';
 card.innerHTML=`<div class="section-label">TUNNEL WORLDS <span class="reliq-pill">109</span></div>
 <p class="hint">Stay inside the fractal architecture. No scenic stops. Or bring the Before the first step figure into the journey.</p>
 <label class="edit-label">EXPERIENCE<select id="journeyMode"><option value="standard">Standard · saved tour</option><option value="tunnel">Tunnel Mode · non-stop</option><option value="avatar">Tunnel + Avatar · experimental</option></select></label>
 <label class="edit-label">TUNNEL FAMILY<select id="journeyFamily"><option value="auto">Evolving mix · returns to fractal</option>${J.families.map(f=>`<option value="${f.id}">${f.name}</option>`).join('')}</select></label>
 <p id="journeyDescription" class="micro-status"></p>
 <label class="edit-label" id="journeyAvatarRow">AVATAR TREATMENT<select id="journeyAvatar"><option value="apparition">Passing apparition · no stopping</option><option value="traveler">Traveler · guide ahead of you</option></select></label>
 ${[['speed','Travel speed',.4,2],['variety','Family variation',0,1],['drift','Camera drift',0,1],['intensity','Rib radiance',0,1]].map(([k,n,a,b])=>`<label class="range-head" for="journey-${k}">${n}<output id="journeyValue-${k}"></output></label><input id="journey-${k}" type="range" min="${a}" max="${b}" step=".01" aria-label="${n}">`).join('')}
 <div class="edit-grid"><button id="journeyStart" class="primary">Start this journey ↗</button><button id="journeyReturn">Return to saved tour</button><button id="journeyBody">Fixed-light shape proof</button><button id="journeyInspectExit">Exit proof</button></div>
 <p id="journeyStatus" class="micro-status" aria-live="polite"></p>
 <details><summary>What changes / what stays</summary><p class="footnote">Standard leaves your original route untouched. Tunnel Modes replace only the active view, using one continuous source-time camera and no destination render. Family choice, speed and avatar settings are saved per take and undoable. The fluid family is a glass-like authored treatment, not a refraction simulation. The avatar uses the existing mesh and musical articulation. Reduced Motion freezes the journey view. Frame export follows the selected mode.</p><button id="journeyRecipe">Export journey recipe</button></details>`;
 $('perform').insertBefore(card,$('perform').firstChild);
 const run=fn=>{try{fn();}catch(e){h.toast(e.message,true);}};
 function change(p){J.patch(h.state(),p);h.changed();}
 function clear(){delete h.state()._journeyInspect;delete h.state()._journeyFreeze;delete h.state()._stageInspect;delete h.state()._elementInspect;delete h.state()._geometryProof;}
 $('journeyMode').onchange=e=>run(()=>{clear();change({mode:e.target.value});});
 $('journeyFamily').onchange=e=>run(()=>change({family:e.target.value}));
 $('journeyAvatar').onchange=e=>run(()=>change({avatarStyle:e.target.value}));
 for(const k of ['speed','variety','drift','intensity']){$('journey-'+k).oninput=e=>{$('journeyValue-'+k).textContent=Number(e.target.value).toFixed(2);};$('journey-'+k).onchange=e=>run(()=>change({[k]:Number(e.target.value)}));}
 $('journeyReturn').onclick=()=>run(()=>{clear();change({mode:'standard'});h.toast('Original tour restored. Its departure/arrival schedule was never changed.');});
 $('journeyStart').onclick=async()=>{try{clear();if(J.config(h.state()).mode==='standard')change({mode:'tunnel'});await HapaStudio.seek(0);HapaStudio.resumePreview();await HapaStudio.play();}catch(e){h.toast(e.message,true);}};
 $('journeyBody').onclick=()=>run(()=>{if(J.config(h.state()).mode==='standard')change({mode:'tunnel'});h.state()._journeyInspect='body';h.mark();});
 $('journeyInspectExit').onclick=()=>{clear();h.mark();};
 $('journeyRecipe').onclick=()=>{const a=document.createElement('a'),url=URL.createObjectURL(new Blob([JSON.stringify({schema:'hapa.journey.recipe/1',config:J.config(h.state())},null,2)],{type:'application/json'}));a.href=url;a.download='hapa-journey-109.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);};
 function readout(){const c=J.config(h.state()),q=h.renderer().journeyStats;
  $('journeyAvatarRow').hidden=c.mode!=='avatar';$('journeyDescription').textContent=J.families.find(f=>f.id===c.family)?.description||'Long evolving chapters; the fractal-wall anchor returns between contrasting forms.';
  $('journeyStatus').textContent=q?.active?`${q.name} · chapter ${q.chapter} · ${q.z.toFixed(1)} units · ${q.actorTriangles?'3D avatar / '+q.subject.style:'continuous tunnel'}${h.state().reduced?' · Reduced Motion / still composition':''}${q.geometryProof?' · FIXED-LIGHT PROOF':''}`:'Standard tour active · choose Tunnel Mode to begin';
 }
 function refresh(){base.refresh();const c=J.config(h.state());$('journeyMode').value=c.mode;$('journeyFamily').value=c.family;$('journeyAvatar').value=c.avatarStyle;for(const k of ['speed','variety','drift','intensity']){if(document.activeElement!==$('journey-'+k))$('journey-'+k).value=c[k];$('journeyValue-'+k).textContent=c[k].toFixed(2);}readout();}
 refresh();return{refresh,tick(t){base.tick(t);if($('perform').classList.contains('active'))readout();},dispose(){base.dispose();card.remove();}};
};})();
