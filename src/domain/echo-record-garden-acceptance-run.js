export const ECHO_RECORD_GARDEN_ACCEPTANCE_RUN_SCHEMA = "hapa.echo-record-garden.acceptance-run.v1";

function acceptanceRunTimestamp(value = "") {
  return String(value || "")
    .replace(/\u0000/g, "")
    .trim()
    .slice(0, 100);
}

export function createEchoRecordGardenAcceptanceRun(now = new Date().toISOString()) {
  return {
    schemaVersion: ECHO_RECORD_GARDEN_ACCEPTANCE_RUN_SCHEMA,
    startedAt: acceptanceRunTimestamp(now),
    running: true,
    playbackSeconds: 0,
    maxUninterruptedPlaybackSeconds: 0,
    uninterruptedPlaybackSongId: "",
    uninterruptedPlaybackCutId: "",
    recordPlacements: 0,
    recordChanges: 0,
    seekGestures: 0,
    seekTransitions: [],
    surfacePageChanges: 0,
    cardResults: 0,
    keyboardActions: 0,
    compactActions: 0,
    reducedMotionObserved: false,
    mediaFailures: 0,
    bufferingTransitions: 0,
    contextLosses: 0,
    maxRendererGeometries: 0,
    maxRendererTextures: 0,
    frameTiming: {
      samples: 0,
      p50Ms: 0,
      p95Ms: 0,
      p99Ms: 0,
      maxMs: 0,
      longFrames: 0,
    },
    songsObserved: [],
    cardEvidence: [],
    lastPlacedSongId: "",
    lastSeekAtMs: 0,
    lastSeekSeconds: 0,
  };
}
