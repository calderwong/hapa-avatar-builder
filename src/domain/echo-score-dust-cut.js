// Use a Score Dust render in the Director cut (P2 item 7). Score Dust is a
// sequential, song-time-exact renderer, not a sampled shader loop, so it is
// not certified as a "Final render ready" shader proxy. Instead an export is
// published as ordinary video media and placed on the shots it fully covers,
// with exact source in/out points; the final render then treats it like any
// other video, and the cut's ISF visualizer cues still layer above it.
import { ECHO_MEDIA_ELIGIBILITY_FIELDS } from "./echo-media-eligibility.js";

export const SCORE_DUST_RENDER_MEDIA_SCHEMA = "hapa.echo.score-dust.render-media.v1";
const FRAME_TOLERANCE = 0.05;
const round = (v) => Number(Number(v).toFixed(4));
const start = (shot) => Number(shot.start_sec ?? shot.startSeconds);
const end = (shot) => Number(shot.end_sec ?? shot.endSeconds);
const requiresIdentity = (shot) => ["requiredCharacterIds", "requiredSceneIds"].some((key) => Array.isArray(shot?.mediaConstraints?.[key]) && shot.mediaConstraints[key].length);

/**
 * render: { recordingId, uri, sha256, sizeBytes, width, height, startSeconds, durationSeconds, receipt }
 * → { placements: [{ index, patch }], skipped: [{ index, reason }] }
 */
export function scoreDustShotPlacements(timeline = [], render) {
  const renderStart = Number(render.startSeconds), renderEnd = renderStart + Number(render.durationSeconds);
  const placements = [], skipped = [];
  timeline.forEach((shot, index) => {
    const from = start(shot), to = end(shot);
    if (!(to > renderStart) || !(from < renderEnd)) return;
    if (from < renderStart - FRAME_TOLERANCE || to > renderEnd + FRAME_TOLERANCE) { skipped.push({ index, reason: "only partly covered by the render" }); return; }
    if (requiresIdentity(shot)) { skipped.push({ index, reason: "this shot requires specific characters or scenes" }); return; }
    if (render.receipt?.loopBridgeSeconds > 0 && to > renderEnd - render.receipt.loopBridgeSeconds) { skipped.push({ index, reason: "falls in the loop bridge, which blends back to the start" }); return; }
    placements.push({ index, patch: scoreDustShotPatch(shot, render, { from, to, renderStart }) });
  });
  return { placements, skipped };
}

export function scoreDustShotPatch(shot, render, { from = start(shot), to = end(shot), renderStart = Number(render.startSeconds) } = {}) {
  const sourceIn = Math.max(0, round(from - renderStart)), sourceOut = round(Math.min(Number(render.durationSeconds), to - renderStart));
  const cleared = Object.fromEntries([...ECHO_MEDIA_ELIGIBILITY_FIELDS, "semantic_casting", "runtime_media_uri", "media_card_id"].map((key) => [key, undefined]));
  return {
    ...cleared,
    media_id: `score-dust-render:${render.recordingId}`,
    media_title: `Score Dust render ${render.recordingId.slice(0, 8)}`,
    media_uri: render.uri,
    media_thumbnail: "",
    runtime_media_uri: render.uri,
    source_in_seconds: sourceIn,
    source_out_seconds: sourceOut,
    origin: "hapa-score-dust-render",
    owner: "hapa-avatar-builder",
    provenance: { schemaVersion: SCORE_DUST_RENDER_MEDIA_SCHEMA, recordingId: render.recordingId, scoreFingerprint: render.receipt?.scoreFingerprint || null, seed: render.receipt?.seed ?? null,
      background: render.receipt?.background || null, replacedMediaId: shot.media_id || null, renderStartSeconds: renderStart },
    media_contract: {
      schemaVersion: "hapa.echo.playback-media.v2", type: "video", originalUri: render.uri, runtimeUri: render.uri,
      sourceInSeconds: sourceIn, sourceOutSeconds: sourceOut, actualDurationSeconds: Number(render.durationSeconds), playbackMode: "once", mimeType: "video/webm",
      dimensions: { width: render.width || null, height: render.height || null, maxDimension: Math.max(render.width || 0, render.height || 0) || null },
      contentHash: render.sha256 ? `sha256:${String(render.sha256).replace(/^sha256:/, "")}` : "", proxy: { status: "source-direct" }, fallback: { status: "standby", mode: "ivf" }, posterUri: "",
      preloadPriority: "current", durationCoverage: { status: "measured", cueSeconds: round(to - from), sourceSeconds: Number(render.durationSeconds) },
    },
    edit_reason: `Score Dust render ${render.recordingId} placed from ${sourceIn}s to ${sourceOut}s of the render${shot.media_id && shot.media_id !== "none" ? `; replaced ${shot.media_id}` : ""}.`,
    decision_evidence: { schemaVersion: "hapa.echo.shot-decision-evidence.v3", truthStatus: "score-dust-render", candidateId: `score-dust-render:${render.recordingId}` },
  };
}
