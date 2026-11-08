// Analytic song-time equivalent of a first-order exposure response. It has no
// wall-clock or render-cadence state, so pausing or revisiting a time preserves
// the same lighting. Only canonical readable phrase intervals affect it.
export function createSongExposure(phrases, { normal=9.5, reading=7, tauSeconds=0.45 } = {}) {
  if (!Number.isFinite(tauSeconds) || tauSeconds <= 0) throw new RangeError('Exposure response must be positive.');
  const events=[];
  for (const p of phrases || []) {
    if (p.burst || !Number.isFinite(p.start) || !Number.isFinite(p.end) || p.end <= p.start || p.end <= 0) continue;
    events.push({ t:Math.max(0,p.start), delta:1 }, { t:p.end, delta:-1 });
  }
  events.sort((a,b)=>a.t-b.t || b.delta-a.delta);
  return (time) => {
    const t=Math.max(0,Number(time)||0);let value=normal,target=normal,last=0,active=0;
    for (const event of events) {
      if (event.t>t) break;
      value=target+(value-target)*Math.exp(-(event.t-last)/tauSeconds);
      active+=event.delta;target=active>0?reading:normal;last=event.t;
    }
    return target+(value-target)*Math.exp(-(t-last)/tauSeconds);
  };
}
