import { contextHash } from "./song-context-packet.js";

export function classifyMediaGap(shot) {
  const selected = shot.semantic_casting?.selected;
  if (!selected || !selected.eligible) return { kind: "required", reason: "no-eligible-truthful-candidate" };
  if (selected.confidence === null || selected.confidence < .3) return { kind: "required", reason: "selected-candidate-confidence-below-required-floor" };
  if (selected.confidence < .45) return { kind: "optional", reason: "weak-candidate-improvement-opportunity" };
  if (selected.confidence <= .55 && !selected.components?.characterCanon?.evidence?.length) return { kind: "symbolic-substitute", reason: "no-cited-character-or-canon-media" };
  return null;
}

export function buildMissingMediaPlan(project, { contextPacket = null, maxRequests = 3, fps = 30 } = {}) {
  const candidates = (project.timeline || []).flatMap((shot) => { const gap = classifyMediaGap(shot); return gap ? [{ shot, gap }] : []; });
  const priority = { required: 0, optional: 1, "symbolic-substitute": 2 };
  const requests = candidates.sort((a, b) => priority[a.gap.kind] - priority[b.gap.kind] || Number(a.shot.start_sec) - Number(b.shot.start_sec)).slice(0, maxRequests).map(({ shot, gap }) => {
    const duration = Number(shot.end_sec) - Number(shot.start_sec);
    const requestBase = { songId: project.song_id, shotId: `${shot.section_id}:shot:${shot.shot_index}`, gapKind: gap.kind, reason: gap.reason, character: contextPacket?.allowedCharacters?.[0] || null, continuity: { sectionId: shot.section_id, sectionType: shot.section_type, previousMediaId: project.timeline?.[shot.shot_index - 1]?.media_id || null, nextMediaId: project.timeline?.[shot.shot_index + 1]?.media_id || null }, framing: { preferredAspect: shot.media_contract?.dimensions?.width < shot.media_contract?.dimensions?.height ? "9:16" : "16:9", subjectFocus: shot.camera_focus || "center", cameraMotion: shot.camera_motion, cameraIntensity: shot.camera_intensity }, motion: { role: shot.section_type, direction: shot.camera_motion, durationSeconds: duration }, frameRange: { startFrame: Math.round(Number(shot.start_sec) * fps), endFrame: Math.round(Number(shot.end_sec) * fps), fps }, sourceAnchors: [contextPacket?.song?.source, ...(contextPacket?.scenes || []).slice(0, 2).map((scene) => scene.source)].filter(Boolean), intendedCue: { sectionId: shot.section_id, sectionLabel: shot.section_label, editReason: shot.edit_reason, activeStems: shot.active_stems || [] }, requestedOutput: { durationSeconds: duration, aspect: shot.media_contract?.dimensions?.width < shot.media_contract?.dimensions?.height ? "9:16" : "16:9", startFrameReference: shot.decision_evidence?.evidence?.[0] || null, endFrameReference: shot.decision_evidence?.evidence?.at(-1) || null }, status: "planned-human-approval-required" };
    return { schemaVersion: "hapa.media.generation-request.v1", id: `media-request:${contextHash(requestBase).slice(0, 20)}`, ...requestBase };
  });
  return { schemaVersion: "hapa.director.missing-media-plan.v1", songId: project.song_id, renderableWhilePending: true, placeholderTreatment: { kind: "explicit-symbolic-placeholder", render: "existing-selected-media-with-pending-request-badge-or-pure-ivf", neverSilentReplacement: true }, totalScoredGaps: candidates.length, boundedMaxRequests: maxRequests, requests };
}

export function registerGeneratedMediaCandidate(plan, requestId, result, { sourceNodeId, operator, receivedAt = new Date().toISOString() } = {}) {
  const request = plan.requests.find((row) => row.id === requestId);
  if (!request || !sourceNodeId || !operator || !result?.contentHash || !result?.path) throw new Error("Generated candidate requires request, source node, operator, hash, and path");
  return { schemaVersion: "hapa.media.generated-candidate.v1", id: `generated-candidate:${result.contentHash}`, requestId, songId: plan.songId, sourceNodeId, operator, receivedAt, contentHash: result.contentHash, path: result.path, prompt: result.prompt || null, model: result.model || null, seed: result.seed || null, status: "candidate-pending-human-review", replacementPolicy: "never-silent-never-overwrite-approved-media", provenance: { gapKind: request.gapKind, sourceAnchors: request.sourceAnchors, intendedCue: request.intendedCue } };
}
