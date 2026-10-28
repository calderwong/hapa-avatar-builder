// Score requests for Score Dust layers. The layer editor (binding) and the
// preview's "Render layer" (rendering) make the same Atlas visual-score
// request for a layer source, so a layer is always bound to exactly the
// score its render recomposes.
import { createAtlasClient } from "../domain/audio-atlas-ui.js";
import { normalizeDustPlaySettings } from "../domain/echo-visual-score.js";

/**
 * The Atlas request for a layer source: its run, direction, play settings and
 * lyric source. A read-only POST: a plan-driven direction (a dust piece per
 * shot, with its picture and colours) is far larger than a URL may carry, and an
 * over-long query is refused by the HTTP server before the Atlas sees it.
 */
export function echoScoreDustLayerScoreRequest(source) {
  return {
    route: `/jobs/${encodeURIComponent(source.atlasRunId)}/visual-score`,
    options: { method: "POST", body: JSON.stringify({ direction: source.direction, ...(source.playSettings ? { playSettings: source.playSettings } : {}), ...(source.lyricLines ? { lyricLines: source.lyricLines } : {}) }) },
  };
}

/** Compose a layer source's score → { value, scoreFingerprint, seed, settings }. */
export async function loadEchoScoreDustLayerScore({ source, client = null, apiBase = "", signal } = {}) {
  const { route, options } = echoScoreDustLayerScoreRequest(source);
  const value = await (client || createAtlasClient(apiBase)).request(route, { ...options, signal });
  if (!value?.score || !value.validation?.ok) throw new Error(value?.message || "This Score Dust direction does not compose a valid score.");
  const settings = normalizeDustPlaySettings(value.playSettings || {}, value.timeline);
  return { value, scoreFingerprint: value.score.fingerprint, seed: settings.seed, settings };
}

/**
 * The song's current score: its Score Dust Atlas run, the latest saved
 * direction (or the default) and verified written lyric timing.
 * → { source, scoreFingerprint, seed, directionSource, lyricTiming, durationSeconds }
 */
export async function currentEchoScoreDustSongScore({ songId, client = null, apiBase = "", signal } = {}) {
  const atlas = client || createAtlasClient(apiBase);
  const { run, reason } = await atlas.request(`/visual-score-run?songId=${encodeURIComponent(songId)}`, { signal });
  if (!run) throw new Error(reason || "This song has no completed Audio Atlas analysis yet.");
  const latest = await atlas.request(`/jobs/${encodeURIComponent(run.id)}/query?op=visual-score&lyricLines=project`, { signal });
  if (!latest?.direction) throw new Error(latest?.message || "The song's Score Dust direction could not be read.");
  // Bind by re-composing in the layer's own form, exactly as its render will.
  const source = { atlasRunId: run.id, direction: latest.direction, playSettings: null, lyricLines: "project" };
  const exact = await loadEchoScoreDustLayerScore({ source, client: atlas, signal });
  return { source, scoreFingerprint: exact.scoreFingerprint, seed: exact.seed, directionSource: latest.direction_source || "default",
    lyricTiming: latest.lyric_timing?.status || exact.value.lyric_timing?.status || null, durationSeconds: exact.value.timeline?.durationSeconds ?? null };
}
