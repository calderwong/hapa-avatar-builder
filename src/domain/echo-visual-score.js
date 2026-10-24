// Echo musical timeline + visual score contracts.
//
// Three time scales (docs/ECHO_SCORE_DUST.md):
//   1. musical timeline — whole-song structure read once from Audio Atlas
//      evidence (beats, tempo alternatives, sections, repeats, transitions,
//      intensity). Atlas stays the owner; this is a read-time projection.
//   2. visual score — authored meaning: motifs, palettes, busy ranges,
//      density limits, camera, phrases and event responses per time range.
//   3. live reflex — per-frame audio, supplied by the host, never stored here.
// Play settings (seed, particle count, pulse choice) are kept apart from the
// score so one score can be replayed with controlled variation.

import { DUST_FORMATION_FAMILIES, seedFromString, hashUnit } from "./echo-dust-swarm.js";
import { applySectionEdits, validateSectionEdits } from "./echo-score-dust-sections.js";
import { normalizeLyricControl, validateLyricControl, chosenLyricPhrases, wordByWordPhrases, styleLyricPhrase } from "./echo-score-dust-lyrics.js";
import { DUST_COLOUR_MODES, DUST_COLOUR_PRESETS, DUST_FLASH_LIMIT_PER_SECOND, normalizeDustColour, presetPaletteFor, albumPaletteFor, validateAlbumColourSpec, normalizeDustBackground, validateDustBackground } from "./echo-score-dust-colour.js";
import { DUST_STEM_GROUPS, normalizeStemResponses } from "./echo-score-dust-stems.js";

export const ECHO_MUSICAL_TIMELINE_SCHEMA = "hapa.echo.musical-timeline.v1";
export const ECHO_VISUAL_SCORE_SCHEMA = "hapa.echo.visual-score.v1";
export const ECHO_DUST_PLAY_SETTINGS_SCHEMA = "hapa.echo.dust-play-settings.v1";
export const ECHO_SCORE_DIRECTION_SCHEMA = "hapa.echo.visual-score-direction.v1";
export const ECHO_VISUAL_SCORE_MIN_CUE_SECONDS = 0.5;
export const ECHO_VISUAL_SCORE_CAMERA_MODES = Object.freeze(["hold", "drift", "orbit", "push"]);
export const ECHO_VISUAL_SCORE_EVENT_RESPONSES = Object.freeze(["shock", "kick", "calm", "gather", "none"]);
export const ECHO_VISUAL_SCORE_PULSES = Object.freeze(["half", "normal", "double"]);

/**
 * Place an authored camera move. The new move wins its span: overlapping moves
 * are trimmed or split around it, so authored moves never conflict.
 */
export function placeCameraMove(moves = [], move, { duration = Infinity } = {}) {
  const start = Math.max(0, Number(move.start)), end = Math.min(duration, Number(move.end));
  if (!ECHO_VISUAL_SCORE_CAMERA_MODES.includes(move.mode) || !(end - start > 0.05)) return [...moves];
  const kept = [];
  for (const m of moves) {
    if (m.id && m.id === move.id) continue;
    if (m.end <= start || m.start >= end) { kept.push(m); continue; }
    if (m.start < start - 0.05) kept.push({ ...m, end: start });
    if (m.end > end + 0.05) kept.push({ ...m, id: m.start < start - 0.05 ? null : m.id, start: end });
  }
  const placed = { id: move.id || null, mode: move.mode, start: round(start, 3), end: round(end, 3) };
  const taken = new Set();
  return [...kept, placed].sort((a, b) => a.start - b.start).map((m) => {
    let id = m.id || `camera-${Math.round(m.start * 1000)}`;
    for (let n = 2; taken.has(id); n++) id = `${m.id || `camera-${Math.round(m.start * 1000)}`}-${n}`;
    taken.add(id);
    return { ...m, id };
  });
}

const TRANSITION_KINDS = Object.freeze({
  energy_rise_candidate: "lift",
  energy_drop_candidate: "fall",
  quiet_break_candidate: "break",
  gradual_build_candidate: "build",
  spectral_change_candidate: "change",
});
const DEFAULT_RESPONSE = Object.freeze({ lift: "shock", fall: "calm", break: "calm", build: "gather", change: "kick" });
const FAMILY_POOLS = Object.freeze({
  calm: ["sheet", "shell", "sunflower", "dandelion", "mobius", "fountain"],
  middle: ["ring", "helix", "spiral", "snowflake", "jellyfish"],
  high: ["attractor", "gem", "sphere", "helix", "ring"],
});
const ANTICIPATION_SECONDS = 2.5;

const finite = (value) => typeof value === "number" && Number.isFinite(value);
const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const round = (value, digits = 4) => Number(Number(value).toFixed(digits));
const median = (values) => { const v = [...values].sort((a, b) => a - b), m = Math.floor(v.length / 2); return v.length ? (v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2) : null; };
const quantile = (values, q) => { const v = [...values].sort((a, b) => a - b); return v.length ? v[Math.min(v.length - 1, Math.max(0, Math.round(q * (v.length - 1))))] : null; };

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  return JSON.stringify(value);
}
/** Non-cryptographic content fingerprint for joins between timeline and score. */
export function echoScoreFingerprint(value) {
  return `fnv1a:${seedFromString(stableStringify(value)).toString(16).padStart(8, "0")}`;
}

function tempoFrom(beats, tempoIntervals = []) {
  const candidates = tempoIntervals.filter((row) => row.pulse_status === "candidate" && finite(row.local_median_bpm)).map((row) => row.local_median_bpm);
  const intervals = beats.slice(1).map((t, i) => t - beats[i]).filter((v) => v > 0);
  const bpm = candidates.length ? median(candidates) : intervals.length ? 60 / median(intervals) : null;
  if (!finite(bpm)) return { status: "unavailable", bpm: null, alternativesBpm: null, ambiguous: false, basis: "no beat evidence" };
  const alternativesBpm = { half: round(bpm / 2, 3), normal: round(bpm, 3), double: round(bpm * 2, 3) };
  // The same recording may support a normal-time or half/double-time pulse.
  // Keep both when more than one interpretation lies in a danceable range.
  const plausible = Object.values(alternativesBpm).filter((v) => v >= 60 && v <= 180).length;
  return { status: "candidate", bpm: alternativesBpm.normal, alternativesBpm, ambiguous: plausible > 1,
    basis: candidates.length ? "Atlas rhythm tempo intervals (local median)" : "median inter-beat interval" };
}

function intensityFrom(times, dbfs) {
  if (times.length < 2) return { status: "unavailable", times: [], values: [], quietDbfs: null, loudDbfs: null };
  const quiet = quantile(dbfs, 0.1), loud = quantile(dbfs, 0.95), span = Math.max(1, loud - quiet);
  return { status: "candidate", times: times.map((t) => round(t, 4)), values: dbfs.map((v) => round(clamp((v - quiet) / span), 4)),
    quietDbfs: round(quiet, 3), loudDbfs: round(loud, 3),
    meaning: "Relative frame RMS between the 10th and 95th percentile of this recording; not integrated loudness." };
}

function repeatGroups(sections, repeats = []) {
  const parent = new Map(sections.map((s) => [s.id, s.id]));
  const find = (id) => { while (parent.get(id) !== id) { parent.set(id, parent.get(parent.get(id))); id = parent.get(id); } return id; };
  for (const pair of repeats) if (parent.has(pair.left_id) && parent.has(pair.right_id)) parent.set(find(pair.left_id), find(pair.right_id));
  const labels = new Map();
  return sections.map((section) => {
    const root = find(section.id);
    if (!labels.has(root)) labels.set(root, `group-${String.fromCharCode(65 + (labels.size % 26))}${labels.size >= 26 ? Math.floor(labels.size / 26) : ""}`);
    return labels.get(root);
  });
}

function finishTimeline(timeline) {
  const occurrences = new Map();
  for (const section of timeline.sections) {
    const count = occurrences.get(section.repeatGroup) || 0;
    section.occurrence = count; occurrences.set(section.repeatGroup, count + 1);
    section.meanIntensity = round(meanIntensity(timeline.intensity, section.start, section.end), 4);
  }
  timeline.fingerprint = echoScoreFingerprint({ ...timeline, fingerprint: null });
  return timeline;
}

function meanIntensity(intensity, start, end) {
  if (intensity?.status !== "candidate") return 0.5;
  let sum = 0, count = 0;
  for (let i = 0; i < intensity.times.length; i++) if (intensity.times[i] >= start && intensity.times[i] < end) { sum += intensity.values[i]; count++; }
  return count ? sum / count : intensityAt(intensity, (start + end) / 2);
}

export function intensityAt(intensity, t) {
  const times = intensity?.times || [];
  if (intensity?.status !== "candidate" || !times.length) return 0.5;
  if (t <= times[0]) return intensity.values[0];
  if (t >= times.at(-1)) return intensity.values.at(-1);
  const i = Math.max(0, upperBound(times, t) - 1), span = times[i + 1] - times[i] || 1;
  return intensity.values[i] + (intensity.values[i + 1] - intensity.values[i]) * ((t - times[i]) / span);
}

/** Index of the first value greater than t in a sorted array. */
function upperBound(values, t) {
  let low = 0, high = values.length;
  while (low < high) { const mid = (low + high) >> 1; if (values[mid] <= t) low = mid + 1; else high = mid; }
  return low;
}

/**
 * Project a saved Audio Atlas result into a musical timeline. Reads only;
 * never changes Atlas bytes. Missing capabilities stay explicit.
 */
export function buildEchoMusicalTimelineFromAtlas(result) {
  const master = (result?.assets || []).find((asset) => asset.id === "master" && asset.status === "ready");
  if (!master || !finite(master.sample_rate_hz) || !finite(master.sample_count) || master.sample_count <= 0) throw new Error("Visual score requires a ready Master asset in the Atlas result.");
  const rate = master.sample_rate_hz, duration = master.sample_count / rate;
  const instants = (kind) => [...new Set((result.observations || []).filter((o) => o.kind === kind && o.subject_id === "master").map((o) => o.start_sample))].sort((a, b) => a - b).map((sample) => round(sample / rate, 6));
  let beats = instants("hapa.audio.beat_candidate"), downbeats = instants("hapa.audio.downbeat_candidate");
  if (!beats.length && Array.isArray(result.beat_analysis?.beats_seconds)) beats = result.beat_analysis.beats_seconds.filter((t) => finite(t) && t >= 0 && t < duration).map((t) => round(t, 6));
  if (!downbeats.length && Array.isArray(result.beat_analysis?.downbeats_seconds)) downbeats = result.beat_analysis.downbeats_seconds.filter((t) => finite(t) && t >= 0 && t < duration).map((t) => round(t, 6));
  const structure = result.musical_structure && Array.isArray(result.musical_structure.regions) && result.musical_structure.regions.length ? result.musical_structure : null;
  const observationById = new Map((result.observations || []).map((o) => [o.id, o]));
  const regions = structure ? structure.regions : [{ id: "whole-song", start_sample: 0, end_sample: master.sample_count }];
  const groups = repeatGroups(regions, structure?.repeats);
  const sections = regions.map((region, index) => ({
    id: String(region.id), index, start: round(region.start_sample / rate, 6), end: round(region.end_sample / rate, 6),
    repeatGroup: groups[index], meanRmsDbfs: [region.mean_rms_dbfs, observationById.get(region.id)?.payload?.mean_rms_dbfs].filter(finite).map((v) => round(v, 3))[0] ?? null,
  }));
  const events = (structure?.transitions || []).flatMap((row, index) => {
    const evidence = row.evidence || row.payload?.evidence || row;
    const kind = TRANSITION_KINDS[row.transition_kind || evidence.kind];
    const sample = evidence.boundary_sample ?? evidence.end_sample ?? row.start_sample;
    if (!kind || !Number.isSafeInteger(sample)) return [];
    return [{ id: String(row.id || `master:transition:${index}`), kind, at: round(sample / rate, 6), deltaDb: finite(evidence.delta_db) ? round(evidence.delta_db, 3) : finite(evidence.rise_db) ? round(evidence.rise_db, 3) : null }];
  }).sort((a, b) => a.at - b.at);
  const frames = structure?.frames || [];
  return finishTimeline({
    schemaVersion: ECHO_MUSICAL_TIMELINE_SCHEMA, version: 1,
    source: { kind: "audio-atlas", runId: result.run_id || null, songId: result.song_id || null, assetId: "master", sourceSha256: master.source_sha256 || null, timelineId: master.timeline_id || null, sampleRateHz: rate, sampleCount: master.sample_count },
    durationSeconds: round(duration, 6),
    beats, downbeats, tempo: tempoFrom(beats, result.rhythm_analysis?.tempo_intervals || []),
    sections, events,
    intensity: intensityFrom(frames.map((f) => f.sample / rate), frames.map((f) => f.rms_dbfs)),
    coverage: { beats: beats.length ? "present" : "not_requested", sections: structure ? "present" : "not_requested", repeats: structure?.repeats?.length ? "present" : "unknown", events: events.length ? "present" : structure ? "absent" : "not_requested" },
    qualification: { qualityQualified: false, basis: "Audio Atlas candidate observations", limitations: ["Model and acoustic candidates; musical function (verse/chorus/drop) is not established.", "Repeat groups come from spectral-sequence similarity, not listening review.", "Tempo alternatives are octave interpretations of one beat grid."] },
  });
}

/** Fallback for songs with a prepared Living Light/Echo performance but no Atlas run. */
export function buildEchoMusicalTimelineFromPerformance(performance) {
  const master = (performance?.buses || []).find((bus) => bus.id === "master");
  const duration = Number(performance?.durationSeconds) || master?.durationSeconds || 0;
  if (!(duration > 0)) throw new Error("Prepared performance has no duration.");
  const events = performance.events || [];
  const times = (kind) => [...new Set(events.filter((e) => e.kind === kind && finite(e.atSeconds) && e.atSeconds < duration).map((e) => round(e.atSeconds, 6)))].sort((a, b) => a - b);
  const beats = times("beat"), downbeats = times("downbeat"), boundaries = times("section").filter((t) => t > 0);
  const edges = [0, ...boundaries, duration];
  const sections = edges.slice(0, -1).map((start, index) => ({ id: `section-${index}`, index, start: round(start, 6), end: round(edges[index + 1], 6), repeatGroup: `group-${index}`, meanRmsDbfs: null }));
  const frames = (master?.frames || []).filter((f) => finite(f.t) && finite(f.rms));
  return finishTimeline({
    schemaVersion: ECHO_MUSICAL_TIMELINE_SCHEMA, version: 1,
    source: { kind: "prepared-performance", runId: null, songId: performance.songId || null, assetId: "master", sourceSha256: performance.masterAudioHash || null, timelineId: null, sampleRateHz: master?.sourceSampleRate || null, sampleCount: null },
    durationSeconds: round(duration, 6), beats, downbeats, tempo: tempoFrom(beats), sections, events: [],
    intensity: intensityFrom(frames.map((f) => f.t), frames.map((f) => 20 * Math.log10(Math.max(1e-6, f.rms)))),
    coverage: { beats: beats.length ? "present" : "unknown", sections: boundaries.length ? "present" : "unknown", repeats: "unknown", events: "unknown" },
    qualification: { qualityQualified: false, basis: "Prepared performance envelope and accepted events", limitations: ["No repeat or transition evidence; sections do not share motifs."] },
  });
}

function paletteFor(baseHue, groupIndex, energy) {
  const hue = (baseHue + groupIndex * 137.508) % 360, saturation = round(0.55 + 0.35 * energy, 3);
  return [0, 28, -42].map((offset, i) => ({ h: round((hue + offset + 360) % 360, 2), s: saturation, l: round(0.52 + 0.08 * i, 3) }));
}

/**
 * Compose a default, editable visual score. Same timeline + direction → same
 * score. `direction` lets a human or agent pin families, hues, phrases and
 * event responses; everything chosen records its reason.
 */
export function composeEchoVisualScore(timeline, direction = {}, { lyricLines = null, lyricAudioHash = null } = {}) {
  if (timeline?.schemaVersion !== ECHO_MUSICAL_TIMELINE_SCHEMA) throw new Error("A musical timeline is required to compose a visual score.");
  const seed = seedFromString(timeline.fingerprint);
  const baseHue = finite(direction.baseHue) ? direction.baseHue : Math.floor(hashUnit(seed, 1) * 360);
  const maxDensity = clamp(finite(direction.maxDensity) ? direction.maxDensity : 0.95, 0.05, 1);
  const groupOrder = [...new Set(timeline.sections.map((s) => s.repeatGroup))];
  const groupEnergy = new Map(groupOrder.map((group) => {
    const rows = timeline.sections.filter((s) => s.repeatGroup === group);
    return [group, rows.reduce((sum, s) => sum + s.meanIntensity * (s.end - s.start), 0) / Math.max(1e-6, rows.reduce((sum, s) => sum + (s.end - s.start), 0))];
  }));
  const palettes = {}, motifs = [];
  let previousFamily = "";
  for (const [index, group] of groupOrder.entries()) {
    const energy = groupEnergy.get(group), tier = energy < 0.38 ? "calm" : energy < 0.68 ? "middle" : "high";
    const pool = FAMILY_POOLS[tier], pinned = direction.families?.[group];
    let family = pinned || pool[Math.floor(hashUnit(seed, 2, index) * pool.length)];
    if (!pinned && family === previousFamily) family = pool[(pool.indexOf(family) + 1) % pool.length];
    previousFamily = family;
    const paletteId = `palette-${group}`;
    // Pinned palette > colour preset > generated from the base hue.
    palettes[paletteId] = direction.palettes?.[group] || (direction.colour?.preset === "album" ? albumPaletteFor(direction.colour.album, index) : presetPaletteFor(direction.colour?.preset, index)) || paletteFor(baseHue, index, energy);
    motifs.push({ id: `motif-${group}`, repeatGroup: group, family, allowedFamilies: [family, ...pool.filter((f) => f !== family).slice(0, 2)], paletteId,
      ...(direction.images?.[group] ? { imageRef: structuredClone(direction.images[group]) } : {}),
      reason: pinned ? "pinned by direction" : `relative energy ${round(energy, 2)} → ${tier} family pool` });
  }
  const motifByGroup = new Map(motifs.map((m) => [m.repeatGroup, m]));
  const cues = timeline.sections.map((section) => {
    const energy = section.meanIntensity, lift = Math.min(0.18, section.occurrence * 0.06);
    // Later returns of a repeated motif get busier: recognizable, but growing.
    const low = clamp(0.2 + 0.45 * energy + lift - 0.07), high = clamp(0.2 + 0.45 * energy + lift + 0.07);
    return {
      id: `cue-${section.id}`, sectionId: section.id, start: section.start, end: section.end, motifId: motifByGroup.get(section.repeatGroup).id,
      busy: [round(low, 3), round(high, 3)], density: round(Math.min(maxDensity, 0.4 + 0.55 * energy), 3),
      camera: { mode: energy > 0.66 ? "orbit" : energy < 0.33 ? "hold" : "drift", distance: round(4.8 - 0.8 * energy, 3) },
      occurrence: section.occurrence,
      reason: `section ${section.index + 1} · ${section.repeatGroup} occurrence ${section.occurrence + 1} · relative energy ${round(energy, 2)}`,
    };
  });
  // Per-section edits (split/merge/move boundaries, one-occurrence overrides).
  const edited = direction.sections ? applySectionEdits({ cues, motifs, palettes, maxDensity, minCueSeconds: ECHO_VISUAL_SCORE_MIN_CUE_SECONDS }, direction.sections) : null;
  const events = timeline.events.map((event) => ({ id: `event-${event.id}`, sourceEventId: event.id, kind: event.kind, at: event.at,
    response: direction.eventResponses?.[event.kind] || DEFAULT_RESPONSE[event.kind] || "none", reason: `Atlas ${event.kind} candidate${event.deltaDb === null ? "" : ` (${event.deltaDb} dB)`}` }));
  // Explicit phrases win; otherwise lyric control picks hooks automatically
  // or shows exactly the chosen lines, optionally one word at a time.
  const lyricControl = normalizeLyricControl(direction.lyrics, direction.lyricPhrases);
  const lyricSelection = !direction.phrases && lyricControl.pick !== "off" && Array.isArray(lyricLines)
    ? (lyricControl.pick === "chosen" ? chosenLyricPhrases(lyricLines, timeline, lyricControl.lines, { lyricAudioHash, events }) : selectEchoScorePhrases(lyricLines, timeline, { lyricAudioHash, events, max: lyricControl.max })) : null;
  const lyricPhrases = lyricSelection ? (lyricControl.wordByWord ? wordByWordPhrases(lyricSelection.phrases, lyricLines) : lyricSelection.phrases) : [];
  const phrases = direction.phrases
    ? direction.phrases.map((phrase, index) => ({ id: phrase.id || `phrase-${index}`, text: String(phrase.text || ""), start: Number(phrase.start), end: Number(phrase.end), burst: phrase.burst === true, ...(direction.lyrics?.font ? { font: lyricControl.font } : {}) }))
    : lyricPhrases.map((phrase) => styleLyricPhrase(phrase, lyricControl));
  const score = {
    schemaVersion: ECHO_VISUAL_SCORE_SCHEMA, version: 1, revision: Number.isSafeInteger(direction.revision) ? direction.revision : 0,
    author: direction.author || "hapa-score-composer", timelineRef: { schemaVersion: timeline.schemaVersion, fingerprint: timeline.fingerprint, sourceSha256: timeline.source.sourceSha256, runId: timeline.source.runId },
    durationSeconds: timeline.durationSeconds, palettes: edited?.palettes || palettes, motifs: edited?.motifs || motifs, cues: edited?.cues || cues, events, phrases,
    ...(edited ? { sectionEdits: edited.report } : {}),
    phraseSource: direction.phrases ? "direction" : lyricSelection ? { kind: "lyrics", pick: lyricControl.pick, status: lyricSelection.status, reason: lyricSelection.reason, wordByWord: lyricControl.wordByWord, ...(lyricSelection.skipped?.length ? { skipped: lyricSelection.skipped } : {}) } : "none",
    cameraMoves: structuredClone(direction.cameraMoves || []),
    colour: normalizeDustColour(direction.colour),
    background: normalizeDustBackground(direction.background),
    stemResponses: normalizeStemResponses(direction.stemResponses),
    limits: { maxDensity, minCueSeconds: ECHO_VISUAL_SCORE_MIN_CUE_SECONDS },
  };
  score.fingerprint = echoScoreFingerprint({ ...score, fingerprint: null });
  return score;
}

/**
 * Validate before playback. Errors block playback; warnings are shown.
 * `assets` is the set (or array) of asset ids the host can resolve.
 */
export function validateEchoVisualScore(score, { timeline = null, assets = null } = {}) {
  const errors = [], warnings = [];
  const error = (code, message, ref = null) => errors.push({ code, message, ...(ref ? { ref } : {}) });
  const warn = (code, message, ref = null) => warnings.push({ code, message, ...(ref ? { ref } : {}) });
  if (score?.schemaVersion !== ECHO_VISUAL_SCORE_SCHEMA || score?.version !== 1) { error("schema", "Unsupported visual score schema or version."); return { ok: false, errors, warnings }; }
  const duration = Number(score.durationSeconds), epsilon = 1e-3;
  if (!(duration > 0)) error("duration", "Score duration must be positive.");
  if (timeline) {
    if (score.timelineRef?.fingerprint !== timeline.fingerprint) error("timeline-mismatch", "Score belongs to a different musical timeline revision.");
    if (Math.abs(duration - timeline.durationSeconds) > epsilon) error("timeline-duration", "Score duration differs from the musical timeline.");
  } else warn("timeline-unchecked", "No musical timeline supplied; source identity was not checked.");
  const assetSet = assets instanceof Set ? assets : Array.isArray(assets) ? new Set(assets) : null;
  const palettes = score.palettes && typeof score.palettes === "object" ? score.palettes : {};
  for (const [id, colors] of Object.entries(palettes)) {
    if (!Array.isArray(colors) || colors.length < 1 || colors.length > 5 || colors.some((c) => !finite(c?.h) || c.h < 0 || c.h >= 360 || !finite(c?.s) || c.s < 0 || c.s > 1 || !finite(c?.l) || c.l < 0 || c.l > 1)) error("palette", "Palette needs 1–5 colors with h∈[0,360), s,l∈[0,1].", id);
  }
  const motifIds = new Set();
  for (const motif of score.motifs || []) {
    if (!motif?.id || motifIds.has(motif.id)) { error("motif-id", "Motif ids must be present and unique.", motif?.id); continue; }
    motifIds.add(motif.id);
    if (!DUST_FORMATION_FAMILIES.includes(motif.family) && !(motif.family === "image" && motif.imageRef)) error("motif-family", `Unknown formation family ${motif.family}.`, motif.id);
    for (const family of motif.allowedFamilies || []) if (!DUST_FORMATION_FAMILIES.includes(family) && family !== "image") error("motif-family", `Unknown allowed family ${family}.`, motif.id);
    if (!palettes[motif.paletteId]) error("missing-palette", `Palette ${motif.paletteId} is not defined.`, motif.id);
    if (motif.imageRef) {
      if (!motif.imageRef.assetId) error("image-ref", "Image references need an assetId.", motif.id);
      else if (selfContainedImage(motif.imageRef)) { /* carries its own pixels */ }
      else if (assetSet && !assetSet.has(motif.imageRef.assetId)) error("absent-asset", `Image asset ${motif.imageRef.assetId} is not available.`, motif.id);
      else if (!assetSet) warn("asset-unchecked", "Image asset availability was not checked.", motif.id);
    }
  }
  const cues = score.cues || [];
  if (!cues.length) error("cues", "A score needs at least one cue.");
  let cursor = 0;
  for (const [index, cue] of cues.entries()) {
    const ref = cue?.id || `cue#${index}`;
    if (!finite(cue?.start) || !finite(cue?.end) || cue.end <= cue.start) { error("cue-range", "Cue start/end must be finite with end after start.", ref); continue; }
    if (cue.start < -epsilon || cue.end > duration + epsilon) error("cue-bounds", "Cue lies outside the song.", ref);
    if (cue.end - cue.start < ECHO_VISUAL_SCORE_MIN_CUE_SECONDS) error("unreadable-cue", `Cue is shorter than ${ECHO_VISUAL_SCORE_MIN_CUE_SECONDS}s and would not read on screen.`, ref);
    if (cue.start < cursor - epsilon) error("cue-overlap", "Cues must be ordered and must not overlap.", ref);
    else if (cue.start > cursor + epsilon) warn("cue-gap", `Uncued gap ${round(cursor, 3)}–${round(cue.start, 3)}s holds the previous motif.`, ref);
    cursor = Math.max(cursor, cue.end);
    if (!motifIds.has(cue.motifId)) error("missing-motif", `Motif ${cue.motifId} is not defined.`, ref);
    if (!Array.isArray(cue.busy) || cue.busy.length !== 2 || !cue.busy.every((v) => finite(v) && v >= 0 && v <= 1) || cue.busy[0] > cue.busy[1]) error("busy", "Busy range must be [low, high] within 0–1.", ref);
    if (!finite(cue.density) || cue.density <= 0 || cue.density > (score.limits?.maxDensity ?? 1) + epsilon) error("density", "Density must be within (0, limits.maxDensity].", ref);
    if (!ECHO_VISUAL_SCORE_CAMERA_MODES.includes(cue.camera?.mode)) error("camera-mode", `Unknown camera mode ${cue.camera?.mode}.`, ref);
  }
  for (const skipped of score.sectionEdits?.skipped || []) warn("section-edit-skipped", `Section ${skipped.op} at ${typeof skipped.at === "number" ? `${round(skipped.at, 2)}s` : skipped.at} was skipped: ${skipped.reason}.`);
  if (cues.length && cursor < duration - epsilon) warn("cue-tail", `Score ends at ${round(cursor, 3)}s; the tail holds the last motif.`);
  if (score.colour !== undefined && (!DUST_COLOUR_MODES.includes(score.colour?.mode) || (score.colour.preset && !DUST_COLOUR_PRESETS[score.colour.preset] && !(score.colour.preset === "album" && validateAlbumColourSpec(score.colour.album))))) error("colour", "Unknown colour mode or preset.");
  if (score.background !== undefined && !validateDustBackground(score.background)) error("background", "Unknown background kind, shape or colour.");
  for (const event of score.events || []) {
    if (!finite(event?.at) || event.at < 0 || event.at > duration + epsilon) error("event-time", "Event lies outside the song.", event?.id);
    if (!ECHO_VISUAL_SCORE_EVENT_RESPONSES.includes(event?.response)) error("event-response", `Unknown event response ${event?.response}.`, event?.id);
  }
  const phraseOrder = [...(score.phrases || [])].filter((p) => finite(p?.start) && finite(p?.end)).sort((a, b) => a.start - b.start);
  for (let i = 1; i < phraseOrder.length; i++) if (phraseOrder[i].start < phraseOrder[i - 1].end - epsilon) error("phrase-overlap", "Phrases must not overlap; only one can be read at a time.", phraseOrder[i].id);
  for (const phrase of score.phrases || []) {
    const text = String(phrase?.text || "").trim();
    if (!text || text.length > 64) error("phrase-text", "Phrase text must be 1–64 characters.", phrase?.id);
    if (!finite(phrase?.start) || !finite(phrase?.end) || phrase.end <= phrase.start) { error("phrase-range", "Phrase needs a positive duration; zero-length words are not displayable.", phrase?.id); continue; }
    if (phrase.start < -epsilon || phrase.end > duration + epsilon) error("phrase-bounds", "Phrase lies outside the song.", phrase.id);
    const readable = 0.4 + 0.06 * text.length;
    if (!phrase.burst && !phrase.wordOf && phrase.end - phrase.start < readable) warn("phrase-short", `Phrase shows for ${round(phrase.end - phrase.start, 2)}s; about ${round(readable, 2)}s is needed to read it.`, phrase.id);
  }
  const moves = [...(score.cameraMoves || [])].sort((a, b) => a.start - b.start);
  for (const [index, move] of moves.entries()) {
    if (!finite(move?.start) || !finite(move?.end) || move.end <= move.start || move.start < -epsilon || move.end > duration + epsilon) { error("camera-move-range", "Camera move needs a valid range inside the song.", move?.id); continue; }
    if (!ECHO_VISUAL_SCORE_CAMERA_MODES.includes(move.mode)) error("camera-mode", `Unknown camera mode ${move.mode}.`, move.id);
    const next = moves[index + 1];
    if (next && next.start < move.end - epsilon && next.mode !== move.mode) error("camera-conflict", `Camera moves ${move.id || index} (${move.mode}) and ${next.id || index + 1} (${next.mode}) overlap with different instructions.`, move.id);
  }
  return { ok: errors.length === 0, errors, warnings };
}

/** Play settings stay outside the score. Default seed derives from the song's audio identity. */
export function normalizeDustPlaySettings(input = {}, timeline = null) {
  const identity = timeline?.source?.sourceSha256 || timeline?.fingerprint || "hapa-echo-dust";
  const pulse = ECHO_VISUAL_SCORE_PULSES.includes(input.pulse) ? input.pulse : "normal";
  return { schemaVersion: ECHO_DUST_PLAY_SETTINGS_SCHEMA, seed: Number.isSafeInteger(input.seed) && input.seed >= 0 ? input.seed >>> 0 : seedFromString(identity),
    particleCount: Math.min(20000, Math.max(500, Math.floor(Number(input.particleCount) || 6000))), pulse, prerollSeconds: finite(input.prerollSeconds) ? clamp(input.prerollSeconds, 0, 5) : 1.5,
    // Comfort: reduced motion, and bright flashes capped at 3 per second (can only go lower).
    reducedMotion: input.reducedMotion === true,
    flashLimitPerSecond: finite(input.flashLimitPerSecond) ? clamp(Math.floor(input.flashLimitPerSecond), 0, DUST_FLASH_LIMIT_PER_SECOND) : DUST_FLASH_LIMIT_PER_SECOND };
}

function pulseGrid(beats, pulse) {
  if (pulse === "half") return beats.filter((_, i) => i % 2 === 0);
  if (pulse === "double") return beats.flatMap((t, i) => i + 1 < beats.length ? [t, round((t + beats[i + 1]) / 2, 6)] : [t]);
  return beats;
}

/**
 * Prepare constant-time per-frame lookups. The renderer asks what is happening
 * now (cue, intensity, beat phase) and what is coming (next event, phrase).
 */
export function prepareEchoScorePlayback(score, timeline, { pulse = "normal" } = {}) {
  const validation = validateEchoVisualScore(score, { timeline });
  if (!validation.ok) { const e = new Error(`Visual score failed validation: ${validation.errors.map((v) => v.code).join(", ")}`); e.validation = validation; throw e; }
  const beats = pulseGrid(timeline.beats, ECHO_VISUAL_SCORE_PULSES.includes(pulse) ? pulse : "normal");
  const cueStarts = score.cues.map((c) => c.start), events = [...score.events].sort((a, b) => a.at - b.at), eventTimes = events.map((e) => e.at);
  const motifs = new Map(score.motifs.map((m) => [m.id, m]));
  function stateAt(t) {
    const cue = score.cues[Math.max(0, upperBound(cueStarts, t) - 1)];
    const motif = motifs.get(cue.motifId), intensity = intensityAt(timeline.intensity, t);
    const b = upperBound(beats, t) - 1, last = b >= 0 ? beats[b] : null, next = beats[b + 1] ?? null;
    const period = last !== null && next !== null ? next - last : timeline.tempo.bpm ? 60 / timeline.tempo.bpm : null;
    const e = upperBound(eventTimes, t), nextEvent = events[e] || null;
    const until = nextEvent ? nextEvent.at - t : null;
    const phrase = score.phrases.find((p) => t >= p.start && t < p.end) || null;
    const move = (score.cameraMoves || []).find((m) => t >= m.start && t < m.end) || null;
    // Authored camera moves override the cue camera; a push closes in over its span.
    const camera = move ? { mode: move.mode, distance: round(cue.camera.distance - (move.mode === "push" ? 1.2 * (t - move.start) / (move.end - move.start) : 0), 4), moveId: move.id || null } : cue.camera;
    return {
      t, cue, motif, palette: score.palettes[motif.paletteId], intensity,
      busy: cue.busy[0] + (cue.busy[1] - cue.busy[0]) * intensity, density: cue.density, camera,
      beat: { index: b, last, next, period, phase: last !== null && period ? clamp((t - last) / period) : 0 },
      nextEvent: nextEvent ? { ...nextEvent, in: round(until, 4) } : null,
      // Prepare before a lift instead of reacting after it sounds.
      anticipation: nextEvent?.response === "shock" && until <= ANTICIPATION_SECONDS ? round(1 - until / ANTICIPATION_SECONDS, 4) : 0,
      phrase: phrase ? { ...phrase, progress: round((t - phrase.start) / (phrase.end - phrase.start), 4) } : null,
      calm: phrase && !phrase.burst ? 0.85 : 0,
    };
  }
  /** Scheduled musical events crossed in (from, to]. Seeks/jumps report nothing. */
  function crossings(from, to, maxSpan = 0.25) {
    if (!(to > from) || to - from > maxSpan) return { beats: 0, downbeat: false, events: [] };
    const count = upperBound(beats, to) - upperBound(beats, from);
    const downbeat = upperBound(timeline.downbeats, to) > upperBound(timeline.downbeats, from);
    return { beats: count, downbeat, events: events.slice(upperBound(eventTimes, from), upperBound(eventTimes, to)) };
  }
  return { score, timeline, pulse, beats, validation, stateAt, crossings };
}

/** Reflex-only fallback when no timeline exists: one honest cue, no fake structure. */
export function reflexOnlyEchoTimeline(durationSeconds = 600) {
  return finishTimeline({ schemaVersion: ECHO_MUSICAL_TIMELINE_SCHEMA, version: 1,
    source: { kind: "reflex-only", runId: null, songId: null, assetId: null, sourceSha256: null, timelineId: null, sampleRateHz: null, sampleCount: null },
    durationSeconds: Math.max(1, Number(durationSeconds) || 600), beats: [], downbeats: [], tempo: tempoFrom([]),
    sections: [{ id: "reflex", index: 0, start: 0, end: Math.max(1, Number(durationSeconds) || 600), repeatGroup: "group-A", meanRmsDbfs: null }], events: [],
    intensity: intensityFrom([], []), coverage: { beats: "unknown", sections: "unknown", repeats: "unknown", events: "unknown" },
    qualification: { qualityQualified: false, basis: "none", limitations: ["No song structure; visuals follow live audio only."] } });
}

const normalizeLyric = (text) => String(text || "").toLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N}\s']/gu, " ").replace(/\s+/g, " ").trim();
const lineTime = (line, key) => { const value = Number(line?.[key] ?? line?.[`${key}Seconds`]); return Number.isFinite(value) ? value : NaN; };

/**
 * Pick a few readable hook phrases from measured lyric lines, the way a
 * director would: repeated lines first, short enough to read, spaced apart,
 * and only a small share of the song. Timing is never invented; long lines
 * use their own word timings for a 3–5 word window or are skipped.
 */
export function selectEchoScorePhrases(lines, timeline, { lyricAudioHash = null, events = [], max = 8, maxShare = 0.12, minGapSeconds = 8 } = {}) {
  const strip = (v) => String(v || "").replace(/^sha256:/, "").toLowerCase();
  if (lyricAudioHash && timeline.source?.sourceSha256 && strip(lyricAudioHash) !== strip(timeline.source.sourceSha256)) {
    return { status: "audio-mismatch", reason: "Lyric timing belongs to different master audio bytes than this Atlas run.", phrases: [] };
  }
  const duration = timeline.durationSeconds;
  const rows = (lines || []).map((line, index) => ({ line, index, start: lineTime(line, "start"), end: lineTime(line, "end"), text: String(line?.text || "").trim() }))
    .filter((row) => row.text && row.end > row.start && row.start >= 0 && row.end <= duration + 1e-3);
  if (!rows.length) return { status: "unavailable", reason: "No measured lyric lines inside this recording.", phrases: [] };
  const counts = new Map();
  for (const row of rows) counts.set(normalizeLyric(row.text), (counts.get(normalizeLyric(row.text)) || 0) + 1);
  const sectionAt = (t) => timeline.sections.find((s) => t >= s.start && t < s.end) || timeline.sections.at(-1);
  const candidates = rows.flatMap((row) => {
    let { text, start, end } = row;
    const words = text.split(/\s+/);
    if (words.length > 6 || text.length > 40) {
      const timed = (row.line.words || []).map((w) => ({ text: String(w?.text ?? w?.word ?? "").trim(), start: lineTime(w, "start"), end: lineTime(w, "end") })).filter((w) => w.text && w.end > w.start);
      if (timed.length < 3) return [];
      const window = timed.slice(0, Math.min(5, timed.length));
      text = window.map((w) => w.text).join(" "); start = window[0].start; end = window.at(-1).end;
      if (!(end > start) || text.length > 40) return [];
    }
    const repeats = counts.get(normalizeLyric(row.text)) || 1, section = sectionAt((start + end) / 2), n = text.split(/\s+/).length;
    const value = 3 * (repeats - 1) + (section?.meanIntensity ?? 0.5) + (n >= 2 && n <= 5 ? 1 : 0) + (section?.occurrence > 0 ? 0.5 : 0);
    return [{ row, text, start, end, repeats, value, key: normalizeLyric(row.text) }];
  }).sort((a, b) => b.value - a.value || a.start - b.start);
  const shocks = (events || []).filter((e) => e.response === "shock").map((e) => e.at);
  const hooks = candidates.some((c) => c.repeats > 1), oneOffLimit = hooks ? Math.max(1, Math.floor(max / 4)) : max;
  const chosen = [], perText = new Map();
  let shown = 0, oneOffs = 0;
  for (const c of candidates) {
    if (chosen.length >= max) break;
    if ((perText.get(c.key) || 0) >= 3) continue;
    // Lifts belong to the shapes: keep words out of the run-up and the hit.
    if (shocks.some((at) => c.start < at + 1 && c.end > at - 2.5)) continue;
    if (c.repeats === 1 && (oneOffs >= oneOffLimit || (sectionAt((c.start + c.end) / 2)?.meanIntensity ?? 0.5) < 0.45)) continue;
    if (shown + (c.end - c.start) > maxShare * duration) continue;
    if (chosen.some((p) => Math.abs((p.start + p.end) / 2 - (c.start + c.end) / 2) < minGapSeconds || (c.start < p.end && p.start < c.end))) continue;
    chosen.push(c); perText.set(c.key, (perText.get(c.key) || 0) + 1); shown += c.end - c.start;
    if (c.repeats === 1) oneOffs++;
  }
  const phrases = chosen.sort((a, b) => a.start - b.start).map((c) => {
    const readable = 0.4 + 0.06 * c.text.length;
    // A phrase that lands on a lift, or is too quick to read, becomes a burst.
    const burst = shocks.some((at) => at >= c.start - 0.25 && at <= c.end + 0.3) || c.end - c.start < readable;
    return { id: `lyric-${c.row.line?.id ?? c.row.index}`, text: c.text, start: round(c.start, 4), end: round(c.end, 4), burst,
      source: { kind: "lyric-line", lineId: c.row.line?.id ?? null, lineIndex: c.row.index, repeats: c.repeats, reason: c.repeats > 1 ? `repeated ${c.repeats}× in the lyrics` : "short line in an energetic section" } };
  });
  return { status: phrases.length ? "selected" : "none-readable", reason: `${phrases.length} of ${rows.length} measured lines chosen`, phrases };
}

/**
 * Picture motifs: an Avatar image ({assetId, url}), a text logo
 * ({kind: "text", text ≤ 24, font?}) or an inline SVG logo
 * ({kind: "svg", url: data:image/svg+xml…, ≤ 32 KiB}). Returns a problem or null.
 */
export function imageRefProblem(ref) {
  if (!ref || typeof ref !== "object" || Array.isArray(ref) || typeof ref.assetId !== "string" || !ref.assetId) return "needs an assetId.";
  if (ref.url !== undefined && typeof ref.url !== "string") return "url must be a string.";
  if (ref.kind === "text") return typeof ref.text === "string" && ref.text.trim() && ref.text.length <= 24 ? null : "text logos need 1–24 characters.";
  if (ref.kind === "model") return typeof ref.url === "string" && ref.url ? null : "3D models need a url.";
  if (ref.kind === "svg") return /^data:image\/svg\+xml[;,]/.test(ref.url || "") && ref.url.length <= 32 * 1024 ? null : "SVG logos must be an inline data:image/svg+xml URL of at most 32 KiB.";
  return ref.kind === undefined ? null : `unknown kind ${ref.kind}.`;
}
/** Text and inline SVG logos carry their own pixels; no asset lookup is needed. */
const selfContainedImage = (ref) => ref?.kind === "text" || ref?.kind === "svg";

const DIRECTION_KEYS = new Set(["colour", "background", "sections", "lyrics", "stemResponses", "families", "palettes", "baseHue", "maxDensity", "images", "phrases", "lyricPhrases", "eventResponses", "cameraMoves", "playSettings", "author", "revision"]);

/** Strict check for a saved or submitted direction (the human intent, not the composed score). */
export function validateEchoScoreDirection(direction) {
  const errors = [];
  const error = (code, message) => errors.push({ code, message });
  if (!direction || typeof direction !== "object" || Array.isArray(direction)) return { ok: false, errors: [{ code: "direction", message: "Direction must be an object." }] };
  if (JSON.stringify(direction).length > 64 * 1024) error("direction-size", "Direction exceeds 64 KiB.");
  for (const key of Object.keys(direction)) if (!DIRECTION_KEYS.has(key)) error("direction-key", `Unknown direction field ${key}.`);
  const map = (value, label) => { if (value === undefined) return {}; if (!value || typeof value !== "object" || Array.isArray(value)) { error(label, `${label} must map repeat groups to values.`); return {}; } return value; };
  for (const [group, family] of Object.entries(map(direction.families, "families"))) if (!DUST_FORMATION_FAMILIES.includes(family)) error("families", `Unknown family ${family} for ${group}.`);
  for (const [group, colors] of Object.entries(map(direction.palettes, "palettes"))) if (!Array.isArray(colors) || !colors.length || colors.length > 5 || colors.some((c) => !finite(c?.h) || c.h < 0 || c.h >= 360 || !finite(c?.s) || c.s < 0 || c.s > 1 || !finite(c?.l) || c.l < 0 || c.l > 1)) error("palettes", `Palette for ${group} needs 1–5 valid colors.`);
  for (const [group, ref] of Object.entries(map(direction.images, "images"))) { const problem = imageRefProblem(ref); if (problem) error("images", `Image for ${group}: ${problem}`); }
  for (const [kind, response] of Object.entries(map(direction.eventResponses, "eventResponses"))) if (!Object.values(TRANSITION_KINDS).includes(kind) || !ECHO_VISUAL_SCORE_EVENT_RESPONSES.includes(response)) error("eventResponses", `Invalid response ${response} for ${kind}.`);
  if (direction.baseHue !== undefined && (!finite(direction.baseHue) || direction.baseHue < 0 || direction.baseHue >= 360)) error("baseHue", "baseHue must be within [0, 360).");
  if (direction.maxDensity !== undefined && (!finite(direction.maxDensity) || direction.maxDensity <= 0 || direction.maxDensity > 1)) error("maxDensity", "maxDensity must be within (0, 1].");
  if (direction.lyricPhrases !== undefined && !["auto", "off"].includes(direction.lyricPhrases)) error("lyricPhrases", "lyricPhrases must be auto or off.");
  if (direction.phrases !== undefined && (!Array.isArray(direction.phrases) || direction.phrases.length > 32 || direction.phrases.some((p) => !String(p?.text || "").trim() || String(p.text).length > 64 || !finite(p.start) || !finite(p.end) || p.end <= p.start))) error("phrases", "Up to 32 phrases with 1–64 characters and a positive duration.");
  if (direction.cameraMoves !== undefined && (!Array.isArray(direction.cameraMoves) || direction.cameraMoves.length > 64 || direction.cameraMoves.some((m) => !ECHO_VISUAL_SCORE_CAMERA_MODES.includes(m?.mode) || !finite(m.start) || !finite(m.end) || m.end <= m.start))) error("cameraMoves", "Up to 64 camera moves with a known mode and positive duration.");
  const play = direction.playSettings;
  if (play !== undefined && (!play || typeof play !== "object" || (play.pulse !== undefined && !ECHO_VISUAL_SCORE_PULSES.includes(play.pulse)) || (play.seed !== undefined && (!Number.isSafeInteger(play.seed) || play.seed < 0))
    || (play.reducedMotion !== undefined && typeof play.reducedMotion !== "boolean") || (play.flashLimitPerSecond !== undefined && (!Number.isInteger(play.flashLimitPerSecond) || play.flashLimitPerSecond < 0 || play.flashLimitPerSecond > DUST_FLASH_LIMIT_PER_SECOND)))) error("playSettings", "playSettings allows pulse half|normal|double, a non-negative integer seed, reducedMotion and flashLimitPerSecond 0–3.");
  const stems = direction.stemResponses;
  if (stems !== undefined && (!stems || typeof stems !== "object" || Array.isArray(stems) || Object.entries(stems).some(([k, v]) => !DUST_STEM_GROUPS[k] || !finite(v) || v < 0 || v > 1))) error("stemResponses", `stemResponses maps ${Object.keys(DUST_STEM_GROUPS).join("/")} to weights 0–1.`);
  const colour = direction.colour;
  if (colour !== undefined && (!colour || typeof colour !== "object" || Array.isArray(colour) || (colour.mode !== undefined && !DUST_COLOUR_MODES.includes(colour.mode)) || (colour.preset !== undefined && colour.preset !== null && !DUST_COLOUR_PRESETS[colour.preset] && colour.preset !== "album")
    || (colour.album !== undefined && !validateAlbumColourSpec(colour.album))
    || Object.keys(colour).some((k) => !["mode", "preset", "album", "crossfadeSeconds", "liftFlash", "breakDesaturate", "brighterReturns"].includes(k)))) error("colour", `colour allows mode (${DUST_COLOUR_MODES.join("/")}), a preset (or "album" with an album spec) and the dynamics switches.`);
  for (const message of validateSectionEdits(direction.sections)) error("sections", message);
  for (const message of validateLyricControl(direction.lyrics)) error("lyrics", message);
  if (!validateDustBackground(direction.background)) error("background", "background allows kind black|solid|gradient|palette, #rrggbb colour/colour2 and shape linear|radial.");
  return { ok: errors.length === 0, errors };
}

