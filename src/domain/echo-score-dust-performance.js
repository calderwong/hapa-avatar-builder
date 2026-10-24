// Song-clock performance for Score Dust.
//
// The dust is simulated on a fixed 1/60 s grid of *song* time, never wall
// time. Preview at any frame rate, a seek, and an offline export starting at
// the same point all evaluate the same steps, so preview and export agree.
// Formation spin and camera yaw are closed-form functions of song time, so a
// seek lands on the same view continuous playback would have reached.
import { createDustSwarm, DUST_BAND_COUNT } from "./echo-dust-swarm.js";
import { createFlashGate, dustColourStyle } from "./echo-score-dust-colour.js";

export const SCORE_DUST_STEP_HZ = 60;
export const SCORE_DUST_RESET_GAP_SECONDS = 2;
// The score knows when words arrive, so they start forming slightly early.
export const SCORE_DUST_PHRASE_LEAD_SECONDS = 0.4;
const FACE_TAU = 0.3;
const TAU = Math.PI * 2;
const CAMERA_YAW_RATES = Object.freeze({ hold: 0, drift: 0.04, orbit: 0.16, push: 0.06 });
const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const nearestTurn = (angle) => Math.round(angle / TAU) * TAU;

function upperBound(values, t) {
  let low = 0, high = values.length;
  while (low < high) { const mid = (low + high) >> 1; if (values[mid] <= t) low = mid + 1; else high = mid; }
  return low;
}

/**
 * Piecewise closed-form motion. Readable phrases stop spinning and ease to
 * face the viewer; everything else turns at a rate set by its cue.
 */
export function buildScoreDustMotion(score) {
  const duration = Number(score.durationSeconds) || 1;
  const lead = SCORE_DUST_PHRASE_LEAD_SECONDS;
  const readable = (score.phrases || []).filter((p) => !p.burst && p.end > p.start).map((p) => ({ ...p, start: Math.max(0, p.start - lead) }));
  const cuts = new Set([0, duration]);
  for (const cue of score.cues) { cuts.add(cue.start); cuts.add(cue.end); }
  for (const phrase of readable) { cuts.add(phrase.start); cuts.add(phrase.end); }
  const moves = score.cameraMoves || [];
  for (const move of moves) { cuts.add(move.start); cuts.add(move.end); }
  const bounds = [...cuts].filter((v) => v >= 0 && v <= duration).sort((a, b) => a - b);
  const cueStarts = score.cues.map((c) => c.start);
  const motifs = new Map((score.motifs || []).map((m) => [m.id, m]));
  const segments = [];
  let spin = 0, yaw = 0;
  for (let i = 0; i + 1 < bounds.length; i++) {
    const start = bounds[i], end = bounds[i + 1], middle = (start + end) / 2;
    if (end - start <= 1e-9) continue;
    const cue = score.cues[Math.max(0, upperBound(cueStarts, middle) - 1)];
    // Words and pictures are read, so they face the viewer instead of spinning.
    const pictured = Boolean(motifs.get(cue.motifId)?.imageRef);
    const face = pictured || readable.some((p) => middle >= p.start && middle < p.end);
    const mode = moves.find((m) => middle >= m.start && middle < m.end)?.mode || cue.camera?.mode;
    const segment = { start, end, face, spinRate: face ? 0 : 0.04 + 0.22 * (cue.busy[0] + cue.busy[1]) / 2, yawRate: face ? 0 : CAMERA_YAW_RATES[mode] ?? 0.04, spin0: spin, yaw0: yaw };
    segments.push(segment);
    spin = angleIn(segment, "spin", end); yaw = angleIn(segment, "yaw", end);
  }
  const starts = segments.map((s) => s.start);
  function angleIn(segment, channel, t) {
    const a0 = segment[`${channel}0`], dt = t - segment.start;
    if (!segment.face) return a0 + segment[`${channel}Rate`] * dt;
    const goal = nearestTurn(a0);
    return a0 + (goal - a0) * (1 - Math.exp(-dt / FACE_TAU));
  }
  const at = (channel) => (t) => {
    if (!segments.length) return 0;
    const time = Math.max(0, Number(t) || 0), segment = segments[Math.max(0, upperBound(starts, time) - 1)];
    return angleIn(segment, channel, time);
  };
  /** 1 while a readable phrase faces the viewer, easing in and out. */
  function faceAt(t) {
    let amount = 0;
    for (const p of readable) {
      if (t < p.start) continue;
      amount = Math.max(amount, t < p.end ? 1 - Math.exp(-(t - p.start) / FACE_TAU) : Math.exp(-(t - p.end) / FACE_TAU) * (1 - Math.exp(-(p.end - p.start) / FACE_TAU)));
    }
    return amount;
  }
  return { segments, rotationAt: at("spin"), yawAt: at("yaw"), faceAt };
}

/** Deterministic band envelope from the score when no recorded spectrum exists. */
export function scoreDerivedBands(state, out = new Float32Array(DUST_BAND_COUNT)) {
  const i = clamp(state?.intensity ?? 0.5), pulse = Math.exp(-5 * (state?.beat?.phase ?? 1));
  for (let b = 0; b < DUST_BAND_COUNT; b++) {
    const x = b / (DUST_BAND_COUNT - 1), low = 1 - x;
    out[b] = clamp(i * (0.3 + 0.55 * low) * (0.7 + 0.45 * pulse * low) + 0.12 * i * x * (0.5 + 0.5 * Math.cos(x * 9 + i * 4)));
  }
  return out;
}

/**
 * Create a performance over a prepared score playback (see
 * prepareEchoScorePlayback). `targetsFor(motif)` and `phraseTargets(phrase)`
 * are host hooks that rasterise pictures/words; null means "use the family".
 */
export function createScoreDustPerformance({ playback, settings = {}, count = null, targetsFor = () => null, phraseTargets = () => null } = {}) {
  if (!playback?.stateAt || !playback?.score) throw new TypeError("A prepared score playback is required.");
  const swarm = createDustSwarm({ count: count ?? settings.particleCount ?? 4000, seed: settings.seed ?? 1 });
  const motion = buildScoreDustMotion(playback.score);
  const prerollSteps = Math.round(clamp(settings.prerollSeconds ?? 1.5, 0, 5) * SCORE_DUST_STEP_HZ);
  const gapSteps = SCORE_DUST_RESET_GAP_SECONDS * SCORE_DUST_STEP_HZ;
  const phraseCache = new Map(), derived = new Float32Array(DUST_BAND_COUNT);
  // Comfort: reduced motion calms kicks, replaces shocks, stops spin and orbit.
  const reduced = settings.reducedMotion === true, flashGate = createFlashGate(settings.flashLimitPerSecond ?? 3);
  let simulated = null, formationKey = "", resets = 0, stepsRun = 0, lastDrumOnset = 0, drumHits = 0;
  const stemWeights = playback.score.stemResponses || {};

  function formationFor(state, upcoming = null) {
    const phrase = state.phrase || upcoming;
    if (phrase) {
      const key = `phrase:${phrase.id}`;
      if (!phraseCache.has(key)) phraseCache.set(key, phraseTargets(phrase, swarm.count, swarm.seed) || null);
      const points = phraseCache.get(key);
      if (points?.count) return { key, spec: points, stagger: 0.25 };
    }
    const motif = state.motif, pictured = motif?.imageRef ? targetsFor(motif, swarm.count, swarm.seed) : null;
    if (pictured?.count) return { key: `${state.cue.id}:image:${motif.imageRef.assetId}`, spec: pictured, stagger: 0.35 };
    const family = motif?.family && motif.family !== "image" ? motif.family : "sphere";
    return { key: `${state.cue.id}:${family}`, spec: family, stagger: 0.35 };
  }

  function applyFormation(state, snapRotation = null, upcoming = null) {
    const next = formationFor(state, upcoming);
    if (next.key === formationKey) return false;
    swarm.setFormation(next.spec, snapRotation === null ? { stagger: next.stagger } : { snap: true, rotation: snapRotation });
    formationKey = next.key;
    return true;
  }

  function controlsFor(state, bands, t, reading, stems = null) {
    const busy = state.busy, anticipation = state.anticipation;
    const w = (group) => (stems ? (stemWeights[group] ?? 1) * stems[group] : 0);
    const base = {
      // Words are held stiff so they resolve within about half a second.
      bands, hold: reading ? 1 : clamp(0.4 + 0.45 * (1 - busy) + 0.4 * anticipation), omega: reading ? 8 : 4.5 + 2 * busy,
      flow: 0.06 + 0.5 * busy * (1 - anticipation * 0.7), reach: 0.22 + 0.4 * state.intensity,
      participation: reading ? 1 : state.density, calm: Math.max(state.calm, 0.95 * motion.faceAt(t)), rotation: reduced ? 0 : motion.rotationAt(t),
      ...(reduced ? { flow: 0.03 + 0.15 * busy } : {}),
    };
    if (!stems || reading) return base;
    // Each instrument keeps its own job: bass swells, vocals draw dust in,
    // harmony stirs the flow, cymbals sparkle.
    return { ...base, reach: base.reach + 0.35 * w("bass"), hold: clamp(base.hold - 0.15 * w("bass")),
      participation: clamp(base.participation + 0.3 * w("vocals")), flow: base.flow + (reduced ? 0.05 : 0.25) * w("harmony"),
      sparkle: reduced ? 0 : (stemWeights.drums ?? 1) * stems.cymbals };
  }

  function stepOnce(k, bandsAt, stemsAt) {
    const from = k / SCORE_DUST_STEP_HZ, to = (k + 1) / SCORE_DUST_STEP_HZ;
    const state = playback.stateAt(to), upcoming = state.phrase ? null : playback.stateAt(to + SCORE_DUST_PHRASE_LEAD_SECONDS).phrase;
    applyFormation(state, null, upcoming);
    // Scheduled beats kick on the exact step that crosses them; lifts launch fronts.
    const crossed = playback.crossings(from, to), motionScale = reduced ? 0.2 : 1;
    if (crossed.beats) swarm.kick((0.3 + 0.5 * state.intensity) * (crossed.downbeat ? 1.4 : 1) * motionScale);
    // Bright flashes pass through the gate (≤ 3/s); motion is never gated.
    if (crossed.downbeat && !reduced) flashGate.request(to, 0.25 + 0.15 * state.intensity);
    for (const event of crossed.events) {
      if (event.response === "shock") { if (reduced) swarm.kick(0.25); else swarm.shock(1.1); if (!reduced) flashGate.request(to, 0.85); }
      else if (event.response === "kick") swarm.kick(motionScale);
    }
    flashGate.decay(1 / SCORE_DUST_STEP_HZ);
    const stems = stemsAt ? stemsAt(to) : null;
    if (stems) {
      // Drum hits kick on the step their onset rises; motion only, never a flash.
      if (stems.drumOnset > 0.5 && lastDrumOnset <= 0.5 && (stemWeights.drums ?? 1) > 0) { swarm.kick((0.15 + 0.3 * stems.drums) * (stemWeights.drums ?? 1) * motionScale); drumHits++; }
      lastDrumOnset = stems.drumOnset;
    }
    const bands = bandsAt?.(to, state) || scoreDerivedBands(state, derived);
    const reading = Boolean((state.phrase || upcoming) && !(state.phrase || upcoming).burst);
    swarm.step(1 / SCORE_DUST_STEP_HZ, controlsFor(state, bands, to, reading, stems));
    stepsRun++;
  }

  /**
   * Advance to song time `t`. Backward or long jumps restart from a seeded
   * state and preroll, so the result depends on (score, seed, t, bands) only.
   */
  function advanceTo(t, { bandsAt = null, liveKick = 0, stemsAt = null } = {}) {
    const target = Math.max(0, Math.floor(Math.max(0, Number(t) || 0) * SCORE_DUST_STEP_HZ + 1e-6));
    let reset = false;
    if (simulated === null || target < simulated || target - simulated > gapSteps) {
      const start = Math.max(0, target - prerollSteps), startTime = start / SCORE_DUST_STEP_HZ;
      swarm.reset(startTime);
      flashGate.reset(); lastDrumOnset = 0;
      formationKey = "";
      applyFormation(playback.stateAt(startTime), motion.rotationAt(startTime));
      simulated = start; reset = true; resets++;
    }
    // Live reflex kicks only matter when the score has no beat grid.
    if (liveKick > 0 && !playback.beats?.length && target > simulated) swarm.kick(liveKick);
    while (simulated < target) { stepOnce(simulated, bandsAt, stemsAt); simulated++; }
    return { state: playback.stateAt(target / SCORE_DUST_STEP_HZ), reset, simulatedTime: target / SCORE_DUST_STEP_HZ };
  }

  /** Camera for song time t: closed-form yaw, pitch levelled for phrases, push before lifts. */
  function camera(t, state) {
    const face = motion.faceAt(t);
    return { yaw: reduced ? 0 : motion.yawAt(t), pitch: (0.2 + (reduced ? 0 : 0.05 * Math.sin(t * 0.2))) * (1 - face), distance: (state?.camera?.distance ?? 4.4) - (reduced ? 0 : 0.45 * (state?.anticipation || 0)) };
  }

  /** Colour style at song time t (palette crossfade, gated flash, desaturation). */
  function style(t, state) {
    return dustColourStyle(playback, state, t, { flash: flashGate.level });
  }

  return {
    swarm, motion, playback, advanceTo, camera, style, reducedMotion: reduced,
    diagnostics: () => ({ simulatedTime: simulated === null ? null : simulated / SCORE_DUST_STEP_HZ, resets, stepsRun, formation: swarm.formation, formationKey, particles: swarm.count, seed: swarm.seed, flashes: flashGate.stats(), reducedMotion: reduced, drumHits }),
  };
}
