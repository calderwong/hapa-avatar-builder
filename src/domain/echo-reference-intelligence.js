export const ECHO_REFERENCE_INTELLIGENCE_SCHEMA = "hapa.echo-reference-intelligence.v1";

const SCORE_KEYS = Object.freeze([
  "lyricGrounding",
  "referenceGrounding",
  "lessonLegibility",
  "tarotIntegration",
  "visualSpecificity",
  "memorability",
  "playingCardReusability",
  "promptClarity",
]);

function text(value = "") {
  return String(value || "").trim();
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

function score(value) {
  return Math.max(0, Math.min(5, Number(value) || 0));
}

export function assessEchoReferenceConcept(concept = {}) {
  const supplied = concept.qualityAssessment || {};
  const scores = Object.fromEntries(SCORE_KEYS.map((key) => [key, score(supplied[key])]));
  const average = SCORE_KEYS.reduce((total, key) => total + scores[key], 0) / SCORE_KEYS.length;
  const missing = [];
  if (!text(concept.memoryHook)) missing.push("memoryHook");
  if (!text(concept.foundationRationale)) missing.push("foundationRationale");
  if (!text(concept.imagePrompt)) missing.push("imagePrompt");
  if (list(concept.symbols).length < 3) missing.push("symbols>=3");
  if (list(concept.retrievalTags).length < 4) missing.push("retrievalTags>=4");
  const promptWords = text(concept.imagePrompt).split(/\s+/).filter(Boolean).length;
  if (promptWords < 160) missing.push("imagePrompt>=160-words");
  if (promptWords > 650) missing.push("imagePrompt<=650-words");
  const weakScores = SCORE_KEYS.filter((key) => scores[key] < 4);
  const corpusReasons = list(concept.corpusAssessment?.gateReasons);
  const ready = missing.length === 0 && weakScores.length === 0 && corpusReasons.length === 0 && average >= 4.2;
  return {
    ...supplied,
    ...scores,
    average: Number(average.toFixed(2)),
    ready,
    status: ready ? "ready-for-image-api" : "needs-revision",
    gateReasons: [
      ...missing.map((item) => `missing:${item}`),
      ...weakScores.map((item) => `score-below-4:${item}`),
      ...(average < 4.2 ? [`average-below-4.2:${average.toFixed(2)}`] : []),
      ...corpusReasons,
    ],
  };
}

export function normalizeEchoReferenceIntelligencePlan(input = {}, provenance = {}) {
  const connections = list(input.connections).map((connection, connectionIndex) => ({
    ...structuredClone(connection),
    connectionKey: text(connection.connectionKey) || `connection-${connectionIndex + 1}`,
    referenceId: text(connection.referenceId),
    referenceTitle: text(connection.referenceTitle),
    sourceKind: connection.sourceKind === "reference" ? "reference" : "lyric-only",
    concepts: list(connection.concepts).map((concept, conceptIndex) => ({
      ...structuredClone(concept),
      id: text(concept.id) || `${text(connection.connectionKey) || `connection-${connectionIndex + 1}`}:concept-${conceptIndex + 1}`,
      title: text(concept.title) || `Visual concept ${conceptIndex + 1}`,
      memoryHook: text(concept.memoryHook),
      foundationRationale: text(concept.foundationRationale),
      imagePrompt: text(concept.imagePrompt),
      retrievalTags: [...new Set(list(concept.retrievalTags).map(text).filter(Boolean))],
      symbols: list(concept.symbols).map((symbol) => ({
        symbol: text(symbol.symbol),
        source: text(symbol.source),
        meaning: text(symbol.meaning),
        placement: text(symbol.placement),
      })).filter((symbol) => symbol.symbol),
      qualityAssessment: assessEchoReferenceConcept(concept),
    })),
  }));
  return {
    schemaVersion: ECHO_REFERENCE_INTELLIGENCE_SCHEMA,
    ...structuredClone(input),
    ...provenance,
    songFoundation: structuredClone(input.songFoundation || {}),
    connections,
  };
}

export function summarizeEchoReferenceIntelligence(plans = []) {
  const summary = {
    songs: 0,
    referenceConnections: 0,
    lyricOnlyConnections: 0,
    concepts: 0,
    prompts: 0,
    ready: 0,
    needsRevision: 0,
    averageQuality: 0,
  };
  let scoreTotal = 0;
  for (const plan of list(plans)) {
    summary.songs += 1;
    for (const connection of list(plan.connections)) {
      if (connection.sourceKind === "reference") summary.referenceConnections += 1;
      else summary.lyricOnlyConnections += 1;
      for (const concept of list(connection.concepts)) {
        summary.concepts += 1;
        if (text(concept.imagePrompt)) summary.prompts += 1;
        const assessment = assessEchoReferenceConcept(concept);
        scoreTotal += assessment.average;
        if (assessment.ready) summary.ready += 1;
        else summary.needsRevision += 1;
      }
    }
  }
  summary.averageQuality = summary.concepts ? Number((scoreTotal / summary.concepts).toFixed(2)) : 0;
  return summary;
}

export { SCORE_KEYS as ECHO_REFERENCE_QUALITY_SCORE_KEYS };
