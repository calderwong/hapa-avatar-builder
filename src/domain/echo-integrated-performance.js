// Integrated multi-visual performance plans for Echo songs.
//
// One plan layers five visual families over a song's measured telemetry:
//   L0 always-on Echo shaders: persistent slots, the glue under every cut
//   L1 Hapa Media: the song's own media, remembered across repeated sections
//   L2 changing Echo shaders: final-render-ready only, energy-tiered per section
//   L3 Living Light: scene and transition cues on the song's saved Journey
//   L4 Score Dust: a composed visual score (live in preview; in a cut only as a whole-shot render)
// Section boundaries snap to Atlas downbeats, and every boundary takes one
// transition grammar keyed to the Atlas event found there.
//
// Everything is a pure function of its inputs and the seed. Nothing here
// writes a cut, renders or mints; buildEchoIntegratedPerformanceCut only
// shapes the append-only cut file an approved save writes. An intent the runtime cannot execute yet is
// kept in the plan and marked executable: false, never presented as working.

import { composeEchoVisualScore, validateEchoVisualScore, normalizeDustPlaySettings, ECHO_MUSICAL_TIMELINE_SCHEMA } from "./echo-visual-score.js";
import { planEchoScoreDustLayer } from "./echo-score-dust-layer.js";
import { validateEchoLivingLightCues, ECHO_LIVING_LIGHT_CUE_SCHEMA } from "./echo-living-light-cues.js";
import { ECHO_PERSISTENT_SHADER_SLOTS_SCHEMA } from "./echo-persistent-shader-slots.js";
import { echoDirectionVariantFingerprint, pickEchoDirectionVariantProjectPatch } from "./echo-direction-variants.js";

export const ECHO_INTEGRATED_PERFORMANCE_SCHEMA = "hapa.echo.integrated-performance.v1";
export const ECHO_INTEGRATED_LAYERS = Object.freeze(["always-on", "media", "shader", "living-light", "score-dust"]);
const MIN_SECTION_SECONDS = 4;
const MIN_SHOT_SECONDS = 1.5;
const MIN_LIVING_LIGHT_SECONDS = 2;

/**
 * Four treatments: the same song telemetry and media, a different lead layer.
 * barsPerShot is keyed by relative section energy tier.
 */
export const ECHO_INTEGRATED_TREATMENTS = Object.freeze({
  "story-arc": Object.freeze({
    id: "story-arc", label: "Story Arc", lead: "media", recipe: "conservative",
    intent: "The song's media carries the story; shaders and dust underline it, Living Light opens up the climax and the way out.",
    barsPerShot: { calm: 4, middle: 4, high: 2 }, shaderOpacity: [0.14, 0.34], alwaysOnOpacity: 0.14,
    livingLightScenes: ["climax", "break", "release"], livingLightTransitions: ["lift", "build"],
    dust: { show: "hooks", direction: { lyrics: { pick: "hooks", max: 4, font: "serif" }, maxDensity: 0.7 }, layer: { opacity: 0.85, blend: "over" } },
  }),
  "tunnel-journey": Object.freeze({
    id: "tunnel-journey", label: "Tunnel Journey", lead: "living-light", recipe: "visualizer-forward",
    intent: "Living Light leads: the song is a journey through tunnels and surfaces, with media as remembered windows along the way.",
    barsPerShot: { calm: 8, middle: 8, high: 4 }, shaderOpacity: [0.08, 0.22], alwaysOnOpacity: 0.12,
    livingLightScenes: ["arrival", "statement", "passage", "return", "climax", "break", "release"], livingLightTransitions: ["lift", "build", "fall", "break", "change", "return"],
    dust: { show: "motes", direction: { lyrics: { pick: "off" }, maxDensity: 0.45, eventResponses: { lift: "gather", change: "none" } }, layer: { opacity: 0.75, blend: "screen" } },
  }),
  "dust-chorus": Object.freeze({
    id: "dust-chorus", label: "Dust Chorus", lead: "score-dust", recipe: "kinetic",
    intent: "Score Dust leads every return and the climax, writing the sung words; media tells the verses between them.",
    barsPerShot: { calm: 4, middle: 4, high: 4 }, shaderOpacity: [0.12, 0.3], alwaysOnOpacity: 0.16,
    livingLightScenes: ["climax"], livingLightTransitions: ["lift"],
    dust: { show: "returns", direction: { lyrics: { pick: "hooks", max: 8, wordByWord: true, textCase: "upper" }, maxDensity: 0.95 }, layer: { opacity: 1, blend: "over" } },
  }),
  "telemetry-pulse": Object.freeze({
    id: "telemetry-pulse", label: "Telemetry Pulse", lead: "shader", recipe: "kinetic",
    intent: "Audio-mapped shaders lead and every layer answers the measured song: cuts on downbeats, dust on events, Living Light only in transitions.",
    barsPerShot: { calm: 2, middle: 2, high: 1 }, shaderOpacity: [0.3, 0.62], alwaysOnOpacity: 0.2,
    livingLightScenes: [], livingLightTransitions: ["lift", "build", "change"],
    dust: { show: "events", direction: { lyrics: { pick: "off" }, maxDensity: 0.85, eventResponses: { change: "kick", build: "gather" } }, layer: { opacity: 0.9, blend: "over" } },
  }),
});

/**
 * Transition grammar keyed to the Atlas event at a section boundary.
 * media/shader use the timeline transitions the compiler and HyperFrames
 * already render (cut, crossfade, scanline-dissolve); "return" is a match cut,
 * written as a cut onto the media first shown in that motif.
 */
export const ECHO_INTEGRATED_TRANSITION_GRAMMAR = Object.freeze({
  lift: Object.freeze({ media: "cut", shader: "cut", alwaysOn: "swell", livingLight: "transition", dust: "shock", preRollSeconds: 2, why: "Energy rises: hard cut on the downbeat while Living Light carries the run-up and the dust bursts." }),
  build: Object.freeze({ media: "scanline-dissolve", shader: "crossfade", alwaysOn: "hold", livingLight: "transition", dust: "gather", preRollSeconds: 4, why: "A build: dissolve while the dust gathers and Living Light travels toward the next section." }),
  fall: Object.freeze({ media: "crossfade", shader: "crossfade", alwaysOn: "hold", livingLight: "scene", dust: "calm", preRollSeconds: 1, why: "Energy falls: long crossfade, dust settles, the always-on layer keeps the thread." }),
  break: Object.freeze({ media: "crossfade", shader: "crossfade", alwaysOn: "hold", livingLight: "scene", dust: "calm", preRollSeconds: 1, why: "A break opens: the picture thins out to the always-on layer and a calm surface." }),
  change: Object.freeze({ media: "crossfade", shader: "crossfade", alwaysOn: "hold", livingLight: "transition", dust: "kick", preRollSeconds: 1, why: "Timbre or texture changes: crossfade with a dust kick on the boundary." }),
  return: Object.freeze({ media: "cut", shader: "cut", alwaysOn: "hold", livingLight: "transition", dust: "kick", preRollSeconds: 1, why: "A motif returns: match cut to the media first seen with it, so the picture remembers." }),
  boundary: Object.freeze({ media: "crossfade", shader: "crossfade", alwaysOn: "hold", livingLight: null, dust: "none", preRollSeconds: 0, why: "A section boundary with no measured event: a plain crossfade." }),
});

const ROLE_BEATS = Object.freeze({
  arrival: "Arrival: establish the world before the first word.",
  statement: "Statement: the first telling of this motif.",
  passage: "Passage: the story moves between motifs.",
  return: "Return: the motif comes back; the picture remembers it and grows busier.",
  climax: "Climax: the highest measured energy in the song; every layer is at full strength.",
  break: "Break: energy drops away; the picture breathes.",
  release: "Release: the song lets go; layers thin toward the end.",
});

const finite = (v) => typeof v === "number" && Number.isFinite(v);
const round = (v, d = 3) => Number(Number(v).toFixed(d));
const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));

/** Stable 32-bit FNV-1a; deterministic choices and IDs, not security. */
function hash32(value) {
  let h = 0x811c9dc5;
  const text = typeof value === "string" ? value : JSON.stringify(value);
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}
const pick = (items, seed, ...parts) => items.length ? items[hash32([seed, ...parts].join("|")) % items.length] : null;
const hex = (value) => [hash32(value), hash32(`${JSON.stringify(value)}#`)].map((h) => h.toString(16).padStart(8, "0")).join("");

// Timeline row fields that describe where and why a shot sat in its original
// cut, not the media itself. Everything else is copied with the media.
const SHOT_PLACEMENT_FIELDS = new Set(["section_id", "section_label", "section_type", "shot_index", "start_sec", "end_sec", "transition", "active_stems", "audio_bindings",
  "audio_atlas_direction", "song_visual_context", "audio_atlas_acoustic_hint", "edit_reason", "decision_evidence", "audio_atlas_selected_source_context"]);

/**
 * Union of the media a song's saved cuts already cast, by media id, with how
 * often each was used (editorial memory) and a family for visual recall.
 */
export function echoIntegratedMediaPool(cuts = []) {
  const pool = new Map();
  for (const cut of cuts) {
    for (const row of cut?.timeline || []) {
      const id = String(row?.media_id || "");
      const uri = String(row?.media_contract?.runtimeUri || row?.runtime_media_uri || row?.media_uri || "");
      if (!id || id === "none" || !uri || row?.media_contract?.type === "generated-visualizer") continue;
      const existing = pool.get(id);
      if (existing) { existing.uses += 1; continue; }
      const fields = Object.fromEntries(Object.entries(row).filter(([key]) => !SHOT_PLACEMENT_FIELDS.has(key)));
      const type = String(row.media_contract?.type || "");
      pool.set(id, {
        mediaId: id, title: String(row.media_title || row.media_card_title || id), uses: 1,
        kind: type === "image" || /\.(png|jpe?g|webp|gif|avif)(?:$|[?#])/i.test(uri) ? "image" : "video",
        family: String(row.media_source_group || row.characterIds?.[0] || row.media_card_kind || "media"),
        fields,
      });
    }
  }
  return [...pool.values()].sort((a, b) => b.uses - a.uses || a.mediaId.localeCompare(b.mediaId));
}

/**
 * Shader pool from a gated, proxy-hydrated manifest. Only shaders that pass
 * the final-render readiness check are offered; generators only, since a
 * filter needs live media input the director cannot guarantee.
 */
export function echoIntegratedShaderPool(shaders = [], isReady = () => false) {
  return shaders.filter((shader) => shader?.shaderType === "generator" && isReady(shader)).map((shader) => {
    const signals = [...new Set(Object.values(shader.audioMap || {}).map((m) => String(m?.signal || "off")).filter((s) => s !== "off"))].sort();
    return { id: shader.id, title: String(shader.title || shader.id), alwaysOn: shader.hmvCategory === "Waveforms Always On", category: shader.hmvCategory || null,
      signals, mappedUniforms: Object.keys(shader.audioMap || {}).length, beatReactive: signals.includes("beat") || signals.includes("bass") };
  }).sort((a, b) => a.id.localeCompare(b.id));
}

function prepareSections(timeline, lyrics) {
  const lo = Math.min(...timeline.sections.map((s) => s.meanIntensity)), hi = Math.max(...timeline.sections.map((s) => s.meanIntensity));
  // Atlas sections shorter than a few seconds join the one before them.
  const merged = [];
  for (const s of timeline.sections) {
    const last = merged.at(-1);
    if (last && (s.end - s.start < MIN_SECTION_SECONDS || last.end - last.start < MIN_SECTION_SECONDS)) {
      const span = s.end - last.start;
      last.energy = (last.energy * (last.end - last.start) + s.meanIntensity * (s.end - s.start)) / span;
      last.end = s.end; last.atlasSectionIds.push(s.id); continue;
    }
    merged.push({ id: `section-${merged.length + 1}`, atlasSectionIds: [s.id], start: s.start, end: s.end, repeatGroup: s.repeatGroup, occurrence: s.occurrence, energy: s.meanIntensity });
  }
  const lines = lyrics?.verified ? (lyrics.lines || []) : [];
  for (const section of merged) {
    section.relEnergy = round(hi > lo ? (section.energy - lo) / (hi - lo) : 0.5);
    section.energy = round(section.energy, 4);
    section.tier = section.relEnergy >= 0.68 ? "high" : section.relEnergy >= 0.38 ? "middle" : "calm";
    section.lyrics = lines.map((line, index) => ({ line, index })).filter(({ line }) => finite(line.start) && line.start >= section.start && line.start < section.end)
      .map(({ line, index }) => ({ index, text: String(line.text || ""), voice: line.voice || null, needsReview: line.alignmentReview?.needsReview === true }));
    section.voices = [...new Set(lines.filter((l) => finite(l.start) && l.start >= section.start && l.start < section.end)
      .flatMap((l) => [l.voice, ...(l.voices || []).map((v) => v?.voice)]).filter(Boolean))].sort();
  }
  // One climax: the loudest section, never the opening one when there is a choice.
  const climax = merged.reduce((best, s, i) => ((merged.length < 3 || i > 0) && (!best || s.energy > best.energy) ? s : best), null);
  merged.forEach((section, i) => {
    const prev = merged[i - 1];
    section.role = i === 0 && (!section.lyrics.length || section.relEnergy < 0.5) ? "arrival"
      : i === merged.length - 1 && section.relEnergy < 0.6 ? "release"
      : section === climax ? "climax"
      : prev && section.relEnergy < 0.3 && prev.relEnergy > section.relEnergy + 0.2 ? "break"
      : section.occurrence > 0 ? "return"
      : section.lyrics.length ? "statement" : "passage";
  });
  return merged;
}

function snapBoundary(t, timeline, previous, nextEnd) {
  const near = (list, tolerance) => list.filter((x) => Math.abs(x - t) <= tolerance).sort((a, b) => Math.abs(a - t) - Math.abs(b - t))[0];
  const downbeat = near(timeline.downbeats || [], 0.4), beat = near(timeline.beats || [], 0.2);
  const at = downbeat ?? beat ?? t;
  // Never let a snap squeeze a neighbouring section below a second.
  if (at <= previous + 1 || at >= nextEnd - 1) return { at: t, snappedTo: "atlas-boundary" };
  return { at: round(at, 6), snappedTo: downbeat !== undefined ? "downbeat" : beat !== undefined ? "beat" : "atlas-boundary" };
}

function planTransitions(sections, timeline, treatment) {
  const seenGroups = new Set([sections[0]?.repeatGroup]);
  const transitions = [];
  for (let i = 1; i < sections.length; i++) {
    const section = sections[i], t = section.start;
    const event = (timeline.events || []).filter((e) => Math.abs(e.at - t) <= 1.5).sort((a, b) => Math.abs(a.at - t) - Math.abs(b.at - t))[0];
    const kind = event ? event.kind : seenGroups.has(section.repeatGroup) ? "return" : "boundary";
    seenGroups.add(section.repeatGroup);
    const { at, snappedTo } = snapBoundary(t, timeline, sections[i - 1].start, section.end);
    const base = ECHO_INTEGRATED_TRANSITION_GRAMMAR[kind];
    const grammar = { ...base };
    if (treatment.id === "telemetry-pulse" && !["fall", "break"].includes(kind)) grammar.media = "cut";
    if (!treatment.livingLightTransitions.includes(kind)) grammar.livingLight = null;
    transitions.push({ id: `transition-${i}`, at, atlasBoundary: round(t, 4), snappedTo, kind, eventId: event?.id || null, deltaDb: event?.deltaDb ?? null,
      fromSection: sections[i - 1].id, toSection: section.id, grammar, why: base.why });
    sections[i - 1].end = at; section.start = at;
  }
  return transitions;
}

function planMedia(sections, transitions, timeline, pool, treatment, seed) {
  const families = [...new Set(pool.map((m) => m.family))];
  const groupFamily = new Map(), firstShown = new Map(), used = new Map();
  let familyCursor = hash32(`${seed}|family`) % Math.max(1, families.length);
  const hero = pool[0];
  const shots = [];
  for (const section of sections) {
    if (!groupFamily.has(section.repeatGroup)) { groupFamily.set(section.repeatGroup, families[familyCursor % families.length]); familyCursor += 1; }
    const family = groupFamily.get(section.repeatGroup);
    const members = pool.filter((m) => m.family === family);
    const ordered = [...members].sort((a, b) => (section.tier === "high" ? (a.kind === "video" ? -1 : 1) - (b.kind === "video" ? -1 : 1) : 0) || b.uses - a.uses || a.mediaId.localeCompare(b.mediaId));
    const bars = treatment.barsPerShot[section.tier];
    const downbeats = (timeline.downbeats || []).filter((d) => d > section.start + MIN_SHOT_SECONDS && d < section.end - MIN_SHOT_SECONDS);
    let cuts = downbeats.filter((_, i) => (i + 1) % bars === 0);
    if (!downbeats.length) { const step = bars * 2; cuts = []; for (let t = section.start + step; t < section.end - MIN_SHOT_SECONDS; t += step) cuts.push(round(t, 4)); }
    const edges = [section.start];
    for (const cut of cuts) if (cut - edges.at(-1) >= MIN_SHOT_SECONDS && section.end - cut >= MIN_SHOT_SECONDS) edges.push(cut);
    edges.push(section.end);
    const incoming = transitions.find((tr) => tr.toSection === section.id);
    const offset = (used.get(family) || 0) + section.occurrence;
    for (let k = 0; k < edges.length - 1; k++) {
      let media, reason;
      if (k === 0 && section.occurrence > 0 && firstShown.has(section.repeatGroup)) { media = firstShown.get(section.repeatGroup); reason = `match cut: ${section.repeatGroup} returns with the media first shown with it`; }
      else if (k === 0 && section.role === "climax" && hero) { media = hero; reason = "climax opens on the song's most-cast media"; }
      else { media = ordered[(offset + k) % Math.max(1, ordered.length)] || pool[(offset + k) % pool.length]; reason = `${section.role} · family ${family} · ${section.tier} energy · ${bars}-bar shots`; }
      const previous = shots.at(-1);
      if (previous && previous.mediaId === media.mediaId && pool.length > 1) {
        if (/^match cut/.test(reason) && !/^match cut/.test(previous.reason)) {
          // The match cut keeps its media; the shot before it gives way.
          const swap = pool.find((m) => m.mediaId !== media.mediaId && m.mediaId !== shots.at(-2)?.mediaId);
          if (swap) Object.assign(previous, { mediaId: swap.mediaId, title: swap.title, kind: swap.kind, family: swap.family, reason: `${previous.reason} (gives way to the match cut that follows)` });
        } else {
          media = (ordered.length > 1 ? ordered : pool).find((m) => m.mediaId !== previous.mediaId); reason += " (avoids repeating the previous shot)";
        }
      }
      if (!firstShown.has(section.repeatGroup)) firstShown.set(section.repeatGroup, media);
      used.set(family, (used.get(family) || 0) + 1);
      shots.push({ id: `shot-${shots.length + 1}`, sectionId: section.id, start: round(edges[k], 4), end: round(edges[k + 1], 4), mediaId: media.mediaId, title: media.title, kind: media.kind, family: media.family,
        transition: k === 0 ? (incoming?.grammar.media || "cut") : section.tier === "calm" ? "crossfade" : "cut", reason });
    }
  }
  return shots;
}

function planShaders(sections, transitions, pool, treatment, seed) {
  const generators = pool.filter((s) => !s.alwaysOn && (treatment.id !== "telemetry-pulse" || s.signals.length));
  const groupShader = new Map(), taken = new Set();
  const segments = [];
  const [lo, hi] = treatment.shaderOpacity;
  for (const section of sections) {
    let shader = groupShader.get(section.repeatGroup);
    if (!shader) {
      const fit = generators.filter((s) => (section.tier === "high" ? s.beatReactive : section.tier === "calm" ? !s.beatReactive : true) && !taken.has(s.id) && s.id !== segments.at(-1)?.shaderId);
      shader = pick(fit.length ? fit : generators.filter((s) => s.id !== segments.at(-1)?.shaderId), seed, "shader", section.repeatGroup, treatment.id);
      if (!shader) continue;
      groupShader.set(section.repeatGroup, shader); taken.add(shader.id);
    }
    const incoming = transitions.find((tr) => tr.toSection === section.id);
    segments.push({ id: `shader-${segments.length + 1}`, sectionId: section.id, start: section.start, end: section.end, shaderId: shader.id, title: shader.title,
      opacity: round(lo + (hi - lo) * section.relEnergy), signals: shader.signals, transition: incoming?.grammar.shader || "cut",
      reason: `${section.tier} energy → ${shader.beatReactive ? "beat/bass-reactive" : "slow-moving"} shader; ${section.repeatGroup} keeps it on every return` });
  }
  return segments;
}

function planAlwaysOn(pool, treatment, seed, durationSeconds) {
  const waves = pool.filter((s) => s.alwaysOn && (treatment.id !== "telemetry-pulse" || s.signals.length));
  const atmospheres = pool.filter((s) => !s.alwaysOn && !s.beatReactive && s.signals.length);
  const wave = pick(waves.length ? waves : pool.filter((s) => s.alwaysOn), seed, "always-on-wave", treatment.id);
  const atmosphere = pick(atmospheres, seed, "always-on-atmosphere", treatment.id);
  const second = treatment.id === "telemetry-pulse" ? pick(waves.filter((s) => s.id !== wave?.id), seed, "always-on-wave-2") : null;
  const slot = (index, shader, role, opacity, blend) => ({
    id: `always-on-shader-${index}`, track_id: `track-shader-always-on-${index}`, label: shader ? `Always On ${index} · ${shader.title}` : `Always On ${index}`,
    enabled: Boolean(shader), shader_id: shader?.id || "none", shader_title: shader?.title || "Open", stem_focus: "master", stem_fallback: "master",
    allow_alternate_isolated_stems: false, opacity: round(opacity), layer_opacity: 1, knockout_blacks: true, blend_mode: blend, layer_role: role,
    always_on: true, selection_mode: "persistent-full-song", start_sec: 0, end_sec: round(durationSeconds, 4),
  });
  return [
    slot(1, wave, "persistent-waveform", treatment.alwaysOnOpacity, "plus-lighter"),
    slot(2, atmosphere, "persistent-atmosphere", treatment.alwaysOnOpacity * 0.8, "screen"),
    slot(3, second, "persistent-waveform", treatment.alwaysOnOpacity * 0.6, "plus-lighter"),
  ];
}

function planLivingLight(sections, transitions, livingLight, treatment, song) {
  if (!livingLight?.journeyRef) return { status: "unavailable", reason: "This song has no saved Living Light Journey to reference.", cues: [] };
  // Whole milliseconds: the Director compiler measures the song to the millisecond.
  const durationUs = Math.floor(song.durationSeconds * 1000) * 1000;
  const journeyUs = Number.isSafeInteger(livingLight.durationUs) && livingLight.durationUs > 0 ? livingLight.durationUs : durationUs;
  const us = (t) => clamp(Math.round(t * 1e6), 0, durationUs);
  const minUs = MIN_LIVING_LIGHT_SECONDS * 1e6;
  // The Journey's authored passages (bridges between two scenes). A cue may
  // contain whole passages only, and a transition cue is exactly one passage.
  const bridges = (livingLight.schedule || []).filter((row) => row.fromInstanceId && row.toInstanceId && Number.isSafeInteger(row.startUs) && row.endUs > row.startUs)
    .map((row) => ({ startUs: row.startUs, endUs: row.endUs })).sort((a, b) => a.startUs - b.startUs);
  const accepted = [];
  // Transitions: the next authored passage, at 1x, centred on the song event.
  let next = 0;
  for (const tr of transitions.filter((x) => x.grammar.livingLight === "transition").sort((a, b) => a.at - b.at)) {
    if (!bridges.length) break;
    const bridge = bridges[next % bridges.length], length = bridge.endUs - bridge.startUs;
    const startUs = us(tr.at) - Math.round(length / 2);
    if (startUs < 0 || startUs + length > durationUs || (accepted.length && startUs < accepted.at(-1).endUs)) continue;
    accepted.push({ role: "transition", startUs, endUs: startUs + length, journeyStartUs: bridge.startUs, why: `${tr.kind} at ${round(tr.at, 2)}s through authored passage ${next % bridges.length + 1}` });
    next += 1;
  }
  // Scenes fill their sections around the transitions, which keep priority.
  for (const section of sections.filter((s) => treatment.livingLightScenes.includes(s.role))) {
    let pieces = [{ startUs: us(section.start), endUs: us(section.end) }];
    for (const tr of accepted.filter((c) => c.role === "transition")) {
      pieces = pieces.flatMap((p) => (tr.endUs <= p.startUs || tr.startUs >= p.endUs) ? [p] : [{ startUs: p.startUs, endUs: tr.startUs }, { startUs: tr.endUs, endUs: p.endUs }]);
    }
    for (const p of pieces) {
      // At 1x on a song-length Journey journey time is song time; a shorter
      // Journey is entered as late as the cue allows.
      let length = Math.min(p.endUs - p.startUs, journeyUs);
      let journeyStartUs = p.startUs + length <= journeyUs ? p.startUs : journeyUs - length;
      let startUs = p.startUs;
      // Trim both clocks together so no authored passage is cut in half.
      for (const b of bridges) {
        if (b.startUs < journeyStartUs && b.endUs > journeyStartUs) { const cut = b.endUs - journeyStartUs; journeyStartUs += cut; startUs += cut; length -= cut; }
        if (b.startUs < journeyStartUs + length && b.endUs > journeyStartUs + length && b.startUs >= journeyStartUs) length = b.startUs - journeyStartUs;
      }
      if (length >= minUs) accepted.push({ role: "scene", startUs, endUs: startUs + length, journeyStartUs, why: `${section.role} section ${section.id}` });
    }
  }
  const ordered = accepted.sort((a, b) => a.startUs - b.startUs).slice(0, 128);
  const cues = ordered.map((cue, i) => ({
    schemaVersion: ECHO_LIVING_LIGHT_CUE_SCHEMA, cueId: `ll-cue:integrated-${treatment.id}-${i + 1}`, role: cue.role, songId: song.songId,
    // A cue resolves only when it names the Journey's own song/source binding.
    journeyRef: { journeyId: livingLight.journeyRef.journeyId, revisionId: livingLight.journeyRef.revisionId }, sourceBindingRef: structuredClone(livingLight.sourceBindingRef ?? null),
    window: { startUs: cue.startUs, endUs: cue.endUs }, journeyWindow: { startUs: cue.journeyStartUs, endUs: cue.journeyStartUs + cue.endUs - cue.startUs },
    clock: "echo-song", mapping: "offset-1x", outputProfile: "project", locks: { timing: false, journey: false },
  }));
  validateEchoLivingLightCues(cues, { songId: song.songId, durationUs });
  return { status: cues.length ? "planned" : "not-used", journeyRef: livingLight.journeyRef, mapping: journeyUs >= durationUs ? "song-clocked" : "entered-late", authoredPassages: bridges.length, cues, reasons: ordered.map((c, i) => ({ cueId: cues[i].cueId, why: c.why })),
    ...(!bridges.length && transitions.some((x) => x.grammar.livingLight === "transition") ? { transitionNote: "The Journey has no authored passages, so no Living Light transition cue is placed." } : {}) };
}

function mergeWindows(windows) {
  const out = [];
  for (const w of [...windows].sort((a, b) => a.start - b.start)) {
    if (out.length && w.start <= out.at(-1).end) out.at(-1).end = Math.max(out.at(-1).end, w.end); else out.push({ ...w });
  }
  return out.map((w) => ({ start: round(w.start, 4), end: round(w.end, 4) }));
}

const DUST_CAMERA = [[/push|zoom-in|dolly-in|punch/u, "push"], [/orbit|rotate|spin|arc/u, "orbit"], [/static|hold|locked|none/u, "hold"]];
// Signals the shaders follow → the dust stem group that answers the same sound.
const SIGNAL_STEM = Object.freeze({ beat: "drums", onset: "drums", high: "drums", bass: "bass", low: "bass", mid: "harmony", rms: "vocals", peak: "vocals" });

/** Dust density for a plan section: the lead roles carry it, the others recede under the picture. */
function dustDensityFor(section, treatment) {
  const leads = treatment.dust.show === "returns" ? ["return", "climax"] : treatment.dust.show === "motes" ? [] : ["climax"];
  if (leads.includes(section.role)) return { density: 0.95, busy: [0.55, 1] };
  if (section.role === "break") return { density: 0.12, busy: [0, 0.2] };
  const density = round(0.18 + 0.4 * section.relEnergy, 2);
  return { density, busy: [0, round(Math.min(0.6, density + 0.15), 2)] };
}

/**
 * The Score Dust direction for one plan: the dust follows the plan, not only
 * the song. Its sections sit on the plan's downbeat-snapped boundaries and
 * split at every media cut; each piece takes its density from the section's
 * role and its colours from that shot's own picture. Transitions answer with
 * the plan's grammar, the stems weigh what the shaders follow, and the dust
 * camera moves with each shot's camera.
 */
export function echoIntegratedDustDirection({ timeline, sections, transitions, shots, shaders, mediaPool = [], mediaPalettes = {}, treatment }) {
  const direction = structuredClone(treatment.dust.direction);
  const atlasStart = new Map(timeline.sections.map((s) => [s.id, s.start]));
  const near = (a, b) => Math.abs(a - b) <= 0.05;
  const merge = [], move = [], split = [], cues = {};
  sections.forEach((section, i) => {
    for (const id of section.atlasSectionIds.slice(1)) merge.push(round(atlasStart.get(id), 3));
    const from = atlasStart.get(section.atlasSectionIds[0]);
    if (i > 0 && round(from, 3) !== round(section.start, 3)) move.push({ from: round(from, 3), to: round(section.start, 3) });
  });
  // A piece of dust per shot: split at every cut inside a section (latest first,
  // so each split lands in the section's own cue and keeps a predictable id).
  const minCue = 0.5 + 0.01;
  const cuts = shots.filter((shot) => {
    const section = sections.find((s) => s.id === shot.sectionId);
    return section && shot.start - section.start >= minCue && section.end - shot.start >= minCue;
  }).sort((a, b) => b.start - a.start).slice(0, 64);
  for (const shot of cuts) split.push(round(shot.start, 3));
  const palette = (mediaId) => mediaPalettes[mediaId] || null;
  const poolFields = new Map(mediaPool.map((m) => [m.mediaId, { fields: m.fields || {}, kind: m.kind }]));
  const posterOf = (mediaId) => {
    const entry = poolFields.get(mediaId), url = entry?.fields.media_thumbnail || (entry?.kind === "image" ? entry.fields.media_uri : null);
    return typeof url === "string" && url.startsWith("/") ? { assetId: `media:${mediaId}`, url } : null;
  };
  for (const section of sections) {
    const base = `cue-${section.atlasSectionIds[0]}`, look = dustDensityFor(section, treatment);
    const own = shots.filter((shot) => shot.sectionId === section.id);
    const pieces = [{ id: base, shot: own[0] }, ...cuts.filter((c) => c.sectionId === section.id).map((c) => ({ id: `${base}-split-${Math.round(round(c.start, 3) * 1000)}`, shot: c }))];
    for (const piece of pieces) {
      const colours = piece.shot && palette(piece.shot.mediaId), picture = piece.shot && posterOf(piece.shot.mediaId);
      // The dust forms its shot's own picture (sung phrases still take the dust while they are sung).
      cues[piece.id] = { density: Math.min(look.density, direction.maxDensity ?? 1), busy: look.busy, ...(colours ? { palette: colours } : {}), ...(picture ? { image: picture } : {}) };
    }
  }
  direction.sections = { ...(merge.length ? { merge } : {}), ...(move.length ? { move } : {}), ...(split.length ? { split } : {}), cues };
  // The plan's transition grammar, kind by kind, as the dust's event responses.
  const responses = {};
  for (const tr of transitions) if (["lift", "fall", "break", "build", "change"].includes(tr.kind) && tr.grammar.dust && tr.grammar.dust !== "none") responses[tr.kind] = tr.grammar.dust;
  if (Object.keys(responses).length) direction.eventResponses = responses;
  // Stems: weigh each group by how long the plan's shaders follow it.
  const weight = { drums: 0, bass: 0, vocals: 0, harmony: 0 };
  for (const shader of shaders) for (const signal of shader.signals || []) if (SIGNAL_STEM[signal]) weight[SIGNAL_STEM[signal]] += shader.end - shader.start;
  const top = Math.max(...Object.values(weight));
  if (top > 0) direction.stemResponses = Object.fromEntries(Object.entries(weight).map(([k, v]) => [k, round(Math.max(k === "vocals" && direction.lyrics ? 0.8 : 0.3, v / top), 2)]));
  // Camera: the dust moves the way each shot's camera moves.
  const fields = new Map(mediaPool.map((m) => [m.mediaId, m.fields || {}]));
  const moves = [];
  for (const shot of shots) {
    const motion = String(fields.get(shot.mediaId)?.camera_motion || "drift").toLowerCase();
    const mode = DUST_CAMERA.find(([re]) => re.test(motion))?.[1] || "drift";
    if (moves.at(-1)?.mode === mode && near(moves.at(-1).end, shot.start)) moves.at(-1).end = round(shot.end, 3);
    else moves.push({ mode, start: round(shot.start, 3), end: round(shot.end, 3) });
  }
  if (moves.length) direction.cameraMoves = moves.slice(0, 64);
  return direction;
}

/**
 * The dust layer's look per plan section: opacity from the section's role and
 * energy, blend from how bright its pictures are. Light adds best over dark
 * pictures; over bright ones it would wash out, so dust is laid over them.
 */
export function echoIntegratedDustSegments({ sections, shots, mediaLuma = {}, treatment }) {
  const leads = treatment.dust.show === "returns" ? ["return", "climax"] : treatment.dust.show === "motes" ? [] : ["climax"];
  return sections.map((section) => {
    const own = shots.filter((shot) => shot.sectionId === section.id && Number.isFinite(mediaLuma[shot.mediaId]));
    const span = own.reduce((sum, shot) => sum + (shot.end - shot.start), 0);
    const luma = span > 0 ? own.reduce((sum, shot) => sum + mediaLuma[shot.mediaId] * (shot.end - shot.start), 0) / span : null;
    const lead = leads.includes(section.role);
    const opacity = lead ? 1 : section.role === "break" ? 0.4 : round(0.55 + 0.35 * section.relEnergy, 2);
    const blend = luma === null ? (lead ? "screen" : "over") : luma < 0.42 ? (lead ? "lighter" : "screen") : "over";
    return { startUs: Math.ceil(section.start * 1e3) * 1e3, endUs: Math.floor(section.end * 1e3) * 1e3, opacity, blend };
  }).filter((segment) => segment.endUs > segment.startUs);
}

/** Mean luminance (0–1) of a media palette histogram, for choosing the blend. */
export function echoIntegratedLumaFromHistogram(histogram = {}, levels = 6) {
  const bins = (histogram.bins || []).filter((b) => b.weight > 0), total = bins.reduce((sum, b) => sum + b.weight, 0);
  if (!total) return null;
  const centre = (i) => (i + 0.5) * (256 / levels) / 255;
  return round(bins.reduce((sum, { bin, weight }) => {
    const [r, g, b] = [Math.floor(bin / (levels * levels)), Math.floor(bin / levels) % levels, bin % levels].map(centre);
    return sum + weight * (0.2126 * r + 0.7152 * g + 0.0722 * b);
  }, 0) / total, 3);
}

/** Up to four dust colours from a media palette histogram: the picture's hues, lifted so particles read over it. */
export function echoIntegratedPaletteFromHistogram(histogram = {}, levels = 6) {
  const colours = [];
  for (const { bin, weight } of histogram.bins || []) {
    if (weight < 0.02) continue;
    const step = 256 / levels, centre = (i) => (i + 0.5) * step / 255;
    const [r, g, b] = [Math.floor(bin / (levels * levels)), Math.floor(bin / levels) % levels, bin % levels].map(centre);
    const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
    if (d < 0.08) continue; // greys and blacks carry no hue
    const h = d === 0 ? 0 : max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    const s = d / (1 - Math.abs(2 * l - 1));
    const colour = { h: round((h * 60) % 360, 1), s: round(Math.min(1, Math.max(0.45, s)), 3), l: round(Math.min(0.78, Math.max(0.55, l + 0.15)), 3) };
    if (!colours.some((c) => Math.min(Math.abs(c.h - colour.h), 360 - Math.abs(c.h - colour.h)) < 18)) colours.push(colour);
    if (colours.length === 4) break;
  }
  return colours.length ? colours : null;
}

function planScoreDust(timeline, sections, lyrics, lyricAudioHash, treatment, songId, direction = structuredClone(treatment.dust.direction), segments = null) {
  const score = composeEchoVisualScore(timeline, direction, { lyricLines: lyrics?.verified ? lyrics.lines : null, lyricAudioHash: lyrics?.verified ? lyricAudioHash : null });
  const validation = validateEchoVisualScore(score, { timeline });
  const d = timeline.durationSeconds;
  const windows = treatment.dust.show === "motes" ? [{ start: 0, end: d }]
    : treatment.dust.show === "returns" ? [...sections.filter((s) => ["return", "climax"].includes(s.role)).map((s) => ({ start: s.start, end: s.end })), ...score.phrases.map((p) => ({ start: p.start, end: p.end }))]
    : treatment.dust.show === "events" ? score.events.filter((e) => e.response !== "none").map((e) => ({ start: Math.max(0, e.at - 0.25), end: Math.min(d, e.at + 1.5) }))
    : [...score.phrases.map((p) => ({ start: Math.max(0, p.start - 0.5), end: Math.min(d, p.end + 0.5) })), ...score.events.filter((e) => e.response === "shock").map((e) => ({ start: e.at, end: Math.min(d, e.at + 2) }))];
  const visibleWindows = mergeWindows(windows), withLyrics = Boolean(lyrics?.verified);
  // One composited layer spans the dust's visible extent; the score itself
  // decides what is visible inside it. It is bound to this exact score and seed.
  const layer = validation.ok && visibleWindows.length && timeline.source?.runId ? planEchoScoreDustLayer({
    songId, atlasRunId: timeline.source.runId, direction, playSettings: null, lyricLines: withLyrics ? "project" : null,
    scoreFingerprint: score.fingerprint, seed: normalizeDustPlaySettings(direction.playSettings || {}, timeline).seed,
    // Plan-driven dust is present all song long: each section's density and look
    // decide how much it shows, so the layer spans the whole song, not only the
    // moments where it leads.
    ...(segments?.length
      ? { startSeconds: sections[0].start, endSeconds: Math.min(d, sections.at(-1).end), segments }
      : { startSeconds: visibleWindows[0].start, endSeconds: Math.min(d, visibleWindows.at(-1).end) }),
    ...treatment.dust.layer,
  }) : null;
  return {
    status: validation.ok ? "composed" : "invalid", compositeExportSupported: Boolean(layer), runtime: layer ? "score-dust-layer" : "score-dust-preview",
    notice: layer
      ? "Score Dust composites as a Director layer (media → shaders → Living Light → Score Dust → lyrics) from one transparent render bound to this score. Render it once with “Render layer” in the Builder preview and save the cut; final export refuses the cut until then."
      : "No composited Score Dust layer: the score is invalid, has no visible windows, or has no Atlas run.",
    layer, direction, fingerprint: score.fingerprint, timelineFingerprint: timeline.fingerprint,
    phraseSource: score.phraseSource, phrases: score.phrases.map((p) => ({ text: p.text, start: p.start, end: p.end, lineIndex: p.source?.lineIndex ?? null })),
    motifs: score.motifs.map((m) => ({ repeatGroup: m.repeatGroup, family: m.family })), events: score.events.map((e) => ({ kind: e.kind, at: e.at, response: e.response })),
    visibleWindows, validation: { ok: validation.ok, errors: validation.errors.length, warnings: validation.warnings.length },
    sectionEdits: score.sectionEdits ? { applied: score.sectionEdits.applied, skipped: score.sectionEdits.skipped.length } : null,
    score,
  };
}

function storyBeat(section) {
  const sung = section.lyrics.find((l) => !l.needsReview) || section.lyrics[0];
  const quote = sung ? ` “${sung.text.length > 90 ? `${sung.text.slice(0, 87)}…` : sung.text}”` : "";
  const voices = section.voices.length > 1 ? ` Voices: ${section.voices.join(" + ")} — let the backing answer visibly.` : "";
  const memory = section.occurrence > 0 ? ` (${section.repeatGroup}, time ${section.occurrence + 1})` : "";
  return `${ROLE_BEATS[section.role]}${memory}${quote}${voices}`;
}

/**
 * Plan one integrated performance. Inputs are already read and verified by
 * the caller: an Atlas musical timeline, written lyric lines with measured
 * timing (verified against this master), the song's media pool, the ready
 * shader pool and the song-clocked Living Light Journey reference.
 */
export function planEchoIntegratedPerformance({ song, timeline, lyrics = null, lyricAudioHash = null, mediaPool = [], shaderPool = [], livingLight = null, mediaPalettes = {}, mediaLuma = {}, treatment = "story-arc", seed = "echo-integrated-v1" } = {}) {
  const t = ECHO_INTEGRATED_TREATMENTS[treatment];
  if (!t) throw new Error(`Unknown treatment ${treatment}; expected ${Object.keys(ECHO_INTEGRATED_TREATMENTS).join(", ")}.`);
  if (timeline?.schemaVersion !== ECHO_MUSICAL_TIMELINE_SCHEMA || !timeline.sections?.length) throw new Error("A musical timeline with sections is required.");
  if (!song?.songId || !(song.durationSeconds > 0)) throw new Error("A song id and duration are required.");
  if (!mediaPool.length) throw new Error("The song has no cast media to perform with.");
  if (!shaderPool.some((s) => !s.alwaysOn)) throw new Error("No final-render-ready shaders are available.");
  const durationSeconds = Math.min(song.durationSeconds, timeline.durationSeconds);
  const sections = prepareSections(timeline, lyrics);
  sections.at(-1).end = Math.min(sections.at(-1).end, durationSeconds);
  const transitions = planTransitions(sections, timeline, t);
  const shots = planMedia(sections, transitions, timeline, mediaPool, t, seed);
  const shaders = planShaders(sections, transitions, shaderPool, t, seed);
  const alwaysOn = planAlwaysOn(shaderPool, t, seed, durationSeconds);
  const livingLightLayer = planLivingLight(sections, transitions, livingLight, t, { ...song, durationSeconds });
  const dustDirection = echoIntegratedDustDirection({ timeline, sections, transitions, shots, shaders, mediaPool, mediaPalettes, treatment: t });
  const dust = planScoreDust(timeline, sections, lyrics, lyricAudioHash, t, song.songId, dustDirection, echoIntegratedDustSegments({ sections, shots, mediaLuma, treatment: t }));
  const llAt = (s) => livingLightLayer.cues.filter((c) => c.window.startUs < s.end * 1e6 && c.window.endUs > s.start * 1e6);
  const dustShare = (s) => dust.visibleWindows.reduce((sum, w) => sum + Math.max(0, Math.min(w.end, s.end) - Math.max(w.start, s.start)), 0) / Math.max(1e-6, s.end - s.start);
  for (const section of sections) {
    const ll = llAt(section), share = round(dustShare(section), 2);
    const llScene = ll.some((c) => c.role === "scene");
    section.lead = t.lead === "living-light" && llScene ? "living-light"
      : t.lead === "score-dust" && share >= 0.5 ? "score-dust"
      : llScene && section.role === "climax" ? "living-light"
      : t.lead === "shader" ? "shader" : "media";
    section.storyBeat = storyBeat(section);
    section.layers = {
      alwaysOn: { opacity: alwaysOn[0].opacity, note: "always-on stays at one opacity per slot today; it answers the music through its audio-mapped uniforms" },
      media: { shots: shots.filter((s) => s.sectionId === section.id).length, families: [...new Set(shots.filter((s) => s.sectionId === section.id).map((s) => s.family))] },
      shader: (({ shaderId, title, opacity } = {}) => (shaderId ? { shaderId, title, opacity } : null))(shaders.find((s) => s.sectionId === section.id)),
      livingLight: ll.length ? [...new Set(ll.map((c) => c.role))] : [],
      dust: { visibleShare: share },
    };
    section.transitionIn = transitions.find((tr) => tr.toSection === section.id)?.id || null;
  }
  // Alternative route where dust leads: a published opaque Score Dust render
  // replaces exactly those media shots (echo-score-dust-cut.js).
  const dustShots = shots.filter((shot) => sections.find((s) => s.id === shot.sectionId)?.lead === "score-dust");
  dust.renderPlacement = { route: "score-dust-render-media", status: dustShots.length ? "needs-render" : "not-used",
    shots: dustShots.map((shot) => shot.id), windows: mergeWindows(dustShots.map((shot) => ({ start: shot.start, end: shot.end }))) };
  const modulation = [
    ...[...alwaysOn.filter((s) => s.enabled), ...shaders].map((s) => ({ shader: s.shader_id || s.shaderId, layer: s.shader_id ? "always-on" : "shader" }))
      .filter((v, i, all) => all.findIndex((w) => w.shader === v.shader) === i)
      .map(({ shader, layer }) => {
        const entry = shaderPool.find((s) => s.id === shader), signals = entry?.signals || [];
        // A shader without an audio map has nothing to bind: it moves on its own clock.
        return { id: `uniforms:${shader}`, title: entry?.title || shader, layer, source: signals, target: "visualizer_uniform", executable: signals.length ? true : null,
          via: signals.length ? "Director V2 compiles each mapped uniform into a stem_signal binding" : "no audio-mapped uniforms; it moves on its own clock" };
      }),
    { id: "dust:density-follows-energy", layer: "score-dust", source: ["section energy"], target: "dust density", executable: false, via: "runs only in the Score Dust preview" },
    { id: "always-on:opacity-follows-energy", layer: "always-on", source: ["section energy"], target: "slot opacity", executable: true, via: "each enabled slot compiles a visualizer_opacity binding on song-relative section energy (IP-7)" },
    { id: "living-light:speed-follows-intensity", layer: "living-light", source: ["master intensity"], target: "journey rate", executable: false, via: "Living Light cues are fixed offset-1x" },
  ];
  const media = shots;
  const layersUsed = [alwaysOn.some((s) => s.enabled), media.length > 0, shaders.length > 0, livingLightLayer.cues.length > 0, dust.status === "composed" && dust.visibleWindows.length > 0];
  const planInput = { song: song.songId, treatment: t.id, seed, timeline: timeline.fingerprint, lyricAudioHash: lyrics?.verified ? lyricAudioHash : null, media: mediaPool.map((m) => m.mediaId), shaders: shaderPool.map((s) => s.id),
    journey: livingLight?.journeyRef ? { ...livingLight.journeyRef, sourceBindingRef: livingLight.sourceBindingRef ?? null } : null,
    palettes: Object.keys(mediaPalettes).sort().map((id) => [id, mediaPalettes[id]]), luma: Object.keys(mediaLuma).sort().map((id) => [id, mediaLuma[id]]), dustDirection: "plan-driven-v3-whole-song" };
  return {
    schemaVersion: ECHO_INTEGRATED_PERFORMANCE_SCHEMA,
    planId: `integrated:${song.songId}:${t.id}:${hex(planInput)}`,
    songId: song.songId, title: song.title || song.songId, treatment: t.id, treatmentLabel: t.label, intent: t.intent, lead: t.lead, recipe: t.recipe, seed,
    durationSeconds: round(durationSeconds, 4),
    sources: {
      atlasRunId: timeline.source?.runId || null, timelineFingerprint: timeline.fingerprint, masterSha256: timeline.source?.sourceSha256 || null,
      tempoBpm: timeline.tempo?.bpm ?? null, beats: timeline.beats.length, downbeats: timeline.downbeats.length, atlasSections: timeline.sections.length, atlasEvents: timeline.events.length,
      lyricTiming: lyrics ? { verified: lyrics.verified === true, status: lyrics.status || null, reason: lyrics.reason || null, lines: lyrics.lines?.length || 0 } : { verified: false, status: "absent", lines: 0 },
      mediaPool: mediaPool.length, shaderPool: shaderPool.length, livingLightJourney: livingLight?.journeyRef || null,
      qualification: "Atlas sections, repeats and events are candidate evidence; roles here are relative energy and repetition, not established verse/chorus.",
    },
    sections, transitions,
    layers: { alwaysOn, media, shaders, livingLight: livingLightLayer, scoreDust: dust },
    modulation,
    checks: {
      layersUsed: layersUsed.filter(Boolean).length,
      layers: Object.fromEntries(ECHO_INTEGRATED_LAYERS.map((name, i) => [name, layersUsed[i]])),
      mediaContinuous: media.every((s, i) => i === 0 ? s.start === sections[0].start : s.start === media[i - 1].end) && media.at(-1).end === sections.at(-1).end,
      livingLightValid: true, scoreDustValid: dust.validation.ok,
    },
  };
}

/**
 * A saved-cut-shaped project for the Director V2 compiler and HyperFrames.
 * mediaPool is the same pool the plan was made from; it carries each shot's
 * media fields exactly as the song's saved cuts cast them.
 */
export function projectEchoIntegratedPerformance(plan, baseProject = {}, mediaPool = []) {
  // Director project files wrap the body; the projection is always the body.
  const body = baseProject.music_video_project || baseProject.project || baseProject;
  const base = structuredClone(body);
  delete base.director_show_graph; delete base.hyperframe_script; delete base.active_direction_script_variant;
  const rows = Array.isArray(body.timeline) ? body.timeline : [];
  const sectionOf = (t) => rows.find((r) => r.start_sec <= t && r.end_sec > t) || rows.at(-1) || {};
  const pool = new Map(mediaPool.map((m) => [m.mediaId, m.fields]));
  const missing = plan.layers.media.filter((shot) => !pool.has(shot.mediaId)).map((shot) => shot.mediaId);
  if (missing.length) throw new Error(`Media ${missing[0]} is not in the pool the plan was made from.`);
  const timeline = plan.layers.media.map((shot, index) => {
    const at = sectionOf(shot.start), fields = pool.get(shot.mediaId) || {};
    return { ...structuredClone(fields), section_id: at.section_id || shot.sectionId, section_label: at.section_label || shot.sectionId, section_type: at.section_type || "section",
      shot_index: index, start_sec: shot.start, end_sec: shot.end, transition: shot.transition, edit_reason: `Integrated ${plan.treatmentLabel}: ${shot.reason}` };
  });
  return {
    ...base,
    timeline,
    visualizer_timeline: plan.layers.shaders.map((s) => ({ start_sec: s.start, end_sec: s.end, visualizer_id: s.shaderId, visualizer_title: s.title, transition: s.transition,
      edit_reason: `Integrated ${plan.treatmentLabel}: ${s.reason}`, opacity: s.opacity, layer_opacity: 1, allow_alternate_isolated_stems: false })),
    persistent_shader_slots_schema: ECHO_PERSISTENT_SHADER_SLOTS_SCHEMA,
    persistent_shader_slots: structuredClone(plan.layers.alwaysOn),
    living_light_cues: structuredClone(plan.layers.livingLight.cues),
    // The Atlas-measured section energy the plan used, so telemetry can follow it
    // even when the song's own section map has no contrast.
    section_energy: plan.sections.map((s) => ({ start: round(s.start, 4), end: round(s.end, 4), energy: s.energy, source: `atlas-run:${plan.sources.atlasRunId || "unknown"}` })),
    ...(plan.layers.scoreDust.layer ? { score_dust_layer: structuredClone(plan.layers.scoreDust.layer) } : {}),
    integrated_performance: { schemaVersion: plan.schemaVersion, planId: plan.planId, treatment: plan.treatment,
      scoreDust: { fingerprint: plan.layers.scoreDust.fingerprint, compositeExportSupported: plan.layers.scoreDust.compositeExportSupported, layerStatus: plan.layers.scoreDust.layer ? "render-required" : "absent", visibleWindows: plan.layers.scoreDust.visibleWindows, renderPlacement: plan.layers.scoreDust.renderPlacement } },
  };
}

const clock = (s) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, "0")}`;

/** The human-readable director script for one plan. */
export function renderEchoIntegratedPerformanceScript(plan, { compiled = null } = {}) {
  const L = plan.layers, out = [];
  out.push(`# ${plan.title} — ${plan.treatmentLabel}`, "");
  out.push(`> ${plan.intent}`, "");
  out.push(`- Plan: \`${plan.planId}\` · seed \`${plan.seed}\` · ${clock(plan.durationSeconds)} · lead layer **${plan.lead}** · compiler recipe \`${plan.recipe}\``);
  out.push(`- Telemetry: Atlas run \`${plan.sources.atlasRunId}\` · ${plan.sources.beats} beats / ${plan.sources.downbeats} downbeats${plan.sources.tempoBpm ? ` · ~${Math.round(plan.sources.tempoBpm)} BPM` : ""} · ${plan.sources.atlasSections} sections · ${plan.sources.atlasEvents} events`);
  out.push(`- Lyrics: ${plan.sources.lyricTiming.verified ? `${plan.sources.lyricTiming.lines} written lines with timing verified against this master` : `not placed (${plan.sources.lyricTiming.reason || plan.sources.lyricTiming.status})`}`);
  out.push(`- Layers in use: ${plan.checks.layersUsed}/5 (${Object.entries(plan.checks.layers).map(([k, v]) => `${k} ${v ? "✓" : "–"}`).join(", ")})`);
  if (compiled) out.push(`- Compiled: ${compiled.tracks} tracks · ${compiled.modulationBindings} executable modulation bindings · Living Light track ${compiled.livingLight ? "attached" : "absent"} · media preflight ${compiled.mediaPreflight}`);
  out.push("", "## Always-on layer", "");
  for (const slot of L.alwaysOn.filter((s) => s.enabled)) out.push(`- ${slot.label} — ${slot.layer_role}, opacity ${slot.opacity}, ${slot.blend_mode}, whole song`);
  out.push("", "## Score", "");
  for (const section of plan.sections) {
    const tr = plan.transitions.find((x) => x.id === section.transitionIn);
    out.push(`### ${clock(section.start)}–${clock(section.end)} · ${section.role} · ${section.repeatGroup}${section.occurrence ? ` ×${section.occurrence + 1}` : ""} · ${section.tier} energy (${section.relEnergy}) · lead: ${section.lead}`, "");
    if (tr) out.push(`**In:** ${tr.kind} at ${clock(tr.at)} (${tr.snappedTo}) — media ${tr.grammar.media}, shader ${tr.grammar.shader}, dust ${tr.grammar.dust}${tr.grammar.livingLight ? `, Living Light ${tr.grammar.livingLight}` : ""}. ${tr.why}`, "");
    out.push(section.storyBeat, "");
    for (const line of section.lyrics) out.push(`> ${line.text}${line.voice && line.voice !== "lead" ? ` _(${line.voice})_` : ""}${line.needsReview ? " _(timing flagged for review)_" : ""}`);
    if (section.lyrics.length) out.push("");
    const shots = L.media.filter((s) => s.sectionId === section.id);
    out.push(`- Media: ${shots.map((s) => `${clock(s.start)} ${s.title} (${s.kind}, ${s.transition})`).join("; ")}`);
    if (section.layers.shader) out.push(`- Shader: ${section.layers.shader.title} at ${section.layers.shader.opacity}`);
    if (section.layers.livingLight.length) out.push(`- Living Light: ${section.layers.livingLight.join(" + ")}`);
    out.push(`- Score Dust: visible ${Math.round(section.layers.dust.visibleShare * 100)}% of the section`, "");
  }
  out.push("## Living Light cues", "");
  if (!L.livingLight.cues.length) out.push(`- ${L.livingLight.reason || "Not used in this treatment."}`);
  for (const cue of L.livingLight.cues) out.push(`- ${cue.role} ${clock(cue.window.startUs / 1e6)}–${clock(cue.window.endUs / 1e6)} — ${L.livingLight.reasons.find((r) => r.cueId === cue.cueId)?.why || ""}`);
  const dustLayer = L.scoreDust.layer;
  out.push("", "## Score Dust", "", `- ${L.scoreDust.notice}`, dustLayer
    ? `- Layer: ${clock(dustLayer.window.startUs / 1e6)}–${clock(dustLayer.window.endUs / 1e6)} · ${dustLayer.blend} at ${Math.round(dustLayer.opacity * 100)}% · seed ${dustLayer.binding.seed} · ${compiled?.scoreDustLayer ? `graph track ${compiled.scoreDustLayer}` : "render required"}${compiled?.scoreDustBinding ? ` · binding ${compiled.scoreDustBinding}` : ""}`
    : "- Layer: none.", L.scoreDust.renderPlacement.shots.length
    ? `- Alternative whole-shot route: an opaque render covering ${L.scoreDust.renderPlacement.windows.map((w) => `${clock(w.start)}–${clock(w.end)}`).join(", ")} could replace ${L.scoreDust.renderPlacement.shots.length} dust-led shots.`
    : "- Alternative whole-shot route: no dust-led shots in this treatment.", `- Score \`${L.scoreDust.fingerprint}\` · ${L.scoreDust.motifs.length} motifs · ${L.scoreDust.phrases.length} lyric phrases (${typeof L.scoreDust.phraseSource === "object" ? L.scoreDust.phraseSource.status : L.scoreDust.phraseSource}) · ${L.scoreDust.visibleWindows.length} visible windows`);
  out.push("", "## Telemetry bindings", "");
  for (const m of plan.modulation) out.push(`- ${m.executable ? "✓" : m.executable === false ? "✗ not executable yet:" : "–"} ${m.title ? `${m.title} (${m.layer} uniforms)` : `${m.id} (${m.layer})`} ← ${m.source.join(", ") || "no mapped signals"} — ${m.via}`);
  out.push("");
  return out.join("\n");
}

export const ECHO_INTEGRATED_CUT_LINEAGE = "append-only-integrated-performance";
// Only the integrated layers travel in the patch. Lyrics and output profile
// stay with the song project, so a later lyric repair still reaches the cut.
const text = (value) => String(value ?? "").trim();
const INTEGRATED_CUT_PATCH_FIELDS = Object.freeze(["persistent_shader_slots_schema", "persistent_shader_slots", "living_light_cues", "score_dust_layer", "section_energy"]);

/** The append-only cut ID for a plan: stable for the same plan inputs. */
export function echoIntegratedPerformanceCutId(plan = {}) {
  const [, , treatment, digest] = String(plan.planId || "").split(":");
  if (!treatment || !/^[a-f0-9]{8,}$/u.test(digest || "")) throw new Error(`Integrated plan ID ${plan.planId || "(missing)"} is not a plan this module made.`);
  return `integrated-${treatment}-${digest}`;
}

/**
 * The saved cut for one approved integrated plan (IP-11). The song project is
 * the immutable parent; the plan is the lineage. No graph is stored: the
 * Director derives it from the base graph like any other generated cut, then
 * attaches Living Light, Score Dust and the cut's own telemetry bindings.
 * Refuses a plan that does not use all five layers unless allowPartial is set.
 */
export function buildEchoIntegratedPerformanceCut({ plan, project, hyperframeScript = "", parentProjectSha256, approval, createdAt = new Date().toISOString(), allowPartial = false } = {}) {
  if (plan?.schemaVersion !== ECHO_INTEGRATED_PERFORMANCE_SCHEMA) throw new Error("An integrated performance plan is required.");
  if (!project || project.integrated_performance?.planId !== plan.planId) throw new Error(`The project was not projected from plan ${plan.planId}.`);
  if (text(project.song_id) !== plan.songId) throw new Error(`The project is for ${project.song_id || "no song"}, not ${plan.songId}.`);
  if (!/^[a-f0-9]{64}$/u.test(String(parentProjectSha256 || ""))) throw new Error("The parent song project hash is required.");
  if (!text(approval?.approvedBy) || !text(approval?.request)) throw new Error("A save needs the operator approval: who approved it and what they asked for.");
  if (!allowPartial && plan.checks?.layersUsed !== ECHO_INTEGRATED_LAYERS.length) {
    const missing = ECHO_INTEGRATED_LAYERS.filter((name) => !plan.checks?.layers?.[name]);
    throw new Error(`Plan ${plan.planId} uses ${plan.checks?.layersUsed ?? 0}/5 layers (missing ${missing.join(", ")}).`);
  }
  const id = echoIntegratedPerformanceCutId(plan);
  const media = (project.timeline || []).filter((shot) => shot?.media_id && shot.media_id !== "none");
  const patch = pickEchoDirectionVariantProjectPatch(Object.fromEntries(INTEGRATED_CUT_PATCH_FIELDS.filter((key) => project[key] !== undefined).map((key) => [key, project[key]])));
  const cut = {
    schemaVersion: "hapa.echo.direction-script-variant.v1",
    id,
    title: `Integrated · ${plan.treatmentLabel}`,
    status: "ready",
    createdAt,
    updatedAt: createdAt,
    selectionMode: "operator-approved-integrated-plan",
    variationSet: { id: "integrated-performance", label: "Integrated performances" },
    cut: { kind: "integrated-performance", label: plan.treatmentLabel, treatment: plan.treatment },
    parent: { songId: plan.songId, projectSha256: parentProjectSha256, immutableLegacyProject: true },
    lineage: {
      kind: ECHO_INTEGRATED_CUT_LINEAGE, planId: plan.planId, planSchema: plan.schemaVersion, treatment: plan.treatment, recipe: plan.recipe, seed: plan.seed,
      sources: structuredClone(plan.sources), approval: { approvedBy: text(approval.approvedBy), request: text(approval.request), approvedAt: text(approval.approvedAt) || createdAt },
      createdAt, nonDestructive: true,
    },
    seed: `${plan.songId}:${plan.planId}`,
    sourcePolicy: { mode: "append-only-integrated-performance-plan", publicActivation: false, canonPromotion: false, mint: false },
    timeline: structuredClone(project.timeline),
    visualizer_timeline: structuredClone(project.visualizer_timeline || []),
    project_patch: patch,
    hyperframe_script: String(hyperframeScript || ""),
    integrated_performance: { planId: plan.planId, treatment: plan.treatment, lead: plan.lead, layersUsed: plan.checks.layersUsed, layers: structuredClone(plan.checks.layers),
      sections: plan.sections.length, transitions: plan.transitions.length, scoreDust: structuredClone(project.integrated_performance.scoreDust) },
    telemetry: { replacementShots: media.length, uniqueMedia: new Set(media.map((shot) => shot.media_contract?.contentHash || shot.media_id)).size, shaderCues: (project.visualizer_timeline || []).length,
      livingLightCues: (patch.living_light_cues || []).length, alwaysOnSlots: (patch.persistent_shader_slots || []).filter((slot) => slot.enabled).length },
    preservation: { legacyProjectUnchanged: true, existingDirectionScriptsUntouched: true, lyricTiming: "inherited-from-song-project" },
  };
  cut.fingerprint = echoDirectionVariantFingerprint(cut);
  return cut;
}
