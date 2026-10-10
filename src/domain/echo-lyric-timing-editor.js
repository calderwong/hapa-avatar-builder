import { echoLyricBoundary } from "./echo-lyric-time.js";
export const ECHO_LYRIC_MANUAL_EDIT_SCHEMA = "hapa.echo.lyric-manual-edit.v1";

const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const round = (value) => Math.round(finite(value) * 1000) / 1000;
const clamp = (value, min, max) => Math.max(min, Math.min(max, finite(value, min)));

function normalizeWord(word = {}, lineStart = 0, lineEnd = lineStart + 0.001) {
  const start = clamp(echoLyricBoundary(word, "start", lineStart), lineStart, lineEnd);
  const end = clamp(Math.max(start + 0.001, echoLyricBoundary(word, "end", start + 0.001)), start + 0.001, lineEnd);
  const { startSeconds, endSeconds, ...canonical } = word;
  return { ...canonical, start: round(start), end: round(end) };
}

export function normalizeEchoLyricTimingLines(lines = [], durationSeconds = Infinity) {
  const duration = Number.isFinite(Number(durationSeconds)) && Number(durationSeconds) > 0
    ? Number(durationSeconds)
    : Infinity;
  return (Array.isArray(lines) ? lines : []).map((line, index) => {
    const previousEnd = index > 0 ? echoLyricBoundary(lines[index - 1], "end") : 0;
    const start = clamp(echoLyricBoundary(line, "start"), 0, duration);
    const end = clamp(Math.max(start + 0.001, echoLyricBoundary(line, "end", Math.max(start + 0.001, previousEnd))), start + 0.001, duration);
    const words = (Array.isArray(line?.words) ? line.words : []).map((word) => normalizeWord(word, start, end));
    const { startSeconds, endSeconds, ...canonical } = line;
    return {
      ...canonical,
      text: String(line?.text || "").trim(),
      start: round(start),
      end: round(end),
      words,
    };
  });
}

export function shiftEchoLyricLine(lines = [], lineIndex = 0, deltaSeconds = 0, durationSeconds = Infinity) {
  const normalized = normalizeEchoLyricTimingLines(lines, durationSeconds);
  const target = normalized[lineIndex];
  if (!target) return normalized;
  const duration = Number.isFinite(Number(durationSeconds)) ? Number(durationSeconds) : Infinity;
  const previousEnd = lineIndex > 0 ? normalized[lineIndex - 1].end : 0;
  const nextStart = lineIndex < normalized.length - 1 ? normalized[lineIndex + 1].start : duration;
  const length = target.end - target.start;
  const minimumStart = Math.max(0, previousEnd);
  const maximumStart = Math.max(minimumStart, nextStart - length);
  const nextLineStart = clamp(target.start + finite(deltaSeconds), minimumStart, maximumStart);
  const appliedDelta = nextLineStart - target.start;
  normalized[lineIndex] = {
    ...target,
    start: round(nextLineStart),
    end: round(nextLineStart + length),
    words: target.words.map((word) => ({
      ...word,
      start: round(word.start + appliedDelta),
      end: round(word.end + appliedDelta),
    })),
  };
  return normalized;
}

export function setEchoLyricLineBoundary(lines = [], lineIndex = 0, boundary = "start", value = 0, durationSeconds = Infinity) {
  const normalized = normalizeEchoLyricTimingLines(lines, durationSeconds);
  const target = normalized[lineIndex];
  if (!target) return normalized;
  const duration = Number.isFinite(Number(durationSeconds)) ? Number(durationSeconds) : Infinity;
  const previousEnd = lineIndex > 0 ? normalized[lineIndex - 1].end : 0;
  const nextStart = lineIndex < normalized.length - 1 ? normalized[lineIndex + 1].start : duration;
  const start = boundary === "start"
    ? clamp(value, previousEnd, target.end - 0.001)
    : target.start;
  const end = boundary === "end"
    ? clamp(value, target.start + 0.001, nextStart)
    : target.end;
  normalized[lineIndex] = {
    ...target,
    start: round(start),
    end: round(end),
    words: target.words.map((word) => normalizeWord(word, start, end)),
  };
  return normalized;
}

export function updateEchoLyricLineText(lines = [], lineIndex = 0, value = "", durationSeconds = Infinity) {
  const normalized = normalizeEchoLyricTimingLines(lines, durationSeconds);
  if (!normalized[lineIndex]) return normalized;
  normalized[lineIndex] = { ...normalized[lineIndex], text: String(value || "") };
  return normalized;
}

export function shiftEchoLyricWord(lines = [], lineIndex = 0, wordIndex = 0, deltaSeconds = 0, durationSeconds = Infinity) {
  const normalized = normalizeEchoLyricTimingLines(lines, durationSeconds);
  const line = normalized[lineIndex];
  const word = line?.words?.[wordIndex];
  if (!line || !word) return normalized;
  const previousEnd = wordIndex > 0 ? line.words[wordIndex - 1].end : line.start;
  const nextStart = wordIndex < line.words.length - 1 ? line.words[wordIndex + 1].start : line.end;
  const length = word.end - word.start;
  const start = clamp(word.start + finite(deltaSeconds), previousEnd, Math.max(previousEnd, nextStart - length));
  const words = line.words.map((candidate, index) => index === wordIndex
    ? { ...candidate, start: round(start), end: round(start + length) }
    : candidate);
  normalized[lineIndex] = { ...line, words };
  return normalized;
}

export function applyEchoLyricGlobalOffset(lines = [], deltaSeconds = 0, durationSeconds = Infinity) {
  const normalized = normalizeEchoLyricTimingLines(lines, durationSeconds);
  if (!normalized.length) return normalized;
  const duration = Number.isFinite(Number(durationSeconds)) ? Number(durationSeconds) : Infinity;
  const minimumDelta = -normalized[0].start;
  const maximumDelta = duration - normalized[normalized.length - 1].end;
  const appliedDelta = clamp(deltaSeconds, minimumDelta, maximumDelta);
  return normalized.map((line) => ({
    ...line,
    start: round(line.start + appliedDelta),
    end: round(line.end + appliedDelta),
    words: line.words.map((word) => ({
      ...word,
      start: round(word.start + appliedDelta),
      end: round(word.end + appliedDelta),
    })),
  }));
}

export function inspectEchoLyricManualTiming(lines = [], durationSeconds = Infinity) {
  const normalized = normalizeEchoLyricTimingLines(lines, durationSeconds);
  const issues = [];
  normalized.forEach((line, lineIndex) => {
    if (!line.text.trim()) issues.push({ code: "empty-line", lineIndex });
    if (!(line.end > line.start)) issues.push({ code: "invalid-line-interval", lineIndex });
    if (lineIndex > 0 && line.start < normalized[lineIndex - 1].end) issues.push({ code: "overlapping-lines", lineIndex });
    line.words.forEach((word, wordIndex) => {
      if (!(word.end > word.start)) issues.push({ code: "invalid-word-interval", lineIndex, wordIndex });
      if (word.start < line.start || word.end > line.end) issues.push({ code: "word-outside-line", lineIndex, wordIndex });
      if (wordIndex > 0 && word.start < line.words[wordIndex - 1].end) issues.push({ code: "overlapping-words", lineIndex, wordIndex });
    });
  });
  return {
    schemaVersion: ECHO_LYRIC_MANUAL_EDIT_SCHEMA,
    ok: issues.length === 0,
    lineCount: normalized.length,
    wordCount: normalized.reduce((sum, line) => sum + line.words.length, 0),
    issues,
    lines: normalized,
  };
}

export const ECHO_LYRIC_CORRECTION_SCHEMA = "hapa.echo.lyric-corrections.v1";

/** A cut-owned correction transaction. Source evidence is never promoted by an
 * edit; the existing saved-cut projection carries this journal and its lines. */
export function applyEchoLyricCorrection(project = {}, command = {}, { at = new Date().toISOString() } = {}) {
  const original = Array.isArray(project.timed_lyrics) ? project.timed_lyrics : [];
  const previous = project.lyric_timing_manual_edit;
  const state = previous?.schemaVersion === ECHO_LYRIC_CORRECTION_SCHEMA ? structuredClone(previous) : {
    schemaVersion: ECHO_LYRIC_CORRECTION_SCHEMA, revision: 0,
    source: { songId: project.song_id || null, audioId: project.audio_id || project.registry_track_id || null,
      audioHash: project.lyrics?.audioHash || project.song_edit_map?.timingTruth?.audioSha256 || null,
      timingHash: project.lyrics?.timingHash || null, lyrics: structuredClone(project.lyrics || null),
      originalLines: structuredClone(original), previousEdit: structuredClone(previous || null) },
    history: [], undo: [],
  };
  const fail = message => { throw new Error(message); };
  if (state.source.songId !== (project.song_id || null)) fail("These corrections belong to a different song.");
  const currentAudioId = project.audio_id || project.registry_track_id || null;
  if (state.source.audioId !== currentAudioId || (state.source.audioHash && project.lyrics?.audioHash && state.source.audioHash !== project.lyrics.audioHash)) fail("The audio source changed. Start a source-bound review for the current audio.");
  const request = Object.fromEntries(Object.entries(command).filter(([key]) => !["id", "expectedRevision"].includes(key)).sort(([a], [b]) => a.localeCompare(b)));
  const duplicate = command.id && state.history.find(row => row.id === command.id);
  if (duplicate) {
    if (JSON.stringify(duplicate.request) !== JSON.stringify(request)) fail("This correction ID already belongs to a different action.");
    return null;
  }
  if (command.expectedRevision !== undefined && command.expectedRevision !== state.revision) fail("Lyrics changed. Review the current correction before retrying.");
  if (state.history.length >= 2000) fail("This cut has reached its 2,000-action correction limit. Existing corrections and history are preserved.");
  const kind = command.type, index = Number(command.lineIndex ?? 0), wordIndex = Number(command.wordIndex ?? 0);
  if (["shift-line", "shift-word", "global-offset"].includes(kind) && !Number.isFinite(Number(command.deltaSeconds))) fail("Enter a finite timing offset.");
  if (kind === "line-boundary" && (!["start", "end"].includes(command.boundary) || !Number.isFinite(Number(command.value)))) fail("Enter a valid line boundary.");
  const duration = Number(project.duration) > 0 ? Number(project.duration) : Infinity;
  let lines = structuredClone(original);
  const line = lines[index], word = line?.words?.[wordIndex];
  const locked = row => row?.manualTimingLocked === true;
  const requireLine = (row) => { if (!row) fail("Select a lyric line."); if (locked(row) || row.words?.some(locked)) fail("Unlock the line and its words before changing this interval."); };
  const requireWord = () => { if (!word) fail("Select a word."); if (locked(line) || locked(word)) fail("Unlock this word and its line before changing it."); };
  const tokenText = words => words.map(row => String(row.word ?? row.text ?? "")).join(" ");
  const editedWord = (next, before) => ({ ...next, confidence: null, probability: null,
    timingCorrection: { status: "unverified-correction", source: structuredClone(Array.isArray(before) ? before.map(w => w.timingCorrection?.source ?? w) : before.timingCorrection?.source ?? before), editedAt: at } });
  const preserveConfidence = (next, before) => ({ ...next, ...(echoLyricBoundary(next, "start") !== echoLyricBoundary(before, "start") || echoLyricBoundary(next, "end") !== echoLyricBoundary(before, "end") ? { confidence: null, timing_source: "manual-correction-unverified" } : {}), words: (next.words || []).map((w, i) => {
    const old = before.words?.[i];
    return old && (echoLyricBoundary(old, "start") !== echoLyricBoundary(w, "start") || echoLyricBoundary(old, "end") !== echoLyricBoundary(w, "end")) ? editedWord(w, old) : w;
  }) });
  if (kind === "undo") {
    const entry = state.undo.pop(); if (!entry) fail("No retained lyric correction to undo.");
    // Each inverse replaces only the affected interval of line records.
    if (JSON.stringify(lines.slice(entry.index, entry.index + entry.after.length)) !== JSON.stringify(entry.after)) fail("The corrected lines changed outside this review. Resolve that conflict before undoing.");
    lines.splice(entry.index, entry.after.length, ...structuredClone(entry.before));
  } else if (kind === "lock-line") {
    if (!line) fail("Select a lyric line."); line.manualTimingLocked = command.locked === true;
  } else if (kind === "lock-word") {
    if (!word) fail("Select a word."); if (locked(line)) fail("Unlock the line before changing a word lock."); word.manualTimingLocked = command.locked === true;
  } else if (kind === "reference-onset") {
    if (!word) fail("Select a word.");
    const onsetSeconds = Number(command.atSeconds), ambiguityMs = Number(command.ambiguityMs);
    const audioHash = String(command.audioHash || "").replace(/^sha256:/, "");
    if (!/^[a-f0-9]{64}$/.test(audioHash)) fail("Load the verified source waveform before recording a reference.");
    const declaredHash = String(project.lyrics?.audioHash || project.song_edit_map?.timingTruth?.audioSha256 || "").replace(/^sha256:/, "");
    if (declaredHash && declaredHash !== audioHash) fail("The reference audio does not match this cut. Reconcile its source before reviewing.");
    if (command.atSeconds == null || command.atSeconds === "" || command.ambiguityMs == null || command.ambiguityMs === "") fail("Enter a reference time and uncertainty.");
    if (!String(command.reviewer || "").trim()) fail("Enter the annotator name for this reference.");
    if (!(Number.isFinite(onsetSeconds) && onsetSeconds >= 0 && onsetSeconds <= duration && Number.isFinite(ambiguityMs) && ambiguityMs >= 0 && ambiguityMs <= 1000)) fail("Enter a valid reference time and uncertainty.");
    const sourceWord = word.timingCorrection?.source || word;
    const sourceStart = Array.isArray(sourceWord) || String(sourceWord.word || sourceWord.text || "") !== String(word.word || word.text || "") ? NaN : echoLyricBoundary(sourceWord, "start", NaN);
    word.timingReference = { status: "operator-entered-reference", reviewer: String(command.reviewer).trim(), at,
      audioHash, wordText: String(word.word || word.text || ""), onsetSeconds, ambiguityMs,
      candidateStartSeconds: Number.isFinite(sourceStart) ? sourceStart : null };
  } else if (kind === "global-offset") {
    lines.forEach(row => requireLine(row));
    lines = applyEchoLyricGlobalOffset(lines, command.deltaSeconds, duration).map((row, i) => preserveConfidence(row, original[i]));
  } else if (kind === "shift-line" || kind === "line-boundary") {
    requireLine(line);
    const next = kind === "shift-line" ? shiftEchoLyricLine(lines, index, command.deltaSeconds, duration)[index]
      : setEchoLyricLineBoundary(lines, index, command.boundary, command.value, duration)[index];
    lines[index] = preserveConfidence(next, original[index]);
  } else if (kind === "line-text") {
    requireLine(line);
    if (!String(command.text || "").trim()) fail("A lyric line needs text.");
    lines[index] = { ...line, text: String(command.text), words: [],
      textCorrection: { status: "alignment-required", sourceWords: structuredClone(line.words || []), editedAt: at } };
  } else if (kind === "shift-word") {
    requireWord();
    const next = shiftEchoLyricWord(lines, index, wordIndex, command.deltaSeconds, duration)[index];
    // Do not normalize unrelated source words while nudging one word.
    line.words[wordIndex] = preserveConfidence(next, original[index]).words[wordIndex];
  } else if (kind === "split-word") {
    requireWord(); const split = Number(command.atSeconds);
    const start = echoLyricBoundary(word, "start"), end = echoLyricBoundary(word, "end");
    if (!(Number.isFinite(split) && split > start && split < end)) fail("Choose a split time inside the selected word.");
    if (!String(command.left || "").trim() || !String(command.right || "").trim()) fail("Enter both resulting words.");
    const { startSeconds, endSeconds, timingReference, ...source } = word;
    const left = editedWord({ ...source, word: String(command.left).trim(), text: String(command.left).trim(), start, end: split }, word);
    const right = editedWord({ ...source, word: String(command.right).trim(), text: String(command.right).trim(), start: split, end }, word);
    line.words.splice(wordIndex, 1, left, right); line.text = tokenText(line.words);
  } else if (kind === "merge-word") {
    requireWord(); const next = line.words[wordIndex + 1]; if (!next) fail("There is no following word to merge.");
    if (locked(next)) fail("Unlock the following word before merging.");
    const merged = editedWord({ word: tokenText([word, next]), start: echoLyricBoundary(word, "start"), end: echoLyricBoundary(next, "end") }, [word, next]);
    line.words.splice(wordIndex, 2, merged); line.text = tokenText(line.words);
  } else if (kind === "split-line") {
    requireLine(line); const cut = Number(command.beforeWordIndex);
    if (!Number.isInteger(cut) || cut <= 0 || cut >= (line.words || []).length) fail("Select a word after the first word to split the line before it.");
    const left = line.words.slice(0, cut), right = line.words.slice(cut);
    const { startSeconds, endSeconds, id, ...source } = line;
    lines.splice(index, 1,
      { ...source, id: id ? `${id}:left:${state.revision + 1}` : undefined, start: echoLyricBoundary(line, "start"), end: echoLyricBoundary(left.at(-1), "end"), words: left, text: tokenText(left) },
      { ...source, id: id ? `${id}:right:${state.revision + 1}` : undefined, start: echoLyricBoundary(right[0], "start"), end: echoLyricBoundary(line, "end"), words: right, text: tokenText(right) });
  } else if (kind === "merge-line") {
    requireLine(line); const next = lines[index + 1]; requireLine(next);
    const { startSeconds, endSeconds, ...source } = line;
    lines.splice(index, 2, { ...source, start: echoLyricBoundary(line, "start"), end: echoLyricBoundary(next, "end"), text: `${line.text} ${next.text}`, words: [...(line.words || []), ...(next.words || [])] });
  } else fail("Unknown lyric correction.");
  if (JSON.stringify(lines) === JSON.stringify(original)) return null;
  // Record a compact inverse, keeping source records outside the edit byte-for-byte.
  let first = 0; while (first < lines.length && first < original.length && JSON.stringify(lines[first]) === JSON.stringify(original[first])) first++;
  let lastBefore = original.length, lastAfter = lines.length;
  while (lastBefore > first && lastAfter > first && JSON.stringify(original[lastBefore - 1]) === JSON.stringify(lines[lastAfter - 1])) { lastBefore--; lastAfter--; }
  const before = structuredClone(original.slice(first, lastBefore)), after = structuredClone(lines.slice(first, lastAfter));
  for (const row of kind === "undo" ? [] : after) {
    const start = echoLyricBoundary(row, "start", NaN), end = echoLyricBoundary(row, "end", NaN);
    if (!(Number.isFinite(start) && Number.isFinite(end) && start >= 0 && end > start && end <= duration)) fail("The correction would create an invalid line interval.");
    for (const w of row.words || []) if (!(echoLyricBoundary(w, "start", NaN) >= start && echoLyricBoundary(w, "end", NaN) <= end && echoLyricBoundary(w, "end", NaN) > echoLyricBoundary(w, "start", NaN))) fail("The correction would place a word outside its line.");
  }
  const revision = state.revision + 1;
  const record = { id: command.id || `correction:${revision}`, revision, at, type: kind, request, index: first, before, after };
  state.history.push(record); state.revision = revision;
  if (kind !== "undo") { state.undo.push(record); state.undo = state.undo.slice(-64); }
  return { timed_lyrics: lines, lyric_timing_manual_edit: state };
}

/** Report operator references without manufacturing annotations or making the
 * current corrected times their own ground truth. Album coverage is separate. */
export function summarizeEchoLyricOnsetReview(project = {}, audioHash = "") {
  const hash = String(audioHash).replace(/^sha256:/, ""), rows = [], rejected = [];
  let wordCount = 0;
  for (const [lineIndex, line] of (project.timed_lyrics || []).entries()) for (const [wordIndex, word] of (line.words || []).entries()) {
    wordCount++;
    const reference = word.timingReference; if (!reference) continue;
    const text = String(word.word || word.text || ""), current = echoLyricBoundary(word, "start", NaN);
    if (!/^[a-f0-9]{64}$/.test(hash) || reference.audioHash !== hash || reference.wordText !== text || reference.status !== "operator-entered-reference"
      || !String(reference.reviewer || "").trim() || !Number.isFinite(reference.onsetSeconds) || reference.onsetSeconds < 0 || reference.onsetSeconds > Number(project.duration)
      || !Number.isFinite(reference.ambiguityMs) || reference.ambiguityMs < 0 || reference.ambiguityMs > 1000 || !Number.isFinite(current)) {
      rejected.push({ lineIndex, wordIndex, reason: "reference-source-or-word-mismatch" }); continue;
    }
    rows.push({ ...reference, lineIndex, wordIndex, text, currentStartSeconds: current,
      candidateAbsoluteErrorMs: Number.isFinite(reference.candidateStartSeconds) ? Math.abs(reference.candidateStartSeconds - reference.onsetSeconds) * 1000 : null,
      currentAbsoluteErrorMs: Math.abs(current - reference.onsetSeconds) * 1000 });
  }
  return { schemaVersion: "hapa.echo.lyric-onset-review.v1", songId: project.song_id || null, audioHash: hash || null,
    wordCount, referencedWords: rows.length, unreferencedWords: wordCount - rows.length, rejected,
    importedCandidate: timingErrorDistribution(rows.map(row => row.candidateAbsoluteErrorMs)), corrected: timingErrorDistribution(rows.map(row => row.currentAbsoluteErrorMs)),
    maximumDeclaredAmbiguityMs: rows.length ? Math.max(...rows.map(row => Number(row.ambiguityMs) || 0)) : null,
    scope: "Operator-entered references for this cut; not independent annotator authentication or album acceptance", rows };
}

export function timingErrorDistribution(values) {
    const sorted = values.filter(Number.isFinite).sort((a, b) => a - b); if (!sorted.length) return { count: 0, medianMs: null, p95Ms: null };
    const mid = Math.floor(sorted.length / 2);
    return { count: sorted.length, medianMs: sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2, p95Ms: sorted[Math.ceil(sorted.length * .95) - 1] };
}
