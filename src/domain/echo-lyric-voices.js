// Every vocal source is matched to the ORIGINAL written lyrics on its own.
// Recognizers mishear and misspell; the written lyric stays the text of record
// and each source only contributes timing evidence for it. One voice cannot be
// forced into another voice's word order: lead and backing vocals overlap in
// time, so each is a separate monotonic match.
//
// voice   lead     isolated Lead Vocals stem
//         vocals   combined Vocals stem (lead and backing mixed)
//         backing  isolated Backing Vocals stem
//         mix      the master recording (who sang is not attributed)
import { echoLyricComparePerformanceMaps, echoLyricLexemes, echoLyricPerformanceMap } from './echo-lyric-performance.js';

const textKey = (line) => echoLyricLexemes(line).join(' ');

export const ECHO_LYRIC_VOICE_SCHEMA = 'hapa.echo.lyric-voice-map.v1';
const DOUBLING_SECONDS = 1;
const ORDER_SLACK_SECONDS = 0.5;

/** Classify a stem role (Song Card or Atlas asset role) as a lyric voice, or null. */
export function echoLyricVoiceOf(role = '') {
  const value = String(role).toLowerCase().replace(/^\d+\s*[-–]\s*/, '').replace(/[_-]+/g, ' ').trim();
  if (value === 'master') return 'mix';
  if (/\b(backing|background|backup|harmony|choir)\b.*\bvocals?\b|^(backing|backup|bvs?)$/.test(value)) return 'backing';
  if (/^lead( vocals?)?$|\blead vocals?\b/.test(value)) return 'lead';
  if (/^vocals?$/.test(value)) return 'vocals';
  return null;
}

const relation = (row, performance) => Math.abs(performance.start - row.start) <= DOUBLING_SECONDS ? 'doubles'
  : performance.start >= row.end - 0.05 ? 'echoes' : performance.end <= row.start + 0.05 ? 'precedes' : 'overlaps';
const performanceOf = (source, row, extra = {}) => ({ voice: source.voice, sourceId: source.sourceId, sourceRun: source.runId,
  start: row.start, end: row.end, coverage: row.coverage, matches: row.matches, ...extra });

/**
 * lines: original written lyric lines. sources: [{ voice, sourceId, runId, role, words }]
 * (words are recognizer timestamps: {text, start, end}).
 * → the same shape as echoLyricPerformanceMap (so windows and assembly keep
 *   working) plus, per line: voice, sourceId, sourceRun and performances[]
 *   (every other voice that sang it: doubles, echoes, overlaps, precedes).
 */
export function echoLyricVoiceMap(lines, sources = []) {
  const usable = sources.filter((s) => s && ['lead', 'vocals', 'backing', 'mix'].includes(s.voice) && Array.isArray(s.words));
  if (!usable.length) throw new Error('No vocal transcript to time the lyrics');
  const mapped = usable.map((source) => ({ ...source, map: echoLyricPerformanceMap(lines, source.words) }));
  const sung = mapped.find((s) => s.voice === 'lead') || mapped.find((s) => s.voice === 'vocals') || null;
  const mix = mapped.find((s) => s.voice === 'mix') || null;
  const backing = mapped.find((s) => s.voice === 'backing') || null;

  // Primary evidence: the sung lead (or combined vocals), refined against the master.
  const base = sung || mix || backing;
  const other = sung && mix ? mix : null;
  const primary = other ? echoLyricComparePerformanceMaps(sung.map, mix.map) : base.map;
  const rows = primary.lines.map((row, i) => {
    const source = other && row.sourceChoice === 'alternate' ? other : base;
    // The master can time a line better while it is still the lead singer's performance.
    const lead = sung?.map.lines[i];
    const voice = !row.supported ? null : source === mix && lead?.supported && Math.abs(lead.start - row.start) <= DOUBLING_SECONDS ? sung.voice : source.voice;
    return { ...row, voice, sourceId: source.sourceId, sourceRun: source.runId, performances: [] };
  });

  // Lines only the backing singers carry become backing-voice lines, if they fit the song's order.
  if (backing && backing !== base) {
    for (let i = 0; i < rows.length; i++) {
      const b = backing.map.lines[i];
      if (rows[i].supported || !b.supported) continue;
      const before = rows.slice(0, i).reverse().find((r) => r.supported), after = rows.slice(i + 1).find((r) => r.supported);
      if ((before && b.start < before.end - ORDER_SLACK_SECONDS) || (after && b.end > after.start + ORDER_SLACK_SECONDS)) continue;
      rows[i] = { ...b, voice: 'backing', sourceId: backing.sourceId, sourceRun: backing.runId, reason: 'backing-vocal-evidence', performances: [] };
    }
  }

  // Every other sung performance of a written line is kept with its own timing.
  const unplaced = {};
  for (const source of mapped.filter((s) => s.voice !== 'mix')) {
    const extra = [];
    source.map.lines.forEach((row, i) => {
      const target = rows[i];
      if (!row.supported || !target.supported || target.sourceId === source.sourceId) return;
      // The lead heard again in the master is the same performance, not a second one.
      if (source.voice !== 'backing' && target.voice === source.voice && relation(target, row) === 'doubles') return;
      extra.push([i, row, 'first-pass']);
    });
    // Backing singers often repeat a line more times than it is written: look again in the words still unused.
    const used = new Set(source.map.lines.flatMap((row) => row.matches.map((m) => m.transcriptIndex)));
    if (source.voice === 'backing') {
      for (const [i, row] of extra) for (const m of row.matches) used.add(m.transcriptIndex);
      const rest = source.words.map((w, index) => ({ ...w, index })).filter((w) => !used.has(w.index));
      if (rest.length) {
        const again = echoLyricPerformanceMap(lines, rest);
        again.lines.forEach((row, i) => {
          if (!row.supported) return;
          // A repeated line belongs to the nearest written occurrence sung before it (else the next one).
          const same = rows.map((r, k) => [r, k]).filter(([r, k]) => r.supported && textKey(lines[k]) === textKey(lines[i]));
          const target = same.filter(([r]) => r.start <= row.start).at(-1) || same.find(([r]) => r.start > row.start);
          if (!target) return;
          const matches = row.matches.map((m) => ({ ...m, transcriptIndex: rest[m.transcriptIndex]?.index ?? m.transcriptIndex }));
          extra.push([target[1], { ...row, matches }, 'repeat-pass']);
          for (const m of matches) used.add(m.transcriptIndex);
        });
      }
      unplaced[source.voice] = source.words.length - [...used].filter((index) => index < source.words.length).length;
    }
    for (const [i, row, pass] of extra) {
      const target = rows[i];
      if (target.performances.some((p) => p.voice === source.voice && p.start < row.end && row.start < p.end)) continue;
      target.performances.push(performanceOf(source, row, { relation: relation(target, row), pass }));
    }
  }
  for (const row of rows) row.performances.sort((a, b) => a.start - b.start);
  // Forced alignment runs on the singer's own stem (cleanest audio), even when the master timed the line
  // better. A line heard only in the master is still aligned on the vocal stem when there is one: the
  // aligner collapses on the full mix (American Kings: zero-length words on 3 s master windows).
  const stemOf = { lead: sung, vocals: sung, backing, mix: sung || mix };
  for (const row of rows) row.alignSourceId = (row.voice && stemOf[row.voice]?.sourceId) || row.sourceId;

  const voices = mapped.map((s) => ({ voice: s.voice, sourceId: s.sourceId, sourceRun: s.runId, role: s.role || null, words: s.words.length,
    supportedLines: s.map.supportedLines, primaryLines: rows.filter((r) => r.supported && r.sourceId === s.sourceId).length,
    performances: rows.reduce((n, r) => n + r.performances.filter((p) => p.sourceId === s.sourceId).length, 0) }));
  const passages = [];
  for (let k = 0; k < rows.length;) {
    if (rows[k].supported) { k++; continue; }
    const first = k; while (k + 1 < rows.length && !rows[k + 1].supported) k++;
    passages.push({ firstLine: first, lastLine: k, lineCount: k - first + 1, tokenCount: rows.slice(first, k + 1).reduce((n, r) => n + r.tokenCount, 0), reason: 'no-voice-evidence-not-proof-of-absence' });
    k++;
  }
  return { ...primary, schemaVersion: primary.schemaVersion, voiceSchemaVersion: ECHO_LYRIC_VOICE_SCHEMA, policy: `${primary.policy}+voices`,
    lines: rows, passages, supportedLines: rows.filter((r) => r.supported).length, voices, unplacedWords: unplaced };
}
