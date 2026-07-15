import { contextHash } from "./song-context-packet.js";
import { resolveEchoOutputProfile } from "./echo-output-profile.js";

export function classifyMediaGap(shot) {
  const selected = shot.semantic_casting?.selected;
  if (!selected || !selected.eligible) return { kind: "required", reason: "no-eligible-truthful-candidate" };
  if (selected.confidence === null || selected.confidence < .3) return { kind: "required", reason: "selected-candidate-confidence-below-required-floor" };
  if (selected.confidence < .45) return { kind: "optional", reason: "weak-candidate-improvement-opportunity" };
  if (selected.confidence <= .55 && !selected.components?.characterCanon?.evidence?.length) return { kind: "symbolic-substitute", reason: "no-cited-character-or-canon-media" };
  return null;
}

export function buildMissingMediaPlan(project, { contextPacket = null, maxRequests = 3, fps = 30 } = {}) {
  const outputProfile = resolveEchoOutputProfile(project);
  const candidates = (project.timeline || []).flatMap((shot) => { const gap = classifyMediaGap(shot); return gap ? [{ shot, gap }] : []; });
  const priority = { required: 0, optional: 1, "symbolic-substitute": 2 };
  const requests = candidates.sort((a, b) => priority[a.gap.kind] - priority[b.gap.kind] || Number(a.shot.start_sec) - Number(b.shot.start_sec)).slice(0, maxRequests).map(({ shot, gap }) => {
    const duration = Number(shot.end_sec) - Number(shot.start_sec);
    const requestBase = { songId: project.song_id, shotId: `${shot.section_id}:shot:${shot.shot_index}`, gapKind: gap.kind, reason: gap.reason, character: contextPacket?.allowedCharacters?.[0] || null, continuity: { sectionId: shot.section_id, sectionType: shot.section_type, previousMediaId: project.timeline?.[shot.shot_index - 1]?.media_id || null, nextMediaId: project.timeline?.[shot.shot_index + 1]?.media_id || null }, framing: { preferredAspect: outputProfile.aspectRatio, outputOrientation: outputProfile.orientation, subjectFocus: shot.camera_focus || "center", cameraMotion: shot.camera_motion, cameraIntensity: shot.camera_intensity }, motion: { role: shot.section_type, direction: shot.camera_motion, durationSeconds: duration }, frameRange: { startFrame: Math.round(Number(shot.start_sec) * fps), endFrame: Math.round(Number(shot.end_sec) * fps), fps }, sourceAnchors: [contextPacket?.song?.source, ...(contextPacket?.scenes || []).slice(0, 2).map((scene) => scene.source)].filter(Boolean), intendedCue: { sectionId: shot.section_id, sectionLabel: shot.section_label, editReason: shot.edit_reason, activeStems: shot.active_stems || [] }, requestedOutput: { profileId: outputProfile.id, durationSeconds: duration, aspect: outputProfile.aspectRatio, width: outputProfile.width, height: outputProfile.height, fps: outputProfile.fps, startFrameReference: shot.decision_evidence?.evidence?.[0] || null, endFrameReference: shot.decision_evidence?.evidence?.at(-1) || null }, status: "planned-human-approval-required" };
    return { schemaVersion: "hapa.media.generation-request.v1", id: `media-request:${contextHash(requestBase).slice(0, 20)}`, ...requestBase };
  });
  return { schemaVersion: "hapa.director.missing-media-plan.v1", songId: project.song_id, renderableWhilePending: true, placeholderTreatment: { kind: "explicit-symbolic-placeholder", render: "existing-selected-media-with-pending-request-badge-or-pure-ivf", neverSilentReplacement: true }, totalScoredGaps: candidates.length, boundedMaxRequests: maxRequests, requests };
}

export function registerGeneratedMediaCandidate(plan, requestId, result, { sourceNodeId, operator, receivedAt = new Date().toISOString() } = {}) {
  const request = plan.requests.find((row) => row.id === requestId);
  if (!request || !sourceNodeId || !operator || !result?.contentHash || !result?.path) throw new Error("Generated candidate requires request, source node, operator, hash, and path");
  const width = Number(result.width || result.dimensions?.width || 0);
  const height = Number(result.height || result.dimensions?.height || 0);
  const dimensionsMeasured = width > 0 && height > 0;
  const dimensionsMatch = dimensionsMeasured
    && width === Number(request.requestedOutput?.width)
    && height === Number(request.requestedOutput?.height);
  return { schemaVersion: "hapa.media.generated-candidate.v1", id: `generated-candidate:${result.contentHash}`, requestId, songId: plan.songId, sourceNodeId, operator, receivedAt, contentHash: result.contentHash, path: result.path, prompt: result.prompt || null, model: result.model || null, seed: result.seed || null, dimensions: dimensionsMeasured ? { width, height } : null, outputConformance: { profileId: request.requestedOutput?.profileId || null, status: !dimensionsMeasured ? "unverified-dimensions" : dimensionsMatch ? "exact" : "mismatch", expectedWidth: request.requestedOutput?.width || null, expectedHeight: request.requestedOutput?.height || null }, status: "candidate-pending-human-review", replacementPolicy: "never-silent-never-overwrite-approved-media", provenance: { gapKind: request.gapKind, sourceAnchors: request.sourceAnchors, intendedCue: request.intendedCue } };
}
