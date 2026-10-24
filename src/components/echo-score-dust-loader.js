// Load a Song's Score Dust playback outside the Echo panel (Tarot Draw and
// other 3D stages): the newest completed Audio Atlas run, composed with the
// Song's latest saved direction by the API, prepared for the song clock.
import { createAtlasClient } from "../domain/audio-atlas-ui.js";
import { normalizeDustPlaySettings, prepareEchoScorePlayback } from "../domain/echo-visual-score.js";

const cache = new Map();

/** → Promise<{ playback, settings, key, runId } | { playback: null, reason }> (cached per Song). */
export function loadEchoScoreDustForSong({ apiBase = "", songId, client = null } = {}) {
  if (!songId) return Promise.resolve({ playback: null, reason: "No Song on the table." });
  const cacheKey = `${apiBase}|${songId}`;
  if (!cache.has(cacheKey)) {
    const atlas = client || createAtlasClient(apiBase);
    cache.set(cacheKey, (async () => {
      const { jobs = [] } = await atlas.request(`/jobs?songId=${encodeURIComponent(songId)}`);
      const run = jobs.find((job) => job.state === "complete");
      if (!run) return { playback: null, reason: "This Song has no completed Audio Atlas analysis yet." };
      const value = await atlas.request(`/jobs/${encodeURIComponent(run.id)}/query?op=visual-score`);
      if (!value.validation?.ok) return { playback: null, reason: "The saved Score Dust direction does not validate." };
      const settings = normalizeDustPlaySettings(value.playSettings || {}, value.timeline);
      return { playback: prepareEchoScorePlayback(value.score, value.timeline, { pulse: settings.pulse }), settings, key: `${songId}:${value.score.fingerprint}:${settings.seed}`, runId: run.id };
    })().catch((error) => { cache.delete(cacheKey); return { playback: null, reason: String(error?.message || error) }; }));
  }
  return cache.get(cacheKey);
}

export function clearEchoScoreDustLoaderCache() { cache.clear(); }
