export const DIRECTOR_BENCHMARK_SCHEMA = "hapa.director.current-v2-benchmark.v1";

export function summarizeBenchmarkGraph(graph = {}) {
  const tracks = graph.tracks || [];
  const cards = tracks.flatMap((track) => track.cards || []);
  return {
    durationSeconds: Number(graph.song?.durationSeconds || 0),
    trackCount: tracks.length,
    cardCount: cards.length,
    mediaCards: cards.filter((row) => row.media && !row.knockedOut).length,
    visualizerCards: cards.filter((row) => row.visualization).length,
    knockedOutCards: cards.filter((row) => row.knockedOut).length,
    lyricLines: graph.song?.lyricOverlay?.lines?.length || 0,
    cameraKeyframes: graph.directorV2?.cameraKeyframes?.length || 0,
    accentEvents: graph.directorV2?.accentTrack?.events?.length || 0,
    visualTimeEvents: graph.directorV2?.visualTimeTrack?.events?.length || 0,
    modulationBindings: graph.directorV2?.modulationBindings?.length || 0,
    rendererRoutes: graph.directorV2?.rendererSupport || {},
  };
}

export function evaluateDefaultMigration({ p0Gates = {}, regressions = [], blindEditorialStatus = "pending" } = {}) {
  const failingP0Gates = Object.entries(p0Gates).filter(([, status]) => status !== "pass").map(([id, status]) => ({ id, status }));
  const blocked = failingP0Gates.length > 0 || regressions.length > 0 || blindEditorialStatus !== "complete";
  return { schemaVersion: "hapa.director.default-migration-gate.v1", allowed: !blocked, failingP0Gates, regressions, blindEditorialStatus, reason: blocked ? "default-migration-blocked" : "all-p0-and-editorial-gates-pass" };
}
