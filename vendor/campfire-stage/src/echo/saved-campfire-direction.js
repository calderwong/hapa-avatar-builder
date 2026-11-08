import { validateCampfireDirection, resolveCampfireSettings } from './campfire-direction.js';

// Stage choreography is resolved against Echo's existing score; it does not
// modify the score or audio. The saved extension must identify its parent.
export function buildCampfireDirection(packet, extension) {
  const cues = packet.score.cues;
  const options = { durationSeconds: packet.timeline.durationSeconds, cueIds: cues.map(c => c.id) };
  const validation = validateCampfireDirection(extension, options);
  if (!validation.ok) throw Object.assign(new Error('Invalid Campfire direction.'), { validation });
  const values = cues.map(c => resolveCampfireSettings(extension, c.id, options));
  const lerp = (a,b,t) => a+(b-a)*t;
  const smooth = (a,b,v) => { const x=Math.max(0,Math.min(1,(v-a)/(b-a))); return x*x*(3-2*x); };
  return { extension, at(t) {
    let i=cues.findIndex(c=>t>=c.start&&t<c.end);
    if(i<0)i=t>=cues[cues.length-1].end?cues.length-1:0;
    const curr=values[i],prev=values[Math.max(0,i-1)];
    const s=smooth(0,2,t-cues[i].start), ending=extension.ending;
    const progress=Math.max(0,Math.min(1,(t-cues[i].start)/(cues[i].end-cues[i].start)));
    const curve=curr.development;
    const multiplier=key=>{
      if(!curve)return 1;
      let j=curve.findIndex(point=>point.at>=progress);if(j<=0)return curve[0][key]??1;
      const a=curve[j-1],b=curve[j],u=smooth(a.at,b.at,progress);
      return lerp(a[key]??1,b[key]??1,u);
    };
    return { reach:Math.min(2,lerp(prev.plume.reach,curr.plume.reach,s)*multiplier('reach')), smoke:Math.min(2,lerp(prev.plume.smoke,curr.plume.smoke,s)*multiplier('smoke')),
      participation:Math.min(1,lerp(prev.formation.participation,curr.formation.participation,s)*multiplier('participation')), groundAsh:lerp(prev.environment.groundAsh,curr.environment.groundAsh,s), accents:lerp(prev.environment.accents,curr.environment.accents,s), boundary:lerp(prev.formation.boundary,curr.formation.boundary,s), distanceScale:lerp(prev.camera.distanceScale,curr.camera.distanceScale,s), pitchOffset:lerp(prev.camera.pitchOffset,curr.camera.pitchOffset,s),
      release:ending ? 1-smooth(ending.releaseStart,ending.fadeStart,t) : 1,
      dustVisibility:ending ? 1-smooth(ending.fadeStart,ending.fadeEnd,t) : 1,
      // Absence preserves the original Campfire anticipation. A cue override
      // takes precedence over the optional extension default.
      readingLeadSeconds:extension.cues?.find(c=>c.cueId===cues[i].id)?.settings?.reading?.leadSeconds ?? extension.defaults?.reading?.leadSeconds ?? null,
      readingHoldSeconds:extension.cues?.find(c=>c.cueId===cues[i].id)?.settings?.reading?.holdSeconds ?? extension.defaults?.reading?.holdSeconds ?? null,
      readingReleaseSeconds:extension.cues?.find(c=>c.cueId===cues[i].id)?.settings?.reading?.releaseSeconds ?? extension.defaults?.reading?.releaseSeconds ?? null,
      readingClearance:extension.cues?.find(c=>c.cueId===cues[i].id)?.settings?.reading?.clearance ?? extension.defaults?.reading?.clearance ?? null,
      construction:extension.cues?.find(c=>c.cueId===cues[i].id)?.settings?.construction ?? extension.defaults?.construction ?? null,
      cueId:cues[i].id, motif:curr.motif==='open-ring'?'open-ring':null, ringVariant:i };
  }};
}

export function readSavedCampfireDirection(packet) {
  const extension=packet.direction?.campfire;
  if (extension === undefined) return { status:'absent', direction:null };
  try {
    const b=extension?.binding;
    if (b?.songId !== packet.timeline?.source?.songId || String(b?.masterSha256 || '').toLowerCase() !== String(packet.timeline?.source?.sourceSha256 || '').toLowerCase() ||
        b?.scoreFingerprint !== packet.score?.fingerprint || b?.baseRevision + 1 !== packet.sourceRevision)
      throw new Error('Saved Campfire direction does not match this song, master, score, or revision.');
    return { status:'saved', direction:buildCampfireDirection(packet,extension) };
  } catch (error) {
    return { status:'invalid', direction:null, error:error.message };
  }
}
