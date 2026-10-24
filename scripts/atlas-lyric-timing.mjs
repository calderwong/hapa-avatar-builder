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
import { echoLyricComparePerformanceMaps, echoLyricLexemes, echoLyricPerformanceMap, echoLyricAlignmentWindows, inspectEchoLyricPassages } from '../src/domain/echo-lyric-performance.js';
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

function transcriptWords(atlas, runId, sourceId) {
  const result = atlas.result(runId);
  return result.observations.filter(o => o.kind === 'hapa.audio.word_candidate' && o.subject_id === sourceId)
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

export async function plan(atlas, opts) {
  if (!opts.song || !opts.out) throw new Error('plan --song=ID --out=DIR [--transcript-run=RUN]');
  const store = readJson(process.env.HAPA_SONG_STORE || path.join(root, 'data/hapa-songs-store.json'));
  const song = store.songs.find(s => s.id === opts.song);
  if (!song) throw new Error(`Unknown song ${opts.song}`);
  const runs = atlas.jobs(opts.song).filter(j => j.state === 'complete').sort((a,b) => String(b.created_at).localeCompare(String(a.created_at)));
  const transcriptRun = opts['transcript-run'] || runs.find(j => { try { return atlas.result(j.id).transcript_candidate?.word_count > 0; } catch { return false; } })?.id;
  if (!transcriptRun) throw new Error('No complete Atlas transcript; request transcription through the Atlas owner first');
  const result = atlas.result(transcriptRun), sourceId = result.transcript_candidate.source_asset_id;
  const asset = result.assets.find(a=>a.id===sourceId), vocal = {id:sourceId,role:asset.role};
  if(result.song_id !== song.id) throw Error('Transcript belongs to a different song');
  const duration = result.assets[0].sample_count / result.assets[0].sample_rate_hz;
  const words = transcriptWords(atlas, transcriptRun, sourceId), lines = lyricLines(song);
  if(!lines.length) throw Error('No canonical written lyric lines');
  const performanceMap = echoLyricPerformanceMap(lines, words);
  const anchored = performanceMap.supportedLines;
  let windows=[], planningError=null;
  try { windows=echoLyricAlignmentWindows(lines,performanceMap,duration); } catch(error) { planningError=error.message; }
  fs.mkdirSync(opts.out, { recursive: true });
  // Exact stored lyric bytes, so lyricsSha256 matches the Song Card's lyrics.sha256.
  const lyricsText = typeof song.lyrics === 'string' ? song.lyrics : song.lyrics?.text || '', lyricsPath = path.resolve(opts.out, 'lyrics.txt');
  fs.writeFileSync(lyricsPath, lyricsText);
  const out = { schemaVersion: 'hapa.audio-atlas.lyric-timing-plan.v1', createdAt: new Date().toISOString(), songId: song.id, title: song.title,
    registryTrackId: echoLyricRegistryTrackId(song) || null, vocalSource: { id: vocal.id, role: vocal.role, ...sourceIdentity(transcriptRun, vocal.id) },
    transcriptRun, transcriptWordCount: words.length, durationSeconds: duration, lyricsPath, lyricsSha256: sha(lyricsText),
    storeLyricsSha256: song.lyrics?.sha256 || null, lines, lineSections: lines.map((text, i) => song.lyricTimings?.[i]?.text === text ? (song.lyricTimings[i].section || song.lyricTimings[i].section_label || '') : ''), anchoredLines: anchored, performanceMap, planningError, windows };
  writeJson(path.join(opts.out, 'plan.json'), out);
  return { plan: path.join(opts.out, 'plan.json'), lines: lines.length, anchoredLines: anchored, planningError, windows: windows.length };
}

export async function align(atlas, opts) {
  const planPath = path.resolve(opts.plan), p = readJson(planPath);
  if(p.planningError) throw Error(p.planningError);
  if(sha(fs.readFileSync(p.lyricsPath))!==p.lyricsSha256) throw Error('Canonical lyric snapshot changed');
  for (const [index, w] of p.windows.entries()) {
    if (w.state === 'complete') continue;
    const started = await atlas.start(p.songId, { alignmentBaseRunId: p.transcriptRun, alignment: { sourceId: p.vocalSource.id, startSeconds: w.startSeconds, endSeconds: w.endSeconds, text: w.text, language: 'English' } });
    const done = await atlas.wait(started.id);
    Object.assign(w, { runId: done.id, state: done.state });
    writeJson(planPath, p);
    console.log(JSON.stringify({ window: index, runId: done.id, state: done.state }));
    if (done.state !== 'complete') throw new Error(`Alignment window ${index} ended ${done.state}; resume with the same command after inspecting it`);
  }
  return { plan: planPath, windows: p.windows.length, complete: p.windows.filter(w => w.state === 'complete').length };
}

export function assemble(atlas, opts) {
  const p = readJson(path.resolve(opts.plan)), outDir = path.resolve(opts.candidates || path.join(path.dirname(path.resolve(opts.plan)), 'candidates'));
  if(!opts['transcript-only'] && (p.planningError || !p.windows.length)) throw Error(p.planningError || 'No alignment windows');
  if (!opts['transcript-only'] && p.windows.some(w => w.state !== 'complete')) throw new Error('Run align until every window is complete');
  if (!p.vocalSource.sha256) Object.assign(p.vocalSource, sourceIdentity(p.transcriptRun, p.vocalSource.id));
  for (const w of opts['transcript-only'] ? [] : p.windows) {
    const used = sourceIdentity(w.runId, p.vocalSource.id);
    if (used.sha256 !== p.vocalSource.sha256) throw new Error(`Window run ${w.runId} aligned different vocal bytes than the transcript run`);
  }
  const words = transcriptWords(atlas, p.transcriptRun, p.vocalSource.id);
  const aligned = p.lines.map(line => line.split(/\s+/).map(text => ({ text, start: null, end: null, matched: false })));
  const runs = [];
  let performanceMapping=p.performanceMap, comparisonSource=null;
  if(opts['transcript-only']) {
    if(sha(fs.readFileSync(p.vocalSource.originalPath || p.vocalSource.path))!==p.vocalSource.sha256) throw Error('Audio changed since transcript analysis');
    const mapping=echoLyricPerformanceMap(p.lines,words);
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
        word.start=word.start===null?match.start:Math.min(word.start,match.start);word.end=word.end===null?match.end:Math.max(word.end,match.end);word.matched=true;word.evidenceSourceRun=match.evidenceSourceRun||p.transcriptRun;if(match.matchKind==='local-spelling-variant'){word.recognitionMatches??=[];word.recognitionMatches.push({written:match.token,recognized:match.recognizedToken,kind:match.matchKind,transcriptIndex:match.transcriptIndex});}
      }
    }
  }
  for (const w of opts['transcript-only'] ? [] : p.windows) {
    const fa = atlas.result(w.runId).forced_alignment, rate = fa.analysis_view.source_reference_rate_hz;
    if (fa.supplied_text !== w.text) throw new Error(`Window text changed for run ${w.runId}`);
    runs.push({ runId: w.runId, startSeconds: w.startSeconds, endSeconds: w.endSeconds, rawEvidenceSha256: fa.raw_evidence_sha256, inputPcmSha256: fa.input_pcm_sha256 });
    // An explicit later review window replaces earlier candidates for its lines, including abstentions.
    for (const i of w.lines) aligned[i] = p.lines[i].split(/\s+/).map(text => ({ text, start: null, end: null, matched: false }));
    const lineStarts = []; let offset = 0;
    for (const i of w.lines) { lineStarts.push({ line: i, from: offset }); offset += p.lines[i].length + 1; }
    const tokenSlot = token => {
      const owner = [...lineStarts].reverse().find(l => token.text_start >= l.from);
      const before = w.text.slice(owner.from, token.text_start).split(/\s+/).filter(Boolean).length;
      return [owner.line, before];
    };
    for (const c of fa.candidates) {
      const [line, slot] = tokenSlot(fa.supplied_tokens[c.supplied_token_index]);
      if (aligned[line][slot]) Object.assign(aligned[line][slot], { start: c.start_sample / rate, end: c.end_sample / rate, matched: true });
    }
  }
  // Explicit omissions preserve the canonical lyric file and its hash; never infer deletion.
  const omissions = p.timingOmissions ?? [];
  const retained = echoLyricRetainedLineIndexes(p.lines, omissions);
  const newIndex = new Map(retained.map((i,k) => [i,k]));
  const activeWindows = p.windows.map(w => ({...w, lines:w.lines.filter(i=>newIndex.has(i)).map(i=>newIndex.get(i))})).filter(w=>w.lines.length);
  const { rows: out, repairs, alignedCount, agreeing } = assembleEchoLyricIntervals({ lines: retained.map(i=>p.lines[i]), alignedWords: retained.map(i=>aligned[i]), windows: activeWindows, allowCrossSourceBoundaryDemotion:Boolean(opts['comparison-plan']), duration: p.durationSeconds, transcriptWords: words });
  out.forEach(row => { row.index = retained[row.index]; });
  repairs.forEach(repair => { repair.line = retained[repair.line - 1] + 1; });
  const wordCount = out.flatMap(l => l.lineWords).length, canonicalWordCount = aligned.flat().length, ratio = canonicalWordCount ? alignedCount / canonicalWordCount : 0, agreement = alignedCount ? agreeing / alignedCount : 0;
  const unmatchedLines = out.filter(l => !l.hits.length).length;
  const confidence = round(ratio * agreement, 3), warnings = [];
  if (ratio < 0.6) warnings.push('low_match_ratio');
  if (unmatchedLines / out.length > 0.2) warnings.push('many_unmatched_lines');
  const starts = out.map(l => round(l.start));
  const stats = { lineCount: out.length, sectionCount: 0, wordCount, displayWordCount: wordCount, alignmentWordCount: canonicalWordCount, omittedLineCount: omissions.length, matchedWords: alignedCount,
    matchedRatio: round(ratio, 3), sttWordCount: words.length, modelAgreementRatio: round(agreement, 3), firstVocal: round(out[0].start), lastVocal: round(out.at(-1).end),
    overlapCount: 0, overlapsClamped: 0, cropEdgeAnchorsDemoted: repairs.filter(r=>r.reason==='crop-prefix-overlaps-previous-line').length, boundaryAnchorsDemoted: repairs.length, duplicateStartCount: starts.length - new Set(starts).size, unmatchedLineCount: unmatchedLines,
    alignableLineCount: out.length, anchoredLineCount: out.length - unmatchedLines, alignableAnchorCoverage: round((out.length - unmatchedLines) / out.length, 3) };
  const now = new Date().toISOString(), id = p.registryTrackId || p.songId;
  const provenance = { timingOmissions: omissions, node: 'hapa-avatar-builder', pipeline: p.performanceMap ? 'audio-atlas-lyric-timing.v2' : 'audio-atlas-lyric-timing.v1', performanceMap: p.performanceMap || null, timingSource: 'audio-atlas-mlx', sttInput: `stem:${p.vocalSource.role}`,
    sttInputStemType: p.vocalSource.role, requestedSttSource: 'vocals', audioPath: p.vocalSource.path, audioSha256: p.vocalSource.sha256, masterAudioSha256: sourceIdentity(p.transcriptRun,'master').sha256,
    lyricsPath: p.lyricsPath, lyricsSha256: p.lyricsSha256, storeLyricsSha256: p.storeLyricsSha256, alignedAt: now, atlasTranscriptRun: p.transcriptRun, atlasAlignmentRuns: runs,
    models: { transcription: 'mlx-community/whisper-large-v3-mlx-4bit (Audio Atlas local-model.json)', alignment: 'mlx-community/Qwen3-ForcedAligner-0.6B-8bit (Audio Atlas alignment-model.json)' },
    wordTiming: { schema: 'hapa.audio-atlas.word-timing-receipt.v1', granularity: 'word', method: 'audio-atlas-qwen3-forced-alignment-windowed', windowSeconds: 30,
      confidence: 'aligned-word ratio x MLX Whisper agreement within ±1 s', syllableExact: false, humanReviewed: false, boundaryRepair: { repairs }, agreementPolicy: 'unique-monotonic-transcript-occurrence' } };
  const timing = { version: 3, alignmentVersion: 'audio-atlas.qwen3-forced-alignment.windowed.v1', method: 'audio_atlas_forced_alignment', source: `stem:${p.vocalSource.role}`,
    engine: 'audio-atlas-mlx', model: 'mlx-community/Qwen3-ForcedAligner-0.6B-8bit', analyzedAt: now, duration: round(p.durationSeconds), confidence, warnings, stats, sections: [],
    lines: out.map(l => ({ index: l.index, sectionIndex: -1, section: p.lineSections?.[l.index] || '', text: l.text, start: round(l.start, 6), end: round(l.end, 6), timestamp: stamp(l.start), duration: round(l.end - l.start),
      confidence: round(l.hits.length / l.lineWords.length, 3), alignmentReview: { modelAgreementRatio: round(l.agreementRatio, 3), maxStartDisagreementSeconds: l.maxStartDisagreementSeconds, needsReview: l.agreementRatio < .6, humanReviewed: false }, words: l.lineWords.map(w => ({ ...(w.evidenceSourceRun?{evidenceSourceRun:w.evidenceSourceRun}:{}), ...(w.recognitionMatches?{recognitionMatches:w.recognitionMatches}:{}), text: w.text, start: round(w.start, 6), end: round(w.end, 6), matched: w.matched })) })),
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
