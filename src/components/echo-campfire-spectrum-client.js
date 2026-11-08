import { createPcmBandSampler } from '../domain/echo-audio-bands.js';

const MAX_AUDIO_BYTES = 96 * 1024 * 1024;
const MAX_SECONDS = 1200;
const MAX_PCM_BYTES = 192 * 1024 * 1024;
const HOP = 0.1;
let cached = null; // One compact spectrum only; encoded audio/PCM are never cached.
const cancelled = signal => { if (signal?.aborted) throw signal.reason || new DOMException('Cancelled', 'AbortError'); };

export async function readCampfireBoundedResponse(response, limit, signal) {
  if (!response.ok) throw new Error(`Campfire audio could not be loaded (${response.status}).`);
  if (Number(response.headers.get('content-length')) > limit) {
    await response.body?.cancel();
    throw new Error('Campfire audio exceeds the preview memory limit.');
  }
  const reader = response.body.getReader(), chunks = [];
  let length = 0;
  try {
    while (true) {
      cancelled(signal);
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > limit) throw new Error('Campfire audio exceeds the preview memory limit.');
      chunks.push(value);
    }
    const bytes = new Uint8Array(length); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    return bytes.buffer;
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}

export async function sampleCampfireSpectrum(audio, masterSha256, { signal, onProgress = () => {}, yieldTask = () => new Promise(resolve => setTimeout(resolve, 0)) } = {}) {
  if (!(audio.durationSeconds > 0) || audio.durationSeconds > MAX_SECONDS ||
      audio.channels.reduce((size, channel) => size + channel.byteLength, 0) > MAX_PCM_BYTES) {
    throw new Error('This master exceeds Campfire’s 20-minute / 192 MB decoded preview limit.');
  }
  const sample = createPcmBandSampler(audio.channels, audio.sampleRate), frames = [];
  const total = Math.ceil(audio.durationSeconds / HOP) + 1;
  for (let index = 0; index < total; index++) {
    cancelled(signal);
    frames.push(Array.from(sample(index * HOP)));
    if (index % 100 === 0) { onProgress(`Preparing Campfire sound · ${Math.round(index / total * 100)}%`); await yieldTask(); }
  }
  return { schema: 'echo-fire.master-spectrum.v1', masterSha256, hopSeconds: HOP, frames };
}

export async function loadEchoCampfireSpectrum(packet, { apiBase = '', signal, onProgress = () => {} } = {}) {
  const source = packet.timeline.source, hash = source.sourceSha256.toLowerCase();
  cancelled(signal);
  if (cached?.masterSha256 === hash) return cached;
  if (!(packet.timeline.durationSeconds > 0) || packet.timeline.durationSeconds > MAX_SECONDS) throw new Error('Campfire preview supports songs up to 20 minutes.');
  const base = `${apiBase}/api/echos/audio-atlas/jobs/${encodeURIComponent(source.runId)}`;
  // Older servers do not expose this optional prepared resource. Only 404 is
  // a cache miss; permission, corrupt-data and service errors remain visible.
  const prepared = await fetch(`${base}/campfire-spectrum`, { credentials: 'same-origin', signal, cache: 'no-store' });
  if (prepared.ok) {
    const bytes = await readCampfireBoundedResponse(prepared, 8 * 1024 * 1024, signal);
    const { spectrum } = JSON.parse(new TextDecoder().decode(bytes));
    if (spectrum?.masterSha256 !== hash || !Number.isFinite(spectrum.hopSeconds) || spectrum.hopSeconds <= 0 ||
        !Array.isArray(spectrum.frames) || !spectrum.frames.length || spectrum.frames.length > 20000 ||
        spectrum.frames.some(frame => !Array.isArray(frame) || frame.length !== 32 || frame.some(n => !Number.isFinite(n) || n < 0 || n > 1))) {
      throw new Error('Campfire’s prepared spectrum does not match this master or is invalid.');
    }
    cached = spectrum; return spectrum;
  }
  if (prepared.status !== 404) throw new Error(`Campfire sound preparation is unavailable (${prepared.status}).`);
  onProgress('Loading this song’s master for Campfire…');
  const response = await fetch(`${base}/audio/master`, { credentials: 'same-origin', signal, cache: 'no-store' });
  const bytes = await readCampfireBoundedResponse(response, MAX_AUDIO_BYTES, signal);
  const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('');
  cancelled(signal);
  if (digest !== hash) throw new Error('Campfire master bytes do not match the selected song’s analysis.');
  onProgress('Decoding this song’s Campfire sound…');
  const buffer = await new OfflineAudioContext(2, 1, 16000).decodeAudioData(bytes);
  cancelled(signal);
  const spectrum = await sampleCampfireSpectrum({ sampleRate: buffer.sampleRate, durationSeconds: buffer.duration,
    channels: Array.from({ length: buffer.numberOfChannels }, (_, index) => buffer.getChannelData(index)) }, hash, { signal, onProgress });
  cancelled(signal);
  cached = spectrum; return spectrum;
}
