export const ECHO_LYRIC_PRECISION_SCHEMA = "hapa.echo.lyric-precision.v1";

function finite(value) {
  if (value === null || value === undefined || value === "" || typeof value === "boolean") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function boundary(value = {}, key = "start") {
  for (const candidate of [value?.[key], value?.[`${key}Seconds`], value?.[`${key}Time`]]) {
    const parsed = finite(candidate);
    if (parsed !== null) return parsed;
  }
  return null;
}

function validInterval(value = {}, parent = null) {
  const start = boundary(value, "start");
  const end = boundary(value, "end");
  if (start === null || end === null || end <= start) return false;
  if (!parent) return true;
  const parentStart = boundary(parent, "start");
  const parentEnd = boundary(parent, "end");
  return parentStart !== null && parentEnd !== null && start >= parentStart - 0.001 && end <= parentEnd + 0.001;
}

function timingSource(project = {}) {
  return String(
    project?.lyric_timing_truth?.timingSource
      || project?.song_edit_map?.provenance?.lyricTimingSource
      || project?.lyric_timing_heal?.timingSource
      || project?.lyric_timing_truth?.source
      || project?.lyrics?.timingSource
      || "missing",
  );
}

function explicitSyllableEvidence(syllable = {}) {
  const source = String(
    syllable.timing_source
      || syllable.timingSource
      || syllable.evidence?.kind
      || syllable.evidence?.source
      || "",
  );
  const confidence = finite(syllable.confidence ?? syllable.probability);
  const reviewed = syllable.evidence?.humanReviewed === true
    && Boolean(String(syllable.evidence?.audioHash || "").trim())
    && Boolean(String(syllable.evidence?.reviewer || "").trim());
  const acoustic = /acoustic|forced|phoneme|syllable|manual/i.test(source);
  return {
    reviewed,
    acoustic,
    trustworthy: reviewed || (acoustic && confidence !== null && confidence >= 0.6),
  };
}

function beatTimesFromProject(project = {}) {
  const candidates = [
    project?.audio_telemetry?.beatTimes,
    project?.audioTelemetry?.beatTimes,
    project?.song_edit_map?.audioTelemetry?.beatTimes,
    project?.beats,
  ];
  for (const candidate of candidates) {
    const times = list(candidate)
      .map((beat) => finite(typeof beat === "object" ? beat.start ?? beat.time ?? beat.seconds : beat))
      .filter((value) => value !== null);
    if (times.length >= 4 && times.every((value, index) => index === 0 || value > times[index - 1])) return times;
  }
  return [];
}

export function assessEchoLyricPrecision(project = {}) {
  const lines = list(project?.timed_lyrics || project?.lines);
  const words = lines.flatMap((line) => list(line?.words).map((word) => ({ word, line })));
  const syllables = words.flatMap(({ word }) => list(word?.syllables).map((syllable) => ({ syllable, word })));
  const source = timingSource(project);
  const validLines = lines.filter((line) => validInterval(line)).length;
  const validWords = words.filter(({ word, line }) => validInterval(word, line)).length;
  const matchedWords = words.filter(({ word }) => word.matched === true && word.unaligned !== true).length;
  const inferredWords = words.filter(({ word }) => word.matched === false
    || word.unaligned === true
    || /inferred|interpolat|synthetic|repair|even-distribution/i.test(String(word.timing_source || word.timingSource || word.timing_repair?.method || ""))).length;
  const validSyllables = syllables.filter(({ syllable, word }) => validInterval(syllable, word)).length;
  const syllableEvidence = syllables.map(({ syllable }) => explicitSyllableEvidence(syllable));
  const reviewedSyllables = syllableEvidence.filter((evidence) => evidence.reviewed).length;
  const trustworthySyllables = syllableEvidence.filter((evidence) => evidence.trustworthy).length;
  const synthetic = /synthetic|weighted|evenly|estimated/i.test(source);
  const humanReviewed = project?.lyric_timing_truth?.humanReviewed === true;
  const beatTimes = beatTimesFromProject(project);

  let level = "missing";
  let label = "Timing missing";
  let animationUnit = "none";
  if (lines.length && synthetic) {
    level = "synthetic-estimate";
    label = "Synthetic phrase estimate";
    animationUnit = "phrase";
  } else if (syllables.length && validSyllables === syllables.length && trustworthySyllables === syllables.length) {
    level = reviewedSyllables === syllables.length ? "syllable-reviewed" : "syllable-acoustic";
    label = reviewedSyllables === syllables.length ? "Human-reviewed syllable timing" : "Acoustically aligned syllables";
    animationUnit = "syllable";
  } else if (words.length && validWords === words.length && matchedWords === words.length) {
    level = humanReviewed ? "word-reviewed" : "word-stt-anchor";
    label = humanReviewed ? "Human-reviewed word timing" : "STT word anchors";
    animationUnit = "word";
  } else if (words.length && validWords === words.length && matchedWords > 0) {
    level = "mixed-word-anchor";
    label = "Mixed STT anchors and interpolation";
    animationUnit = "mixed";
  } else if (lines.length && validLines === lines.length) {
    level = "phrase-estimate";
    label = "Phrase timing only";
    animationUnit = "phrase";
  }

  const exactSyllableReady = level === "syllable-reviewed";
  return {
    schemaVersion: ECHO_LYRIC_PRECISION_SCHEMA,
    level,
    label,
    animationUnit,
    timingSource: source,
    exactSyllableReady,
    beatMappingReady: exactSyllableReady && beatTimes.length >= 4,
    beatCount: beatTimes.length,
    counts: {
      lines: lines.length,
      validLines,
      words: words.length,
      validWords,
      matchedWords,
      inferredWords,
      syllables: syllables.length,
      validSyllables,
      trustworthySyllables,
      reviewedSyllables,
    },
    limitations: [
      !exactSyllableReady && "Exact syllable timing requires explicit syllable intervals reviewed against the source audio.",
      !beatTimes.length && "Beat/count labels require a measured beat grid with phase, not BPM alone.",
      level === "mixed-word-anchor" && "Some displayed word intervals are interpolated between STT anchors.",
      level === "synthetic-estimate" && "Cue spacing was generated from text and duration rather than vocals.",
    ].filter(Boolean),
  };
}

export function mapEchoLyricOnsetToBeat(timeSeconds, beatTimes = [], { beatsPerBar = 4, subdivisions = 4 } = {}) {
  const time = finite(timeSeconds);
  const beats = list(beatTimes).map(finite).filter((value) => value !== null);
  if (time === null || beats.length < 2 || beats.some((value, index) => index > 0 && value <= beats[index - 1])) return null;
  let beatIndex = beats.findLastIndex((value) => value <= time);
  if (beatIndex < 0) beatIndex = 0;
  if (beatIndex >= beats.length - 1) beatIndex = beats.length - 2;
  const duration = beats[beatIndex + 1] - beats[beatIndex];
  const division = Math.max(1, Math.round(subdivisions));
  let subdivisionIndex = Math.round(((time - beats[beatIndex]) / duration) * division);
  if (subdivisionIndex >= division) {
    beatIndex = Math.min(beats.length - 1, beatIndex + 1);
    subdivisionIndex = 0;
  }
  const interval = beatIndex < beats.length - 1 ? beats[beatIndex + 1] - beats[beatIndex] : duration;
  const snapped = beats[beatIndex] + (interval * subdivisionIndex / division);
  const meter = Math.max(1, Math.round(beatsPerBar));
  return {
    beatIndex,
    bar: Math.floor(beatIndex / meter) + 1,
    beatInBar: (beatIndex % meter) + 1,
    subdivision: subdivisionIndex + 1,
    subdivisions: division,
    snappedSeconds: Number(snapped.toFixed(6)),
    offsetMs: Number(((time - snapped) * 1000).toFixed(1)),
  };
}
