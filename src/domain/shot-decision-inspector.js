import { contextHash } from "./song-context-packet.js";

export const SHOT_INSPECTOR_SCHEMA = "hapa.director.shot-decision-inspector.v1";

export function inspectStoredShotDecision(shot = {}) {
  const evidence = shot.decision_evidence || {};
  const casting = shot.semantic_casting || null;
  const selected = casting?.selected || null;
  return {
    schemaVersion: SHOT_INSPECTOR_SCHEMA,
    shotId: shot.id || `${shot.section_id || "section"}:shot:${shot.shot_index}`,
    timeRange: { startSeconds: Number(shot.start_sec), endSeconds: Number(shot.end_sec) },
    selectedMedia: { id: shot.media_id, title: shot.media_title, uri: shot.runtime_media_uri || shot.media_uri, posterUri: shot.media_thumbnail || casting?.selected?.posterUri || null },
    cueEvidence: (evidence.evidence || []).filter((row) => /section|cue|transition|stem/i.test(row)),
    lyricCanonMediaEvidence: selected ? Object.entries(selected.components || {}).map(([dimension, component]) => ({ dimension, value: component.value, weight: component.weight, status: component.status, evidence: component.evidence || [] })) : Object.entries(evidence.scoreComponents || {}).map(([dimension, component]) => ({ dimension, value: component.value, weight: null, status: component.basis || "stored-legacy", evidence: [component.basis].filter(Boolean) })),
    rendererTruth: shot.media_contract || { status: "missing-media-contract" },
    selectedScore: selected ? { utility: selected.utility, confidence: selected.confidence, confidenceBasis: selected.confidenceBasis, semanticTruth: selected.semanticTruth } : { utility: null, confidence: evidence.confidence?.value ?? null, confidenceBasis: evidence.confidence?.basis || shot.confidence_basis || "unmeasured" },
    alternatives: (casting?.alternatives || evidence.rejectedAlternatives || []).map((candidate) => ({ mediaId: candidate.mediaId || candidate.media_id, title: candidate.title, uri: candidate.uri || null, posterUri: candidate.posterUri || null, utility: candidate.utility ?? null, confidence: candidate.confidence ?? null, components: candidate.components || null, evidenceArtifact: candidate.evidenceArtifact || null, rejectionReason: candidate.reason || candidate.hardFilters || null })),
    continuityRisks: [...(casting?.rejected || []).flatMap((row) => row.hardFilters || []), ...(casting?.hardContinuityFilters || [])],
    reconstructionRule: "stored-evidence-only-no-after-the-fact-generation",
    reviewStatus: shot.semantic_casting?.selectionStatus || (casting ? "proposed-pending-human-blind-review" : "legacy-unmeasured"),
    sourceSnapshotHash: contextHash({ shotIndex: shot.shot_index, mediaId: shot.media_id, time: [shot.start_sec, shot.end_sec], evidence, casting }),
  };
}

export function appendShotPreferenceEvent(events = [], { inspector, action, targetMediaId = null, operator, rationale, at = new Date().toISOString() } = {}) {
  if (!inspector?.shotId || !["pin", "ban", "replace"].includes(action) || !operator || !String(rationale || "").trim()) throw new Error("Shot preference events require shot, action, operator, and rationale");
  const event = { schemaVersion: "hapa.director.shot-preference-event.v1", id: `shot-review:${contextHash({ shotId: inspector.shotId, action, targetMediaId, operator, rationale, at }).slice(0, 20)}`, shotId: inspector.shotId, action, targetMediaId, operator, rationale: String(rationale).trim(), recordedAt: at, sourceSnapshotHash: inspector.sourceSnapshotHash, sourceReviewStatus: inspector.reviewStatus, mutationPolicy: "append-only-source-shot-unchanged" };
  return { events: [...events, event], event };
}
