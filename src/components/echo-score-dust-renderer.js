// Echo preview host for Score Dust: joins the prepared visual score (song
// structure + authored meaning) with live reflex audio, drives the persistent
// dust kernel and paints it on the existing 2D preview canvas.
import {
  createDustSwarm, projectDustSwarm, dustBandsFromSpectrum, sampleDustTargetsFromPixels, DUST_BAND_COUNT,
} from "../domain/echo-dust-swarm.js";

const LIVE_PARTICLE_CAP = 4000;
const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));

function createSurface(width, height) {
  if (typeof OffscreenCanvas === "function") return new OffscreenCanvas(width, height);
  if (typeof document !== "undefined") { const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height; return canvas; }
  return null;
}

/** Rasterise a phrase so words become particle targets like any picture. */
function phraseTargets(text, count, seed) {
  const surface = createSurface(512, 160), ctx = surface?.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  const words = String(text).trim().split(/\s+/), lines = [];
  for (const word of words) { const last = lines.at(-1); if (last && (last + " " + word).length <= 18) lines[lines.length - 1] = `${last} ${word}`; else lines.push(word); }
  const shown = lines.slice(0, 3), size = Math.min(96, Math.floor(150 / shown.length));
  ctx.fillStyle = "#000"; ctx.fillRect(0, 0, 512, 160);
  ctx.fillStyle = "#fff"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.font = `800 ${size}px system-ui, sans-serif`;
  let fitted = size;
  while (fitted > 18 && shown.some((line) => ctx.measureText(line).width > 488)) { fitted -= 4; ctx.font = `800 ${fitted}px system-ui, sans-serif`; }
  shown.forEach((line, i) => ctx.fillText(line, 256, 80 + (i - (shown.length - 1) / 2) * fitted * 1.05));
  return sampleDustTargetsFromPixels(ctx.getImageData(0, 0, 512, 160), { count, seed, threshold: 0.4, scale: 3.4 });
}

function color(palette, index, lift) {
  const c = palette?.[index % (palette?.length || 1)] || { h: 190, s: 0.8, l: 0.6 };
  return `hsl(${c.h.toFixed(1)} ${(c.s * 100).toFixed(1)}% ${(Math.min(0.9, c.l + lift) * 100).toFixed(1)}%)`;
}

export function createEchoScoreDustRenderer() {
  let swarm = null, swarmKey = "", projected = null, trail = null, trailCtx = null;
  let playback = null, settings = null, source = "reflex-only";
  let lastSongTime = null, lastWall = null, yaw = 0, formationKey = "", previousBeatFlash = 0;
  const bands = new Float32Array(DUST_BAND_COUNT), images = new Map();

  function ensureSwarm(width) {
    const count = Math.min(LIVE_PARTICLE_CAP, settings?.particleCount || LIVE_PARTICLE_CAP, Math.max(1200, Math.round(width * 6)));
    const seed = settings?.seed ?? 1, key = `${count}:${seed}`;
    if (swarm && swarmKey === key) return swarm;
    swarm = createDustSwarm({ count, seed });
    swarmKey = key; projected = null; formationKey = "";
    return swarm;
  }

  function imageTargets(motif) {
    const ref = motif?.imageRef;
    if (!ref?.url || typeof Image !== "function") return null;
    const cached = images.get(ref.url);
    if (cached) return cached.points || null;
    const entry = { points: null };
    images.set(ref.url, entry);
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => {
      const grid = ref.grid || [1, 1], cell = ref.cell || [0, 0];
      const w = Math.floor(image.naturalWidth / grid[0]), h = Math.floor(image.naturalHeight / grid[1]);
      const surface = createSurface(Math.min(256, w), Math.min(256, h)), ctx = surface?.getContext("2d", { willReadFrequently: true });
      if (!ctx) return;
      ctx.drawImage(image, cell[0] * w, cell[1] * h, w, h, 0, 0, surface.width, surface.height);
      try { entry.points = sampleDustTargetsFromPixels(ctx.getImageData(0, 0, surface.width, surface.height), { count: swarm?.count || 2000, seed: settings?.seed ?? 1 }); formationKey = ""; }
      catch { entry.points = null; }
    };
    image.src = ref.url;
    return null;
  }

  function chooseFormation(state) {
    if (state?.phrase) {
      const key = `phrase:${state.phrase.id}`;
      if (formationKey !== key) { const points = phraseTargets(state.phrase.text, swarm.count, swarm.seed); if (points?.count) swarm.setFormation(points, { stagger: 0.25 }); formationKey = key; }
      return;
    }
    const motif = state?.motif, family = motif?.family || "sphere";
    const pictured = motif?.imageRef ? imageTargets(motif) : null;
    const key = `${state?.cue?.id || "reflex"}:${pictured ? "image" : family}`;
    if (formationKey === key) return;
    swarm.setFormation(pictured || (family === "image" ? "sphere" : family));
    formationKey = key;
  }

  /** Accept a prepared score playback (or null for reflex-only). */
  function setPlayback(next, nextSettings = null, nextSource = "reflex-only") {
    playback = next || null; settings = nextSettings || null; source = nextSource;
    formationKey = ""; lastSongTime = null;
  }

  function draw(ctx, { width, height, t, fft, beatFlash = 0, playing = true }) {
    ensureSwarm(width);
    const now = (typeof performance !== "undefined" ? performance.now() : Date.now()) / 1000;
    const wallDt = lastWall === null ? 1 / 60 : now - lastWall;
    lastWall = now;
    const state = playback ? playback.stateAt(t) : null;
    const crossed = playback && playing && lastSongTime !== null ? playback.crossings(lastSongTime, t) : null;
    lastSongTime = t;
    chooseFormation(state);
    dustBandsFromSpectrum(fft, bands);
    const intensity = state ? state.intensity : clamp(bands.reduce((a, b) => a + b, 0) / DUST_BAND_COUNT * 2);
    const busy = state ? state.busy : 0.45, anticipation = state?.anticipation || 0;
    // Scheduled beats give an immediate kick; drops launch a travelling front.
    if (crossed?.beats) swarm.kick((0.3 + 0.5 * intensity) * (crossed.downbeat ? 1.4 : 1));
    for (const event of crossed?.events || []) {
      if (event.response === "shock") swarm.shock(1.1);
      else if (event.response === "kick") swarm.kick(1);
    }
    if (!playback?.beats?.length && beatFlash > 0.6 && previousBeatFlash <= 0.6) swarm.kick(0.3 + 0.5 * beatFlash);
    previousBeatFlash = beatFlash;
    swarm.step(wallDt, {
      bands, hold: clamp(0.4 + 0.45 * (1 - busy) + 0.4 * anticipation), omega: 4.5 + 2 * busy,
      flow: 0.06 + 0.5 * busy * (1 - anticipation * 0.7), spin: 0.04 + 0.22 * busy, reach: 0.22 + 0.4 * intensity,
      participation: state ? state.density : 0.85, calm: state?.calm || 0, face: Boolean(state?.phrase),
    });
    const camera = state?.camera || { mode: "drift", distance: 4.4 };
    if (state?.phrase) yaw -= (yaw - Math.round(yaw / (Math.PI * 2)) * Math.PI * 2) * (1 - Math.exp(-wallDt / 0.3));
    else yaw += wallDt * ({ hold: 0, drift: 0.04, orbit: 0.16, push: 0.06 })[camera.mode];
    projected = projectDustSwarm(swarm, { width, height, yaw, pitch: state?.phrase ? 0 : 0.2 + 0.05 * Math.sin(now * 0.2), distance: camera.distance - 0.45 * anticipation }, projected);

    // Trails are a history of light: fade the old frame, add the new one.
    if (!trail || trail.width !== width || trail.height !== height) { trail = createSurface(width, height); trailCtx = trail?.getContext("2d"); }
    const target = trailCtx || ctx;
    if (trailCtx) {
      // Decay alpha toward transparent so media beneath the canvas stays visible.
      trailCtx.globalCompositeOperation = "destination-out";
      trailCtx.fillStyle = `rgba(0,0,0,${(0.22 + 0.4 * (1 - busy)).toFixed(3)})`;
      trailCtx.fillRect(0, 0, width, height);
    }
    if (state?.phrase && !state.phrase.burst) {
      // Dim the media around high-information foreground material.
      ctx.fillStyle = `rgba(0,0,0,${(0.35 * state.calm).toFixed(3)})`;
      ctx.fillRect(0, 0, width, height);
    }
    target.globalCompositeOperation = "lighter";
    const palette = state?.palette;
    for (let k = 0; k < (palette?.length || 1); k++) {
      target.fillStyle = color(palette, k, 0.08 * intensity);
      for (let i = k; i < swarm.count; i += palette?.length || 1) {
        const alpha = projected.alpha[i];
        if (alpha < 0.02) continue;
        const r = projected.radius[i];
        target.globalAlpha = alpha;
        target.fillRect(projected.x[i] - r, projected.y[i] - r, r * 2, r * 2);
      }
    }
    target.globalAlpha = 1;
    target.globalCompositeOperation = "source-over";
    if (trailCtx) ctx.drawImage(trail, 0, 0);

    ctx.fillStyle = "rgba(226,232,240,.55)";
    ctx.font = "9px monospace";
    const next = state?.nextEvent ? ` · next ${state.nextEvent.kind} ${state.nextEvent.in.toFixed(1)}s` : "";
    ctx.fillText(`SCORE DUST · ${source}${state ? ` · ${state.cue.id} · ${swarm.formation}` : " · live reflex only"}${next}`, 14, height - 14);
    return { mode: "score-dust", source, cueId: state?.cue?.id || null, formation: swarm.formation, visible: projected.visible, particles: swarm.count, anticipation };
  }

  function dispose() { swarm = null; projected = null; trail = null; trailCtx = null; images.clear(); playback = null; }

  return { setPlayback, draw, dispose, get source() { return source; } };
}
