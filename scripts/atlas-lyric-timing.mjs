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
import { createAudioAtlas } from '../server/audio-atlas.mjs';
import { echoLyricResolvedWordIntervals } from '../src/domain/echo-lyric-template-runtime.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [command, ...rest] = process.argv.slice(2);
const opts = Object.fromEntries(rest.map(arg => { const at = arg.indexOf('='); return at < 0 ? [arg.replace(/^--/, ''), true] : [arg.slice(2, at), arg.slice(at + 1)]; }));
const WINDOW_SECONDS = 29.5, PAD_SECONDS = 1, AGREE_SECONDS = 1.0;
const sha = value => createHash('sha256').update(value).digest('hex');
const norm = value => String(value || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '');
const roleKey = value => String(value || '').toLowerCase().replace(/^\d+[-_ .]+/, '').replace(/[-_]+/g, ' ').trim();
const round = (value, digits = 2) => Math.round(value * 10 ** digits) / 10 ** digits;
const stamp = seconds => `${Math.floor(seconds / 60)}:${(seconds % 60).toFixed(2).padStart(5, '0')}`;
const readJson = file => JSON.parse(fs.readFileSync(file, 'utf8'));
const writeJson = (file, value) => fs.writeFileSync(file, JSON.stringify(value, null, 1) + '\n');

function lyricLines(song) {
  const text = typeof song.lyrics === 'string' ? song.lyrics : song.lyrics?.text || '';
  return text.split(/\r?\n/).map(line => line.trim()).filter(line => line && !/^\[[^\]]*\]$/.test(line));
}

// Longest-common-subsequence match of lyric tokens to transcript words (indices, in order).
function matchTokens(lyricTokens, words) {
  const n = lyricTokens.length, m = words.length, dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i -= 1) for (let j = m - 1; j >= 0; j -= 1)
    dp[i][j] = lyricTokens[i].norm && lyricTokens[i].norm === words[j].norm ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const pairs = []; let i = 0, j = 0;
  while (i < n && j < m) {
    if (lyricTokens[i].norm && lyricTokens[i].norm === words[j].norm) { pairs.push([i, j]); i += 1; j += 1; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) i += 1; else j += 1;
  }
  return pairs;
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

async function plan(atlas) {
  if (!opts.song || !opts.out) throw new Error('plan --song=ID --out=DIR [--transcript-run=RUN]');
  const store = readJson(process.env.HAPA_SONG_STORE || path.join(root, 'data/hapa-songs-store.json'));
  const song = store.songs.find(s => s.id === opts.song);
  if (!song) throw new Error(`Unknown song ${opts.song}`);
  const sources = atlas.list().find(s => s.id === opts.song)?.sources || [];
  const vocal = sources.find(s => ['lead vocals', 'vocals'].includes(roleKey(s.role)));
  if (!vocal) throw new Error('No isolated Lead Vocals/Vocals stem is registered; run the Atlas on a song with one stem set first');
  const runs = atlas.jobs(opts.song).filter(j => j.state === 'complete').sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)));
  const transcriptRun = opts['transcript-run'] || runs.find(j => { try { return atlas.result(j.id).transcript_candidate?.source_asset_id === vocal.id; } catch { return false; } })?.id;
  if (!transcriptRun) throw new Error('No complete Atlas run with an MLX Whisper transcript of the vocal stem; run `node cli/audio-atlas.mjs analyze SONG --transcribe --beats --acoustic` first');
  const result = atlas.result(transcriptRun), duration = result.assets[0].sample_count / result.assets[0].sample_rate_hz;
  const words = transcriptWords(atlas, transcriptRun, vocal.id), lines = lyricLines(song);
  const tokens = lines.flatMap((line, index) => line.split(/\s+/).map(text => ({ line: index, norm: norm(text) })));
  const spans = lines.map(() => null);
  for (const [t, w] of matchTokens(tokens, words)) {
    const line = tokens[t].line, word = words[w];
    spans[line] = spans[line] ? [Math.min(spans[line][0], word.start), Math.max(spans[line][1], word.end)] : [word.start, word.end];
  }
  const anchored = spans.filter(Boolean).length;
  for (let i = 0; i < spans.length; i += 1) if (!spans[i]) {
    const prev = spans.slice(0, i).reverse().find(Boolean)?.[1] ?? 0, next = spans.slice(i + 1).find(Boolean)?.[0] ?? duration;
    spans[i] = [prev, Math.max(prev + 0.5, next)];
  }
  const windows = [];
  for (const [index, [start, end]] of spans.entries()) {
    const s = Math.max(0, start - PAD_SECONDS), e = Math.min(duration, end + PAD_SECONDS), current = windows.at(-1);
    if (current && e - current.startSeconds <= WINDOW_SECONDS) { current.endSeconds = Math.max(current.endSeconds, e); current.lines.push(index); }
    else windows.push({ startSeconds: s, endSeconds: e, lines: [index] });
  }
  for (const w of windows) {
    w.startSeconds = round(w.startSeconds); w.endSeconds = round(Math.min(w.endSeconds, w.startSeconds + 30, duration));
    w.text = w.lines.map(i => lines[i]).join('\n'); w.runId = null; w.state = 'planned';
  }
  fs.mkdirSync(opts.out, { recursive: true });
  // Exact stored lyric bytes, so lyricsSha256 matches the Song Card's lyrics.sha256.
  const lyricsText = typeof song.lyrics === 'string' ? song.lyrics : song.lyrics?.text || '', lyricsPath = path.resolve(opts.out, 'lyrics.txt');
  fs.writeFileSync(lyricsPath, lyricsText);
  const out = { schemaVersion: 'hapa.audio-atlas.lyric-timing-plan.v1', createdAt: new Date().toISOString(), songId: song.id, title: song.title,
    registryTrackId: song.audio?.registryTrackId || null, vocalSource: { id: vocal.id, role: vocal.role, ...sourceIdentity(transcriptRun, vocal.id) },
    transcriptRun, transcriptWordCount: words.length, durationSeconds: duration, lyricsPath, lyricsSha256: sha(lyricsText),
    storeLyricsSha256: song.lyrics?.sha256 || null, lines, anchoredLines: anchored, windows };
  writeJson(path.join(opts.out, 'plan.json'), out);
  return { plan: path.join(opts.out, 'plan.json'), lines: lines.length, anchoredLines: anchored, windows: windows.length };
}

async function align(atlas) {
  const planPath = path.resolve(opts.plan), p = readJson(planPath);
  for (const [index, w] of p.windows.entries()) {
    if (w.state === 'complete') continue;
    const started = await atlas.start(p.songId, { alignment: { sourceId: p.vocalSource.id, startSeconds: w.startSeconds, endSeconds: w.endSeconds, text: w.text, language: 'English' } });
    const done = await atlas.wait(started.id);
    Object.assign(w, { runId: done.id, state: done.state });
    writeJson(planPath, p);
    console.log(JSON.stringify({ window: index, runId: done.id, state: done.state }));
    if (done.state !== 'complete') throw new Error(`Alignment window ${index} ended ${done.state}; resume with the same command after inspecting it`);
  }
  return { plan: planPath, windows: p.windows.length, complete: p.windows.filter(w => w.state === 'complete').length };
}

function assemble(atlas) {
  const p = readJson(path.resolve(opts.plan)), outDir = path.resolve(opts.candidates || path.join(path.dirname(path.resolve(opts.plan)), 'candidates'));
  if (p.windows.some(w => w.state !== 'complete')) throw new Error('Run align until every window is complete');
  if (!p.vocalSource.sha256) Object.assign(p.vocalSource, sourceIdentity(p.transcriptRun, p.vocalSource.id));
  for (const w of p.windows) {
    const used = sourceIdentity(w.runId, p.vocalSource.id);
    if (used.sha256 !== p.vocalSource.sha256) throw new Error(`Window run ${w.runId} aligned different vocal bytes than the transcript run`);
  }
  const words = transcriptWords(atlas, p.transcriptRun, p.vocalSource.id);
  const aligned = p.lines.map(line => line.split(/\s+/).map(text => ({ text, start: null, end: null, matched: false })));
  const runs = [];
  for (const w of p.windows) {
    const fa = atlas.result(w.runId).forced_alignment, rate = fa.analysis_view.source_reference_rate_hz;
    if (fa.supplied_text !== w.text) throw new Error(`Window text changed for run ${w.runId}`);
    runs.push({ runId: w.runId, startSeconds: w.startSeconds, endSeconds: w.endSeconds, rawEvidenceSha256: fa.raw_evidence_sha256, inputPcmSha256: fa.input_pcm_sha256 });
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
  let agreeing = 0, alignedCount = 0, overlapCount = 0;
  const out = aligned.map((lineWords, index) => {
    for (const w of lineWords.filter(x => x.matched)) {
      alignedCount += 1;
      if (words.some(t => t.norm === norm(w.text) && Math.abs(t.start - w.start) <= AGREE_SECONDS)) agreeing += 1;
    }
    const hits = lineWords.filter(x => x.matched);
    return { index, text: p.lines[index], hits, lineWords };
  });
  // Unmatched lines sit between their anchored neighbours. Inside a line, unmatched words are placed
  // between the neighbouring aligned words (the same resolver the renderer uses), never spread over the
  // whole line where they would overlap aligned words. Leading/trailing unmatched words extend the line
  // into the silence around it by up to LEAD_SECONDS per word. Out-of-order matches lose their anchor.
  const LEAD_SECONDS = 0.3;
  for (const [i, line] of out.entries()) {
    if (!line.hits.length) {
      const prev = out.slice(0, i).reverse().find(l => l.hits.length), next = out.slice(i + 1).find(l => l.hits.length);
      const s = prev ? prev.hits.at(-1).end : 0, e = next ? next.hits[0].start : p.durationSeconds;
      line.start = s; line.end = Math.max(s + 0.1, e);
    } else {
      const lead = line.lineWords.findIndex(w => w.matched), trail = line.lineWords.length - 1 - line.lineWords.findLastIndex(w => w.matched);
      const prevEnd = i ? out[i - 1].end : 0, nextStart = out.slice(i + 1).find(l => l.hits.length)?.hits[0].start ?? p.durationSeconds;
      line.start = Math.min(line.hits[0].start, Math.max(prevEnd, line.hits[0].start - LEAD_SECONDS * lead));
      line.end = Math.max(line.hits.at(-1).end, Math.min(nextStart, line.hits.at(-1).end + LEAD_SECONDS * trail));
    }
    const resolved = echoLyricResolvedWordIntervals({ start: line.start, end: line.end,
      words: line.lineWords.map(w => ({ word: w.text, start: w.matched ? w.start : null, end: w.matched ? w.end : null, matched: w.matched })) }).words;
    line.lineWords.forEach((w, k) => Object.assign(w, { start: resolved[k].start, end: resolved[k].end, matched: resolved[k].anchored }));
  }
  for (let i = 0; i + 1 < out.length; i += 1) if (out[i].end > out[i + 1].start) { overlapCount += 1; out[i].end = out[i + 1].start; }
  const wordCount = aligned.flat().length, ratio = wordCount ? alignedCount / wordCount : 0, agreement = alignedCount ? agreeing / alignedCount : 0;
  const unmatchedLines = out.filter(l => !l.hits.length).length;
  const confidence = round(ratio * agreement, 3), warnings = [];
  if (ratio < 0.6) warnings.push('low_match_ratio');
  if (unmatchedLines / out.length > 0.2) warnings.push('many_unmatched_lines');
  const starts = out.map(l => round(l.start));
  const stats = { lineCount: out.length, sectionCount: 0, wordCount, displayWordCount: wordCount, alignmentWordCount: wordCount, matchedWords: alignedCount,
    matchedRatio: round(ratio, 3), sttWordCount: words.length, modelAgreementRatio: round(agreement, 3), firstVocal: round(out[0].start), lastVocal: round(out.at(-1).end),
    overlapCount: 0, overlapsClamped: overlapCount, duplicateStartCount: starts.length - new Set(starts).size, unmatchedLineCount: unmatchedLines,
    alignableLineCount: out.length, anchoredLineCount: out.length - unmatchedLines, alignableAnchorCoverage: round((out.length - unmatchedLines) / out.length, 3) };
  const now = new Date().toISOString(), id = p.registryTrackId || p.songId;
  const provenance = { node: 'hapa-avatar-builder', pipeline: 'audio-atlas-lyric-timing.v1', timingSource: 'audio-atlas-mlx', sttInput: `stem:${p.vocalSource.role}`,
    sttInputStemType: p.vocalSource.role, requestedSttSource: 'vocals', audioPath: p.vocalSource.path, audioSha256: p.vocalSource.sha256,
    lyricsPath: p.lyricsPath, lyricsSha256: p.lyricsSha256, storeLyricsSha256: p.storeLyricsSha256, alignedAt: now, atlasTranscriptRun: p.transcriptRun, atlasAlignmentRuns: runs,
    models: { transcription: 'mlx-community/whisper-large-v3-mlx-4bit (Audio Atlas local-model.json)', alignment: 'mlx-community/Qwen3-ForcedAligner-0.6B-8bit (Audio Atlas alignment-model.json)' },
    wordTiming: { schema: 'hapa.audio-atlas.word-timing-receipt.v1', granularity: 'word', method: 'audio-atlas-qwen3-forced-alignment-windowed', windowSeconds: 30,
      confidence: 'aligned-word ratio x MLX Whisper agreement within ±1 s', syllableExact: false, humanReviewed: false } };
  const timing = { version: 3, alignmentVersion: 'audio-atlas.qwen3-forced-alignment.windowed.v1', method: 'audio_atlas_forced_alignment', source: `stem:${p.vocalSource.role}`,
    engine: 'audio-atlas-mlx', model: 'mlx-community/Qwen3-ForcedAligner-0.6B-8bit', analyzedAt: now, duration: round(p.durationSeconds), confidence, warnings, stats, sections: [],
    lines: out.map(l => ({ index: l.index, sectionIndex: -1, section: '', text: l.text, start: round(l.start), end: round(l.end), timestamp: stamp(l.start), duration: round(l.end - l.start),
      confidence: round(l.hits.length / l.lineWords.length, 3), words: l.lineWords.map(w => ({ text: w.text, start: round(w.start), end: round(w.end), matched: w.matched })) })),
    schema: 'hapa.suno_playlist_lyric_timing.v1', songId: id, title: p.title, playlistId: 'audio-atlas', playlistName: 'Audio Atlas lyric timing', provenance };
  const stt = { engine: 'audio-atlas-mlx', model: 'mlx-community/whisper-large-v3-mlx-4bit', words: words.map(w => ({ word: w.text, start: round(w.start), end: round(w.end) })),
    wordTiming: provenance.wordTiming, songId: id, title: p.title, source: provenance.sttInput, audioPath: provenance.audioPath, lyricsPath: p.lyricsPath,
    audioSha256: provenance.audioSha256, lyricsSha256: p.lyricsSha256, atlasTranscriptRun: p.transcriptRun, createdAt: now };
  fs.mkdirSync(outDir, { recursive: true });
  writeJson(path.join(outDir, `${id}.json`), timing); writeJson(path.join(outDir, `${id}.stt.json`), stt);
  return { candidate: path.join(outDir, `${id}.json`), confidence, stats, warnings };
}

const atlas = createAudioAtlas({ root });
try {
  const result = command === 'plan' ? await plan(atlas) : command === 'align' ? await align(atlas) : command === 'assemble' ? assemble(atlas)
    : (() => { throw new Error('Usage: atlas-lyric-timing.mjs plan --song=ID --out=DIR | align --plan=FILE | assemble --plan=FILE [--candidates=DIR]'); })();
  console.log(JSON.stringify({ ok: true, ...result }, null, 1));
} catch (error) { console.error(JSON.stringify({ ok: false, error: error.message })); process.exitCode = 1; }
finally { await atlas.close(); }
