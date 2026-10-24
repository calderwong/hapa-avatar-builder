import { echoLyricResolvedWordIntervals } from './echo-lyric-template-runtime.js';

const epsilon = 1e-6;
const round = value => Math.round(value * 1e6) / 1e6;
const norm = value => String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');

// Match occurrences once, in sequence. Repeated words cannot reuse a transcript observation.
export function echoLyricTranscriptPairs(tokens, words) {
  const a = tokens.map(t => norm(t.text ?? t.word)), b = words.map(t => norm(t.text ?? t.word));
  const dp = Array.from({ length: a.length + 1 }, () => new Uint32Array(b.length + 1));
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--)
    dp[i][j] = a[i] && a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const pairs = []; let i = 0, j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] && a[i] === b[j]) { pairs.push([i++, j++]); }
    else if (dp[i + 1][j] >= dp[i][j + 1]) i++; else j++;
  }
  return pairs;
}

// Keep measured neighbours intact at crop joins. Ambiguous non-crop conflicts are held for review.
export function assembleEchoLyricIntervals({ lines, alignedWords, windows = [], duration, transcriptWords = [], allowCrossSourceBoundaryDemotion = false }) {
  const rows = lines.map((text, i) => ({ index: i, text, lineWords: alignedWords[i].map(w => ({ ...w })) }));
  const repairs = [];
  const hits = row => row.lineWords.filter(w => w.matched && Number.isFinite(w.start) && Number.isFinite(w.end) && w.end > w.start);
  for (const window of windows) {
    const i = window.lines[0];
    if (!i || !rows[i] || window.startSeconds === 0) continue;
    const current = hits(rows[i]), previous = hits(rows[i - 1]);
    const previousEnd = previous.at(-1)?.end;
    if (!current.length || !previous.length || current[0].start > window.startSeconds + .3 || window.startSeconds >= previousEnd) continue;
    for (const w of current) if (w.start < previousEnd - epsilon) {
      repairs.push({ line: i + 1, word: w.text, oldStart: w.start, oldEnd: w.end, previousLineEnd: previousEnd, runId: window.runId, reason: 'crop-prefix-overlaps-previous-line' });
      w.matched = false;
    }
  }
  if(allowCrossSourceBoundaryDemotion) for(let i=1;i<rows.length;i++) {
    const previous=hits(rows[i-1]),current=hits(rows[i]);if(!previous.length||!current.length)continue;
    const overlap=previous.at(-1).end-current[0].start;
    if(overlap>epsilon&&overlap<=.12){
      const word=current[0];repairs.push({line:i+1,word:word.text,oldStart:word.start,oldEnd:word.end,previousLineEnd:previous.at(-1).end,reason:'small-cross-source-boundary-disagreement'});word.matched=false;
    }
  }
  // Remove invalid/out-of-order anchors before computing coverage or line bounds.
  for (const row of rows) {
    let end = -Infinity;
    for (const w of row.lineWords) {
      if (!w.matched) continue;
      if (!Number.isFinite(w.start) || !Number.isFinite(w.end) || w.end <= w.start || w.start < end - epsilon) w.matched = false;
      else end = w.end;
    }
  }
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i], measured = hits(row);
    if (!measured.length) continue;
    const prior = rows.slice(0, i).reverse().find(r => hits(r).length);
    if (prior && hits(prior).at(-1).end > measured[0].start + epsilon)
      throw new Error(`Overlapping measured lyric lines ${prior.index + 1}/${i + 1}; realign or review this section`);
    const next = rows.slice(i + 1).find(r => hits(r).length);
    const leading = row.lineWords.findIndex(w => w.matched), trailing = row.lineWords.length - 1 - row.lineWords.findLastIndex(w => w.matched);
    const previousEnd = prior?.end ?? 0;
    row.start = Math.max(previousEnd, measured[0].start - .3 * leading);
    row.end = Math.min(next ? hits(next)[0].start : duration, measured.at(-1).end + .3 * trailing);
    if (measured[0].start < 0 || measured.at(-1).end > duration + epsilon) throw new Error(`Anchor outside audio on line ${i + 1}`);
  }
  // Allocate a run of missing lines together, rather than giving each the whole same gap.
  for (let i = 0; i < rows.length;) {
    if (Number.isFinite(rows[i].start)) { i++; continue; }
    let last = i;
    while (last + 1 < rows.length && !Number.isFinite(rows[last + 1].start)) last++;
    let cursor = i ? rows[i - 1].end : 0;
    const end = rows[last + 1]?.start ?? duration;
    if (end - cursor < .001 * (last - i + 1)) throw new Error(`No room for unanchored lines ${i + 1}–${last + 1}`);
    const weights = rows.slice(i, last + 1).map(r => Math.max(1, r.text.length)), total = weights.reduce((a,b) => a+b, 0), span = end - cursor;
    for (let k = i; k <= last; k++) { rows[k].start = cursor; cursor += span * weights[k - i] / total; rows[k].end = k === last ? end : cursor; }
    i = last + 1;
  }
  for (const row of rows) {
    if (!(row.end > row.start)) throw new Error(`Empty lyric line ${row.index + 1}`);
    const resolved = echoLyricResolvedWordIntervals({ start: row.start, end: row.end, words: row.lineWords.map(w => ({ word: w.text, start: w.matched ? w.start : null, end: w.matched ? w.end : null, matched: w.matched })) }).words;
    row.start = round(row.start); row.end = round(row.end);
    row.lineWords.forEach((w,k) => Object.assign(w, {start: round(resolved[k].start), end: round(resolved[k].end), matched: resolved[k].anchored}));
    row.hits = row.lineWords.filter(w => w.matched);
    for (let k = 0; k < row.lineWords.length; k++) {
      const w = row.lineWords[k];
      if (!(w.end > w.start) || w.start < row.start - epsilon || w.end > row.end + epsilon || (k && w.start < row.lineWords[k-1].end - epsilon))
        throw new Error(`Invalid resolved word on line ${row.index + 1}`);
    }
  }
  const flattened = rows.flatMap(r => r.lineWords), pairs = echoLyricTranscriptPairs(flattened, transcriptWords);
  const observations = new Map(pairs.map(([i,j]) => [i, transcriptWords[j]]));
  let offset = 0;
  for (const row of rows) {
    const residuals = row.lineWords.flatMap((w,k) => w.matched && observations.has(offset+k) ? [Math.abs(w.start - observations.get(offset+k).start)] : []);
    row.agreeingWords = residuals.filter(d => d <= 1).length;
    row.agreementRatio = row.hits.length ? row.agreeingWords / row.hits.length : 0;
    row.maxStartDisagreementSeconds = residuals.length ? Math.max(...residuals) : null;
    offset += row.lineWords.length;
  }
  return { rows, repairs, alignedCount: flattened.filter(w => w.matched).length, agreeing: rows.reduce((n,r) => n+r.agreeingWords,0) };
}

// Explicit omissions affect display only; canonical lyrics and confidence denominator remain intact.
export function echoLyricRetainedLineIndexes(lines, omissions = []) {
  const seen = new Set();
  if (!Array.isArray(omissions)) throw new Error('Invalid explicit timing omission receipt');
  for (const o of omissions) {
    if (!o || !Number.isInteger(o.lineIndex) || o.lineIndex < 0 || o.lineIndex >= lines.length ||
        typeof o.reason !== 'string' || !o.reason.trim() || o.text !== lines[o.lineIndex] || seen.has(o.lineIndex))
      throw new Error('Invalid explicit timing omission receipt');
    seen.add(o.lineIndex);
  }
  const retained = lines.map((_, i) => i).filter(i => !seen.has(i));
  if (!retained.length) throw new Error('No supported lyric lines remain');
  return retained;
}
