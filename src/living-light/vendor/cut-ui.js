
/* The editorial desk. Calls the same validated methods exposed to local agents. */
'use strict';
window.HapaCutUI=function(h){
 const $=id=>document.getElementById(id),E=HapaEditorial,M=HapaMath,D=HapaDirector;
 const esc=x=>String(x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const run=fn=>{try{const result=fn();if(result?.catch)result.catch(e=>h.toast(e.message,true));}catch(e){h.toast(e.message,true)}};
 function refresh(){
  const st=h.state(),s=st.director.shots[h.selected()]||st.director.shots[0];if(!s)return;
  $('cutSelected').textContent=`${String(h.selected()+1).padStart(2,'0')} / ${st.director.shots.length} · ${s.start.toFixed(1)}–${s.end.toFixed(1)} s`;
  $('cutLabel').value=s.label;$('cutStart').value=s.start;$('cutRig').value=s.rig;$('cutPalette').value=s.palette||'inherit';
  $('cueSlot').value=s.media?.slot||'A';$('cueIn').value=s.media?.sourceIn??0;$('cueOut').value=s.media?.sourceOut??12;$('cueRate').value=s.media?.rate??1;$('cuePolicy').value=s.media?.policy||'loop';$('cuePortal').checked=!!s.media?.portal;
  for(const k of ['shot','camera','look','media'])$('protect-'+k).checked=!!s.locks?.[k];
  $('cutEvidence').textContent=s.cueBasis||'Authored cue';
  $('takesSelect').innerHTML=st.cut.takes.map(t=>`<option value="${t.id}" ${t.id===st.cut.active?'selected':''}>${esc(t.name)}</option>`).join('');
  const old=$('compareSelect').value;$('compareSelect').innerHTML=st.cut.takes.filter(t=>t.id!==st.cut.active).map(t=>`<option value="${t.id}">${esc(t.name)}</option>`).join('');if([...$('compareSelect').options].some(o=>o.value===old))$('compareSelect').value=old;
  $('compareButton').disabled=st.cut.takes.length<2;
  $('mediaTrack').innerHTML=st.director.shots.map((q,i)=>`<button data-cue="${i}" class="media-cue ${q.media.slot==='B'?'warm':''}" style="flex:${q.end-q.start}" title="${esc(q.label)}: slot ${q.media.slot}, source ${q.media.sourceIn.toFixed(1)}–${q.media.sourceOut.toFixed(1)}s, ${q.media.policy}">${q.locks?.shot?'◆ ':''}${q.media.portal?'◉ ':''}${q.media.slot} · ${q.media.sourceIn.toFixed(1)}s</button>`).join('');
  $('mediaTrack').querySelectorAll('[data-cue]').forEach(b=>b.onclick=()=>{h.select(+b.dataset.cue);h.seek(st.director.shots[+b.dataset.cue].start+.1);openTab('cut');refresh();});
  $('timelineNote').textContent=`${st.director.shots.length} evidence-guided shots · full-song coverage · source-time cues · not inferred musical sections`;
  const slot=$('arrangeSlot').value||'A',l=st.cut.layout[slot];for(const k of ['x','y','z','scale','yaw']){$('arrange-'+k).value=l[k];$('arrange-o-'+k).value=l[k].toFixed(2);}
  $('cutTitle').textContent=st.cut.takes.find(t=>t.id===st.cut.active)?.name||'Director’s cut';
  $('punchStatus').textContent=st.cut.punch!==null?'Recording ONLY within the armed song range. Finish to commit.':`${st.director.punches?.length||0} non-destructive punch layers`;
 }
 function openTab(id){document.querySelectorAll('[data-tab]').forEach(b=>b.classList.toggle('active',b.dataset.tab===id));document.querySelectorAll('.tab').forEach(b=>b.classList.toggle('active',b.id===id));}
 function edit(){return h.editShot(h.state().director.shots[h.selected()].id,{label:$('cutLabel').value,start:+$('cutStart').value,rig:$('cutRig').value,palette:$('cutPalette').value,media:{slot:$('cueSlot').value,sourceIn:+$('cueIn').value,sourceOut:+$('cueOut').value,rate:+$('cueRate').value,policy:$('cuePolicy').value,portal:$('cuePortal').checked}});}
 function fill(){
  $('cutRig').innerHTML=D.rigs.map(r=>`<option>${r}</option>`).join('');$('cutPalette').innerHTML='<option value="inherit">Inherit world palette</option>'+HapaCore.palettes.map(p=>`<option value="${p.id}">${esc(p.name)}</option>`).join('');
  $('punchParam').innerHTML=D.defs.map(d=>`<option value="${d.id}">${d.label}</option>`).join('');
  $('applyCut').onclick=()=>run(()=>{edit();h.toast('Shot and source-time cue saved.');refresh()});
  for(const k of ['shot','camera','look','media'])$('protect-'+k).onchange=e=>run(()=>{const s=h.state().director.shots[h.selected()];h.lockShot(s.id,k,e.target.checked);refresh();});
  $('takesSelect').onchange=e=>run(()=>{h.selectTake(e.target.value);refresh()});
  $('forkAmbient').onclick=()=>run(()=>{h.fork('ambient');refresh();h.toast('New long-exposure take. Protected decisions retained.');});
  $('forkRhythm').onclick=()=>run(()=>{h.fork('performance');refresh();h.toast('New rhythm study. Same timing; different unlocked camera, media and look.');});
  $('undoCut').onclick=()=>run(()=>{h.undo(false);refresh()});$('redoCut').onclick=()=>run(()=>{h.undo(true);refresh()});
  $('compareButton').onclick=()=>run(compare);
  $('punchShot').onclick=()=>{const s=h.state().director.shots[h.selected()];$('punchStart').value=s.start;$('punchEnd').value=s.end;};
  $('armPunch').onclick=()=>run(()=>{h.beginPunch($('punchParam').value,+$('punchStart').value,+$('punchEnd').value);h.seek(+$('punchStart').value);refresh();h.toast('Punch armed. Press Play and perform the selected fader.');});
  $('finishPunch').onclick=()=>run(()=>{h.endPunch();refresh();h.toast('Punch retained; original lane outside its range is untouched.');});
  $('arrangeSlot').onchange=refresh;
  for(const k of ['x','y','z','scale','yaw'])$('arrange-'+k).onchange=e=>run(()=>{h.layout($('arrangeSlot').value,{[k]:+e.target.value});refresh();});
  $('resetArrange').onclick=()=>run(()=>{h.layout($('arrangeSlot').value,{x:0,y:0,z:0,scale:1,yaw:0});refresh();});
  $('exportJob').onclick=()=>run(async()=>{const job=await h.job({width:1280,height:720,fps:24});h.download('hapa-render-job.json',job);$('jobStatus').textContent=`FROZEN JOB · ${job.frames} frames · ${job.digest.slice(0,14)}\nUse tools/export_video.py --job hapa-render-job.json. Nothing uploaded.`;});
  $('preflightBtn').onclick=()=>run(()=>{$('jobStatus').textContent=JSON.stringify(h.preflight(),null,2);});
  setupGizmo();refresh();
 }
 async function compare(){
  const target=$('compareSelect').value;if(!target)return;const api=window.HapaStudio,t=h.time(),playing=h.playing(),active=h.state().cut.active,report=E.diff(h.state(),target);h.pause();
  const images=[];
  try{for(const id of [active,target]){h.selectTake(id);await api.renderAt(t,{width:480,height:270});images.push({name:h.state().cut.takes.find(x=>x.id===id).name,url:document.getElementById('canvas').toDataURL('image/jpeg',.87)});}}
  finally{h.selectTake(active);await api.renderAt(t,{width:800,height:450});api.resumePreview();if(playing)h.play();refresh();}
  h.modal(`<h2>Same song. Same instant. Different decisions.</h2><p>Captured at ${t.toFixed(3)} song seconds. These are rendered comparisons, not additional playing streams.</p><div class="compare-grid">${images.map(im=>`<figure><img src="${im.url}"><figcaption>${esc(im.name)}</figcaption></figure>`).join('')}</div><p>${report.sameBounds?'Shot timing is identical.':''} ${report.changes.length} shots differ. Protected shot fields were preserved when the take was created.</p><div class="compare-diff">${report.changes.map(x=>`<p><b>${esc(x.label)}</b>: ${x.changes.join(', ')}</p>`).join('')||'No editorial differences.'}</div>`);
 }
 function tick(t){const st=h.state();if(!st.cut)return;const f=E.frame(st,t),m=h.media(),slot=m.slots[f.slot];const v=slot?E.sourceTime(st,f.slot,t,slot.duration):null;$('cueLive').textContent=`SONG ${t.toFixed(2)}s → ${f.slot} SOURCE ${v?.target.toFixed(2)||'—'}s · ${f.cue.policy} ${f.cue.rate.toFixed(2)}×${v&&!v.valid?' · RANGE MISMATCH':''}`;
  $('portalLive').textContent=`PORTAL ${Math.round(f.portal*100)}% · ${f.fullBlend>.99?'FULL-FRAME MEDIA':'SPATIAL SCENE'}${f.shot.locks?.camera?' · FROZEN CAMERA':''}`;
  const arrange=$('arrange').classList.contains('active'),g=$('arrangeGizmo');g.hidden=!arrange;if(arrange){const surf=h.renderer().surfaceTransforms?.find(s=>s.logical===$('arrangeSlot').value),cam=h.frame()?.cam;if(surf&&cam){const p=M.transform(cam.pv,[...surf.pos,1]);g.style.left=(p[0]/p[3]*.5+.5)*100+'%';g.style.top=(.5-p[1]/p[3]*.5)*100+'%';g.hidden=p[3]<=0;g.textContent=$('arrangeSlot').value;}}
 }
 function setupGizmo(){const g=$('arrangeGizmo');let drag;
  function hit(e,cam,center,normal){const r=$('canvas').getBoundingClientRect(),x=((e.clientX-r.left)/r.width*2-1)*r.width/r.height*Math.tan(cam.fov/2),y=(1-(e.clientY-r.top)/r.height*2)*Math.tan(cam.fov/2),ray=M.norm(M.add(cam.forward,M.add(M.scale(cam.right,x),M.scale(cam.up,y))));const den=M.dot(ray,normal);if(Math.abs(den)<.001)return null;const dist=M.dot(M.sub(center,cam.eye),normal)/den;return M.add(cam.eye,M.scale(ray,dist));}
  g.onpointerdown=e=>run(()=>{e.stopPropagation();const st=h.state(),cf=E.frame(st,h.time());if(cf.shot.locks?.shot)throw Error('This shot protects its arrangement.');const slot=$('arrangeSlot').value,s=h.renderer().surfaceTransforms.find(s=>s.logical===slot),cam=h.frame().cam,normal=[Math.sin(s.angles[1]),0,Math.cos(s.angles[1])],p=hit(e,cam,s.pos,normal);if(!p)return;E.checkpoint(st,'Drag surface '+slot);drag={slot,center:s.pos,normal,p,cam,l:{...st.cut.layout[slot]}};g.setPointerCapture(e.pointerId);});
  g.onpointermove=e=>run(()=>{if(!drag)return;e.stopPropagation();const p=hit(e,drag.cam,drag.center,drag.normal);if(p){const d=M.sub(p,drag.p);E.layoutEdit(h.state(),drag.slot,{x:E.clamp(drag.l.x+d[0],-3,3),y:E.clamp(drag.l.y+d[1],-2,2),z:E.clamp(drag.l.z+d[2],-2,2)});h.mark();}});
  g.onpointerup=()=>{if(drag){E.saveActive(h.state());drag=null;refresh();}};
 }
 fill();return{refresh,tick,openTab};
};

