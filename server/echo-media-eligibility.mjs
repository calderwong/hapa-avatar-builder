import { hydrateEchoMediaEvidence, echoEvidenceStamp } from "./echo-media-evidence-index.mjs";
import { stat } from "node:fs/promises";
import { resolveEchoRuntimeMediaUri } from "./echo-runtime-media-route.mjs";
import { inspectEchoTimelineMediaEligibility, echoMediaConstraintError } from "../src/domain/echo-media-eligibility.js";

/** Validate current local bytes without trusting request-supplied availability.
 * No decode or analysis is performed; final render preflight still owns those.
 * Single flight by URI, at most four stat operations active per request. */
export async function prepareEchoTimelineMediaEvidence(timeline, paths = {}) {
  const evidenceIndex = paths.mediaEvidenceReader ? await paths.mediaEvidenceReader.get() : { status: "unavailable", reason: "canonical-index-not-configured" };
  timeline = hydrateEchoMediaEvidence(timeline, evidenceIndex);
  const resolved = new Map();
  const proof = async uri => {
    if (!resolved.has(uri)) resolved.set(uri, (async () => {
      const route = resolveEchoRuntimeMediaUri(uri, paths);
      if (!route.ok) return { exists: null, bytes: null, reason: route.reason };
      try {
        const info = await stat(route.resolvedPath);
        return { exists: info.isFile(), bytes: info.size, stamp: echoEvidenceStamp(info), decodeVerified: false };
      } catch (error) {
        return { exists: false, bytes: 0, reason: error.code || "source-unavailable" };
      }
    })());
    return resolved.get(uri);
  };
  const prepared = new Array(timeline.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(4, timeline.length) }, async () => {
    while (next < timeline.length) {
      const index = next++;
      const shot = timeline[index];
      if (shot.media_id === "none" || shot.knockedOut === true) { prepared[index] = shot; continue; }
      const contract = shot.media_contract || shot.mediaContract || {};
      const uri = shot.runtime_media_uri || contract.runtimeUri || shot.media_uri || contract.originalUri || "";
      const availability = await proof(uri);
      const currentEvidence = shot.identityEvidence?.mediaStamps?.includes(availability.stamp);
      const identities = currentEvidence ? {} : { characterIds: [], sceneIds: [], cast: null,
        identityEvidence: { ...shot.identityEvidence, status: shot.identityEvidence?.status === "canonical-declarations" ? "source-bytes-changed-or-unverified" : shot.identityEvidence?.status } };
      prepared[index] = { ...shot, ...identities, availability, media_contract: { ...contract, ...identities, availability } };
    }
  }));
  return { timeline: prepared, sourcesChecked: resolved.size,
    canonicalEvidence: { status: evidenceIndex.status, revision: evidenceIndex.revision || null, visualVerified: false } };
}

export async function validateEchoForkMedia(timeline, constraints = {}, paths = {}) {
  const preparation = await prepareEchoTimelineMediaEvidence(timeline, paths);
  const results = inspectEchoTimelineMediaEligibility(preparation.timeline, { ...constraints, requireVerifiedBytes: true });
  const rejected = results.filter(item => !item.eligible);
  if (rejected.length) throw echoMediaConstraintError(rejected, { stage: "save-fork" });
  return { schemaVersion: "hapa.echo.fork-media-availability.v1", mediaShots: results.length,
    sourcesChecked: preparation.sourcesChecked, byteAvailabilityVerified: true, decodeVerified: false,
    canonicalEvidence: preparation.canonicalEvidence,
    preparedTimeline: preparation.timeline,
    pendingEvidence: [...new Set(results.flatMap(item => item.pendingEvidence))] };
}
