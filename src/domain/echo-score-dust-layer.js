// Score Dust as a composited Director layer (IP-6).
//
// A cut declares one `score_dust_layer`: a song window bound to an exact
// Score Dust score (Atlas run + direction → score fingerprint + seed). Score
// Dust is a sequential song-clock simulation, not a sampled shader, so the
// layer is executed from one transparent (alpha) render of that score, made
// by the existing deterministic export. Preview and final export draw the
// same bound render at the same place in the stack:
//
//   media → shaders → Living Light → Score Dust → lyrics
//
// Until a render is bound the layer is "render-required": preview says so and
// final export refuses rather than silently dropping the layer.
//
// This module is imported by the Builder, the Node compilers and (copied
// verbatim) the HyperFrames export page, so it must stay import-free.

export const ECHO_SCORE_DUST_LAYER_SCHEMA = "hapa.echo.score-dust-layer.v1";
export const ECHO_SCORE_DUST_TRACK_SCHEMA = "hapa.echo.score-dust-track.v1";
export const ECHO_SCORE_DUST_COMPOSITE_SCHEMA = "hapa.echo.score-dust-composite.v1";
export const ECHO_SCORE_DUST_LAYER_ORDER = Object.freeze(["media", "shaders", "living-light", "score-dust", "lyrics"]);
// Canvas composite for the export page; the matching CSS blend for the
// preview's overlay canvas (same operator, applied by the browser compositor).
export const ECHO_SCORE_DUST_LAYER_BLENDS = Object.freeze({
  over: Object.freeze({ canvas: "source-over", css: "normal" }),
  screen: Object.freeze({ canvas: "screen", css: "screen" }),
  lighter: Object.freeze({ canvas: "lighter", css: "plus-lighter" }),
});

const LAYER_FIELDS = ["schemaVersion", "layerId", "songId", "source", "binding", "window", "opacity", "blend", "render"];
const SOURCE_FIELDS = ["atlasRunId", "direction", "playSettings", "lyricLines"];
const BINDING_FIELDS = ["scoreFingerprint", "seed"];
const RENDER_FIELDS = ["recordingId", "uri", "sha256", "width", "height", "fps", "startSeconds", "durationSeconds", "background", "scoreFingerprint", "seed", "loopBridgeSeconds", "codec", "particles", "finalStateFingerprint"];
const SHA256 = /^sha256:[0-9a-f]{64}$/;
// A render may start/end within half an output frame of the window.
const COVER_TOLERANCE_SECONDS = 1 / 60;

function fail(code, path, message) {
  const error = new Error(message);
  error.name = "EchoScoreDustLayerError";
  error.code = code;
  error.path = path;
  throw error;
}
const isObject = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);
function fields(value, path, allowed, code = "score_dust_layer_field") {
  if (!isObject(value)) fail("score_dust_layer_object", path, "Expected an object.");
  for (const key of Object.keys(value)) if (!allowed.includes(key)) fail(code, `${path}.${key}`, "Unknown Score Dust layer field.");
}
function identifier(value, path) {
  if (typeof value !== "string" || !value || value.length > 256 || /\s/.test(value)) fail("score_dust_layer_identity", path, "An exact saved identifier is required.");
}
const finite = (value) => typeof value === "number" && Number.isFinite(value);

/** Stable JSON (sorted keys) so graph tracks compare by content. */
export function echoScoreDustCanonicalJSON(value) {
  if (Array.isArray(value)) return `[${value.map(echoScoreDustCanonicalJSON).join(",")}]`;
  if (isObject(value)) return `{${Object.keys(value).sort().filter((key) => value[key] !== undefined).map((key) => `${JSON.stringify(key)}:${echoScoreDustCanonicalJSON(value[key])}`).join(",")}}`;
  return JSON.stringify(value ?? null);
}

function validateRender(render, layer, path) {
  fields(render, path, RENDER_FIELDS);
  identifier(render.recordingId, `${path}.recordingId`);
  if (typeof render.uri !== "string" || !render.uri.trim()) fail("score_dust_render_uri", `${path}.uri`, "The bound render needs its published media URI.");
  if (!SHA256.test(String(render.sha256 || ""))) fail("score_dust_render_hash", `${path}.sha256`, "The bound render needs its exact sha256 content hash.");
  for (const key of ["width", "height", "fps"]) if (!Number.isSafeInteger(render[key]) || render[key] < 1) fail("score_dust_render_shape", `${path}.${key}`, "Render size and frame rate must be positive integers.");
  if (!finite(render.startSeconds) || render.startSeconds < 0 || !finite(render.durationSeconds) || render.durationSeconds <= 0) fail("score_dust_render_window", path, "The render needs its song start and duration.");
  if (render.background !== "transparent") fail("score_dust_render_background", `${path}.background`, "A Score Dust layer needs a transparent (alpha) render; a render with its own background is whole-shot media.");
  if (render.loopBridgeSeconds !== undefined && render.loopBridgeSeconds !== 0) fail("score_dust_render_loop", `${path}.loopBridgeSeconds`, "A loop-bridged render blends back to its start and cannot follow the song clock.");
  if (render.scoreFingerprint !== layer.binding.scoreFingerprint) fail("score_dust_render_fingerprint", `${path}.scoreFingerprint`, "The render was made from a different Score Dust score than this layer is bound to.");
  if (render.seed !== layer.binding.seed) fail("score_dust_render_seed", `${path}.seed`, "The render used a different seed than this layer is bound to.");
  const startUs = Math.round(render.startSeconds * 1e6), endUs = Math.round((render.startSeconds + render.durationSeconds) * 1e6), tolUs = Math.round(COVER_TOLERANCE_SECONDS * 1e6);
  if (startUs > layer.window.startUs + tolUs || endUs < layer.window.endUs - tolUs) fail("score_dust_render_coverage", path, "The render does not cover the layer's whole window.");
}

/** Inert authoring contract shared by the cut owner, compilers and editors. */
export function validateEchoScoreDustLayer(layer, { songId, durationUs } = {}) {
  if (layer === undefined || layer === null) return null;
  const path = "score_dust_layer";
  fields(layer, path, LAYER_FIELDS);
  if (layer.schemaVersion !== ECHO_SCORE_DUST_LAYER_SCHEMA) fail("score_dust_layer_schema", `${path}.schemaVersion`, "Unsupported Score Dust layer version.");
  identifier(layer.layerId, `${path}.layerId`);
  identifier(layer.songId, `${path}.songId`);
  if (songId !== undefined && layer.songId !== songId) fail("score_dust_layer_song", `${path}.songId`, "A Score Dust layer belongs to one song.");
  fields(layer.source, `${path}.source`, SOURCE_FIELDS);
  identifier(layer.source.atlasRunId, `${path}.source.atlasRunId`);
  if (!isObject(layer.source.direction)) fail("score_dust_layer_direction", `${path}.source.direction`, "The layer keeps the exact Score Dust direction it was composed from.");
  if (layer.source.playSettings !== null && !isObject(layer.source.playSettings)) fail("score_dust_layer_direction", `${path}.source.playSettings`, "Play settings are an object or null.");
  // "project": the score was composed with the song's verified written lyric timing (Atlas lyricLines=project).
  if (![null, "project"].includes(layer.source.lyricLines)) fail("score_dust_layer_direction", `${path}.source.lyricLines`, "Lyric lines are \"project\" (verified written timing) or null.");
  fields(layer.binding, `${path}.binding`, BINDING_FIELDS);
  identifier(layer.binding.scoreFingerprint, `${path}.binding.scoreFingerprint`);
  if (!Number.isSafeInteger(layer.binding.seed) || layer.binding.seed < 0) fail("score_dust_layer_seed", `${path}.binding.seed`, "The bound seed is a non-negative integer.");
  fields(layer.window, `${path}.window`, ["startUs", "endUs"]);
  if (!Number.isSafeInteger(layer.window.startUs) || !Number.isSafeInteger(layer.window.endUs) || layer.window.startUs < 0 || layer.window.endUs <= layer.window.startUs) fail("score_dust_layer_window", `${path}.window`, "Use a positive, half-open interval in integer microseconds.");
  if (durationUs !== undefined && (!Number.isSafeInteger(durationUs) || layer.window.endUs > durationUs)) fail("score_dust_layer_duration", `${path}.window`, "The layer must fit the song; it is never silently clipped.");
  if (!finite(layer.opacity) || layer.opacity <= 0 || layer.opacity > 1) fail("score_dust_layer_opacity", `${path}.opacity`, "Opacity is greater than 0 and at most 1.");
  if (!Object.hasOwn(ECHO_SCORE_DUST_LAYER_BLENDS, layer.blend)) fail("score_dust_layer_blend", `${path}.blend`, `Blend is one of ${Object.keys(ECHO_SCORE_DUST_LAYER_BLENDS).join(", ")}.`);
  if (layer.render !== null) validateRender(layer.render, layer, `${path}.render`);
  return layer;
}

function projectBody(project) {
  return project?.music_video_project || project?.project || project || {};
}

export function echoProjectScoreDustLayer(project = {}) {
  const body = projectBody(project);
  return validateEchoScoreDustLayer(body.score_dust_layer, {
    songId: body.song_id,
    ...(body.duration !== undefined ? { durationUs: Math.round(Number(body.duration) * 1e6) } : {}),
  });
}

/** The show-graph track (graph.scoreDust); null when the cut has no layer. */
export function compileEchoScoreDustTrack(project = {}) {
  const layer = echoProjectScoreDustLayer(project);
  if (!layer) return null;
  const bound = layer.render !== null;
  return {
    schemaVersion: ECHO_SCORE_DUST_TRACK_SCHEMA,
    layer: JSON.parse(JSON.stringify(layer)),
    status: bound ? "bound" : "render-required",
    order: [...ECHO_SCORE_DUST_LAYER_ORDER],
    readiness: bound
      ? { preview: "bound-render", finalEncoding: "prepared-capture" }
      : { preview: "render-required", finalEncoding: "blocked-render-required" },
  };
}

export function attachEchoScoreDustTrack(graph, project) {
  const track = compileEchoScoreDustTrack(project);
  if (track) graph.scoreDust = track;
  else delete graph.scoreDust;
  return graph;
}

/**
 * Final export admits a layer only when the graph carries exactly the cut's
 * track and that track has a bound render. Returns the track (or null).
 */
export function assertEchoScoreDustLayerExportable(project, graph) {
  const track = compileEchoScoreDustTrack(project);
  if (echoScoreDustCanonicalJSON(track) !== echoScoreDustCanonicalJSON(graph?.scoreDust ?? null)) fail("score_dust_graph_mismatch", "scoreDust", "The Show Graph's Score Dust track differs from the cut. Recompile the Show Graph.");
  if (track && track.status !== "bound") fail("score_dust_render_required", "score_dust_layer.render", "This Score Dust layer has no bound render yet. Render the layer, save the cut, then export.");
  return track;
}

/**
 * What to draw at a song time: shared by preview and export so both decode the
 * same render frame. The render is a fixed-rate frame sequence, so the frame
 * is chosen by index and sought at the middle of its interval: WebM timestamps
 * are whole milliseconds and Chromium can land a seek a few microseconds short,
 * so a boundary-exact seek could show the neighbouring frame.
 */
export function echoScoreDustLayerFrame(track, songSeconds) {
  const layer = track?.layer, render = layer?.render;
  const t = Number(songSeconds), us = Math.round(t * 1e6);
  if (!render || !Number.isFinite(t) || us < layer.window.startUs || us >= layer.window.endUs) return { active: false, sourceSeconds: null, sourceFrame: null, seekSeconds: null, renderFps: null, opacity: 0, canvasComposite: null, cssBlend: null };
  const blend = ECHO_SCORE_DUST_LAYER_BLENDS[layer.blend], frames = Math.max(1, Math.round(render.durationSeconds * render.fps));
  const sourceSeconds = Math.max(0, Math.min(render.durationSeconds, t - render.startSeconds));
  const sourceFrame = Math.min(frames - 1, Math.floor(sourceSeconds * render.fps + 1e-6));
  return { active: true, sourceSeconds, sourceFrame, seekSeconds: (sourceFrame + 0.5) / render.fps, renderFps: render.fps, opacity: layer.opacity, canvasComposite: blend.canvas, cssBlend: blend.css };
}

/** True when the video shows the frame's source frame (within a quarter frame of its middle). */
export function echoScoreDustLayerVideoAt(video, frame) {
  return Boolean(frame?.active) && !video.seeking && video.readyState >= 2 && Math.abs(video.currentTime - frame.seekSeconds) <= 0.25 / frame.renderFps;
}

/**
 * Seek the layer's video to the frame and wait until it is drawable (export
 * page; the preview follows the song clock with the same targets). Resolves
 * with the observed media time; a seek that does not land is an error.
 */
export async function seekEchoScoreDustLayerVideo(video, frame, { timeoutMs = 10000, signal = null } = {}) {
  if (!frame?.active) return null;
  if (!echoScoreDustLayerVideoAt(video, frame)) {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => done(new Error(`Score Dust layer seek timed out at ${frame.seekSeconds}`)), timeoutMs);
      const landed = () => { if (echoScoreDustLayerVideoAt(video, frame)) done(); };
      const failed = () => done(new Error("Score Dust layer video could not be decoded"));
      const cancelled = () => done(new Error("Score Dust layer seek cancelled"));
      function done(error) {
        clearTimeout(timer);
        video.removeEventListener("seeked", landed); video.removeEventListener("loadeddata", landed); video.removeEventListener("error", failed);
        signal?.removeEventListener("abort", cancelled);
        if (error) reject(error); else resolve();
      }
      video.addEventListener("seeked", landed); video.addEventListener("loadeddata", landed); video.addEventListener("error", failed);
      signal?.addEventListener("abort", cancelled, { once: true });
      video.pause();
      video.currentTime = frame.seekSeconds;
    });
    // A hidden capture video can report seeked before the new frame is
    // drawable: wait for its presentation, bounded by two animation frames.
    await new Promise((resolve) => {
      let settled = false;
      const finish = () => { if (!settled) { settled = true; resolve(); } };
      video.requestVideoFrameCallback?.(finish);
      if (typeof globalThis.requestAnimationFrame === "function") globalThis.requestAnimationFrame(() => globalThis.requestAnimationFrame(finish));
      else setTimeout(finish, 50);
    });
  }
  return { observedSeconds: video.currentTime, sourceFrame: frame.sourceFrame };
}

/** Cover-fit source rectangle [sx, sy, sw, sh] (identity when the render matches the output). */
export function echoScoreDustLayerSourceRect(sourceWidth, sourceHeight, outputWidth, outputHeight) {
  if (!(sourceWidth > 0 && sourceHeight > 0 && outputWidth > 0 && outputHeight > 0)) return [0, 0, sourceWidth || 0, sourceHeight || 0];
  const scale = Math.max(outputWidth / sourceWidth, outputHeight / sourceHeight), sw = outputWidth / scale, sh = outputHeight / scale;
  return [(sourceWidth - sw) / 2, (sourceHeight - sh) / 2, sw, sh];
}

/** Paint the layer's video frame onto a 2D context (export page and preview). */
export function paintEchoScoreDustLayer(ctx, video, frame, width, height) {
  if (!frame?.active || !video?.videoWidth) return false;
  const [sx, sy, sw, sh] = echoScoreDustLayerSourceRect(video.videoWidth, video.videoHeight, width, height);
  ctx.save();
  ctx.globalAlpha = frame.opacity;
  ctx.globalCompositeOperation = frame.canvasComposite;
  ctx.drawImage(video, sx, sy, sw, sh, 0, 0, width, height);
  ctx.restore();
  return true;
}

/**
 * Plan a layer (no render yet). Windows snap to whole milliseconds inside the
 * requested span so they always fit a song duration compiled to the millisecond.
 */
export function planEchoScoreDustLayer({ songId, atlasRunId, direction, playSettings = null, lyricLines = null, scoreFingerprint, seed, startSeconds, endSeconds, opacity = 1, blend = "over", layerId = null } = {}) {
  const startUs = Math.ceil(Number(startSeconds) * 1e3) * 1e3, endUs = Math.floor(Number(endSeconds) * 1e3) * 1e3;
  const layer = {
    schemaVersion: ECHO_SCORE_DUST_LAYER_SCHEMA,
    layerId: layerId || `score-dust-layer:${String(scoreFingerprint).slice(0, 16)}:${startUs}-${endUs}`,
    songId, source: { atlasRunId, direction: JSON.parse(JSON.stringify(direction || {})), playSettings: playSettings ? JSON.parse(JSON.stringify(playSettings)) : null, lyricLines },
    binding: { scoreFingerprint, seed }, window: { startUs, endUs }, opacity, blend, render: null,
  };
  return validateEchoScoreDustLayer(layer);
}

/**
 * Bind a published transparent render to the layer. `receipt` is the
 * export receipt; `published` is the publish-render response.
 */
export function bindEchoScoreDustLayerRender(layer, { recordingId, uri, sha256, receipt } = {}) {
  validateEchoScoreDustLayer(layer);
  if (!isObject(receipt)) fail("score_dust_render_receipt", "receipt", "Binding needs the render's export receipt.");
  const hex = String(sha256 || "").replace(/^sha256:/, "");
  const render = {
    recordingId, uri, sha256: `sha256:${hex}`,
    width: receipt.width, height: receipt.height, fps: receipt.fps,
    startSeconds: receipt.startSeconds, durationSeconds: receipt.durationSeconds,
    background: receipt.background, scoreFingerprint: receipt.scoreFingerprint, seed: receipt.seed,
    loopBridgeSeconds: receipt.loopBridgeSeconds ?? 0,
    ...(receipt.codec ? { codec: String(receipt.codec) } : {}),
    ...(Number.isSafeInteger(receipt.particles) ? { particles: receipt.particles } : {}),
    ...(typeof receipt.finalStateFingerprint === "string" ? { finalStateFingerprint: receipt.finalStateFingerprint } : {}),
  };
  return validateEchoScoreDustLayer({ ...JSON.parse(JSON.stringify(layer)), render });
}
