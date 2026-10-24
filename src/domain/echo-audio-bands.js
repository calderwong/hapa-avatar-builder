// Deterministic 32-band spectra from decoded PCM, for offline Score Dust
// exports. Same six-octave band edges as the live analyser path
// (dustBandsFromSpectrum); levels are mapped from a fixed dB window so a
// render is a pure function of the audio bytes and the song time.
import { dustBandsFromSpectrum, DUST_BAND_COUNT } from "./echo-dust-swarm.js";

export const ECHO_PCM_BAND_WINDOW = 2048;
const FLOOR_DB = -80, CEILING_DB = -12;

function fftInPlace(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let size = 2; size <= n; size <<= 1) {
    const half = size >> 1, step = (-2 * Math.PI) / size;
    for (let start = 0; start < n; start += size) {
      for (let k = 0; k < half; k++) {
        const angle = step * k, wr = Math.cos(angle), wi = Math.sin(angle);
        const a = start + k, b = a + half;
        const tr = re[b] * wr - im[b] * wi, ti = re[b] * wi + im[b] * wr;
        re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
      }
    }
  }
}

/**
 * channels: Float32Array[] (any count; averaged to mono like whole-song
 * analysis). Returns bandsAt(t, out) → Float32Array(32) in 0..1.
 */
export function createPcmBandSampler(channels, sampleRate, { windowSize = ECHO_PCM_BAND_WINDOW } = {}) {
  if (!Array.isArray(channels) || !channels.length || !(sampleRate > 0)) throw new TypeError("PCM channels and a sample rate are required.");
  const length = Math.min(...channels.map((c) => c.length)), n = windowSize;
  const re = new Float64Array(n), im = new Float64Array(n), magnitudes = new Float32Array(n / 2), hann = new Float64Array(n);
  for (let i = 0; i < n; i++) hann[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1));
  const norm = 2 / hann.reduce((a, b) => a + b, 0);
  return function bandsAt(t, out = new Float32Array(DUST_BAND_COUNT)) {
    const center = Math.round(t * sampleRate), first = center - n / 2;
    for (let i = 0; i < n; i++) {
      const at = first + i;
      let sum = 0;
      if (at >= 0 && at < length) for (const channel of channels) sum += channel[at];
      re[i] = (sum / channels.length) * hann[i]; im[i] = 0;
    }
    fftInPlace(re, im);
    for (let k = 0; k < n / 2; k++) {
      const db = 20 * Math.log10(Math.hypot(re[k], im[k]) * norm + 1e-12);
      magnitudes[k] = Math.min(1, Math.max(0, (db - FLOOR_DB) / (CEILING_DB - FLOOR_DB)));
    }
    return dustBandsFromSpectrum(magnitudes, out);
  };
}
