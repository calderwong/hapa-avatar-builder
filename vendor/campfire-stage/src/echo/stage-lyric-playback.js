// Visual-only phrase envelopes. The original playback, score, vocal times,
// event crossings and ordinary subtitle queries are never changed.
export function withReadablePhraseLead(playback, extraLeadSeconds = 0.94, stageDirection = null, lyricLines = []) {
  const extra = Math.max(0, Math.min(3, Number(extraLeadSeconds) || 0));
  // Echo's controller always looks ahead another 0.4s. When authored, this
  // field specifies total anticipation, subject to that existing minimum.
  const readable = playback.score.phrases.filter(p => p.end > p.start).flatMap(p=>{
    const setting=stageDirection?.at(p.start);
    // Legacy/saved directions retain their existing burst behavior. Only an
    // explicitly authored visual burst envelope opts into this treatment.
    if(p.burst&&setting?.burstLeadSeconds==null&&setting?.burstHoldSeconds==null&&setting?.burstReleaseSeconds==null)return [];
    const requested=p.burst?setting?.burstLeadSeconds:setting?.readingLeadSeconds;
    const cue=playback.score.cues.find(c=>p.start>=c.start&&p.start<c.end);
    const nextPhrase=playback.score.phrases.filter(other=>other.id!==p.id&&other.start>=p.end).reduce((n,other)=>Math.min(n,other.start),Infinity);
    const nextLine=lyricLines.filter(line=>line.start>=p.end).reduce((n,line)=>Math.min(n,line.start),Infinity);
    // A burst fragment may dissolve briefly under the following normal
    // subtitle. Readable sustained text retains the next-line boundary.
    return [{phrase:p,extra:requested==null?(p.burst?0:extra):Math.max(0,Math.min(3.6,requested-0.4)),hold:(p.burst?setting?.burstHoldSeconds:setting?.readingHoldSeconds)??0,release:(p.burst?setting?.burstReleaseSeconds:setting?.readingReleaseSeconds)??0,limit:Math.min(cue?.end??Infinity,nextPhrase,p.burst?Infinity:nextLine,playback.score.durationSeconds??Infinity)}];
  });
  return {
    ...playback,
    stateAt(time) {
      const state = playback.stateAt(time);
      if (state.phrase) {
        if(state.phrase.burst&&readable.some(entry=>entry.phrase.id===state.phrase.id))return {...state,calm:Math.max(state.calm,.85)};
        return state;
      }
      const next = readable.find(({phrase:p,extra:lead}) => time >= p.start - lead && time < p.start);
      if(next)return { ...state, phrase: { ...next.phrase, progress: 0, visualAnticipation: true }, calm: Math.max(state.calm, 0.85) };
      const held=readable.find(({phrase:p,hold,release,limit})=>time>=p.end&&time<Math.min(limit,p.end+hold+release));
      if(!held)return state;
      const elapsed=time-held.phrase.end,progress=held.release>0?Math.max(0,Math.min(1,(elapsed-held.hold)/held.release)):0;
      const fade=1-progress*progress*(3-2*progress);
      return { ...state, phrase:{...held.phrase,progress:1,visualExtension:true,visualRelease:fade},calm:Math.max(state.calm,0.85) };
    }
  };
}
