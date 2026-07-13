export const EDITORIAL_REVIEW_SCHEMA = "hapa.director.editorial-blind-review.v1";

const genericAnchors = (failure, intent, excellence) => ({
  1: failure,
  2: `Occasional intent, but ${intent} is inconsistent or distracting.`,
  3: `${intent} is competent and mostly supports the song.`,
  4: `${intent} is deliberate, clear, and strengthens key sections.`,
  5: excellence,
});

export const EDITORIAL_QUALITY_RUBRIC = Object.freeze([
  { id: "musical-alignment", label: "Musical alignment", anchors: genericAnchors("Cuts and motion routinely miss audible phrases and accents.", "picture-to-music timing", "Every meaningful edit feels musically inevitable without cutting every beat.") },
  { id: "section-contrast", label: "Section contrast", anchors: genericAnchors("Verse, hook, bridge, and ringout are visually indistinguishable.", "section differentiation", "Each section has a distinct grammar while the song remains one coherent work.") },
  { id: "motif-coherence", label: "Motif coherence", anchors: genericAnchors("Visual ideas appear randomly and do not return with purpose.", "motif development", "Motifs recur, evolve, and resolve in step with the emotional structure.") },
  { id: "media-relevance", label: "Media relevance", anchors: genericAnchors("Media contradicts or ignores the lyric, scene, and canon evidence.", "media-to-song relevance", "Media choices reveal specific lyric, character, scene, or canon meaning.") },
  { id: "lyric-legibility", label: "Lyric legibility", anchors: genericAnchors("Text is mistimed, unreadable, or obscures important subjects.", "lyric timing and placement", "Words arrive exactly, remain effortlessly readable, and share the frame with subjects.") },
  { id: "motion-intent", label: "Motion intent", anchors: genericAnchors("Camera and effects feel arbitrary, constant, or physically incoherent.", "camera and modulation intent", "Camera, time modulation, IVF, and accents express specific musical purposes.") },
  { id: "repetition-fatigue", label: "Repetition fatigue", anchors: genericAnchors("Repeated media, moves, or effects become tiring without narrative purpose.", "variation and intentional repetition", "Repetition reads as motif; variation arrives before fatigue and preserves recognition.") },
  { id: "emotional-arc", label: "Emotional arc", anchors: genericAnchors("Intensity is flat or peaks at moments unrelated to the song.", "emotional pacing", "Visual intensity accumulates, releases, and lands with the song’s emotional journey.") },
]);

function hashText(value) {
  let hash = 2166136261;
  for (const char of String(value)) { hash ^= char.charCodeAt(0); hash = Math.imul(hash, 16777619); }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function graphSummary(graph = {}) {
  const cards = (graph.tracks || []).flatMap((track) => track.cards || []);
  const duration = Number(graph.song?.durationSeconds || 0);
  return {
    durationSeconds: duration,
    cardCount: cards.length,
    visualizerCards: cards.filter((card) => card.visualization).length,
    mediaCards: cards.filter((card) => card.media && !card.knockedOut).length,
    knockedOutCards: cards.filter((card) => card.knockedOut).length,
    cameraKeyframes: graph.directorV2?.cameraKeyframes?.length || 0,
    accentEvents: graph.directorV2?.accentTrack?.events?.length || 0,
    visualTimeEvents: graph.directorV2?.visualTimeTrack?.events?.length || 0,
    previewWindows: [0, .25, .5, .75].map((ratio, index) => ({ id: `window-${index + 1}`, startSeconds: Number((duration * ratio).toFixed(3)), endSeconds: Number(Math.min(duration, duration * ratio + 10).toFixed(3)) })),
  };
}

export function createBlindEditorialPacket({ songs = [], createdAt = new Date().toISOString() } = {}) {
  const answerKey = [];
  const comparisons = songs.map((song) => {
    const candidates = song.candidates.map((candidate) => ({ candidate, sort: hashText(`${song.songId}:${candidate.pipelineId}`) })).sort((a, b) => a.sort.localeCompare(b.sort)).map(({ candidate }, index) => {
      const anonymousId = `${song.songId}:cut-${String.fromCharCode(65 + index)}`;
      answerKey.push({ comparisonId: song.songId, anonymousId, pipelineId: candidate.pipelineId, graphRef: candidate.graphRef, graphHash: hashText(JSON.stringify(candidate.graph)) });
      return { anonymousId, graphRef: candidate.publicGraphRef || `review-graphs/${anonymousId.replaceAll(":", "-")}.native-show-graph.json`, summary: graphSummary(candidate.graph), gates: candidate.gates || { safety: "pending-export", playback: "pending-export" } };
    });
    return { comparisonId: song.songId, title: song.title, stemTruth: song.stemTruth, candidates };
  });
  return {
    packet: { schemaVersion: EDITORIAL_REVIEW_SCHEMA, createdAt, blinded: true, rubric: EDITORIAL_QUALITY_RUBRIC, instructions: "Review cuts in anonymous order. Every score requires a timestamped note. Do not open the sealed answer key until export.", comparisons },
    answerKey: { schemaVersion: `${EDITORIAL_REVIEW_SCHEMA}.answer-key`, sealed: true, answers: answerKey },
  };
}

export function recordEditorialScore(state = { scores: [] }, entry) {
  if (!EDITORIAL_QUALITY_RUBRIC.some((row) => row.id === entry.dimensionId)) throw new Error("Unknown rubric dimension");
  if (!Number.isInteger(entry.score) || entry.score < 1 || entry.score > 5) throw new Error("Score must be an integer from 1 to 5");
  if (!Number.isFinite(Number(entry.atSeconds)) || Number(entry.atSeconds) < 0 || !String(entry.note || "").trim()) throw new Error("Every score requires a timestamp and note");
  const score = { ...entry, recordedAt: entry.recordedAt || new Date().toISOString() };
  return { ...state, scores: [...(state.scores || []).filter((row) => !(row.comparisonId === score.comparisonId && row.anonymousId === score.anonymousId && row.dimensionId === score.dimensionId && row.atSeconds === score.atSeconds)), score] };
}

export function evaluateVariantGraduation({ baselineScores = {}, candidateScores = {}, targetDimensions = [], gates = {} } = {}) {
  const missing = EDITORIAL_QUALITY_RUBRIC.map((row) => row.id).filter((id) => !Number.isFinite(candidateScores[id]) || !Number.isFinite(baselineScores[id]));
  const safetyPass = gates.safety === "pass";
  const playbackPass = gates.playback === "pass";
  const regressions = EDITORIAL_QUALITY_RUBRIC.map((row) => row.id).filter((id) => Number(candidateScores[id]) < Number(baselineScores[id]));
  const unimprovedTargets = targetDimensions.filter((id) => Number(candidateScores[id]) <= Number(baselineScores[id]));
  const graduated = missing.length === 0 && safetyPass && playbackPass && regressions.length === 0 && unimprovedTargets.length === 0 && targetDimensions.length > 0;
  return { schemaVersion: "hapa.director.editorial-graduation.v1", graduated, missingDimensions: missing, regressions, unimprovedTargets, gates: { safety: gates.safety || "missing", playback: gates.playback || "missing" }, reason: graduated ? "target-dimensions-improved-without-regression" : "graduation-blocked" };
}
