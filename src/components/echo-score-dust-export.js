// Deterministic Score Dust video export (research priority 4).
//
// Frames are rendered at exact song times with the fixed-step performance,
// encoded with WebCodecs and muxed into WebM with explicit timestamps, so the
// file does not depend on how long each frame takes to draw. Deformation uses
// the song's own spectrum (decoded PCM), and loops get an authored bridge: the
// last seconds blend back into the state just before the first frame, with an
// equal-power audio crossfade, so the last frame flows into the first.
import { createScoreDustPerformance } from "../domain/echo-score-dust-performance.js";
import { createPcmBandSampler } from "../domain/echo-audio-bands.js";
import { createWebmMuxer, opusHead } from "../domain/webm-muxer.js";
import { createScoreDustPainter, rasterizePhraseTargets, loadImageTargets } from "./echo-score-dust-renderer.js";
import { createCutMediaCompositor } from "./echo-score-dust-composite.js";

export const SCORE_DUST_EXPORT_SCHEMA = "hapa.echo.score-dust.export.v1";
export const SCORE_DUST_EXPORT_FORMATS = Object.freeze({
  landscape: { width: 1280, height: 720, label: "Landscape 1280×720" },
  hd: { width: 1920, height: 1080, label: "Landscape 1920×1080" },
  portrait: { width: 1080, height: 1920, label: "Portrait 1080×1920" },
  square: { width: 1080, height: 1080, label: "Square 1080×1080" },
});
const AUDIO_RATE = 48000, MAX_FILE_BYTES = 120 * 1024 * 1024;
const smoothstep = (x) => { const v = Math.min(1, Math.max(0, x)); return v * v * (3 - 2 * v); };

function surface(width, height) {
  if (typeof OffscreenCanvas === "function") return new OffscreenCanvas(width, height);
  const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height; return canvas;
}

/** Bitrate scaled by pixel count (0.75 power) and capped so the file fits the recordings store. */
export function scoreDustExportBitrate({ width, height, fps, durationSeconds, audioBitrate = 160_000 }) {
  const base = 8_000_000 * Math.pow((width * height) / (1920 * 1080), 0.75) * (fps > 30 ? 1.4 : 1);
  const cap = (MAX_FILE_BYTES * 8) / Math.max(1, durationSeconds) - audioBitrate;
  return Math.max(400_000, Math.floor(Math.min(base, cap)));
}

/** Decode song audio to 48 kHz channel arrays. */
export async function decodeSongAudio(source, { signal } = {}) {
  const bytes = source instanceof ArrayBuffer ? source : await (await fetch(source, { credentials: "same-origin", signal })).arrayBuffer();
  const context = new OfflineAudioContext(2, 1, AUDIO_RATE);
  const buffer = await context.decodeAudioData(bytes);
  return { sampleRate: buffer.sampleRate, channels: Array.from({ length: Math.min(2, buffer.numberOfChannels) }, (_, i) => buffer.getChannelData(i)), durationSeconds: buffer.duration };
}

function snapshotView(swarm) {
  return { count: swarm.count, position: Float32Array.from(swarm.position), visibility: Float32Array.from(swarm.visibility), band: Float32Array.from(swarm.band), size: swarm.size, brightness: swarm.brightness };
}

async function encodeAudio({ audio, startSeconds, durationSeconds, bridgeSeconds, muxerAudio, signal }) {
  const channels = audio.channels.length >= 2 ? audio.channels.slice(0, 2) : [audio.channels[0], audio.channels[0]];
  const total = Math.round(durationSeconds * AUDIO_RATE), from = Math.round(startSeconds * AUDIO_RATE), bridge = Math.round(bridgeSeconds * AUDIO_RATE);
  const planes = channels.map((channel) => {
    const out = new Float32Array(total);
    for (let i = 0; i < total; i++) {
      const at = from + i, here = at >= 0 && at < channel.length ? channel[at] : 0;
      const intoBridge = i - (total - bridge);
      if (bridge > 0 && intoBridge >= 0) {
        // Equal-power crossfade into the audio just before the loop start.
        const u = intoBridge / bridge, earlier = at - total >= 0 && at - total < channel.length ? channel[at - total] : 0;
        out[i] = here * Math.cos((Math.PI / 2) * u) + earlier * Math.sin((Math.PI / 2) * u);
      } else out[i] = here;
    }
    return out;
  });
  const chunks = [];
  let config = null;
  const audioEncoder = new AudioEncoder({
    output: (chunk, metadata) => { const data = new Uint8Array(chunk.byteLength); chunk.copyTo(data); chunks.push({ data, timestampUs: chunk.timestamp }); if (metadata?.decoderConfig) config = metadata.decoderConfig; },
    error: (error) => { throw error; },
  });
  audioEncoder.configure({ codec: "opus", sampleRate: AUDIO_RATE, numberOfChannels: 2, bitrate: 160_000 });
  const frameSize = 960;
  for (let i = 0; i < total; i += frameSize) {
    if (signal?.aborted) throw signal.reason || new Error("Export cancelled");
    const frames = Math.min(frameSize, total - i), data = new Float32Array(frames * 2);
    data.set(planes[0].subarray(i, i + frames), 0); data.set(planes[1].subarray(i, i + frames), frames);
    const audioData = new AudioData({ format: "f32-planar", sampleRate: AUDIO_RATE, numberOfFrames: frames, numberOfChannels: 2, timestamp: Math.round((i * 1e6) / AUDIO_RATE), data });
    audioEncoder.encode(audioData); audioData.close();
  }
  await audioEncoder.flush(); audioEncoder.close();
  const description = config?.description ? new Uint8Array(config.description instanceof ArrayBuffer ? config.description : config.description.buffer) : null;
  muxerAudio.codecPrivate = description?.length >= 19 ? description : opusHead({ channels: 2, sampleRate: AUDIO_RATE });
  return chunks;
}

/**
 * exportScoreDustVideo({ playback, settings, audio?, startSeconds, durationSeconds, format, fps, loopBridgeSeconds, signal, onProgress })
 * → { blob, mimeType, receipt }
 */
export async function exportScoreDustVideo({ playback, settings = {}, audio = null, startSeconds = 0, durationSeconds = 15, format = "landscape", width = null, height = null,
  fps = 30, loopBridgeSeconds = 0, particleCount = null, stems = null, background = "black", shots = null, resolveUri = (uri) => uri, signal = null, onProgress = () => {} } = {}) {
  if (typeof VideoEncoder !== "function") throw new Error("This browser has no WebCodecs video encoder.");
  if (!playback?.stateAt) throw new Error("A prepared score playback is required.");
  const size = SCORE_DUST_EXPORT_FORMATS[format] || SCORE_DUST_EXPORT_FORMATS.landscape;
  const w = width || size.width, h = height || size.height;
  const songEnd = playback.score.durationSeconds;
  const start = Math.max(0, Math.min(Number(startSeconds) || 0, songEnd - 0.5)), length = Math.max(0.5, Math.min(Number(durationSeconds) || 15, songEnd - start));
  const bridge = Math.max(0, Math.min(Number(loopBridgeSeconds) || 0, length / 2, start));
  const frameCount = Math.round(length * fps), bridgeFrames = Math.round(bridge * fps);
  const canvas = surface(w, h), ctx = canvas.getContext("2d", { alpha: false });
  const painter = createScoreDustPainter(surface);
  const count = Math.min(20000, particleCount || settings.particleCount || 6000);
  // Pictures must be resident before the first frame so every frame sees the same targets.
  const images = new Map();
  for (const motif of playback.score.motifs) if (motif.imageRef?.url && !images.has(motif.imageRef.assetId)) images.set(motif.imageRef.assetId, await loadImageTargets(motif.imageRef, count, settings.seed ?? 1, surface));
  const performance = createScoreDustPerformance({ playback, settings: { ...settings, particleCount: count }, count,
    targetsFor: (motif) => images.get(motif?.imageRef?.assetId) || null, phraseTargets: (phrase, n, seed) => rasterizePhraseTargets(phrase, n, seed, surface) });
  const bandsAt = audio ? createPcmBandSampler(audio.channels, audio.sampleRate) : null;
  const bands = new Float32Array(32);
  const bandHook = bandsAt ? (t) => bandsAt(t, bands) : null;
  // Stem envelopes are prepared data, so stem responses stay deterministic in export.
  const stemsAt = stems ? (t) => stems.at(t) : null;

  const bitrate = scoreDustExportBitrate({ width: w, height: h, fps, durationSeconds: length });
  let codec = "vp09.00.10.08", muxCodec = "V_VP9";
  if (!(await VideoEncoder.isConfigSupported({ codec, width: w, height: h, bitrate, framerate: fps })).supported) { codec = "vp8"; muxCodec = "V_VP8"; }
  const muxerAudio = audio ? { sampleRate: AUDIO_RATE, channels: 2 } : null;
  const muxer = createWebmMuxer({ video: { codec: muxCodec, width: w, height: h }, audio: muxerAudio });
  let encoderError = null;
  const videoEncoder = new VideoEncoder({
    output: (chunk) => { const data = new Uint8Array(chunk.byteLength); chunk.copyTo(data); muxer.addVideoChunk({ data, timestampUs: chunk.timestamp, keyframe: chunk.type === "key" }); },
    error: (error) => { encoderError = error; },
  });
  videoEncoder.configure({ codec, width: w, height: h, bitrate, framerate: fps, latencyMode: "quality" });

  // Background: black, or the Director cut's media drawn under the dust.
  const compositor = background === "cut" && Array.isArray(shots) && shots.length ? createCutMediaCompositor({ shots, resolveUri }) : null;
  const drawBackground = async (t, loopTarget = null, weight = 0) => {
    ctx.fillStyle = "#020409"; ctx.fillRect(0, 0, w, h);
    if (!compositor) return;
    await compositor.drawAt(ctx, t, w, h);
    // Loop bridge: crossfade the footage back toward what precedes the loop start.
    if (loopTarget !== null && weight > 0) await compositor.drawAt(ctx, loopTarget, w, h, { alpha: weight });
  };
  const paintAt = async (t, extra = {}) => {
    const { state } = performance.advanceTo(t, { bandsAt: bandHook, stemsAt });
    await drawBackground(t);
    painter.paint(ctx, { performance, state, t, width: w, height: h, frameSeconds: 1 / fps, ...extra });
    return state;
  };
  // Lead-in before the first frame: warms trails, and (for loops) records the
  // trajectory the ending blends into.
  const lead = [];
  const leadFrames = Math.max(bridgeFrames, Math.min(Math.round(0.5 * fps), Math.round(start * fps)));
  for (let j = leadFrames; j > 0; j--) {
    const t = start - j / fps, state = await paintAt(t);
    if (bridgeFrames) lead.push({ view: snapshotView(performance.swarm), camera: performance.camera(t, state) });
  }
  const bridgeLead = lead.slice(-bridgeFrames);
  try {
    for (let k = 0; k < frameCount; k++) {
      if (signal?.aborted) throw signal.reason || new Error("Export cancelled");
      if (encoderError) throw encoderError;
      const t = start + k / fps, intoBridge = k - (frameCount - bridgeFrames);
      if (bridgeFrames && intoBridge >= 0) {
        const target = bridgeLead[intoBridge], weight = smoothstep((intoBridge + 1) / bridgeFrames);
        const { state } = performance.advanceTo(t, { bandsAt: bandHook, stemsAt }), live = performance.swarm, camera = performance.camera(t, state);
        const view = { ...target.view, position: new Float32Array(live.count * 3), visibility: new Float32Array(live.count), band: new Float32Array(live.count) };
        for (let i = 0; i < live.position.length; i++) view.position[i] = live.position[i] + (target.view.position[i] - live.position[i]) * weight;
        for (let i = 0; i < live.count; i++) { view.visibility[i] = live.visibility[i] + (target.view.visibility[i] - live.visibility[i]) * weight; view.band[i] = live.band[i] + (target.view.band[i] - live.band[i]) * weight; }
        const blendCamera = Object.fromEntries(Object.keys(camera).map((key) => [key, camera[key] + (target.camera[key] - camera[key]) * weight]));
        await drawBackground(t, t - length, weight);
        painter.paint(ctx, { performance, state, t, width: w, height: h, frameSeconds: 1 / fps, view, camera: blendCamera });
      } else await paintAt(t);
      const frame = new VideoFrame(canvas, { timestamp: Math.round((k * 1e6) / fps), duration: Math.round(1e6 / fps) });
      videoEncoder.encode(frame, { keyFrame: k % (fps * 2) === 0 });
      frame.close();
      while (videoEncoder.encodeQueueSize > 6) await new Promise((resolve) => setTimeout(resolve, 2));
      if (k % 5 === 0) onProgress({ phase: "video", frame: k, frames: frameCount });
    }
    await videoEncoder.flush();
  } finally {
    if (videoEncoder.state !== "closed") videoEncoder.close();
  }
  if (encoderError) throw encoderError;
  let audioBlocks = 0;
  if (audio) {
    onProgress({ phase: "audio", frame: frameCount, frames: frameCount });
    const chunks = await encodeAudio({ audio, startSeconds: start, durationSeconds: length, bridgeSeconds: bridge, muxerAudio, signal });
    for (const chunk of chunks) muxer.addAudioChunk(chunk);
    audioBlocks = chunks.length;
  }
  const bytes = muxer.finalize({ durationUs: Math.round(length * 1e6) });
  painter.dispose();
  const media = compositor?.receipt() || null;
  compositor?.dispose();
  onProgress({ phase: "done", frame: frameCount, frames: frameCount });
  return {
    blob: new Blob([bytes], { type: "video/webm" }), mimeType: "video/webm",
    receipt: { schemaVersion: SCORE_DUST_EXPORT_SCHEMA, scoreFingerprint: playback.score.fingerprint, seed: performance.swarm.seed, particles: count, codec,
      width: w, height: h, fps, frames: frameCount, startSeconds: start, durationSeconds: length, loopBridgeSeconds: bridge, bitrate,
      audio: audio ? { codec: "opus", blocks: audioBlocks, bands: "pcm-spectrum" } : null, stems: stems?.available || [], background: compositor ? "cut" : "black", media, bytes: bytes.length, finalStateFingerprint: performance.swarm.fingerprint() },
  };
}
