import crypto from "node:crypto";
import { buildPortableVisualizerCard } from "./portable-visualizer-card.js";
import { nativeVisualizerRouteCounts, resolveNativeVisualizerRoute } from "./native-visualizer-route.js";
import { buildAccentEventTrack } from "./accent-event-track.js";
import { buildVisualTimeTrack } from "./visual-time-track.js";
import { buildPhraseCadence } from "./phrase-cadence.js";
import { buildLyricDirectionTrack } from "./lyric-direction-track.js";
import { buildAudioFallbackProfile } from "./audio-fallback-profile.js";
import { buildMediaDiversityReport } from "./media-diversity-budget.js";
import { buildSafeCameraPath, classifyMediaRole } from "./media-role-camera.js";
import path from "node:path";

const DEFAULT_AVATAR_ROOT = "/Users/calderwong/Desktop/hapa-avatar-builder";

export const DIRECTOR_V2_SCHEMA = "hapa.echo.director-plan.v2";
export const CUE_GRAPH_SCHEMA = "hapa.echo.cue-graph.v2";
export const TREATMENT_SCHEMA = "hapa.echo.editorial-treatment.v2";
export const NATIVE_SHOW_GRAPH_SCHEMA = "hapa.music-viz.native-show-graph.v2";
export const DIRECTOR_V2_COMPILER_VERSION = "echo-director-v2.3.0";

export const DEFAULT_VARIANT_RECIPES = Object.freeze({
  conservative: Object.freeze({
    id: "conservative",
    cutScale: 1.18,
    visualizerMix: 0.28,
    maxVisualizerLayers: 2,
    cameraEnergy: 0.46,
    accentDensity: 0.28,
    temporalModulation: 0.12,
    mediaOffset: 0,
  }),
  kinetic: Object.freeze({
    id: "kinetic",
    cutScale: 0.78,
    visualizerMix: 0.5,
    maxVisualizerLayers: 4,
    cameraEnergy: 0.82,
    accentDensity: 0.72,
    temporalModulation: 0.48,
    mediaOffset: 1,
  }),
  "visualizer-forward": Object.freeze({
    id: "visualizer-forward",
    cutScale: 0.94,
    visualizerMix: 0.72,
    maxVisualizerLayers: 6,
    cameraEnergy: 0.64,
    accentDensity: 0.54,
    temporalModulation: 0.34,
    mediaOffset: 2,
  }),
});

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, stableValue(value[key])]),
  );
}

export function stableStringify(value, space = 0) {
  return JSON.stringify(stableValue(value), null, space);
}

export function contentHash(value) {
  return crypto.createHash("sha256").update(stableStringify(value)).digest("hex");
}

export function firstStableDifference(left, right, currentPath = "$") {
  if (Object.is(left, right)) return null;
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right)) return { path: currentPath, left, right };
    const length = Math.max(left.length, right.length);
    for (let index = 0; index < length; index += 1) {
      const difference = firstStableDifference(left[index], right[index], `${currentPath}[${index}]`);
      if (difference) return difference;
    }
    return null;
  }
  if (left && right && typeof left === "object" && typeof right === "object") {
    const keys = [...new Set([...Object.keys(left), ...Object.keys(right)])].sort();
    for (const key of keys) {
      const difference = firstStableDifference(left[key], right[key], `${currentPath}.${key}`);
      if (difference) return difference;
    }
    return null;
  }
  return { path: currentPath, left, right };
}

function seededUnit(seed, scope) {
  const hash = crypto.createHash("sha256").update(`${seed}\u0000${scope}`).digest();
  return hash.readUInt32BE(0) / 0xffffffff;
}

function clamp(value, min = 0, max = 1) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function slug(value, fallback = "item") {
  return String(value || fallback)
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase() || fallback;
}

function uniqueBy(items, keyFor) {
  const seen = new Set();
  return items.filter((item) => {
    const key = keyFor(item);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function finite(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function round(value, digits = 3) {
  const scale = 10 ** digits;
  return Math.round(finite(value) * scale) / scale;
}

function projectBody(input) {
  return input?.music_video_project || input?.project || input;
}

function normalizedStemType(value) {
  return String(value || "")
    .trim()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function stemRole(stemType) {
  const type = normalizedStemType(stemType);
  if (type.includes("backing") && type.includes("vocal")) return "backingVocals";
  if (type.includes("vocal")) return "leadVocals";
  if (type.includes("drum") || type.includes("percussion")) return type.includes("percussion") ? "percussion" : "drums";
  if (type.includes("bass")) return "bass";
  if (type.includes("synth")) return "synth";
  if (type.includes("keyboard") || type.includes("piano")) return "keyboard";
  if (type.includes("guitar")) return "guitar";
  if (type.includes("string")) return "strings";
  if (type.includes("brass")) return "brass";
  if (type.includes("woodwind")) return "woodwinds";
  if (type === "fx" || type.includes("effect")) return "fx";
  return slug(stemType, "other");
}

export function normalizeStemRecords(projectInput, registry = null) {
  const project = projectBody(projectInput) || {};
  const registryTrackId = String(project.registry_track_id || project.audio_id || "");
  const registryItems = Array.isArray(registry?.stems)
    ? registry.stems.filter((stem) => String(stem.parentId || stem.songId || "") === registryTrackId)
    : [];
  const registryByType = new Map(
    registryItems.map((stem) => [normalizedStemType(stem.stemType || stem.kind || stem.title), stem]),
  );
  const declared = Array.isArray(project.stems_available) ? project.stems_available : [];
  const candidates = declared.map((item) => {
    const stemType = typeof item === "string" ? item : item.stemType || item.kind || item.title || item.id;
    const registryStem = registryByType.get(normalizedStemType(stemType));
    return {
      id: String(registryStem?.id || item?.id || `stem:${slug(stemType)}`),
      stemType: String(registryStem?.stemType || stemType || "Unknown"),
      role: stemRole(registryStem?.stemType || stemType),
      title: String(registryStem?.title || stemType || "Unknown stem"),
      duration: round(registryStem?.duration || item?.duration || project.duration || 0, 2),
      audioPath: String(registryStem?.localPath || item?.audioPath || item?.localPath || ""),
      truthStatus: registryStem?.localPath ? "verified_registry_path" : "declared_without_path",
    };
  });
  for (const registryStem of registryItems) {
    candidates.push({
      id: String(registryStem.id || `stem:${slug(registryStem.stemType)}`),
      stemType: String(registryStem.stemType || "Unknown"),
      role: stemRole(registryStem.stemType),
      title: String(registryStem.title || registryStem.stemType || "Unknown stem"),
      duration: round(registryStem.duration || project.duration || 0, 2),
      audioPath: String(registryStem.localPath || ""),
      truthStatus: registryStem.localPath ? "verified_registry_path" : "registry_record_without_path",
    });
  }
  return uniqueBy(candidates, (stem) => normalizedStemType(stem.stemType));
}

function uniformBeatGrid(times) {
  if (!Array.isArray(times) || times.length < 8) return null;
  const values = times.map((item) => finite(typeof item === "object" ? item.t ?? item.start : item, NaN));
  if (values.some((value) => !Number.isFinite(value))) return null;
  const deltas = values.slice(1).map((value, index) => round(value - values[index], 4));
  const first = deltas[0];
  if (!deltas.every((value) => Math.abs(value - first) <= 0.0001)) return null;
  return { intervalSeconds: first, bpm: first > 0 ? round(60 / first, 3) : 0, count: values.length };
}

export function assessTimingTruth(projectInput) {
  const project = projectBody(projectInput) || {};
  const map = project.song_edit_map || {};
  const provenance = map.provenance || {};
  const audioTelemetry = map.audioTelemetry || {};
  const beatGrid = uniformBeatGrid(audioTelemetry.beatTimes || project.beats || []);
  const timedLyrics = Array.isArray(project.timed_lyrics) ? project.timed_lyrics : [];
  const lyricNumbersValid = timedLyrics.length > 0 && timedLyrics.every((line) => (
    Number.isFinite(Number(line.start))
      && Number.isFinite(Number(line.end))
      && Number(line.end) >= Number(line.start)
  ));
  const exactClaim = String(provenance.lyricTimingSource || "").includes("exact")
    || String(provenance.lyricTimingStrategy || "").includes("exact");
  const pathPresent = Boolean(provenance.lyricTimingPath);
  const trackMatches = !provenance.lyricTimingRegistryTrackId
    || String(provenance.lyricTimingRegistryTrackId) === String(project.registry_track_id || project.audio_id || "");
  const warnings = [];
  const timingTruth = project.lyric_timing_truth || {};
  const sourceHash = String(timingTruth.timingSourceSha256 || provenance.timingSourceSha256 || project.lyric_timing_heal?.timingSourceSha256 || "");
  const declaredActiveHash = String(timingTruth.activeTimingSha256 || provenance.activeTimingSha256 || project.lyric_timing_heal?.activeTimingSha256 || "");
  const computedActiveHash = crypto.createHash("sha256").update(JSON.stringify(timedLyrics)).digest("hex");
  const sourceMatchesActive = Boolean(sourceHash && declaredActiveHash && sourceHash === declaredActiveHash && declaredActiveHash === computedActiveHash && timingTruth.sourceMatchesActive !== false);
  const qualityStatus = String(timingTruth.qualityStatus || "unmeasured");
  const timingConfidence = Number(timingTruth.confidence ?? project.lyric_timing_heal?.timingConfidence ?? 0);
  let overlaps = 0; let duplicateStarts = 0;
  for (let index = 0; index < timedLyrics.length - 1; index += 1) {
    if (Number(timedLyrics[index].end) > Number(timedLyrics[index + 1].start) + .03) overlaps += 1;
    if (Math.abs(Number(timedLyrics[index].start) - Number(timedLyrics[index + 1].start)) < .01) duplicateStarts += 1;
  }
  if (beatGrid && (Math.abs(beatGrid.intervalSeconds - 0.5) < 0.0001 || Math.abs(beatGrid.intervalSeconds - 2.5) < 0.0001)) {
    warnings.push(`uniform-${beatGrid.intervalSeconds}s-grid-requires-source-proof`);
  }
  if (exactClaim && !pathPresent) warnings.push("exact-lyric-claim-missing-source-path");
  if (!trackMatches) warnings.push("lyric-timing-track-id-mismatch");
  if (timedLyrics.length > 0 && !lyricNumbersValid) warnings.push("invalid-lyric-time-window");
  if (pathPresent && !sourceHash) warnings.push("lyric-source-content-hash-missing");
  if (sourceHash && !sourceMatchesActive) warnings.push("lyric-source-content-mismatch");
  if (overlaps) warnings.push(`lyric-window-overlaps:${overlaps}`);
  if (duplicateStarts) warnings.push(`lyric-duplicate-starts:${duplicateStarts}`);
  if (timingConfidence > 0 && timingConfidence < .6) warnings.push(`low-lyric-alignment-confidence:${timingConfidence.toFixed(3)}`);
  let lyricStatus = "missing";
  if (lyricNumbersValid && trackMatches && pathPresent && sourceMatchesActive && qualityStatus === "source-aligned") lyricStatus = "verified_source_content";
  else if (lyricNumbersValid && trackMatches && pathPresent && sourceMatchesActive) lyricStatus = "source_aligned_needs_review";
  else if (lyricNumbersValid && trackMatches && pathPresent && sourceHash) lyricStatus = "quarantined_source_content_mismatch";
  else if (lyricNumbersValid && trackMatches && pathPresent) lyricStatus = "source_identity_unverified";
  else if (lyricNumbersValid && trackMatches) lyricStatus = "usable_inferred_missing_path";
  else if (timedLyrics.length > 0) lyricStatus = "quarantined";
  return {
    schemaVersion: "hapa.echo.timing-truth.v2",
    lyricStatus,
    beatStatus: beatGrid && warnings.some((warning) => warning.startsWith("uniform-")) ? "quarantined_uniform_grid" : beatGrid ? "measured_or_external_unverified" : "missing",
    exactClaim,
    sourcePath: String(provenance.lyricTimingPath || ""),
    registryTrackId: String(provenance.lyricTimingRegistryTrackId || project.registry_track_id || project.audio_id || ""),
    timedLyricCount: timedLyrics.length,
    timingSourceSha256: sourceHash,
    activeTimingSha256: computedActiveHash,
    sourceMatchesActive,
    qualityStatus,
    timingConfidence,
    overlaps,
    duplicateStarts,
    beatGrid,
    warnings,
  };
}

function clipWindow(start, end, duration) {
  const clippedStart = clamp(finite(start), 0, duration);
  const clippedEnd = clamp(finite(end), 0, duration);
  return clippedEnd > clippedStart ? [round(clippedStart), round(clippedEnd)] : null;
}

export function buildCueGraph(projectInput, options = {}) {
  const project = projectBody(projectInput) || {};
  const duration = Math.min(finite(options.duration, project.duration || 0), finite(project.duration, Infinity));
  const timingTruth = assessTimingTruth(project);
  const sections = (project.song_edit_map?.sections || [])
    .map((section, index) => {
      const window = clipWindow(section.start, section.end, duration);
      if (!window) return null;
      return {
        id: `section:${index}:${slug(section.id || section.label || section.type)}`,
        sourceId: String(section.id || ""),
        type: String(section.type || "section"),
        label: String(section.label || section.type || `Section ${index + 1}`),
        startSeconds: window[0],
        endSeconds: window[1],
        energy: clamp(section.energy ?? 0.5),
        vocalDensity: String(section.vocalDensity || "unknown"),
        source: String(project.song_edit_map?.provenance?.lyricTimingSource || "song-edit-map"),
      };
    })
    .filter(Boolean);
  const lyricCues = (project.timed_lyrics || [])
    .map((line, index) => {
      const window = clipWindow(line.start, line.end, duration);
      if (!window) return null;
      return {
        id: `lyric:${index}`,
        type: "lyric_line",
        startSeconds: window[0],
        endSeconds: window[1],
        text: String(line.text || ""),
        sectionId: String(line.section_id || ""),
        confidence: clamp(line.confidence ?? 0),
        source: String(line.timing_source || "unknown"),
        words: (line.words || []).map((word, wordIndex) => ({
          index: wordIndex,
          text: String(word.text || word.word || ""),
          startSeconds: round(word.start),
          endSeconds: round(word.end),
        })),
      };
    })
    .filter(Boolean);
  const editCues = (project.song_edit_map?.editPulses || [])
    .filter((pulse) => finite(pulse.t, Infinity) <= duration)
    .map((pulse, index) => ({
      id: `edit:${index}`,
      type: String(pulse.kind || "edit_pulse"),
      atSeconds: round(pulse.t),
      strength: clamp(pulse.strength ?? 0.5),
      source: String(pulse.source || "unknown"),
    }));
  const stemTelemetry = options.stemTelemetry?.schemaVersion === "hapa.stem-telemetry-bundle.v1" ? options.stemTelemetry : null;
  const sectionAt = (atSeconds) => sections.find((section) => section.startSeconds <= atSeconds && section.endSeconds > atSeconds) || null;
  const cue = ({ kind, atSeconds, source, confidence = null, toleranceSeconds = 0.08, sectionRole = "", eligibleActions = [], evidence = {} }) => {
    const normalized = {
      kind,
      atSeconds: round(atSeconds),
      source,
      confidence: confidence === null || confidence === undefined
        ? null
        : Number.isFinite(Number(confidence)) ? clamp(Number(confidence)) : null,
      toleranceSeconds,
      sectionRole: sectionRole || sectionAt(atSeconds)?.type || "unsectioned",
      eligibleActions,
      evidence,
      approved: true,
    };
    return { id: `cue:${contentHash(normalized).slice(0, 16)}`, ...normalized };
  };
  const sectionCues = sections.flatMap((section) => [
    cue({ kind: section.type === "chorus" || section.type === "hook" ? "hook" : "section_start", atSeconds: section.startSeconds, source: section.source, confidence: null, toleranceSeconds: 0.12, sectionRole: section.type, eligibleActions: ["cut", "transition", "camera-keyframe", "visualizer-stack-change", "director-hold"], evidence: { sectionId: section.id, boundary: "start" } }),
    cue({ kind: "section_end", atSeconds: section.endSeconds, source: section.source, confidence: null, toleranceSeconds: 0.12, sectionRole: section.type, eligibleActions: ["cut", "transition", "ringout", "director-hold"], evidence: { sectionId: section.id, boundary: "end" } }),
  ]);
  const phraseCues = lyricCues.map((line) => cue({
    kind: "phrase",
    atSeconds: line.startSeconds,
    source: line.source,
    confidence: line.confidence,
    toleranceSeconds: timingTruth.lyricStatus === "verified_source_path" ? 0.06 : 0.18,
    sectionRole: sectionAt(line.startSeconds)?.type,
    eligibleActions: ["lyric-window", "camera-keyframe", "visual-time-breath", "accent"],
    evidence: { lyricCueId: line.id, text: line.text },
  }));
  const pulseCues = editCues.map((pulse) => cue({
    kind: pulse.type,
    atSeconds: pulse.atSeconds,
    source: pulse.source,
    confidence: null,
    toleranceSeconds: 0.1,
    eligibleActions: ["cut", "accent", "deck-swap", "effect"],
    evidence: { editCueId: pulse.id, strength: pulse.strength },
  }));
  const stemCues = [];
  if (stemTelemetry) {
    for (const stem of stemTelemetry.stems || []) {
      const frames = stem.frames || [];
      const candidates = frames
        .map((frame, index) => ({ frame, index }))
        .filter(({ frame, index }) => Number(frame.onset || 0) >= 0.72 && Number(frame.onset || 0) >= Number(frames[index - 1]?.onset || 0) && Number(frame.onset || 0) >= Number(frames[index + 1]?.onset || 0))
        .sort((left, right) => Number(right.frame.onset) - Number(left.frame.onset) || Number(left.frame.t) - Number(right.frame.t))
        .slice(0, 32)
        .sort((left, right) => Number(left.frame.t) - Number(right.frame.t));
      for (const { frame } of candidates) stemCues.push(cue({
        kind: "stem_onset",
        atSeconds: frame.t,
        source: `${stemTelemetry.analysisVersion}:${stem.role}`,
        confidence: Number(frame.onset),
        toleranceSeconds: 1 / Number(stemTelemetry.fps || 10),
        eligibleActions: ["accent", "camera-impulse", "visualizer-uniform", "effect"],
        evidence: { stemId: stem.id, stemRole: stem.role, onset: frame.onset, bundleTruth: stemTelemetry.truthStatus },
      }));
    }
    const masterFrames = stemTelemetry.masterMix?.frames || [];
    let silenceStart = null;
    masterFrames.forEach((frame, index) => {
      if (frame.silence && silenceStart === null) silenceStart = Number(frame.t);
      const ending = silenceStart !== null && (!frame.silence || index === masterFrames.length - 1);
      if (!ending) return;
      const end = Number(frame.t);
      if (end - silenceStart >= 0.4) {
        stemCues.push(cue({ kind: "silence_start", atSeconds: silenceStart, source: `${stemTelemetry.analysisVersion}:master`, confidence: 1, toleranceSeconds: 1 / stemTelemetry.fps, eligibleActions: ["director-hold", "media-hold", "visualizer-decay"], evidence: { durationSeconds: round(end - silenceStart) } }));
        stemCues.push(cue({ kind: end >= duration - 0.5 ? "ringout" : "silence_end", atSeconds: end, source: `${stemTelemetry.analysisVersion}:master`, confidence: 1, toleranceSeconds: 1 / stemTelemetry.fps, eligibleActions: ["cut", "transition", "resume", "ringout"], evidence: { durationSeconds: round(end - silenceStart) } }));
      }
      silenceStart = frame.silence ? silenceStart : null;
    });
  }
  const cues = uniqueBy([...sectionCues, ...phraseCues, ...pulseCues, ...stemCues], (item) => item.id)
    .sort((left, right) => left.atSeconds - right.atSeconds || left.kind.localeCompare(right.kind));
  const base = {
    schemaVersion: CUE_GRAPH_SCHEMA,
    songId: String(project.song_id || ""),
    registryTrackId: String(project.registry_track_id || project.audio_id || ""),
    durationSeconds: round(duration),
    timingTruth,
    sections,
    lyricCues,
    editCues,
    cues,
    stemTelemetry: stemTelemetry ? {
      schemaVersion: stemTelemetry.schemaVersion,
      analysisVersion: stemTelemetry.analysisVersion,
      truthStatus: stemTelemetry.truthStatus,
      fps: stemTelemetry.fps,
      canonicalStemCount: stemTelemetry.canonicalStemCount,
    } : null,
    truthRule: "No beat, bar, hook, stem event, or confidence is invented when source evidence is absent.",
  };
  return { ...base, cueGraphId: `cue:${contentHash(base).slice(0, 20)}` };
}

export function resolveEchoMediaUri(uri, avatarRoot = DEFAULT_AVATAR_ROOT) {
  const value = String(uri || "");
  if (value.startsWith("/media/")) return path.join(avatarRoot, "data", value.replace(/^\/+/, ""));
  if (value.startsWith("/api/local-file?")) {
    try {
      const parsed = new URL(value, "http://127.0.0.1");
      return parsed.searchParams.get("path") || "";
    } catch {
      return "";
    }
  }
  if (value.startsWith("file://")) {
    try { return decodeURIComponent(new URL(value).pathname); } catch { return ""; }
  }
  return path.isAbsolute(value) ? value : "";
}

function normalizedManifestId(value) {
  return String(value || "").trim().replace(/^isf:/i, "").toLowerCase();
}

function normalizedManifestTitle(value) {
  return String(value || "").trim().toLowerCase();
}

function resolveManifestShader(manifest, id, title) {
  const shaders = Array.isArray(manifest) ? manifest : manifest?.shaders || [];
  const requestedId = String(id || "").trim();
  const requestedTitle = String(title || "").trim();
  const cleanId = normalizedManifestId(requestedId);
  const cleanTitle = normalizedManifestTitle(requestedTitle);
  const exactIdCandidates = cleanId
    ? shaders.filter((shader) => normalizedManifestId(shader.id || shader.shaderId) === cleanId)
    : [];

  // Immutable identity is resolved in its own pass. A duplicate title earlier in
  // the manifest must never steal a later exact-ID match.
  if (exactIdCandidates.length > 0) {
    const shader = exactIdCandidates[0];
    return {
      shader,
      receipt: {
        status: "exact-id",
        fallbackUsed: false,
        requestedSourceId: requestedId,
        requestedTitle,
        resolvedSourceId: String(shader.id || shader.shaderId || ""),
        candidateSourceIds: exactIdCandidates.map((candidate) => String(candidate.id || candidate.shaderId || "")),
        reason: exactIdCandidates.length === 1 ? "immutable-manifest-id-match" : "duplicate-manifest-id-first-entry-selected",
      },
    };
  }

  const titleCandidates = cleanTitle
    ? shaders.filter((shader) => normalizedManifestTitle(shader.title) === cleanTitle)
    : [];
  if (titleCandidates.length === 1) {
    const shader = titleCandidates[0];
    return {
      shader,
      receipt: {
        status: "title-fallback",
        fallbackUsed: true,
        requestedSourceId: requestedId,
        requestedTitle,
        resolvedSourceId: String(shader.id || shader.shaderId || ""),
        candidateSourceIds: [String(shader.id || shader.shaderId || "")],
        reason: "requested-id-missing-unique-title-match",
      },
    };
  }

  return {
    shader: null,
    receipt: {
      status: titleCandidates.length > 1 ? "ambiguous-title" : "missing-id-and-title",
      fallbackUsed: false,
      requestedSourceId: requestedId,
      requestedTitle,
      resolvedSourceId: "",
      candidateSourceIds: titleCandidates.map((candidate) => String(candidate.id || candidate.shaderId || "")),
      reason: titleCandidates.length > 1
        ? "requested-id-missing-title-match-is-not-unique"
        : "no-manifest-id-or-unique-title-match",
    },
  };
}

function numericDefaults(inputs = []) {
  return Object.fromEntries(
    inputs
      .filter((input) => ["float", "long", "bool"].includes(String(input.TYPE || input.type || "").toLowerCase()))
      .map((input) => [String(input.NAME || input.name), finite(input.DEFAULT ?? input.default, 0)]),
  );
}

function focusForSection(sectionType, availableRoles) {
  const preferred = {
    intro: ["synth", "keyboard", "strings"],
    verse: ["leadVocals", "guitar", "keyboard"],
    chorus: ["drums", "bass", "backingVocals"],
    hook: ["drums", "bass", "backingVocals"],
    bridge: ["strings", "backingVocals", "synth"],
    outro: ["leadVocals", "strings", "synth"],
  }[String(sectionType || "").toLowerCase()] || ["leadVocals", "drums", "bass", "synth"];
  return preferred.find((role) => availableRoles.has(role)) || [...availableRoles][0] || "master";
}

export function buildEditorialTreatment(projectInput, cueGraph, manifest, registry = null, options = {}) {
  const project = projectBody(projectInput) || {};
  const duration = cueGraph.durationSeconds;
  const stems = normalizeStemRecords(project, registry);
  const availableRoles = new Set(stems.map((stem) => stem.role));
  const sourceShots = (project.timeline || [])
    .map((shot, index) => {
      const window = clipWindow(shot.start_sec, shot.end_sec, duration);
      if (!window) return null;
      const archivalUri = String(shot.media_contract?.originalUri || shot.media_uri || shot.uri || "");
      const runtimeUri = String(shot.media_contract?.runtimeUri || shot.runtime_media_uri || archivalUri);
      const mediaType = String(shot.media_contract?.type || "");
      const intentionalVisualizer = mediaType === "generated-visualizer"
        || shot.media_id === "none";
      return {
        id: `slot:${index}`,
        sourceShotIndex: index,
        sectionId: String(shot.section_id || ""),
        sectionType: String(shot.section_type || "section"),
        startSeconds: window[0],
        endSeconds: window[1],
        editReason: String(shot.edit_reason || ""),
        decisionEvidence: shot.decision_evidence || {
          schemaVersion: "hapa.echo.shot-decision-evidence.v2",
          truthStatus: "unmeasured",
          scoreComponents: {},
          evidence: [],
          rejectedAlternatives: [],
          confidence: { value: null, basis: "unmeasured" },
        },
        media: {
          id: String(shot.media_id || `media:${index}`),
          title: String(shot.media_title || shot.media_id || `Media ${index + 1}`),
          uri: archivalUri,
          runtimeUri,
          localPath: resolveEchoMediaUri(runtimeUri, options.avatarRoot),
          sourceKind: intentionalVisualizer
            ? "pure-visualizer"
            : mediaType === "image" || /\.(png|jpe?g|webp|gif|avif)(?:$|[?#])/i.test(runtimeUri || archivalUri) ? "local-photo" : "local-video",
          truthStatus: intentionalVisualizer
            ? "intentional-no-media"
            : "existing_echo_candidate_unverified_semantics",
        },
        camera: {
          motion: String(shot.camera_motion || "static"),
          intensity: finite(shot.camera_intensity, 1),
          speed: finite(shot.camera_speed, 1),
          focus: String(shot.camera_focus || "center"),
        },
        transition: String(shot.transition || "cut"),
        locks: index === 0 ? ["timing", "media"] : ["timing"],
      };
    })
    .filter(Boolean);
  const sectionPools = new Map();
  for (const shot of sourceShots) {
    const list = sectionPools.get(shot.sectionId) || [];
    list.push(shot.media);
    sectionPools.set(shot.sectionId, uniqueBy(list, (media) => media.id));
  }
  const allMedia = uniqueBy(sourceShots.map((shot) => shot.media), (media) => media.id);
  const mediaSlots = sourceShots.map((shot, index) => {
    const localPool = (sectionPools.get(shot.sectionId) || []).filter((media) => media.sourceKind !== "pure-visualizer");
    const playableMedia = allMedia.filter((media) => media.sourceKind !== "pure-visualizer");
    const candidates = shot.media.sourceKind === "pure-visualizer" ? [shot.media] : uniqueBy([
      shot.media,
      ...localPool,
      ...playableMedia.slice(index % Math.max(1, playableMedia.length)),
      ...playableMedia,
    ], (media) => media.id).slice(0, 5);
    return {
      ...shot,
      locks: shot.media.sourceKind === "pure-visualizer" ? uniqueBy([...(shot.locks || []), "media"], (item) => item) : shot.locks,
      candidateMedia: candidates.map((media, rank) => ({
        ...media,
        rank,
        evidence: rank === 0
          ? ["current-echo-selection"]
          : ["same-treatment-media-pool", localPool.some((item) => item.id === media.id) ? "same-section" : "cross-section-alternate"],
        semanticScore: null,
      })),
    };
  });
  const visualizerRows = (project.visualizer_timeline || [])
    .map((segment, index) => {
      const window = clipWindow(segment.start_sec, segment.end_sec, duration);
      const requestedSourceId = String(segment.visualizer_id || "");
      const requestedTitle = String(segment.visualizer_title || "");
      if (!window) {
        return {
          visualizer: null,
          receipt: {
            sourceCueIndex: index,
            requestedSourceId,
            requestedTitle,
            resolvedSourceId: "",
            resolutionStatus: "not-resolved-invalid-window",
            eligibilityStatus: "rejected-invalid-window",
            fallbackUsed: false,
            reason: "cue-window-empty-after-duration-clipping",
            startSeconds: null,
            endSeconds: null,
          },
        };
      }
      const resolution = resolveManifestShader(manifest, requestedSourceId, requestedTitle);
      const { shader } = resolution;
      const section = cueGraph.sections.find((item) => item.startSeconds <= window[0] && item.endSeconds > window[0]);
      const stemFocus = focusForSection(section?.type, availableRoles);
      const layerRole = index % 3 === 0 ? "atmosphere" : index % 3 === 1 ? "rhythm" : "accent";
      const controls = numericDefaults(shader?.inputs || []);
      const blendMode = index % 2 === 0 ? "screen" : "plus-lighter";
      const opacity = index % 3 === 2 ? 0.34 : 0.48;
      const sourceAvailable = Boolean(shader?.source);
      const sourceCueOverride = Boolean(shader && (shader.directorEligible === false || shader.enabled === false));
      const eligibility = sourceAvailable
        ? sourceCueOverride
          ? { status: "source-cue-override", reason: "manifest-director-ineligible-explicit-source-cue-selection" }
          : { status: "eligible", reason: "manifest-source-executable" }
        : { status: "explicit-fallback-required", reason: shader ? "manifest-entry-missing-source" : resolution.receipt.reason };
      const fidelity = resolution.receipt.status === "exact-id"
        ? "manifest-exact-id"
        : resolution.receipt.status === "title-fallback"
          ? "manifest-explicit-title-fallback"
          : resolution.receipt.status;
      const portableCard = buildPortableVisualizerCard(shader || { id: requestedSourceId, title: requestedTitle }, {
        stemFocus,
        layerRole,
        controls,
        blendMode,
        opacity,
        target: "program",
        mix: 1,
        transition: String(segment.transition || "crossfade"),
        nativeProxyAvailable: Boolean(
          shader?.nativeRoute?.proxy
          && typeof options.nativeProxyAvailable === "function"
          && options.nativeProxyAvailable(shader.nativeRoute.proxy, shader),
        ),
        hyperframesProxy: shader?.hyperframesProxy || null,
        hyperframesProxyAvailable: Boolean(
          shader?.hyperframesProxy
          && typeof options.nativeProxyAvailable === "function"
          && options.nativeProxyAvailable(shader.hyperframesProxy, shader),
        ),
        provenanceSource: resolution.receipt.status === "exact-id"
          ? "music-viz-isf-manifest-exact-id"
          : `music-viz-isf-manifest-${resolution.receipt.status}`,
      });
      const visualizer = {
        id: `visualizer:${index}:${slug(requestedSourceId || requestedTitle)}`,
        sourceCueIndex: index,
        requestedSourceId,
        requestedTitle,
        sourceId: String(shader?.id || shader?.shaderId || requestedSourceId),
        resolvedSourceId: String(shader?.id || shader?.shaderId || ""),
        resolutionStatus: resolution.receipt.status,
        eligibilityStatus: eligibility.status,
        title: String(shader?.title || requestedTitle || "Unknown visualizer"),
        source: String(shader?.source || ""),
        startSeconds: window[0],
        endSeconds: window[1],
        transition: String(segment.transition || "crossfade"),
        layerRole,
        stemFocus,
        inputs: shader?.inputs || [],
        audioMap: shader?.audioMap || {},
        controls,
        blendMode,
        opacity,
        fidelity,
        manifestResolution: resolution.receipt,
        eligibility,
        nativeRoute: portableCard.nativeRoute,
        portableCard,
      };
      return {
        visualizer,
        receipt: {
          sourceCueIndex: index,
          requestedSourceId,
          requestedTitle,
          resolvedSourceId: String(shader?.id || ""),
          resolutionStatus: resolution.receipt.status,
          eligibilityStatus: eligibility.status,
          fallbackUsed: resolution.receipt.fallbackUsed,
          reason: eligibility.reason,
          nativeRoute: portableCard.nativeRoute,
          startSeconds: window[0],
          endSeconds: window[1],
        },
      };
    });
  const visualizers = visualizerRows.flatMap((row) => row.visualizer ? [row.visualizer] : []);
  const visualizerReceipts = visualizerRows.map((row) => row.receipt);
  const base = {
    schemaVersion: TREATMENT_SCHEMA,
    compilerVersion: DIRECTOR_V2_COMPILER_VERSION,
    songId: String(project.song_id || ""),
    songTitle: String(project.song_title || "Untitled"),
    registryTrackId: String(project.registry_track_id || project.audio_id || ""),
    durationSeconds: duration,
    sourceProjectHash: contentHash(project),
    cueGraphId: cueGraph.cueGraphId,
    stems,
    mediaSlots,
    visualizers,
    visualizerReceipts,
    inputHashes: {
      song: contentHash({ songId: project.song_id, registryTrackId: project.registry_track_id || project.audio_id, duration: project.duration }),
      lyrics: contentHash(cueGraph.lyricCues),
      telemetry: contentHash({ sections: cueGraph.sections, editCues: cueGraph.editCues, timingTruth: cueGraph.timingTruth }),
      stems: contentHash(stems),
      mediaAffordances: contentHash(mediaSlots),
      visualizerCatalog: contentHash(visualizers),
      canon: contentHash(project.canon_affordance_graph || null),
      promptAgent: contentHash({ compilerVersion: DIRECTOR_V2_COMPILER_VERSION, recipeSchema: DEFAULT_VARIANT_RECIPES }),
    },
    locks: [
      { type: "truth", target: "cueGraph", reason: "Variants may not invent timing truth." },
      { type: "structure", target: "section-boundaries", reason: "Variants preserve the canonical section arc." },
    ],
    confidenceRule: "Null means unmeasured. No quality or semantic score is derived from hashes.",
  };
  return { ...base, treatmentId: `treatment:${contentHash(base).slice(0, 20)}` };
}

function recipeFor(recipe) {
  if (typeof recipe === "string") return DEFAULT_VARIANT_RECIPES[recipe] || DEFAULT_VARIANT_RECIPES.conservative;
  const parent = DEFAULT_VARIANT_RECIPES[recipe?.id] || DEFAULT_VARIANT_RECIPES.conservative;
  return { ...parent, ...(recipe || {}), id: String(recipe?.id || parent.id) };
}

function mediaAt(slots, time) {
  return slots.find((slot) => slot.startSeconds <= time && slot.endSeconds > time)?.candidateMedia?.[0]
    || slots[0]?.candidateMedia?.[0]
    || { id: "none", title: "No media", localPath: "", sourceKind: "missing" };
}

function provenanceStrings(input) {
  return Object.fromEntries(Object.entries(input).map(([key, value]) => [key, String(value ?? "")]));
}

function visualizerMappings(visualizer) {
  return Object.fromEntries(
    Object.entries(visualizer.audioMap || {}).map(([uniform, mapping]) => [
      uniform,
      `${visualizer.stemFocus}:${String(mapping?.signal || "off")}`,
    ]),
  );
}

function modulationBindings(visualizers, recipe) {
  const executableEnvelope = (overrides = {}) => ({
    depth: 0.2,
    baseValue: 0,
    attackSeconds: 0.04,
    releaseSeconds: 0.18,
    smoothingSeconds: 0.03,
    easing: "power2.out",
    clamp: [0, 1],
    quantize: "frame",
    quantizeStep: 0,
    gate: { threshold: 0.02, floor: 0 },
    delaySeconds: 0,
    polarity: "positive",
    safetyBounds: { min: 0, max: 1, maxDeltaPerSecond: 8 },
    ...overrides,
  });
  const visualizerBindings = visualizers.flatMap((visualizer) => (
    Object.entries(visualizer.audioMap || {})
      .filter(([, mapping]) => String(mapping?.signal || "off") !== "off")
      .map(([uniform, mapping]) => ({
        id: `${visualizer.id}:${uniform}`,
        source: { kind: "stem_signal", stemFocus: visualizer.stemFocus, signal: String(mapping.signal) },
        target: { kind: "visualizer_uniform", visualizerId: visualizer.id, uniform },
        envelope: executableEnvelope({
          depth: round(clamp(mapping.depth ?? 0.2) * recipe.visualizerMix),
          quantize: mapping.signal === "beat" ? "beat" : "frame",
        }),
      }))
  ));
  return [
    ...visualizerBindings,
    {
      id: "camera:bass-mass",
      source: { kind: "stem_signal", stemFocus: "bass", signal: "bass" },
      target: { kind: "camera", property: "scale" },
      envelope: executableEnvelope({ baseValue: 1.04, depth: round(0.08 * recipe.cameraEnergy), attackSeconds: 0.08, releaseSeconds: 0.42, smoothingSeconds: 0.08, easing: "sine.out", clamp: [1.04, 1.18], safetyBounds: { min: 1.04, max: 1.18, maxDeltaPerSecond: 0.5 } }),
    },
    {
      id: "edit:drum-permission",
      source: { kind: "stem_signal", stemFocus: "drums", signal: "peak" },
      target: { kind: "edit_permission", property: "accent" },
      envelope: executableEnvelope({ depth: round(recipe.accentDensity), attackSeconds: 0.01, releaseSeconds: 0.08, smoothingSeconds: 0.01, easing: "power3.out", clamp: [0, 1], cooldownSeconds: 0.22, gate: { threshold: 0.62, floor: 0 } }),
    },
    {
      id: "time:phrase-breath",
      source: { kind: "cue", signal: "phrase_boundary" },
      target: { kind: "visual_time", property: "rate" },
      envelope: executableEnvelope({ baseValue: 1, depth: round(recipe.temporalModulation), attackSeconds: 0.12, releaseSeconds: 0.5, smoothingSeconds: 0.1, easing: "sine.inOut", clamp: [0.78, 1.18], safetyBounds: { min: 0.78, max: 1.18, maxDeltaPerSecond: 0.4 } }),
    },
    {
      id: "master:mix-bloom",
      source: { kind: "mix_signal", bus: "master", signal: "rms" },
      target: { kind: "effect", property: "bloom" },
      envelope: executableEnvelope({ depth: 0.16, attackSeconds: 0.08, releaseSeconds: 0.28, smoothingSeconds: 0.05, clamp: [0, 0.28], safetyBounds: { min: 0, max: 0.28, maxDeltaPerSecond: 0.7 } }),
    },
  ];
}

function admitVisualizerLayers(visualizers, requestedMaxLayers) {
  const maxLayers = Math.max(1, Math.min(6, Math.floor(finite(requestedMaxLayers, 1))));
  const layers = Array.from({ length: maxLayers }, () => ({ endSeconds: -Infinity, visualizerId: "" }));
  const admissions = new Map();
  const ordered = visualizers
    .map((visualizer, index) => ({ visualizer, index }))
    .sort((left, right) => (
      left.visualizer.startSeconds - right.visualizer.startSeconds
      || left.visualizer.endSeconds - right.visualizer.endSeconds
      || left.visualizer.sourceCueIndex - right.visualizer.sourceCueIndex
      || left.index - right.index
    ));

  for (const { visualizer, index } of ordered) {
    if (visualizer.eligibility?.status === "explicit-fallback-required") {
      admissions.set(index, {
        status: "ineligible-manifest-resolution",
        layerIndex: null,
        maxConcurrentLayers: maxLayers,
        activeVisualizerIds: [],
        reason: visualizer.eligibility.reason,
      });
      continue;
    }
    const availableLayer = layers.findIndex((layer) => layer.endSeconds <= visualizer.startSeconds);
    if (availableLayer >= 0) {
      layers[availableLayer] = { endSeconds: visualizer.endSeconds, visualizerId: visualizer.id };
      admissions.set(index, {
        status: "admitted",
        layerIndex: availableLayer,
        maxConcurrentLayers: maxLayers,
        activeVisualizerIds: [],
        reason: "within-simultaneous-layer-limit",
      });
      continue;
    }
    admissions.set(index, {
      status: "rejected-concurrency-limit",
      layerIndex: null,
      maxConcurrentLayers: maxLayers,
      activeVisualizerIds: layers.filter((layer) => layer.endSeconds > visualizer.startSeconds).map((layer) => layer.visualizerId),
      reason: "all-simultaneous-visualizer-layers-occupied",
    });
  }

  return {
    maxLayers,
    visualizers: visualizers.map((visualizer, index) => ({ ...visualizer, layerAdmission: admissions.get(index) })),
  };
}

export function compileDirectorVariant({ treatment, cueGraph, recipe = "conservative", seed = "echo-v2", sourceProject = null }) {
  const normalizedRecipe = recipeFor(recipe);
  const slots = treatment.mediaSlots.map((slot, index) => {
    const candidates = slot.candidateMedia || [];
    const offset = normalizedRecipe.mediaOffset % Math.max(1, candidates.length);
    const jitter = Math.floor(seededUnit(seed, `media:${slot.id}`) * Math.max(1, candidates.length));
    const selected = slot.locks?.includes("media")
      ? candidates[0] || slot.media
      : candidates[(offset + jitter) % Math.max(1, candidates.length)] || candidates[0] || slot.media;
    return { ...slot, selectedMedia: selected, compiledIndex: index };
  });
  const trackA = slots.map((slot, index) => {
    const nearestCue = (cueGraph.cues || []).reduce((best, candidate) => {
      const delta = Math.abs(Number(candidate.atSeconds) - slot.startSeconds);
      return !best || delta < best.delta ? { cue: candidate, delta } : best;
    }, null);
    const approvedCue = nearestCue && nearestCue.delta <= Math.max(0.12, Number(nearestCue.cue.toleranceSeconds || 0)) ? nearestCue.cue : null;
    return ({
      id: `card:a:${index}`,
      trackId: "track-a",
      startSeconds: slot.startSeconds,
      endSeconds: slot.endSeconds,
      transition: slot.transition,
      cameraKeyframes: [
        { atSeconds: slot.startSeconds, motion: slot.camera.motion, intensity: slot.camera.intensity, speed: slot.camera.speed },
        { atSeconds: slot.endSeconds, motion: slot.camera.motion, intensity: slot.camera.intensity, speed: slot.camera.speed },
      ],
      media: {
        id: slot.selectedMedia.id,
        title: slot.selectedMedia.title,
        sourceKind: slot.selectedMedia.sourceKind,
        groupId: slot.sectionId,
        groupName: slot.sectionType,
        localPath: slot.selectedMedia.localPath,
      },
      parameters: {
        opacity: 1,
        blendMode: "normal",
        target: "video-a",
        motion: slot.camera.motion,
        visualizerControls: {},
        visualizerMappings: {},
        favorite: index === 0,
      },
      provenance: provenanceStrings({
        treatmentId: treatment.treatmentId,
        cueGraphId: cueGraph.cueGraphId,
        sourceSlotId: slot.id,
        truthStatus: slot.selectedMedia.truthStatus,
        semanticScore: slot.selectedMedia.semanticScore,
        recipe: normalizedRecipe.id,
        seed,
        boundaryCueId: approvedCue?.id || "",
        offGridReason: approvedCue ? "" : "source-shot-boundary-preserved-no-approved-cue-within-tolerance",
      }),
      decisionEvidence: slot.decisionEvidence,
      knockedOut: slot.selectedMedia.sourceKind === "pure-visualizer",
    });
  });
  const visualizerAdmission = admitVisualizerLayers(treatment.visualizers, normalizedRecipe.maxVisualizerLayers);
  const compiledVisualizers = visualizerAdmission.visualizers;
  const executableVisualizers = compiledVisualizers.filter((visualizer) => visualizer.layerAdmission.status === "admitted");
  const firstExecutableVisualizerId = executableVisualizers[0]?.id || "";
  const trackB = compiledVisualizers.map((visualizer, index) => {
    const media = mediaAt(slots, visualizer.startSeconds);
    const executionStatus = visualizer.layerAdmission.status === "rejected-concurrency-limit"
      ? "rejected-concurrency-limit"
      : visualizer.layerAdmission.status === "ineligible-manifest-resolution"
        ? "explicit-fallback-required"
        : visualizer.eligibility.status === "source-cue-override"
          ? "executable-source-cue-override"
          : visualizer.manifestResolution.status === "title-fallback"
            ? "executable-explicit-title-fallback"
            : "executable";
    const knockedOut = !executionStatus.startsWith("executable");
    return {
      id: `card:b:${index}`,
      trackId: "track-b",
      sourceCueIndex: visualizer.sourceCueIndex,
      requestedSourceId: visualizer.requestedSourceId,
      resolutionStatus: visualizer.manifestResolution.status,
      eligibilityStatus: visualizer.eligibility.status,
      executionStatus,
      startSeconds: visualizer.startSeconds,
      endSeconds: visualizer.endSeconds,
      transition: visualizer.transition,
      media: {
        id: media.id,
        title: media.title,
        sourceKind: media.sourceKind,
        groupId: visualizer.layerRole,
        groupName: visualizer.title,
        localPath: media.localPath,
      },
      visualization: {
        sourceCueIndex: visualizer.sourceCueIndex,
        requestedSourceId: visualizer.requestedSourceId,
        sourceId: visualizer.sourceId,
        nativeKey: visualizer.nativeRoute.nativeKey,
        nativeRoute: visualizer.nativeRoute,
        status: visualizer.nativeRoute.status,
        sourceStatus: visualizer.fidelity,
        resolutionStatus: visualizer.manifestResolution.status,
        eligibilityStatus: visualizer.eligibility.status,
        executionStatus,
        layerIndex: visualizer.layerAdmission.layerIndex,
        maxConcurrentLayers: visualizer.layerAdmission.maxConcurrentLayers,
        fallbackReceipt: visualizer.manifestResolution.fallbackUsed || knockedOut
          ? {
            requestedSourceId: visualizer.requestedSourceId,
            resolvedSourceId: visualizer.manifestResolution.resolvedSourceId,
            resolutionStatus: visualizer.manifestResolution.status,
            executionStatus,
            reason: knockedOut ? visualizer.layerAdmission.reason : visualizer.manifestResolution.reason,
          }
          : null,
        card: visualizer.portableCard,
      },
      parameters: {
        opacity: round(visualizer.opacity * normalizedRecipe.visualizerMix),
        blendMode: visualizer.blendMode,
        target: "program",
        motion: "stem-modulated",
        visualizerControls: visualizer.controls,
        visualizerMappings: visualizerMappings(visualizer),
        favorite: visualizer.id === firstExecutableVisualizerId,
      },
      provenance: provenanceStrings({
        treatmentId: treatment.treatmentId,
        manifestSource: visualizer.source,
        stemFocus: visualizer.stemFocus,
        layerRole: visualizer.layerRole,
        fidelity: visualizer.fidelity,
        requestedSourceId: visualizer.requestedSourceId,
        resolutionStatus: visualizer.manifestResolution.status,
        eligibilityStatus: visualizer.eligibility.status,
        executionStatus,
      }),
      executionReceipt: {
        sourceCueIndex: visualizer.sourceCueIndex,
        requestedSourceId: visualizer.requestedSourceId,
        resolvedSourceId: visualizer.manifestResolution.resolvedSourceId,
        resolutionStatus: visualizer.manifestResolution.status,
        eligibilityStatus: visualizer.eligibility.status,
        executionStatus,
        fallbackUsed: visualizer.manifestResolution.fallbackUsed,
        reason: knockedOut ? visualizer.layerAdmission.reason : visualizer.eligibility.reason,
        startSeconds: visualizer.startSeconds,
        endSeconds: visualizer.endSeconds,
        layerIndex: visualizer.layerAdmission.layerIndex,
        maxConcurrentLayers: visualizer.layerAdmission.maxConcurrentLayers,
        nativeRoute: visualizer.nativeRoute,
      },
      knockedOut,
    };
  });
  const nativeShaderRoutes = nativeVisualizerRouteCounts(trackB);
  const accentCandidates = cueGraph.editCues.filter((cue) => cue.strength >= 0.58);
  const accentCount = Math.min(accentCandidates.length, Math.max(1, Math.round(accentCandidates.length * normalizedRecipe.accentDensity)));
  const accentNativeRoute = resolveNativeVisualizerRoute({ id: "director:accent", title: "Director accent" });
  const trackC = accentCandidates.slice(0, accentCount).map((cue, index) => {
    const media = mediaAt(slots, cue.atSeconds);
    const duration = round(0.18 + 0.34 * cue.strength);
    const approvedCue = cueGraph.cues?.find((candidate) => candidate.evidence?.editCueId === cue.id);
    return {
      id: `card:c:${index}`,
      trackId: "track-c",
      startSeconds: cue.atSeconds,
      endSeconds: Math.min(cueGraph.durationSeconds, round(cue.atSeconds + duration)),
      media: {
        id: media.id,
        title: media.title,
        sourceKind: media.sourceKind,
        groupId: "accent",
        groupName: cue.type,
        localPath: media.localPath,
      },
      visualization: { sourceId: "director:accent", nativeKey: null, nativeRoute: accentNativeRoute, status: "unsupported" },
      parameters: {
        opacity: round(0.18 + cue.strength * 0.28),
        blendMode: "screen",
        target: "program",
        motion: "shutter-accent",
        visualizerControls: { strength: cue.strength, duration },
        visualizerMappings: { strength: "drums:peak" },
        favorite: false,
      },
      provenance: provenanceStrings({ cueId: approvedCue?.id || cue.id, cueSource: cue.source, safety: "bounded-accent-density" }),
      knockedOut: false,
    };
  });
  const accentTrack = buildAccentEventTrack({
    cues: cueGraph.cues,
    density: normalizedRecipe.accentDensity,
    durationSeconds: treatment.durationSeconds,
  });
  const visualTimeTrack = buildVisualTimeTrack({
    cues: cueGraph.cues,
    density: normalizedRecipe.temporalModulation,
    durationSeconds: treatment.durationSeconds,
  });
  const source = projectBody(sourceProject) || {};
  const cadenceTrack = buildPhraseCadence({
    sections: cueGraph.sections,
    editCues: cueGraph.editCues,
    beatTimes: source.song_edit_map?.audioTelemetry?.beatTimes || [],
    durationSeconds: treatment.durationSeconds,
  });
  const lyricDirectionTrack = buildLyricDirectionTrack({
    sections: cueGraph.sections,
    lyricCues: cueGraph.lyricCues,
    mediaSlots: treatment.mediaSlots,
  });
  const audioFallbackProfile = buildAudioFallbackProfile({
    stems: treatment.stems,
    sections: cueGraph.sections,
    lyricCues: cueGraph.lyricCues,
    beatTimes: source.song_edit_map?.audioTelemetry?.beatTimes || [],
    durationSeconds: treatment.durationSeconds,
    timingTruth: cueGraph.timingTruth,
  });
  const mediaRoleCamera = slots.map((slot, index) => {
    const sourceShot = source.timeline?.[slot.sourceShotIndex ?? index] || {};
    const contract = sourceShot.media_contract || {};
    const technical = {
      width: contract.dimensions?.width || 1920,
      height: contract.dimensions?.height || 1080,
      durationSec: Number(slot.endSeconds) - Number(slot.startSeconds),
      fps: contract.fps || 24,
      codec: contract.type === "image" ? "image" : contract.proxy?.codec || "unknown",
      keyframes: { count: contract.keyframeIntervalSeconds ? Math.max(1, Math.round((Number(slot.endSeconds) - Number(slot.startSeconds)) / contract.keyframeIntervalSeconds)) : null },
    };
    const phraseCue = cueGraph.lyricCues.find((cue) => Number(cue.startSeconds) >= Number(slot.startSeconds) && Number(cue.startSeconds) < Number(slot.endSeconds)) || cueGraph.cues.find((cue) => Number(cue.atSeconds) >= Number(slot.startSeconds) && Number(cue.atSeconds) < Number(slot.endSeconds));
    const analysis = slot.selectedMedia.roi || { status: "center-safe-fallback", evidence: "no-subject-analysis-attached", subjectROI: { x: 0.25, y: 0.2, width: 0.5, height: 0.6 }, faceCount: 0 };
    const role = classifyMediaRole({ technical, subjectROI: analysis.subjectROI, atSectionStart: cadenceTrack.sections.some((section) => Math.abs(section.startSeconds - slot.startSeconds) < 0.001), isFinal: index === slots.length - 1 });
    return buildSafeCameraPath({ mediaId: slot.selectedMedia.id, technical, analysis, role, phraseCue });
  });
  const graphBase = {
    schemaVersion: NATIVE_SHOW_GRAPH_SCHEMA,
    ok: true,
    createdAt: String(source.provenance?.generatedAt || "source-time-unavailable"),
    song: {
      id: treatment.registryTrackId || treatment.songId,
      title: treatment.songTitle,
      durationSeconds: cueGraph.durationSeconds,
      audioPath: String(source.audio_path || source.audio_uri || ""),
      lyricOverlay: {
        lineCount: cueGraph.lyricCues.length,
        lines: cueGraph.lyricCues.map((cue) => ({ start: cue.startSeconds, end: cue.endSeconds, text: cue.text })),
        confidence: cueGraph.lyricCues.length ? round(cueGraph.lyricCues.reduce((sum, cue) => sum + cue.confidence, 0) / cueGraph.lyricCues.length) : 0,
        source: cueGraph.timingTruth.lyricStatus,
      },
      source: "echo-director-v2",
    },
    constraints: {
      localMediaIds: uniqueBy(slots.map((slot) => slot.selectedMedia), (media) => media.id).map((media) => media.id),
      avatarIds: source.avatar_name ? [slug(source.avatar_name)] : [],
      excludedMediaIds: [],
      avatarSourcesIncluded: true,
    },
    sourcePoolCounts: {
      media: treatment.mediaSlots.length,
      visualizers: treatment.visualizers.length,
      stems: treatment.stems.length,
    },
    audioAnalysis: {
      bpm: cueGraph.timingTruth.beatGrid?.bpm || null,
      sectionCount: cueGraph.sections.length,
      hookCount: cueGraph.sections.filter((section) => ["chorus", "hook"].includes(section.type)).length,
      source: "echo-cue-graph-v2",
      nativeStatus: cueGraph.timingTruth.beatStatus,
    },
    stems: {
      items: treatment.stems.map((stem) => ({
        id: stem.id,
        stemType: stem.stemType,
        duration: stem.duration,
        title: stem.title,
        audioPath: stem.audioPath,
      })),
      count: treatment.stems.length,
      nativeStatus: treatment.stems.every((stem) => stem.audioPath) ? "verified-local-registry-paths" : "partial-local-paths",
    },
    tracks: [
      { id: "track-a", label: "Media foundation", role: "foundation", buffer: { id: "buffer-a", targetSeconds: 8, readySeconds: 0, state: "planned", nativeStatus: "requires-precompute", dirty: true }, cards: trackA },
      { id: "track-b", label: "IVF/ISF visualizer stack", role: "visualizer", buffer: { id: "buffer-b", targetSeconds: 8, readySeconds: 0, state: "planned", nativeStatus: "manifest-route-matrix", dirty: true }, cards: trackB },
      { id: "track-c", label: "Stem/cue accents", role: "accent", buffer: { id: "buffer-c", targetSeconds: 4, readySeconds: 0, state: "planned", nativeStatus: "deterministic", dirty: true }, cards: trackC },
    ],
    mixer: { activeTrackId: "track-a", mode: "director-v2-triple-deck", manualSwapEnabled: true, nativeStatus: "planned" },
    truth: {
      timing: cueGraph.timingTruth.lyricStatus,
      beats: cueGraph.timingTruth.beatStatus,
      mediaSemantics: "unverified-current-echo-candidates",
      visualizers: treatment.visualizers.every((visualizer) => visualizer.inputs.length > 0) ? "manifest-hydrated" : "partial-manifest-hydration",
      nativeShaderRoutes,
      stems: treatment.stems.every((stem) => stem.audioPath) ? "verified-local-paths" : "partial-local-paths",
    },
    edits: [],
    directorV2: {
      schemaVersion: DIRECTOR_V2_SCHEMA,
      basePlanId: treatment.treatmentId,
      treatmentId: treatment.treatmentId,
      cueGraphId: cueGraph.cueGraphId,
      recipe: normalizedRecipe,
      seed,
      variantSeed: seed,
      locks: treatment.locks,
      inheritedPatches: [],
      source: {
        compilerVersion: treatment.compilerVersion,
        sourceProjectHash: treatment.sourceProjectHash,
        inputHashes: treatment.inputHashes,
      },
      cueGraph: {
        id: cueGraph.cueGraphId,
        schemaVersion: cueGraph.schemaVersion,
        sections: cueGraph.sections,
        editCues: cueGraph.editCues,
        cues: cueGraph.cues,
        stemTelemetry: cueGraph.stemTelemetry,
        timingTruth: cueGraph.timingTruth,
        truthRule: cueGraph.truthRule,
      },
      rankedMediaCandidates: slots.map((slot) => ({
        slotId: slot.id,
        selectedMediaId: slot.selectedMedia.id,
        selectionDecision: slot.decisionEvidence,
        candidates: (slot.candidateMedia || []).map((candidate, rank) => ({ ...candidate, rank })),
      })),
      visualizerLayers: compiledVisualizers,
      visualizerReceipts: treatment.visualizerReceipts.map((receipt) => {
        const card = trackB.find((candidate) => candidate.executionReceipt.sourceCueIndex === receipt.sourceCueIndex);
        return card ? card.executionReceipt : receipt;
      }),
      visualizerLayerPolicy: {
        kind: "simultaneous-overlap-cap",
        maxConcurrentLayers: visualizerAdmission.maxLayers,
        sourceCueCount: treatment.visualizerReceipts.length,
        compiledCueCount: trackB.length,
        executableCueCount: trackB.filter((card) => !card.knockedOut).length,
        rejectedCueCount: trackB.filter((card) => card.knockedOut).length,
      },
      nativeShaderRoutes,
      stemBuses: treatment.stems.map((stem) => ({
        id: `bus:${slug(stem.stemType)}`,
        stemId: stem.id,
        stemType: stem.stemType,
        audioPath: stem.audioPath,
        truthStatus: stem.truthStatus,
      })),
      cameraKeyframes: slots.flatMap((slot, index) => {
        const path = mediaRoleCamera[index];
        return [
          { atSeconds: slot.startSeconds, slotId: slot.id, cameraPathId: path.id, subjectROI: path.subjectROI, shotRole: path.shotRole, phraseCue: path.phraseCue, easing: path.easing, safeZoomLimits: path.zoomLimits, crop: path.corridors[0].startCrop, ...slot.camera },
          { atSeconds: slot.endSeconds, slotId: slot.id, cameraPathId: path.id, subjectROI: path.subjectROI, shotRole: path.shotRole, phraseCue: path.phraseCue, easing: path.easing, safeZoomLimits: path.zoomLimits, crop: path.corridors[0].endCrop, ...slot.camera },
        ];
      }),
      mediaRoleCamera,
      cadenceTrack,
      lyricDirectionTrack,
      audioFallbackProfile,
      timeModulation: modulationBindings(executableVisualizers, normalizedRecipe).filter((binding) => binding.target.kind === "visual_time"),
      visualTimeTrack,
      accentTrack,
      effects: accentTrack.events,
      provenance: {
        treatmentId: treatment.treatmentId,
        cueGraphId: cueGraph.cueGraphId,
        sourceProjectHash: treatment.sourceProjectHash,
        confidenceRule: treatment.confidenceRule,
      },
      rendererSupport: {
        echoAvatarBuilder: { route: "exact-browser-isf", status: "hash-verified-shared-runtime", reason: "exact-manifest-source", unsupported: [] },
        echoTarot: { route: "exact-browser-isf", status: "hash-verified-shared-runtime", reason: "exact-manifest-source", unsupported: [] },
        musicVizNative: { route: "unsupported", status: "per-card-native-route-required", reason: "see-track-b-card-visualization-native-route", unsupported: ["graph-wide-native-route"] },
        dearPapaNative: { route: "unsupported", status: "blocked-until-canonical-route", reason: "native-route-undeclared", unsupported: ["portable-isf-execution"] },
        hyperframes: { route: "executed-offline-instance", status: "per-card-exact-proxy-or-visible-unsupported", reason: "deterministic-proxy-instance-executor", unsupported: [] },
        unknown: { route: "unsupported", status: "unsupported-until-declared", reason: "renderer-not-declared", unsupported: ["all"] },
      },
      patchLineage: {
        parentVariantId: null,
        patches: [],
        dirtyRanges: [],
      },
      modulationBindings: modulationBindings(executableVisualizers, normalizedRecipe),
      safety: {
        maxFlashHz: 3,
        maxAccentOpacity: 0.52,
        maxCameraScale: 1.18,
        maxTemporalRate: 1.18,
      },
    },
  };
  const variantHash = contentHash(graphBase);
  const compiled = {
    ...graphBase,
    runId: `echo-v2:${variantHash.slice(0, 20)}`,
    directorV2: { ...graphBase.directorV2, variantId: `variant:${variantHash.slice(0, 20)}`, variantHash },
  };
  return { ...compiled, directorV2: { ...compiled.directorV2, mediaDiversityReport: buildMediaDiversityReport(compiled) } };
}

export function buildDirectorV2Artifacts({ project, manifest, registry = null, stemTelemetry = null, duration, recipe, seed, avatarRoot, nativeProxyAvailable = null }) {
  const cueGraph = buildCueGraph(project, { duration, stemTelemetry });
  const treatment = buildEditorialTreatment(project, cueGraph, manifest, registry, { avatarRoot, nativeProxyAvailable });
  const showGraph = compileDirectorVariant({ treatment, cueGraph, recipe, seed, sourceProject: project });
  return {
    cueGraph,
    treatment,
    showGraph,
    receipt: {
      schemaVersion: "hapa.echo.variant-receipt.v2",
      treatmentId: treatment.treatmentId,
      cueGraphId: cueGraph.cueGraphId,
      variantId: showGraph.directorV2.variantId,
      variantHash: showGraph.directorV2.variantHash,
      basePlanId: treatment.treatmentId,
      variantSeed: showGraph.directorV2.variantSeed,
      recipe: showGraph.directorV2.recipe,
      seed: showGraph.directorV2.seed,
      locks: treatment.locks,
      inheritedPatches: [],
      sourceProjectHash: treatment.sourceProjectHash,
      truth: showGraph.truth,
      warnings: cueGraph.timingTruth.warnings,
    },
  };
}
