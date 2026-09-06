import { echoLyricFrameTime } from './echo-lyric-template-runtime.js';
import { echoLyricBoundary } from './echo-lyric-time.js';

/** Build an immutable interval index once per lyric revision. Overlapping lines
 * retain the existing last-source-row selection rule. No timing is invented. */
export function prepareEchoLyricIntervals(lines = []) {
  const rows = lines.map((line, index) => ({ line, index, start: echoLyricBoundary(line, 'start', NaN), end: echoLyricBoundary(line, 'end', NaN) }))
    .filter(row => Number.isFinite(row.start) && Number.isFinite(row.end) && row.end > row.start)
    .sort((a, b) => a.start - b.start || a.index - b.index);
  let maximumEnd = -Infinity;
  for (const row of rows) { maximumEnd = Math.max(maximumEnd, row.end); row.maximumEnd = maximumEnd; }
  return { rows, invalidIntervals: lines.length - rows.length };
}
export function echoLyricIntervalAt(prepared, time) {
  const rows = prepared.rows;
  let low = 0, high = rows.length;
  while (low < high) { const mid = (low + high) >>> 1; if (rows[mid].start <= time) low = mid + 1; else high = mid; }
  let selected = null;
  for (let index = low - 1; index >= 0 && rows[index].maximumEnd > time; index--) {
    const row = rows[index];
    if (row.end > time && (!selected || row.index > selected.index)) selected = row;
  }
  return selected?.line || null;
}

/** Audio time drives frames. RAF only schedules observation; it never integrates
 * its elapsed time into the song clock. Paused seeks are sampled on resubscribe. */
export function observeEchoLyricClock({ getTime, fps = 30, active = true, onFrame,
  requestFrame = globalThis.requestAnimationFrame, cancelFrame = globalThis.cancelAnimationFrame } = {}) {
  let token = null, stopped = false, previous = -1;
  const sample = () => {
    token = null; if (stopped) return;
    const clock = echoLyricFrameTime(getTime(), fps);
    if (clock.frame !== previous) { previous = clock.frame; onFrame(clock.frame); }
    if (active && !stopped) token = requestFrame(sample);
  };
  sample();
  return () => { stopped = true; if (token !== null) cancelFrame(token); token = null; };
}
