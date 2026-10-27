// Score requests for Score Dust layers. The layer editor (binding) and the
// preview's "Render layer" (rendering) make the same Atlas visual-score
// request for a layer source, so a layer is always bound to exactly the
// score its render recomposes.
import { createAtlasClient } from "../domain/audio-atlas-ui.js";
import { normalizeDustPlaySettings } from "../domain/echo-visual-score.js";

/** The Atlas query for a layer source: its run, direction, play settings and lyric source. */
export function echoScoreDustLayerScoreRoute(source) {
  const params = new URLSearchParams({ op: "visual-score", direction: JSON.stringify(source.direction) });
  if (source.playSettings) params.set("playSettings", JSON.stringify(source.playSettings));
  if (source.lyricLines) params.set("lyricLines", source.lyricLines);
  return `/jobs/${encodeURIComponent(source.atlasRunId)}/query?${params}`;
}

/** Compose a layer source's score → { value, scoreFingerprint, seed, settings }. */
export async function loadEchoScoreDustLayerScore({ source, client = null, apiBase = "", signal } = {}) {
  const value = await (client || createAtlasClient(apiBase)).request(echoScoreDustLayerScoreRoute(source), { signal });
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
