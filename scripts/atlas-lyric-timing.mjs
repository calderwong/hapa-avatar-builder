#!/usr/bin/env node
// Whole-song lyric timing from the Audio Atlas (MLX, local, no provider calls).
//   plan     — locate every canonical lyric line with the Atlas MLX Whisper word candidates on the
//              isolated vocal stem, then group lines into ≤30 s forced-alignment windows.
//   align    — run one Atlas Qwen3 forced-alignment job per window, sequentially and resumably,
//              through the canonical Atlas owner (same jobs, cache, provenance and review surfaces).
//   assemble — write a hapa.suno_playlist_lyric_timing.v1 candidate plus STT sidecar with engine
//              "audio-atlas-mlx" for scripts/promote-echo-lyric-timing-candidates.mjs.
// Confidence = aligned-word ratio × agreement between the two MLX models (Qwen3 word start within
// ±AGREE_SECONDS of the same normalized word from MLX Whisper). Machine evidence, not human review.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { echoLyricComparePerformanceMaps, echoLyricLexemes, echoLyricPerformanceMap, echoLyricAlignmentWindows, echoLyricPerformanceWindows, inspectEchoLyricPassages } from '../src/domain/echo-lyric-performance.js';
import { echoLyricVoiceMap, echoLyricVoiceOf } from '../src/domain/echo-lyric-voices.js';
import { echoLyricResolvedWordIntervals } from '../src/domain/echo-lyric-template-runtime.js';
import { echoLyricRegistryTrackId } from '../src/domain/echo-lyric-sync-safety.js';
import { createAudioAtlas } from '../server/audio-atlas.mjs';
import { assembleEchoLyricIntervals, echoLyricRetainedLineIndexes } from '../src/domain/echo-lyric-alignment.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [command, ...rest] = process.argv.slice(2);
const opts = Object.fromEntries(rest.map(arg => { const at = arg.indexOf('='); return at < 0 ? [arg.replace(/^--/, ''), true] : [arg.slice(2, at), arg.slice(at + 1)]; }));
const sha = value => createHash('sha256').update(value).digest('hex');
const norm = value => String(value || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
const round = (value, digits = 2) => Math.round(value * 10 ** digits) / 10 ** digits;
const stamp = seconds => `${Math.floor(seconds / 60)}:${(seconds % 60).toFixed(2).padStart(5, '0')}`;
const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const writeJson = (file, value) => fs.writeFileSync(file, JSON.stringify(value, null, 1) + '\n');

function lyricLines(song) {
  const text = typeof song.lyrics === 'string' ? song.lyrics : song.lyrics?.text || '';
  return text.split(/\r?\n/).map(line => line.trim()).filter(line => line && !/^\[[^\]]*\]$/.test(line));
}

// Exact source identity from the Atlas run manifest (content-addressed custody copy + SHA-256).
function sourceIdentity(runId, sourceId) {
  const manifest = readJson(path.join(process.env.HAPA_AUDIO_ATLAS_STORAGE || path.join(root, 'data/audio-atlas'), 'runs', runId, 'manifest.json'));
  const source = manifest.sources.find(s => s.id === sourceId);
  if (!source?.path || !source?.sha256) throw new Error(`Atlas run ${runId} has no recorded identity for ${sourceId}`);
  return { path: source.path, sha256: source.sha256, originalPath: source.original_path || null };
}

// Recognizer words only: forced-alignment runs also record word candidates for their source.
function transcriptWords(atlas, runId, sourceId) {
  const result = atlas.result(runId);
  return result.observations.filter(o => o.kind === 'hapa.audio.word_candidate' && o.subject_id === sourceId && o.payload?.method !== 'Qwen3 supplied-text alignment')
    .map(o => ({ text: String(o.payload?.text || '').trim(), start: o.start_sample / o.reference_sample_rate_hz, end: o.end_sample / o.reference_sample_rate_hz }))
    .map(w => ({ ...w, norm: norm(w.text) })).filter(w => w.norm);
}

export function alignmentCorroboration(atlas, runIds, referenceRun) {
  const reference=atlas.result(referenceRun),words=[],runs=[];
  for(const id of runIds){
    const result=atlas.result(id),fa=result.forced_alignment;
    if(!fa?.candidates?.length||result.assets.find(a=>a.id==='master')?.source_sha256!==reference.assets.find(a=>a.id==='master')?.source_sha256)continue;
    const source=result.assets.find(a=>a.id===fa.source_asset_id);
    if(!reference.assets.some(a=>a.id===source?.id&&a.source_sha256===source.source_sha256))continue;
    for(const c of fa.candidates){
      const token=fa.supplied_tokens[c.supplied_token_index],before=fa.supplied_text.lastIndexOf('\n',token.text_start-1)+1,end=fa.supplied_text.indexOf('\n',token.text_end);
      const lineText=fa.supplied_text.slice(before,end<0?undefined:end).trim(),parts=echoLyricLexemes(token.text);
      if(parts.length!==1)continue;
      words.push({lineText,token:parts[0],start:c.start_sample/fa.analysis_view.source_reference_rate_hz,end:c.end_sample/fa.analysis_view.source_reference_rate_hz,runId:id,sourceId:source.id});
    }
    runs.push({runId:id,sourceId:source.id,sourceSha256:source.source_sha256,rawEvidenceSha256:fa.raw_evidence_sha256});
  }
  return {words,runs};
}

/**
 * One additional voice performance of a written line, timed on its own: the forced aligner's words
 * when it placed any, otherwise the recognizer's matched words. Unmatched words are placed between
 * their neighbours with the renderer's resolver; nothing is invented outside the measured span.
 */
export function performanceTiming(text, performance, alignedWords, duration) {
  const words = text.split(/\s+/).map(word => ({ text: word, start: null, end: null, matched: false }));
  let evidence = 'recognizer';
  if (alignedWords?.some(w => w.matched)) { alignedWords.forEach((w, k) => { if (w.matched && words[k]) Object.assign(words[k], { start: w.start, end: w.end, matched: true }); }); evidence = 'forced-alignment'; }
  else {
    const slots = words.flatMap((w, s) => echoLyricLexemes(w.text).map(() => s));
    for (const m of performance.matches || []) {
      const w = words[slots[m.lineTokenIndex]];
      if (!w) continue;
      w.start = w.start === null ? m.start : Math.min(w.start, m.start); w.end = w.end === null ? m.end : Math.max(w.end, m.end); w.matched = true;
    }
  }
  let last = -Infinity;
  for (const w of words) { if (!w.matched) continue; if (!(w.end > w.start) || w.start < last - 1e-6) { w.matched = false; continue; } last = w.end; }
  const hits = words.filter(w => w.matched);
  if (!hits.length) return null;
  const leading = words.findIndex(w => w.matched), trailing = words.length - 1 - words.findLastIndex(w => w.matched);
  const start = Math.max(0, hits[0].start - .3 * leading), end = Math.min(duration, hits.at(-1).end + .3 * trailing);
  const resolved = echoLyricResolvedWordIntervals({ start, end, words: words.map(w => ({ word: w.text, start: w.matched ? w.start : null, end: w.matched ? w.end : null, matched: w.matched })) }).words;
  return { start: round(start, 6), end: round(end, 6), evidence, coverage: round(hits.length / words.length, 3),
    words: words.map((w, k) => ({ text: w.text, start: round(resolved[k].start, 6), end: round(resolved[k].end, 6), matched: resolved[k].anchored })) };
}

const complete = (atlas, songId) => atlas.jobs(songId).filter(j => j.state === 'complete').sort((a,b) => String(b.created_at).localeCompare(String(a.created_at)));

/** The newest transcript of every vocal source (lead/vocals, backing, master) of one master recording. */
export function voiceSources(atlas, songId, masterSha256) {
  const found = new Map();
  for (const job of complete(atlas, songId)) {
    let result; try { result = atlas.result(job.id); } catch { continue; }
    const t = result.transcript_candidate;
    if (!t?.word_count || result.assets.find(a => a.id === 'master')?.source_sha256 !== masterSha256) continue;
    const asset = result.assets.find(a => a.id === t.source_asset_id), voice = echoLyricVoiceOf(asset?.role || t.source_asset_id);
    if (!voice || found.has(voice)) continue;
    found.set(voice, { voice, role: asset.role, sourceId: asset.id, runId: job.id, words: transcriptWords(atlas, job.id, asset.id) });
  }
  return [...found.values()];
}

/**
 * Transcribe every vocal source of the current stem set that has no transcript yet
 * (lead or combined vocals, backing vocals, and the master), through the Atlas owner.
 * A failed transcription only removes that voice's evidence; it never stops the song.
 */
export async function ensureVoiceTranscripts(atlas, songId, baseRunId, have = []) {
  const base = atlas.result(baseRunId), haveVoices = new Set(have.map(s => s.voice)), outcomes = [];
  for (const asset of base.assets.filter(a => a.status === 'ready')) {
    const voice = echoLyricVoiceOf(asset.role || asset.id);
    if (!voice || haveVoices.has(voice)) continue;
    haveVoices.add(voice);
    try {
      const started = await atlas.start(songId, { transcribe: true, transcriptionBaseRunId: baseRunId, transcriptionSourceId: asset.id, transcriptionLanguage: 'en' });
      const done = await atlas.wait(started.id);
      outcomes.push({ voice, sourceId: asset.id, runId: done.id, state: done.state, ...(done.state === 'complete' ? {} : { error: done.error || done.state }) });
    } catch (error) { outcomes.push({ voice, sourceId: asset.id, state: 'failed', error: error.message }); }
  }
  return outcomes;
}

export async function plan(atlas, opts) {
  if (!opts.song || !opts.out) throw new Error('plan --song=ID --out=DIR [--transcript-run=RUN]');
  const store = readJson(process.env.HAPA_SONG_STORE || path.join(root, 'data/hapa-songs-store.json'));
  const song = store.songs.find(s => s.id === opts.song);
  if (!song) throw new Error(`Unknown song ${opts.song}`);
  const runs = atlas.jobs(opts.song).filter(j => j.state === 'complete').sort((a,b) => String(b.created_at).localeCompare(String(a.created_at)));
  // The base transcript is the sung lead when there is one (then combined vocals, the master, backing), newest first.
  const rank = { lead: 0, vocals: 1, mix: 2, backing: 3 };
  const transcribed = runs.flatMap(j => { try { const r = atlas.result(j.id), t = r.transcript_candidate; if (!(t?.word_count > 0)) return []; return [{ id: j.id, rank: rank[echoLyricVoiceOf(r.assets.find(a => a.id === t.source_asset_id)?.role || t.source_asset_id)] ?? 4 }]; } catch { return []; } });
  const transcriptRun = opts['transcript-run'] || [...transcribed].sort((a, b) => a.rank - b.rank)[0]?.id;
  if (!transcriptRun) throw new Error('No complete Atlas transcript; request transcription through the Atlas owner first');
  const result = atlas.result(transcriptRun), sourceId = result.transcript_candidate.source_asset_id;
  const asset = result.assets.find(a=>a.id===sourceId), vocal = {id:sourceId,role:asset.role};
  if(result.song_id !== song.id) throw Error('Transcript belongs to a different song');
  const duration = result.assets[0].sample_count / result.assets[0].sample_rate_hz;
  const words = transcriptWords(atlas, transcriptRun, sourceId), lines = lyricLines(song);
  if(!lines.length) throw Error('No canonical written lyric lines');
  // Every vocal source of this master is matched to the written lyrics on its own (--voices=off: one source).
  const masterSha256 = sourceIdentity(transcriptRun, 'master').sha256;
  const single = { voice: echoLyricVoiceOf(asset.role || sourceId) || 'vocals', role: asset.role, sourceId, runId: transcriptRun, words };
  let transcriptions = [];
  let sources = opts.voices === 'off' ? [single] : voiceSources(atlas, song.id, masterSha256);
  if (opts.voices !== 'off' && opts['transcribe-voices']) {
    transcriptions = await ensureVoiceTranscripts(atlas, song.id, transcriptRun, sources);
    if (transcriptions.some(t => t.state === 'complete')) sources = voiceSources(atlas, song.id, masterSha256);
  }
  if (!sources.some(s => s.sourceId === sourceId)) sources = [single, ...sources.filter(s => s.voice !== single.voice)];
  const performanceMap = echoLyricVoiceMap(lines, sources);
  const anchored = performanceMap.supportedLines;
  let windows=[], voiceWindows=[], planningError=null;
  try { windows=echoLyricAlignmentWindows(lines,performanceMap,duration); voiceWindows=echoLyricPerformanceWindows(lines,performanceMap,duration); } catch(error) { planningError=error.message; }
  const sourceIdentities = Object.fromEntries(sources.map(s => [s.sourceId, { voice: s.voice, role: s.role, transcriptRun: s.runId, words: s.words.length, ...sourceIdentity(s.runId, s.sourceId) }]));
  fs.mkdirSync(opts.out, { recursive: true });
  // Exact stored lyric bytes, so lyricsSha256 matches the Song Card's lyrics.sha256.
  const lyricsText = typeof song.lyrics === 'string' ? song.lyrics : song.lyrics?.text || '', lyricsPath = path.resolve(opts.out, 'lyrics.txt');
  fs.writeFileSync(lyricsPath, lyricsText);
  const out = { schemaVersion: 'hapa.audio-atlas.lyric-timing-plan.v1', createdAt: new Date().toISOString(), songId: song.id, title: song.title,
    registryTrackId: echoLyricRegistryTrackId(song) || null, vocalSource: { id: vocal.id, role: vocal.role, ...sourceIdentity(transcriptRun, vocal.id) },
    transcriptRun, transcriptWordCount: words.length, durationSeconds: duration, lyricsPath, lyricsSha256: sha(lyricsText),
    storeLyricsSha256: song.lyrics?.sha256 || null, lines, lineSections: lines.map((text, i) => song.lyricTimings?.[i]?.text === text ? (song.lyricTimings[i].section || song.lyricTimings[i].section_label || '') : ''), anchoredLines: anchored, performanceMap, planningError, windows,
    masterSha256, sources: sourceIdentities, voiceTranscriptions: transcriptions, voiceWindows };
  writeJson(path.join(opts.out, 'plan.json'), out);
  return { plan: path.join(opts.out, 'plan.json'), lines: lines.length, anchoredLines: anchored, planningError, windows: windows.length, voiceWindows: voiceWindows.length,
    voices: performanceMap.voices.map(v => ({ voice: v.voice, sourceId: v.sourceId, supportedLines: v.supportedLines, primaryLines: v.primaryLines, performances: v.performances })), transcriptions };
}

export async function align(atlas, opts) {
  const planPath = path.resolve(opts.plan), p = readJson(planPath);
  if(p.planningError) throw Error(p.planningError);
  if(sha(fs.readFileSync(p.lyricsPath))!==p.lyricsSha256) throw Error('Canonical lyric snapshot changed');
  // Primary windows, then one window set per additional voice. Each runs on its own stem. A failed
  // window is recorded and the rest continue: assembly falls back to recognizer anchors for its lines
  // and holds them for review. Re-running retries only windows that are not complete.
  const all = [...p.windows.map((w, index) => ['primary', index, w]), ...(p.voiceWindows || []).map((w, index) => ['voice', index, w])];
  for (const [kind, index, w] of all) {
    if (w.state === 'complete') continue;
    try {
      const started = await atlas.start(p.songId, { alignmentBaseRunId: p.transcriptRun, alignment: { sourceId: w.sourceId || p.vocalSource.id, startSeconds: w.startSeconds, endSeconds: w.endSeconds, text: w.text, language: 'English' } });
      const done = await atlas.wait(started.id);
      Object.assign(w, { runId: done.id, state: done.state, error: done.state === 'complete' ? undefined : String(done.error || done.state) });
    } catch (error) { Object.assign(w, { state: 'failed', error: error.message }); }
    writeJson(planPath, p);
    console.log(JSON.stringify({ kind, window: index, sourceId: w.sourceId || p.vocalSource.id, runId: w.runId, state: w.state, ...(w.error ? { error: w.error } : {}) }));
  }
  const finished = all.filter(([, , w]) => w.state === 'complete').length;
  return { plan: planPath, windows: p.windows.length, voiceWindows: (p.voiceWindows || []).length, complete: finished, failed: all.filter(([, , w]) => w.state !== 'complete').map(([kind, index, w]) => ({ kind, index, error: w.error })) };
}

export function assemble(atlas, opts) {
  const p = readJson(path.resolve(opts.plan)), outDir = path.resolve(opts.candidates || path.join(path.dirname(path.resolve(opts.plan)), 'candidates'));
  // Plans built with voices (p.sources) tolerate failed windows; older single-source plans keep their rule.
  const voiced = Boolean(p.sources), transcriptOnly = Boolean(opts['transcript-only']);
  if(!transcriptOnly && (p.planningError || !p.windows.length)) throw Error(p.planningError || 'No alignment windows');
  if (!transcriptOnly && !voiced && p.windows.some(w => w.state !== 'complete')) throw new Error('Run align until every window is complete');
  if (!p.vocalSource.sha256) Object.assign(p.vocalSource, sourceIdentity(p.transcriptRun, p.vocalSource.id));
  const identityOf = sourceId => p.sources?.[sourceId] || (sourceId === p.vocalSource.id ? p.vocalSource : null);
  const doneWindows = transcriptOnly ? [] : p.windows.filter(w => w.state === 'complete');
  const doneVoiceWindows = transcriptOnly ? [] : (p.voiceWindows || []).filter(w => w.state === 'complete');
  for (const w of [...doneWindows, ...doneVoiceWindows]) {
    const sourceId = w.sourceId || p.vocalSource.id, expected = identityOf(sourceId), used = sourceIdentity(w.runId, sourceId);
    if (!expected || used.sha256 !== expected.sha256) throw new Error(`Window run ${w.runId} aligned different ${sourceId} bytes than the plan's transcript`);
  }
  const incompleteWindows = transcriptOnly ? [] : [...p.windows.map(w => ['primary', w]), ...(p.voiceWindows || []).map(w => ['voice', w])].filter(([, w]) => w.state !== 'complete').map(([kind, w]) => ({ kind, sourceId: w.sourceId || p.vocalSource.id, lines: w.lines, state: w.state, error: w.error || null }));
  const words = transcriptWords(atlas, p.transcriptRun, p.vocalSource.id);
  const aligned = p.lines.map(line => line.split(/\s+/).map(text => ({ text, start: null, end: null, matched: false })));
  const runs = [];
  let performanceMapping=p.performanceMap, comparisonSource=null;
  if(opts['transcript-only']) {
    if(sha(fs.readFileSync(p.vocalSource.originalPath || p.vocalSource.path))!==p.vocalSource.sha256) throw Error('Audio changed since transcript analysis');
    // A voiced plan already matched every voice to the written lyrics; its rows name their own source run.
    const mapping=voiced&&!opts['comparison-plan']?structuredClone(p.performanceMap):echoLyricPerformanceMap(p.lines,words);
    if(voiced&&!opts['comparison-plan'])mapping.lines.forEach(row=>row.matches.forEach(w=>{w.evidenceSourceRun=row.sourceRun||p.transcriptRun;}));
    if(opts['comparison-plan']) {
      const other=readJson(opts['comparison-plan']);
      if(other.songId!==p.songId || other.lyricsSha256!==p.lyricsSha256 || sourceIdentity(other.transcriptRun,'master').sha256!==sourceIdentity(p.transcriptRun,'master').sha256)throw Error('Comparison evidence belongs to different lyrics or master audio');
      if(sha(fs.readFileSync(other.vocalSource.originalPath||other.vocalSource.path))!==other.vocalSource.sha256)throw Error('Comparison audio changed');
      const alternate=echoLyricPerformanceMap(p.lines,transcriptWords(atlas,other.transcriptRun,other.vocalSource.id));
      comparisonSource={transcriptRun:other.transcriptRun,...other.vocalSource};
      Object.assign(mapping,echoLyricComparePerformanceMaps(mapping,alternate,{preferPrimary:opts['comparison-mode']==='boundaries-only',corroboratingWords:opts.corroboration?.words||[]}));
      mapping.lines.forEach(row=>{row.sourceRun=row.sourceChoice==='alternate'?other.transcriptRun:p.transcriptRun;row.sourceId=row.sourceChoice==='alternate'?other.vocalSource.id:p.vocalSource.id;row.matches.forEach(w=>{w.evidenceSourceRun=w.boundaryFromAlternate===undefined?row.sourceRun:w.boundaryFromAlternate?other.transcriptRun:p.transcriptRun;});});
    }
    performanceMapping=mapping;
    for(const row of mapping.lines) {
      // Map lexical pieces to their original display word; spelling and line breaks stay exact.
      const slots=p.lines[row.line].split(/\s+/).flatMap((text,slot)=>echoLyricLexemes(text).map(norm=>({slot,norm})));
      let cursor=0;
      for(const match of row.matches) {
        const offset=match.lineTokenIndex;
        if(offset<0)continue;cursor=offset+1;
        const word=aligned[row.line][slots[offset].slot];
        word.start=word.start===null?match.start:Math.min(word.start,match.start);word.end=word.end===null?match.end:Math.max(word.end,match.end);word.matched=true;word.evidenceSourceRun=match.evidenceSourceRun||p.transcriptRun;if(match.matchKind&&match.matchKind!=='exact'){word.recognitionMatches??=[];word.recognitionMatches.push({written:match.token,recognized:match.recognizedToken,kind:match.matchKind,transcriptIndex:match.transcriptIndex});}
      }
    }
  }
  // (entry, line, display slot) of a supplied token, from character offsets inside the window text.
  const windowSlots = w => {
    const entries = w.entries ? w.entries.map(e => e.line) : w.lines, starts = []; let offset = 0;
    for (const [k, line] of entries.entries()) { starts.push({ k, line, from: offset }); offset += p.lines[line].length + 1; }
    return token => { const owner = [...starts].reverse().find(s => token.text_start >= s.from); return [owner.k, owner.line, w.text.slice(owner.from, token.text_start).split(/\s+/).filter(Boolean).length]; };
  };
  const conditioned = [];
  const forcedAlignment = w => {
    const fa = atlas.result(w.runId).forced_alignment, rate = fa.analysis_view.source_reference_rate_hz;
    if (fa.supplied_text !== w.text) throw new Error(`Window text changed for run ${w.runId}`);
    runs.push({ runId: w.runId, sourceId: w.sourceId || p.vocalSource.id, kind: w.kind || 'primary', startSeconds: w.startSeconds, endSeconds: w.endSeconds, rawEvidenceSha256: fa.raw_evidence_sha256, inputPcmSha256: fa.input_pcm_sha256 });
    const gain = fa.analysis_view.input_conditioning?.gain;
    if (Number.isFinite(gain) && gain < 1) conditioned.push({ runId: w.runId, inputPeak: fa.analysis_view.input_conditioning.input_peak, gain });
    return { fa, rate, slot: windowSlots(w) };
  };
  for (const w of doneWindows) {
    const { fa, rate, slot } = forcedAlignment(w);
    // An explicit later review window replaces earlier candidates for its lines, including abstentions.
    for (const i of w.lines) aligned[i] = p.lines[i].split(/\s+/).map(text => ({ text, start: null, end: null, matched: false }));
    for (const c of fa.candidates) {
      const [, line, wordSlot] = slot(fa.supplied_tokens[c.supplied_token_index]);
      if (aligned[line][wordSlot]) Object.assign(aligned[line][wordSlot], { start: c.start_sample / rate, end: c.end_sample / rate, matched: true });
    }
  }
  // Best evidence per written word: the aligner's placement where it placed the word; otherwise the
  // recognizer's matched time for that word (any voice), when it fits between the line's aligned
  // neighbours. Where the aligner failed, abstained or was never run, recognizer words time the whole
  // line. Recognizer-timed words are agreementExempt: they cannot "agree" with themselves.
  const fallbackLines = new Set(), disagreements = new Map();
  let recognizerFilledWords = 0;
  if (voiced && !transcriptOnly) {
    for (const row of p.performanceMap.lines) {
      if (!row.supported) continue;
      const words = aligned[row.line];
      const slots = p.lines[row.line].split(/\s+/).flatMap((text, s) => echoLyricLexemes(text).map(() => s));
      const heard = new Map();
      for (const match of row.matches) {
        const s = slots[match.lineTokenIndex]; if (s === undefined) continue;
        const prior = heard.get(s); heard.set(s, prior ? { start: Math.min(prior.start, match.start), end: Math.max(prior.end, match.end) } : { start: match.start, end: match.end });
      }
      // When the aligner contradicts a well-supported recognizer reading of the line (fewer than 40% of its
      // placed words within ±1 s), the two models disagree: the line takes the recognizer's timing and is
      // judged by the recognizer rules, with the disagreement kept in review.
      const placed = words.map((w, s) => [w, s]).filter(([w]) => w.matched);
      const agreeing = placed.filter(([w, s]) => heard.has(s) && Math.abs(w.start - heard.get(s).start) <= 1).length;
      if (placed.length && agreeing / placed.length < .4 && row.coverage >= .45) {
        disagreements.set(row.line, { alignerWords: placed.length, agreeing });
        for (const w of words) Object.assign(w, { start: null, end: null, matched: false });
      }
      const recognizerLine = !words.some(w => w.matched);
      for (const [s, time] of heard) {
        const word = words[s]; if (!word || word.matched) continue;
        const before = words.slice(0, s).reverse().find(w => w.matched && !w.agreementExempt), after = words.slice(s + 1).find(w => w.matched && !w.agreementExempt);
        if (!recognizerLine && ((before && time.start < before.end - 1e-6) || (after && time.end > after.start + 1e-6))) continue;
        Object.assign(word, { start: time.start, end: time.end, matched: true, agreementExempt: true, evidenceSourceRun: row.sourceRun || p.transcriptRun, evidence: 'recognizer' });
        recognizerFilledWords++;
      }
      if (recognizerLine && words.some(w => w.matched)) fallbackLines.add(row.line);
    }
  }
  // Additional voice performances aligned on their own stems.
  const performanceAligned = new Map();
  for (const w of doneVoiceWindows) {
    const { fa, rate, slot } = forcedAlignment(w);
    for (const c of fa.candidates) {
      const [k, line, wordSlot] = slot(fa.supplied_tokens[c.supplied_token_index]), key = `${line}:${w.entries[k].performance}`;
      if (!performanceAligned.has(key)) performanceAligned.set(key, p.lines[line].split(/\s+/).map(text => ({ text, start: null, end: null, matched: false })));
      const word = performanceAligned.get(key)[wordSlot];
      if (word) Object.assign(word, { start: c.start_sample / rate, end: c.end_sample / rate, matched: true });
    }
  }
  // Explicit omissions preserve the canonical lyric file and its hash; never infer deletion.
  const omissions = p.timingOmissions ?? [];
  const retained = echoLyricRetainedLineIndexes(p.lines, omissions);
  const newIndex = new Map(retained.map((i,k) => [i,k]));
  const activeWindows = (voiced ? doneWindows : p.windows).map(w => ({...w, lines:w.lines.filter(i=>newIndex.has(i)).map(i=>newIndex.get(i))})).filter(w=>w.lines.length);
  // A voiced plan checks each line against its own voice's recognizer words (in written order);
  // lines timed only by that recognizer are not counted as agreeing with themselves.
  const agreementWords = voiced && !transcriptOnly ? retained.flatMap(i => {
    const row = p.performanceMap.lines[i]; if (fallbackLines.has(i) || !row?.supported) return [];
    const display = p.lines[i].split(/\s+/), slots = display.flatMap((text, s) => echoLyricLexemes(text).map(() => s));
    return [...row.matches].sort((a, b) => a.lineTokenIndex - b.lineTokenIndex).filter((m, k, all) => k === 0 || slots[m.lineTokenIndex] !== slots[all[k - 1].lineTokenIndex]).map(m => ({ text: display[slots[m.lineTokenIndex]], start: m.start, end: m.end }));
  }) : words;
  const { rows: out, repairs, alignedCount, independentCount, agreeing } = assembleEchoLyricIntervals({ lines: retained.map(i=>p.lines[i]), alignedWords: retained.map(i=>aligned[i]), windows: activeWindows, allowCrossSourceBoundaryDemotion:Boolean(opts['comparison-plan'])||(voiced&&Object.keys(p.sources).length>1), duration: p.durationSeconds, transcriptWords: agreementWords });
  out.forEach(row => { row.index = retained[row.index]; });
  repairs.forEach(repair => { repair.line = retained[repair.line - 1] + 1; });
  const searchLimitedLines = new Set(p.windows.filter(w => w.searchLimited).flatMap(w => w.lines));
  const lineReview = l => {
    const row = p.performanceMap?.lines?.[l.index];
    if (fallbackLines.has(l.index)) return { evidence: 'transcript-timestamps', performanceSupported: row?.supported === true, performanceCoverage: row?.coverage ?? 0, sourceRun: row?.sourceRun || p.transcriptRun, modelAgreementRatio: null, needsReview: true, reason: disagreements.has(l.index) ? 'aligner-disagreed-recognizer-timed' : 'aligner-unavailable-recognizer-timed', ...(disagreements.has(l.index) ? { alignerDisagreement: disagreements.get(l.index) } : {}), humanReviewed: false };
    const reason = l.needsReview ? (l.reviewReason || 'held-for-review') : searchLimitedLines.has(l.index) ? 'search-limited-window' : null;
    return { modelAgreementRatio: round(l.agreementRatio, 3), maxStartDisagreementSeconds: l.maxStartDisagreementSeconds, needsReview: l.agreementRatio < .6 || Boolean(reason), ...(reason ? { reason } : {}), humanReviewed: false };
  };
  // Every other voice that sang the line keeps its own word timing (aligner words, else recognizer words).
  const voicesOf = index => (p.performanceMap?.lines?.[index]?.performances || []).flatMap((performance, k) => {
    const timed = performanceTiming(p.lines[index], performance, performanceAligned.get(`${index}:${k}`), p.durationSeconds);
    return timed ? [{ voice: performance.voice, relation: performance.relation, sourceId: performance.sourceId, sourceRun: performance.sourceRun, ...timed }] : [];
  });
  const voiceLines = {}, voicePerformances = {};
  out.forEach(row => { const v = p.performanceMap?.lines?.[row.index]?.voice || 'unattributed'; voiceLines[v] = (voiceLines[v] || 0) + 1; row.voices = voicesOf(row.index); row.voices.forEach(x => { const key = `${x.voice}-${x.relation}`; voicePerformances[key] = (voicePerformances[key] || 0) + 1; }); });
  const wordCount = out.flatMap(l => l.lineWords).length, canonicalWordCount = aligned.flat().length, ratio = canonicalWordCount ? alignedCount / canonicalWordCount : 0, agreement = (voiced ? independentCount : alignedCount) ? agreeing / (voiced ? independentCount : alignedCount) : 0;
  const unmatchedLines = out.filter(l => !l.hits.length).length;
  const confidence = round(ratio * agreement, 3), warnings = [];
  if (ratio < 0.6) warnings.push('low_match_ratio');
  if (unmatchedLines / out.length > 0.2) warnings.push('many_unmatched_lines');
  const starts = out.map(l => round(l.start));
  const stats = { lineCount: out.length, sectionCount: 0, wordCount, displayWordCount: wordCount, alignmentWordCount: canonicalWordCount, omittedLineCount: omissions.length, matchedWords: alignedCount,
    matchedRatio: round(ratio, 3), sttWordCount: words.length, modelAgreementRatio: round(agreement, 3), firstVocal: round(out[0].start), lastVocal: round(out.at(-1).end),
    overlapCount: 0, overlapsClamped: 0, cropEdgeAnchorsDemoted: repairs.filter(r=>r.reason==='crop-prefix-overlaps-previous-line').length, boundaryAnchorsDemoted: repairs.length, duplicateStartCount: starts.length - new Set(starts).size, unmatchedLineCount: unmatchedLines,
    alignableLineCount: out.length, anchoredLineCount: out.length - unmatchedLines, alignableAnchorCoverage: round((out.length - unmatchedLines) / out.length, 3),
    ...(voiced ? { voiceLines, voicePerformances, recognizerTimedLines: fallbackLines.size, alignerDisagreedLines: disagreements.size, recognizerFilledWords, independentlyAlignedWords: independentCount, incompleteWindowCount: incompleteWindows.length, conditionedInputWindows: conditioned.length } : {}) };
  const now = new Date().toISOString(), id = p.registryTrackId || p.songId;
  const provenance = { timingOmissions: omissions, node: 'hapa-avatar-builder', pipeline: voiced ? 'audio-atlas-lyric-timing.v3-voices' : p.performanceMap ? 'audio-atlas-lyric-timing.v2' : 'audio-atlas-lyric-timing.v1', performanceMap: p.performanceMap || null, timingSource: 'audio-atlas-mlx', sttInput: `stem:${p.vocalSource.role}`,
    ...(voiced ? { voices: { schema: p.performanceMap.voiceSchemaVersion, sources: p.sources, summary: p.performanceMap.voices, unplacedRecognizedWords: p.performanceMap.unplacedWords, transcriptions: p.voiceTranscriptions || [],
      policy: 'every vocal source matched to the original written lyrics on its own; lines take the lead (or combined vocals) first, the master, then backing; other voices are kept per line with their own timing' },
      incompleteWindows, recognizerTimedLines: [...fallbackLines], inputConditioning: conditioned } : {}),
    sttInputStemType: p.vocalSource.role, requestedSttSource: 'vocals', audioPath: p.vocalSource.path, audioSha256: p.vocalSource.sha256, masterAudioSha256: sourceIdentity(p.transcriptRun,'master').sha256,
    lyricsPath: p.lyricsPath, lyricsSha256: p.lyricsSha256, storeLyricsSha256: p.storeLyricsSha256, alignedAt: now, atlasTranscriptRun: p.transcriptRun, atlasAlignmentRuns: runs,
    models: { transcription: 'mlx-community/whisper-large-v3-mlx-4bit (Audio Atlas local-model.json)', alignment: 'mlx-community/Qwen3-ForcedAligner-0.6B-8bit (Audio Atlas alignment-model.json)' },
    wordTiming: { schema: 'hapa.audio-atlas.word-timing-receipt.v1', granularity: 'word', method: 'audio-atlas-qwen3-forced-alignment-windowed', windowSeconds: 30,
      confidence: voiced ? 'measured-word ratio (aligner, else recognizer per word) x agreement of independently aligned words with the recognizer within ±1 s' : 'aligned-word ratio x MLX Whisper agreement within ±1 s', syllableExact: false, humanReviewed: false, boundaryRepair: { repairs }, agreementPolicy: 'unique-monotonic-transcript-occurrence' } };
  const timing = { version: 3, alignmentVersion: 'audio-atlas.qwen3-forced-alignment.windowed.v1', method: 'audio_atlas_forced_alignment', source: `stem:${p.vocalSource.role}`,
    engine: 'audio-atlas-mlx', model: 'mlx-community/Qwen3-ForcedAligner-0.6B-8bit', analyzedAt: now, duration: round(p.durationSeconds), confidence, warnings, stats, sections: [],
    lines: out.map(l => ({ index: l.index, sectionIndex: -1, section: p.lineSections?.[l.index] || '', text: l.text, start: round(l.start, 6), end: round(l.end, 6), timestamp: stamp(l.start), duration: round(l.end - l.start),
      confidence: round(l.hits.length / l.lineWords.length, 3), alignmentReview: lineReview(l), ...(voiced ? { voice: p.performanceMap.lines[l.index]?.voice || null } : {}),
      words: l.lineWords.map(w => ({ ...(w.evidenceSourceRun?{evidenceSourceRun:w.evidenceSourceRun}:{}), ...(w.matched&&w.evidence?{evidence:w.evidence}:{}), ...(w.recognitionMatches?{recognitionMatches:w.recognitionMatches}:{}), text: w.text, start: round(w.start, 6), end: round(w.end, 6), matched: w.matched })),
      ...(voiced && l.voices.length ? { voices: l.voices } : {}) })),
    schema: 'hapa.suno_playlist_lyric_timing.v1', songId: id, title: p.title, playlistId: 'audio-atlas', playlistName: 'Audio Atlas lyric timing', provenance };
  if(opts['transcript-only']) {
    timing.alignmentVersion='audio-atlas.whisper-performance-map.v2';timing.method='audio_atlas_transcript_alignment';timing.model='mlx-community/whisper-large-v3-mlx-4bit';
    timing.confidence=round(ratio,3);timing.stats.modelAgreementRatio=null;
    provenance.measurementKind='transcript-timestamps';provenance.performanceMap=performanceMapping;provenance.comparisonSource=comparisonSource;provenance.conflictCorroboration=opts.corroboration?.runs||[];provenance.models.alignment=null;provenance.models.occurrenceCorroboration=opts.corroboration?.runs?.length?'Qwen3 ForcedAligner existing exact-source runs; occurrence selection only':null;
    provenance.wordTiming.method='audio-atlas-whisper-distinctive-monotonic';
    provenance.wordTiming.confidence='share of canonical display words with transcript timestamps; single-model evidence';
    provenance.wordTiming.agreementPolicy='single-model-transcript-coverage-not-independent-agreement';
    timing.lines.forEach((line,i)=>{line.alignmentReview={performanceCoverage:performanceMapping.lines[i].coverage,performanceSupported:performanceMapping.lines[i].supported,sourceRun:performanceMapping.lines[i].sourceRun||p.transcriptRun,reason:performanceMapping.lines[i].reason,modelAgreementRatio:null,needsReview:!performanceMapping.lines[i].supported,humanReviewed:false};});
  }
  if(p.performanceMap) timing.passageReview = inspectEchoLyricPassages(timing);
  const stt = { engine: 'audio-atlas-mlx', model: 'mlx-community/whisper-large-v3-mlx-4bit', words: words.map(w => ({ word: w.text, start: round(w.start), end: round(w.end) })),
    wordTiming: provenance.wordTiming, songId: id, title: p.title, source: provenance.sttInput, audioPath: provenance.audioPath, lyricsPath: p.lyricsPath,
    audioSha256: provenance.audioSha256, lyricsSha256: p.lyricsSha256, atlasTranscriptRun: p.transcriptRun, createdAt: now };
  fs.mkdirSync(outDir, { recursive: true });
  writeJson(path.join(outDir, `${id}.json`), timing); writeJson(path.join(outDir, `${id}.stt.json`), stt);
  return { candidate: path.join(outDir, `${id}.json`), confidence:timing.confidence, stats, warnings };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const atlas = createAudioAtlas({ root });
  try {
    const result = command === 'plan' ? await plan(atlas, opts) : command === 'align' ? await align(atlas, opts) : command === 'assemble' ? assemble(atlas, opts)
      : (() => { throw new Error('Usage: atlas-lyric-timing.mjs plan --song=ID --out=DIR | align --plan=FILE | assemble --plan=FILE [--candidates=DIR]'); })();
    console.log(JSON.stringify({ ok: true, ...result }, null, 1));
  } catch (error) { console.error(JSON.stringify({ ok: false, error: error.message })); process.exitCode = 1; }
  finally { await atlas.close(); }
}
