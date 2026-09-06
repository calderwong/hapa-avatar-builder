const list = value => Array.isArray(value) ? value : [];
const EPSILON = 1e-7;
const rank = (seed, value) => {
  let result = 2166136261;
  for (const char of `${seed}:${value}`) result = Math.imul(result ^ char.codePointAt(0), 16777619) >>> 0;
  return result;
};
const lowerBound = (rows, time) => {
  let low = 0, high = rows.length;
  while (low < high) { const middle = (low + high) >>> 1; if (rows[middle].atSeconds < time) low = middle + 1; else high = middle; }
  return low;
};

/** Move shared boundaries only. Audio, lyrics, media order and outer edges are
 * untouched. Canonical cue permission is required; proximity to a beat/phrase
 * or a high onset score alone never grants permission to cut. */
export function reflowEchoCueBoundaries({ slots, cueGraph, recipe, seed = '', mode = 'preserve', locks = [] }) {
  if (!['preserve', 'supported-cues'].includes(mode)) throw new Error('Choose preserved timing or supported-cue timing.');
  const receipt = { schemaVersion: 'hapa.echo.cue-reflow.v1', mode, cueGraphId: cueGraph?.cueGraphId || cueGraph?.id || null, movedBoundaries: [], decisions: [], limitations: [] };
  if (mode === 'preserve') return { slots, receipt };
  const maxShift = Number(recipe?.timing?.maxShiftSeconds ?? .18);
  const minimumShot = Number(recipe?.timing?.minimumShotSeconds ?? .75);
  if (!(maxShift > 0 && maxShift <= .25 && minimumShot >= .25 && minimumShot <= 10)) throw new Error('Timing reflow requires a finite shift up to 0.25s and a minimum shot of 0.25–10s.');
  if (slots.length > 4096 || list(cueGraph?.cues).length > 20000) throw new Error('Timing reflow exceeds the bounded cue workspace. Select a smaller prepared range.');
  if (slots.some(slot => !Number.isFinite(slot.startSeconds) || !Number.isFinite(slot.endSeconds) || slot.startSeconds < 0 || slot.endSeconds <= slot.startSeconds)) throw new Error('Timing reflow requires finite, increasing shot intervals.');
  const cues = cueGraph?.schemaVersion === 'hapa.echo.cue-graph.v2' ? list(cueGraph.cues).filter(cue => cue.approved === true
    && list(cue.eligibleActions).includes('cut') && typeof cue.source === 'string' && cue.source.length && cue.id
    && Number.isFinite(cue.atSeconds) && Number.isFinite(cue.toleranceSeconds) && cue.toleranceSeconds > 0)
    .map(cue => ({ ...cue })).sort((a, b) => a.atSeconds - b.atSeconds || String(a.id).localeCompare(String(b.id))) : [];
  receipt.maxShiftSeconds = maxShift;
  receipt.minimumShotSeconds = minimumShot;
  if (!cues.length) receipt.limitations.push('No approved cut-enabled cues are available; source timing is preserved.');
  const result = slots.map(slot => ({ ...slot }));
  const phraseWindows = list(cueGraph?.lyricCues).filter(row => Number.isFinite(row.startSeconds) && Number.isFinite(row.endSeconds));
  const sections = list(cueGraph?.sections);
  const sectionEdges = sections.flatMap(row => [row.startSeconds, row.endSeconds]).filter(Number.isFinite);
  const globalLock = locks.some(lock => lock.targetId === 'timing');
  const constrained = slot => list(slot.mediaConstraints?.requiredCharacterIds).length || list(slot.mediaConstraints?.requiredSceneIds).length;
  const lockReason = (left, right, from, to) => {
    if (globalLock || [left, right].some(slot => list(slot.locks).some(lock => ['timing', 'cut'].includes(lock)))) return 'cut-locked';
    if (constrained(left) || constrained(right)) return 'required-media-interval';
    if (locks.some(lock => ['cut', 'slot'].includes(lock.targetKind) && [String(left.id), String(right.id)].includes(String(lock.targetId)))) return 'cut-locked';
    const lo = Math.min(from, to), hi = Math.max(from, to);
    for (const row of phraseWindows) {
      const intersects = lo < row.endSeconds - EPSILON && hi > row.startSeconds + EPSILON;
      if (!intersects) continue;
      if (locks.some(lock => lock.targetKind === 'phrase' && String(lock.targetId) === String(row.id))) return 'phrase-locked';
      if (Math.abs(from - to) <= EPSILON) continue;
      const insideFrom = from > row.startSeconds + EPSILON && from < row.endSeconds - EPSILON;
      const insideTo = to > row.startSeconds + EPSILON && to < row.endSeconds - EPSILON;
      // An existing interruption may move onto an approved phrase edge. Do
      // not create a new interruption, move one within a phrase, or jump one.
      if (!(insideFrom && !insideTo)) return 'phrase-protected';
    }
    if (sectionEdges.some(edge => edge >= lo - EPSILON && edge <= hi + EPSILON)) return 'section-boundary-locked';
    if (locks.some(lock => lock.targetKind === 'section' && sections.some(section => String(section.id) === String(lock.targetId)
      && lo < section.endSeconds && hi > section.startSeconds))) return 'section-locked';
    return null;
  };
  let examined = 0;
  for (let index = 1; index < result.length; index += 1) {
    const left = result[index - 1], right = result[index], from = Number(slots[index].startSeconds);
    const decision = { leftSlotId: left.id, rightSlotId: right.id, fromSeconds: from, toSeconds: from, cueId: null, reason: 'no-supported-cue-within-tolerance' };
    receipt.decisions.push(decision);
    if (Math.abs(Number(slots[index - 1].endSeconds) - from) > EPSILON) { decision.reason = 'source-gap-or-overlap-preserved'; continue; }
    const fixed = lockReason(left, right, from, from);
    if (fixed) { decision.reason = fixed; continue; }
    const eligible = [];
    for (let i = lowerBound(cues, from - maxShift); i < cues.length && cues[i].atSeconds <= from + maxShift; i += 1) {
      if (++examined > 200000) throw new Error('Timing reflow exceeds its comparison budget. Select a smaller prepared range.');
      const cue = cues[i], to = cue.atSeconds, delta = Math.abs(to - from);
      if (delta <= EPSILON || delta > Math.min(maxShift, cue.toleranceSeconds) + EPSILON) continue;
      if (to - left.startSeconds < minimumShot - EPSILON || right.endSeconds - to < minimumShot - EPSILON) continue;
      if (lockReason(left, right, from, to)) continue;
      const priority = list(recipe?.timing?.preferredCueKinds).indexOf(cue.kind);
      eligible.push({ cue, delta, priority: priority < 0 ? 100 : priority, tie: rank(seed, cue.id) });
    }
    eligible.sort((a, b) => a.priority - b.priority || a.delta - b.delta || a.tie - b.tie || String(a.cue.id).localeCompare(String(b.cue.id)));
    const winner = eligible[0]?.cue;
    if (!winner) continue;
    left.endSeconds = winner.atSeconds; right.startSeconds = winner.atSeconds;
    Object.assign(decision, { toSeconds: winner.atSeconds, cueId: winner.id, cueSource: winner.source, cueKind: winner.kind,
      toleranceSeconds: winner.toleranceSeconds, reason: 'approved-cut-cue-within-bounds' });
    decision.phraseBoundaryRepairs = phraseWindows.filter(row => from > row.startSeconds + EPSILON && from < row.endSeconds - EPSILON
      && (winner.atSeconds <= row.startSeconds + EPSILON || winner.atSeconds >= row.endSeconds - EPSILON)).map(row => row.id);
    receipt.movedBoundaries.push({ ...decision });
  }
  receipt.comparisons = examined;
  if (cues.length && !receipt.movedBoundaries.length) receipt.limitations.push('No cut can move within the available cue tolerances and protected intervals; source timing is preserved.');
  return { slots: result, receipt };
}
