// Echo preview and offline hosts for Score Dust.
//
// Both hosts drive the same song-clock performance and the same painter, so a
// live preview frame and an exported frame at the same song time agree (given
// the same band input). Live hosting adds an adaptive draw budget; offline
// hosting follows the Living Light frame-addressed contract
// (prepareFrame/paintFrame) so existing packaging can consume it.
import { projectDustSwarm, dustBandsFromSpectrum, sampleDustTargetsFromPixels, DUST_BAND_COUNT } from "../domain/echo-dust-swarm.js";
import { createScoreDustPerformance } from "../domain/echo-score-dust-performance.js";
import { computeDustColours, paintDustBackground } from "../domain/echo-score-dust-colour.js";
import { composeEchoVisualScore, prepareEchoScorePlayback, reflexOnlyEchoTimeline } from "../domain/echo-visual-score.js";

const LIVE_PARTICLE_CAP = 4000;
const GLOW_SCALE = 0.25;
const BUDGET_LEVELS = Object.freeze([
  { drawFraction: 1, glow: true },
  { drawFraction: 0.75, glow: true },
  { drawFraction: 0.5, glow: false },
]);
const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const now = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

function defaultSurface(width, height) {
  if (typeof OffscreenCanvas === "function") return new OffscreenCanvas(width, height);
  if (typeof document !== "undefined") { const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height; return canvas; }
  return null;
}

/** Rasterise a phrase so words become particle targets like any picture. */
export function rasterizePhraseTargets(phrase, count, seed, surfaceFactory = defaultSurface) {
  const surface = surfaceFactory(512, 160), ctx = surface?.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  const words = String(phrase?.text || "").trim().split(/\s+/), lines = [];
  for (const word of words) { const last = lines.at(-1); if (last && `${last} ${word}`.length <= 18) lines[lines.length - 1] = `${last} ${word}`; else lines.push(word); }
  const shown = lines.slice(0, 3);
  let size = Math.min(96, Math.floor(150 / shown.length));
  ctx.fillStyle = "#000"; ctx.fillRect(0, 0, 512, 160);
  ctx.fillStyle = "#fff"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.font = `800 ${size}px system-ui, sans-serif`;
  while (size > 18 && shown.some((line) => ctx.measureText(line).width > 488)) { size -= 4; ctx.font = `800 ${size}px system-ui, sans-serif`; }
  shown.forEach((line, i) => ctx.fillText(line, 256, 80 + (i - (shown.length - 1) / 2) * size * 1.05));
  return sampleDustTargetsFromPixels(ctx.getImageData(0, 0, 512, 160), { count, seed, threshold: 0.4, scale: 3.4 });
}

/** Load an atlas cell (or whole image) and sample it into targets. */
export function loadImageTargets(ref, count, seed, surfaceFactory = defaultSurface) {
  return new Promise((resolve) => {
    if (!ref?.url || typeof Image !== "function") return resolve(null);
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onerror = () => resolve(null);
    image.onload = () => {
      try {
        const grid = ref.grid || [1, 1], cell = ref.cell || [0, 0];
        const w = Math.floor(image.naturalWidth / grid[0]), h = Math.floor(image.naturalHeight / grid[1]);
        const scale = Math.min(1, 256 / Math.max(w, h)), surface = surfaceFactory(Math.max(1, Math.round(w * scale)), Math.max(1, Math.round(h * scale)));
        const ctx = surface?.getContext("2d", { willReadFrequently: true });
        if (!ctx) return resolve(null);
        ctx.drawImage(image, cell[0] * w, cell[1] * h, w, h, 0, 0, surface.width, surface.height);
        resolve(sampleDustTargetsFromPixels(ctx.getImageData(0, 0, surface.width, surface.height), { count, seed, threshold: ref.threshold ?? 0.3, scale: 2.4 }));
      } catch { resolve(null); }
    };
    image.src = ref.url;
  });
}

/**
 * Painter shared by live and offline hosts. Trails are a decaying history of
 * light on a transparent layer, so media beneath the canvas stays visible.
 */
export function createScoreDustPainter(surfaceFactory = defaultSurface) {
  let trail = null, trailCtx = null, glow = null, glowCtx = null, projected = null, rgb = null, keys = null, order = null;
  function ensure(width, height) {
    if (!trail || trail.width !== width || trail.height !== height) {
      trail = surfaceFactory(width, height); trailCtx = trail?.getContext("2d") || null;
      glow = surfaceFactory(Math.max(1, Math.round(width * GLOW_SCALE)), Math.max(1, Math.round(height * GLOW_SCALE))); glowCtx = glow?.getContext("2d") || null;
    }
  }
  /** `view` and `camera` override what is drawn (used by the loop bridge). */
  function paint(ctx, { performance, state, t, width, height, frameSeconds = 1 / 60, drawFraction = 1, glow: glowOn = true, label = "", view = null, camera: cameraOverride = null }) {
    ensure(width, height);
    const swarm = view || performance.swarm, camera = cameraOverride || performance.camera(t, state);
    projected = projectDustSwarm(swarm, { width, height, ...camera }, projected);
    const busy = state?.busy ?? 0.45, intensity = state?.intensity ?? 0.5;
    const target = trailCtx || ctx;
    if (trailCtx) {
      // Fade by elapsed time, not frames, so trail length is frame-rate independent.
      const keep = Math.pow(1 - (0.22 + 0.4 * (1 - busy)), frameSeconds * 60);
      trailCtx.globalCompositeOperation = "destination-out";
      trailCtx.fillStyle = `rgba(0,0,0,${(1 - keep).toFixed(4)})`;
      trailCtx.fillRect(0, 0, width, height);
    }
    if (state?.phrase && !state.phrase.burst) {
      // Dim the media around high-information foreground material.
      ctx.fillStyle = `rgba(0,0,0,${(0.35 * state.calm).toFixed(3)})`;
      ctx.fillRect(0, 0, width, height);
    }
    target.globalCompositeOperation = "lighter";
    const stride = Math.max(1, Math.round(1 / clamp(drawFraction, 0.1, 1)));
    // Additive light scales with particle count; normalise so 4k and 12k read alike.
    const exposure = Math.min(1, Math.sqrt(2500 / swarm.count)), boost = Math.min(1.6, stride) * exposure;
    // Per-particle colour from the shared colour module, grouped into 4-bit
    // RGB buckets so the canvas changes fill colour only once per bucket.
    const live = performance.swarm, n = live.count;
    if (!rgb || rgb.length !== n * 3) { rgb = new Float32Array(n * 3); keys = new Uint16Array(n); order = new Uint32Array(n); }
    computeDustColours(live, performance.style(t, state), rgb, { rotation: live.rotation ?? 0 });
    const counts = new Map();
    for (let i = 0; i < n; i += stride) {
      const key = (Math.min(15, (rgb[i * 3] * 15.99) | 0) << 8) | (Math.min(15, (rgb[i * 3 + 1] * 15.99) | 0) << 4) | Math.min(15, (rgb[i * 3 + 2] * 15.99) | 0);
      keys[i] = key; counts.set(key, (counts.get(key) || 0) + 1);
    }
    let cursor = 0;
    const starts = new Map();
    for (const [key, total] of counts) { starts.set(key, cursor); cursor += total; }
    const fill = new Map(starts);
    for (let i = 0; i < n; i += stride) { const at = fill.get(keys[i]); order[at] = i; fill.set(keys[i], at + 1); }
    for (const [key, begin] of starts) {
      const r16 = key >> 8, g16 = (key >> 4) & 15, b16 = key & 15;
      target.fillStyle = `rgb(${r16 * 17} ${g16 * 17} ${b16 * 17})`;
      for (let k = begin, end = begin + counts.get(key); k < end; k++) {
        const i = order[k], alpha = projected.alpha[i];
        if (alpha < 0.02) continue;
        const r = projected.radius[i] * (stride > 1 ? 1.15 : 1);
        target.globalAlpha = Math.min(1, alpha * boost);
        target.fillRect(projected.x[i] - r, projected.y[i] - r, r * 2, r * 2);
      }
    }
    target.globalAlpha = 1;
    target.globalCompositeOperation = "source-over";
    if (trailCtx) {
      if (glowOn && glowCtx) {
        // Cheap bloom: a quarter-size copy upscaled with smoothing.
        glowCtx.clearRect(0, 0, glow.width, glow.height);
        glowCtx.drawImage(trail, 0, 0, glow.width, glow.height);
        ctx.save();
        ctx.globalCompositeOperation = "lighter";
        ctx.globalAlpha = 0.22 + 0.22 * intensity;
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(glow, 0, 0, width, height);
        ctx.restore();
      }
      ctx.drawImage(trail, 0, 0);
    }
    if (label) {
      ctx.fillStyle = "rgba(226,232,240,.55)";
      ctx.font = "9px monospace";
      ctx.fillText(label, 14, height - 14);
    }
    return projected.visible;
  }
  function dispose() { trail = trailCtx = glow = glowCtx = projected = null; }
  return { paint, dispose };
}

function reflexPlayback(durationSeconds = 3600) {
  const timeline = reflexOnlyEchoTimeline(durationSeconds);
  return prepareEchoScorePlayback(composeEchoVisualScore(timeline), timeline);
}

/** Authored score background (solid, gradient or section palette); black draws nothing. */
export function paintScoreBackground(ctx, performanceHost, t, state, width, height) {
  const background = performanceHost.playback?.score?.background;
  if (!background || background.kind === "black" || !state) return false;
  return paintDustBackground(ctx, background, width, height, performanceHost.style(t, state));
}

/** Live Echo preview host with an adaptive draw budget. */
export function createEchoScoreDustRenderer() {
  const painter = createScoreDustPainter(), bands = new Float32Array(DUST_BAND_COUNT), images = new Map();
  let performanceHost = null, source = "reflex-only", previousBeatFlash = 0, lastWall = null, stemsAt = null;
  let level = 0, ema = 8, over = 0, under = 0;

  function targetsFor(motif, count, seed) {
    const ref = motif?.imageRef;
    if (!ref?.url) return null;
    const key = `${ref.url}:${count}:${seed}:${(ref.cell || []).join(",")}`;
    if (!images.has(key)) {
      images.set(key, null);
      loadImageTargets(ref, count, seed).then((points) => { images.set(key, points); });
    }
    return images.get(key);
  }

  /** Accept a prepared score playback (or null for reflex-only). */
  function setPlayback(playback, settings = null, nextSource = "reflex-only", { stems = null } = {}) {
    source = playback ? nextSource : "reflex-only";
    stemsAt = playback && stems ? (t) => stems.at(t) : null;
    const live = { ...(settings || {}), particleCount: Math.min(LIVE_PARTICLE_CAP, settings?.particleCount || LIVE_PARTICLE_CAP) };
    performanceHost = createScoreDustPerformance({ playback: playback || reflexPlayback(), settings: live, targetsFor, phraseTargets: (phrase, count, seed) => rasterizePhraseTargets(phrase, count, seed) });
  }

  function draw(ctx, { width, height, t, fft, beatFlash = 0 }) {
    if (!performanceHost) setPlayback(null);
    const started = now(), wallDt = lastWall === null ? 1 / 60 : clamp((started - lastWall) / 1000, 0, 0.25);
    lastWall = started;
    dustBandsFromSpectrum(fft, bands);
    const liveKick = beatFlash > 0.6 && previousBeatFlash <= 0.6 ? 0.3 + 0.5 * beatFlash : 0;
    previousBeatFlash = beatFlash;
    const { state } = performanceHost.advanceTo(t, { bandsAt: () => bands, liveKick, stemsAt });
    paintScoreBackground(ctx, performanceHost, t, state, width, height);
    const budget = BUDGET_LEVELS[level];
    const next = state?.nextEvent ? ` · next ${state.nextEvent.kind} ${state.nextEvent.in.toFixed(1)}s` : "";
    const visible = painter.paint(ctx, { performance: performanceHost, state, t, width, height, frameSeconds: wallDt || 1 / 60, ...budget,
      label: `SCORE DUST · ${source}${source === "reflex-only" ? " · live reflex only" : ` · ${state.cue.id} · ${performanceHost.swarm.formation}`}${next}${level ? ` · budget ${Math.round(budget.drawFraction * 100)}%` : ""}` });
    // Step the draw budget down under sustained strain and back up when relaxed.
    ema = ema * 0.9 + (now() - started) * 0.1;
    if (ema > 14) { over++; under = 0; if (over > 45 && level < BUDGET_LEVELS.length - 1) { level++; over = 0; } }
    else if (ema < 7) { under++; over = 0; if (under > 180 && level > 0) { level--; under = 0; } }
    else { over = 0; under = 0; }
    return { mode: "score-dust", source, cueId: state?.cue?.id || null, formation: performanceHost.swarm.formation, visible, particles: performanceHost.swarm.count, budgetLevel: level, frameMs: Number(ema.toFixed(2)), anticipation: state?.anticipation || 0 };
  }

  function dispose() { painter.dispose(); images.clear(); performanceHost = null; }
  return { setPlayback, draw, dispose, get source() { return source; }, diagnostics: () => ({ source, budgetLevel: level, frameMs: ema, ...(performanceHost?.diagnostics() || {}) }) };
}

/**
 * Frame-addressed offline renderer (same contract as Living Light's
 * director-offline): every picture is evaluated at an exact integer song time
 * with a fixed simulation step, independent of how long a frame takes.
 */
export function createEchoScoreDustOfflineRenderer({ width, height, fps = 30, durationUs, playback, settings = {}, bandsAt = null, canvasFactory = (w, h) => defaultSurface(w, h), labels = false } = {}) {
  for (const size of [width, height]) if (!Number.isSafeInteger(size) || size < 1 || size > 3840) throw Error("Invalid offline output size");
  if (!Number.isSafeInteger(fps) || fps < 1 || fps > 120) throw Error("Offline frame rate must be an integer from 1 to 120");
  if (!Number.isSafeInteger(durationUs) || durationUs < 1 || durationUs > 1800e6) throw Error("Invalid offline song duration");
  if (!playback?.stateAt) throw Error("A prepared score playback is required");
  const staging = canvasFactory(width, height), context = staging?.getContext("2d");
  if (!context) throw Error("Offline staging canvas is unavailable");
  const frameCount = Math.ceil(durationUs * fps / 1e6), images = new Map(), painter = createScoreDustPainter(canvasFactory);
  const count = Math.min(20000, settings.particleCount || 6000);
  let disposed = false, prepared = null, lastFrame = null, imagesReady = null;
  const performanceHost = createScoreDustPerformance({ playback, settings, count,
    targetsFor: (motif) => images.get(motif?.imageRef?.assetId) || null,
    phraseTargets: (phrase, n, seed) => rasterizePhraseTargets(phrase, n, seed, canvasFactory) });

  function frameTime(frameIndex) {
    if (!Number.isSafeInteger(frameIndex) || frameIndex < 0 || frameIndex >= frameCount) throw Object.assign(Error("Frame index is outside the output timeline."), { code: "score_dust_offline_frame_invalid" });
    return Math.round(frameIndex * 1e6 / fps);
  }
  async function preloadImages() {
    // Pictures must be resident before frame 0 so every frame sees the same targets.
    for (const motif of playback.score.motifs) {
      if (!motif.imageRef?.url || images.has(motif.imageRef.assetId)) continue;
      images.set(motif.imageRef.assetId, await loadImageTargets(motif.imageRef, count, performanceHost.swarm.seed, canvasFactory));
    }
  }
  async function prepareFrame(frameIndex, { signal } = {}) {
    if (disposed) throw Object.assign(Error("Offline Score Dust renderer is disposed."), { code: "score_dust_offline_disposed" });
    const songUs = frameTime(frameIndex);
    if (signal?.aborted) throw signal.reason || Error("aborted");
    await (imagesReady ||= preloadImages());
    // Non-consecutive frames restart the trail history; the simulation itself
    // restarts deterministically inside the performance.
    if (lastFrame === null || frameIndex !== lastFrame + 1) { painter.dispose(); }
    const t = songUs / 1e6, { state } = performanceHost.advanceTo(t, { bandsAt });
    context.clearRect(0, 0, width, height);
    paintScoreBackground(context, performanceHost, t, state, width, height);
    const visible = painter.paint(context, { performance: performanceHost, state, t, width, height, frameSeconds: 1 / fps, label: labels ? `${state.cue.id} · ${performanceHost.swarm.formation}` : "" });
    lastFrame = frameIndex;
    prepared = { schemaVersion: "hapa.echo.score-dust.offline-frame.v1", frameIndex, songUs, width, height, fps, cueId: state.cue.id, formation: performanceHost.swarm.formation, visible, stateFingerprint: performanceHost.swarm.fingerprint() };
    return structuredClone(prepared);
  }
  function paintFrame(frameIndex, target) {
    if (prepared?.frameIndex !== frameIndex) throw Object.assign(Error("Prepare this exact Score Dust frame before painting it."), { code: "score_dust_offline_unprepared" });
    target.drawImage(staging, 0, 0, width, height);
    return structuredClone(prepared);
  }
  function dispose() { if (disposed) return; disposed = true; painter.dispose(); images.clear(); prepared = null; staging.width = staging.height = 1; }
  return { frameCount, frameTime, prepareFrame, paintFrame, dispose,
    diagnostics: () => ({ disposed, preparedFrame: prepared?.frameIndex ?? null, frameCount, width, height, fps, scoreFingerprint: playback.score.fingerprint, ...performanceHost.diagnostics(), ownedAudioContexts: 0, ownedAnimationLoops: 0 }) };
}
