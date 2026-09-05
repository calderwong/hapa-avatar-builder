import { hasExcludedEchoDirectorOrigin } from "./echo-media-source-policy.js";

export const ECHO_MEDIA_ELIGIBILITY_SCHEMA = "hapa.echo.media-eligibility.v1";
const list = value => Array.isArray(value) ? value : [];
const ids = value => new Set(list(value).map(String));
const remedies = {
  "missing-runtime-uri": "Attach a playable source URI.",
  "invalid-runtime-uri": "Resolve the source to a supported local media or HTTP route.",
  "operator-ban": "Choose another asset or explicitly remove the exclusion.",
  "missing-source-bytes": "Restore the exact source file or choose a verified alternative.",
  "source-bytes-unverified": "Validate source availability before compiling this cut.",
  "invalid-source-policy": "Choose an asset permitted by the source policy.",
  "required-character": "Attach verified media for every required character.",
  "required-scene": "Attach media linked to the required scene.",
  "incompatible-output-crop": "Use a wider original, adjust the protected crop, or lower output resolution.",
  "output-crop-unverified": "Measure source dimensions and the narrowest crop along the camera path.",
  "recent-repeat-window": "Choose a different asset or pin this eligible shot to relax repetition.",
};

/** Pure shared gate. Pins can relax repetition only. Unknown byte/crop evidence
 * is reported separately and can be required by preparation/compile callers.
 * A URI or an old hash alone is never presented as proof of current bytes. */
export function evaluateEchoMediaEligibility(candidate = {}, constraints = {}) {
  const id = String(candidate.id || candidate.mediaId || candidate.media_id || "");
  const uri = String(candidate.runtimeUri || candidate.uri || candidate.runtime_media_uri || candidate.media_uri || "").trim();
  const technical = candidate.technical || candidate.metadata?.echosTechnicalAffordance || {};
  const availability = candidate.availability || technical.availability || {};
  const hard = [];
  const pending = [];
  if (!uri) hard.push("missing-runtime-uri");
  else if (!/^(?:\/(?!\/)|https?:\/\/|file:\/\/|hapa-media:\/\/|media:\/\/|asset:\/\/)/i.test(uri) || /[\u0000-\u001f]/.test(uri)) hard.push("invalid-runtime-uri");
  if (ids(constraints.bans).has(id) || candidate.banned === true) hard.push("operator-ban");
  const absent = availability.exists === false || availability.bytes === 0 || candidate.bytesAvailable === false
    || /missing|unreadable|corrupt|invalid-media|broken-media/.test(String(technical.status || ""));
  const verified = availability.exists === true && Number(availability.bytes) > 0;
  if (absent) hard.push("missing-source-bytes");
  else if (!verified) (constraints.requireVerifiedBytes ? hard : pending).push("source-bytes-unverified");
  if (candidate.autoEligible === false || candidate.sourceAllowed === false || candidate.sourcePolicy?.allowed === false
    || hasExcludedEchoDirectorOrigin(candidate, candidate.metadata, candidate.owner)) hard.push("invalid-source-policy");
  const characters = ids(candidate.characterIds || candidate.cast?.characterIds);
  const scenes = ids(candidate.sceneIds || candidate.cast?.sceneIds);
  if (list(constraints.requiredCharacterIds).some(value => !characters.has(String(value)))) hard.push("required-character");
  if (list(constraints.requiredSceneIds).some(value => !scenes.has(String(value)))) hard.push("required-scene");
  const crop = candidate.cropCoverage || {};
  if (crop.compatible === false || crop.protectedRegionsSafe === false || candidate.outputCompatible === false) hard.push("incompatible-output-crop");
  const output = constraints.outputProfile;
  if (output && Number(output.width) > 0 && Number(output.height) > 0) {
    // minWidth/minHeight are the smallest SOURCE-PIXEL window along the path,
    // not the full texture dimensions or an upscaled derivative's dimensions.
    if (!(Number(crop.minWidth) > 0 && Number(crop.minHeight) > 0)) {
      (constraints.requireVerifiedCrop ? hard : pending).push("output-crop-unverified");
    } else if (crop.minWidth < output.width || crop.minHeight < output.height) hard.push("incompatible-output-crop");
  }
  const pinned = ids(constraints.pins).has(id);
  const repeated = list(constraints.previous).slice(-6).map(String).includes(id);
  const soft = repeated ? ["recent-repeat-window"] : [];
  const reasons = [...new Set([...hard, ...(!pinned ? soft : [])])];
  return {
    schemaVersion: ECHO_MEDIA_ELIGIBILITY_SCHEMA, mediaId: id, eligible: reasons.length === 0,
    pinned, hardFilters: [...new Set(hard)], softFilters: soft,
    relaxedPreferences: pinned ? soft : [], reasons, pendingEvidence: pending,
    alternatives: reasons.map(code => ({ code, action: remedies[code] })),
  };
}

export function echoUnsatisfiedMediaConstraint(results = [], context = {}) {
  const reasons = [...new Set(results.flatMap(result => result.reasons || []))];
  return {
    schemaVersion: ECHO_MEDIA_ELIGIBILITY_SCHEMA, status: "unsatisfied", code: "echo_media_constraints_unsatisfied",
    ...context, selected: null, reasons: reasons.length ? reasons : ["empty-candidate-pool"],
    alternatives: reasons.length ? reasons.map(code => ({ code, action: remedies[code] }))
      : [{ code: "empty-candidate-pool", action: "Prepare media for the requested cast, scene and output." }],
    rejected: results.map(({ mediaId, reasons, pendingEvidence }) => ({ mediaId, reasons, pendingEvidence })),
  };
}

export function echoMediaConstraintError(results, context) {
  const result = echoUnsatisfiedMediaConstraint(results, context);
  const error = new Error(`No eligible media: ${result.reasons.join(", ")}. ${result.alternatives.map(item => item.action).join(" ")}`);
  error.code = result.code;
  error.status = 422;
  error.statusCode = 422;
  error.result = result;
  return error;
}

export function mergeEchoMediaConstraints(base = {}, added = {}) {
  return { ...base, ...added,
    bans: [...new Set([...list(base.bans), ...list(added.bans)])],
    requiredCharacterIds: [...new Set([...list(base.requiredCharacterIds), ...list(added.requiredCharacterIds)])],
    requiredSceneIds: [...new Set([...list(base.requiredSceneIds), ...list(added.requiredSceneIds)])],
    requireVerifiedBytes: base.requireVerifiedBytes || added.requireVerifiedBytes || false,
    requireVerifiedCrop: base.requireVerifiedCrop || added.requireVerifiedCrop || false,
  };
}

export function inspectEchoTimelineMediaEligibility(timeline = [], constraints = {}) {
  return timeline.flatMap((shot, shotIndex) => {
    if (shot.media_id === "none" || shot.knockedOut === true) return [];
    const contract = shot.media_contract || shot.mediaContract || {};
    if (!shot.media_id && !shot.media_uri && !shot.runtime_media_uri && !contract.originalUri && !contract.runtimeUri) return [];
    const result = evaluateEchoMediaEligibility({
      ...shot, ...contract, id: shot.media_id || contract.mediaId,
      uri: shot.media_uri || contract.originalUri, runtimeUri: shot.runtime_media_uri || contract.runtimeUri,
      origin: shot.origin || shot.decision_evidence?.origin || contract.origin,
    }, mergeEchoMediaConstraints(constraints, shot.mediaConstraints));
    return [{ ...result, shotIndex }];
  });
}

/** Preserve requirements over their TIME RANGE, even if a fork renumbers,
 * splits or reorders shots. New constraints can strengthen that inherited set.
 * Bans/cast/scene are hard; repetition pins are preferences. */
export function inheritEchoTimelineMediaConstraints(timeline = [], parentTimeline = []) {
  const constrained = parentTimeline.filter(shot => shot.mediaConstraints && Object.keys(shot.mediaConstraints).length);
  if (!constrained.length) return timeline;
  return timeline.map(shot => {
    const start = Number(shot.start_sec), end = Number(shot.end_sec);
    if (!Number.isFinite(start) || !Number.isFinite(end) || !(end > start)) {
      throw echoMediaConstraintError([], { stage: "inherit-constraints", reason: "invalid-shot-time-range" });
    }
    const overlapping = constrained.filter(parent => Number(parent.start_sec) < end && Number(parent.end_sec) > start);
    if (!overlapping.length) return shot;
    const inherited = overlapping.reduce((value, parent) => mergeEchoMediaConstraints(value, parent.mediaConstraints), {});
    return { ...shot, mediaConstraints: mergeEchoMediaConstraints(inherited, shot.mediaConstraints) };
  });
}
